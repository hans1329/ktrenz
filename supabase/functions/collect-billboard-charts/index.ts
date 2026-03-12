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

/**
 * Parse Billboard markdown into chart entries.
 * 
 * Billboard markdown structure per entry:
 * ```
 * -
 * POSITION_NUMBER
 * 
 * (optional: NEW/RE)
 * 
 * - ![](image_url)
 * 
 *   - ### Song Title
 * 
 *       [Artist Name](url)
 * ```
 * 
 * We use the "### Title" → "[Artist](url)" pattern which is unique to chart entries.
 */
function parseBillboardMarkdown(markdown: string): Array<{ position: number; title: string; artist: string }> {
  const entries: Array<{ position: number; title: string; artist: string }> = [];
  const lines = markdown.split("\n");

  // State machine approach: find "### SongTitle" lines that follow a position indicator
  let currentPosition: number | null = null;
  let positionLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track position numbers: a line that is just a number 1-200, preceded by a line that is just "-"
    if (/^\d{1,3}$/.test(line)) {
      const num = parseInt(line);
      // Check if 2 lines before is "-" (the list marker) to distinguish from calendar/metadata numbers
      // Also check the preceding non-empty line
      if (num >= 1 && num <= 200) {
        // Look backwards for "-" as a list marker
        let foundDash = false;
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev === "") continue;
          if (prev === "-") { foundDash = true; break; }
          break;
        }
        if (foundDash) {
          currentPosition = num;
          positionLineIdx = i;
        }
      }
    }

    // Look for "### Song Title" — this is the song title in chart entries
    const titleMatch = line.match(/^(?:-\s+)?###\s+(.+)$/);
    if (titleMatch && currentPosition !== null && (i - positionLineIdx) < 15) {
      const title = titleMatch[1].trim();
      
      // Skip non-song titles (section headers and metadata)
      const SKIP_TITLES = new Set([
        "debut position", "peak position", "share", "credits", "awards",
        "chart history", "gains in weekly performance", "additional awards",
        "weeks", "peak", "lw", "new", "re", "re-entry",
      ]);
      const titleLower = title.toLowerCase();
      if (SKIP_TITLES.has(titleLower) || 
          titleLower.startsWith("songwriter") || titleLower.startsWith("producer") ||
          /^\d+$/.test(title) || title.length <= 2) {
        continue;
      }

      // Next non-empty line(s) should contain [Artist Name](url)
      let artist = "";
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;
        
        // Extract artist from markdown link: [Artist Name](url)
        // Can have multiple artists: [A](url) With [B](url) or [A](url) Featuring [B](url)
        const artistLinks = nextLine.match(/\[([^\]]+)\]\([^)]*\)/g);
        if (artistLinks && artistLinks.length > 0) {
          // Extract just names from links
          const names = artistLinks.map(link => {
            const nameMatch = link.match(/\[([^\]]+)\]/);
            return nameMatch ? nameMatch[1] : "";
          }).filter(Boolean);
          
          // Also capture "With", "Featuring", "&", "x" connectors
          artist = names.join(" & ");
          break;
        }
        
        // Plain text artist (no link)
        if (nextLine && !nextLine.startsWith("#") && !nextLine.startsWith("-") && !nextLine.startsWith("LW") && !nextLine.startsWith("PEAK") && !nextLine.startsWith("WEEKS")) {
          artist = nextLine;
          break;
        }
      }

      if (title && artist && artist !== "billboard") {
        entries.push({ position: currentPosition, title, artist });
        currentPosition = null; // Reset to avoid duplicate matches
      }
    }
  }

  // Deduplicate by position (keep first occurrence)
  const seen = new Set<number>();
  return entries.filter(e => {
    if (seen.has(e.position)) return false;
    seen.add(e.position);
    return true;
  });
}

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
      .select("wiki_entry_id, display_name, name_ko, tier");
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ error: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nameLookup = new Map<string, string>();
    for (const a of artists) {
      if (a.display_name) nameLookup.set(a.display_name.toLowerCase(), a.wiki_entry_id);
      if (a.name_ko) nameLookup.set(a.name_ko.toLowerCase(), a.wiki_entry_id);
    }

    // Also load wiki_entries titles for broader matching
    const wikiIds = artists.map((a: any) => a.wiki_entry_id);
    const { data: wikiEntries } = await sb
      .from("wiki_entries")
      .select("id, title")
      .in("id", wikiIds);
    for (const w of (wikiEntries || [])) {
      if (w.title) nameLookup.set(w.title.toLowerCase(), w.id);
    }

    // Check for recent collection (dedup: skip if collected within last 1 hour)
    const { data: recentSnap } = await sb
      .from("ktrenz_data_snapshots")
      .select("id")
      .eq("platform", "billboard_chart")
      .gte("collected_at", new Date(Date.now() - 3600_000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recentSnap) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "collected within last hour" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalMatched = 0;
    let totalEntries = 0;
    const matchedArtists = new Set<string>();
    const errors: string[] = [];
    const debugParsed: Record<string, number> = {};

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

        const chartEntries = parseBillboardMarkdown(markdown);
        totalEntries += chartEntries.length;
        debugParsed[chart.name] = chartEntries.length;
        console.log(`[Billboard] ${chart.name}: parsed ${chartEntries.length} entries (first: ${chartEntries[0]?.title || "none"} by ${chartEntries[0]?.artist || "none"})`);

        for (const entry of chartEntries) {
          const artistLower = entry.artist.toLowerCase();
          let wikiEntryId: string | undefined;

          // Exact match first
          wikiEntryId = nameLookup.get(artistLower);

          // Partial match: word-boundary only, min 4 chars to avoid false positives
          if (!wikiEntryId) {
            for (const [name, id] of nameLookup.entries()) {
              if (name.length >= 4) {
                const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "i");
                if (regex.test(entry.artist)) {
                  wikiEntryId = id;
                  break;
                }
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
        parsed_per_chart: debugParsed,
        matched: totalMatched,
        unique_artists: matchedArtists.size,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    console.log(`[Billboard] Done: ${totalEntries} parsed, ${totalMatched} matches across ${matchedArtists.size} artists`);

    return new Response(
      JSON.stringify({
        success: true,
        charts: BILLBOARD_CHARTS.length,
        totalEntries,
        parsedPerChart: debugParsed,
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
