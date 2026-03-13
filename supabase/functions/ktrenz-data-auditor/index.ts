import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REQUIRED_PLATFORMS = [
  "youtube",
  "youtube_music",
  "buzz_multi",
  "hanteo_daily",
  "lastfm",
  "deezer",
  "naver_news",
  "yt_sentiment",
] as const;

type Artist = {
  wiki_entry_id: string;
  display_name: string;
  tier: number;
  youtube_channel_id: string | null;
  lastfm_artist_name: string | null;
  deezer_artist_id: string | null;
};

type Issue = {
  wiki_entry_id: string;
  artist_name: string;
  issue_type: string;
  platform: string | null;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  expected_value: string | null;
  actual_value: string | null;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");

const artistNameMatches = (expected: string, actual: string) => {
  const e = normalize(expected);
  const a = normalize(actual);
  if (!e || !a) return false;
  return e === a || e.includes(a) || a.includes(e);
};

const chunk = <T>(arr: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const parseBody = async (req: Request) => {
  try {
    const body = await req.json();
    return {
      mode: body?.mode === "id_only" ? "id_only" : "full",
      wikiEntryId: typeof body?.wiki_entry_id === "string" ? body.wiki_entry_id : null,
      verifyIds: body?.verify_ids !== false,
      offset: Number.isFinite(Number(body?.offset)) ? Math.max(0, Number(body.offset)) : 0,
      limit: Number.isFinite(Number(body?.limit)) ? Math.min(100, Math.max(1, Number(body.limit))) : 25,
    };
  } catch {
    return {
      mode: "full" as const,
      wikiEntryId: null,
      verifyIds: true,
      offset: 0,
      limit: 25,
    };
  }
};

async function assertAdmin(req: Request, serviceClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    throw new Error("Unauthorized");
  }

  const userId = claimsData.claims.sub;
  const { data: isAdmin, error: adminError } = await serviceClient.rpc("is_admin", {
    user_id: userId,
  });

  if (adminError || !isAdmin) {
    throw new Error("Forbidden");
  }

  return userId;
}

async function fetchArtists(
  supabase: ReturnType<typeof createClient>,
  wikiEntryId: string | null,
  offset: number,
  limit: number,
) {
  if (wikiEntryId) {
    const { data } = await supabase
      .from("v3_artist_tiers")
      .select(
        "wiki_entry_id, display_name, tier, youtube_channel_id, lastfm_artist_name, deezer_artist_id",
      )
      .eq("wiki_entry_id", wikiEntryId)
      .limit(1);

    return {
      artists: (data ?? []) as Artist[],
      total: data?.length ?? 0,
    };
  }

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("v3_artist_tiers")
      .select(
        "wiki_entry_id, display_name, tier, youtube_channel_id, lastfm_artist_name, deezer_artist_id",
      )
      .eq("tier", 1)
      .order("display_name", { ascending: true })
      .range(offset, offset + limit - 1),
    supabase
      .from("v3_artist_tiers")
      .select("wiki_entry_id", { count: "exact", head: true })
      .eq("tier", 1),
  ]);

  return {
    artists: (data ?? []) as Artist[],
    total: count ?? 0,
  };
}

