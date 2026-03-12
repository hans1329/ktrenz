// Fan Energy Score (FES) v6 — Velocity 주도 온도: 변동률이 크면 온도가 높다
// YouTube 37%, Buzz 23%, Music 18%, Album 14%, Social 5%, Fan 3%
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHTS = { youtube: 0.37, buzz: 0.23, music: 0.18, album: 0.14, social: 0.05, fan: 0.03 };
const MAX_SCORE = 250;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Calculate % change — low-base effect 방지: 이전값 < 5이면 ±100% 캡 */
const LOW_BASE_THRESHOLD = 5;
function pctChange(current: number, previous: number | null): number | null {
  if (previous == null) return null;
  if (previous <= 0) return current > 0 ? 100 : 0;
  const raw = ((current - previous) / previous) * 100;
  // 기저값이 낮으면 변동률을 ±100%로 제한 (low-base effect 방지)
  if (previous < LOW_BASE_THRESHOLD) return Math.max(-100, Math.min(100, raw));
  return raw;
}

/** 
 * Velocity 스코어: 변화율을 0~MAX_SCORE 범위로 매핑
 * v5.5: 0% 변화 = 0점 (중립), 양수/음수 비대칭 스케일링
 * - 0% → 0, ±50% → ±125, ±100%+ → ±MAX_SCORE 근처
 */
