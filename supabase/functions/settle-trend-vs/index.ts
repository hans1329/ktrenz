// settle-trend-vs: 배틀 정산 — batch_id 기반 round 1 vs round 2 성장률 비교
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyBand, growthPct, settlePrediction, streakMultiplier } from "../_shared/settlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Get all pending predictions
    const { data: pending, error: pendingErr } = await sb
      .from("b2_predictions")
      .select("*")
      .eq("status", "pending")
      .limit(200);

    if (pendingErr) throw pendingErr;
    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ settled: 0, message: "No pending predictions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Collect all round 1 run_ids from predictions
    const runIds = [
      ...new Set(pending.flatMap((p: any) => [p.picked_run_id, p.opponent_run_id])),
    ];

    const { data: round1Runs } = await sb
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, batch_id, search_round, created_at")
      .in("id", runIds);

    if (!round1Runs || round1Runs.length === 0) {
      return new Response(
        JSON.stringify({ settled: 0, message: "No runs found for prediction run_ids" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const round1Map = new Map(round1Runs.map((r: any) => [r.id, r]));

    // 3. Find corresponding round 2 runs by (star_id, batch_id, search_round=2)
    const batchStarPairs = round1Runs
      .filter((r: any) => r.batch_id)
      .map((r: any) => ({ star_id: r.star_id, batch_id: r.batch_id }));

    const uniqueBatchIds = [...new Set(batchStarPairs.map(p => p.batch_id))];
    const uniqueStarIds = [...new Set(batchStarPairs.map(p => p.star_id))];

    // Query round 2 runs for all relevant stars and batches
    const { data: round2Runs } = await sb
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, batch_id, search_round, created_at")
      .in("batch_id", uniqueBatchIds)
      .in("star_id", uniqueStarIds)
      .eq("search_round", 2);

    // Build lookup: "star_id:batch_id" → round 2 run
    const round2Map = new Map<string, any>();
    for (const r of round2Runs || []) {
      const key = `${r.star_id}:${r.batch_id}`;
      // 같은 배치의 round 2가 여러 개면 가장 최신 사용
      if (!round2Map.has(key) || new Date(r.created_at) > new Date(round2Map.get(key)!.created_at)) {
        round2Map.set(key, r);
      }
    }

    // 4. Settle each prediction
    // ─── Pre-fetch streak stats for all involved users (single query) ───
    // Multiplier comes from the user's PRE-settlement hit_rate. Refreshing
    // streaks happens AFTER the loop so this batch's outcomes don't recurse.
    const userIds = [...new Set(pending.map((p: any) => p.user_id))];
    const { data: userStreaks } = await sb
      .from("ktrenz_user_points")
      .select("user_id, hit_rate_7d, hit_rate_7d_n")
      .in("user_id", userIds);
    const multiplierByUser = new Map<string, number>();
    for (const s of (userStreaks || [])) {
      multiplierByUser.set(
        s.user_id,
        streakMultiplier(s.hit_rate_7d as number | null, s.hit_rate_7d_n as number | null),
      );
    }

    let settledCount = 0;
    const results: any[] = [];
    const settledBatchIds = new Set<string>();
    const settledUserIds = new Set<string>();

    for (const pred of pending) {
      const pickedR1 = round1Map.get(pred.picked_run_id);
      const opponentR1 = round1Map.get(pred.opponent_run_id);

      if (!pickedR1 || !opponentR1) {
        results.push({ id: pred.id, skip: "missing_round1_run" });
        continue;
      }

      // Find round 2 data
      const pickedR2 = round2Map.get(`${pickedR1.star_id}:${pickedR1.batch_id}`);
      const opponentR2 = round2Map.get(`${opponentR1.star_id}:${opponentR1.batch_id}`);

      if (!pickedR2) {
        results.push({ id: pred.id, skip: "no_round2_picked", star_id: pickedR1.star_id });
        continue;
      }
      if (!opponentR2) {
        results.push({ id: pred.id, skip: "no_round2_opponent", star_id: opponentR1.star_id });
        continue;
      }

      // Calculate growth % (round 1 → round 2)
      const pickedOld = pickedR1.content_score || 1;
      const pickedNew = pickedR2.content_score || 0;
      const pickedGrowth = growthPct(pickedOld, pickedNew);

      const opponentOld = opponentR1.content_score || 1;
      const opponentNew = opponentR2.content_score || 0;
      const opponentGrowth = growthPct(opponentOld, opponentNew);

      const actualBand = classifyBand(pickedGrowth);
      const userMultiplier = multiplierByUser.get(pred.user_id) ?? 1.0;
      const settlement = settlePrediction({
        pickedGrowth,
        opponentGrowth,
        predictedBand: pred.band,
        streakMultiplier: userMultiplier,
      });
      const status = settlement.status;
      const reward = settlement.reward;

      const { error: updateErr } = await sb
        .from("b2_predictions")
        .update({
          status,
          reward_amount: reward,
          settled_at: new Date().toISOString(),
          picked_growth: Math.round(pickedGrowth),
          opponent_growth: Math.round(opponentGrowth),
        })
        .eq("id", pred.id);

      if (updateErr) {
        results.push({ id: pred.id, error: updateErr.message });
        continue;
      }

      // Award points: win reward or consolation
      if (reward > 0) {
        await sb.rpc("ktrenz_add_points" as any, {
          _user_id: pred.user_id,
          _amount: reward,
          _reason: settlement.reason,
        }).catch(() => {});
      }

      settledCount++;
      settledUserIds.add(pred.user_id);
      if (pickedR1.batch_id) settledBatchIds.add(pickedR1.batch_id);

      results.push({
        id: pred.id,
        status,
        picked: { r1_score: pickedOld, r2_score: pickedNew, growth: Math.round(pickedGrowth) },
        opponent: { r1_score: opponentOld, r2_score: opponentNew, growth: Math.round(opponentGrowth) },
        actualBand,
        predictedBand: pred.band,
        reward,
        multiplier: settlement.appliedMultiplier,
      });
    }

    // ─── Refresh streak stats for users whose predictions were settled ───
    // Use Promise.all for parallelism — these are independent SQL function
    // calls, no cross-user contention. Each call is fast (<50ms typically).
    await Promise.all(
      [...settledUserIds].map((uid) =>
        sb.rpc("ktrenz_recompute_user_streak" as any, { p_user_id: uid }).catch((e: any) => {
          console.error(`[streak] recompute failed for user=${uid}:`, e);
        })
      )
    );

    // 5. Update battle status to "settled" for all affected batches
    for (const batchId of settledBatchIds) {
      await sb
        .from("ktrenz_b2_battles")
        .update({ status: "settled", settled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("batch_id", batchId)
        .in("status", ["closed", "open"]);
    }

    return new Response(
      JSON.stringify({ settled: settledCount, total: pending.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Settlement error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
