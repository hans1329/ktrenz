// Market Lifecycle Automation
// Called after track phase completes:
// 1) Settle all expired open markets (reward payouts)
// 2) Open new markets for active keywords with baseline_score > 0
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REWARDS: Record<string, number> = {
  mild: 100,
  strong: 300,
  explosive: 1000,
};
const CONSOLATION_REWARD = 10;

function determineOutcome(initialScore: number, currentScore: number): string {
  const changePct = initialScore > 0
    ? ((currentScore - initialScore) / initialScore) * 100
    : currentScore > 0 ? 100 : 0;

  if (changePct < 10) return "flat";
  if (changePct < 15) return "mild";
  if (changePct < 50) return "strong";
  return "explosive";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    let settledCount = 0;
    let openedCount = 0;
    let totalRewards = 0;
    let trackFailRefunds = 0;

    // ═══ PHASE 1: Settle expired open markets ═══
    const { data: expiredMarkets } = await sb
      .from("ktrenz_trend_markets")
      .select("*, ktrenz_trend_triggers!inner(influence_index, status)")
      .eq("status", "open")
      .lte("expires_at", now.toISOString());

    for (const market of expiredMarkets || []) {
      const triggerStatus = market.ktrenz_trend_triggers?.status;
      const currentScore = Number(market.ktrenz_trend_triggers?.influence_index ?? 0);
      const initialScore = Number(market.initial_influence ?? 0);

      // Fetch predictions for this market
      const { data: bets } = await sb
        .from("ktrenz_trend_bets")
        .select("*")
        .eq("market_id", market.id);

      // If trigger tracking failed (no score change possible), refund all participants
      const isTrackFail = triggerStatus === "expired" || currentScore === 0;
      const outcome = isTrackFail ? "track_fail" : determineOutcome(initialScore, currentScore);

      if (bets && bets.length > 0) {
        const rewardPromises: Promise<any>[] = [];

        for (const bet of bets) {
          let reward: number;
          if (isTrackFail) {
            reward = CONSOLATION_REWARD; // Track failure: consolation only
            trackFailRefunds++;
          } else if (outcome !== "flat" && bet.outcome === outcome) {
            reward = REWARDS[outcome] ?? CONSOLATION_REWARD;
          } else {
            reward = CONSOLATION_REWARD; // Wrong or flat
          }

          rewardPromises.push(
            sb.rpc("ktrenz_increment_points" as any, {
              p_user_id: bet.user_id,
              p_amount: reward,
            })
          );
          rewardPromises.push(
            sb.from("ktrenz_trend_bets").update({ payout: reward }).eq("id", bet.id)
          );
          totalRewards += reward;
        }

        await Promise.allSettled(rewardPromises);
      }

      await sb
        .from("ktrenz_trend_markets")
        .update({ status: "settled", outcome, settled_at: now.toISOString() })
        .eq("id", market.id);

      settledCount++;
      const changePct = initialScore > 0
        ? ((currentScore - initialScore) / initialScore * 100).toFixed(1)
        : "N/A";
      console.log(`[market-lifecycle] Settled: ${market.id} outcome=${outcome} change=${changePct}%`);
    }

    // ═══ PHASE 2: Open new markets for active keywords ═══
    // Only keywords with 2+ tracking records (= has comparison baseline)
    const { data: activeTriggers } = await sb
      .from("ktrenz_trend_triggers")
      .select("id, influence_index, baseline_score")
      .eq("status", "active")
      .gt("baseline_score", 0);

    if (activeTriggers && activeTriggers.length > 0) {
      const triggerIds = activeTriggers.map((t: any) => t.id);

      // Count tracking records per trigger to ensure ≥2 tracks exist
      const { data: trackCounts } = await sb
        .from("ktrenz_trend_tracking")
        .select("trigger_id")
        .in("trigger_id", triggerIds);

      const trackCountMap = new Map<string, number>();
      for (const row of trackCounts || []) {
        trackCountMap.set(row.trigger_id, (trackCountMap.get(row.trigger_id) || 0) + 1);
      }

      // Filter: must have ≥2 tracking records (baseline + at least one delta)
      const eligibleTriggers = activeTriggers.filter(
        (t: any) => (trackCountMap.get(t.id) || 0) >= 2
      );

      console.log(`[market-lifecycle] Eligible: ${eligibleTriggers.length}/${activeTriggers.length} (need ≥2 tracks)`);

      if (eligibleTriggers.length > 0) {
        const eligibleIds = eligibleTriggers.map((t: any) => t.id);

        // Check which ones already have an open market
        const { data: existingMarkets } = await sb
          .from("ktrenz_trend_markets")
          .select("trigger_id")
          .in("trigger_id", eligibleIds)
          .eq("status", "open");

        const existingSet = new Set((existingMarkets || []).map((m: any) => m.trigger_id));

        // 22:00 KST cutoff = expires_at set to next day 00:00 KST (15:00 UTC)
        const expiresAt = new Date(now);
        expiresAt.setUTCHours(15, 0, 0, 0); // Next 00:00 KST
        if (expiresAt.getTime() <= now.getTime()) {
          expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
        }

        const newMarkets = eligibleTriggers
          .filter((t: any) => !existingSet.has(t.id))
          .map((t: any) => ({
            trigger_id: t.id,
            pool_mild: 0,
            pool_strong: 0,
            pool_explosive: 0,
            total_volume: 0,
            status: "open",
            initial_influence: t.influence_index ?? 0,
            expires_at: expiresAt.toISOString(),
          }));

        if (newMarkets.length > 0) {
          for (let i = 0; i < newMarkets.length; i += 500) {
            const chunk = newMarkets.slice(i, i + 500);
            const { error } = await sb
              .from("ktrenz_trend_markets")
              .insert(chunk);
            if (error) {
              console.error(`[market-lifecycle] Batch insert error:`, error);
            } else {
              openedCount += chunk.length;
            }
          }
        }
      }
    }

    console.log(`[market-lifecycle] Done: settled=${settledCount} opened=${openedCount} rewards=${totalRewards} trackFail=${trackFailRefunds}`);

    return new Response(
      JSON.stringify({ success: true, settledCount, openedCount, totalRewards, trackFailRefunds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[market-lifecycle] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
