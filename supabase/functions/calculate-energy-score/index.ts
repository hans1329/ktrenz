// Fan Energy Score (FES) v5.2 — is_baseline 기준 스냅샷 비교
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

  // ── Velocity (각 카테고리별) ──
  const ytVelocity = ytChange != null ? changeToScore(ytChange) : null;
  const buzzVelocity = buzzChange != null ? changeToScore(buzzChange) : null;
  const albumVelocity = albumChange != null ? changeToScore(albumChange) : null;
  const musicVelocity = musicChange != null ? changeToScore(musicChange) : null;

  // ── Intensity (각 카테고리별) ──
  const ytIntensity = clamp(Math.round(percentiles.yt * MAX_SCORE), 0, MAX_SCORE);
  const buzzIntensity = clamp(Math.round(percentiles.buzz * MAX_SCORE), 0, MAX_SCORE);
  const albumIntensity = clamp(Math.round(percentiles.album * MAX_SCORE), 0, MAX_SCORE);
  const musicIntensity = clamp(Math.round(percentiles.music * MAX_SCORE), 0, MAX_SCORE);

  // ── Energy Score: 60% Velocity + 40% Intensity ──
  // Velocity가 없는(베이스라인 없음) 카테고리는 Intensity만 사용
  const VELOCITY_WEIGHT = 0.6;
  const INTENSITY_WEIGHT = 0.4;

  const categoryEnergies: { weight: number; energy: number }[] = [];
  const categories = [
    { w: WEIGHTS.youtube, vel: ytVelocity, int: ytIntensity },
    { w: WEIGHTS.buzz, vel: buzzVelocity, int: buzzIntensity },
    { w: WEIGHTS.music, vel: musicVelocity, int: musicIntensity },
    { w: WEIGHTS.album, vel: albumVelocity, int: albumIntensity },
  ];

  for (const cat of categories) {
    const catEnergy = cat.vel != null
      ? cat.vel * VELOCITY_WEIGHT + cat.int * INTENSITY_WEIGHT
      : cat.int; // Velocity 없으면 Intensity만
    categoryEnergies.push({ weight: cat.w, energy: catEnergy });
  }

  const totalCatWeight = categoryEnergies.reduce((s, c) => s + c.weight, 0);
  const rawEnergy = categoryEnergies.reduce((s, c) => s + c.energy * (c.weight / totalCatWeight), 0);
  const energyScore = clamp(Math.round(rawEnergy), 10, MAX_SCORE);

  return {
    energyScore,
    ytVelocity, ytIntensity,
    buzzVelocity, buzzIntensity,
    albumVelocity, albumIntensity,
    musicVelocity, musicIntensity,
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
    const isBaseline: boolean = body.isBaseline === true;

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

    console.log(`[FES-v5.2] Processing ${entryIds.length} artists... (isBaseline=${isBaseline})`);

    // ── 2) 기준 스냅샷(is_baseline=true) 찾기 ──
    // 무조건 최근 베이스라인과 비교 (fallback 스냅샷 사용 금지)
    const prevSnapResults = await Promise.all(
      entryIds.map(async (eid) => {
        const { data: baselineData } = await sb.from("v3_energy_snapshots_v2")
          .select("youtube_score, buzz_score, album_score, music_score, snapshot_at")
          .eq("wiki_entry_id", eid)
          .eq("is_baseline", true)
          .order("snapshot_at", { ascending: false })
          .limit(1);

        const baseline = baselineData?.[0];
        if (baseline && (
          (Number(baseline.youtube_score) || 0) > 0 || (Number(baseline.buzz_score) || 0) > 0 ||
          (Number(baseline.album_score) || 0) > 0 || (Number(baseline.music_score) || 0) > 0
        )) {
          return { eid, prev: baseline };
        }

        return { eid, prev: null };
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
        console.error(`[FES-v5.2] Error for ${rawData[i].eid}:`, e);
      }
    }

    // ── 6) DB writes ──
    console.log(`[FES-v5.2] Writing ${results.length} results... (isBaseline=${isBaseline})`);
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
        is_baseline: isBaseline,
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
    console.log(`[FES-v5.2] All writes completed`);

    // ── 7) energy_rank 업데이트 + 미처리 아티스트 변동률 초기화 ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      const processedEids = new Set(results.map(r => r.eid));
      const rankOps: Promise<any>[] = [];

      for (let i = 0; i < allV2Scores.length; i++) {
        const s = allV2Scores[i] as any;
        if (processedEids.has(s.wiki_entry_id)) {
          // 처리된 아티스트: 랭크만 업데이트
          rankOps.push(sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id));
        } else {
          // 미처리 아티스트: 랭크 업데이트 + 잔존 변동률 초기화
          rankOps.push(sb.from("v3_scores_v2").update({
            energy_rank: i + 1,
            energy_change_24h: null,
            youtube_change_24h: null,
            buzz_change_24h: null,
            album_change_24h: null,
            music_change_24h: null,
          }).eq("id", s.id));
        }
      }

      await Promise.all(rankOps);
      console.log(`[FES-v5.2] Ranks updated: ${allV2Scores.length} total, ${processedEids.size} processed, ${allV2Scores.length - processedEids.size} reset`);
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
      console.error("[FES-v5.2] Milestone error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      isBaseline,
      sample: results.slice(0, 3).map(r => ({
        eid: r.eid, energy: r.energyScore, change: r.change24h,
        yt: r.ytChange, buzz: r.buzzChange, album: r.albumChange, music: r.musicChange,
        prevSnapshotAt: r.prevSnapshotAt,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[FES-v5.2] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
