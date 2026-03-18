// MusicBrainz ID Bridge + Star Relation Mapper
// 아티스트 이름으로 MusicBrainz를 검색하여 외부 플랫폼 ID를 자동 매칭하고
// 그룹↔멤버 관계를 ktrenz_stars 테이블에 자동 기록
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
  url?: { resource: string };
  target?: { id: string; name: string; "sort-name"?: string; type?: string };
  attributes?: string[];
  direction?: string;
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

interface MemberRelation {
  mbid: string;
  name: string;
  direction: "member_of" | "has_member";
  attributes: string[];
}

// ─── MusicBrainz API helpers ───

async function searchArtist(name: string, requireKpop = true): Promise<MBArtist | null> {
  const query = encodeURIComponent(name);
  const url = `${MB_BASE}/artist/?query=${query}&fmt=json&limit=10`;

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

  const normalizedSearch = name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

  // K-pop friendly countries
  const kpopCountries = new Set(["KR", "JP", ""]);

  for (const a of artists) {
    const normalizedResult = a.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    const score = a.score ?? 0;
    const country = a.country || "";

    // Skip non-Korean artists when names are generic/ambiguous
    if (requireKpop && country && !kpopCountries.has(country) && normalizedResult !== normalizedSearch) {
      continue;
    }

    // Exact name match with decent score
    if (normalizedResult === normalizedSearch && score >= 80) {
      // Prefer Korean artists for exact matches
      if (country === "KR") return a;
      // For non-KR exact matches, only accept if no KR match exists
      const krMatch = artists.find(
        (b) => b.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "") === normalizedSearch && b.country === "KR" && (b.score ?? 0) >= 70,
      );
      if (krMatch) return krMatch;
      return a;
    }
  }

  // Fallback: highest-scoring Korean artist with score >= 90
  const koreanHigh = artists.find((a) => a.country === "KR" && (a.score ?? 0) >= 90);
  if (koreanHigh) return koreanHigh;

  // Only accept non-Korean if exact name match and high score
  const exactHighScore = artists.find((a) => {
    const norm = a.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    return norm === normalizedSearch && (a.score ?? 0) >= 95;
  });
  return exactHighScore || null;
}

async function getArtistRelations(mbid: string): Promise<MBRelationUrl[]> {
  const url = `${MB_BASE}/artist/${mbid}?inc=url-rels+artist-rels&fmt=json`;

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

function extractIdsFromRelations(relations: MBRelationUrl[]): ExtractedIds {
  const ids: ExtractedIds = {
    deezer_artist_id: null,
    lastfm_artist_name: null,
    spotify_artist_id: null,
    musicbrainz_id: null,
  };

  for (const rel of relations) {
    const resource = rel.url?.resource || "";

    const deezerMatch = resource.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/);
    if (deezerMatch) ids.deezer_artist_id = deezerMatch[1];

    const lastfmMatch = resource.match(/last\.fm\/music\/([^/?]+)/);
    if (lastfmMatch) ids.lastfm_artist_name = decodeURIComponent(lastfmMatch[1].replace(/\+/g, " "));

    const spotifyMatch = resource.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/);
    if (spotifyMatch) ids.spotify_artist_id = spotifyMatch[1];
  }

  return ids;
}

function extractMemberRelations(relations: MBRelationUrl[]): MemberRelation[] {
  const members: MemberRelation[] = [];

  for (const rel of relations) {
    if (rel.type !== "member of band" || !rel.target) continue;

    const direction = rel.direction === "backward" ? "has_member" : "member_of";
    members.push({
      mbid: rel.target.id,
      name: rel.target.name,
      direction,
      attributes: rel.attributes || [],
    });
  }

  return members;
}

// ─── ktrenz_stars upsert helpers ───

