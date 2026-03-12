// 유저용 개별 아티스트 Energy 실시간 조회 엔드포인트
// 롤링 24h 윈도우: 현재 시간 -24h 이전의 가장 최근 스냅샷 대비 변동률 (거래소 스타일)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHTS = { youtube: 0.4, buzz: 0.25, music: 0.2, album: 0.15 };
const MAX_SCORE = 250;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function changeToScore(change: number): number {
  const normalized = change / 100;
  const sigmoid = 1 / (1 + Math.exp(-normalized * 3));
  return Math.round(20 + sigmoid * (MAX_SCORE - 20));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { wiki_entry_id, sources } = await req.json().catch(() => ({ wiki_entry_id: null, sources: null }));

    if (!wiki_entry_id) {
      return new Response(JSON.stringify({ error: "wiki_entry_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 요청된 소스 필터 (없으면 전체)
    const requestedSources: string[] = sources
      ? (Array.isArray(sources) ? sources : [sources])
      : ["youtube", "buzz", "album", "music"];

    // ── 1) 현재 스코어 조회 ──
    const { data: currentScore } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score, total_score, energy_score, energy_rank")
      .eq("wiki_entry_id", wiki_entry_id)
      .single();

    if (!currentScore) {
      return new Response(JSON.stringify({ error: "Artist not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2) 24h 전 단일 스냅샷 조회 ──
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: prevSnaps } = await sb
      .from("v3_energy_snapshots_v2")
      .select("youtube_score, buzz_score, album_score, music_score, energy_score, snapshot_at")
      .eq("wiki_entry_id", wiki_entry_id)
      .lte("snapshot_at", cutoff24h)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    const prev24h = prevSnaps?.[0] || null;

    // ── 2-b) 최신 FES Analyst 기여도 조회 ──
    const { data: latestContrib } = await sb
      .from("ktrenz_fes_contributions")
      .select("normalized_fes, leading_category, youtube_contrib, buzz_contrib, album_contrib, music_contrib, social_contrib, youtube_z, buzz_z, album_z, music_z, social_z, snapshot_at")
      .eq("wiki_entry_id", wiki_entry_id)
      .order("snapshot_at", { ascending: false })
      .limit(1);

    const contrib = latestContrib?.[0] || null;

    // ── 3) 퍼센타일 계산을 위해 전체 아티스트 스코어 조회 ──
    const { data: allScores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score")
      .order("total_score", { ascending: false })
      .limit(100);

    // 현재 아티스트의 퍼센타일 계산
    const allYt = (allScores || []).map(s => Number(s.youtube_score) || 0);
    const allBuzz = (allScores || []).map(s => Number(s.buzz_score) || 0);
    const allAlbum = (allScores || []).map(s => Number(s.album_sales_score) || 0);
    const allMusic = (allScores || []).map(s => Number(s.music_score) || 0);

    const curYt = Number(currentScore.youtube_score) || 0;
    const curBuzz = Number(currentScore.buzz_score) || 0;
    const curAlbum = Number(currentScore.album_sales_score) || 0;
    const curMusic = Number(currentScore.music_score) || 0;

    const calcPct = (value: number, all: number[]) => {
      const below = all.filter(v => v < value).length;
      const ties = all.filter(v => v === value).length;
      return (below + (ties - 1) / 2) / Math.max(all.length - 1, 1);
    };

    const ytPct = calcPct(curYt, allYt);
    const buzzPct = calcPct(curBuzz, allBuzz);
    const albumPct = calcPct(curAlbum, allAlbum);
    const musicPct = calcPct(curMusic, allMusic);

    // ── 4) Energy 계산 ──
    const ytPrev = prev24h ? Number(prev24h.youtube_score) || 0 : 0;
    const buzzPrev = prev24h ? Number(prev24h.buzz_score) || 0 : 0;
    const albumPrev = prev24h ? Number(prev24h.album_score) || 0 : 0;
    const musicPrev = prev24h ? Number(prev24h.music_score) || 0 : 0;

    const ytChange = pctChange(curYt, ytPrev);
    const buzzChange = pctChange(curBuzz, buzzPrev);
    const albumChange = pctChange(curAlbum, albumPrev);
    const musicChange = pctChange(curMusic, musicPrev);

    const overallChange = ytChange * WEIGHTS.youtube + buzzChange * WEIGHTS.buzz +
      musicChange * WEIGHTS.music + albumChange * WEIGHTS.album;

    const weightedPct = ytPct * WEIGHTS.youtube + buzzPct * WEIGHTS.buzz +
      albumPct * WEIGHTS.album + musicPct * WEIGHTS.music;
    const energyScore = clamp(Math.round(10 + weightedPct * (MAX_SCORE - 10)), 10, MAX_SCORE);

    const result = {
      wiki_entry_id,
      energy_score: contrib?.normalized_fes ?? energyScore,
      energy_rank: currentScore.energy_rank,
      change_24h: Math.round(overallChange * 10) / 10,
      prev_snapshot_at: prev24h?.snapshot_at || null,
      // FES Analyst 기여도 데이터
      analyst: contrib ? {
        normalized_fes: contrib.normalized_fes,
        leading_category: contrib.leading_category,
        contributions: {
          youtube: contrib.youtube_contrib,
          buzz: contrib.buzz_contrib,
          album: contrib.album_contrib,
          music: contrib.music_contrib,
          social: contrib.social_contrib,
        },
        z_scores: {
          youtube: contrib.youtube_z,
          buzz: contrib.buzz_z,
          album: contrib.album_z,
          music: contrib.music_z,
          social: contrib.social_z,
        },
        analyzed_at: contrib.snapshot_at,
      } : null,
      categories: {} as Record<string, any>,
    };

    // 요청된 소스만 포함
    if (requestedSources.includes("youtube")) {
      result.categories.youtube = {
        current: curYt,
        prev_24h: ytPrev,
        change_pct: Math.round(ytChange * 10) / 10,
        velocity: changeToScore(ytChange),
        intensity: clamp(Math.round(ytPct * MAX_SCORE), 0, MAX_SCORE),
        percentile: Math.round(ytPct * 100),
      };
    }
    if (requestedSources.includes("buzz")) {
      result.categories.buzz = {
        current: curBuzz,
        prev_24h: buzzPrev,
        change_pct: Math.round(buzzChange * 10) / 10,
        velocity: changeToScore(buzzChange),
        intensity: clamp(Math.round(buzzPct * MAX_SCORE), 0, MAX_SCORE),
        percentile: Math.round(buzzPct * 100),
      };
    }
    if (requestedSources.includes("album")) {
      result.categories.album = {
        current: curAlbum,
        prev_24h: albumPrev,
        change_pct: Math.round(albumChange * 10) / 10,
        velocity: changeToScore(albumChange),
        intensity: clamp(Math.round(albumPct * MAX_SCORE), 0, MAX_SCORE),
        percentile: Math.round(albumPct * 100),
      };
    }
    if (requestedSources.includes("music")) {
      result.categories.music = {
        current: curMusic,
        prev_24h: musicPrev,
        change_pct: Math.round(musicChange * 10) / 10,
        velocity: changeToScore(musicChange),
        intensity: clamp(Math.round(musicPct * MAX_SCORE), 0, MAX_SCORE),
        percentile: Math.round(musicPct * 100),
      };
    }

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[query-artist-energy] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