async function runFastFullAudit(
  supabase: ReturnType<typeof createClient>,
  artists: Artist[],
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const now = Date.now();
  const staleThresholdMs = 26 * 60 * 60 * 1000;
  const wikiIds = artists.map((a) => a.wiki_entry_id);

  if (wikiIds.length === 0) return issues;

  const snapshotsByKey = new Map<string, any[]>();

  // Query per platform to avoid global LIMIT cutting off artist-platform combos
  const batches = chunk(wikiIds, 20);
  for (const ids of batches) {
    for (const platform of REQUIRED_PLATFORMS) {
      const { data: snapshots } = await supabase
        .from("ktrenz_data_snapshots")
        .select("wiki_entry_id, platform, collected_at, metrics")
        .in("wiki_entry_id", ids)
        .eq("platform", platform)
        .order("collected_at", { ascending: false })
        .limit(ids.length * 2);

      for (const snap of snapshots ?? []) {
        const key = `${snap.wiki_entry_id}|${snap.platform}`;
        if (!snapshotsByKey.has(key)) snapshotsByKey.set(key, []);
        const arr = snapshotsByKey.get(key)!;
        if (arr.length < 2) arr.push(snap);
      }
    }
  }

  const { data: scores } = await supabase
    .from("v3_scores_v2")
    .select("wiki_entry_id, youtube_score, music_score, buzz_score, social_score")
    .in("wiki_entry_id", wikiIds);

  const scoreMap = new Map((scores ?? []).map((s) => [s.wiki_entry_id, s]));

  for (const artist of artists) {
    const wikiId = artist.wiki_entry_id;
    const artistName = artist.display_name;

    for (const platform of REQUIRED_PLATFORMS) {
      const snapshots = snapshotsByKey.get(`${wikiId}|${platform}`) ?? [];
      if (snapshots.length === 0) {
        issues.push({
          wiki_entry_id: wikiId,
          artist_name: artistName,
          issue_type: "stale_data",
          platform,
          severity: "high",
          title: `${artistName}: ${platform} 수집 지연/없음`,
          description: `최근 스냅샷이 없습니다.`,
          expected_value: "≤26h",
          actual_value: "none",
        });
        continue;
      }

      const latest = snapshots[0];
      const latestTime = new Date(latest.collected_at).getTime();
      if (now - latestTime > staleThresholdMs) {
        const hoursAgo = Math.round((now - latestTime) / (1000 * 60 * 60));
        issues.push({
          wiki_entry_id: wikiId,
          artist_name: artistName,
          issue_type: "stale_data",
          platform,
          severity: hoursAgo > 48 ? "high" : "medium",
          title: `${artistName}: ${platform} 수집 지연 (${hoursAgo}h)`,
          description: `${hoursAgo}시간 전에 마지막 수집됨`,
          expected_value: "≤26h",
          actual_value: `${hoursAgo}h`,
        });
      }

      if (latest?.metrics) {
        const metrics = latest.metrics as Record<string, unknown>;
        const fieldsByPlatform: Record<string, string[]> = {
          youtube: ["viewCount", "subscriberCount"],
          youtube_music: ["viewCount"],
          lastfm: ["playcount", "listeners"],
          deezer: ["fans"],
          buzz_multi: ["total_score"],
        };
        for (const field of fieldsByPlatform[platform] ?? []) {
          const val = metrics[field];
          if (val === 0 || val === null || val === undefined) {
            issues.push({
              wiki_entry_id: wikiId,
              artist_name: artistName,
              issue_type: "zero_score",
              platform,
              severity: "high",
              title: `${artistName}: ${platform}.${field} = 0`,
              description: `${field} 값이 0/null 입니다.`,
              expected_value: "> 0",
              actual_value: String(val ?? "null"),
            });
          }
        }
      }
    }

    const score = scoreMap.get(wikiId) as any;
    if (score) {
      const scoreFields = [
        { key: "youtube_score", label: "YouTube Score" },
        { key: "music_score", label: "Music Score" },
        { key: "buzz_score", label: "Buzz Score" },
        { key: "social_score", label: "Social Score" },
      ];
      for (const sf of scoreFields) {
        const val = score[sf.key];
        if (val === 0 || val === null) {
          issues.push({
            wiki_entry_id: wikiId,
            artist_name: artistName,
            issue_type: "zero_score",
            platform: sf.key,
            severity: "high",
            title: `${artistName}: ${sf.label} = 0`,
            description: `${sf.label} 값이 0/null 입니다.`,
            expected_value: "> 0",
            actual_value: String(val ?? "null"),
          });
        }
      }
    }

    const requiredIds = [
      { key: "youtube_channel_id" as const, label: "YouTube Channel ID" },
      { key: "lastfm_artist_name" as const, label: "Last.fm Name" },
      { key: "deezer_artist_id" as const, label: "Deezer ID" },
    ];
    for (const req of requiredIds) {
      const value = artist[req.key];
      if (!value || value === "null") {
        issues.push({
          wiki_entry_id: wikiId,
          artist_name: artistName,
          issue_type: "missing_source",
          platform: req.key,
          severity: "high",
          title: `${artistName}: ${req.label} 미설정`,
          description: `${req.label}가 없습니다.`,
          expected_value: "set",
          actual_value: "missing",
        });
      }
    }
  }

  return issues;
}

