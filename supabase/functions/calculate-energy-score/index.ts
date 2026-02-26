// Fan Energy Score (FES) v3 — 상대 랭킹 기반 엔진
// 자기 자신 대비 비교(baseline ratio)가 아닌, 전체 아티스트 간 percentile 기반 점수
// 데이터가 비슷해도 아티스트 간 차이로 점수가 차별화됨
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SCORE = 250;
const BASE_SCORE = 100;

/**
 * Percentile-based score: 순위 기반으로 0~250 점수 부여
 * 1등 = 250, 꼴찌 = 20, 중간 = 100
 */
function percentileScore(rank: number, total: number): number {
  if (total <= 1) return BASE_SCORE;
  // percentile: 1.0 (1등) ~ 0.0 (꼴찌)
  const pct = 1 - (rank - 1) / (total - 1);
  // 선형 매핑: 0% → 20, 50% → 100, 100% → 250
  const score = 20 + pct * (MAX_SCORE - 20);
  return Math.round(score);
}

/**
 * 변화율 기반 보너스: 이전 대비 변화가 클수록 추가 점수
 * ratio > 1이면 보너스, < 1이면 감점
 */
function changeBonus(current: number, baseline: number): number {
  if (baseline <= 0) return current > 0 ? 15 : 0;
  const ratio = current / baseline;
  if (ratio <= 0.5) return -20;
  if (ratio <= 0.8) return -10;
  if (ratio <= 1.2) return 0;
  if (ratio <= 1.5) return 10;
  if (ratio <= 2.0) return 20;
  return 30; // 2x 이상 급등
}

