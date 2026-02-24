// Fan Energy Score (FES) v2 — 리밸런싱 엔진
// Velocity (40%) + Intensity (60%), 기준값 100, 캡 250
// ktrenz_data_snapshots 테이블에서 YouTube/Buzz 데이터를 직접 읽음
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EnergyResult {
  wikiEntryId: string;
  velocity: number;
  intensity: number;
  energyScore: number;
  change24h: number;
  details: Record<string, any>;
}

const MAX_SCORE = 250;
const BASE_SCORE = 100;

function dampedScore(ratio: number, dampFactor = 60): number {
  if (ratio <= 0) return 0;
  if (ratio <= 1) return Math.max(0, Math.round(ratio * BASE_SCORE));
  const score = BASE_SCORE + Math.log2(ratio) * dampFactor;
  return Math.min(MAX_SCORE, Math.round(score));
}

function calculateVelocity(
  currentMentions: number, avgMentions: number,
  currentViews: number, avgViews: number
): number {
  let buzzVelocity = BASE_SCORE;
  if (avgMentions > 0) buzzVelocity = dampedScore(currentMentions / avgMentions);
  else if (currentMentions > 0) buzzVelocity = 160;

  let ytVelocity = BASE_SCORE;
  if (avgViews > 0 && currentViews > 0) ytVelocity = dampedScore(currentViews / avgViews);
  else if (currentViews > 0) ytVelocity = 160;

  return Math.round(buzzVelocity * 0.6 + ytVelocity * 0.4);
}

