import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fetch real Google Trends interest_by_region data via SerpAPI
async function fetchTrendsViaSerpAPI(
  serpApiKey: string,
  artistName: string,
): Promise<Array<{ country: string; countryCode: string; interest: number }>> {
  const query = encodeURIComponent(artistName);
  const url = `https://serpapi.com/search.json?engine=google_trends&q=${query}&data_type=GEO_MAP_0&region=COUNTRY&api_key=${serpApiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[GeoTrends] SerpAPI error (${res.status}): ${errText}`);
      return [];
    }

    const data = await res.json();
    const regions = data?.interest_by_region || [];

    if (!regions.length) {
      console.warn(`[GeoTrends] No interest_by_region data for "${artistName}"`);
      return [];
    }

    return regions
      .filter((r: any) => r.extracted_value > 0)
      .map((r: any) => ({
        country: r.location || r.geo,
        countryCode: (r.geo || "").toUpperCase().slice(0, 2),
        interest: r.extracted_value ?? parseInt(r.value) ?? 0,
      }));
  } catch (err) {
    console.error(`[GeoTrends] SerpAPI fetch error for "${artistName}":`, err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Support single wiki_entry_id OR batch wiki_entry_ids
    const { wiki_entry_id, wiki_entry_ids } = body;

    const SERPAPI_API_KEY = Deno.env.get("SERPAPI_API_KEY");
    if (!SERPAPI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "SERPAPI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve artist list
    let artists: { id: string; title: string }[] = [];

    // Case 1: batch of IDs (from cron)
    const targetIds: string[] = wiki_entry_ids
      ? wiki_entry_ids
      : wiki_entry_id
        ? [wiki_entry_id]
        : [];

    if (targetIds.length > 0) {
      const { data: entries } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .in("id", targetIds);

      artists = (entries ?? []).map((e: any) => ({ id: e.id, title: e.title }));
    } else {
      // Fallback: all tiered artists (should not happen with new cron)
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

    console.log(`[GeoTrends] Collecting via SerpAPI for ${artists.length} artist(s)`);

    const now = new Date().toISOString();
    const results: any[] = [];
    let totalMatches = 0;

    for (const artist of artists) {
      try {
        console.log(`[GeoTrends] Fetching Google Trends for: ${artist.title}`);
        const regions = await fetchTrendsViaSerpAPI(SERPAPI_API_KEY, artist.title);

        if (regions.length > 0) {
          regions.sort((a, b) => b.interest - a.interest);

          const rows = regions.map((r, idx) => ({
            wiki_entry_id: artist.id,
            country_code: r.countryCode,
            country_name: r.country,
            source: "google_trends",
            rank_position: idx + 1,
            listeners: 0,
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

        // SerpAPI rate limit: 1.5s between requests
        if (artists.length > 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (err) {
        console.error(`[GeoTrends] Error for ${artist.title}:`, err);
        results.push({ id: artist.id, name: artist.title, countries: 0, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "serpapi_google_trends",
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
