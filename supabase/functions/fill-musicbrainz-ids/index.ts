// MusicBrainz ID Bridge: 아티스트 이름으로 MusicBrainz를 검색하여
// Deezer ID, Last.fm name, Spotify ID 등 외부 플랫폼 ID를 자동으로 매칭
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT = "KTrendz/1.0 (contact@k-trendz.com)";

interface MBRelationUrl {
  type: string;
  url: { resource: string };
}

interface MBArtist {
  id: string;
  name: string;
  "sort-name": string;
  score?: number;
  type?: string;
  country?: string;
  "life-span"?: { begin?: string; ended?: boolean };
  relations?: MBRelationUrl[];
}

interface ExtractedIds {
  deezer_artist_id: string | null;
  lastfm_artist_name: string | null;
  spotify_artist_id: string | null;
  musicbrainz_id: string | null;
}

// ─── MusicBrainz API helpers ───

async function searchArtist(name: string): Promise<MBArtist | null> {
  const query = encodeURIComponent(name);
  const url = `${MB_BASE}/artist/?query=${query}&fmt=json&limit=5`;
  
  const resp = await fetch(url, {
    headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
  });
  
  if (!resp.ok) {
    const t = await resp.text();
    console.warn(`[MB] Search failed for "${name}": ${resp.status} ${t.slice(0, 100)}`);
    return null;
  }
  
  const data = await resp.json();
  const artists: MBArtist[] = data.artists || [];
  
  if (artists.length === 0) return null;
  
  // Find best match: prefer exact name match with high score
  const normalizedSearch = name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  
  for (const a of artists) {
    const normalizedResult = a.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    const score = a.score ?? 0;
    
    // Exact match or very high score
    if (normalizedResult === normalizedSearch && score >= 80) return a;
    // High score match (allow slight differences)
    if (score >= 95) return a;
  }
  
  // Fallback: first result if score >= 90
  if (artists[0]?.score && artists[0].score >= 90) return artists[0];
  
  return null;
}

async function getArtistRelations(mbid: string): Promise<MBRelationUrl[]> {
  const url = `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`;
  
  const resp = await fetch(url, {
    headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
  });
  
  if (!resp.ok) {
    console.warn(`[MB] Relations fetch failed for ${mbid}: ${resp.status}`);
    return [];
  }
  
  const data = await resp.json();
  return data.relations || [];
}

function extractIdsFromRelations(relations: MBRelationUrl[], artistName: string): ExtractedIds {
  const ids: ExtractedIds = {
    deezer_artist_id: null,
    lastfm_artist_name: null,
    spotify_artist_id: null,
    musicbrainz_id: null,
  };
  
  for (const rel of relations) {
    const resource = rel.url?.resource || "";
    
    // Deezer: https://www.deezer.com/artist/12345
    const deezerMatch = resource.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/);
    if (deezerMatch) ids.deezer_artist_id = deezerMatch[1];
    
    // Last.fm: https://www.last.fm/music/Artist+Name
    const lastfmMatch = resource.match(/last\.fm\/music\/([^/?]+)/);
    if (lastfmMatch) ids.lastfm_artist_name = decodeURIComponent(lastfmMatch[1].replace(/\+/g, " "));
    
    // Spotify: https://open.spotify.com/artist/XXXX
    const spotifyMatch = resource.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/);
    if (spotifyMatch) ids.spotify_artist_id = spotifyMatch[1];
  }
  
  return ids;
}