function calculateIntensity(
  buzzScore: number, avgBuzzScore: number,
  currentMentions: number, avgMentions: number, sentimentScore: number
): number {
  // buzz_score를 engagement 대용으로 사용 (가중 멘션 기반)
  let engIntensity = BASE_SCORE;
  if (avgBuzzScore > 0 && buzzScore > 0) engIntensity = dampedScore(buzzScore / avgBuzzScore);
  else if (buzzScore > 0) engIntensity = 130;

  const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
  const qualityMentions = currentMentions * sentimentMultiplier;

  let buzzIntensity = BASE_SCORE;
  if (avgMentions > 0 && qualityMentions > 0) buzzIntensity = dampedScore(qualityMentions / avgMentions);
  else if (qualityMentions > 0) buzzIntensity = 130;

  return Math.round(engIntensity * 0.5 + buzzIntensity * 0.5);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const resetBaselines = body.resetBaselines === true;
    const targetEntryId = body.wikiEntryId as string | undefined;
    const batchSize = body.batchSize ? Number(body.batchSize) : 50;
    const batchOffset = body.batchOffset ? Number(body.batchOffset) : 0;

    // ── 베이스라인 리셋 모드 ──
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

      console.log(`[calculate-energy-score] Reset ${resetCount} baselines`);
      return new Response(JSON.stringify({ success: true, message: `Reset ${resetCount} baselines` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 대상 엔트리 결정
    let entryIds: string[] = [];
    if (targetEntryId) {
      entryIds = [targetEntryId];
    } else {
      const { data: v2Scores } = await sb
        .from("v3_scores_v2")
        .select("wiki_entry_id")
        .order("total_score", { ascending: false })
        .range(batchOffset, batchOffset + batchSize - 1);
      if (v2Scores?.length) {
        entryIds = v2Scores.map((s: any) => s.wiki_entry_id);
      } else {
        const { data: scores } = await sb
          .from("v3_scores")
          .select("wiki_entry_id")
          .order("total_score", { ascending: false })
          .range(batchOffset, batchOffset + batchSize - 1);
        entryIds = (scores || []).map((s: any) => s.wiki_entry_id);
      }
    }

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: EnergyResult[] = [];

    for (const entryId of entryIds) {
      try {
        // 1) ktrenz_data_snapshots에서 최신 데이터 가져오기
        const snapData = await getLatestSnapshots(sb, entryId);

        // 2) 현재 v2 스코어 (youtube_score, buzz_score 등)
        let scoreData: any = null;
        const { data: v2Score } = await sb
          .from("v3_scores_v2")
          .select("youtube_score, buzz_score, total_score")
          .eq("wiki_entry_id", entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        scoreData = v2Score || {};

        const currentMentions = snapData.totalMentions;
        const currentViews = snapData.recentTotalViews;
        const sentimentScore = snapData.sentimentScore;
        const currentBuzzScore = snapData.buzzScore;

        // 3) 베이스라인 — v2 테이블
        let { data: baseline } = await sb
          .from("v3_energy_baselines_v2")
          .select("*")
          .eq("wiki_entry_id", entryId)
          .maybeSingle();

        const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
        const currentQualityMentions = currentMentions * sentimentMultiplier;

        if (!baseline) {
          const { data: newBaseline } = await sb.from("v3_energy_baselines_v2").insert({
            wiki_entry_id: entryId,
            avg_velocity_7d: Math.max(currentMentions, 1),
            avg_velocity_30d: Math.max(currentViews, 1),
            avg_intensity_7d: Math.max(currentBuzzScore, 1),
            avg_intensity_30d: Math.max(currentQualityMentions, 1),
            avg_energy_7d: 100, avg_energy_30d: 100,
          }).select().single();
          baseline = newBaseline;
        }

        // 4) FES 계산
        const velocity = calculateVelocity(
          currentMentions, baseline?.avg_velocity_7d || 1,
          currentViews, baseline?.avg_velocity_30d || 1
        );
        const intensity = calculateIntensity(
          currentBuzzScore, baseline?.avg_intensity_7d || 1,
          currentMentions, baseline?.avg_intensity_30d || 1,
          sentimentScore
        );
        const energyScore = Math.min(MAX_SCORE * 2, Math.round(velocity * 0.4 + intensity * 0.6));

        // 5) 24h 변화율
        const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
        const { data: prevSnapshot } = await sb
          .from("v3_energy_snapshots_v2")
          .select("energy_score")
          .eq("wiki_entry_id", entryId)
          .lt("snapshot_at", todayStart.toISOString())
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let change24h = 0;
        if (prevSnapshot && Number(prevSnapshot.energy_score) > 0) {
          change24h = ((energyScore - Number(prevSnapshot.energy_score)) / Number(prevSnapshot.energy_score)) * 100;
        }

        // 6) v2 스냅샷 저장
        await sb.from("v3_energy_snapshots_v2").insert({
          wiki_entry_id: entryId,
          velocity_score: velocity,
          intensity_score: intensity,
          energy_score: energyScore,
        });

        // 7) v2 scores upsert
        const { data: existingV2Score } = await sb
          .from("v3_scores_v2")
          .select("id")
          .eq("wiki_entry_id", entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingV2Score) {
          await sb.from("v3_scores_v2").update({
            energy_score: energyScore,
            energy_change_24h: Math.round(change24h * 10) / 10,
            youtube_score: scoreData?.youtube_score || 0,
            buzz_score: scoreData?.buzz_score || 0,
            total_score: scoreData?.total_score || 0,
            scored_at: new Date().toISOString(),
          }).eq("id", existingV2Score.id);
        } else {
          await sb.from("v3_scores_v2").insert({
            wiki_entry_id: entryId,
            energy_score: energyScore,
            energy_change_24h: Math.round(change24h * 10) / 10,
            youtube_score: scoreData?.youtube_score || 0,
            buzz_score: scoreData?.buzz_score || 0,
            total_score: scoreData?.total_score || 0,
          });
        }

        // 8) 베이스라인 갱신 (이동 평균)
        if (baseline) {
          const a7 = 0.15, a30 = 0.05;
          await sb.from("v3_energy_baselines_v2").update({
            avg_velocity_7d: Math.round(((baseline.avg_velocity_7d || 1) * (1 - a7) + currentMentions * a7) * 100) / 100,
            avg_velocity_30d: Math.round(((baseline.avg_velocity_30d || 1) * (1 - a30) + currentViews * a30) * 100) / 100,
            avg_intensity_7d: Math.round(((baseline.avg_intensity_7d || 1) * (1 - a7) + currentBuzzScore * a7) * 100) / 100,
            avg_intensity_30d: Math.round(((baseline.avg_intensity_30d || 1) * (1 - a30) + currentQualityMentions * a30) * 100) / 100,
            avg_energy_7d: Math.round(((baseline.avg_energy_7d || 100) * (1 - a7) + energyScore * a7) * 100) / 100,
            avg_energy_30d: Math.round(((baseline.avg_energy_30d || 100) * (1 - a30) + energyScore * a30) * 100) / 100,
            updated_at: new Date().toISOString(),
          }).eq("wiki_entry_id", entryId);
        }

        results.push({
          wikiEntryId: entryId, velocity, intensity, energyScore,
          change24h: Math.round(change24h * 10) / 10,
          details: { currentMentions, currentViews, currentBuzzScore, sentimentScore, sentimentMultiplier, currentQualityMentions },
        });
      } catch (e) {
        console.error(`[calculate-energy-score-v2] Error for ${entryId}:`, e);
      }
    }

    // 9) v2 energy_rank 일괄 업데이트
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      for (let i = 0; i < allV2Scores.length; i++) {
        await sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", allV2Scores[i].id);
      }
    }

    console.log(`[calculate-energy-score-v2] Processed ${results.length} entries (ktrenz_data_snapshots)`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[calculate-energy-score-v2] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