async function upsertStar(
  sb: ReturnType<typeof createClient>,
  wikiEntryId: string,
  displayName: string,
  nameKo: string | null,
  starType: "group" | "member" | "solo",
  musicbrainzId: string | null,
  groupStarId: string | null,
): Promise<string | null> {
  const { data, error } = await sb
    .from("ktrenz_stars")
    .upsert(
      {
        wiki_entry_id: wikiEntryId,
        display_name: displayName,
        name_ko: nameKo,
        star_type: starType,
        musicbrainz_id: musicbrainzId,
        group_star_id: groupStarId,
      },
      { onConflict: "wiki_entry_id" },
    )
    .select("id")
    .single();

  if (error) {
    console.warn(`[Stars] Upsert failed for ${displayName}:`, error.message);
    return null;
  }
  return data?.id || null;
}

async function findStarByMbid(sb: ReturnType<typeof createClient>, mbid: string) {
  const { data } = await sb
    .from("ktrenz_stars")
    .select("id, wiki_entry_id")
    .eq("musicbrainz_id", mbid)
    .maybeSingle();
  return data;
}

async function findWikiEntryByName(sb: ReturnType<typeof createClient>, name: string) {
  const { data } = await sb
    .from("wiki_entries")
    .select("id, title, metadata")
    .or(`title.ilike.%${name}%`)
    .limit(1)
    .maybeSingle();
  return data;
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
    const targetId = body.wikiEntryId || null;
    const dryRun = body.dryRun === true;
    const forceRefresh = body.forceRefresh === true;
    const offset = body.offset ?? 0;
    const limit = body.limit ?? 20; // default batch size to stay within 60s

    // Tier 1 아티스트 조회
    let query = sb
      .from("v3_artist_tiers")
      .select("id, wiki_entry_id, display_name, name_ko, aliases, deezer_artist_id, lastfm_artist_name")
      .eq("tier", 1)
      .order("wiki_entry_id");

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

    const needsFill = forceRefresh
      ? artists
      : artists.filter((a) => !a.deezer_artist_id || !a.lastfm_artist_name);

    // Apply offset/limit for batch processing
    const batch = needsFill.slice(offset, offset + limit);
    const hasMore = offset + limit < needsFill.length;

    console.log(`[MB] Processing batch ${offset}-${offset + batch.length} of ${needsFill.length} artists (forceRefresh=${forceRefresh})`);

    const results: {
      name: string;
      found: boolean;
      mbid: string | null;
      ids: ExtractedIds;
      updated: string[];
      skipped: string[];
      memberRelations: MemberRelation[];
      starId: string | null;
    }[] = [];

    for (const artist of batch) {
      const name = artist.display_name || "";
      if (!name) continue;

      try {
        // Step 1: Search MusicBrainz
        let mbArtist = await searchArtist(name);

        if (!mbArtist && artist.name_ko) {
          mbArtist = await searchArtist(artist.name_ko);
        }

        if (!mbArtist && artist.aliases?.length) {
          for (const alias of artist.aliases) {
            mbArtist = await searchArtist(alias);
            if (mbArtist) break;
            await new Promise((r) => setTimeout(r, 1100));
          }
        }

        if (!mbArtist) {
          results.push({
            name, found: false, mbid: null,
            ids: { deezer_artist_id: null, lastfm_artist_name: null, spotify_artist_id: null, musicbrainz_id: null },
            updated: [], skipped: [], memberRelations: [], starId: null,
          });
          await new Promise((r) => setTimeout(r, 1100));
          continue;
        }

        // Step 2: Get relations (URL + Artist)
        await new Promise((r) => setTimeout(r, 1100));
        const relations = await getArtistRelations(mbArtist.id);
        const ids = extractIdsFromRelations(relations);
        ids.musicbrainz_id = mbArtist.id;

        // Step 3: Extract member relations
        const memberRelations = extractMemberRelations(relations);

        // Step 4: Determine star_type
        const isGroup = mbArtist.type === "Group";
        const isMemberOf = memberRelations.some((r) => r.direction === "member_of");
        const starType: "group" | "member" | "solo" = isGroup
          ? "group"
          : isMemberOf
            ? "member"
            : "solo";

        // Step 5: Update v3_artist_tiers (기존 로직)
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

        // Step 6: Update wiki_entries with Spotify ID
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

        // Step 7: Upsert ktrenz_stars (NEW)
        let starId: string | null = null;
        if (!dryRun) {
          // First, handle group references for members
          let groupStarId: string | null = null;

          if (starType === "member") {
            // Find the group this member belongs to
            for (const rel of memberRelations.filter((r) => r.direction === "member_of")) {
              // Check if group already in ktrenz_stars
              const existing = await findStarByMbid(sb, rel.mbid);
              if (existing) {
                groupStarId = existing.id;
                break;
              }

              // Try to find group in wiki_entries and create star
              const groupWiki = await findWikiEntryByName(sb, rel.name);
              if (groupWiki) {
                groupStarId = await upsertStar(sb, groupWiki.id, rel.name, null, "group", rel.mbid, null);
                if (groupStarId) {
                  console.log(`[Stars] Created group star: ${rel.name} (mbid=${rel.mbid})`);
                  updated.push(`group_star=${rel.name}`);
                }
              }
              break; // only first group
            }
          }

          starId = await upsertStar(
            sb, artist.wiki_entry_id, name, artist.name_ko || null,
            starType, mbArtist.id, groupStarId,
          );

          if (starId) {
            updated.push(`star=${starType}`);

            // If this is a group, also record "has_member" relations
            if (starType === "group") {
              for (const rel of memberRelations.filter((r) => r.direction === "has_member")) {
                const memberWiki = await findWikiEntryByName(sb, rel.name);
                if (memberWiki) {
                  const memberId = await upsertStar(
                    sb, memberWiki.id, rel.name, null, "member", rel.mbid, starId,
                  );
                  if (memberId) {
                    console.log(`[Stars] Linked member: ${rel.name} → ${name}`);
                    updated.push(`member=${rel.name}`);
                  }
                }
                await new Promise((r) => setTimeout(r, 200)); // gentle delay
              }
            }
          }
        }

        results.push({
          name, found: true, mbid: mbArtist.id,
          ids, updated, skipped, memberRelations, starId,
        });

        console.log(
          `[MB] ${name}: MB=${mbArtist.name} (score=${mbArtist.score}), type=${starType}, deezer=${ids.deezer_artist_id}, lastfm=${ids.lastfm_artist_name}, spotify=${ids.spotify_artist_id}, members=${memberRelations.length}`,
        );
      } catch (e) {
        console.error(`[MB] Error for ${name}:`, e.message);
        results.push({
          name, found: false, mbid: null,
          ids: { deezer_artist_id: null, lastfm_artist_name: null, spotify_artist_id: null, musicbrainz_id: null },
          updated: [], skipped: [], memberRelations: [], starId: null,
        });
      }

      await new Promise((r) => setTimeout(r, 1100));
    }

    const summary = {
      total: needsFill.length,
      found: results.filter((r) => r.found).length,
      deezerFilled: results.filter((r) => r.updated.some((u) => u.startsWith("deezer="))).length,
      lastfmFilled: results.filter((r) => r.updated.some((u) => u.startsWith("lastfm="))).length,
      spotifyFilled: results.filter((r) => r.updated.some((u) => u.startsWith("spotify="))).length,
      starsCreated: results.filter((r) => r.starId).length,
      groups: results.filter((r) => r.memberRelations.some((m) => m.direction === "has_member")).length,
      membersLinked: results.reduce((acc, r) => acc + r.updated.filter((u) => u.startsWith("member=")).length, 0),
      notFound: results.filter((r) => !r.found).map((r) => r.name),
    };

    console.log(
      `[MB] Done: ${summary.found}/${summary.total} found, stars=${summary.starsCreated}, groups=${summary.groups}, members=${summary.membersLinked}`,
    );

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
