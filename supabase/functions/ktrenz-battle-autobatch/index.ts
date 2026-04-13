// ktrenz-battle-autobatch: prescore 기반 쿨다운+티어 선발 → 페어링 → content-search 순차 실행
// DB 기반 상태머신 — 한 번 호출 시 1명씩 처리하고 다음 대상을 큐에서 가져감
// Actions: start, start_round2, process_next, status, clear
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_DAYS = 3;
const TIER_CONFIG = [
  { name: "top", count: 6, startPct: 0, endPct: 0.1 },
  { name: "mid", count: 8, startPct: 0.1, endPct: 0.4 },
  { name: "low", count: 6, startPct: 0.4, endPct: 1.0 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 티어별 선발 후 2명씩 페어링 */
function selectAndPair(
  scoredResults: any[],
  recentStarIds: Set<string>,
): { starId: string; pairIndex: number; side: "A" | "B" }[] {
  const totalScored = scoredResults.length;
  const paired: { starId: string; pairIndex: number; side: "A" | "B" }[] = [];
  let pairIdx = 0;

  for (const tier of TIER_CONFIG) {
    const startIdx = Math.floor(totalScored * tier.startPct);
    const endIdx = Math.floor(totalScored * tier.endPct);
    const tierPool = scoredResults.slice(startIdx, endIdx);
    const available = tierPool.filter((r: any) => !recentStarIds.has(r.star_id));
    const cooldownOnly = tierPool.filter((r: any) => recentStarIds.has(r.star_id));

    // 쿨다운 제외 후 부족하면 쿨다운 포함
    const shuffled = shuffle(available);
    const picked = shuffled.slice(0, tier.count);
    if (picked.length < tier.count) {
      const remaining = tier.count - picked.length;
      picked.push(...shuffle(cooldownOnly).slice(0, remaining));
    }

    // 짝수로 맞추기 (홀수면 마지막 1명 제외)
    const evenCount = picked.length - (picked.length % 2);
    for (let i = 0; i < evenCount; i += 2) {
      paired.push({ starId: picked[i].star_id, pairIndex: pairIdx, side: "A" });
      paired.push({ starId: picked[i + 1].star_id, pairIndex: pairIdx, side: "B" });
      pairIdx++;
    }
  }

  return paired;
}

/** 진행 요약 생성 */
function buildProgressSummary(items: any[]) {
  return {
    total: items.length,
    done: items.filter((p: any) => p.status === "done").length,
    error: items.filter((p: any) => p.status === "error").length,
    pending: items.filter((p: any) => p.status === "pending").length,
    running: items.filter((p: any) => p.status === "running").length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "process_next";

    // ═══════════════════════════════════════════════════════════════
    // Action: "start" — prescore 결과에서 쿨다운+티어 선발+페어링 후 큐 등록
    // ═══════════════════════════════════════════════════════════════
    if (action === "start") {
      const batchId: string = body.batch_id;
      if (!batchId) {
        return new Response(JSON.stringify({ error: "batch_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1. prescore 결과 조회
      const { data: allPrescores } = await sb
        .from("ktrenz_b2_prescores")
        .select("star_id, news_count, pre_score")
        .eq("batch_id", batchId)
        .order("pre_score", { ascending: false });

      const scoredResults = (allPrescores || []).filter((r: any) => r.news_count > 0);
      if (scoredResults.length === 0) {
        return new Response(JSON.stringify({ error: "No scored results for batch", batch_id: batchId }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. 쿨다운 체크
      const cooldownDate = new Date();
      cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);
      const { data: recentRuns } = await sb
        .from("ktrenz_b2_runs")
        .select("star_id")
        .gte("created_at", cooldownDate.toISOString());
      const recentStarIds = new Set((recentRuns || []).map((r: any) => r.star_id));

      // 3. 티어별 선발 + 페어링
      const paired = selectAndPair(scoredResults, recentStarIds);
      const totalPairs = Math.max(...paired.map(p => p.pairIndex), -1) + 1;

      if (paired.length === 0) {
        return new Response(JSON.stringify({ error: "Not enough stars to create pairs" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 4. Clear existing queue & insert paired items
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const queueItems = paired.map((p, idx) => ({
        star_id: p.starId,
        batch_id: batchId,
        queue_order: idx,
        status: "pending",
        pair_index: p.pairIndex,
        side: p.side,
      }));

      for (let i = 0; i < queueItems.length; i += 100) {
        await sb.from("ktrenz_b2_batch_queue").insert(queueItems.slice(i, i + 100));
      }

      // 5. Create battle record (KST = UTC+9)
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const battleDate = kstDate.toISOString().slice(0, 10);

      // 배팅 오픈: 당일 12:00 KST (03:00 UTC)
      const bettingOpens = new Date(`${battleDate}T03:00:00Z`);
      // 배팅 마감: 당일 23:59 KST (14:59 UTC)
      const bettingCloses = new Date(`${battleDate}T14:59:00Z`);

      await sb.from("ktrenz_b2_battles").upsert({
        battle_date: battleDate,
        batch_id: batchId,
        status: "collecting",
        betting_opens_at: bettingOpens.toISOString(),
        betting_closes_at: bettingCloses.toISOString(),
        total_pairs: totalPairs,
      }, { onConflict: "battle_date" });

      return new Response(JSON.stringify({
        success: true,
        action: "start",
        batch_id: batchId,
        battle_date: battleDate,
        total_scored: scoredResults.length,
        cooldown_excluded: recentStarIds.size,
        queued: paired.length,
        total_pairs: totalPairs,
        pairs: Array.from({ length: totalPairs }, (_, i) => ({
          pair_index: i,
          a: paired.find(p => p.pairIndex === i && p.side === "A")?.starId,
          b: paired.find(p => p.pairIndex === i && p.side === "B")?.starId,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Action: "start_round2" — 전일 배치 아티스트의 2차 수집 큐 등록
    // ═══════════════════════════════════════════════════════════════
    if (action === "start_round2") {
      const prevBatchId: string = body.prev_batch_id;
      if (!prevBatchId) {
        return new Response(JSON.stringify({ error: "prev_batch_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 전일 배치의 round 1 run이 있는 스타 목록 조회
      const { data: round1Runs } = await sb
        .from("ktrenz_b2_runs")
        .select("star_id")
        .eq("batch_id", prevBatchId)
        .eq("search_round", 1);

      const starIds = [...new Set((round1Runs || []).map((r: any) => r.star_id))];
      if (starIds.length === 0) {
        return new Response(JSON.stringify({ error: "No round 1 runs found for batch", prev_batch_id: prevBatchId }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 전일 큐에서 pair_index/side 정보 복원
      const { data: prevQueue } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("star_id, pair_index, side")
        .eq("batch_id", prevBatchId);
      const prevMap = new Map((prevQueue || []).map((q: any) => [q.star_id, q]));

      // 기존 큐 삭제 후 round 2 큐 삽입
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const queueItems = starIds.map((sid, idx) => {
        const prev = prevMap.get(sid);
        return {
          star_id: sid,
          batch_id: prevBatchId,
          queue_order: idx,
          status: "pending",
          pair_index: prev?.pair_index ?? null,
          side: prev?.side ?? null,
        };
      });

      for (let i = 0; i < queueItems.length; i += 100) {
        await sb.from("ktrenz_b2_batch_queue").insert(queueItems.slice(i, i + 100));
      }

      return new Response(JSON.stringify({
        success: true,
        action: "start_round2",
        prev_batch_id: prevBatchId,
        queued: starIds.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Action: "process_next" — 큐에서 다음 pending 아이템 처리
    // ═══════════════════════════════════════════════════════════════
    if (action === "process_next") {
      // search_round 파라미터 (default 1)
      const searchRound = Number(body.search_round) || 1;

      const { data: nextItem } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("id, star_id, batch_id, queue_order, pair_index, side")
        .eq("status", "pending")
        .order("queue_order", { ascending: true })
        .limit(1)
        .single();

      if (!nextItem) {
        return new Response(JSON.stringify({
          success: true,
          action: "process_next",
          status: "queue_empty",
          message: "All items processed",
          search_round: searchRound,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as running
      await sb
        .from("ktrenz_b2_batch_queue")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", nextItem.id);

      // Call content-search with batch_id and search_round
      let contentResult: any = null;
      let errorMsg: string | null = null;
      try {
        const csUrl = `${supabaseUrl}/functions/v1/ktrenz-content-search`;
        const res = await fetch(csUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            star_id: nextItem.star_id,
            batch_id: nextItem.batch_id,
            search_round: searchRound,
          }),
        });
        contentResult = await res.json();
        if (!res.ok) {
          errorMsg = contentResult?.error || `HTTP ${res.status}`;
        }
      } catch (err) {
        errorMsg = String(err);
      }

      // Update queue status
      await sb
        .from("ktrenz_b2_batch_queue")
        .update({
          status: errorMsg ? "error" : "done",
          finished_at: new Date().toISOString(),
          result: errorMsg
            ? { error: errorMsg }
            : { content_score: contentResult?.counts?.content_score || 0, search_round: searchRound },
        })
        .eq("id", nextItem.id);

      // Progress summary
      const { data: progress } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("status")
        .eq("batch_id", nextItem.batch_id);

      const summary = buildProgressSummary(progress || []);

      return new Response(JSON.stringify({
        success: true,
        action: "process_next",
        processed_star_id: nextItem.star_id,
        pair_index: nextItem.pair_index,
        side: nextItem.side,
        search_round: searchRound,
        content_score: contentResult?.counts?.content_score || 0,
        error: errorMsg,
        progress: summary,
        has_more: summary.pending > 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Action: "clear" — 큐 전체 삭제
    // ═══════════════════════════════════════════════════════════════
    if (action === "clear") {
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ success: true, action: "clear" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // Action: "status" — 현재 큐 + 배틀 상태 조회
    // ═══════════════════════════════════════════════════════════════
    if (action === "status") {
      const { data: queue } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("id, star_id, status, queue_order, result, started_at, finished_at, batch_id, pair_index, side")
        .order("queue_order", { ascending: true });

      if (!queue || queue.length === 0) {
        return new Response(JSON.stringify({ status: "empty", items: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const starIds = queue.map((q: any) => q.star_id);
      const { data: stars } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko")
        .in("id", starIds);
      const starMap = new Map((stars || []).map((s: any) => [s.id, s]));

      const items = queue.map((q: any) => ({
        ...q,
        star_name: starMap.get(q.star_id)?.display_name || "Unknown",
        star_name_ko: starMap.get(q.star_id)?.name_ko,
      }));

      const summary = {
        ...buildProgressSummary(queue),
        batch_id: queue[0]?.batch_id,
      };

      // 오늘의 battle 상태
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: battle } = await sb
        .from("ktrenz_b2_battles")
        .select("*")
        .eq("battle_date", kstDate)
        .maybeSingle();

      return new Response(JSON.stringify({ ...summary, items, battle }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Valid: start, start_round2, process_next, status, clear" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Autobatch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
