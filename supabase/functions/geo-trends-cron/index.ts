// geo-trends-cron: 1일 1회 Google Trends 수집 → 변동률 감지 체이닝
// collect-geo-trends (SerpAPI) → detect-geo-changes 순차 실행
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const wiki_entry_id: string | undefined = body.wiki_entry_id;

    console.log("[geo-trends-cron] Starting: collect-geo-trends → detect-geo-changes");

    // Step 1: collect-geo-trends (SerpAPI Google Trends)
    const collectResp = await fetch(`${supabaseUrl}/functions/v1/collect-geo-trends`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(wiki_entry_id ? { wiki_entry_id } : {}),
    });

    const collectText = await collectResp.text();
    let collectResult: any;
    try { collectResult = JSON.parse(collectText); } catch { collectResult = { raw: collectText.slice(0, 300) }; }

    if (!collectResp.ok) {
      console.error("[geo-trends-cron] collect-geo-trends failed:", collectText.slice(0, 500));
      return new Response(
        JSON.stringify({ success: false, step: "collect-geo-trends", error: collectText.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[geo-trends-cron] collect-geo-trends done: ${collectResult.matches_found ?? 0} matches`);

    // Step 2: detect-geo-changes (변동률 감지)
    const detectResp = await fetch(`${supabaseUrl}/functions/v1/detect-geo-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(wiki_entry_id ? { wiki_entry_id } : {}),
    });

    const detectText = await detectResp.text();
    let detectResult: any;
    try { detectResult = JSON.parse(detectText); } catch { detectResult = { raw: detectText.slice(0, 300) }; }

    if (!detectResp.ok) {
      console.error("[geo-trends-cron] detect-geo-changes failed:", detectText.slice(0, 500));
    } else {
      console.log(`[geo-trends-cron] detect-geo-changes done: ${detectResult.total_spikes ?? 0} spikes`);
    }

    // Log to collection log
    await sb.from("ktrenz_collection_log").insert({
      platform: "geo_trends_cron",
      status: "success",
      records_collected: collectResult.matches_found ?? 0,
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        pipeline: "collect-geo-trends → detect-geo-changes",
        collect: collectResult,
        detect: detectResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[geo-trends-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
