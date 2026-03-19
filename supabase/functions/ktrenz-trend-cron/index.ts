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
    const { phase = "detect", batchOffset = 0, batchSize = 3 } = body;

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

    return new Response(
      JSON.stringify({
        success: false,
        paused: false,
        message: "Collection guard disabled unexpectedly",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-cron] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});