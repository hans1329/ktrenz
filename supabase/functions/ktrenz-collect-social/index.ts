// ktrenz-collect-social: T2 파이프라인용 소셜 데이터 수집 오케스트레이터
// Instagram + TikTok 수집을 순차 호출하여 ktrenz_trend_triggers / ktrenz_social_snapshots에 저장
// 호출 방식: ktrenz-trend-cron의 collect_social phase에서 단일 호출

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
    };

    const results: Record<string, any> = {};

    // ── 1. Instagram 수집 (배치 단위로 순차 호출) ──
    console.log("[collect-social] Starting Instagram collection...");
    let igOffset = 0;
    const igBatchSize = 10;
    let igTotal = 0;
    let igKeywords = 0;
    let igBatches = 0;

    try {
      while (true) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        const igResp = await fetch(`${supabaseUrl}/functions/v1/collect-instagram-trends`, {
          method: "POST",
          headers: callHeaders,
          body: JSON.stringify({ batchSize: igBatchSize, offset: igOffset }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const igText = await igResp.text();
        let igResult: any;
        try {
          igResult = JSON.parse(igText);
        } catch {
          console.warn("[collect-social] Instagram non-JSON:", igText.slice(0, 200));
          break;
        }

        igBatches++;
        igTotal += igResult.processed || 0;
        igKeywords += igResult.keywords_saved || 0;

        console.log(`[collect-social] Instagram batch ${igBatches}: processed=${igResult.processed}, keywords=${igResult.keywords_saved}`);

        // 처리된 수가 배치 사이즈보다 작으면 마지막 배치
        if (!igResult.processed || igResult.processed < igBatchSize) break;

        igOffset += igBatchSize;

        // 안전장치: 최대 50배치 (500명)
        if (igBatches >= 50) {
          console.warn("[collect-social] Instagram max batches reached");
          break;
        }
      }

      results.instagram = { success: true, batches: igBatches, processed: igTotal, keywords: igKeywords };
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[collect-social] Instagram error: ${msg}`);
      results.instagram = { success: false, error: msg, batches: igBatches, processed: igTotal, keywords: igKeywords };
    }

    // ── 2. TikTok 수집 (단일 호출, 내부적으로 50명씩 처리) ──
    console.log("[collect-social] Starting TikTok collection...");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const ttResp = await fetch(`${supabaseUrl}/functions/v1/collect-tiktok-trends`, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify({ limit: 50 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const ttText = await ttResp.text();
      let ttResult: any;
      try {
        ttResult = JSON.parse(ttText);
      } catch {
        ttResult = { raw: ttText.slice(0, 200) };
      }

      results.tiktok = {
        success: ttResult.success || false,
        processed: ttResult.processed || 0,
        snapshots: ttResult.snapshotsInserted || 0,
        totalViews: ttResult.totalViews || 0,
      };
      console.log(`[collect-social] TikTok: processed=${ttResult.processed}, snapshots=${ttResult.snapshotsInserted}`);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[collect-social] TikTok error: ${msg}`);
      results.tiktok = { success: false, error: msg };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[collect-social] Done in ${elapsed}ms`, results);

    return new Response(
      JSON.stringify({
        success: true,
        totalCandidates: 1, // 단일 호출 phase 완료 시그널
        results,
        elapsed_ms: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[collect-social] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, totalCandidates: 1 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
