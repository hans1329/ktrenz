// T2 Trend Cron: DB 기반 상태머신 오케스트레이터
// fire-and-forget 체이닝 대신 DB에 상태를 기록하고, 각 호출이 DB를 읽어 다음 작업을 결정한다.
// 호출 방식: 1) 어드민 UI에서 새 run 시작, 2) pg_cron으로 주기적 poll, 3) 수동 호출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COLLECTION_PAUSED = false;
const MAX_CONSECUTIVE_ERRORS = 3; // N회 연속 실패 시 파이프라인 중단
const STALE_LOCK_MINUTES = 30; // 30분 이상 running 상태이면 stale로 간주
const STALE_INFLIGHT_MINUTES = 10; // running_inflight는 10분이면 stale
const RUNNING_STATUS = "running";
const RUNNING_INFLIGHT_STATUS = "running_inflight";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// detect(네이버/유튜브) → collect_social(인스타/틱톡) → postprocess(중복제거/주체검증) → track(통합 점수)
const PHASE_ORDER = ["detect", "collect_social", "postprocess", "track"] as const;
const PHASE_FUNCTION: Record<string, string> = {
  detect: "ktrenz-trend-detect",
  collect_social: "ktrenz-collect-social",
  postprocess: "ktrenz-trend-postprocess",
  track: "ktrenz-trend-track",
};
const VALID_PHASES = new Set(PHASE_ORDER);
const DETECT_PHASES = new Set(["detect"]);
const SINGLE_CALL_PHASES = new Set<string>(["collect_social", "postprocess"]); // 내부 배치 관리
const FIRE_AND_FORGET_PHASES = new Set<string>(["collect_social"]); // 150s 플랫폼 타임아웃 초과 → fire-and-forget
const ROTATING_PHASES = new Set<string>(); // 현재 없음

function resolveBatchSize(phase: string, requestedBatchSize: number): number {
  const safeRequested = Math.max(1, Math.floor(requestedBatchSize || 1));
  if (phase === "detect") return Math.min(safeRequested, 10);
  if (phase === "track") return Math.min(safeRequested, 5);
  return safeRequested;
}

