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
    const batchSize = body.batchSize ? Number(body.batchSize) : 30;
    const batchOffset = body.batchOffset ? Number(body.batchOffset) : 0;

    // ── 베이스라인 리셋 모드 (기존 호환) ──
    if (resetBaselines) {
      const { data: allBaselines } = await sb
        .from("v3_energy_baselines_v2")
        .select("wiki_entry_id");
      
      let resetCount = 0;
      for (const row of (allBaselines || [])) {
        const eid = row.wiki_entry_id;
        const snapData = await getLatestSnapshots(sb, eid);
        const sentMul = 0.7 + (snapData.sentimentScore / 100) * 0.6;
        const qualityMentions = snapData.totalMentions * sentMul;

        await sb.from("v3_energy_baselines_v2").update({
          avg_velocity_7d: Math.max(snapData.totalMentions, 1),
          avg_velocity_30d: Math.max(snapData.recentTotalViews, 1),
          avg_intensity_7d: Math.max(snapData.buzzScore, 1),
          avg_intensity_30d: Math.max(qualityMentions, 1),
          avg_energy_7d: 100,
          avg_energy_30d: 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", eid);
        resetCount++;
      }

      console.log(`[FES-v3] Reset ${resetCount} baselines`);
      return new Response(JSON.stringify({ success: true, message: `Reset ${resetCount} baselines` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 1) 모든 대상 엔트리 수집 ──
    const { data: v2Scores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score")
      .order("total_score", { ascending: false })
      .limit(60);

    let allEntryIds: string[] = [];
    if (v2Scores?.length) {
      const seen = new Set<string>();
      for (const s of v2Scores) {
        if (!seen.has(s.wiki_entry_id)) {
          seen.add(s.wiki_entry_id);
          allEntryIds.push(s.wiki_entry_id);
        }
      }
    }

    // 배치 슬라이싱
    const entryIds = allEntryIds.slice(batchOffset, batchOffset + batchSize);

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2) 모든 아티스트 데이터 한번에 수집 ──
    const allArtists: ArtistData[] = [];
    for (const entryId of entryIds) {
      const snap = await getLatestSnapshots(sb, entryId);
      const sentMul = 0.7 + (snap.sentimentScore / 100) * 0.6;
      allArtists.push({
        entryId,
        totalMentions: snap.totalMentions,
        sentimentScore: snap.sentimentScore,
        buzzScore: snap.buzzScore,
        recentTotalViews: snap.recentTotalViews,
        qualityMentions: snap.totalMentions * sentMul,
      });
    }

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

    // ── 4) 각 아티스트 FES 계산 ──
    const results: any[] = [];

    for (const artist of allArtists) {
      try {
        // Velocity: 멘션 랭킹(60%) + 조회수 랭킹(40%)
        const mentionPct = percentileScore(mentionsRank.get(artist.entryId)!, total);
        const viewPct = percentileScore(viewsRank.get(artist.entryId)!, total);
        const velocity = Math.round(mentionPct * 0.6 + viewPct * 0.4);

        // Intensity: 버즈스코어 랭킹(50%) + 퀄리티멘션 랭킹(50%)
        const buzzPct = percentileScore(buzzScoreRank.get(artist.entryId)!, total);
        const qualPct = percentileScore(qualityMentionsRank.get(artist.entryId)!, total);
        const intensity = Math.round(buzzPct * 0.5 + qualPct * 0.5);

        // 베이스라인 대비 변화 보너스
        let { data: baseline } = await sb
          .from("v3_energy_baselines_v2")
          .select("*")
          .eq("wiki_entry_id", artist.entryId)
          .maybeSingle();

        let bonus = 0;
        if (baseline) {
          const mentionChange = changeBonus(artist.totalMentions, baseline.avg_velocity_7d || 1);
          const viewChange = changeBonus(artist.recentTotalViews, baseline.avg_velocity_30d || 1);
          const buzzChange = changeBonus(artist.buzzScore, baseline.avg_intensity_7d || 1);
          bonus = Math.round((mentionChange * 0.4 + viewChange * 0.3 + buzzChange * 0.3));
        }

        // Energy = Velocity(40%) + Intensity(60%) + 변화 보너스
        let energyScore = Math.round(velocity * 0.4 + intensity * 0.6) + bonus;
        energyScore = Math.max(10, Math.min(MAX_SCORE, energyScore));

        // 24h 변화율
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        const { data: prevSnapshot } = await sb
          .from("v3_energy_snapshots_v2")
          .select("energy_score")
          .eq("wiki_entry_id", artist.entryId)
          .lt("snapshot_at", todayStart.toISOString())
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let change24h = 0;
        if (prevSnapshot && Number(prevSnapshot.energy_score) > 0) {
          change24h = ((energyScore - Number(prevSnapshot.energy_score)) / Number(prevSnapshot.energy_score)) * 100;
        }

        // 스냅샷 저장
        await sb.from("v3_energy_snapshots_v2").insert({
          wiki_entry_id: artist.entryId,
          velocity_score: velocity,
          intensity_score: intensity,
          energy_score: energyScore,
        });

        // v2 scores upsert
        const { data: existingV2Score } = await sb
          .from("v3_scores_v2")
          .select("id, youtube_score, buzz_score, total_score")
          .eq("wiki_entry_id", artist.entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingV2Score) {
          await sb.from("v3_scores_v2").update({
            energy_score: energyScore,
            energy_change_24h: Math.round(change24h * 10) / 10,
            scored_at: new Date().toISOString(),
          }).eq("id", existingV2Score.id);
        } else {
          await sb.from("v3_scores_v2").insert({
            wiki_entry_id: artist.entryId,
            energy_score: energyScore,
            energy_change_24h: Math.round(change24h * 10) / 10,
            youtube_score: 0,
            buzz_score: 0,
            total_score: 0,
          });
        }

        // 베이스라인 EMA 갱신
        if (baseline) {
          const a7 = 0.15, a30 = 0.05;
          await sb.from("v3_energy_baselines_v2").update({
            avg_velocity_7d: Math.round(((baseline.avg_velocity_7d || 1) * (1 - a7) + artist.totalMentions * a7) * 100) / 100,
            avg_velocity_30d: Math.round(((baseline.avg_velocity_30d || 1) * (1 - a30) + artist.recentTotalViews * a30) * 100) / 100,
            avg_intensity_7d: Math.round(((baseline.avg_intensity_7d || 1) * (1 - a7) + artist.buzzScore * a7) * 100) / 100,
            avg_intensity_30d: Math.round(((baseline.avg_intensity_30d || 1) * (1 - a30) + artist.qualityMentions * a30) * 100) / 100,
            avg_energy_7d: Math.round(((baseline.avg_energy_7d || 100) * (1 - a7) + energyScore * a7) * 100) / 100,
            avg_energy_30d: Math.round(((baseline.avg_energy_30d || 100) * (1 - a30) + energyScore * a30) * 100) / 100,
            updated_at: new Date().toISOString(),
          }).eq("wiki_entry_id", artist.entryId);
        } else {
          await sb.from("v3_energy_baselines_v2").insert({
            wiki_entry_id: artist.entryId,
            avg_velocity_7d: Math.max(artist.totalMentions, 1),
            avg_velocity_30d: Math.max(artist.recentTotalViews, 1),
            avg_intensity_7d: Math.max(artist.buzzScore, 1),
            avg_intensity_30d: Math.max(artist.qualityMentions, 1),
            avg_energy_7d: energyScore,
            avg_energy_30d: energyScore,
          });
        }

        results.push({
          wikiEntryId: artist.entryId,
          velocity, intensity, energyScore, bonus,
          change24h: Math.round(change24h * 10) / 10,
          ranks: {
            mentions: mentionsRank.get(artist.entryId),
            views: viewsRank.get(artist.entryId),
            buzz: buzzScoreRank.get(artist.entryId),
            quality: qualityMentionsRank.get(artist.entryId),
          },
        });
      } catch (e) {
        console.error(`[FES-v3] Error for ${artist.entryId}:`, e);
      }
    }

    // ── 5) energy_rank 일괄 업데이트 (한번에) ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      // 배치로 처리 (1-by-1 대신)
      const updates = allV2Scores.map((s: any, i: number) => 
        sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id)
      );
      await Promise.all(updates);
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
