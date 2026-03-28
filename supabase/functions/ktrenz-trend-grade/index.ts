// ktrenz-trend-grade: Trend Score 산출 엣지 함수
// 공식: TrendScore = (TrendEnergy × 0.35) + (CommercialDepth × 0.50) + (Momentum × 0.15)
// Stage Gate: Commerce 미도달 시 → Energy(0.7) + Momentum(0.3), 라벨 "⚡ Emerging"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── 등급 정의 ──
const GRADE_ORDER = ["spark", "react", "spread", "intent", "commerce", "explosive"] as const;
type TrendGrade = (typeof GRADE_ORDER)[number];

// ── purchase_stage → 수치 매핑 ──
const STAGE_SCORES: Record<string, { intent: number; commerce: number }> = {
  awareness:     { intent: 0.1, commerce: 0 },
  interest:      { intent: 0.3, commerce: 0 },
  consideration: { intent: 0.6, commerce: 0.2 },
  purchase:      { intent: 0.8, commerce: 0.6 },
  review:        { intent: 1.0, commerce: 1.0 },
};

// ── 퍼센타일 랭크 계산 (카테고리 내) ──
function percentileRank(values: number[], target: number): number {
  if (values.length < 2) return 0.5; // 데이터 부족 시 중간값
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < target).length;
  const equal = sorted.filter((v) => v === target).length;
  return (below + equal * 0.5) / sorted.length;
}

// ── 기하평균 (0 포함 시 결과 0) ──
function geometricMean(values: number[]): number {
  if (values.length === 0) return 0;
  const product = values.reduce((acc, v) => acc * v, 1);
  return Math.pow(Math.max(product, 0), 1 / values.length);
}

// ── Trend Score → Grade 변환 ──
function scoreToGrade(score: number, hasCommerce: boolean): TrendGrade {
  if (!hasCommerce) {
    // Stage Gate: Commerce 미도달
    if (score >= 0.7) return "spread";
    if (score >= 0.4) return "react";
    return "spark";
  }
  if (score >= 0.90) return "explosive";
  if (score >= 0.75) return "commerce";
  if (score >= 0.55) return "intent";
  if (score >= 0.35) return "spread";
  if (score >= 0.15) return "react";
  return "spark";
}

// ── 트래킹 히스토리에서 Persistence / Velocity / Acceleration 추출 ──
interface TrackingMetrics {
  trendPersistence: number;      // 연속 추적 횟수 (interest_score > threshold)
  commercialPersistence: number; // search_volume > 0인 추적 횟수
  velocity: number;              // 최근 interest_score 변화율
  acceleration: number;          // velocity 변화율
}

