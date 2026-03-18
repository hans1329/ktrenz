// T2 Trend Cron: detect → detect_global → track 순차 오케스트레이션
// detect 완료 후 detect_global 시작, 그 후 track 시작
// throttle 감지 시 체이닝 중단
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
    const { phase = "detect", batchOffset = 0, batchSize = 10 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const results: any = { phase, batchOffset };

    if (phase === "detect") {
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

      if (nextOffset < totalCandidates) {
        // 아직 detect할 아티스트 남음 → 다음 detect 배치 체이닝
        console.log(`[trend-cron] Chaining next detect batch: offset=${nextOffset}`);
        await new Promise((r) => setTimeout(r, 5000));
        sb.functions.invoke("ktrenz-trend-cron", {
          body: { phase: "detect", batchOffset: nextOffset, batchSize },
        }).catch((e: any) => console.warn(`[trend-cron] Chain error: ${e.message}`));
        results.nextBatch = nextOffset;
      } else {
        // 모든 detect 완료 → detect_global phase 시작
        console.log(`[trend-cron] All detect done (${totalCandidates} artists). Starting detect_global phase after 10s delay.`);
        await new Promise((r) => setTimeout(r, 10000));
        sb.functions.invoke("ktrenz-trend-cron", {
          body: { phase: "detect_global", batchOffset: 0, batchSize },
        }).catch((e: any) => console.warn(`[trend-cron] detect_global invoke error: ${e.message}`));
        results.nextPhase = "detect_global";
      }
    } else if (phase === "detect_global") {
      console.log(`[trend-cron] Phase: DETECT_GLOBAL, offset=${batchOffset}, size=${batchSize}`);

      const { data: globalData, error: globalError } = await sb.functions.invoke(
        "ktrenz-trend-detect-global",
        { body: { batchSize, batchOffset } }
      );

      if (globalError) throw new Error(`trend-detect-global failed: ${globalError.message}`);

      const parsed = typeof globalData === "string" ? JSON.parse(globalData) : globalData;
      results.detect_global = parsed;

      const totalCandidates = parsed?.totalCandidates ?? 0;
      const nextOffset = batchOffset + batchSize;

      if (nextOffset < totalCandidates) {
        // 아직 detect_global할 아티스트 남음
        console.log(`[trend-cron] Chaining next detect_global batch: offset=${nextOffset}`);
        await new Promise((r) => setTimeout(r, 5000));
        sb.functions.invoke("ktrenz-trend-cron", {
          body: { phase: "detect_global", batchOffset: nextOffset, batchSize },
        }).catch((e: any) => console.warn(`[trend-cron] Chain error: ${e.message}`));
        results.nextBatch = nextOffset;
      } else {
        // 모든 detect_global 완료 → track phase 시작
        console.log(`[trend-cron] All detect_global done. Starting track phase after 10s delay.`);
        await new Promise((r) => setTimeout(r, 10000));
        sb.functions.invoke("ktrenz-trend-track", {
          body: { batchSize: 5, batchOffset: 0, regions: ["worldwide"] },
        }).catch((e: any) => console.warn(`[trend-cron] Track invoke error: ${e.message}`));
        results.nextPhase = "track";
      }
    } else if (phase === "track") {
      // 직접 track 호출 (수동 트리거용)
      console.log(`[trend-cron] Phase: TRACK (manual)`);

      const { data: trackData, error: trackError } = await sb.functions.invoke(
        "ktrenz-trend-track",
        { body: { batchSize: 5, batchOffset: 0, regions: ["worldwide"] } }
      );

      if (trackError) throw new Error(`trend-track failed: ${trackError.message}`);

      const parsed = typeof trackData === "string" ? JSON.parse(trackData) : trackData;
      results.track = parsed;

      if (parsed?.throttled) {
        console.warn(`[trend-cron] Track was throttled. No further chaining.`);
      } else {
        console.log(`[trend-cron] Track complete: ${parsed?.tracked ?? 0} keyword-region pairs`);
      }
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
