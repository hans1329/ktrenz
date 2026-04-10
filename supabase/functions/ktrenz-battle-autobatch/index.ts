// ktrenz-battle-autobatch: prescore 결과의 선발 아티스트 대상 content-search 순차 실행
// DB 기반 상태머신 — 한 번 호출 시 1명씩 처리하고 다음 대상을 큐에서 가져감
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Action: "start" — prescore 결과에서 선발 목록을 가져와 큐에 등록
    if (action === "start") {
      const starIds: string[] = body.star_ids || [];
      if (!starIds.length) {
        return new Response(JSON.stringify({ error: "No star_ids provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Clear existing queue
      await sb.from("ktrenz_b2_batch_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      // Insert queue items
      const batchId = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      const queueItems = starIds.map((sid, idx) => ({
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
        queued: starIds.length,
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
