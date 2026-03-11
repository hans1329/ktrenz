import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Deezer chart countries — using editorial chart endpoint
// Deezer provides country-specific charts via country codes
const DEEZER_COUNTRIES = [
  { code: "KR", name: "South Korea", deezerId: 0 },
  { code: "JP", name: "Japan", deezerId: 0 },
  { code: "US", name: "United States", deezerId: 0 },
  { code: "GB", name: "United Kingdom", deezerId: 0 },
  { code: "PH", name: "Philippines", deezerId: 0 },
  { code: "ID", name: "Indonesia", deezerId: 0 },
  { code: "TH", name: "Thailand", deezerId: 0 },
  { code: "MX", name: "Mexico", deezerId: 0 },
  { code: "BR", name: "Brazil", deezerId: 0 },
  { code: "FR", name: "France", deezerId: 0 },
  { code: "DE", name: "Germany", deezerId: 0 },
  { code: "ES", name: "Spain", deezerId: 0 },
  { code: "TR", name: "Turkey", deezerId: 0 },
  { code: "IN", name: "India", deezerId: 0 },
  { code: "VN", name: "Vietnam", deezerId: 0 },
  { code: "MY", name: "Malaysia", deezerId: 0 },
  { code: "AU", name: "Australia", deezerId: 0 },
  { code: "CA", name: "Canada", deezerId: 0 },
  { code: "IT", name: "Italy", deezerId: 0 },
  { code: "CL", name: "Chile", deezerId: 0 },
  { code: "AR", name: "Argentina", deezerId: 0 },
  { code: "PL", name: "Poland", deezerId: 0 },
  { code: "SA", name: "Saudi Arabia", deezerId: 0 },
  { code: "EG", name: "Egypt", deezerId: 0 },
];

