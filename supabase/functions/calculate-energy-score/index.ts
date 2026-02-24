// Fan Energy Score (FES) v2 — 리밸런싱 엔진
// Velocity (40%) + Intensity (60%), 기준값 100, 캡 250
// 핵심 개선: 로그 감쇠, sentiment 가중치 조정, baseline 버그 수정
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

/**
 * 로그 감쇠 정규화: ratio가 1일 때 100, 극단적 비율에서도 250을 넘지 않음
 * ratio = current / baseline
 * 결과: 100 + log2(ratio) * dampFactor, 최소 0, 최대 250
 */
function dampedScore(ratio: number, dampFactor = 60): number {
  if (ratio <= 0) return 0;
  if (ratio <= 1) {
    // 기준 이하: 선형 감소 (ratio 0.5 → 50, ratio 0 → 0)
    return Math.max(0, Math.round(ratio * BASE_SCORE));
  }
  // 기준 이상: 로그 감쇠 (ratio 2 → 160, ratio 4 → 220, ratio 8 → 280→cap 250)
  const score = BASE_SCORE + Math.log2(ratio) * dampFactor;
  return Math.min(MAX_SCORE, Math.round(score));
}

/**
 * Velocity: 반응 속도 (멘션 속도 + 조회수 속도)
 */
function calculateVelocity(
  currentMentions6h: number,
  avgMentions6h: number,
  currentViews24h: number,
  avgViews24h: number
): number {
  // Buzz velocity
  let buzzVelocity = BASE_SCORE;
  if (avgMentions6h > 0) {
    buzzVelocity = dampedScore(currentMentions6h / avgMentions6h);
  } else if (currentMentions6h > 0) {
    buzzVelocity = 160; // baseline 없이 데이터 있으면 약간 높음
  }

  // YouTube velocity
  let ytVelocity = BASE_SCORE;
  if (avgViews24h > 0 && currentViews24h > 0) {
    ytVelocity = dampedScore(currentViews24h / avgViews24h);
  } else if (currentViews24h > 0) {
    ytVelocity = 160;
  }

  // Buzz 60%, YouTube 40%
  return Math.round(buzzVelocity * 0.6 + ytVelocity * 0.4);
}

/**
 * Intensity: 참여 깊이 (실제 참여율 기반)
 * - YouTube: (likes+comments)/views 비율 vs 평균
 * - Buzz: 멘션 품질 (멘션수 × sentiment 가중치) vs 평균
 *   sentiment는 0.7-1.3 범위의 보정 계수로만 사용
 */
