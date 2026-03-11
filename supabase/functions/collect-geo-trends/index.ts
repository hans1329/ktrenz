import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Use Firecrawl search to find geographic popularity data for an artist
async function fetchTrendsViaSearch(
  firecrawlKey: string,
  openaiKey: string,
  artistName: string,
): Promise<Array<{ country: string; countryCode: string; interest: number }>> {
  // Search for geographic fan data about the artist
  const queries = [
    `${artistName} kpop most popular countries fans`,
    `${artistName} kpop popularity by country region`,
  ];

  let allSnippets = "";

  for (const query of queries) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 5,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Firecrawl search error (${res.status}): ${errText}`);
        continue;
      }

      const data = await res.json();
      const results = data?.data || [];
      for (const r of results) {
        allSnippets += `Title: ${r.title || ""}\nDescription: ${r.description || ""}\nURL: ${r.url || ""}\n\n`;
      }
    } catch (err) {
      console.error(`Search error for query "${query}":`, err);
    }
  }

  if (!allSnippets.trim()) {
    console.warn(`[GeoTrends] No search results for ${artistName}`);
    return [];
  }

  console.log(`[GeoTrends] Collected ${allSnippets.length} chars of search snippets for ${artistName}`);

  // Use OpenAI to extract structured geographic data from snippets
  const prompt = `Based on the following search results about "${artistName}" K-pop artist's global popularity, estimate the relative search interest/popularity by country. 

Return a JSON array of objects with:
- "country": full country name in English
- "countryCode": ISO 3166-1 alpha-2 code (KR, US, JP, etc.)
- "interest": integer 0-100 representing relative popularity (100 = highest)

Include at least these key markets if mentioned: South Korea (KR), Japan (JP), United States (US), Philippines (PH), Indonesia (ID), Thailand (TH), Brazil (BR), Mexico (MX), India (IN), United Kingdom (GB), Germany (DE), France (FR), Spain (ES), Turkey (TR), Vietnam (VN), Malaysia (MY), Australia (AU), Canada (CA), Chile (CL), Argentina (AR), Poland (PL), Saudi Arabia (SA), Egypt (EG), Russia (RU), Italy (IT).

Always include South Korea (KR) as K-pop artists are from Korea. If the search results don't mention a country, you may still include it with a reasonable estimate based on known K-pop market trends.

IMPORTANT: Return ONLY the JSON array, no other text.

Search results:
${allSnippets.slice(0, 4000)}`;

  try {
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text();
      console.error(`OpenAI API error (${oaiRes.status}): ${errText}`);
      return [];
    }

    const oaiData = await oaiRes.json();
    const content = oaiData.choices?.[0]?.message?.content || "";

    // Extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[GeoTrends] No JSON array found in OpenAI response:", content.slice(0, 300));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((r: any) => r.countryCode && typeof r.interest === "number" && r.interest > 0)
      .map((r: any) => ({
        country: r.country || r.countryCode,
        countryCode: (r.countryCode || "").toUpperCase().slice(0, 2),
        interest: Math.round(r.interest),
      }));
  } catch (err) {
    console.error("[GeoTrends] OpenAI parsing error:", err);
    return [];
  }
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
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

    console.log(`[GeoTrends] Collecting for ${artists.length} artist(s)`);

    const now = new Date().toISOString();
    const results: any[] = [];
    let totalMatches = 0;

    for (const artist of artists) {
      try {
        console.log(`[GeoTrends] Searching trends for: ${artist.title}`);
        const regions = await fetchTrendsViaSearch(FIRECRAWL_API_KEY, OPENAI_API_KEY, artist.title);

        if (regions.length > 0) {
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
