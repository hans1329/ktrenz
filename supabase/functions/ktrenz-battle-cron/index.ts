// ktrenz-battle-cron: 배틀 파이프라인 일일 자동화 오케스트레이터
// pg_cron에서 3분마다 호출 — 현재 시간+DB 상태를 보고 한 단계씩 진행
// 순서: 어제 close → 어제 round2 → 어제 settle → 오늘 prescore → 오늘 autobatch → 오늘 open
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** KST 기준 오늘/어제 날짜 */
function getKSTDates() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);
  const yesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const kstHour = kstNow.getUTCHours();
  const kstMin = kstNow.getUTCMinutes();
  return { today, yesterday, kstHour, kstMin, kstNow };
}

/** Edge function 호출 헬퍼 */
async function callFunction(
  supabaseUrl: string, serviceKey: string, fnName: string, body: any,
): Promise<any> {
  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function isAfterKSTTime(kstHour: number, kstMin: number, targetHour: number, targetMin = 0) {
  return kstHour > targetHour || (kstHour === targetHour && kstMin >= targetMin);
}

function hasExpectedRuns(runCount: number, totalPairs: number | null | undefined) {
  const expectedRuns = Number(totalPairs || 0) * 2;
  if (expectedRuns > 0) {
    return runCount >= expectedRuns;
  }
  return runCount > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { today, yesterday, kstHour, kstMin } = getKSTDates();
    const todayBatchId = today.replace(/-/g, "");
    const yesterdayBatchId = yesterday.replace(/-/g, "");
    const log: string[] = [];

    // ── Load battle records ──
    const { data: todayBattle } = await sb
      .from("ktrenz_b2_battles")
      .select("*")
      .eq("battle_date", today)
      .maybeSingle();

    const { data: yesterdayBattle } = await sb
      .from("ktrenz_b2_battles")
      .select("*")
      .eq("battle_date", yesterday)
      .maybeSingle();

    // ── Check queue state ──
    const { data: queueItems } = await sb
      .from("ktrenz_b2_batch_queue")
      .select("status, batch_id")
      .limit(500);

    const activeQueueItems = (queueItems || []).filter((q: any) => q.status === "pending" || q.status === "running");
    const queueActive = activeQueueItems.length;
    const queueBatchId = activeQueueItems[0]?.batch_id || null;
    const queueBusy = queueActive > 0;

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: 어제 배팅 마감 (05:00 KST 이후)
    // collecting에 멈춘 battle도 round 1 데이터가 완성되어 있으면 회복 후 closed 처리
    // ═══════════════════════════════════════════════════════════
    if (kstHour >= 5 && yesterdayBattle && (yesterdayBattle.status === "open" || yesterdayBattle.status === "collecting")) {
      const { count: yesterdayRound1Count } = await sb
        .from("ktrenz_b2_runs")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", yesterdayBatchId)
        .eq("search_round", 1);

      const recoveredFromCollecting =
        yesterdayBattle.status === "collecting" &&
        hasExpectedRuns(yesterdayRound1Count || 0, yesterdayBattle.total_pairs);

      if (yesterdayBattle.status === "open" || recoveredFromCollecting) {
        await sb.from("ktrenz_b2_battles")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("id", yesterdayBattle.id);
        log.push(`Phase 1: Closed yesterday's betting (${yesterday})${recoveredFromCollecting ? " [recovered stale collecting battle]" : ""}`);
        return respond(log);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: 어제 Round 2 수집 (09:30+ KST)
    // ═══════════════════════════════════════════════════════════
    if (yesterdayBattle?.status === "closed" && isAfterKSTTime(kstHour, kstMin, 9, 30)) {
      const { count: yesterdayRound2Count } = await sb
        .from("ktrenz_b2_runs")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", yesterdayBatchId)
        .eq("search_round", 2);

      const expectedRound2Runs = Number(yesterdayBattle.total_pairs || 0) * 2;
      const round2Complete = hasExpectedRuns(yesterdayRound2Count || 0, yesterdayBattle.total_pairs);

      if (queueBusy && queueBatchId === yesterdayBatchId) {
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
          action: "process_next",
          search_round: 2,
        });
        log.push(`Phase 2: Round 2 process_next: star=${result.processed_star_id}, pending=${result.progress?.pending}`);
        return respond(log);
      }

      if (!queueBusy && (yesterdayRound2Count || 0) === 0) {
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
          action: "start_round2",
          prev_batch_id: yesterdayBatchId,
        });
        log.push(`Phase 2: Started round 2 for ${yesterday}: queued=${result.queued}`);
        return respond(log);
      }

      if (!round2Complete) {
        log.push(`Phase 2: Waiting for complete round 2 data (${yesterdayRound2Count || 0}/${expectedRound2Runs || 0})`);
        return respond(log);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: 어제 정산 (Round 2 완료 후)
    // ═══════════════════════════════════════════════════════════
    if (yesterdayBattle?.status === "closed") {
      // Round 2가 완료되었는지 확인
      const { count: r2Count } = await sb
        .from("ktrenz_b2_runs")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", yesterdayBatchId)
        .eq("search_round", 2);

      const expectedRound2Runs = Number(yesterdayBattle.total_pairs || 0) * 2;
      const round2Complete = hasExpectedRuns(r2Count || 0, yesterdayBattle.total_pairs);

      if (round2Complete) {
        // Round 2 수집 완료 → 정산
        const result = await callFunction(supabaseUrl, serviceKey, "settle-trend-vs", {});
        log.push(`Phase 3: Settlement: settled=${result.settled}, total=${result.total}`);

        // 정산 완료 후 battle status 업데이트 (settle 함수에서도 하지만 확실하게)
        const settlementComplete = result?.message === "No pending predictions"
          || Number(result?.total || 0) === 0
          || Number(result?.settled || 0) === Number(result?.total || 0);

        if (settlementComplete) {
          await sb.from("ktrenz_b2_battles")
            .update({ status: "settled", settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", yesterdayBattle.id);
        }
        // Phase 3.5: 키워드 추출 (정산 후 1회)
        const { count: kwCount } = await sb
          .from("ktrenz_discover_keywords")
          .select("*", { count: "exact", head: true })
          .eq("score_date", today);

        if ((kwCount || 0) === 0) {
          const kwResult = await callFunction(supabaseUrl, serviceKey, "ktrenz-discover-extract", {
            batch_id: yesterdayBatchId,
            score_date: today,
          });
          log.push(`Phase 3.5: Keyword extract: extracted=${kwResult.extracted}, upserted=${kwResult.upserted}`);
        } else {
          log.push(`Phase 3.5: Keywords already extracted for ${today} (${kwCount})`);
        }

        return respond(log);
      }

      if ((r2Count || 0) > 0) {
        log.push(`Phase 3: Waiting for full round 2 data before settlement (${r2Count || 0}/${expectedRound2Runs || 0})`);
        return respond(log);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: 오늘 Prescore (08:00+ KST)
    // ═══════════════════════════════════════════════════════════
    if (kstHour >= 8 && !todayBattle) {
      // Prescore 진행도 확인
      const { count: prescoreCount } = await sb
        .from("ktrenz_b2_prescores")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", todayBatchId);

      const { count: activeStarCount } = await sb
        .from("ktrenz_stars")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      const offset = prescoreCount || 0;
      const total = activeStarCount || 0;
      const prescoreComplete = offset >= total;

      if (!prescoreComplete) {
        // Prescore 계속 진행
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-prescore", {
          offset,
          batch_id: todayBatchId,
        });
        log.push(`Phase 4: Prescore chunk: offset=${offset}, processed=${result.processed || offset}, total=${total}, has_more=${result.has_more}`);
        return respond(log);
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 5: 오늘 Autobatch 시작 (09:30+ KST, prescore 완료 후)
      // ═══════════════════════════════════════════════════════════
      if (prescoreComplete && isAfterKSTTime(kstHour, kstMin, 9, 30)) {
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
          action: "start",
          batch_id: todayBatchId,
        });
        log.push(`Phase 5: Autobatch started: pairs=${result.total_pairs}, queued=${result.queued}`);
        return respond(log);
      }

      log.push(`Phase 4: Prescore complete (${offset}/${total}), waiting for 09:30 KST to start autobatch`);
      return respond(log);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 6: 오늘 Autobatch 큐 처리 (collecting 상태)
    // ═══════════════════════════════════════════════════════════
    if (todayBattle?.status === "collecting" && queueBusy && queueBatchId === todayBatchId) {
      const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
        action: "process_next",
        search_round: 1,
      });
      log.push(`Phase 6: Collection process_next: star=${result.processed_star_id}, pending=${result.progress?.pending}`);
      return respond(log);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 6.5: 오늘 배팅 오픈 (10:00+ KST, round 1 데이터 완성 후)
    // 큐가 비워졌더라도 round 1 run 수가 충분하면 open 처리
    // ═══════════════════════════════════════════════════════════
    if (todayBattle?.status === "collecting" && isAfterKSTTime(kstHour, kstMin, 10, 0)) {
      const { count: todayRound1Count } = await sb
        .from("ktrenz_b2_runs")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", todayBatchId)
        .eq("search_round", 1);

      const expectedTodayRuns = Number(todayBattle.total_pairs || 0) * 2;
      if (hasExpectedRuns(todayRound1Count || 0, todayBattle.total_pairs)) {
        await sb.from("ktrenz_b2_battles")
          .update({ status: "open", updated_at: new Date().toISOString() })
          .eq("id", todayBattle.id)
          .eq("status", "collecting");
        log.push(`Phase 6.5: Opened today's betting (${today})`);
        return respond(log);
      }

      log.push(`Phase 6.5: Waiting for full round 1 data before opening (${todayRound1Count || 0}/${expectedTodayRuns || 0})`);
      return respond(log);
    }

    // ═══════════════════════════════════════════════════════════
    // IDLE — 할 일 없음
    // ═══════════════════════════════════════════════════════════
    log.push(`Idle: KST=${kstHour}:${String(kstMin).padStart(2, "0")}, today=${todayBattle?.status || "none"}, yesterday=${yesterdayBattle?.status || "none"}, queue_active=${queueActive}, queue_batch=${queueBatchId || "none"}`);
    return respond(log);

  } catch (err) {
    console.error("Battle cron error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function respond(log: string[]) {
  return new Response(JSON.stringify({ success: true, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