function changeToScore(change: number): number {
  if (change === 0) return 0;
  // 비선형 매핑: sign * MAX_SCORE * (1 - e^(-|change|/50))
  const absChange = Math.abs(change);
  const magnitude = MAX_SCORE * (1 - Math.exp(-absChange / 50));
  return Math.round(Math.sign(change) * magnitude);
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

/** 단일 아티스트의 Velocity/Intensity/Energy 계산 */
export function calculateArtistEnergy(
  current: { yt: number; buzz: number; album: number; music: number; social: number; fan: number },
  prev24h: { youtube_score: number; buzz_score: number; album_score: number; music_score: number; social_score?: number; fan_score?: number } | null,
  percentiles: { yt: number; buzz: number; album: number; music: number; social: number; fan: number },
) {
  const ytPrev = prev24h ? Number(prev24h.youtube_score) || 0 : null;
  const buzzPrev = prev24h ? Number(prev24h.buzz_score) || 0 : null;
  const albumPrev = prev24h ? Number(prev24h.album_score) || 0 : null;
  const musicPrev = prev24h ? Number(prev24h.music_score) || 0 : null;
  const socialPrev = prev24h ? Number(prev24h.social_score ?? 0) : null;
  const fanPrev = prev24h ? Number(prev24h.fan_score ?? 0) : null;

  const ytChange = pctChange(current.yt, ytPrev);
  const buzzChange = pctChange(current.buzz, buzzPrev);
  const albumChange = pctChange(current.album, albumPrev);
  const musicChange = pctChange(current.music, musicPrev);
  const socialChange = pctChange(current.social, socialPrev);
  const fanChange = pctChange(current.fan, fanPrev);

  // 비교 가능한 항목만으로 가중 변동률 계산
  let overallChange: number | null = null;
  if (prev24h) {
    const parts: { weight: number; change: number }[] = [];
    if (ytChange != null) parts.push({ weight: WEIGHTS.youtube, change: ytChange });
    if (buzzChange != null) parts.push({ weight: WEIGHTS.buzz, change: buzzChange });
    if (musicChange != null) parts.push({ weight: WEIGHTS.music, change: musicChange });
    if (albumChange != null) parts.push({ weight: WEIGHTS.album, change: albumChange });
    if (socialChange != null) parts.push({ weight: WEIGHTS.social, change: socialChange });
    if (fanChange != null) parts.push({ weight: WEIGHTS.fan, change: fanChange });
    if (parts.length > 0) {
      const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
      overallChange = parts.reduce((s, p) => s + p.change * (p.weight / totalWeight), 0);
    }
  }

  // ── Velocity (각 카테고리별) — v5.5: 0% = 0점 ──
  const ytVelocity = ytChange != null ? changeToScore(ytChange) : null;
  const buzzVelocity = buzzChange != null ? changeToScore(buzzChange) : null;
  const albumVelocity = albumChange != null ? changeToScore(albumChange) : null;
  const musicVelocity = musicChange != null ? changeToScore(musicChange) : null;
  const socialVelocity = socialChange != null ? changeToScore(socialChange) : null;
  const fanVelocity = fanChange != null ? changeToScore(fanChange) : null;

  // ── Intensity (각 카테고리별) ──
  const ytIntensity = clamp(Math.round(percentiles.yt * MAX_SCORE), 0, MAX_SCORE);
  const buzzIntensity = clamp(Math.round(percentiles.buzz * MAX_SCORE), 0, MAX_SCORE);
  const albumIntensity = clamp(Math.round(percentiles.album * MAX_SCORE), 0, MAX_SCORE);
  const musicIntensity = clamp(Math.round(percentiles.music * MAX_SCORE), 0, MAX_SCORE);
  const socialIntensity = clamp(Math.round(percentiles.social * MAX_SCORE), 0, MAX_SCORE);
  const fanIntensity = clamp(Math.round(percentiles.fan * MAX_SCORE), 0, MAX_SCORE);

  // ── Energy Score v6.1: overallChange → 온도 직접 매핑 ──
  // "온도가 높다 = 지금 가중 변동률이 크다" — 가장 직관적인 매핑
  // overallChange(%)를 지수 감쇄로 10~250° 스케일에 매핑
  // Intensity는 이전 데이터 없을 때만 fallback으로 사용
  let energyScore: number;

  if (overallChange != null) {
    // 가중 변동률을 온도에 직접 매핑 (decay constant = 100으로 넓은 스프레드)
    // 0% → 10°, ~50% → ~88°, ~100% → ~150°, ~200% → ~215°, ~500%+ → ~250°
    const absChange = Math.abs(overallChange);
    const mapped = MAX_SCORE * (1 - Math.exp(-absChange / 100));
    // 하락(음수 변동)은 온도를 낮추되 급냉 방지 (30% 감쇄)
    if (overallChange >= 0) {
      energyScore = clamp(Math.round(mapped), 10, MAX_SCORE);
    } else {
      energyScore = clamp(Math.round(mapped * 0.3), 10, MAX_SCORE);
    }
  } else {
    // 이전 데이터 없음 → Intensity 기반 fallback (신규 아티스트)
    const categories = [
      { w: WEIGHTS.youtube, int: ytIntensity, raw: current.yt },
      { w: WEIGHTS.buzz, int: buzzIntensity, raw: current.buzz },
      { w: WEIGHTS.music, int: musicIntensity, raw: current.music },
      { w: WEIGHTS.album, int: albumIntensity, raw: current.album },
      { w: WEIGHTS.social, int: socialIntensity, raw: current.social },
      { w: WEIGHTS.fan, int: fanIntensity, raw: current.fan },
    ];
    const active = categories.filter(c => c.raw > 0);
    if (active.length > 0) {
      const totalW = active.reduce((s, c) => s + c.w, 0);
      const avg = active.reduce((s, c) => s + c.int * (c.w / totalW), 0);
      energyScore = clamp(Math.round(avg), 10, MAX_SCORE);
    } else {
      energyScore = 10;
    }
  }

  return {
    energyScore,
    ytVelocity, ytIntensity,
    buzzVelocity, buzzIntensity,
    albumVelocity, albumIntensity,
    musicVelocity, musicIntensity,
    socialVelocity, socialIntensity,
    fanVelocity, fanIntensity,
    change24h: overallChange != null ? Math.round(overallChange * 10) / 10 : null,
    ytChange: ytChange != null ? Math.round(ytChange * 10) / 10 : null,
    buzzChange: buzzChange != null ? Math.round(buzzChange * 10) / 10 : null,
    albumChange: albumChange != null ? Math.round(albumChange * 10) / 10 : null,
    musicChange: musicChange != null ? Math.round(musicChange * 10) / 10 : null,
    socialChange: socialChange != null ? Math.round(socialChange * 10) / 10 : null,
    fanChange: fanChange != null ? Math.round(fanChange * 10) / 10 : null,
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
      .select("id, wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score, social_score, total_score")
      .in("wiki_entry_id", [...tier1Ids])
      .order("total_score", { ascending: false });

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

    console.log(`[FES-v5.5] Processing ${entryIds.length} artists... (isBaseline=${isBaseline})`);

    // ── 2) 롤링 24h 윈도우: ~24시간 전 스냅샷과 비교 (일괄 조회) ──
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: allPrevSnaps } = await sb
      .from("v3_energy_snapshots_v2")
      .select("wiki_entry_id, youtube_score, buzz_score, album_score, music_score, social_score, fan_score, snapshot_at")
      .in("wiki_entry_id", entryIds)
      .lte("snapshot_at", cutoff24h)
      .order("snapshot_at", { ascending: false })
      .limit(entryIds.length * 3);

    const prevMap = new Map<string, any>();
    for (const snap of (allPrevSnaps || [])) {
      if (prevMap.has(snap.wiki_entry_id)) continue;
      if (
        (Number(snap.youtube_score) || 0) > 0 || (Number(snap.buzz_score) || 0) > 0 ||
        (Number(snap.album_score) || 0) > 0 || (Number(snap.music_score) || 0) > 0 ||
        (Number(snap.social_score) || 0) > 0 || (Number(snap.fan_score) || 0) > 0
      ) {
        prevMap.set(snap.wiki_entry_id, snap);
      }
    }

    // ── 3) 베이스라인 일괄 조회 ──
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) baselineMap.set(b.wiki_entry_id, b);

    // ── 4) Fan Activity 집계 (24시간 이내 유저 활동) ──
    const fanCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: wikiEntries } = await sb
      .from("wiki_entries")
      .select("id, slug")
      .in("id", entryIds);
    const slugToEid = new Map<string, string>();
    for (const w of (wikiEntries || [])) slugToEid.set(w.slug, w.id);

    const { data: recentEvents } = await sb
      .from("ktrenz_user_events")
      .select("event_type, event_data")
      .in("event_type", ["external_link_click", "agent_chat", "artist_detail_view", "treemap_click", "list_click"])
      .gte("created_at", fanCutoff)
      .limit(5000);

    const FAN_EVENT_WEIGHTS: Record<string, number> = {
      external_link_click: 1.5,
      agent_chat: 1.0,
      artist_detail_view: 0.5,
      treemap_click: 0.3,
      list_click: 0.3,
    };

    const fanScoreMap = new Map<string, number>();
    for (const ev of (recentEvents || [])) {
      const data = ev.event_data as any;
      const slug = data?.artist_slug;
      if (!slug) continue;
      const eid = slugToEid.get(slug);
      if (!eid) continue;
      const weight = FAN_EVENT_WEIGHTS[ev.event_type] || 0.3;
      fanScoreMap.set(eid, (fanScoreMap.get(eid) || 0) + weight);
    }

    // ── 5) 퍼센타일 기반 에너지 스코어 계산 ──
    const rawData: { eid: string; yt: number; buzz: number; album: number; music: number; social: number; fan: number; prev: any; current: any }[] = [];
    for (const eid of entryIds) {
      const current = scoreMap.get(eid)!;
      rawData.push({
        eid,
        yt: Number(current.youtube_score) || 0,
        buzz: Number(current.buzz_score) || 0,
        album: Number(current.album_sales_score) || 0,
        music: Number(current.music_score) || 0,
        social: Number(current.social_score) || 0,
        fan: fanScoreMap.get(eid) || 0,
        prev: prevMap.get(eid) || null,
        current,
      });
    }

    const ytPcts = toPercentiles(rawData.map(d => d.yt));
    const buzzPcts = toPercentiles(rawData.map(d => d.buzz));
    const albumPcts = toPercentiles(rawData.map(d => d.album));
    const musicPcts = toPercentiles(rawData.map(d => d.music));
    const socialPcts = toPercentiles(rawData.map(d => d.social));
    const fanPcts = toPercentiles(rawData.map(d => d.fan));

    const results: any[] = [];
    for (let i = 0; i < rawData.length; i++) {
      try {
        const r = rawData[i];
        const calc = calculateArtistEnergy(
          { yt: r.yt, buzz: r.buzz, album: r.album, music: r.music, social: r.social, fan: r.fan },
          r.prev,
          { yt: ytPcts[i], buzz: buzzPcts[i], album: albumPcts[i], music: musicPcts[i], social: socialPcts[i], fan: fanPcts[i] },
        );

        results.push({
          eid: r.eid,
          ...calc,
          ytCurrent: r.yt, buzzCurrent: r.buzz, albumCurrent: r.album, musicCurrent: r.music,
          socialCurrent: r.social, fanCurrent: r.fan,
          scoreId: r.current.id,
          baseline: baselineMap.get(r.eid),
          prevSnapshotAt: r.prev?.snapshot_at || null,
        });
      } catch (e) {
        console.error(`[FES-v5.5] Error for ${rawData[i].eid}:`, e);
      }
    }

    // ── 6) DB writes — 스냅샷 중복 방지 (1시간 이내 스냅샷 존재시 스킵) ──
    console.log(`[FES-v5.5] Writing ${results.length} results... (isBaseline=${isBaseline})`);

    // 최근 스냅샷 시간 확인 (중복 방지)
    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1시간 전
    const { data: recentSnaps } = await sb
      .from("v3_energy_snapshots_v2")
      .select("wiki_entry_id")
      .in("wiki_entry_id", entryIds)
      .gte("snapshot_at", recentCutoff)
      .limit(entryIds.length);

    const recentSnapSet = new Set((recentSnaps || []).map((s: any) => s.wiki_entry_id));

    // 중복되지 않는 아티스트만 스냅샷 insert
    const snapshotRows = results
      .filter(r => !recentSnapSet.has(r.eid))
      .map(r => ({
        wiki_entry_id: r.eid,
        energy_score: r.energyScore,
        youtube_score: r.ytCurrent,
        buzz_score: r.buzzCurrent,
        album_score: r.albumCurrent,
        music_score: r.musicCurrent,
        social_score: r.socialCurrent,
        youtube_velocity: r.ytVelocity,
        youtube_intensity: r.ytIntensity,
        buzz_velocity: r.buzzVelocity,
        buzz_intensity: r.buzzIntensity,
        album_velocity: r.albumVelocity,
        album_intensity: r.albumIntensity,
        music_velocity: r.musicVelocity,
        music_intensity: r.musicIntensity,
        social_velocity: r.socialVelocity,
        social_intensity: r.socialIntensity,
        fan_score: r.fanCurrent,
        fan_velocity: r.fanVelocity,
        fan_intensity: r.fanIntensity,
        is_baseline: isBaseline,
      }));

    if (snapshotRows.length > 0) {
      const { error: snapErr } = await sb.from("v3_energy_snapshots_v2").insert(snapshotRows);
      if (snapErr) console.error("[FES-v5.5] Snapshot insert error:", snapErr.message);
      console.log(`[FES-v5.5] Snapshots: ${snapshotRows.length} inserted, ${recentSnapSet.size} skipped (recent)`);
    } else {
      console.log(`[FES-v5.5] All ${results.length} snapshots skipped (recent duplicates)`);
    }

    // scores 업데이트 (10개씩 배치)
    const BATCH_SIZE = 10;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(r =>
        sb.from("v3_scores_v2").update({
          energy_score: r.energyScore,
          energy_change_24h: r.change24h,
          youtube_change_24h: r.ytChange,
          buzz_change_24h: r.buzzChange,
          album_change_24h: r.albumChange,
          music_change_24h: r.musicChange,
          social_score: r.socialCurrent,
          social_change_24h: r.socialChange,
          fan_score: r.fanCurrent,
          fan_change_24h: r.fanChange,
          scored_at: new Date().toISOString(),
        }).eq("id", r.scoreId)
      ));
    }

    // baseline 업데이트 (배치)
    const baselineUpdates = results.filter(r => r.baseline);
    if (baselineUpdates.length > 0) {
      await Promise.all(baselineUpdates.map(r => {
        const a7 = 0.15, a30 = 0.05;
        return sb.from("v3_energy_baselines_v2").update({
          avg_energy_7d: Math.round(((r.baseline.avg_energy_7d || 100) * (1 - a7) + r.energyScore * a7) * 100) / 100,
          avg_energy_30d: Math.round(((r.baseline.avg_energy_30d || 100) * (1 - a30) + r.energyScore * a30) * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", r.eid);
      }));
    }

    console.log(`[FES-v5.5] All writes completed`);

    // ── 7) energy_rank 업데이트 + 미처리 아티스트 초기화 ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      const processedEids = new Set(results.map(r => r.eid));
      const energyMap = new Map<string, number>();
      for (const r of results) energyMap.set(r.eid, r.energyScore);

      const scoredEntries = allV2Scores.map((s: any) => ({
        ...s,
        effective_energy: processedEids.has(s.wiki_entry_id)
          ? (energyMap.get(s.wiki_entry_id) || s.energy_score)
          : 0,
      }));
      scoredEntries.sort((a: any, b: any) => b.effective_energy - a.effective_energy);

      const rankOps: Promise<any>[] = [];
      for (let i = 0; i < scoredEntries.length; i++) {
        const s = scoredEntries[i];
        if (processedEids.has(s.wiki_entry_id)) {
          rankOps.push(sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id));
        } else {
          rankOps.push(sb.from("v3_scores_v2").update({
            energy_rank: i + 1,
            energy_score: 0,
            energy_change_24h: null,
            youtube_change_24h: null,
            buzz_change_24h: null,
            album_change_24h: null,
            music_change_24h: null,
            fan_score: 0,
            fan_change_24h: null,
          }).eq("id", s.id));
        }
      }

      await Promise.all(rankOps);
      console.log(`[FES-v5.5] Ranks updated: ${scoredEntries.length} total, ${processedEids.size} processed`);
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
      console.error("[FES-v5.5] Milestone error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      snapshotsInserted: snapshotRows.length,
      snapshotsSkipped: recentSnapSet.size,
      isBaseline,
      sample: results.slice(0, 3).map(r => ({
        eid: r.eid, energy: r.energyScore, change: r.change24h,
        yt: r.ytChange, buzz: r.buzzChange, album: r.albumChange, music: r.musicChange,
        social: r.socialChange, fan: r.fanChange, fanScore: r.fanCurrent,
        prevSnapshotAt: r.prevSnapshotAt,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[FES-v5.5] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
