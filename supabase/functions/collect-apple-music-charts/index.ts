import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Apple Music RSS Feed endpoints (no API key needed)
const COUNTRIES = [
  { country: "kr", label: "South Korea" },
  { country: "us", label: "United States" },
  { country: "jp", label: "Japan" },
  { country: "gb", label: "United Kingdom" },
  { country: "de", label: "Germany" },
  { country: "fr", label: "France" },
  { country: "id", label: "Indonesia" },
  { country: "th", label: "Thailand" },
  { country: "ph", label: "Philippines" },
  { country: "mx", label: "Mexico" },
  { country: "br", label: "Brazil" },
  { country: "vn", label: "Vietnam" },
  { country: "in", label: "India" },
  { country: "tw", label: "Taiwan" },
  { country: "au", label: "Australia" },
  { country: "ca", label: "Canada" },
  { country: "sg", label: "Singapore" },
  { country: "my", label: "Malaysia" },
  { country: "cl", label: "Chile" },
  { country: "sa", label: "Saudi Arabia" },
];

const CHART_URLS = COUNTRIES.map(c => ({
  ...c,
  url: `https://rss.applemarketingtools.com/api/v2/${c.country}/music/most-played/100/albums.json`,
}));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
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

    // Dedup: skip if collected within last 1 hour (unless force=true)
    if (!force) {
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
    }

    let totalMatched = 0;
    let totalCharted = 0;
    const matchedArtists = new Set<string>();
    const errors: string[] = [];

    // Process countries in parallel batches of 5
    const BATCH_SIZE = 5;
    for (let b = 0; b < CHART_URLS.length; b += BATCH_SIZE) {
      const batch = CHART_URLS.slice(b, b + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(async (chart) => {
        try {
          const res = await fetch(chart.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json",
            },
          });
          if (!res.ok) {
            errors.push(`${chart.country}: HTTP ${res.status}`);
            return;
          }
          const data = await res.json();
          const albums = data?.feed?.results;
          if (!Array.isArray(albums)) {
            errors.push(`${chart.country}: no results array`);
            return;
          }

          totalCharted += albums.length;
          const inserts: any[] = [];

          for (let i = 0; i < albums.length; i++) {
            const entry = albums[i];
            const artistName = entry.artistName?.toLowerCase() || "";
            const wikiEntryId = nameLookup.get(artistName);

            if (wikiEntryId) {
              totalMatched++;
              matchedArtists.add(wikiEntryId);
              inserts.push({
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

          if (inserts.length > 0) {
            await sb.from("ktrenz_data_snapshots").insert(inserts);
          }
          console.log(`[AppleMusic] ${chart.label}: ${albums.length} albums, ${inserts.length} matched`);
        } catch (e) {
          errors.push(`${chart.country}: ${e.message}`);
        }
      }));
      // Small delay between batches
      if (b + BATCH_SIZE < CHART_URLS.length) {
        await new Promise((r) => setTimeout(r, 300));
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
