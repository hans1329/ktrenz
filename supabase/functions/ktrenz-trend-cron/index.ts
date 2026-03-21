// T2 Trend Cron: DB 기반 상태머신 오케스트레이터
// fire-and-forget 체이닝 대신 DB에 상태를 기록하고, 각 호출이 DB를 읽어 다음 작업을 결정한다.
// 호출 방식: 1) 어드민 UI에서 새 run 시작, 2) pg_cron으로 주기적 poll, 3) 수동 호출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COLLECTION_PAUSED = false;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PHASE_ORDER = ["detect", "track"] as const;
const PHASE_FUNCTION: Record<string, string> = {
  detect: "ktrenz-trend-detect",
  track: "ktrenz-trend-track",
};
const DETECT_PHASES = new Set(["detect"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { action = "tick", runId, phase, batchSize = 5, singlePhase = false } = body;

    if (COLLECTION_PAUSED) {
      return respond({ success: true, paused: true, message: "Collection paused" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── action: start — 새 파이프라인 실행 시작 ──
    if (action === "start") {
      const newRunId = singlePhase ? `single_${Date.now()}` : `run_${Date.now()}`;
      const firstPhase = phase || "detect";

      await sb.from("ktrenz_pipeline_state").insert({
        run_id: newRunId,
        phase: firstPhase,
        status: "running",
        current_offset: 0,
        batch_size: batchSize,
        total_candidates: null,
      });

      console.log(`[cron] Started ${singlePhase ? "single-phase" : "full"} run ${newRunId}, phase=${firstPhase}, batchSize=${batchSize}`);

      // 즉시 첫 배치 실행
      const result = await executeBatch(sb, supabaseUrl, supabaseKey, newRunId, firstPhase, 0, batchSize);

      return respond({
        success: true,
        action: "start",
        runId: newRunId,
        phase: firstPhase,
        result,
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ── action: tick — 진행 중인 작업 폴링 (핵심) ──
    // DB에서 status='running' 인 레코드를 찾아 다음 배치를 실행한다.
    if (action === "tick" || action === "poll") {
      const { data: activeRuns } = await sb
        .from("ktrenz_pipeline_state")
        .select("*")
        .eq("status", "running")
        .order("created_at", { ascending: true })
        .limit(1);

      if (!activeRuns?.length) {
        // running이 없으면 postprocess_requested 확인
        const { data: ppReqs } = await sb
          .from("ktrenz_pipeline_state")
          .select("*")
          .eq("status", "postprocess_requested")
          .order("updated_at", { ascending: true })
          .limit(1);

        if (ppReqs?.length) {
          const ppState = ppReqs[0];
          console.log(`[cron] Found postprocess request for run=${ppState.run_id}, phase=${ppState.phase}`);

          // postprocess_running으로 업데이트 (lock)
          await sb.from("ktrenz_pipeline_state")
            .update({ status: "postprocess_running", updated_at: new Date().toISOString() })
            .eq("id", ppState.id)
            .eq("status", "postprocess_requested"); // optimistic lock

          // postprocess 실행
          const ppResult = await executePostprocess(supabaseUrl, supabaseKey, ppState.phase);

          // postprocess 완료 → 다음 phase 시작 or done
          const isSinglePhaseRun = ppState.run_id.startsWith("single_");
          let nextPhase = isSinglePhaseRun ? null : getNextPhase(ppState.phase);

          // 첫 수집 판별: tracking 레코드가 0건이면 track phase 스킵
          // (detect에서 baseline만 기록하고 비교 대상이 없으므로)
          if (nextPhase === "track") {
            const { count: trackingCount } = await sb
              .from("ktrenz_trend_tracking")
              .select("id", { count: "exact", head: true })
              .limit(1);
            if (!trackingCount || trackingCount === 0) {
              console.log(`[cron] First run detected (no tracking records) → skipping track phase`);
              nextPhase = null; // track 스킵 → 바로 done
            }
          }

          if (nextPhase) {
            // 현재 phase는 done, 다음 phase를 running으로 생성
            await sb.from("ktrenz_pipeline_state")
              .update({ status: "done", postprocess_done: true, updated_at: new Date().toISOString() })
              .eq("id", ppState.id);

            // Check for existing row before inserting (unique constraint safety)
            const { data: existingNext } = await sb.from("ktrenz_pipeline_state")
              .select("id").eq("run_id", ppState.run_id).eq("phase", nextPhase).limit(1);
            if (!existingNext?.length) {
              await sb.from("ktrenz_pipeline_state").insert({
                run_id: ppState.run_id,
                phase: nextPhase,
                status: "running",
                current_offset: 0,
                batch_size: ppState.batch_size,
              });
            }

            console.log(`[cron] Phase ${ppState.phase} done, starting ${nextPhase}`);
            console.log(`[cron] Phase ${ppState.phase} done, starting ${nextPhase}`);
          } else {
            // 마지막 phase or single-phase → 전부 done
            await sb.from("ktrenz_pipeline_state")
              .update({ status: "done", postprocess_done: true, updated_at: new Date().toISOString() })
              .eq("id", ppState.id);
            console.log(`[cron] ${isSinglePhaseRun ? "Single-phase" : "Pipeline"} run=${ppState.run_id} completed`);

            // Pipeline complete → settle expired prediction markets
            if (!isSinglePhaseRun) {
              try {
                const settleResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ktrenz-trend-settle`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
                  },
                  body: JSON.stringify({}),
                });
                const settleResult = await settleResp.json();
                console.log(`[cron] Auto-settle result:`, settleResult);
              } catch (e) {
                console.error(`[cron] Auto-settle failed:`, e);
              }
            }
          }

          return respond({
            success: true,
            action: "postprocess",
            runId: ppState.run_id,
            phase: ppState.phase,
            ppResult,
            nextPhase,
            elapsed_ms: Date.now() - startTime,
          });
        }

        return respond({ success: true, action: "tick", idle: true, message: "No active runs" });
      }

      const state = activeRuns[0];
      const currentOffset = state.current_offset;
      const bs = state.batch_size;

      // Optimistic lock: atomically claim this batch by advancing offset BEFORE execution
      // This prevents concurrent ticks from executing the same batch
      const { data: lockResult } = await sb
        .from("ktrenz_pipeline_state")
        .update({
          current_offset: currentOffset + bs,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", state.run_id)
        .eq("phase", state.phase)
        .eq("status", "running")
        .eq("current_offset", currentOffset) // optimistic lock: only if offset hasn't changed
        .select("id");

      if (!lockResult?.length) {
        // Another tick already claimed this batch, skip
        return respond({ success: true, action: "tick", skipped: true, message: "Batch already claimed by another tick" });
      }

      const result = await executeBatch(
        sb, supabaseUrl, supabaseKey,
        state.run_id, state.phase, currentOffset, bs
      );

      return respond({
        success: true,
        action: "tick",
        runId: state.run_id,
        phase: state.phase,
        offset: currentOffset,
        result,
        elapsed_ms: Date.now() - startTime,
      });
    }

    // ── action: postprocess_only — 수동 후처리 ──
    if (action === "postprocess_only") {
      const ppResult = await executePostprocess(supabaseUrl, supabaseKey, "manual");
      return respond({ success: true, action: "postprocess_only", ppResult, elapsed_ms: Date.now() - startTime });
    }

    // ── action: status — 현재 상태 조회 ──
    if (action === "status") {
      const { data } = await sb
        .from("ktrenz_pipeline_state")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return respond({ success: true, states: data });
    }

    return respond({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("[cron] Error:", error);
    return respond({ success: false, error: (error as Error).message }, 500);
  }
});

// ── 배치 실행 & DB 상태 업데이트 ──
async function executeBatch(
  sb: any, supabaseUrl: string, supabaseKey: string,
  runId: string, phase: string, offset: number, batchSize: number
): Promise<any> {
  const functionName = PHASE_FUNCTION[phase];
  if (!functionName) return { error: `Unknown phase: ${phase}` };

  console.log(`[cron] Executing batch: run=${runId}, phase=${phase}, offset=${offset}, size=${batchSize}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  let result: any;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ batchSize, batchOffset: offset }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await response.text();
    try {
      result = JSON.parse(text);
    } catch {
      console.warn(`[cron] Non-JSON response: ${text.slice(0, 200)}`);
      result = { success: true, totalCandidates: offset + batchSize + 1, successCount: 0, fallback: true };
    }
  } catch (fetchErr) {
    clearTimeout(timeout);
    const msg = (fetchErr as Error).message || "unknown";
    console.warn(`[cron] Fetch failed: ${msg}`);
    result = { success: true, totalCandidates: offset + batchSize + 1, successCount: 0, fallback: true, skippedError: msg };
  }

  const totalCandidates = result.totalCandidates || 0;
  const nextOffset = offset + batchSize;
  const isThrottled = result.throttled === true;
  const isLastBatch = (result.success && nextOffset >= totalCandidates) || isThrottled;

  if (isLastBatch) {
    // 이 phase 배치 완료
    if (DETECT_PHASES.has(phase)) {
      // detect 계열 → postprocess 요청
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "postprocess_requested",
          current_offset: nextOffset,
          total_candidates: totalCandidates,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", "running");

      console.log(`[cron] Phase ${phase} batches complete → postprocess_requested`);
    } else {
      // track phase → 바로 done
      const nextPhase = getNextPhase(phase);
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "done",
          current_offset: nextOffset,
          total_candidates: totalCandidates,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", "running");

      if (nextPhase) {
        const { data: existingNext } = await sb.from("ktrenz_pipeline_state")
          .select("id").eq("run_id", runId).eq("phase", nextPhase).limit(1);
        if (!existingNext?.length) {
          await sb.from("ktrenz_pipeline_state").insert({
            run_id: runId,
            phase: nextPhase,
            status: "running",
            current_offset: 0,
            batch_size: batchSize,
          });
        }
      }
      console.log(`[cron] Phase ${phase} done${nextPhase ? `, starting ${nextPhase}` : ", pipeline complete"}`);

      // Pipeline complete → settle expired prediction markets
      if (!nextPhase) {
        try {
          const settleResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ktrenz-trend-settle`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({}),
          });
          const settleResult = await settleResp.json();
          console.log(`[cron] Auto-settle result:`, settleResult);
        } catch (e) {
          console.error(`[cron] Auto-settle failed:`, e);
        }
      }
    }
  } else {
    // Offset already advanced by optimistic lock in tick handler
    // Just update total_candidates for monitoring
    await sb.from("ktrenz_pipeline_state")
      .update({
        total_candidates: totalCandidates,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("phase", phase)
      .eq("status", "running");
  }

  return { ...result, isLastBatch, nextOffset };
}

// ── postprocess 실행 ──
async function executePostprocess(supabaseUrl: string, supabaseKey: string, triggeredBy: string): Promise<any> {
  console.log(`[cron] Running postprocess, triggeredBy=${triggeredBy}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-postprocess`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggeredBy }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text.slice(0, 500) };
    }
  } catch (e) {
    clearTimeout(timeout);
    console.error(`[cron] Postprocess error: ${(e as Error).message}`);
    return { error: (e as Error).message };
  }
}

function getNextPhase(currentPhase: string): string | null {
  const idx = PHASE_ORDER.indexOf(currentPhase as any);
  return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
}

function respond(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
