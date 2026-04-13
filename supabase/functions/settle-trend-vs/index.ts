// settle-trend-vs: 배틀 정산 — batch_id 기반 round 1 vs round 2 성장률 비교
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BAND_THRESHOLDS: Record<string, { min: number; reward: number }> = {
  steady: { min: 15, reward: 100 },
  rising: { min: 30, reward: 300 },
  surge: { min: 80, reward: 1000 },
};
const CONSOLATION_REWARD = 10;

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
    let settledCount = 0;
    const results: any[] = [];
    const settledBatchIds = new Set<string>();

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
      const pickedGrowth = ((pickedNew - pickedOld) / Math.max(pickedOld, 1)) * 100;

      const opponentOld = opponentR1.content_score || 1;
      const opponentNew = opponentR2.content_score || 0;
      const opponentGrowth = ((opponentNew - opponentOld) / Math.max(opponentOld, 1)) * 100;

      // Determine actual band
      let actualBand = "flat";
      if (pickedGrowth >= 80) actualBand = "surge";
      else if (pickedGrowth >= 30) actualBand = "rising";
      else if (pickedGrowth >= 15) actualBand = "steady";

      // Win conditions:
      // 1. Picked artist grew more than opponent
      // 2. Growth matches or exceeds the predicted band
      const pickedWonVs = pickedGrowth > opponentGrowth;
      const bandConfig = BAND_THRESHOLDS[pred.band];
      const bandMatched = pickedGrowth >= (bandConfig?.min ?? 999);

      const won = pickedWonVs && bandMatched;
      const status = won ? "won" : "lost";
      const reward = won ? (bandConfig?.reward ?? 0) : CONSOLATION_REWARD;

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
        const reason = won ? `battle_win_${pred.band}` : "battle_consolation";
        await sb.rpc("ktrenz_add_points" as any, {
          _user_id: pred.user_id,
          _amount: reward,
          _reason: reason,
        }).catch(() => {});
      }

      settledCount++;
      if (pickedR1.batch_id) settledBatchIds.add(pickedR1.batch_id);

      results.push({
        id: pred.id,
        status,
        picked: { r1_score: pickedOld, r2_score: pickedNew, growth: Math.round(pickedGrowth) },
        opponent: { r1_score: opponentOld, r2_score: opponentNew, growth: Math.round(opponentGrowth) },
        actualBand,
        predictedBand: pred.band,
        reward,
      });
    }

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
