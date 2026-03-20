// T2 Trend Cron: detect → detect_global → detect_youtube → track 순차 오케스트레이션
// 긴급 중지 상태에서는 모든 수집/체이닝을 즉시 차단한다.
const COLLECTION_PAUSED = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { phase = "detect", batchOffset = 0, batchSize = 5 } = body;

    if (COLLECTION_PAUSED) {
      console.warn(`[trend-cron] Collection paused. Ignoring phase=${phase}, offset=${batchOffset}, size=${batchSize}`);
      return new Response(
        JSON.stringify({
          success: true,
          paused: true,
          phase,
          batchOffset,
          batchSize,
          message: "T2 trend collection is temporarily paused",
          elapsed_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // phase에 따라 적절한 함수 호출
    const phaseMap: Record<string, string> = {
      detect: "ktrenz-trend-detect",
      detect_global: "ktrenz-trend-detect-global",
      detect_youtube: "ktrenz-trend-detect-youtube",
      track: "ktrenz-trend-track",
    };

    const functionName = phaseMap[phase];
    if (!functionName) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown phase: ${phase}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trend-cron] Dispatching phase=${phase}, offset=${batchOffset}, size=${batchSize}`);

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchSize, batchOffset }),
    });

    const result = await response.json();

    console.log(`[trend-cron] phase=${phase} offset=${batchOffset} result:`, JSON.stringify(result).slice(0, 300));

    // 체이닝: 같은 phase의 다음 배치가 있으면 자동 호출
    const totalCandidates = result.totalCandidates || 0;
    const nextOffset = batchOffset + batchSize;

    if (result.success && nextOffset < totalCandidates) {
      console.log(`[trend-cron] Chaining next batch: phase=${phase}, offset=${nextOffset}`);

      // 비동기 체이닝 (응답 대기하지 않음)
      fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-cron`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phase, batchOffset: nextOffset, batchSize }),
      }).catch((e) => console.error(`[trend-cron] Chain error: ${e.message}`));

      // 체이닝 요청이 출발하도록 짧은 대기
      await new Promise((r) => setTimeout(r, 500));
    }

    // 현재 phase가 완료되고 다음 phase로 넘어가야 하는 경우
    const phaseOrder = ["detect", "detect_global", "detect_youtube", "track"];
    if (result.success && nextOffset >= totalCandidates && batchOffset === 0) {
      // 첫 번째 배치에서만 다음 phase 체이닝 (중복 방지)
      // totalCandidates가 0이면 해당 phase는 스킵
    }

    return new Response(
      JSON.stringify({
        success: true,
        phase,
        batchOffset,
        batchSize,
        totalCandidates,
        nextOffset: nextOffset < totalCandidates ? nextOffset : null,
        result,
        elapsed_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-cron] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
