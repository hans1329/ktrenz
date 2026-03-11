import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Key K-pop markets — Last.fm uses country names (ISO 3166-1)
const TARGET_COUNTRIES = [
  { code: "KR", name: "South Korea", lastfm: "south korea" },
  { code: "JP", name: "Japan", lastfm: "japan" },
  { code: "US", name: "United States", lastfm: "united states" },
  { code: "GB", name: "United Kingdom", lastfm: "united kingdom" },
  { code: "PH", name: "Philippines", lastfm: "philippines" },
  { code: "ID", name: "Indonesia", lastfm: "indonesia" },
  { code: "TH", name: "Thailand", lastfm: "thailand" },
  { code: "MX", name: "Mexico", lastfm: "mexico" },
  { code: "BR", name: "Brazil", lastfm: "brazil" },
  { code: "FR", name: "France", lastfm: "france" },
  { code: "DE", name: "Germany", lastfm: "germany" },
  { code: "ES", name: "Spain", lastfm: "spain" },
  { code: "TR", name: "Turkey", lastfm: "turkey" },
  { code: "IN", name: "India", lastfm: "india" },
  { code: "VN", name: "Vietnam", lastfm: "vietnam" },
  { code: "MY", name: "Malaysia", lastfm: "malaysia" },
  { code: "AU", name: "Australia", lastfm: "australia" },
  { code: "CA", name: "Canada", lastfm: "canada" },
  { code: "IT", name: "Italy", lastfm: "italy" },
  { code: "CL", name: "Chile", lastfm: "chile" },
  { code: "AR", name: "Argentina", lastfm: "argentina" },
  { code: "PL", name: "Poland", lastfm: "poland" },
  { code: "RU", name: "Russia", lastfm: "russia" },
  { code: "SA", name: "Saudi Arabia", lastfm: "saudi arabia" },
  { code: "EG", name: "Egypt", lastfm: "egypt" },
];

// Fetch top artists for a given country from Last.fm
async function fetchLastfmGeo(
  country: string,
  apiKey: string,
  page = 1,
  limit = 200,
): Promise<any[]> {
  const url = `https://ws.audioscrobbler.com/2.0/?method=geo.gettopartists&country=${encodeURIComponent(country)}&api_key=${apiKey}&format=json&page=${page}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data?.topartists?.artist ?? [];
}

// Normalize artist name for matching
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wiki_entry_id } = await req.json();

    const LASTFM_API_KEY = Deno.env.get("LASTFM_API_KEY");
    if (!LASTFM_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "LASTFM_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get artist(s) to collect
    let artists: { id: string; title: string; aliases: string[] }[] = [];

    if (wiki_entry_id) {
      // Single artist mode
      const { data: entry } = await adminClient
        .from("wiki_entries")
        .select("id, title, metadata")
        .eq("id", wiki_entry_id)
        .maybeSingle();

      if (!entry) {
        return new Response(
          JSON.stringify({ success: false, error: "Artist not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const meta = entry.metadata as any;
      const aliases: string[] = [];
      // Collect name variants for matching
      if (meta?.name_ko) aliases.push(meta.name_ko);
      if (meta?.hashtags) aliases.push(...(meta.hashtags as string[]));
      const lastfmName = meta?.api_endpoints?.lastfm_artist_name;
      if (lastfmName) aliases.push(lastfmName);

      artists = [{ id: entry.id, title: entry.title, aliases }];
    } else {
      // Batch mode: collect for all tier 1-3 artists
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

      // Fetch metadata for aliases
      const ids = tiers.map((t: any) => t.wiki_entry_id);
      const { data: entries } = await adminClient
        .from("wiki_entries")
        .select("id, title, metadata")
        .in("id", ids);

      const entryMap = new Map((entries ?? []).map((e: any) => [e.id, e]));

      artists = tiers.map((t: any) => {
        const entry = entryMap.get(t.wiki_entry_id);
        const meta = entry?.metadata as any;
        const aliases: string[] = [];
        if (meta?.name_ko) aliases.push(meta.name_ko);
        if (meta?.hashtags) aliases.push(...(meta.hashtags as string[]));
        const lastfmName = meta?.api_endpoints?.lastfm_artist_name;
        if (lastfmName) aliases.push(lastfmName);
        return { id: t.wiki_entry_id, title: entry?.title ?? t.display_name, aliases };
      });
    }

    console.log(`[GeoFans] Collecting for ${artists.length} artist(s) across ${TARGET_COUNTRIES.length} countries`);

    // Build normalized name sets for matching
    const artistMatchers = artists.map((a) => ({
      ...a,
      normalizedNames: [normalize(a.title), ...a.aliases.map(normalize)].filter(Boolean),
    }));

    const now = new Date().toISOString();
    const results: any[] = [];

    // Fetch each country
    for (const country of TARGET_COUNTRIES) {
      try {
        // Fetch pages 1-2 (up to 400 artists per country)
        const [page1, page2] = await Promise.all([
          fetchLastfmGeo(country.lastfm, LASTFM_API_KEY, 1, 200),
          fetchLastfmGeo(country.lastfm, LASTFM_API_KEY, 2, 200),
        ]);

        const allArtists = [...page1, ...page2];
        if (!allArtists.length) continue;

        // Check each of our artists against the country's top list
        for (const artist of artistMatchers) {
          const idx = allArtists.findIndex((a: any) =>
            artist.normalizedNames.includes(normalize(a.name)),
          );

          if (idx >= 0) {
            const matched = allArtists[idx];
            results.push({
              wiki_entry_id: artist.id,
              country_code: country.code,
              country_name: country.name,
              source: "lastfm",
              rank_position: idx + 1,
              listeners: parseInt(matched.listeners) || 0,
              interest_score: Math.max(0, Math.round((1 - idx / 400) * 100)),
              collected_at: now,
            });
          }
        }

        // Small delay to respect rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.error(`[GeoFans] Error for ${country.name}:`, err);
      }
    }

    console.log(`[GeoFans] Found ${results.length} geo matches from Last.fm`);

    // Batch insert
    if (results.length > 0) {
      const { error: insertErr } = await adminClient
        .from("ktrenz_geo_fan_data")
        .insert(results);

      if (insertErr) {
        console.error("[GeoFans] Insert error:", insertErr);
        return new Response(
          JSON.stringify({ success: false, error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        artists_checked: artists.length,
        countries_checked: TARGET_COUNTRIES.length,
        matches_found: results.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[GeoFans] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