async function runIdentifierAudit(
  artists: Artist[],
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const lastfmKey = Deno.env.get("LASTFM_API_KEY");

  const workers = chunk(artists, 6);
  for (const group of workers) {
    const groupIssues = await Promise.all(
      group.map(async (artist) => {
        const localIssues: Issue[] = [];

        const requiredIds = [
          { key: "youtube_channel_id" as const, label: "YouTube Channel ID" },
          { key: "lastfm_artist_name" as const, label: "Last.fm Name" },
          { key: "deezer_artist_id" as const, label: "Deezer ID" },
        ];

        for (const req of requiredIds) {
          const val = artist[req.key];
          if (!val || val === "null") {
            localIssues.push({
              wiki_entry_id: artist.wiki_entry_id,
              artist_name: artist.display_name,
              issue_type: "missing_source",
              platform: req.key,
              severity: "high",
              title: `${artist.display_name}: ${req.label} 미설정`,
              description: `${req.label}가 없습니다.`,
              expected_value: "set",
              actual_value: "missing",
            });
          }
        }

        if (artist.deezer_artist_id) {
          try {
            const resp = await fetch(`https://api.deezer.com/artist/${artist.deezer_artist_id}`);
            const deezer = await resp.json();
            if (deezer?.error) {
              localIssues.push({
                wiki_entry_id: artist.wiki_entry_id,
                artist_name: artist.display_name,
                issue_type: "wrong_identifier",
                platform: "deezer_artist_id",
                severity: "critical",
                title: `${artist.display_name}: Deezer ID 조회 실패`,
                description: `ID ${artist.deezer_artist_id} 조회 실패`,
                expected_value: artist.display_name,
                actual_value: String(deezer.error?.message ?? "unknown error"),
              });
            } else if (!artistNameMatches(artist.display_name, String(deezer?.name ?? ""))) {
              localIssues.push({
                wiki_entry_id: artist.wiki_entry_id,
                artist_name: artist.display_name,
                issue_type: "wrong_identifier",
                platform: "deezer_artist_id",
                severity: "critical",
                title: `${artist.display_name}: Deezer ID 불일치`,
                description: `저장 ID(${artist.deezer_artist_id})가 다른 아티스트로 매핑됩니다.`,
                expected_value: artist.display_name,
                actual_value: `${deezer?.name ?? "unknown"} (ID:${artist.deezer_artist_id}, fans:${(deezer?.nb_fan ?? 0).toLocaleString()})`,
              });
            }
          } catch (e) {
            localIssues.push({
              wiki_entry_id: artist.wiki_entry_id,
              artist_name: artist.display_name,
              issue_type: "wrong_identifier",
              platform: "deezer_artist_id",
              severity: "high",
              title: `${artist.display_name}: Deezer 검증 실패`,
              description: `Deezer API 검증 실패`,
              expected_value: artist.display_name,
              actual_value: String((e as Error).message),
            });
          }
        }

        if (artist.lastfm_artist_name && lastfmKey) {
          try {
            const resp = await fetch(
              `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist.lastfm_artist_name)}&api_key=${lastfmKey}&format=json`,
            );
            const lastfm = await resp.json();

            if (lastfm?.error) {
              localIssues.push({
                wiki_entry_id: artist.wiki_entry_id,
                artist_name: artist.display_name,
                issue_type: "wrong_identifier",
                platform: "lastfm_artist_name",
                severity: "high",
                title: `${artist.display_name}: Last.fm 이름 오류`,
                description: `Last.fm 조회 오류: ${lastfm.message}`,
                expected_value: artist.display_name,
                actual_value: String(lastfm.message),
              });
            } else if (lastfm?.artist?.name && !artistNameMatches(artist.display_name, String(lastfm.artist.name))) {
              localIssues.push({
                wiki_entry_id: artist.wiki_entry_id,
                artist_name: artist.display_name,
                issue_type: "wrong_identifier",
                platform: "lastfm_artist_name",
                severity: "high",
                title: `${artist.display_name}: Last.fm 이름 불일치`,
                description: `저장된 Last.fm 이름이 다른 아티스트로 매핑됩니다.`,
                expected_value: artist.display_name,
                actual_value: String(lastfm.artist.name),
              });
            }
          } catch (e) {
            localIssues.push({
              wiki_entry_id: artist.wiki_entry_id,
              artist_name: artist.display_name,
              issue_type: "wrong_identifier",
              platform: "lastfm_artist_name",
              severity: "high",
              title: `${artist.display_name}: Last.fm 검증 실패`,
              description: `Last.fm API 검증 실패`,
              expected_value: artist.display_name,
              actual_value: String((e as Error).message),
            });
          }
        }

        return localIssues;
      }),
    );

    for (const arr of groupIssues) {
      issues.push(...arr);
    }
  }

  return issues;
}

