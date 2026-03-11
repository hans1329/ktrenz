import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Billboard chart URLs to scrape
const BILLBOARD_CHARTS = [
  { id: "billboard-200", name: "Billboard 200", url: "https://www.billboard.com/charts/billboard-200/" },
  { id: "billboard-hot-100", name: "Hot 100", url: "https://www.billboard.com/charts/hot-100/" },
  { id: "billboard-global-200", name: "Global 200", url: "https://www.billboard.com/charts/billboard-global-200/" },
  { id: "billboard-global-excl-us", name: "Global Excl. US", url: "https://www.billboard.com/charts/billboard-global-excl-us/" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Load artists for matching
    const { data: artists } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, aliases, tier");
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ error: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nameLookup = new Map<string, string>();
    for (const a of artists) {
      if (a.display_name) nameLookup.set(a.display_name.toLowerCase(), a.wiki_entry_id);
      if (a.aliases && Array.isArray(a.aliases)) {
        for (const alias of a.aliases) {
          if (typeof alias === "string") nameLookup.set(alias.toLowerCase(), a.wiki_entry_id);
        }
      }
    }

    let totalMatched = 0;
    let totalEntries = 0;
    const matchedArtists = new Set<string>();
    const errors: string[] = [];

    for (const chart of BILLBOARD_CHARTS) {
      try {
        console.log(`[Billboard] Scraping ${chart.name}...`);

        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: chart.url,
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (!scrapeRes.ok) {
          const errBody = await scrapeRes.text();
          errors.push(`${chart.name}: HTTP ${scrapeRes.status} - ${errBody.slice(0, 200)}`);
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";

        if (!markdown) {
          errors.push(`${chart.name}: empty markdown`);
          continue;
        }

        // Parse Billboard markdown format
        // Typical pattern: "1\n\nSong Title\n\nArtist Name" or numbered list
        const lines = markdown.split("\n").map((l: string) => l.trim()).filter(Boolean);
        const chartEntries: Array<{ position: number; title: string; artist: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          const posMatch = lines[i].match(/^(\d{1,3})$/);
          if (posMatch) {
            const pos = parseInt(posMatch[1]);
            // Next non-empty lines should be title and artist
            const title = lines[i + 1] || "";
            const artist = lines[i + 2] || "";
            if (title && artist && pos <= 200) {
              chartEntries.push({ position: pos, title, artist });
            }
          }
        }

        totalEntries += chartEntries.length;
        console.log(`[Billboard] ${chart.name}: parsed ${chartEntries.length} entries`);

        // Match against our artists
        for (const entry of chartEntries) {
          const artistLower = entry.artist.toLowerCase();
          // Check exact match and partial contains
          let wikiEntryId: string | undefined;

          // Exact match first
          wikiEntryId = nameLookup.get(artistLower);

          // Partial match: check if any artist name is contained in the billboard artist field
          if (!wikiEntryId) {
            for (const [name, id] of nameLookup.entries()) {
              if (artistLower.includes(name) || name.includes(artistLower)) {
                wikiEntryId = id;
                break;
              }
            }
          }

          if (wikiEntryId) {
            totalMatched++;
            matchedArtists.add(wikiEntryId);

            await sb.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: wikiEntryId,
              platform: "billboard_chart",
              metrics: {
                chart_id: chart.id,
                chart_name: chart.name,
                position: entry.position,
                song_or_album: entry.title,
                artist_name: entry.artist,
              },
            });
          }
        }

        // Rate limit between scrapes
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        errors.push(`${chart.name}: ${e.message}`);
      }
    }

    // Log collection
    await sb.from("ktrenz_collection_log").insert({
      platform: "billboard_chart",
      status: totalMatched > 0 || errors.length === 0 ? "success" : "partial",
      metrics: {
        charts_scraped: BILLBOARD_CHARTS.length,
        total_entries: totalEntries,
        matched: totalMatched,
        unique_artists: matchedArtists.size,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    console.log(`[Billboard] Done: ${totalMatched} matches across ${matchedArtists.size} artists`);

    return new Response(
      JSON.stringify({
        success: true,
        charts: BILLBOARD_CHARTS.length,
        totalEntries,
        matched: totalMatched,
        uniqueArtists: matchedArtists.size,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[Billboard] Fatal:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
