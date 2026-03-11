// geo-trends-cron: batch-split Google Trends collection
// Splits artists into batches of 5, fires collect-geo-trends per batch (fire-and-forget)
// Then chains detect-geo-changes after a wait period
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5; // 5 artists × 1.5s delay ≈ 7.5s per batch (well within 60s)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const singleId: string | undefined = body.wiki_entry_id;

    // Single artist mode: call directly and chain detect
    if (singleId) {
      console.log(`[geo-trends-cron] Single artist mode: ${singleId}`);

      const collectResp = await fetch(`${supabaseUrl}/functions/v1/collect-geo-trends`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ wiki_entry_id: singleId }),
      });
      const collectResult = await collectResp.json().catch(() => ({}));

      // Chain detect-geo-changes
      const detectResp = await fetch(`${supabaseUrl}/functions/v1/detect-geo-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ wiki_entry_id: singleId }),
      });
      const detectResult = await detectResp.json().catch(() => ({}));

      return new Response(
        JSON.stringify({ success: true, mode: "single", collect: collectResult, detect: detectResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Batch mode: get all tiered artists
    console.log("[geo-trends-cron] Batch mode: splitting artists into batches");

    const { data: tiers } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);

    if (!tiers?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "No tiered artists found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allIds = tiers.map((t: any) => t.wiki_entry_id);
    const batches: string[][] = [];
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      batches.push(allIds.slice(i, i + BATCH_SIZE));
    }

    console.log(`[geo-trends-cron] ${allIds.length} artists → ${batches.length} batches of ≤${BATCH_SIZE}`);

    // Fire-and-forget: launch all batches without waiting
    let launched = 0;
    for (const batch of batches) {
      fetch(`${supabaseUrl}/functions/v1/collect-geo-trends`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ wiki_entry_ids: batch }),
      }).catch((err) => console.error("[geo-trends-cron] batch fire error:", err));
      launched++;
    }

    // Fire-and-forget: detect-geo-changes (will run on whatever data exists)
    // Delay slightly so batches have time to land
    setTimeout(() => {
      fetch(`${supabaseUrl}/functions/v1/detect-geo-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({}),
      }).catch((err) => console.error("[geo-trends-cron] detect fire error:", err));
    }, 3000);

    // Log to collection log
    await sb.from("ktrenz_collection_log").insert({
      platform: "geo_trends_cron",
      status: "success",
      records_collected: allIds.length,
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode: "batch",
        total_artists: allIds.length,
        batches_launched: launched,
        batch_size: BATCH_SIZE,
        pipeline: "collect-geo-trends (batched) → detect-geo-changes (delayed)",
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