async function upsertIssues(supabase: ReturnType<typeof createClient>, issues: Issue[]) {
  if (issues.length === 0) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  for (const batch of chunk(issues, 50)) {
    const payload = batch.map((issue) => ({
      wiki_entry_id: issue.wiki_entry_id,
      artist_name: issue.artist_name,
      issue_type: issue.issue_type,
      platform: issue.platform,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      expected_value: issue.expected_value,
      actual_value: issue.actual_value,
      resolved: false,
      resolved_at: null,
      resolved_by: null,
      resolution_note: null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("ktrenz_data_quality_issues")
      .upsert(payload, {
        onConflict: "wiki_entry_id,issue_type,platform",
        ignoreDuplicates: false,
      });

    if (error) skipped += payload.length;
    else inserted += payload.length;
  }

  return { inserted, skipped };
}

async function autoResolveForFullAudit(
  supabase: ReturnType<typeof createClient>,
  currentIssues: Issue[],
  artistWikiIds: string[],
) {
  if (artistWikiIds.length === 0) return 0;

  // Fetch all existing unresolved issues for these artists
  const allOpen: { id: string; wiki_entry_id: string; issue_type: string; platform: string }[] = [];
  for (const ids of chunk(artistWikiIds, 20)) {
    const { data } = await supabase
      .from("ktrenz_data_quality_issues")
      .select("id, wiki_entry_id, issue_type, platform")
      .in("wiki_entry_id", ids)
      .eq("resolved", false);
    if (data) allOpen.push(...data);
  }

  if (allOpen.length === 0) return 0;

  const currentKeys = new Set(
    currentIssues.map((i) => `${i.wiki_entry_id}|${i.issue_type}|${i.platform}`),
  );

  // Issues that are no longer detected → delete them
  const toDelete = allOpen
    .filter((o) => !currentKeys.has(`${o.wiki_entry_id}|${o.issue_type}|${o.platform}`))
    .map((o) => o.id);

  if (toDelete.length === 0) return 0;

  for (const batch of chunk(toDelete, 50)) {
    await supabase
      .from("ktrenz_data_quality_issues")
      .delete()
      .in("id", batch);
  }

  return toDelete.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    await assertAdmin(req, supabase);

    const body = await parseBody(req);
    const { mode, wikiEntryId, offset, limit } = body;
    const effectiveLimit = wikiEntryId ? 1 : mode === "full" ? 500 : limit;

    const { artists, total } = await fetchArtists(supabase, wikiEntryId, offset, effectiveLimit);

    if (!artists.length) {
      return new Response(
        JSON.stringify({
          mode,
          artists_checked: 0,
          issues_found: 0,
          inserted: 0,
          skipped: 0,
          total_artists: total,
          offset,
          limit: effectiveLimit,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const issues =
      mode === "id_only"
        ? await runIdentifierAudit(artists)
        : await runFastFullAudit(supabase, artists);

    const { inserted, skipped } = await upsertIssues(supabase, issues);

    let autoResolved = 0;
    if (!wikiEntryId) {
      autoResolved = await autoResolveForFullAudit(
        supabase,
        issues,
        artists.map((a) => a.wiki_entry_id),
      );
    }

    const response = {
      mode,
      artists_checked: artists.length,
      total_artists: total,
      offset,
      limit: effectiveLimit,
      issues_found: issues.length,
      inserted,
      skipped,
      auto_resolved: autoResolved,
      by_severity: {
        critical: issues.filter((i) => i.severity === "critical").length,
        high: issues.filter((i) => i.severity === "high").length,
        medium: issues.filter((i) => i.severity === "medium").length,
        low: issues.filter((i) => i.severity === "low").length,
      },
    };

    console.log(`[Auditor] ${JSON.stringify(response)}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
