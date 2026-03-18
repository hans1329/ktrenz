// T2 Trend Cron: trend-detect → trend-track 순차 오케스트레이션
// 6시간마다 실행되어 Tier 1 아티스트의 상업 키워드 감지 + 검색량 추적
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const results: any = { phase, batchOffset };

    if (phase === "detect") {
      // Step 1: trend-detect 배치 호출
      console.log(`[trend-cron] Phase: DETECT, offset=${batchOffset}, size=${batchSize}`);

      const { data: detectData, error: detectError } = await sb.functions.invoke(
        "ktrenz-trend-detect",
        { body: { batchSize, batchOffset } }
      );

      if (detectError) throw new Error(`trend-detect failed: ${detectError.message}`);

      const parsed = typeof detectData === "string" ? JSON.parse(detectData) : detectData;
      results.detect = parsed;

      const totalCandidates = parsed?.totalCandidates ?? 0;
      const nextOffset = batchOffset + batchSize;

      // 아직 처리할 아티스트가 남았으면 다음 배치 self-invoke
      if (nextOffset < totalCandidates) {
        console.log(`[trend-cron] Chaining next detect batch: offset=${nextOffset}`);
        // Self-invoke (fire-and-forget)
        sb.functions.invoke("ktrenz-trend-cron", {
          body: { phase: "detect", batchOffset: nextOffset, batchSize },
        }).catch((e: any) => console.warn(`[trend-cron] Chain invoke error: ${e.message}`));

        results.nextBatch = nextOffset;
      } else {
        // 모든 detect 완료 → track phase 시작 (배치로)
        console.log(`[trend-cron] All detect batches done. Starting track phase.`);
        sb.functions.invoke("ktrenz-trend-track", {
          body: { batchSize: 5, batchOffset: 0 },
        }).catch((e: any) => console.warn(`[trend-cron] Track invoke error: ${e.message}`));

        results.nextPhase = "track";
      }
    } else if (phase === "track") {
      // Step 2: trend-track 호출 (배치 처리, self-chain 포함)
      console.log(`[trend-cron] Phase: TRACK`);

      const { data: trackData, error: trackError } = await sb.functions.invoke(
        "ktrenz-trend-track",
        { body: { batchSize: 5, batchOffset: 0 } }
      );

      if (trackError) throw new Error(`trend-track failed: ${trackError.message}`);

      const parsed = typeof trackData === "string" ? JSON.parse(trackData) : trackData;
      results.track = parsed;

      console.log(`[trend-cron] Track complete: ${parsed?.tracked ?? 0} keyword-region pairs tracked`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[trend-cron] Done in ${elapsed}ms`);

    return new Response(
      JSON.stringify({ success: true, elapsed_ms: elapsed, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-cron] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
