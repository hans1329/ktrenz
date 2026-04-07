// ktrenz-collect-social: T2 파이프라인용 소셜 데이터 수집 오케스트레이터
// Instagram + TikTok 수집을 순차 호출하여 ktrenz_trend_triggers / ktrenz_social_snapshots에 저장
// 호출 방식: ktrenz-trend-cron의 collect_social phase에서 fire-and-forget 호출
// ★ selfManage=true 시 자체적으로 pipeline_state를 done으로 업데이트하고 다음 phase를 생성
// ★ Instagram은 시간 내 여러 배치를 루프로 처리 (배치당 20명)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IG_BATCH_SIZE = 20;
const IG_TIMEOUT_MS = 90_000;       // 개별 배치 타임아웃
const TOTAL_TIMEGUARD_MS = 240_000; // 전체 함수 타임가드 (4분)
const TT_TIMEOUT_MS = 90_000;

const PHASE_ORDER = ["detect", "collect_social", "postprocess", "track"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  // selfManage 파라미터: fire-and-forget 호출 시 자체 DB 상태 관리
  const body = await req.json().catch(() => ({}));
  const { runId, stateId, selfManage } = body;

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

    // ── 전체 대상 수 조회 (핸들 있는 스타만) ──
    const { count: totalStars } = await sb
      .from("ktrenz_stars")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("social_handles->instagram", "is", null)
      .neq("social_handles->>instagram" as any, "_not_found")
      .neq("social_handles->>instagram" as any, "");

    const maxOffset = totalStars || 500;

    // ── DB에서 오늘 처리된 최대 offset 조회 → 이어서 진행 ──
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
      const match = todayLogs[0].error_message?.match(/offset=(\d+)/);
      if (match) {
        igOffset = parseInt(match[1]) + IG_BATCH_SIZE;
      }
    }

    // ── 1. Instagram 수집: 시간 내 여러 배치 루프 ──
    if (igOffset >= maxOffset) {
      console.log(`[collect-social] Instagram: today's full cycle complete (offset=${igOffset} >= total=${maxOffset})`);
      results.instagram = { success: true, skipped: true, reason: "cycle_complete", todayOffset: igOffset, total: maxOffset };
    } else {
      let totalProcessed = 0;
      let totalKeywords = 0;
      let totalApiCalls = 0;
      let batchCount = 0;
      let lastBudget = 0;
      let lastError: string | null = null;

      while (igOffset < maxOffset) {
        // 타임가드: TikTok 수집 여유 시간 확보 (전체의 60%까지만 Instagram에 할당)
        const elapsed = Date.now() - startTime;
        if (elapsed > TOTAL_TIMEGUARD_MS * 0.6) {
          console.log(`[collect-social] Instagram timeguard: ${Math.round(elapsed / 1000)}s elapsed, stopping loop at offset=${igOffset}`);
          break;
        }

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), IG_TIMEOUT_MS);

          console.log(`[collect-social] Instagram batch #${batchCount + 1}: offset=${igOffset}, batchSize=${IG_BATCH_SIZE}`);

          const igResp = await fetch(`${supabaseUrl}/functions/v1/collect-instagram-trends`, {
            method: "POST",
            headers: callHeaders,
            body: JSON.stringify({ batchSize: IG_BATCH_SIZE, offset: igOffset }),
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

          const processed = igResult.processed || 0;
          const keywords = igResult.keywords_saved || 0;

          totalProcessed += processed;
          totalKeywords += keywords;
          totalApiCalls += igResult.api_calls || 0;
          lastBudget = igResult.budget_remaining || 0;
          batchCount++;

          console.log(`[collect-social] Instagram batch #${batchCount}: processed=${processed}, keywords=${keywords}, offset=${igOffset}`);

          // API 예산 소진 시 중단
          if (igResult.budget_remaining !== undefined && igResult.budget_remaining <= 0) {
            console.warn("[collect-social] Instagram API budget exhausted, stopping");
            break;
          }

          igOffset += IG_BATCH_SIZE;
        } catch (e) {
          lastError = (e as Error).message;
          console.error(`[collect-social] Instagram error at offset=${igOffset}: ${lastError}`);
          break; // 에러 시 루프 중단
        }
      }

      results.instagram = {
        success: true,
        batchesRun: batchCount,
        totalProcessed,
        totalKeywords,
        totalApiCalls,
        lastOffset: igOffset,
        maxOffset,
        budgetRemaining: lastBudget,
        ...(lastError ? { lastError } : {}),
      };

      console.log(`[collect-social] Instagram summary: batches=${batchCount}, processed=${totalProcessed}, keywords=${totalKeywords}, lastOffset=${igOffset}/${maxOffset}`);
    }

    // ── 2. TikTok 수집 (오프셋 순환) ──
    if (Date.now() - startTime > TOTAL_TIMEGUARD_MS) {
      console.warn(`[collect-social] ⏱ Timeguard: ${Math.round((Date.now() - startTime) / 1000)}s elapsed, skipping TikTok collection`);
      results.tiktok = { success: true, skipped: true, reason: "timeguard" };
    } else {
      // DB에서 오늘 처리된 최대 offset 조회
      const { data: ttTodayLogs } = await sb
        .from("ktrenz_collection_log")
        .select("error_message")
        .eq("platform", "tiktok")
        .eq("status", "success")
        .gte("collected_at", todayStart.toISOString())
        .order("collected_at", { ascending: false })
        .limit(1);

      let ttOffset = 0;
      if (ttTodayLogs && ttTodayLogs.length > 0) {
        const match = ttTodayLogs[0].error_message?.match(/offset=(\d+)/);
        if (match) {
          ttOffset = parseInt(match[1]) + 50;
        }
      }

      // 전체 대상 수 조회
      const { count: ttTotalStars } = await sb
        .from("ktrenz_stars")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("star_type", ["group", "solo", "member"]);

      const ttMaxOffset = ttTotalStars || 500;

      if (ttOffset >= ttMaxOffset) {
        console.log(`[collect-social] TikTok: today's full cycle complete (offset=${ttOffset} >= total=${ttMaxOffset})`);
        results.tiktok = { success: true, skipped: true, reason: "cycle_complete", todayOffset: ttOffset, total: ttMaxOffset };
      } else {
        console.log(`[collect-social] Starting TikTok collection at offset=${ttOffset}...`);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), TT_TIMEOUT_MS);

          const ttResp = await fetch(`${supabaseUrl}/functions/v1/collect-tiktok-trends`, {
            method: "POST",
            headers: callHeaders,
            body: JSON.stringify({ limit: 50, offset: ttOffset }),
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
            offset: ttOffset,
          };
          console.log(`[collect-social] TikTok: processed=${ttResult.processed}, snapshots=${ttResult.snapshotsInserted}, keywords=${ttResult.keywordsSaved || 0}, offset=${ttOffset}`);
        } catch (e) {
          const msg = (e as Error).message;
          console.error(`[collect-social] TikTok error: ${msg}`);
          results.tiktok = { success: false, error: msg };
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[collect-social] Done in ${elapsed}ms`, results);

    // 잠금 해제
    if (lockId) {
      await sb
        .from("ktrenz_collection_log")
        .update({
          status: "success",
          records_collected: (results.instagram?.totalKeywords || 0) + (results.tiktok?.keywords || 0),
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