/** ktrenz_data_snapshots에서 최신 데이터를 가져오는 헬퍼 */
async function getLatestSnapshots(sb: any, entryId: string) {
  const [buzzRes, ytRes] = await Promise.all([
    sb.from("ktrenz_data_snapshots")
      .select("metrics")
      .eq("wiki_entry_id", entryId)
      .eq("platform", "buzz_multi")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("ktrenz_data_snapshots")
      .select("metrics")
      .eq("wiki_entry_id", entryId)
      .eq("platform", "youtube")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const buzzMetrics = (buzzRes.data?.metrics as any) || {};
  const ytMetrics = (ytRes.data?.metrics as any) || {};

  return {
    totalMentions: buzzMetrics.total_mentions || 0,
    sentimentScore: buzzMetrics.sentiment_score || 50,
    buzzScore: buzzMetrics.buzz_score || 0,
    recentTotalViews: ytMetrics.recentTotalViews || 0,
  };
}

interface ArtistData {
  entryId: string;
  totalMentions: number;
  sentimentScore: number;
  buzzScore: number;
  recentTotalViews: number;
  qualityMentions: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const resetBaselines = body.resetBaselines === true;

    // ── 베이스라인 리셋 모드 (병렬 처리) ──
    if (resetBaselines) {
      const { data: allBaselines } = await sb
        .from("v3_energy_baselines_v2")
        .select("wiki_entry_id");
      
      const eids = (allBaselines || []).map((r: any) => r.wiki_entry_id);
      console.log(`[FES-v3] Resetting ${eids.length} baselines...`);

      // 모든 스냅샷을 병렬로 가져오기
      const snapResults = await Promise.all(
        eids.map((eid: string) => getLatestSnapshots(sb, eid).then(snap => ({ eid, snap })))
      );

      // 모든 업데이트를 병렬로 실행
      await Promise.all(
        snapResults.map(({ eid, snap }) => {
          const sentMul = 0.7 + (snap.sentimentScore / 100) * 0.6;
          const qualityMentions = snap.totalMentions * sentMul;
          return sb.from("v3_energy_baselines_v2").update({
            avg_velocity_7d: Math.max(snap.totalMentions, 1),
            avg_velocity_30d: Math.max(snap.recentTotalViews, 1),
            avg_intensity_7d: Math.max(snap.buzzScore, 1),
            avg_intensity_30d: Math.max(qualityMentions, 1),
            avg_energy_7d: 100,
            avg_energy_30d: 100,
            updated_at: new Date().toISOString(),
          }).eq("wiki_entry_id", eid);
        })
      );

      console.log(`[FES-v3] Reset ${eids.length} baselines`);
      return new Response(JSON.stringify({ success: true, message: `Reset ${eids.length} baselines` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 1) 1군(tier=1) 아티스트만 에너지 스코어 계산 ──
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean));

    const { data: v2Scores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score")
      .order("total_score", { ascending: false })
      .limit(100);

    let allEntryIds: string[] = [];
    if (v2Scores?.length) {
      const seen = new Set<string>();
      for (const s of v2Scores) {
        if (!seen.has(s.wiki_entry_id) && tier1Ids.has(s.wiki_entry_id)) {
          seen.add(s.wiki_entry_id);
          allEntryIds.push(s.wiki_entry_id);
        }
      }
    }

    // Tier 1 전체를 대상으로 계산 (슬라이싱 없음)
    const entryIds = allEntryIds;

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2) 모든 아티스트 데이터 병렬 수집 ──
    console.log(`[FES-v3] Fetching data for ${entryIds.length} artists...`);
    const snapResults = await Promise.all(
      entryIds.map(entryId => getLatestSnapshots(sb, entryId).then(snap => ({ entryId, snap })))
    );
    const allArtists: ArtistData[] = snapResults.map(({ entryId, snap }) => {
      const sentMul = 0.7 + (snap.sentimentScore / 100) * 0.6;
      return {
        entryId,
        totalMentions: snap.totalMentions,
        sentimentScore: snap.sentimentScore,
        buzzScore: snap.buzzScore,
        recentTotalViews: snap.recentTotalViews,
        qualityMentions: snap.totalMentions * sentMul,
      };
    });
    console.log(`[FES-v3] Data collected for ${allArtists.length} artists`);

    // ── 3) 각 메트릭별 랭킹 계산 (내림차순, 높을수록 1등) ──
    const total = allArtists.length;

    function rankBy(arr: ArtistData[], key: keyof ArtistData): Map<string, number> {
      const sorted = [...arr].sort((a, b) => (b[key] as number) - (a[key] as number));
      const rankMap = new Map<string, number>();
      sorted.forEach((item, idx) => rankMap.set(item.entryId, idx + 1));
      return rankMap;
    }

    const mentionsRank = rankBy(allArtists, "totalMentions");
    const viewsRank = rankBy(allArtists, "recentTotalViews");
    const buzzScoreRank = rankBy(allArtists, "buzzScore");
    const qualityMentionsRank = rankBy(allArtists, "qualityMentions");

    // ── 3.5) 변화율 기반 ChangeScore 계산을 위한 베이스라인 일괄 조회 ──
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) {
      baselineMap.set(b.wiki_entry_id, b);
    }

    // 각 아티스트의 변화율(change ratio) 계산
    const changeRatios: { entryId: string; ratio: number }[] = [];
    for (const artist of allArtists) {
      const baseline = baselineMap.get(artist.entryId);
      if (baseline) {
        const mentionRatio = (baseline.avg_velocity_7d || 1) > 0
          ? artist.totalMentions / (baseline.avg_velocity_7d || 1) : 1;
        const viewRatio = (baseline.avg_velocity_30d || 1) > 0
          ? artist.recentTotalViews / (baseline.avg_velocity_30d || 1) : 1;
        const buzzRatio = (baseline.avg_intensity_7d || 1) > 0
          ? artist.buzzScore / (baseline.avg_intensity_7d || 1) : 1;
        // 가중 평균 변화율
        const avgRatio = mentionRatio * 0.4 + viewRatio * 0.3 + buzzRatio * 0.3;
        changeRatios.push({ entryId: artist.entryId, ratio: avgRatio });
      } else {
        changeRatios.push({ entryId: artist.entryId, ratio: 1.0 }); // 베이스라인 없으면 중립
      }
    }

    // 변화율 percentile 랭킹
    const sortedByChange = [...changeRatios].sort((a, b) => b.ratio - a.ratio);
    const changeRankMap = new Map<string, number>();
    sortedByChange.forEach((item, idx) => changeRankMap.set(item.entryId, idx + 1));

    // ── 4) 각 아티스트 FES 계산 (변화율 중심 공식) ──
    const results: any[] = [];

    // 모든 아티스트의 24h 이전 스냅샷을 병렬 조회
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const prevSnapshotResults = await Promise.all(
      allArtists.map(artist =>
        sb.from("v3_energy_snapshots_v2")
          .select("energy_score")
          .eq("wiki_entry_id", artist.entryId)
          .lt("snapshot_at", todayStart.toISOString())
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: any) => ({ entryId: artist.entryId, data: r.data }))
      )
    );
    const prevSnapshotMap = new Map<string, any>();
    for (const r of prevSnapshotResults) prevSnapshotMap.set(r.entryId, r.data);

    // 기존 v2 scores를 병렬 조회
    const existingScoreResults = await Promise.all(
      allArtists.map(artist =>
        sb.from("v3_scores_v2")
          .select("id, youtube_score, buzz_score, total_score")
          .eq("wiki_entry_id", artist.entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: any) => ({ entryId: artist.entryId, data: r.data }))
      )
    );
    const existingScoreMap = new Map<string, any>();
    for (const r of existingScoreResults) existingScoreMap.set(r.entryId, r.data);

    console.log(`[FES-v3] Pre-fetched prev snapshots & existing scores`);

    // 각 아티스트 점수 계산 (CPU only, no DB calls)
    for (const artist of allArtists) {
      try {
        const mentionPct = percentileScore(mentionsRank.get(artist.entryId)!, total);
        const viewPct = percentileScore(viewsRank.get(artist.entryId)!, total);
        const velocity = Math.round(mentionPct * 0.6 + viewPct * 0.4);

        const buzzPct = percentileScore(buzzScoreRank.get(artist.entryId)!, total);
        const qualPct = percentileScore(qualityMentionsRank.get(artist.entryId)!, total);
        const intensity = Math.round(buzzPct * 0.5 + qualPct * 0.5);

        const changePct = percentileScore(changeRankMap.get(artist.entryId)!, total);

        const baseline = baselineMap.get(artist.entryId);
        let bonus = 0;
        if (baseline) {
          const mentionChange = changeBonus(artist.totalMentions, baseline.avg_velocity_7d || 1);
          const viewChange = changeBonus(artist.recentTotalViews, baseline.avg_velocity_30d || 1);
          const buzzChange = changeBonus(artist.buzzScore, baseline.avg_intensity_7d || 1);
          bonus = Math.round((mentionChange * 0.4 + viewChange * 0.3 + buzzChange * 0.3));
          bonus = Math.max(-40, Math.min(40, bonus));
        }

        let energyScore = Math.round(velocity * 0.2 + intensity * 0.2 + changePct * 0.6) + bonus;
        energyScore = Math.max(10, Math.min(MAX_SCORE, energyScore));

        const prevSnapshot = prevSnapshotMap.get(artist.entryId);
        let change24h = 0;
        if (prevSnapshot && Number(prevSnapshot.energy_score) > 0) {
          change24h = ((energyScore - Number(prevSnapshot.energy_score)) / Number(prevSnapshot.energy_score)) * 100;
        }

        results.push({
          wikiEntryId: artist.entryId,
          velocity, intensity, energyScore, bonus,
          change24h: Math.round(change24h * 10) / 10,
          existingScore: existingScoreMap.get(artist.entryId),
          baseline,
        });
      } catch (e) {
        console.error(`[FES-v3] Error calculating ${artist.entryId}:`, e);
      }
    }

    // 모든 DB 쓰기를 병렬로 실행
    console.log(`[FES-v3] Writing ${results.length} results...`);
    const writeOps: Promise<any>[] = [];
    for (const r of results) {
      // 스냅샷 저장
      writeOps.push(sb.from("v3_energy_snapshots_v2").insert({
        wiki_entry_id: r.wikiEntryId,
        velocity_score: r.velocity,
        intensity_score: r.intensity,
        energy_score: r.energyScore,
      }));

      // v2 scores upsert
      if (r.existingScore) {
        writeOps.push(sb.from("v3_scores_v2").update({
          energy_score: r.energyScore,
          energy_change_24h: r.change24h,
          scored_at: new Date().toISOString(),
        }).eq("id", r.existingScore.id));
      } else {
        writeOps.push(sb.from("v3_scores_v2").insert({
          wiki_entry_id: r.wikiEntryId,
          energy_score: r.energyScore,
          energy_change_24h: r.change24h,
          youtube_score: 0, buzz_score: 0, total_score: 0,
        }));
      }

      // 베이스라인 EMA 갱신
      if (r.baseline) {
        const artist = allArtists.find(a => a.entryId === r.wikiEntryId)!;
        const a7 = 0.15, a30 = 0.05;
        writeOps.push(sb.from("v3_energy_baselines_v2").update({
          avg_velocity_7d: Math.round(((r.baseline.avg_velocity_7d || 1) * (1 - a7) + artist.totalMentions * a7) * 100) / 100,
          avg_velocity_30d: Math.round(((r.baseline.avg_velocity_30d || 1) * (1 - a30) + artist.recentTotalViews * a30) * 100) / 100,
          avg_intensity_7d: Math.round(((r.baseline.avg_intensity_7d || 1) * (1 - a7) + artist.buzzScore * a7) * 100) / 100,
          avg_intensity_30d: Math.round(((r.baseline.avg_intensity_30d || 1) * (1 - a30) + artist.qualityMentions * a30) * 100) / 100,
          avg_energy_7d: Math.round(((r.baseline.avg_energy_7d || 100) * (1 - a7) + r.energyScore * a7) * 100) / 100,
          avg_energy_30d: Math.round(((r.baseline.avg_energy_30d || 100) * (1 - a30) + r.energyScore * a30) * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", r.wikiEntryId));
      }
    }
    await Promise.all(writeOps);
    console.log(`[FES-v3] All writes completed`);

    // ── 5) energy_rank 일괄 업데이트 (한번에) ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score, total_score, buzz_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      const updates = allV2Scores.map((s: any, i: number) => 
        sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id)
      );
      await Promise.all(updates);
    }

    // ── 6) 마일스톤 자동 감지 ──
    try {
      // total_score 기준 랭킹 (tier1만)
      const totalScoreRanked = [...(allV2Scores || [])]
        .filter((s: any) => tier1Ids.has(s.wiki_entry_id))
        .sort((a: any, b: any) => (b.total_score || 0) - (a.total_score || 0));
      
      const today = new Date().toISOString().slice(0, 10);
      const milestoneInserts: any[] = [];

      for (let i = 0; i < totalScoreRanked.length; i++) {
        const s = totalScoreRanked[i];
        const rank = i + 1;

        // Top 1 랭킹
        if (rank === 1) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top1_ranking",
            milestone_date: today,
            value: s.total_score || 0,
            metadata: { rank: 1 },
          });
        }
        // Top 3 랭킹
        if (rank <= 3) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top3_ranking",
            milestone_date: today,
            value: rank,
            metadata: { total_score: s.total_score || 0 },
          });
        }
      }

      // Tier 1 진입 감지 — 현재 tier1이지만 어제는 아니었던 경우
      const { data: yesterdayTiers } = await sb
        .from("v3_artist_milestones")
        .select("wiki_entry_id")
        .eq("milestone_type", "tier1_entry")
        .gte("milestone_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
      const recentTier1Set = new Set((yesterdayTiers || []).map((t: any) => t.wiki_entry_id));

      for (const eid of tier1Ids) {
        if (!recentTier1Set.has(eid)) {
          // 첫 Tier 1 기록 or 7일 이내 기록 없음 → 신규 진입으로 기록
          const { data: anyPrev } = await sb
            .from("v3_artist_milestones")
            .select("id")
            .eq("wiki_entry_id", eid)
            .eq("milestone_type", "tier1_entry")
            .limit(1)
            .maybeSingle();
          if (!anyPrev) {
            milestoneInserts.push({
              wiki_entry_id: eid,
              milestone_type: "tier1_entry",
              milestone_date: today,
              value: null,
            });
          }
        }
      }

      // 최고 에너지 / 최고 버즈 감지
      for (const s of (allV2Scores || []).filter((x: any) => tier1Ids.has(x.wiki_entry_id))) {
        // 최고 에너지
        if (s.energy_score > 0) {
          const { data: prevMax } = await sb
            .from("v3_artist_milestones")
            .select("value")
            .eq("wiki_entry_id", s.wiki_entry_id)
            .eq("milestone_type", "highest_energy")
            .order("value", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!prevMax || s.energy_score > Number(prevMax.value)) {
            milestoneInserts.push({
              wiki_entry_id: s.wiki_entry_id,
              milestone_type: "highest_energy",
              milestone_date: today,
              value: s.energy_score,
            });
          }
        }
        // 최고 버즈
        if (s.buzz_score > 0) {
          const { data: prevMaxBuzz } = await sb
            .from("v3_artist_milestones")
            .select("value")
            .eq("wiki_entry_id", s.wiki_entry_id)
            .eq("milestone_type", "highest_buzz")
            .order("value", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!prevMaxBuzz || s.buzz_score > Number(prevMaxBuzz.value)) {
            milestoneInserts.push({
              wiki_entry_id: s.wiki_entry_id,
              milestone_type: "highest_buzz",
              milestone_date: today,
              value: s.buzz_score,
            });
          }
        }
      }

      // 일괄 upsert (UNIQUE 제약조건으로 중복 방지)
      if (milestoneInserts.length > 0) {
        const { error: msErr } = await sb
          .from("v3_artist_milestones")
          .upsert(milestoneInserts, { onConflict: "wiki_entry_id,milestone_type,milestone_date" });
        if (msErr) console.warn("[FES-v3] Milestone insert warning:", msErr.message);
        else console.log(`[FES-v3] Recorded ${milestoneInserts.length} milestones`);
      }
    } catch (msError) {
      console.warn("[FES-v3] Milestone detection error (non-fatal):", msError);
    }

    console.log(`[FES-v3] Processed ${results.length} entries (percentile-based)`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[FES-v3] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
