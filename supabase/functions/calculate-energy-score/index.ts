// Fan Energy Score (FES) v5.1 — 24h 전 전체 호출 스냅샷 기준 비교
// YouTube 40%, Buzz 25%, Music 20%, Album 15%
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

/** Calculate % change, returns null when no valid comparison possible */
function pctChange(current: number, previous: number | null): number | null {
  if (previous == null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Normalize a change rate into 20~250 score range (sigmoid-like) */
function changeToScore(change: number): number {
  const normalized = change / 100;
  const sigmoid = 1 / (1 + Math.exp(-normalized * 3));
  return Math.round(20 + sigmoid * (MAX_SCORE - 20));
}

/** 퍼센타일 함수: 정렬 후 각 값의 순위를 0~1로 변환 */
function toPercentiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(v => {
    const rank = sorted.filter(s => s < v).length;
    const ties = sorted.filter(s => s === v).length;
    return (rank + (ties - 1) / 2) / Math.max(sorted.length - 1, 1);
  });
}

/** 단일 아티스트의 Velocity/Intensity/Energy 계산 (공용 함수) */
export function calculateArtistEnergy(
  current: { yt: number; buzz: number; album: number; music: number },
  prev24h: { youtube_score: number; buzz_score: number; album_score: number; music_score: number } | null,
  percentiles: { yt: number; buzz: number; album: number; music: number },
) {
  const ytPrev = prev24h ? Number(prev24h.youtube_score) || 0 : null;
  const buzzPrev = prev24h ? Number(prev24h.buzz_score) || 0 : null;
  const albumPrev = prev24h ? Number(prev24h.album_score) || 0 : null;
  const musicPrev = prev24h ? Number(prev24h.music_score) || 0 : null;

  const ytChange = pctChange(current.yt, ytPrev);
  const buzzChange = pctChange(current.buzz, buzzPrev);
  const albumChange = pctChange(current.album, albumPrev);
  const musicChange = pctChange(current.music, musicPrev);

  // 비교 가능한 항목만으로 가중 변동률 계산
  let overallChange: number | null = null;
  if (prev24h) {
    const parts: { weight: number; change: number }[] = [];
    if (ytChange != null) parts.push({ weight: WEIGHTS.youtube, change: ytChange });
    if (buzzChange != null) parts.push({ weight: WEIGHTS.buzz, change: buzzChange });
    if (musicChange != null) parts.push({ weight: WEIGHTS.music, change: musicChange });
    if (albumChange != null) parts.push({ weight: WEIGHTS.album, change: albumChange });
    if (parts.length > 0) {
      const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
      overallChange = parts.reduce((s, p) => s + p.change * (p.weight / totalWeight), 0);
    }
  }

  const weightedPct = percentiles.yt * WEIGHTS.youtube + percentiles.buzz * WEIGHTS.buzz +
    percentiles.album * WEIGHTS.album + percentiles.music * WEIGHTS.music;
  const energyScore = clamp(Math.round(10 + weightedPct * (MAX_SCORE - 10)), 10, MAX_SCORE);

  return {
    energyScore,
    ytVelocity: ytChange != null ? changeToScore(ytChange) : null,
    ytIntensity: clamp(Math.round(percentiles.yt * MAX_SCORE), 0, MAX_SCORE),
    buzzVelocity: buzzChange != null ? changeToScore(buzzChange) : null,
    buzzIntensity: clamp(Math.round(percentiles.buzz * MAX_SCORE), 0, MAX_SCORE),
    albumVelocity: albumChange != null ? changeToScore(albumChange) : null,
    albumIntensity: clamp(Math.round(percentiles.album * MAX_SCORE), 0, MAX_SCORE),
    musicVelocity: musicChange != null ? changeToScore(musicChange) : null,
    musicIntensity: clamp(Math.round(percentiles.music * MAX_SCORE), 0, MAX_SCORE),
    change24h: overallChange != null ? Math.round(overallChange * 10) / 10 : null,
    ytChange: ytChange != null ? Math.round(ytChange * 10) / 10 : null,
    buzzChange: buzzChange != null ? Math.round(buzzChange * 10) / 10 : null,
    albumChange: albumChange != null ? Math.round(albumChange * 10) / 10 : null,
    musicChange: musicChange != null ? Math.round(musicChange * 10) / 10 : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    // ── 1) 1군(tier=1) 아티스트 목록 ──
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean));

    const { data: v2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score, total_score")
      .order("total_score", { ascending: false })
      .limit(100);

    const scoreMap = new Map<string, any>();
    const entryIds: string[] = [];
    for (const s of (v2Scores || [])) {
      if (!scoreMap.has(s.wiki_entry_id) && tier1Ids.has(s.wiki_entry_id)) {
        scoreMap.set(s.wiki_entry_id, s);
        entryIds.push(s.wiki_entry_id);
      }
    }

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[FES-v5.1] Processing ${entryIds.length} artists...`);

    // ── 2) 24h 전 "단일 스냅샷" 찾기 ──
    // 24시간 전 시점 이전에 찍힌 가장 최근의 단일 스냅샷을 사용
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const prevSnapResults = await Promise.all(
      entryIds.map(async (eid) => {
        // 24h 이전에 기록된 스냅샷 중, 세부 점수가 유효한(0이 아닌) 가장 최근 것을 찾음
        const { data } = await sb.from("v3_energy_snapshots_v2")
          .select("youtube_score, buzz_score, album_score, music_score, snapshot_at")
          .eq("wiki_entry_id", eid)
          .lte("snapshot_at", cutoff24h)
          .order("snapshot_at", { ascending: false })
          .limit(5);
        // 세부 점수가 하나라도 0이 아닌 스냅샷 찾기
        const valid = (data || []).find((s: any) =>
          (Number(s.youtube_score) || 0) > 0 || (Number(s.buzz_score) || 0) > 0 ||
          (Number(s.album_score) || 0) > 0 || (Number(s.music_score) || 0) > 0
        );
        return { eid, prev: valid || null };
      })
    );

    const prevMap = new Map<string, any>();
    for (const r of prevSnapResults) {
      if (r.prev) prevMap.set(r.eid, r.prev);
    }

    // ── 3) 베이스라인 일괄 조회 ──
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) baselineMap.set(b.wiki_entry_id, b);

    // ── 4) 퍼센타일 기반 에너지 스코어 계산 ──
    const rawData: { eid: string; yt: number; buzz: number; album: number; music: number; prev: any; current: any }[] = [];
    for (const eid of entryIds) {
      const current = scoreMap.get(eid)!;
      rawData.push({
        eid,
        yt: Number(current.youtube_score) || 0,
        buzz: Number(current.buzz_score) || 0,
        album: Number(current.album_sales_score) || 0,
        music: Number(current.music_score) || 0,
        prev: prevMap.get(eid) || null,
        current,
      });
    }

    const ytPcts = toPercentiles(rawData.map(d => d.yt));
    const buzzPcts = toPercentiles(rawData.map(d => d.buzz));
    const albumPcts = toPercentiles(rawData.map(d => d.album));
    const musicPcts = toPercentiles(rawData.map(d => d.music));

    // ── 5) 결과 생성 ──
    const results: any[] = [];
    for (let i = 0; i < rawData.length; i++) {
      try {
        const r = rawData[i];
        const calc = calculateArtistEnergy(
          { yt: r.yt, buzz: r.buzz, album: r.album, music: r.music },
          r.prev,
          { yt: ytPcts[i], buzz: buzzPcts[i], album: albumPcts[i], music: musicPcts[i] },
        );

        results.push({
          eid: r.eid,
          ...calc,
          ytCurrent: r.yt, buzzCurrent: r.buzz, albumCurrent: r.album, musicCurrent: r.music,
          scoreId: r.current.id,
          baseline: baselineMap.get(r.eid),
          prevSnapshotAt: r.prev?.snapshot_at || null,
        });
      } catch (e) {
        console.error(`[FES-v5.1] Error for ${rawData[i].eid}:`, e);
      }
    }

    // ── 6) DB writes ──
    console.log(`[FES-v5.1] Writing ${results.length} results...`);
    const writeOps: Promise<any>[] = [];

    for (const r of results) {
      writeOps.push(sb.from("v3_energy_snapshots_v2").insert({
        wiki_entry_id: r.eid,
        energy_score: r.energyScore,
        youtube_score: r.ytCurrent,
        buzz_score: r.buzzCurrent,
        album_score: r.albumCurrent,
        music_score: r.musicCurrent,
        youtube_velocity: r.ytVelocity,
        youtube_intensity: r.ytIntensity,
        buzz_velocity: r.buzzVelocity,
        buzz_intensity: r.buzzIntensity,
        album_velocity: r.albumVelocity,
        album_intensity: r.albumIntensity,
        music_velocity: r.musicVelocity,
        music_intensity: r.musicIntensity,
      }));

      writeOps.push(sb.from("v3_scores_v2").update({
        energy_score: r.energyScore,
        energy_change_24h: r.change24h,
        youtube_change_24h: r.ytChange,
        buzz_change_24h: r.buzzChange,
        album_change_24h: r.albumChange,
        music_change_24h: r.musicChange,
        scored_at: new Date().toISOString(),
      }).eq("id", r.scoreId));

      if (r.baseline) {
        const a7 = 0.15, a30 = 0.05;
        writeOps.push(sb.from("v3_energy_baselines_v2").update({
          avg_energy_7d: Math.round(((r.baseline.avg_energy_7d || 100) * (1 - a7) + r.energyScore * a7) * 100) / 100,
          avg_energy_30d: Math.round(((r.baseline.avg_energy_30d || 100) * (1 - a30) + r.energyScore * a30) * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", r.eid));
      }
    }

    await Promise.all(writeOps);
    console.log(`[FES-v5.1] All writes completed`);

    // ── 7) energy_rank 업데이트 ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      await Promise.all(
        allV2Scores.map((s: any, i: number) =>
          sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id)
        )
      );
    }

    // ── 8) 마일스톤 감지 ──
    try {
      const today = new Date().toISOString().slice(0, 10);
      const totalScoreRanked = [...(allV2Scores || [])]
        .filter((s: any) => tier1Ids.has(s.wiki_entry_id))
        .sort((a: any, b: any) => (b.energy_score || 0) - (a.energy_score || 0));

      const milestoneInserts: any[] = [];
      for (let i = 0; i < Math.min(3, totalScoreRanked.length); i++) {
        const s = totalScoreRanked[i];
        if (i === 0) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top1_ranking",
            milestone_date: today,
            value: s.energy_score || 0,
            metadata: { rank: 1 },
          });
        }
        milestoneInserts.push({
          wiki_entry_id: s.wiki_entry_id,
          milestone_type: "top3_ranking",
          milestone_date: today,
          value: i + 1,
          metadata: { energy_score: s.energy_score || 0 },
        });
      }
      if (milestoneInserts.length > 0) {
        await sb.from("v3_artist_milestones").upsert(milestoneInserts, {
          onConflict: "wiki_entry_id,milestone_type,milestone_date",
          ignoreDuplicates: true,
        });
      }
    } catch (e) {
      console.error("[FES-v5.1] Milestone error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      sample: results.slice(0, 3).map(r => ({
        eid: r.eid, energy: r.energyScore, change: r.change24h,
        yt: r.ytChange, buzz: r.buzzChange, album: r.albumChange, music: r.musicChange,
        prevSnapshotAt: r.prevSnapshotAt,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[FES-v5.1] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
