// Reward-based settlement: fixed rewards, no betting multipliers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyTrendOutcome, trendBetReward } from "../_shared/settlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { marketId } = body;

    let markets: any[];
    if (marketId) {
      const { data } = await sb
        .from("ktrenz_trend_markets")
        .select("*, ktrenz_trend_triggers!inner(influence_index)")
        .eq("id", marketId)
        .eq("status", "open");
      markets = data || [];
    } else {
      const { data } = await sb
        .from("ktrenz_trend_markets")
        .select("*, ktrenz_trend_triggers!inner(influence_index)")
        .eq("status", "open")
        .lte("expires_at", new Date().toISOString());
      markets = data || [];
    }

    let settledCount = 0;
    let totalRewards = 0;

    for (const market of markets) {
      const currentScore = Number(market.ktrenz_trend_triggers?.influence_index ?? 0);
      const initialScore = Number(market.initial_influence ?? 0);
      const outcome = classifyTrendOutcome(initialScore, currentScore);

      const { data: bets } = await sb
        .from("ktrenz_trend_bets")
        .select("*")
        .eq("market_id", market.id);

      if (!bets || bets.length === 0) {
        await sb
          .from("ktrenz_trend_markets")
          .update({ status: "settled", outcome, settled_at: new Date().toISOString() })
          .eq("id", market.id);
        settledCount++;
        continue;
      }

      const rewardPromises: Promise<any>[] = [];

      for (const bet of bets) {
        const reward = trendBetReward(outcome, bet.outcome);

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

      await sb
        .from("ktrenz_trend_markets")
        .update({ status: "settled", outcome, settled_at: new Date().toISOString() })
        .eq("id", market.id);

      settledCount++;
      const changePct = initialScore > 0
        ? ((currentScore - initialScore) / initialScore * 100).toFixed(1)
        : "N/A";
      const winners = outcome !== "flat" ? bets.filter((b: any) => b.outcome === outcome).length : 0;
      console.log(`[trend-settle] Market ${market.id}: outcome=${outcome}, change=${changePct}%, winners=${winners}/${bets.length}`);
    }

    return new Response(
      JSON.stringify({ success: true, settledCount, totalRewards, marketsChecked: markets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-settle] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