// 이전 실행의 마지막 offset을 조회하여 이어서 처리 (순환)
async function getResumeOffset(sb: any, phase: string, totalCandidates: number): Promise<number> {
  if (!ROTATING_PHASES.has(phase)) return 0;

  const { data } = await sb
    .from("ktrenz_pipeline_state")
    .select("current_offset, total_candidates")
    .eq("phase", phase)
    .in("status", ["done", "postprocess_requested"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (!data?.length) return 0;

  const lastOffset = data[0].current_offset || 0;
  const lastTotal = data[0].total_candidates || totalCandidates;

  // 순환: 마지막 offset이 전체를 넘으면 0부터
  if (lastOffset >= lastTotal) return 0;
  return lastOffset;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { action = "tick", runId, phase, batchSize = 15, singlePhase = false } = body;

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
      const effectiveBatchSize = resolveBatchSize(firstPhase, batchSize);

      const resumeOffset = await getResumeOffset(sb, firstPhase, 0);
      await sb.from("ktrenz_pipeline_state").insert({
        run_id: newRunId,
        phase: firstPhase,
        status: RUNNING_STATUS,
        current_offset: resumeOffset,
        batch_size: effectiveBatchSize,
        total_candidates: null,
      });

      console.log(`[cron] Queued ${singlePhase ? "single-phase" : "full"} run ${newRunId}, phase=${firstPhase}, requestedBatchSize=${batchSize}, effectiveBatchSize=${effectiveBatchSize}, resumeOffset=${resumeOffset}`);

      // 즉시 비동기 tick 트리거 (start 응답은 즉시 반환)
      fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-cron`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "tick" }),
      }).catch(() => {});

      return respond({
        success: true,
        action: "start",
        runId: newRunId,
        phase: firstPhase,
        requestedBatchSize: batchSize,
        effectiveBatchSize,
        queued: true,
        elapsed_ms: Date.now() - startTime,
      });
    }
    // ── action: resume — 에러/정지 상태의 파이프라인을 현재 offset에서 재개 ──
    if (action === "resume") {
      const { data: errorRuns } = await sb
        .from("ktrenz_pipeline_state")
        .select("*")
        .in("status", ["error", "stopped"])
        .order("updated_at", { ascending: false })
        .limit(1);

      if (!errorRuns?.length) {
        return respond({ success: false, error: "No error/stopped runs to resume" });
      }

      const run = errorRuns[0];
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: RUNNING_STATUS,
          error_count: 0,
          last_error: null,
          last_error_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      console.log(`[cron] Resumed run=${run.run_id}, phase=${run.phase}, offset=${run.current_offset}`);

      // 즉시 tick 트리거
      fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-cron`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "tick" }),
      }).catch(() => {});

      return respond({
        success: true,
        action: "resume",
        runId: run.run_id,
        phase: run.phase,
        offset: run.current_offset,
        message: `Resumed from offset ${run.current_offset}`,
      });
    }

    // ── action: tick — 진행 중인 작업 폴링 (핵심) ──
    // DB에서 status='running' 인 레코드를 찾아 다음 배치를 실행한다.
    if (action === "tick" || action === "poll") {
      const { data: activeRuns } = await sb
        .from("ktrenz_pipeline_state")
        .select("*")
        .eq("status", RUNNING_STATUS)
        .in("phase", [...VALID_PHASES])
        .order("created_at", { ascending: true })
        .limit(1);

      if (!activeRuns?.length) {
        // ── Stale lock recovery: running_inflight는 10분, 나머지는 30분 ──
        const staleThreshold = new Date(Date.now() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();
        const staleInflightThreshold = new Date(Date.now() - STALE_INFLIGHT_MINUTES * 60 * 1000).toISOString();

        // 1) running_inflight: 10분 기준으로 빠르게 복구
        const { data: staleInflight } = await sb
          .from("ktrenz_pipeline_state")
          .select("*")
          .eq("status", RUNNING_INFLIGHT_STATUS)
          .lt("updated_at", staleInflightThreshold)
          .limit(5);

        // 2) running, postprocess_running: 30분 기준
        const { data: staleLong } = await sb
          .from("ktrenz_pipeline_state")
          .select("*")
          .in("status", [RUNNING_STATUS, "postprocess_running"])
          .lt("updated_at", staleThreshold)
          .limit(5);

        const staleRuns = [...(staleInflight || []), ...(staleLong || [])];

        if (staleRuns?.length) {
          for (const stale of staleRuns) {
            const mins = stale.status === RUNNING_INFLIGHT_STATUS ? STALE_INFLIGHT_MINUTES : STALE_LOCK_MINUTES;
            console.warn(`[cron] Stale lock detected: run=${stale.run_id}, phase=${stale.phase}, status=${stale.status}, updated_at=${stale.updated_at}`);
            await sb.from("ktrenz_pipeline_state")
              .update({
                status: "error",
                last_error: `Stale lock: no progress for ${mins}+ minutes (was ${stale.status})`,
                last_error_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", stale.id)
              .eq("status", stale.status); // race-safe: 다른 tick이 이미 변경했으면 무시
          }
          return respond({ success: true, action: "tick", staleRecovered: staleRuns.length, message: `Recovered ${staleRuns.length} stale locks` });
        }

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
          const { data: ppLock } = await sb.from("ktrenz_pipeline_state")
            .update({ status: "postprocess_running", updated_at: new Date().toISOString() })
            .eq("id", ppState.id)
            .eq("status", "postprocess_requested") // optimistic lock
            .select("id");

          if (!ppLock?.length) {
            return respond({ success: true, action: "tick", skipped: true, message: "Postprocess already claimed" });
          }

          // Fire-and-forget: postprocess를 호출만 하고 응답을 기다리지 않음
          // postprocess 함수가 자체적으로 DB 상태를 관리함
          fireAndForgetPostprocess(supabaseUrl, supabaseKey, ppState.phase, ppState.run_id, ppState.id);

          return respond({
            success: true,
            action: "postprocess_fired",
            runId: ppState.run_id,
            phase: ppState.phase,
            message: "Postprocess triggered (fire-and-forget). It will self-manage DB state.",
            elapsed_ms: Date.now() - startTime,
          });
        }

        const { data: inFlightRuns } = await sb
          .from("ktrenz_pipeline_state")
          .select("run_id, phase, updated_at")
          .eq("status", RUNNING_INFLIGHT_STATUS)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (inFlightRuns?.length) {
          return respond({ success: true, action: "tick", busy: true, message: "Batch is currently in-flight", inFlight: inFlightRuns[0] });
        }

        return respond({ success: true, action: "tick", idle: true, message: "No active runs" });
      }

      const state = activeRuns[0];
      const currentOffset = state.current_offset;
      const phaseBatchSize = resolveBatchSize(state.phase, state.batch_size);

      // Optimistic lock: atomically claim this batch by advancing offset BEFORE execution
      // This prevents concurrent ticks from executing the same batch
      const { data: lockResult } = await sb
        .from("ktrenz_pipeline_state")
        .update({
          status: RUNNING_INFLIGHT_STATUS,
          current_offset: currentOffset + phaseBatchSize,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", state.run_id)
        .eq("phase", state.phase)
        .eq("status", RUNNING_STATUS)
        .eq("current_offset", currentOffset) // optimistic lock: only if offset hasn't changed
        .select("id");

      if (!lockResult?.length) {
        // Another tick already claimed this batch, skip
        return respond({ success: true, action: "tick", skipped: true, message: "Batch already claimed by another tick" });
      }

      const result = await executeBatch(
        sb, supabaseUrl, supabaseKey,
        state.run_id, state.phase, currentOffset, phaseBatchSize
      );

      // 배치 완료 후 즉시 다음 tick을 fire-and-forget으로 트리거 (5분 대기 제거)
      // 에러거나 마지막 배치면 다음 tick에서 자연스럽게 종료됨
      if (!result.stopped) {
        fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-cron`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "tick" }),
        }).catch(() => {}); // fire-and-forget
      }

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
  const timeout = setTimeout(() => controller.abort(), 300000); // 5분 타임아웃

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
    if (!response.ok) {
      result = {
        success: false,
        fallback: true,
        error: `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
      };
    } else {
      try {
        result = JSON.parse(text);
      } catch {
        console.warn(`[cron] Non-JSON response: ${text.slice(0, 200)}`);
        result = {
          success: false,
          fallback: true,
          error: `Non-JSON response: ${text.slice(0, 120)}`,
        };
      }
    }
  } catch (fetchErr) {
    clearTimeout(timeout);
    const msg = (fetchErr as Error).message || "unknown";
    console.warn(`[cron] Fetch failed: ${msg}`);
    result = { success: false, fallback: true, skippedError: msg };
  }

  // ── 에러 감지 & 연속 실패 시 파이프라인 중단 ──
  const isBatchError = result.fallback === true || result.success === false || result.skippedError;
  if (isBatchError) {
    const errorMsg = result.skippedError || result.error || "Unknown batch error";
    const is504 = errorMsg.includes("504") || errorMsg.includes("Gateway Timeout");
    const isAbort = errorMsg.includes("aborted") || errorMsg.includes("AbortError");

    // 504/타임아웃은 실제로 처리가 완료됐을 수 있으므로 offset 유지하고 다음으로 진행
    if (is504 || isAbort) {
      console.warn(`[cron] Batch timeout at offset=${offset}, assuming completed and advancing (${errorMsg.slice(0, 100)})`);
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: RUNNING_STATUS,
          // offset은 이미 optimistic lock으로 증가됨 → 롤백하지 않음
          last_error: `timeout_skipped: ${errorMsg.slice(0, 300)}`,
          last_error_at: new Date().toISOString(),
          error_count: 0, // 타임아웃은 연속 에러로 카운트하지 않음
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", RUNNING_INFLIGHT_STATUS);

      return { ...result, skippedTimeout: true };
    }

    const { data: currentState } = await sb
      .from("ktrenz_pipeline_state")
      .select("error_count")
      .eq("run_id", runId)
      .eq("phase", phase)
      .limit(1);

    const prevErrorCount = currentState?.[0]?.error_count || 0;
    const newErrorCount = prevErrorCount + 1;

    // ★ 실패 시 offset 롤백: optimistic lock으로 미리 증가된 offset을 원래 값으로 복원
    // race-safe: running_inflight 상태인 경우에만 롤백 (다른 tick이 이미 변경했으면 무시)
    await sb.from("ktrenz_pipeline_state")
      .update({
        current_offset: offset, // 롤백: 실패한 배치를 다음 tick에서 재시도
        error_count: newErrorCount,
        last_error: errorMsg.slice(0, 500),
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("phase", phase)
      .eq("status", RUNNING_INFLIGHT_STATUS);

    if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[cron] Phase ${phase} stopped: ${newErrorCount} consecutive errors. Last: ${errorMsg}`);
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase);

      return { ...result, stopped: true, errorCount: newErrorCount };
    }

    await sb.from("ktrenz_pipeline_state")
      .update({
        status: RUNNING_STATUS,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("phase", phase)
      .eq("status", RUNNING_INFLIGHT_STATUS);

    console.warn(`[cron] Batch error (${newErrorCount}/${MAX_CONSECUTIVE_ERRORS}): ${errorMsg}`);
  } else {
    // 성공 시 에러 카운트 리셋
    await sb.from("ktrenz_pipeline_state")
      .update({ error_count: 0 })
      .eq("run_id", runId)
      .eq("phase", phase);
  }

  const totalCandidates = Number.isFinite(result.totalCandidates) && result.totalCandidates > 0
    ? result.totalCandidates
    : null;
  // 실제 처리된 수만큼만 offset 전진 (타임아웃으로 일부만 처리된 경우 대응)
  const actualProcessed = Number.isFinite(result.processed) ? Math.max(1, Math.floor(result.processed)) : batchSize;
  const nextOffset = offset + actualProcessed;
  const isThrottled = result.throttled === true;
  const isQuotaExhausted = result.quotaExhausted === true;
  const isSingleCall = SINGLE_CALL_PHASES.has(phase);
  const isLastBatch = isSingleCall || (result.success && totalCandidates !== null && nextOffset >= totalCandidates) || isThrottled || isQuotaExhausted;

  if (!isSingleCall && actualProcessed !== batchSize) {
    console.log(`[cron] Partial batch: phase=${phase}, offset=${offset}, claimed=${batchSize}, processed=${actualProcessed}, nextOffset=${nextOffset}`);
  }

  if (isQuotaExhausted) {
    console.warn(`[cron] Phase ${phase} stopped early: API quota exhausted at offset=${offset}`);
  }

  if (isLastBatch) {
    if (isSingleCall) {
      // 단일 호출 phase → 바로 done & 다음 phase
      const nextPhase = getNextPhase(phase);
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "done",
          current_offset: 1,
          total_candidates: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", RUNNING_INFLIGHT_STATUS);

      if (nextPhase) {
        const { data: existingNext } = await sb.from("ktrenz_pipeline_state")
          .select("id").eq("run_id", runId).eq("phase", nextPhase).limit(1);
        if (!existingNext?.length) {
              const resumeOff = await getResumeOffset(sb, nextPhase, 0);
              await sb.from("ktrenz_pipeline_state").insert({
                run_id: runId,
                phase: nextPhase,
                status: "running",
                current_offset: resumeOff,
                batch_size: batchSize,
              });
            }
      }
      console.log(`[cron] Single-call phase ${phase} done${nextPhase ? `, starting ${nextPhase}` : ", pipeline complete"}`);

      if (!nextPhase) {
        await runEndOfPipelineJobs(supabaseUrl, supabaseKey);
      }
    } else if (DETECT_PHASES.has(phase)) {
      // detect 계열 → postprocess 요청
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "postprocess_requested",
          current_offset: nextOffset,
          ...(totalCandidates !== null ? { total_candidates: totalCandidates } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", RUNNING_INFLIGHT_STATUS);

      console.log(`[cron] Phase ${phase} batches complete → postprocess_requested`);
    } else {
      // track phase → 바로 done
      const nextPhase = getNextPhase(phase);
      await sb.from("ktrenz_pipeline_state")
        .update({
          status: "done",
          current_offset: nextOffset,
          ...(totalCandidates !== null ? { total_candidates: totalCandidates } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("phase", phase)
        .eq("status", RUNNING_INFLIGHT_STATUS);

      if (nextPhase) {
        const { data: existingNext } = await sb.from("ktrenz_pipeline_state")
          .select("id").eq("run_id", runId).eq("phase", nextPhase).limit(1);
        if (!existingNext?.length) {
              const resumeOff = await getResumeOffset(sb, nextPhase, 0);
              await sb.from("ktrenz_pipeline_state").insert({
                run_id: runId,
                phase: nextPhase,
                status: "running",
                current_offset: resumeOff,
                batch_size: batchSize,
              });
            }
      }
      console.log(`[cron] Phase ${phase} done${nextPhase ? `, starting ${nextPhase}` : ", pipeline complete"}`);

      // Pipeline complete → run end-of-pipeline jobs
      if (!nextPhase) {
        await runEndOfPipelineJobs(supabaseUrl, supabaseKey);
      }
    }
  } else {
    // Offset 보정: optimistic lock이 batchSize만큼 전진시켰지만, 실제 처리된 양이 다를 수 있음
    await sb.from("ktrenz_pipeline_state")
      .update({
        status: RUNNING_STATUS,
        current_offset: nextOffset,
        ...(totalCandidates !== null ? { total_candidates: totalCandidates } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("phase", phase)
      .eq("status", RUNNING_INFLIGHT_STATUS);
  }

  return { ...result, isLastBatch, nextOffset };
}

// ── postprocess fire-and-forget 실행 ──
// cron은 호출만 하고 즉시 반환. postprocess가 자체적으로 DB 상태를 관리함.
function fireAndForgetPostprocess(supabaseUrl: string, supabaseKey: string, triggeredBy: string, runId: string, stateId: string) {
  console.log(`[cron] Fire-and-forget postprocess, run=${runId}, triggeredBy=${triggeredBy}`);

  fetch(`${supabaseUrl}/functions/v1/ktrenz-trend-postprocess`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ triggeredBy, runId, stateId, selfManage: true }),
  }).then(async (resp) => {
    console.log(`[cron] Postprocess response received (status=${resp.status}) for run=${runId}`);
  }).catch((e) => {
    console.error(`[cron] Postprocess fire-and-forget error: ${(e as Error).message}`);
  });
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
