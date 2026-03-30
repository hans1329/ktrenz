// ktrenz-collect-social: T2 파이프라인용 소셜 데이터 수집 오케스트레이터
// Instagram + TikTok 수집을 순차 호출하여 ktrenz_trend_triggers / ktrenz_social_snapshots에 저장
// 호출 방식: ktrenz-trend-cron의 collect_social phase에서 단일 호출
// ★ 중복 호출 방지: DB 기반 offset 관리 + 실행 중 잠금

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const callHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
    };

    const results: Record<string, any> = {};

    // ── 중복 실행 방지: 최근 3분 이내 실행 확인 ──
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: recentRuns } = await sb
      .from("ktrenz_collection_log")
      .select("id, collected_at")
      .eq("platform", "instagram_orchestrator")
      .eq("status", "running")
      .gte("collected_at", threeMinAgo)
      .limit(1);

    if (recentRuns && recentRuns.length > 0) {
      console.warn("[collect-social] Another instance is running, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "another_instance_running", totalCandidates: 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 실행 잠금 기록
    const { data: lockRow } = await sb
      .from("ktrenz_collection_log")
      .insert({
        platform: "instagram_orchestrator",
        status: "running",
        records_collected: 0,
        error_message: "started",
      })
      .select("id")
      .single();
    const lockId = lockRow?.id;

    // ── 1. Instagram 수집 (단일 배치 호출 — 중복 방지) ──
    console.log("[collect-social] Starting Instagram collection...");
    const igBatchSize = 20;

    // DB에서 오늘 처리된 최대 offset 조회 → 이어서 진행
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLogs } = await sb
      .from("ktrenz_collection_log")
      .select("error_message")
      .eq("platform", "instagram")
      .gte("collected_at", todayStart.toISOString())
      .order("collected_at", { ascending: false })
      .limit(1);

    let igOffset = 0;
    if (todayLogs && todayLogs.length > 0) {
      // error_message에서 offset 추출: "batch=20, offset=40, ..."
      const match = todayLogs[0].error_message?.match(/offset=(\d+)/);
      if (match) {
        igOffset = parseInt(match[1]) + igBatchSize; // 다음 배치부터
      }
    }

    // 전체 대상 수 조회 (핸들 있는 스타만)
    const { count: totalStars } = await sb
      .from("ktrenz_stars")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("social_handles->instagram", "is", null)
      .neq("social_handles->>instagram" as any, "_not_found")
      .neq("social_handles->>instagram" as any, "");

    const maxOffset = totalStars || 500;

    // 오늘 전체 순환 완료 시 스킵
    if (igOffset >= maxOffset) {
      console.log(`[collect-social] Instagram: today's full cycle complete (offset=${igOffset} >= total=${maxOffset})`);
      results.instagram = { success: true, skipped: true, reason: "cycle_complete", todayOffset: igOffset, total: maxOffset };
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        console.log(`[collect-social] Instagram: calling offset=${igOffset}, batchSize=${igBatchSize}`);

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
          igResult = { error: "non-JSON response" };
        }

        results.instagram = {
          success: true,
          offset: igOffset,
          nextOffset: igOffset + igBatchSize,
          processed: igResult.processed || 0,
          keywords: igResult.keywords_saved || 0,
          apiCalls: igResult.api_calls || 0,
          budgetRemaining: igResult.budget_remaining || 0,
        };

        console.log(`[collect-social] Instagram: processed=${igResult.processed}, keywords=${igResult.keywords_saved}, offset=${igOffset}`);
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[collect-social] Instagram error: ${msg}`);
        results.instagram = { success: false, error: msg, offset: igOffset };
      }
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
        keywords: ttResult.keywordsSaved || 0,
        totalViews: ttResult.totalViews || 0,
      };
      console.log(`[collect-social] TikTok: processed=${ttResult.processed}, snapshots=${ttResult.snapshotsInserted}, keywords=${ttResult.keywordsSaved || 0}`);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[collect-social] TikTok error: ${msg}`);
      results.tiktok = { success: false, error: msg };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[collect-social] Done in ${elapsed}ms`, results);

    // 잠금 해제
    if (lockId) {
      await sb
        .from("ktrenz_collection_log")
        .update({
          status: "success",
          records_collected: (results.instagram?.keywords || 0) + (results.tiktok?.keywords || 0),
          error_message: JSON.stringify(results).slice(0, 500),
        })
        .eq("id", lockId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalCandidates: 1,
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
