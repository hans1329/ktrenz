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
      .limit(100);

    if (pendingErr) throw pendingErr;
    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ settled: 0, message: "No pending predictions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Collect all unique run_ids
    const runIds = [
      ...new Set(pending.flatMap((p: any) => [p.picked_run_id, p.opponent_run_id])),
    ];

    const { data: runs } = await sb
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, created_at")
      .in("id", runIds);

    if (!runs) {
      return new Response(
        JSON.stringify({ settled: 0, message: "No runs found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const runMap = new Map(runs.map((r: any) => [r.id, r]));

    // 3. For each star involved, find the LATEST run (to compare growth)
    const starIds = [...new Set(runs.map((r: any) => r.star_id))];
    const { data: latestRuns } = await sb
      .from("ktrenz_b2_runs")
      .select("id, star_id, content_score, created_at")
      .in("star_id", starIds)
      .order("created_at", { ascending: false })
      .limit(100);

    // Build map: star_id → latest run
    const latestByStarId = new Map<string, any>();
    for (const r of latestRuns || []) {
      if (!latestByStarId.has(r.star_id)) {
        latestByStarId.set(r.star_id, r);
      }
    }

    // 4. Settle each prediction
    let settledCount = 0;
    const results: any[] = [];

    for (const pred of pending) {
      const pickedRun = runMap.get(pred.picked_run_id);
      const opponentRun = runMap.get(pred.opponent_run_id);

      if (!pickedRun || !opponentRun) {
        results.push({ id: pred.id, skip: "missing_run" });
        continue;
      }

      const pickedLatest = latestByStarId.get(pickedRun.star_id);
      const opponentLatest = latestByStarId.get(opponentRun.star_id);

      // Only settle if we have newer data than the original run
      if (!pickedLatest || pickedLatest.id === pickedRun.id) {
        results.push({ id: pred.id, skip: "no_new_data_picked" });
        continue;
      }
      if (!opponentLatest || opponentLatest.id === opponentRun.id) {
        results.push({ id: pred.id, skip: "no_new_data_opponent" });
        continue;
      }

      // Calculate growth %
      const pickedOld = pickedRun.content_score || 1;
      const pickedNew = pickedLatest.content_score || 0;
      const pickedGrowth = ((pickedNew - pickedOld) / pickedOld) * 100;

      const opponentOld = opponentRun.content_score || 1;
      const opponentNew = opponentLatest.content_score || 0;
      const opponentGrowth = ((opponentNew - opponentOld) / opponentOld) * 100;

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
      const reward = won ? (bandConfig?.reward ?? 0) : 0;

      const { error: updateErr } = await sb
        .from("b2_predictions")
        .update({
          status,
          reward_amount: reward,
          settled_at: new Date().toISOString(),
        })
        .eq("id", pred.id);

      if (updateErr) {
        results.push({ id: pred.id, error: updateErr.message });
        continue;
      }

      // Award points if won
      if (won && reward > 0) {
        await sb.rpc("ktrenz_add_points" as any, {
          _user_id: pred.user_id,
          _amount: reward,
          _reason: `battle_win_${pred.band}`,
        }).catch(() => {});
      }

      settledCount++;
      results.push({
        id: pred.id,
        status,
        pickedGrowth: Math.round(pickedGrowth),
        opponentGrowth: Math.round(opponentGrowth),
        actualBand,
        predictedBand: pred.band,
        reward,
      });
    }

    return new Response(
      JSON.stringify({ settled: settledCount, total: pending.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
