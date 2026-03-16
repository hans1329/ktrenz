// Fan Energy Score (FES) v7 — Hybrid Model: Velocity 70% + Intensity 30%
// 미수집 카테고리 자동 제외 + Album 활동 중만 반영
// YouTube 37%, Buzz 23%, Music 18%, Album 14%, Social 5%, Fan 3%
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// 기본 가중치 — 데이터 가용성에 따라 동적으로 재분배됨
const BASE_WEIGHTS = { youtube: 0.37, buzz: 0.23, music: 0.18, album: 0.14, social: 0.05, fan: 0.03 };
const MAX_SCORE = 250;

// Hybrid ratio: Velocity vs Intensity
const VELOCITY_RATIO = 0.7;
const INTENSITY_RATIO = 0.3;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Calculate % change — low-base effect 방지: 이전값 < 5이면 ±100% 캡 */
const LOW_BASE_THRESHOLD = 5;
function pctChange(current: number, previous: number | null): number | null {
  if (previous == null) return null;
  if (previous <= 0) return current > 0 ? 100 : 0;
  const raw = ((current - previous) / previous) * 100;
  if (previous < LOW_BASE_THRESHOLD) return Math.max(-100, Math.min(100, raw));
  return raw;
}

/** Velocity 스코어: 변화율을 0~MAX_SCORE 범위로 매핑 */
function changeToScore(change: number): number {
  if (change === 0) return 0;
  const absChange = Math.abs(change);
  const magnitude = MAX_SCORE * (1 - Math.exp(-absChange / 50));
  return Math.round(Math.sign(change) * magnitude);
}

/** 퍼센타일 함수 */
function toPercentiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(v => {
    const rank = sorted.filter(s => s < v).length;
    const ties = sorted.filter(s => s === v).length;
    return (rank + (ties - 1) / 2) / Math.max(sorted.length - 1, 1);
  });
}

/**
 * 데이터 가용성 판단
 * - "available": 실제 데이터가 수집됨 (점수 > 0 또는 수집은 성공했으나 실제 0)
 * - "unavailable": 미수집 (채널 없음, API 실패 등)
 */
export interface DataAvailability {
  youtube: boolean;
  buzz: boolean;
  music: boolean;
  album: boolean;  // album_sales_score > 0이어야 "활동 중"
  social: boolean;
  fan: boolean;     // fan은 항상 available (유저 행동 기반)
}

/**
 * 가용한 카테고리만의 가중치를 재분배
 * 예: youtube 미수집 → youtube 37%를 나머지에 비례 분배
 */
function redistributeWeights(availability: DataAvailability): Record<string, number> {
  const entries: [string, number][] = [];
  if (availability.youtube) entries.push(["youtube", BASE_WEIGHTS.youtube]);
  if (availability.buzz) entries.push(["buzz", BASE_WEIGHTS.buzz]);
  if (availability.music) entries.push(["music", BASE_WEIGHTS.music]);
  if (availability.album) entries.push(["album", BASE_WEIGHTS.album]);
  if (availability.social) entries.push(["social", BASE_WEIGHTS.social]);
  if (availability.fan) entries.push(["fan", BASE_WEIGHTS.fan]);

  if (entries.length === 0) {
    // 모든 카테고리 미수집 → 균등 분배 fallback
    return { youtube: 1/6, buzz: 1/6, music: 1/6, album: 1/6, social: 1/6, fan: 1/6 };
  }

  const totalRaw = entries.reduce((s, [, w]) => s + w, 0);
  const result: Record<string, number> = { youtube: 0, buzz: 0, music: 0, album: 0, social: 0, fan: 0 };
  for (const [key, w] of entries) {
    result[key] = w / totalRaw; // 비례 재분배하여 합계 = 1.0
  }
  return result;
}

