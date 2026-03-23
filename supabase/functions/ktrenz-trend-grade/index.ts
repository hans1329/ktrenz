// ktrenz-trend-grade: 트렌드 등급 산출 엣지 함수
// 키워드별 등급 (Spark → React → Spread → Intent → Commerce → Explosive) + 아티스트별 집계
// 파이프라인의 postprocess 후, track 전에 실행
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── 등급 정의 (낮은 순 → 높은 순) ──
const GRADE_ORDER = ["spark", "react", "spread", "intent", "commerce", "explosive"] as const;
type TrendGrade = typeof GRADE_ORDER[number];

const GRADE_SCORE: Record<TrendGrade, number> = {
  spark: 10,
  react: 25,
  spread: 50,
  intent: 75,
  commerce: 90,
  explosive: 100,
};

// ── 키워드별 등급 산출 ──
function calculateKeywordGrade(trigger: any): TrendGrade {
  const influenceIndex = trigger.influence_index || 0;
  const purchaseStage = trigger.purchase_stage || null;
  const baselineScore = trigger.baseline_score || 0;
  const peakScore = trigger.peak_score || 0;
  const prevApiTotal = trigger.prev_api_total || 0;
  const trendPotential = trigger.trend_potential || 0;
  const metadata = trigger.metadata || {};
  const sourceBreakdown = metadata.source_breakdown || [];

  // ── Commerce: purchase_stage가 review/post_purchase ──
  if (purchaseStage === "review") {
    return "commerce";
  }

  // ── Intent: purchase_stage가 consideration/purchase ──
  if (purchaseStage === "consideration" || purchaseStage === "purchase") {
    return "intent";
  }

  // ── Explosive: 매우 높은 영향력 + 바이럴 조건 ──
  if (influenceIndex > 200 || (influenceIndex > 100 && trendPotential > 0.8)) {
    return "explosive";
  }

  // ── Spread: 중간 영향력 + 다중 소스 or 높은 버즈 ──
  // 절대 증가량 (Hot 기준)
  const absoluteGrowth = prevApiTotal - baselineScore;
  const buzzNormalized = metadata.buzz_score_normalized || 0;

  if (influenceIndex >= 50 || (absoluteGrowth > 100 && buzzNormalized > 50)) {
    return "spread";
  }

  // ── React: 검색량 상승 시작 ──
  if (influenceIndex >= 10 || absoluteGrowth > 20 || (purchaseStage === "interest")) {
    return "react";
  }

  // ── Spark: 초기 감지 (기본값) ──
  return "spark";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { batchSize = 50, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. 활성 키워드 전체 조회 ──
    const { data: activeTriggers, error: fetchErr } = await sb
      .from("ktrenz_trend_triggers")
      .select("id, star_id, influence_index, baseline_score, peak_score, prev_api_total, trend_potential, purchase_stage, metadata, trend_grade")
      .eq("status", "active")
      .order("detected_at", { ascending: false });

    if (fetchErr) {
      console.error("[trend-grade] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const triggers = activeTriggers || [];
    console.log(`[trend-grade] Processing ${triggers.length} active triggers`);

    // ── 2. 키워드별 등급 계산 및 업데이트 ──
    let updatedCount = 0;
    const gradeUpdates: { id: string; grade: TrendGrade }[] = [];

    for (const trigger of triggers) {
      const newGrade = calculateKeywordGrade(trigger);
      if (trigger.trend_grade !== newGrade) {
        gradeUpdates.push({ id: trigger.id, grade: newGrade });
      }
    }

    // 배치 업데이트 (등급별 그룹핑)
    const byGrade = new Map<string, string[]>();
    for (const u of gradeUpdates) {
      const list = byGrade.get(u.grade) || [];
      list.push(u.id);
      byGrade.set(u.grade, list);
    }

    for (const [grade, ids] of byGrade) {
      // Supabase 1000 row limit
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        await sb.from("ktrenz_trend_triggers")
          .update({ trend_grade: grade })
          .in("id", chunk);
        updatedCount += chunk.length;
      }
    }

    console.log(`[trend-grade] Updated ${updatedCount} keyword grades`);

    // ── 3. 아티스트별 등급 집계 ──
    const artistGrades = new Map<string, {
      grades: Map<TrendGrade, number>;
      maxGrade: TrendGrade;
      maxScore: number;
      total: number;
    }>();

    for (const trigger of triggers) {
      if (!trigger.star_id) continue;
      const grade = gradeUpdates.find(u => u.id === trigger.id)?.grade || trigger.trend_grade || calculateKeywordGrade(trigger);

      let entry = artistGrades.get(trigger.star_id);
      if (!entry) {
        entry = { grades: new Map(), maxGrade: "spark", maxScore: 0, total: 0 };
        artistGrades.set(trigger.star_id, entry);
      }
      entry.grades.set(grade as TrendGrade, (entry.grades.get(grade as TrendGrade) || 0) + 1);
      entry.total++;

      const score = GRADE_SCORE[grade as TrendGrade] || 0;
      if (score > entry.maxScore) {
        entry.maxScore = score;
        entry.maxGrade = grade as TrendGrade;
      }
    }

    // 아티스트 등급 upsert
    let artistUpsertCount = 0;
    for (const [starId, data] of artistGrades) {
      // 가중 평균 점수 계산
      let totalWeightedScore = 0;
      for (const [grade, count] of data.grades) {
        totalWeightedScore += GRADE_SCORE[grade] * count;
      }
      const avgScore = data.total > 0 ? Math.round(totalWeightedScore / data.total) : 0;

      // 최고 등급이 아티스트 등급 (가장 높은 키워드 기준)
      const breakdown: Record<string, number> = {};
      for (const [grade, count] of data.grades) {
        breakdown[grade] = count;
      }

      await sb.from("ktrenz_trend_artist_grades").upsert({
        star_id: starId,
        grade: data.maxGrade,
        grade_score: avgScore,
        keyword_count: data.total,
        grade_breakdown: breakdown,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "star_id" });

      artistUpsertCount++;
    }

    console.log(`[trend-grade] Upserted ${artistUpsertCount} artist grades`);

    const result = {
      success: true,
      totalCandidates: triggers.length,
      keywordsGraded: updatedCount,
      artistsGraded: artistUpsertCount,
      gradeDistribution: Object.fromEntries(byGrade.entries()),
    };

    console.log("[trend-grade] Done:", JSON.stringify(result));
    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[trend-grade] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
