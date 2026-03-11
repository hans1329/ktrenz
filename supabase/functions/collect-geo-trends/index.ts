import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google Trends interest by region via Firecrawl JSON extraction
async function fetchTrendsInterest(
  firecrawlKey: string,
  artistName: string,
): Promise<Array<{ country: string; countryCode: string; interest: number }>> {
  const trendsUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(artistName)}&date=now%207-d`;

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: trendsUrl,
        formats: ["extract"],
        extract: {
          prompt:
            'Extract the "Interest by subregion" or "Interest by region" data from this Google Trends page. Return a JSON object with a "regions" field containing an array of objects with fields: "country" (full country name in English), "countryCode" (ISO 3166-1 alpha-2 code like US, KR, JP), and "interest" (integer 0-100 representing relative search interest). Only include country-level data, not states/provinces. If no regional data is found, return {"regions": []}.',
          schema: {
            type: "object",
            properties: {
              regions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    country: { type: "string" },
                    countryCode: { type: "string" },
                    interest: { type: "number" },
                  },
                  required: ["country", "countryCode", "interest"],
                },
              },
            },
            required: ["regions"],
          },
        },
        waitFor: 5000,
        onlyMainContent: false,
      }),
    });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Firecrawl API error (${res.status}): ${errText}`);
    return [];
  }

  const data = await res.json();
  // Firecrawl v1 nests data inside `data`
  const json = data?.data?.json || data?.json;

  if (!Array.isArray(json)) {
    console.warn("No valid JSON array from Firecrawl:", JSON.stringify(json)?.slice(0, 300));
    return [];
  }

  return json
    .filter((r: any) => r.countryCode && typeof r.interest === "number" && r.interest > 0)
    .map((r: any) => ({
      country: r.country || r.countryCode,
      countryCode: (r.countryCode || "").toUpperCase().slice(0, 2),
      interest: Math.round(r.interest),
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wiki_entry_id } = await req.json();

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get artist(s) to collect
    let artists: { id: string; title: string }[] = [];

    if (wiki_entry_id) {
      const { data: entry } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .eq("id", wiki_entry_id)
        .maybeSingle();

      if (!entry) {
        return new Response(
          JSON.stringify({ success: false, error: "Artist not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      artists = [{ id: entry.id, title: entry.title }];
    } else {
      // Batch mode: tier 1-3
      const { data: tiers } = await adminClient
        .from("v3_artist_tiers")
        .select("wiki_entry_id, display_name, tier")
        .in("tier", [1, 2, 3])
        .order("tier");

      if (!tiers?.length) {
        return new Response(
          JSON.stringify({ success: false, error: "No artists found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const ids = tiers.map((t: any) => t.wiki_entry_id);
      const { data: entries } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .in("id", ids);

      const entryMap = new Map((entries ?? []).map((e: any) => [e.id, e.title]));
      artists = tiers.map((t: any) => ({
        id: t.wiki_entry_id,
        title: entryMap.get(t.wiki_entry_id) ?? t.display_name,
      }));
    }

    console.log(`[GeoTrends] Collecting Google Trends for ${artists.length} artist(s)`);

    const now = new Date().toISOString();
    const results: any[] = [];
    let totalMatches = 0;

    for (const artist of artists) {
      try {
        console.log(`[GeoTrends] Scraping trends for: ${artist.title}`);
        const regions = await fetchTrendsInterest(FIRECRAWL_API_KEY, artist.title);

        if (regions.length > 0) {
          const rows = regions.map((r, idx) => ({
            wiki_entry_id: artist.id,
            country_code: r.countryCode,
            country_name: r.country,
            source: "google_trends",
            rank_position: idx + 1,
            listeners: 0, // Google Trends doesn't provide absolute numbers
            interest_score: r.interest,
            collected_at: now,
          }));

          const { error: insertErr } = await adminClient
            .from("ktrenz_geo_fan_data")
            .insert(rows);

          if (insertErr) {
            console.error(`[GeoTrends] Insert error for ${artist.title}:`, insertErr);
          } else {
            totalMatches += regions.length;
            console.log(`  ✓ ${artist.title}: ${regions.length} countries`);
          }
        } else {
          console.log(`  ✗ ${artist.title}: no regional data found`);
        }

        results.push({ id: artist.id, name: artist.title, countries: regions.length });

        // Rate limit between artists (Firecrawl)
        if (artists.length > 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`[GeoTrends] Error for ${artist.title}:`, err);
        results.push({ id: artist.id, name: artist.title, countries: 0, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        artists_checked: artists.length,
        matches_found: totalMatches,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[GeoTrends] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