// ─── Main ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const targetId = body.wikiEntryId || null; // 특정 아티스트만 처리
    const dryRun = body.dryRun === true;       // 실제 업데이트 없이 결과만 반환
    const forceRefresh = body.forceRefresh === true; // 이미 있는 ID도 재탐색

    // Tier 1 아티스트 조회
    let query = sb
      .from("v3_artist_tiers")
      .select("id, wiki_entry_id, display_name, name_ko, aliases, deezer_artist_id, lastfm_artist_name")
      .eq("tier", 1);

    if (targetId) {
      query = query.eq("wiki_entry_id", targetId);
    }

    const { data: artists, error } = await query;
    if (error) throw error;
    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 누락된 ID가 있는 아티스트만 필터 (forceRefresh면 전부)
    const needsFill = forceRefresh
      ? artists
      : artists.filter(a => !a.deezer_artist_id || !a.lastfm_artist_name);

    console.log(`[MB] Processing ${needsFill.length}/${artists.length} artists (forceRefresh=${forceRefresh})`);

    const results: {
      name: string;
      found: boolean;
      mbid: string | null;
      ids: ExtractedIds;
      updated: string[];
      skipped: string[];
    }[] = [];

    for (const artist of needsFill) {
      const name = artist.display_name || "";
      if (!name) continue;

      try {
        // Step 1: Search MusicBrainz
        let mbArtist = await searchArtist(name);
        
        // Retry with Korean name if English name didn't match well
        if (!mbArtist && artist.name_ko) {
          mbArtist = await searchArtist(artist.name_ko);
        }

        // Retry with aliases
        if (!mbArtist && artist.aliases?.length) {
          for (const alias of artist.aliases) {
            mbArtist = await searchArtist(alias);
            if (mbArtist) break;
            await new Promise(r => setTimeout(r, 1100)); // MB rate limit
          }
        }

        if (!mbArtist) {
          results.push({ name, found: false, mbid: null, ids: { deezer_artist_id: null, lastfm_artist_name: null, spotify_artist_id: null, musicbrainz_id: null }, updated: [], skipped: [] });
          await new Promise(r => setTimeout(r, 1100));
          continue;
        }

        // Step 2: Get URL relations
        await new Promise(r => setTimeout(r, 1100)); // MB rate limit: 1 req/sec
        const relations = await getArtistRelations(mbArtist.id);
        const ids = extractIdsFromRelations(relations, name);
        ids.musicbrainz_id = mbArtist.id;

        // Step 3: Determine what to update
        const updates: Record<string, string> = {};
        const updated: string[] = [];
        const skipped: string[] = [];

        if (ids.deezer_artist_id && (!artist.deezer_artist_id || forceRefresh)) {
          updates.deezer_artist_id = ids.deezer_artist_id;
          updated.push(`deezer=${ids.deezer_artist_id}`);
        } else if (ids.deezer_artist_id) {
          skipped.push(`deezer (already: ${artist.deezer_artist_id})`);
        }

        if (ids.lastfm_artist_name && (!artist.lastfm_artist_name || forceRefresh)) {
          updates.lastfm_artist_name = ids.lastfm_artist_name;
          updated.push(`lastfm=${ids.lastfm_artist_name}`);
        } else if (ids.lastfm_artist_name) {
          skipped.push(`lastfm (already: ${artist.lastfm_artist_name})`);
        }

        // Step 4: Apply updates
        if (Object.keys(updates).length > 0 && !dryRun) {
          const { error: updateErr } = await sb
            .from("v3_artist_tiers")
            .update(updates)
            .eq("id", artist.id);

          if (updateErr) {
            console.warn(`[MB] Update failed for ${name}:`, updateErr.message);
          } else {
            console.log(`[MB] ✓ ${name}: ${updated.join(", ")}`);
          }
        }

        // Also update wiki_entries metadata with Spotify ID if found
        if (ids.spotify_artist_id && !dryRun) {
          const { data: entry } = await sb
            .from("wiki_entries")
            .select("id, metadata")
            .eq("id", artist.wiki_entry_id)
            .single();

          if (entry) {
            const meta = (entry.metadata as any) || {};
            const endpoints = meta.api_endpoints || {};
            if (!endpoints.spotify_artist_id) {
              await sb
                .from("wiki_entries")
                .update({
                  metadata: {
                    ...meta,
                    api_endpoints: { ...endpoints, spotify_artist_id: ids.spotify_artist_id },
                  },
                })
                .eq("id", artist.wiki_entry_id);
              updated.push(`spotify=${ids.spotify_artist_id}`);
            }
          }
        }

        results.push({
          name,
          found: true,
          mbid: mbArtist.id,
          ids,
          updated,
          skipped,
        });

        console.log(`[MB] ${name}: MB=${mbArtist.name} (score=${mbArtist.score}), deezer=${ids.deezer_artist_id}, lastfm=${ids.lastfm_artist_name}, spotify=${ids.spotify_artist_id}`);
      } catch (e) {
        console.error(`[MB] Error for ${name}:`, e.message);
        results.push({ name, found: false, mbid: null, ids: { deezer_artist_id: null, lastfm_artist_name: null, spotify_artist_id: null, musicbrainz_id: null }, updated: [], skipped: [] });
      }

      // MusicBrainz rate limit: 1 request per second
      await new Promise(r => setTimeout(r, 1100));
    }

    const summary = {
      total: needsFill.length,
      found: results.filter(r => r.found).length,
      deezerFilled: results.filter(r => r.updated.some(u => u.startsWith("deezer="))).length,
      lastfmFilled: results.filter(r => r.updated.some(u => u.startsWith("lastfm="))).length,
      spotifyFilled: results.filter(r => r.updated.some(u => u.startsWith("spotify="))).length,
      notFound: results.filter(r => !r.found).map(r => r.name),
    };

    console.log(`[MB] Done: ${summary.found}/${summary.total} found, deezer=${summary.deezerFilled}, lastfm=${summary.lastfmFilled}, spotify=${summary.spotifyFilled}`);

    return new Response(JSON.stringify({ success: true, dryRun, summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[MB] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
