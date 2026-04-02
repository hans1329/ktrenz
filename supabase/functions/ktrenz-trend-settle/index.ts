// Fixed-multiplier settlement with loss zone
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MULTIPLIERS: Record<string, number> = {
  meaningful: 1.5,
  significant: 3.0,
  explosive: 10.0,
};

/** Determine outcome based on % change from initial trend score.
 *  "flat" = loss zone (< +15%) — all bets lose.
 */
function determineOutcome(initialScore: number, currentScore: number): string {
  const changePct = initialScore > 0
    ? ((currentScore - initialScore) / initialScore) * 100
    : currentScore > 0 ? 100 : 0;

  if (changePct < 15) return "flat";             // loss zone
  if (changePct < 50) return "meaningful";        // +15% ~ +50%
  if (changePct < 150) return "significant";      // +50% ~ +150%
  return "explosive";                              // +150%+
}

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
    let totalPayouts = 0;

    for (const market of markets) {
      const currentScore = Number(market.ktrenz_trend_triggers?.influence_index ?? 0);
      const initialScore = Number(market.initial_influence ?? 0);
      const outcome = determineOutcome(initialScore, currentScore);

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

      // If outcome is "flat", ALL bets lose (loss zone)
      const winningBets = outcome === "flat" ? [] : bets.filter((b: any) => b.outcome === outcome);
      const losingBets = outcome === "flat" ? bets : bets.filter((b: any) => b.outcome !== outcome);

      const payoutPromises: Promise<any>[] = [];

      for (const bet of winningBets) {
        const payout = Math.round(Number(bet.amount) * MULTIPLIERS[outcome]);
        if (payout > 0) {
          payoutPromises.push(
            sb.rpc("ktrenz_increment_points" as any, {
              p_user_id: bet.user_id,
              p_amount: payout,
            })
          );
          payoutPromises.push(
            sb.from("ktrenz_trend_bets").update({ payout }).eq("id", bet.id)
          );
          totalPayouts += payout;
        }
      }

      for (const bet of losingBets) {
        payoutPromises.push(
          sb.from("ktrenz_trend_bets").update({ payout: 0 }).eq("id", bet.id)
        );
      }

      await Promise.allSettled(payoutPromises);

      await sb
        .from("ktrenz_trend_markets")
        .update({ status: "settled", outcome, settled_at: new Date().toISOString() })
        .eq("id", market.id);

      settledCount++;
      const changePct = initialScore > 0
        ? ((currentScore - initialScore) / initialScore * 100).toFixed(1)
        : "N/A";
      console.log(`[trend-settle] Market ${market.id}: outcome=${outcome}, change=${changePct}%, winners=${winningBets.length}, losers=${losingBets.length}`);
    }

    return new Response(
      JSON.stringify({ success: true, settledCount, totalPayouts, marketsChecked: markets.length }),
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
