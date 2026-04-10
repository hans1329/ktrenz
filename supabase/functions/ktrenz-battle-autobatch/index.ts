// ktrenz-battle-autobatch: prescore 결과 기반 쿨다운+티어 선발 → content-search 순차 실행
// DB 기반 상태머신 — 한 번 호출 시 1명씩 처리하고 다음 대상을 큐에서 가져감
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

    // Action: "start" — prescore 결과에서 쿨다운+티어 선발 후 큐에 등록
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
      const totalScored = scoredResults.length;

      if (totalScored === 0) {
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

      // 3. 티어별 선발
      const selectedStarIds: string[] = [];
      for (const tier of TIER_CONFIG) {
        const startIdx = Math.floor(totalScored * tier.startPct);
        const endIdx = Math.floor(totalScored * tier.endPct);
        const tierPool = scoredResults.slice(startIdx, endIdx);
        const available = tierPool.filter((r: any) => !recentStarIds.has(r.star_id));
        const cooldownOnly = tierPool.filter((r: any) => recentStarIds.has(r.star_id));
        const shuffled = shuffle(available);
        const picked = shuffled.slice(0, tier.count);
        if (picked.length < tier.count) {
          const remaining = tier.count - picked.length;
          picked.push(...shuffle(cooldownOnly).slice(0, remaining));
        }
        selectedStarIds.push(...picked.map((r: any) => r.star_id));
      }

      // 4. Clear existing queue & insert selected
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const queueItems = selectedStarIds.map((sid, idx) => ({
        star_id: sid,
        batch_id: batchId,
        queue_order: idx,
        status: "pending",
      }));

      for (let i = 0; i < queueItems.length; i += 100) {
        await sb.from("ktrenz_b2_batch_queue").insert(queueItems.slice(i, i + 100));
      }

      return new Response(JSON.stringify({
        success: true,
        action: "start",
        batch_id: batchId,
        total_scored: totalScored,
        cooldown_excluded: recentStarIds.size,
        queued: selectedStarIds.length,
        selected: selectedStarIds,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: "process_next" — 큐에서 다음 pending 아이템을 가져와 content-search 호출
    if (action === "process_next") {
      // Get next pending item
      const { data: nextItem } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("id, star_id, batch_id, queue_order")
        .eq("status", "pending")
        .order("queue_order", { ascending: true })
        .limit(1)
        .single();

      if (!nextItem) {
        // Queue empty - all done
        return new Response(JSON.stringify({
          success: true,
          action: "process_next",
          status: "queue_empty",
          message: "All items processed",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as running
      await sb
        .from("ktrenz_b2_batch_queue")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", nextItem.id);

      // Call content-search
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
          body: JSON.stringify({ star_id: nextItem.star_id }),
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
            : { content_score: contentResult?.counts?.content_score || 0 },
        })
        .eq("id", nextItem.id);

      // Get progress summary
      const { data: progress } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("status")
        .eq("batch_id", nextItem.batch_id);

      const summary = {
        total: progress?.length || 0,
        done: progress?.filter((p: any) => p.status === "done").length || 0,
        error: progress?.filter((p: any) => p.status === "error").length || 0,
        pending: progress?.filter((p: any) => p.status === "pending").length || 0,
        running: progress?.filter((p: any) => p.status === "running").length || 0,
      };

      return new Response(JSON.stringify({
        success: true,
        action: "process_next",
        processed_star_id: nextItem.star_id,
        content_score: contentResult?.counts?.content_score || 0,
        error: errorMsg,
        progress: summary,
        has_more: summary.pending > 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: "clear" — 멈춘 큐 전체 삭제
    if (action === "clear") {
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return new Response(JSON.stringify({ success: true, action: "clear" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: "status" — 현재 큐 상태 조회
    if (action === "status") {
      const { data: queue } = await sb
        .from("ktrenz_b2_batch_queue")
        .select("id, star_id, status, queue_order, result, started_at, finished_at, batch_id")
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
        total: queue.length,
        done: queue.filter((q: any) => q.status === "done").length,
        error: queue.filter((q: any) => q.status === "error").length,
        pending: queue.filter((q: any) => q.status === "pending").length,
        running: queue.filter((q: any) => q.status === "running").length,
        batch_id: queue[0]?.batch_id,
      };

      return new Response(JSON.stringify({ ...summary, items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Autobatch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