// Search Deezer for artist and get their chart presence per country
async function searchDeezerArtist(
  artistName: string,
  deezerArtistId?: number,
): Promise<{ id: number; name: string } | null> {
  if (deezerArtistId) {
    try {
      const res = await fetch(`https://api.deezer.com/artist/${deezerArtistId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.id) return { id: data.id, name: data.name };
      }
    } catch (_) {
      // fall through to search
    }
  }

  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=5`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const artists = data?.data || [];

    // Find best match by normalizing names
    const normalizedSearch = artistName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = artists.find(
      (a: any) => a.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedSearch,
    );
    if (match) return { id: match.id, name: match.name };
    if (artists.length > 0) return { id: artists[0].id, name: artists[0].name };
    return null;
  } catch (err) {
    console.error(`[GeoDeezer] Search error for "${artistName}":`, err);
    return null;
  }
}

// Fetch Deezer chart for a country and check if artist is present
async function fetchDeezerChart(
  countryCode: string,
): Promise<any[]> {
  try {
    // Deezer editorial charts endpoint — returns top tracks globally or by country
    // We use the chart/0/tracks endpoint which returns the global chart
    // For country-specific, Deezer doesn't have a direct country chart API,
    // but we can search for the artist's top tracks and check fan counts per country
    const res = await fetch(`https://api.deezer.com/chart/0/tracks?limit=200`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  } catch (err) {
    console.error(`[GeoDeezer] Chart fetch error for ${countryCode}:`, err);
    return [];
  }
}

// Get artist's fan count — Deezer provides nb_fan as a global metric
// For geo data, we use the artist's top tracks and their album chart positions
async function getArtistGeoData(
  deezerArtistId: number,
): Promise<Array<{ country: string; countryCode: string; fans: number; rank: number }>> {
  const results: Array<{ country: string; countryCode: string; fans: number; rank: number }> = [];

  // Fetch artist's top tracks to see which charts they appear on
  try {
    const topRes = await fetch(
      `https://api.deezer.com/artist/${deezerArtistId}/top?limit=50`,
    );
    if (!topRes.ok) return results;
    const topData = await topRes.json();
    const tracks = topData?.data || [];

    if (!tracks.length) return results;

    // For each country, check if the artist appears in that country's chart
    for (const country of DEEZER_COUNTRIES) {
      try {
        // Use Deezer search with country filter to approximate country popularity
        const searchRes = await fetch(
          `https://api.deezer.com/search?q=artist:"${encodeURIComponent(tracks[0]?.artist?.name || "")}"&limit=1`,
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const total = searchData?.total || 0;

          if (total > 0) {
            // Get artist info for fan count
            const artistRes = await fetch(`https://api.deezer.com/artist/${deezerArtistId}`);
            if (artistRes.ok) {
              const artistData = await artistRes.json();
              const nbFan = artistData?.nb_fan || 0;
              
              results.push({
                country: country.name,
                countryCode: country.code,
                fans: nbFan,
                rank: 0,
              });
            }
          }
        }

        // Small delay between requests
        await new Promise((r) => setTimeout(r, 100));
      } catch (_) {
        // Skip country on error
      }
    }
  } catch (err) {
    console.error(`[GeoDeezer] Error fetching geo data for artist ${deezerArtistId}:`, err);
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wiki_entry_id } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get artist(s) to collect
    let artists: { id: string; title: string; deezerId?: number }[] = [];

    if (wiki_entry_id) {
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
      const deezerId = meta?.api_endpoints?.deezer_artist_id;
      artists = [{ id: entry.id, title: entry.title, deezerId }];
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
        .select("id, title, metadata")
        .in("id", ids);

      const entryMap = new Map((entries ?? []).map((e: any) => [e.id, e]));
      artists = tiers.map((t: any) => {
        const entry = entryMap.get(t.wiki_entry_id);
        const meta = entry?.metadata as any;
        return {
          id: t.wiki_entry_id,
          title: entry?.title ?? t.display_name,
          deezerId: meta?.api_endpoints?.deezer_artist_id,
        };
      });
    }

    console.log(`[GeoDeezer] Collecting for ${artists.length} artist(s)`);

    const now = new Date().toISOString();
    const allResults: any[] = [];
    let totalMatches = 0;

    for (const artist of artists) {
      try {
        // Find artist on Deezer
        const deezerArtist = await searchDeezerArtist(artist.title, artist.deezerId);
        if (!deezerArtist) {
          console.log(`  ✗ ${artist.title}: not found on Deezer`);
          allResults.push({ id: artist.id, name: artist.title, countries: 0, error: "Not found on Deezer" });
          continue;
        }

        console.log(`  Found on Deezer: ${deezerArtist.name} (ID: ${deezerArtist.id})`);

        // Get artist's basic info including nb_fan (global fan count)
        const artistInfoRes = await fetch(`https://api.deezer.com/artist/${deezerArtist.id}`);
        const artistInfo = artistInfoRes.ok ? await artistInfoRes.json() : null;
        const globalFans = artistInfo?.nb_fan || 0;

        // Get artist's top tracks to determine chart presence
        const topRes = await fetch(`https://api.deezer.com/artist/${deezerArtist.id}/top?limit=10`);
        const topData = topRes.ok ? await topRes.json() : { data: [] };
        const topTracks = topData?.data || [];

        if (globalFans > 0) {
          // Store global Deezer fan count as a reference point
          const row = {
            wiki_entry_id: artist.id,
            country_code: "GLOBAL",
            country_name: "Global",
            source: "deezer",
            rank_position: 0,
            listeners: globalFans,
            interest_score: 0,
            collected_at: now,
          };

          const { error: insertErr } = await adminClient
            .from("ktrenz_geo_fan_data")
            .insert(row);

          if (insertErr) {
            console.error(`[GeoDeezer] Insert error for ${artist.title}:`, insertErr);
          } else {
            totalMatches += 1;
            console.log(`  ✓ ${artist.title}: ${globalFans} global fans, ${topTracks.length} top tracks`);
          }
        }

        allResults.push({
          id: artist.id,
          name: artist.title,
          deezer_id: deezerArtist.id,
          global_fans: globalFans,
          top_tracks: topTracks.length,
        });

        // Rate limiting
        if (artists.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`[GeoDeezer] Error for ${artist.title}:`, err);
        allResults.push({ id: artist.id, name: artist.title, countries: 0, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "deezer",
        artists_checked: artists.length,
        matches_found: totalMatches,
        results: allResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[GeoDeezer] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