function calcTrackingMetrics(
  history: { interest_score: number | null; search_volume: number | null; tracked_at: string }[],
  baselineScore: number,
): TrackingMetrics {
  const result: TrackingMetrics = {
    trendPersistence: 0,
    commercialPersistence: 0,
    velocity: 0,
    acceleration: 0,
  };

  if (!history || history.length === 0) return result;

  // 시간순 정렬
  const sorted = [...history].sort(
    (a, b) => new Date(a.tracked_at).getTime() - new Date(b.tracked_at).getTime(),
  );

  // Trend Persistence: interest_score > baseline * 0.5 인 연속 횟수 (뒤에서부터)
  const threshold = Math.max(baselineScore * 0.5, 5);
  let consecutive = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].interest_score ?? 0) > threshold) {
      consecutive++;
    } else {
      break;
    }
  }
  result.trendPersistence = consecutive;

  // Commercial Persistence: search_volume > 0 인 횟수
  result.commercialPersistence = sorted.filter((h) => (h.search_volume ?? 0) > 0).length;

  // Velocity & Acceleration (interest_score 기반)
  const scores = sorted.map((h) => h.interest_score ?? 0);
  if (scores.length >= 2) {
    const v1 = scores[scores.length - 1] - scores[scores.length - 2];
    result.velocity = v1;

    if (scores.length >= 3) {
      const v0 = scores[scores.length - 2] - scores[scores.length - 3];
      result.acceleration = v1 - v0;
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. 활성 키워드 전체 조회 ──
    const { data: activeTriggers, error: fetchErr } = await sb
      .from("ktrenz_trend_triggers")
      .select(
        "id, star_id, keyword_category, influence_index, baseline_score, peak_score, prev_api_total, trend_potential, purchase_stage, metadata, trend_grade, trend_score, detected_at, trigger_source",
      )
      .eq("status", "active")
      .neq("trigger_source", "tiktok")
      .order("detected_at", { ascending: false });

    if (fetchErr) {
      console.error("[trend-grade] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const triggers = activeTriggers || [];
    console.log(`[trend-grade] Processing ${triggers.length} active triggers`);

    if (triggers.length === 0) {
      return new Response(JSON.stringify({ success: true, totalCandidates: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. 트래킹 히스토리 일괄 조회 ──
    const triggerIds = triggers.map((t: any) => t.id);
    const allTracking: Record<string, any[]> = {};

    for (let i = 0; i < triggerIds.length; i += 500) {
      const chunk = triggerIds.slice(i, i + 500);
      const { data: trackData } = await sb
        .from("ktrenz_trend_tracking")
        .select("trigger_id, interest_score, search_volume, tracked_at")
        .in("trigger_id", chunk)
        .order("tracked_at", { ascending: true });

      for (const row of trackData || []) {
        if (!allTracking[row.trigger_id]) allTracking[row.trigger_id] = [];
        allTracking[row.trigger_id].push(row);
      }
    }

    // ── 3. 카테고리별 raw 값 수집 (퍼센타일 계산용) ──
    interface RawFactors {
      spark: number;
      react: number;
      spread: number;
      trendPersistence: number;
      intent: number;
      commerce: number;
      commercialPersistence: number;
      velocityAbs: number;
      accelerationAbs: number;
      velocity: number; // 부호 유지 (하락 판별용)
    }

    const triggerFactors = new Map<string, RawFactors>();
    const categoryRaws = new Map<string, RawFactors[]>();

    for (const trigger of triggers) {
      const meta = trigger.metadata || {};
      const history = allTracking[trigger.id] || [];
      const tracking = calcTrackingMetrics(history, trigger.baseline_score ?? 0);
      const stageScore = STAGE_SCORES[trigger.purchase_stage ?? ""] || { intent: 0, commerce: 0 };
      const sourceBreakdown = meta.source_breakdown || [];

      const raw: RawFactors = {
        spark: Math.min(trigger.influence_index ?? 0, 500), // cap at 500
        react: meta.buzz_score_normalized ?? 0,
        spread: Array.isArray(sourceBreakdown) ? sourceBreakdown.length : 0,
        trendPersistence: tracking.trendPersistence,
        intent: stageScore.intent,
        commerce: stageScore.commerce,
        commercialPersistence: tracking.commercialPersistence,
        velocityAbs: Math.abs(tracking.velocity),
        accelerationAbs: Math.abs(tracking.acceleration),
        velocity: tracking.velocity,
      };

      triggerFactors.set(trigger.id, raw);

      const cat = trigger.keyword_category || "unknown";
      if (!categoryRaws.has(cat)) categoryRaws.set(cat, []);
      categoryRaws.get(cat)!.push(raw);
    }

    // ── 4. 카테고리별 퍼센타일 벡터 생성 ──
    function buildPercentileArrays(raws: RawFactors[]) {
      return {
        spark: raws.map((r) => r.spark),
        react: raws.map((r) => r.react),
        spread: raws.map((r) => r.spread),
        trendPersistence: raws.map((r) => r.trendPersistence),
        intent: raws.map((r) => r.intent),
        commerce: raws.map((r) => r.commerce),
        commercialPersistence: raws.map((r) => r.commercialPersistence),
        velocityAbs: raws.map((r) => r.velocityAbs),
        accelerationAbs: raws.map((r) => r.accelerationAbs),
      };
    }

    const categoryPercentiles = new Map<string, ReturnType<typeof buildPercentileArrays>>();
    for (const [cat, raws] of categoryRaws) {
      categoryPercentiles.set(cat, buildPercentileArrays(raws));
    }

    // ── 5. 키워드별 Trend Score 계산 ──
    interface ScoreResult {
      trendScore: number;
      grade: TrendGrade;
      isEmerging: boolean;
      details: Record<string, number>;
    }

    const scoreResults = new Map<string, ScoreResult>();

    for (const trigger of triggers) {
      const raw = triggerFactors.get(trigger.id)!;
      const cat = trigger.keyword_category || "unknown";
      const pctArrays = categoryPercentiles.get(cat)!;

      // 퍼센타일 정규화 (0~1)
      const pSpark = percentileRank(pctArrays.spark, raw.spark);
      const pReact = percentileRank(pctArrays.react, raw.react);
      const pSpread = percentileRank(pctArrays.spread, raw.spread);
      const pTrendPersist = percentileRank(pctArrays.trendPersistence, raw.trendPersistence);
      const pIntent = percentileRank(pctArrays.intent, raw.intent);
      const pCommerce = percentileRank(pctArrays.commerce, raw.commerce);
      const pCommPersist = percentileRank(pctArrays.commercialPersistence, raw.commercialPersistence);
      const pVelocity = percentileRank(pctArrays.velocityAbs, raw.velocityAbs);
      const pAccel = percentileRank(pctArrays.accelerationAbs, raw.accelerationAbs);

      // Trend Energy = (Spark × React × Spread × Trend_Persistence)^(1/4)
      const trendEnergy = geometricMean([pSpark, pReact, pSpread, pTrendPersist]);

      // Momentum = normalized(|Velocity|) × normalized(|Acceleration|), 하락 시 0
      const momentum = raw.velocity < 0 ? 0 : pVelocity * pAccel;

      // Commerce 도달 여부 판별: raw.commerce > 0 이면 도달
      const hasCommerce = raw.commerce > 0;

      let trendScore: number;
      let isEmerging = false;

      if (hasCommerce) {
        // Commercial Depth = (Intent × Commerce × Commercial_Persistence)^(1/3)
        // Commerce=0 → 이 branch 진입 안함 (hasCommerce 체크)
        const commercialDepth = geometricMean([pIntent, pCommerce, pCommPersist]);
        trendScore = trendEnergy * 0.35 + commercialDepth * 0.50 + momentum * 0.15;
      } else {
        // Stage Gate: Commerce 미도달 → ⚡ Emerging
        trendScore = trendEnergy * 0.7 + momentum * 0.3;
        isEmerging = true;
      }

      // 0~1 범위 클램프
      trendScore = Math.max(0, Math.min(1, trendScore));

      const grade = scoreToGrade(trendScore, hasCommerce);

      scoreResults.set(trigger.id, {
        trendScore: Math.round(trendScore * 1000) / 1000,
        grade,
        isEmerging,
        details: {
          spark: Math.round(pSpark * 100) / 100,
          react: Math.round(pReact * 100) / 100,
          spread: Math.round(pSpread * 100) / 100,
          trend_persistence: Math.round(pTrendPersist * 100) / 100,
          intent: Math.round(pIntent * 100) / 100,
          commerce: Math.round(pCommerce * 100) / 100,
          commercial_persistence: Math.round(pCommPersist * 100) / 100,
          velocity: Math.round(pVelocity * 100) / 100,
          acceleration: Math.round(pAccel * 100) / 100,
          trend_energy: Math.round(trendEnergy * 1000) / 1000,
          momentum: Math.round(momentum * 1000) / 1000,
          trend_score: Math.round(trendScore * 1000) / 1000,
        },
      });
    }

    // ── 6. DB 업데이트 (등급별 배치) ──
    let updatedCount = 0;

    if (!dryRun) {
      // 개별 업데이트 (trend_score + trend_score_details 포함)
      const updates: { id: string; grade: string; score: number; details: any }[] = [];

      for (const trigger of triggers) {
        const result = scoreResults.get(trigger.id)!;
        if (
          trigger.trend_grade !== result.grade ||
          trigger.trend_score !== result.trendScore
        ) {
          updates.push({
            id: trigger.id,
            grade: result.grade,
            score: result.trendScore,
            details: result.details,
          });
        }
      }

      // 등급별로 그룹핑해서 배치 업데이트 (grade + score는 개별 처리 필요)
      for (const u of updates) {
        await sb
          .from("ktrenz_trend_triggers")
          .update({
            trend_grade: u.grade,
            trend_score: u.score,
            trend_score_details: u.details,
          })
          .eq("id", u.id);
        updatedCount++;
      }

      console.log(`[trend-grade] Updated ${updatedCount} keyword scores`);
    }

    // ── 7. 아티스트별 Star Influence Score 계산 ──
    const artistData = new Map<
      string,
      { scores: number[]; grades: Map<TrendGrade, number>; total: number }
    >();

    for (const trigger of triggers) {
      if (!trigger.star_id) continue;
      const result = scoreResults.get(trigger.id)!;

      let entry = artistData.get(trigger.star_id);
      if (!entry) {
        entry = { scores: [], grades: new Map(), total: 0 };
        artistData.set(trigger.star_id, entry);
      }
      entry.scores.push(result.trendScore);
      entry.grades.set(result.grade, (entry.grades.get(result.grade) || 0) + 1);
      entry.total++;
    }

    let artistUpsertCount = 0;

    for (const [starId, data] of artistData) {
      // Star Influence Score = (Top10 avg × 0.7 + 전체 avg × 0.3) × log(N + 1)
      const sorted = [...data.scores].sort((a, b) => b - a);
      const top10 = sorted.slice(0, 10);
      const top10Avg = top10.reduce((s, v) => s + v, 0) / (top10.length || 1);
      const allAvg = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
      const influenceScore =
        Math.round((top10Avg * 0.7 + allAvg * 0.3) * Math.log10(data.total + 1) * 1000) / 1000;

      // 최고 등급 결정
      let maxGrade: TrendGrade = "spark";
      let maxIdx = 0;
      for (const [grade] of data.grades) {
        const idx = GRADE_ORDER.indexOf(grade);
        if (idx > maxIdx) {
          maxIdx = idx;
          maxGrade = grade;
        }
      }

      const breakdown: Record<string, number> = {};
      for (const [grade, count] of data.grades) breakdown[grade] = count;

      if (!dryRun) {
        await sb.from("ktrenz_trend_artist_grades").upsert(
          {
            star_id: starId,
            grade: maxGrade,
            grade_score: Math.round(allAvg * 100), // 0~100 스케일 유지
            influence_score: influenceScore,
            keyword_count: data.total,
            grade_breakdown: breakdown,
            score_details: {
              top10_avg: Math.round(top10Avg * 1000) / 1000,
              all_avg: Math.round(allAvg * 1000) / 1000,
              keyword_count: data.total,
            },
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "star_id" },
        );
      }
      artistUpsertCount++;
    }

    console.log(`[trend-grade] Upserted ${artistUpsertCount} artist grades`);

    // ── 등급 분포 집계 ──
    const gradeDist: Record<string, number> = {};
    let emergingCount = 0;
    for (const [, result] of scoreResults) {
      gradeDist[result.grade] = (gradeDist[result.grade] || 0) + 1;
      if (result.isEmerging) emergingCount++;
    }

    const response = {
      success: true,
      dryRun,
      totalCandidates: triggers.length,
      keywordsGraded: updatedCount,
      artistsGraded: artistUpsertCount,
      emergingCount,
      gradeDistribution: gradeDist,
    };

    console.log("[trend-grade] Done:", JSON.stringify(response));
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[trend-grade] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