function calculateIntensity(
  currentYtEngagement: number,
  avgYtEngagement: number,
  currentMentions: number,
  avgMentions: number,
  sentimentScore: number
): number {
  // YouTube engagement intensity
  let ytIntensity = BASE_SCORE;
  if (avgYtEngagement > 0 && currentYtEngagement > 0) {
    ytIntensity = dampedScore(currentYtEngagement / avgYtEngagement);
  } else if (currentYtEngagement > 0) {
    ytIntensity = 130;
  }

  // Buzz intensity: 멘션 수 기반 + sentiment 보정
  // sentiment 0-100 → multiplier 0.7-1.3
  const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
  const qualityMentions = currentMentions * sentimentMultiplier;
  const avgQualityMentions = avgMentions; // baseline은 이미 가중된 값

  let buzzIntensity = BASE_SCORE;
  if (avgQualityMentions > 0 && qualityMentions > 0) {
    buzzIntensity = dampedScore(qualityMentions / avgQualityMentions);
  } else if (qualityMentions > 0) {
    buzzIntensity = 130;
  }

  // YouTube 50%, Buzz 50%
  return Math.round(ytIntensity * 0.5 + buzzIntensity * 0.5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const targetEntryId = body.wikiEntryId as string | undefined;

    // 대상 엔트리 결정
    let entryIds: string[] = [];
    if (targetEntryId) {
      entryIds = [targetEntryId];
    } else {
      const { data: scores } = await sb
        .from("v3_scores")
        .select("wiki_entry_id")
        .order("total_score", { ascending: false })
        .limit(50);
      entryIds = (scores || []).map((s: any) => s.wiki_entry_id);
    }

    if (!entryIds.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No entries to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: EnergyResult[] = [];

    for (const entryId of entryIds) {
      try {
        // 1) 현재 데이터 가져오기
        const { data: scoreData } = await sb
          .from("v3_scores")
          .select("youtube_score, buzz_score, buzz_mentions, total_score")
          .eq("wiki_entry_id", entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .single();

        const { data: entryData } = await sb
          .from("wiki_entries")
          .select("metadata")
          .eq("id", entryId)
          .single();

        const meta = (entryData?.metadata as any) || {};
        const ytStats = meta.youtube_stats || {};
        const buzzStats = meta.buzz_stats || {};

        // 현재 값 추출
        const currentMentions6h = buzzStats.mention_count || scoreData?.buzz_mentions || 0;
        const currentViews24h = ytStats.youtube_recent_total_views || 0;
        const recentVideoCount = ytStats.youtube_recent_video_count || 1;
        const currentYtEngagement =
          recentVideoCount > 0
            ? ((ytStats.youtube_recent_total_likes || 0) +
                (ytStats.youtube_recent_total_comments || 0)) /
              Math.max(1, ytStats.youtube_recent_total_views || 1) *
              100
            : 0;
        const sentimentScore = buzzStats.sentiment_score || 50;

        // 2) 베이스라인 가져오기 (없으면 생성)
        // baseline 필드 매핑 (v2):
        //   avg_velocity_7d  → 6h 멘션 이동평균
        //   avg_velocity_30d → 24h 조회수 이동평균
        //   avg_intensity_7d → YT engagement rate 이동평균
        //   avg_intensity_30d → 멘션 품질(mentions × sentimentMult) 이동평균
        let { data: baseline } = await sb
          .from("v3_energy_baselines")
          .select("*")
          .eq("wiki_entry_id", entryId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const sentimentMultiplier = 0.7 + (sentimentScore / 100) * 0.6;
        const currentQualityMentions = currentMentions6h * sentimentMultiplier;

        const isFirstRun = !baseline;
        if (!baseline) {
          const { data: newBaseline } = await sb
            .from("v3_energy_baselines")
            .insert({
              wiki_entry_id: entryId,
              avg_velocity_7d: Math.max(currentMentions6h, 1),
              avg_velocity_30d: Math.max(currentViews24h, 1),
              avg_intensity_7d: Math.max(currentYtEngagement, 0.01),
              avg_intensity_30d: Math.max(currentQualityMentions, 1),
              avg_energy_7d: 100,
              avg_energy_30d: 100,
            })
            .select()
            .single();
          baseline = newBaseline;
        }

        // 3) FES 계산
        let velocity: number;
        let intensity: number;
        let energyScore: number;

        if (isFirstRun) {
          velocity = BASE_SCORE;
          intensity = BASE_SCORE;
          energyScore = BASE_SCORE;
        } else {
          velocity = calculateVelocity(
            currentMentions6h,
            baseline?.avg_velocity_7d || 1,
            currentViews24h,
            baseline?.avg_velocity_30d || 1
          );

          intensity = calculateIntensity(
            currentYtEngagement,
            baseline?.avg_intensity_7d || 0.01,
            currentMentions6h,
            baseline?.avg_intensity_30d || 1,
            sentimentScore
          );

          // 최종 에너지 스코어: velocity 40% + intensity 60%, 캡 적용
          energyScore = Math.min(
            MAX_SCORE * 2, // energy = vel*0.4 + int*0.6 이므로 이론적 최대 250
            Math.round(velocity * 0.4 + intensity * 0.6)
          );
        }

        // 4) 24h 변화율 (어제 마지막 스냅샷 기준)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: prevSnapshot } = await sb
          .from("v3_energy_snapshots")
          .select("energy_score")
          .eq("wiki_entry_id", entryId)
          .lt("snapshot_at", todayStart.toISOString())
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .single();

        let change24h = 0;
        if (prevSnapshot && prevSnapshot.energy_score > 0) {
          change24h =
            ((energyScore - Number(prevSnapshot.energy_score)) /
              Number(prevSnapshot.energy_score)) *
            100;
        }

        // 5) 스냅샷 저장
        await sb.from("v3_energy_snapshots").insert({
          wiki_entry_id: entryId,
          velocity_score: velocity,
          intensity_score: intensity,
          energy_score: energyScore,
          youtube_views_24h: currentViews24h,
          youtube_engagement_rate: currentYtEngagement,
          buzz_mentions_6h: currentMentions6h,
          buzz_engagement_rate: sentimentScore,
          raw_data: {
            version: "v2",
            velocity_components: { currentMentions6h, currentViews24h },
            intensity_components: {
              currentYtEngagement,
              sentimentScore,
              sentimentMultiplier,
              currentQualityMentions,
            },
            baseline_used: {
              avg_velocity_7d: baseline?.avg_velocity_7d,
              avg_velocity_30d: baseline?.avg_velocity_30d,
              avg_intensity_7d: baseline?.avg_intensity_7d,
              avg_intensity_30d: baseline?.avg_intensity_30d,
            },
          },
        });

        // 6) v3_scores 업데이트
        await sb
          .from("v3_scores")
          .update({
            energy_score: energyScore,
            energy_change_24h: Math.round(change24h * 10) / 10,
          })
          .eq("wiki_entry_id", entryId);

        // 7) 베이스라인 갱신 (이동 평균)
        if (baseline) {
          const alpha7d = 0.15;
          const alpha30d = 0.05;
          await sb
            .from("v3_energy_baselines")
            .update({
              avg_velocity_7d:
                Math.round(
                  ((baseline.avg_velocity_7d || 1) * (1 - alpha7d) +
                    currentMentions6h * alpha7d) *
                    100
                ) / 100,
              avg_velocity_30d:
                Math.round(
                  ((baseline.avg_velocity_30d || 1) * (1 - alpha30d) +
                    currentViews24h * alpha30d) *
                    100
                ) / 100,
              avg_intensity_7d:
                Math.round(
                  ((baseline.avg_intensity_7d || 0.01) * (1 - alpha7d) +
                    currentYtEngagement * alpha7d) *
                    100
                ) / 100,
              // 버그 수정: buzzEngagement(qualityMentions) 저장
              avg_intensity_30d:
                Math.round(
                  ((baseline.avg_intensity_30d || 1) * (1 - alpha30d) +
                    currentQualityMentions * alpha30d) *
                    100
                ) / 100,
              avg_energy_7d:
                Math.round(
                  ((baseline.avg_energy_7d || 100) * (1 - alpha7d) +
                    energyScore * alpha7d) *
                    100
                ) / 100,
              avg_energy_30d:
                Math.round(
                  ((baseline.avg_energy_30d || 100) * (1 - alpha30d) +
                    energyScore * alpha30d) *
                    100
                ) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("wiki_entry_id", entryId);
        }

        results.push({
          wikiEntryId: entryId,
          velocity,
          intensity,
          energyScore,
          change24h: Math.round(change24h * 10) / 10,
          details: {
            currentMentions6h,
            currentViews24h,
            currentYtEngagement,
            sentimentScore,
            sentimentMultiplier,
            currentQualityMentions,
          },
        });
      } catch (e) {
        console.error(`[calculate-energy-score-v2] Error for ${entryId}:`, e);
      }
    }

    // 8) energy_rank 일괄 업데이트
    const { data: allScores } = await sb
      .from("v3_scores")
      .select("wiki_entry_id, energy_score")
      .order("energy_score", { ascending: false });

    if (allScores) {
      for (let i = 0; i < allScores.length; i++) {
        await sb
          .from("v3_scores")
          .update({ energy_rank: i + 1 })
          .eq("wiki_entry_id", allScores[i].wiki_entry_id);
      }
    }

    console.log(
      `[calculate-energy-score-v2] Processed ${results.length} entries`
    );

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[calculate-energy-score-v2] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
