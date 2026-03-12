import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Apple Music RSS Feed endpoints (no API key needed)
const CHART_URLS = [
  { country: "kr", label: "South Korea", url: "https://rss.applemarketingtools.com/api/v2/kr/music/most-played/200/albums.json" },
  { country: "us", label: "United States", url: "https://rss.applemarketingtools.com/api/v2/us/music/most-played/200/albums.json" },
  { country: "jp", label: "Japan", url: "https://rss.applemarketingtools.com/api/v2/jp/music/most-played/200/albums.json" },
  { country: "gb", label: "United Kingdom", url: "https://rss.applemarketingtools.com/api/v2/gb/music/most-played/200/albums.json" },
  { country: "de", label: "Germany", url: "https://rss.applemarketingtools.com/api/v2/de/music/most-played/200/albums.json" },
  { country: "fr", label: "France", url: "https://rss.applemarketingtools.com/api/v2/fr/music/most-played/200/albums.json" },
  { country: "id", label: "Indonesia", url: "https://rss.applemarketingtools.com/api/v2/id/music/most-played/200/albums.json" },
  { country: "th", label: "Thailand", url: "https://rss.applemarketingtools.com/api/v2/th/music/most-played/200/albums.json" },
  { country: "ph", label: "Philippines", url: "https://rss.applemarketingtools.com/api/v2/ph/music/most-played/200/albums.json" },
  { country: "mx", label: "Mexico", url: "https://rss.applemarketingtools.com/api/v2/mx/music/most-played/200/albums.json" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1) Load all artists with aliases for matching
    const { data: artists } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko, tier");
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ error: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build name lookup (lowercase) → wiki_entry_id
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

    // Dedup: skip if collected within last 1 hour
    const { data: recentSnap } = await sb
      .from("ktrenz_data_snapshots")
      .select("id")
      .eq("platform", "apple_music_chart")
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
    let totalCharted = 0;
    const matchedArtists = new Set<string>();
    const errors: string[] = [];

    for (const chart of CHART_URLS) {
      try {
        const res = await fetch(chart.url);
        if (!res.ok) {
          errors.push(`${chart.country}: HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const results = data?.feed?.results;
        if (!Array.isArray(results)) {
          errors.push(`${chart.country}: no results array`);
          continue;
        }

        totalCharted += results.length;

        for (let i = 0; i < results.length; i++) {
          const entry = results[i];
          const artistName = entry.artistName?.toLowerCase() || "";
          const wikiEntryId = nameLookup.get(artistName);

          if (wikiEntryId) {
            totalMatched++;
            matchedArtists.add(wikiEntryId);

            await sb.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: wikiEntryId,
              platform: "apple_music_chart",
              metrics: {
                country: chart.country,
                country_label: chart.label,
                chart_position: i + 1,
                album_name: entry.name,
                artist_name: entry.artistName,
                release_date: entry.releaseDate,
                artwork_url: entry.artworkUrl100,
                genres: entry.genres?.map((g: any) => g.name),
              },
            });
          }
        }

        console.log(`[AppleMusic] ${chart.label}: ${results.length} albums scanned`);
        // Small delay to be polite
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        errors.push(`${chart.country}: ${e.message}`);
      }
    }

    // Log collection
    await sb.from("ktrenz_collection_log").insert({
      platform: "apple_music_chart",
      status: "success",
      metrics: {
        countries_scanned: CHART_URLS.length,
        total_charted: totalCharted,
        matched_entries: totalMatched,
        unique_artists: matchedArtists.size,
      },
    });

    console.log(`[AppleMusic] Done: ${totalMatched} matches across ${matchedArtists.size} artists from ${CHART_URLS.length} countries`);

    return new Response(
      JSON.stringify({
        success: true,
        countries: CHART_URLS.length,
        totalCharted,
        matched: totalMatched,
        uniqueArtists: matchedArtists.size,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[AppleMusic] Fatal:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