/** 단일 아티스트의 Velocity/Intensity/Energy 계산 (v7 Hybrid) */
export function calculateArtistEnergy(
  current: { yt: number; buzz: number; album: number; music: number; social: number; fan: number },
  prev24h: { youtube_score: number; buzz_score: number; album_score: number; music_score: number; social_score?: number; fan_score?: number } | null,
  percentiles: { yt: number; buzz: number; album: number; music: number; social: number; fan: number },
  availability: DataAvailability,
) {
  const weights = redistributeWeights(availability);

  const ytPrev = prev24h ? Number(prev24h.youtube_score) || 0 : null;
  const buzzPrev = prev24h ? Number(prev24h.buzz_score) || 0 : null;
  const albumPrev = prev24h ? Number(prev24h.album_score) || 0 : null;
  const musicPrev = prev24h ? Number(prev24h.music_score) || 0 : null;
  const socialPrev = prev24h ? Number(prev24h.social_score ?? 0) : null;
  const fanPrev = prev24h ? Number(prev24h.fan_score ?? 0) : null;

  // 미수집 카테고리는 change를 null로 유지하여 변동률 계산에서 제외
  const ytChange = availability.youtube ? pctChange(current.yt, ytPrev) : null;
  const buzzChange = availability.buzz ? pctChange(current.buzz, buzzPrev) : null;
  const albumChange = availability.album ? pctChange(current.album, albumPrev) : null;
  const musicChange = availability.music ? pctChange(current.music, musicPrev) : null;
  const socialChange = availability.social ? pctChange(current.social, socialPrev) : null;
  const fanChange = pctChange(current.fan, fanPrev); // fan은 항상 계산

  // 가용 카테고리만으로 가중 변동률 계산
  let overallChange: number | null = null;
  if (prev24h) {
    const parts: { weight: number; change: number }[] = [];
    if (ytChange != null && availability.youtube) parts.push({ weight: weights.youtube, change: ytChange });
    if (buzzChange != null && availability.buzz) parts.push({ weight: weights.buzz, change: buzzChange });
    if (musicChange != null && availability.music) parts.push({ weight: weights.music, change: musicChange });
    if (albumChange != null && availability.album) parts.push({ weight: weights.album, change: albumChange });
    if (socialChange != null && availability.social) parts.push({ weight: weights.social, change: socialChange });
    if (fanChange != null) parts.push({ weight: weights.fan, change: fanChange });
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
  const socialVelocity = socialChange != null ? changeToScore(socialChange) : null;
  const fanVelocity = fanChange != null ? changeToScore(fanChange) : null;

  // ── Intensity (각 카테고리별) — 미수집은 0으로 처리 ──
  const ytIntensity = availability.youtube ? clamp(Math.round(percentiles.yt * MAX_SCORE), 0, MAX_SCORE) : 0;
  const buzzIntensity = availability.buzz ? clamp(Math.round(percentiles.buzz * MAX_SCORE), 0, MAX_SCORE) : 0;
  const albumIntensity = availability.album ? clamp(Math.round(percentiles.album * MAX_SCORE), 0, MAX_SCORE) : 0;
  const musicIntensity = availability.music ? clamp(Math.round(percentiles.music * MAX_SCORE), 0, MAX_SCORE) : 0;
  const socialIntensity = availability.social ? clamp(Math.round(percentiles.social * MAX_SCORE), 0, MAX_SCORE) : 0;
  const fanIntensity = clamp(Math.round(percentiles.fan * MAX_SCORE), 0, MAX_SCORE);

  // ── Energy Score v7: Hybrid (Velocity 70% + Intensity 30%) ──
  let velocityScore: number;
  let intensityScore: number;
  let energyScore: number;

  // Velocity component
  if (overallChange != null) {
    const absChange = Math.abs(overallChange);
    const mapped = MAX_SCORE * (1 - Math.exp(-absChange / 100));
    if (overallChange >= 0) {
      velocityScore = clamp(Math.round(mapped), 10, MAX_SCORE);
    } else {
      velocityScore = clamp(Math.round(mapped * 0.3), 10, MAX_SCORE);
    }
  } else {
    velocityScore = 10; // 이전 데이터 없음
  }

  // Intensity component: 가용 카테고리의 가중 평균 퍼센타일
  {
    const cats: { w: number; int: number; raw: number }[] = [];
    if (availability.youtube) cats.push({ w: weights.youtube, int: ytIntensity, raw: current.yt });
    if (availability.buzz) cats.push({ w: weights.buzz, int: buzzIntensity, raw: current.buzz });
    if (availability.music) cats.push({ w: weights.music, int: musicIntensity, raw: current.music });
    if (availability.album) cats.push({ w: weights.album, int: albumIntensity, raw: current.album });
    if (availability.social) cats.push({ w: weights.social, int: socialIntensity, raw: current.social });
    cats.push({ w: weights.fan, int: fanIntensity, raw: current.fan });

    const active = cats.filter(c => c.raw > 0);
    if (active.length > 0) {
      const totalW = active.reduce((s, c) => s + c.w, 0);
      intensityScore = clamp(Math.round(active.reduce((s, c) => s + c.int * (c.w / totalW), 0)), 10, MAX_SCORE);
    } else {
      intensityScore = 10;
    }
  }

  // Hybrid: 70% Velocity + 30% Intensity
  if (overallChange != null) {
    energyScore = clamp(
      Math.round(velocityScore * VELOCITY_RATIO + intensityScore * INTENSITY_RATIO),
      10, MAX_SCORE
    );
  } else {
    // 이전 데이터 없으면 Intensity 100% (신규 아티스트)
    energyScore = intensityScore;
  }

  return {
    energyScore,
    velocityScore,
    intensityScore,
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
    weights, // 디버깅용: 실제 적용된 가중치
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

    // ── 1) Tier 1 아티스트 목록 + 채널 정보 ──
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, youtube_channel_id, youtube_topic_channel_id")
      .eq("tier", 1);

    const tier1Map = new Map<string, { hasYtChannel: boolean; hasYtTopic: boolean }>();
    for (const t of (tier1Entries || [])) {
      if (t.wiki_entry_id) {
        tier1Map.set(t.wiki_entry_id, {
          hasYtChannel: !!t.youtube_channel_id,
          hasYtTopic: !!t.youtube_topic_channel_id,
        });
      }
    }
    const tier1Ids = new Set(tier1Map.keys());

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

    console.log(`[FES-v7] Processing ${entryIds.length} artists... (isBaseline=${isBaseline})`);

    // ── 2) 최근 YouTube 스냅샷으로 수집 성공 여부 판단 ──
    const ytSnapshotCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: recentYtSnaps } = await sb
      .from("ktrenz_data_snapshots")
      .select("wiki_entry_id, metrics")
      .eq("platform", "youtube")
      .in("wiki_entry_id", entryIds)
      .gte("collected_at", ytSnapshotCutoff)
      .order("collected_at", { ascending: false })
      .limit(entryIds.length * 2);

    // 각 아티스트의 최신 youtube 스냅샷에서 subscriberCount > 0이면 수집 성공
    const ytCollectedOk = new Set<string>();
    const seenYt = new Set<string>();
    for (const snap of (recentYtSnaps || [])) {
      if (seenYt.has(snap.wiki_entry_id)) continue;
      seenYt.add(snap.wiki_entry_id);
      const metrics = snap.metrics as any;
      if (metrics && (Number(metrics.subscriberCount) > 0 || Number(metrics.totalViewCount) > 0)) {
        ytCollectedOk.add(snap.wiki_entry_id);
      }
    }

    // ── 3) 롤링 24h 윈도우 ──
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

    // ── 4) 베이스라인 일괄 조회 ──
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) baselineMap.set(b.wiki_entry_id, b);

    // ── 5) Fan Activity 집계 ──
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

    // ── 6) 데이터 가용성 결정 + 퍼센타일 ──
    const rawData: { eid: string; yt: number; buzz: number; album: number; music: number; social: number; fan: number; prev: any; current: any; availability: DataAvailability }[] = [];

    for (const eid of entryIds) {
      const current = scoreMap.get(eid)!;
      const tierInfo = tier1Map.get(eid);
      const ytScore = Number(current.youtube_score) || 0;
      const buzzScore = Number(current.buzz_score) || 0;
      const musicScore = Number(current.music_score) || 0;
      const albumScore = Number(current.album_sales_score) || 0;
      const socialScore = Number(current.social_score) || 0;

      // YouTube 가용성: 채널이 있고 최근 수집이 성공적이거나, 실제 점수가 있는 경우
      const ytAvailable = ytScore > 0 || ytCollectedOk.has(eid);
      
      // Album 가용성: 점수가 > 0인 경우만 (활동 중인 아티스트만)
      const albumAvailable = albumScore > 0;
      
      // Social 가용성: 점수가 > 0인 경우 (팔로워 데이터가 있는 아티스트)
      const socialAvailable = socialScore > 0;

      const availability: DataAvailability = {
        youtube: ytAvailable,
        buzz: buzzScore > 0 || true, // buzz는 항상 수집 시도됨 (0이어도 valid)
        music: musicScore > 0 || true, // music도 항상 수집됨
        album: albumAvailable,
        social: socialAvailable,
        fan: true, // fan은 항상 available
      };

      rawData.push({
        eid,
        yt: ytScore,
        buzz: buzzScore,
        album: albumScore,
        music: musicScore,
        social: socialScore,
        fan: fanScoreMap.get(eid) || 0,
        prev: prevMap.get(eid) || null,
        current,
        availability,
      });
    }

    // 퍼센타일은 가용한 데이터끼리만 비교 (0값은 0 퍼센타일로 자연 처리)
    const ytPcts = toPercentiles(rawData.map(d => d.yt));
    const buzzPcts = toPercentiles(rawData.map(d => d.buzz));
    const albumPcts = toPercentiles(rawData.map(d => d.album));
    const musicPcts = toPercentiles(rawData.map(d => d.music));
    const socialPcts = toPercentiles(rawData.map(d => d.social));
    const fanPcts = toPercentiles(rawData.map(d => d.fan));

    // 가용성별 아티스트 수 로깅
    const availStats = {
      noYt: rawData.filter(d => !d.availability.youtube).length,
      noAlbum: rawData.filter(d => !d.availability.album).length,
      noSocial: rawData.filter(d => !d.availability.social).length,
    };
    console.log(`[FES-v7] Data availability: noYT=${availStats.noYt}, noAlbum=${availStats.noAlbum}, noSocial=${availStats.noSocial}`);

    const results: any[] = [];
    for (let i = 0; i < rawData.length; i++) {
      try {
        const r = rawData[i];
        const calc = calculateArtistEnergy(
          { yt: r.yt, buzz: r.buzz, album: r.album, music: r.music, social: r.social, fan: r.fan },
          r.prev,
          { yt: ytPcts[i], buzz: buzzPcts[i], album: albumPcts[i], music: musicPcts[i], social: socialPcts[i], fan: fanPcts[i] },
          r.availability,
        );

        results.push({
          eid: r.eid,
          ...calc,
          ytCurrent: r.yt, buzzCurrent: r.buzz, albumCurrent: r.album, musicCurrent: r.music,
          socialCurrent: r.social, fanCurrent: r.fan,
          scoreId: r.current.id,
          baseline: baselineMap.get(r.eid),
          prevSnapshotAt: r.prev?.snapshot_at || null,
          availability: r.availability,
        });
      } catch (e) {
        console.error(`[FES-v7] Error for ${rawData[i].eid}:`, e);
      }
    }

    // ── 7) DB writes — 스냅샷 중복 방지 ──
    console.log(`[FES-v7] Writing ${results.length} results... (isBaseline=${isBaseline})`);

    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentSnaps } = await sb
      .from("v3_energy_snapshots_v2")
      .select("wiki_entry_id")
      .in("wiki_entry_id", entryIds)
      .gte("snapshot_at", recentCutoff)
      .limit(entryIds.length);

    const recentSnapSet = new Set((recentSnaps || []).map((s: any) => s.wiki_entry_id));

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
      if (snapErr) console.error("[FES-v7] Snapshot insert error:", snapErr.message);
      console.log(`[FES-v7] Snapshots: ${snapshotRows.length} inserted, ${recentSnapSet.size} skipped (recent)`);
    } else {
      console.log(`[FES-v7] All ${results.length} snapshots skipped (recent duplicates)`);
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

    // baseline 업데이트
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

    console.log(`[FES-v7] All writes completed`);

    // ── 8) energy_rank 업데이트 ──
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
      console.log(`[FES-v7] Ranks updated: ${scoredEntries.length} total, ${processedEids.size} processed`);
    }

    // ── 9) 마일스톤 감지 ──
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
      console.error("[FES-v7] Milestone error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      version: "v7-hybrid",
      processed: results.length,
      snapshotsInserted: snapshotRows.length,
      snapshotsSkipped: recentSnapSet.size,
      isBaseline,
      availability: availStats,
      sample: results.slice(0, 5).map(r => ({
        eid: r.eid, energy: r.energyScore, velocity: r.velocityScore, intensity: r.intensityScore,
        change: r.change24h,
        yt: r.ytChange, buzz: r.buzzChange, album: r.albumChange, music: r.musicChange,
        social: r.socialChange, fan: r.fanChange, fanScore: r.fanCurrent,
        prevSnapshotAt: r.prevSnapshotAt,
        weights: r.weights,
        available: r.availability,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[FES-v7] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
