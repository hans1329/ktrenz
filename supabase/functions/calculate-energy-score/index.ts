// Fan Energy Score (FES) v2 — 리밸런싱 엔진
// Velocity (40%) + Intensity (60%), 기준값 100, 캡 250
// v2 테이블 사용: v3_energy_snapshots_v2, v3_energy_baselines_v2, v3_scores_v2
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
  currentMentions6h: number, avgMentions6h: number,
  currentViews24h: number, avgViews24h: number
): number {
  let buzzVelocity = BASE_SCORE;
  if (avgMentions6h > 0) buzzVelocity = dampedScore(currentMentions6h / avgMentions6h);
  else if (currentMentions6h > 0) buzzVelocity = 160;

  let ytVelocity = BASE_SCORE;
  if (avgViews24h > 0 && currentViews24h > 0) ytVelocity = dampedScore(currentViews24h / avgViews24h);
  else if (currentViews24h > 0) ytVelocity = 160;

  return Math.round(buzzVelocity * 0.6 + ytVelocity * 0.4);
}

function calculateIntensity(
  currentYtEngagement: number, avgYtEngagement: number,
  currentMentions: number, avgMentions: number, sentimentScore: number
): number {
  let ytIntensity = BASE_SCORE;
  if (avgYtEngagement > 0 && currentYtEngagement > 0) ytIntensity = dampedScore(currentYtEngagement / avgYtEngagement);
  else if (currentYtEngagement > 0) ytIntensity = 130;

  const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
  const qualityMentions = currentMentions * sentimentMultiplier;

  let buzzIntensity = BASE_SCORE;
  if (avgMentions > 0 && qualityMentions > 0) buzzIntensity = dampedScore(qualityMentions / avgMentions);
  else if (qualityMentions > 0) buzzIntensity = 130;

  return Math.round(ytIntensity * 0.5 + buzzIntensity * 0.5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const targetEntryId = body.wikiEntryId as string | undefined;
    const batchSize = body.batchSize ? Number(body.batchSize) : 50;
    const batchOffset = body.batchOffset ? Number(body.batchOffset) : 0;

    // 대상 엔트리 결정 — v2 테이블 우선, 폴백으로 기존 v3_scores
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
        // 폴백: 기존 테이블에서 목록만 가져옴
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
        // 1) 현재 데이터 — v2 우선, 폴백 기존
        let scoreData: any = null;
        const { data: v2Score } = await sb
          .from("v3_scores_v2")
          .select("youtube_score, buzz_score, total_score")
          .eq("wiki_entry_id", entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (v2Score) {
          scoreData = v2Score;
        } else {
          const { data: v1Score } = await sb
            .from("v3_scores")
            .select("youtube_score, buzz_score, buzz_mentions, total_score")
            .eq("wiki_entry_id", entryId)
            .order("scored_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          scoreData = v1Score;
        }

        const { data: entryData } = await sb.from("wiki_entries").select("metadata").eq("id", entryId).single();
        const meta = (entryData?.metadata as any) || {};
        const ytStats = meta.youtube_stats || {};
        const buzzStats = meta.buzz_stats || {};

        const currentMentions6h = buzzStats.mention_count || scoreData?.buzz_mentions || 0;
        const currentViews24h = ytStats.youtube_recent_total_views || 0;
        const recentVideoCount = ytStats.youtube_recent_video_count || 1;
        const currentYtEngagement = recentVideoCount > 0
          ? ((ytStats.youtube_recent_total_likes || 0) + (ytStats.youtube_recent_total_comments || 0)) / Math.max(1, ytStats.youtube_recent_total_views || 1) * 100
          : 0;
        const sentimentScore = buzzStats.sentiment_score || 50;

        // 2) 베이스라인 — v2 테이블
        let { data: baseline } = await sb
          .from("v3_energy_baselines_v2")
          .select("*")
          .eq("wiki_entry_id", entryId)
          .maybeSingle();

        const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
        const currentQualityMentions = currentMentions6h * sentimentMultiplier;

        const isFirstRun = !baseline;
        if (!baseline) {
          const { data: newBaseline } = await sb.from("v3_energy_baselines_v2").insert({
            wiki_entry_id: entryId,
            avg_velocity_7d: Math.max(currentMentions6h, 1),
            avg_velocity_30d: Math.max(currentViews24h, 1),
            avg_intensity_7d: Math.max(currentYtEngagement, 0.01),
            avg_intensity_30d: Math.max(currentQualityMentions, 1),
            avg_energy_7d: 100, avg_energy_30d: 100,
          }).select().single();
          baseline = newBaseline;
        }

        // 3) FES 계산 — 첫 실행이어도 실제 데이터로 계산
        const velocity = calculateVelocity(currentMentions6h, baseline?.avg_velocity_7d || 1, currentViews24h, baseline?.avg_velocity_30d || 1);
        const intensity = calculateIntensity(currentYtEngagement, baseline?.avg_intensity_7d || 0.01, currentMentions6h, baseline?.avg_intensity_30d || 1, sentimentScore);
        const energyScore = Math.min(MAX_SCORE * 2, Math.round(velocity * 0.4 + intensity * 0.6));

        // 4) 24h 변화율 — v2 스냅샷 기준
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

        // 5) v2 스냅샷 저장
        await sb.from("v3_energy_snapshots_v2").insert({
          wiki_entry_id: entryId,
          velocity_score: velocity,
          intensity_score: intensity,
          energy_score: energyScore,
        });

        // 6) v2 scores upsert
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

        // 7) 베이스라인 갱신 (이동 평균)
        if (baseline) {
          const a7 = 0.15, a30 = 0.05;
          await sb.from("v3_energy_baselines_v2").update({
            avg_velocity_7d: Math.round(((baseline.avg_velocity_7d || 1) * (1 - a7) + currentMentions6h * a7) * 100) / 100,
            avg_velocity_30d: Math.round(((baseline.avg_velocity_30d || 1) * (1 - a30) + currentViews24h * a30) * 100) / 100,
            avg_intensity_7d: Math.round(((baseline.avg_intensity_7d || 0.01) * (1 - a7) + currentYtEngagement * a7) * 100) / 100,
            avg_intensity_30d: Math.round(((baseline.avg_intensity_30d || 1) * (1 - a30) + currentQualityMentions * a30) * 100) / 100,
            avg_energy_7d: Math.round(((baseline.avg_energy_7d || 100) * (1 - a7) + energyScore * a7) * 100) / 100,
            avg_energy_30d: Math.round(((baseline.avg_energy_30d || 100) * (1 - a30) + energyScore * a30) * 100) / 100,
            updated_at: new Date().toISOString(),
          }).eq("wiki_entry_id", entryId);
        }

        results.push({ wikiEntryId: entryId, velocity, intensity, energyScore, change24h: Math.round(change24h * 10) / 10, details: { currentMentions6h, currentViews24h, currentYtEngagement, sentimentScore, sentimentMultiplier, currentQualityMentions } });
      } catch (e) {
        console.error(`[calculate-energy-score-v2] Error for ${entryId}:`, e);
      }
    }

    // 8) v2 energy_rank 일괄 업데이트
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      for (let i = 0; i < allV2Scores.length; i++) {
        await sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", allV2Scores[i].id);
      }
    }

    console.log(`[calculate-energy-score-v2] Processed ${results.length} entries (v2 tables)`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[calculate-energy-score-v2] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
