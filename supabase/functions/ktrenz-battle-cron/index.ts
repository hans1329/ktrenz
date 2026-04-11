// ktrenz-battle-cron: 배틀 파이프라인 일일 자동화 오케스트레이터
// pg_cron에서 3분마다 호출 — 현재 시간+DB 상태를 보고 한 단계씩 진행
// 순서: 어제 close → 어제 round2 → 어제 settle → 오늘 prescore → 오늘 autobatch
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
  supabaseUrl: string, serviceKey: string, fnName: string, body: any
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

    const queuePending = (queueItems || []).filter((q: any) => q.status === "pending").length;
    const queueBatchId = queueItems?.[0]?.batch_id || null;
    const queueBusy = queuePending > 0;

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: 어제 배팅 마감 (00:00 KST 이후)
    // ═══════════════════════════════════════════════════════════
    if (yesterdayBattle?.status === "open") {
      await sb.from("ktrenz_b2_battles")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", yesterdayBattle.id);
      log.push(`Phase 1: Closed yesterday's betting (${yesterday})`);
      return respond(log);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: 어제 Round 2 수집 (09:30+ KST)
    // ═══════════════════════════════════════════════════════════
    if (yesterdayBattle?.status === "closed" && kstHour >= 9 && (kstHour > 9 || kstMin >= 30)) {
      // Round 2 큐가 아직 안 만들어졌으면 시작
      if (!queueBusy || queueBatchId !== yesterdayBatchId) {
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
          action: "start_round2",
          prev_batch_id: yesterdayBatchId,
        });
        log.push(`Phase 2: Started round 2 for ${yesterday}: queued=${result.queued}`);
        return respond(log);
      }

      // Round 2 큐 처리 중
      if (queueBusy && queueBatchId === yesterdayBatchId) {
        const result = await callFunction(supabaseUrl, serviceKey, "ktrenz-battle-autobatch", {
          action: "process_next",
          search_round: 2,
        });
        log.push(`Phase 2: Round 2 process_next: star=${result.processed_star_id}, pending=${result.progress?.pending}`);
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

      if ((r2Count || 0) > 0) {
        // Round 2 수집 완료 → 정산
        const result = await callFunction(supabaseUrl, serviceKey, "settle-trend-vs", {});
        log.push(`Phase 3: Settlement: settled=${result.settled}, total=${result.total}`);

        // 정산 완료 후 battle status 업데이트 (settle 함수에서도 하지만 확실하게)
        if (result.settled > 0) {
          await sb.from("ktrenz_b2_battles")
            .update({ status: "settled", settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", yesterdayBattle.id);
        }
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
      if (prescoreComplete && kstHour >= 9 && (kstHour > 9 || kstMin >= 30)) {
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
    // IDLE — 할 일 없음
    // ═══════════════════════════════════════════════════════════
    log.push(`Idle: KST=${kstHour}:${String(kstMin).padStart(2, "0")}, today=${todayBattle?.status || "none"}, yesterday=${yesterdayBattle?.status || "none"}`);
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
