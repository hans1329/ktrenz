// Multi-outcome CPMM Settlement: Settle markets based on influence_index change
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Determine winning outcome based on % change from initial influence */
function determineOutcome(initialInfluence: number, currentInfluence: number): string {
  const changePct = initialInfluence > 0
    ? ((currentInfluence - initialInfluence) / initialInfluence) * 100
    : currentInfluence > 0 ? 100 : 0;

  if (changePct < 10) return "decline";      // < +10% = decline/flat
  if (changePct < 50) return "mild";          // +10% ~ +50%
  if (changePct < 100) return "strong";       // +50% ~ +100%
  return "explosive";                          // +100%+
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

    // Get markets to settle
    let markets: any[];
    if (marketId) {
      const { data } = await sb
        .from("ktrenz_trend_markets")
        .select("*, ktrenz_trend_triggers!inner(influence_index)")
        .eq("id", marketId)
        .eq("status", "open");
      markets = data || [];
    } else {
      // Auto-settle: expired markets
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
      const currentInfluence = Number(market.ktrenz_trend_triggers?.influence_index ?? 0);
      const initialInfluence = Number(market.initial_influence ?? 0);
      const outcome = determineOutcome(initialInfluence, currentInfluence);

      // Get all bets for this market
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

      // Calculate total shares for winning outcome
      const winningBets = bets.filter((b: any) => b.outcome === outcome);
      const losingBets = bets.filter((b: any) => b.outcome !== outcome);
      const totalWinningShares = winningBets.reduce((s: number, b: any) => s + Number(b.shares), 0);
      const totalPool = bets.reduce((s: number, b: any) => s + Number(b.amount), 0);

      // Distribute payouts proportionally to winning shares
      const payoutPromises: Promise<any>[] = [];

      for (const bet of winningBets) {
        const shareRatio = totalWinningShares > 0 ? Number(bet.shares) / totalWinningShares : 0;
        const payout = Math.round(totalPool * shareRatio);

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

      // Mark losing bets with 0 payout
      for (const bet of losingBets) {
        payoutPromises.push(
          sb.from("ktrenz_trend_bets").update({ payout: 0 }).eq("id", bet.id)
        );
      }

      await Promise.allSettled(payoutPromises);

      // Update market status
      await sb
        .from("ktrenz_trend_markets")
        .update({ status: "settled", outcome, settled_at: new Date().toISOString() })
        .eq("id", market.id);

      settledCount++;
      const changePct = initialInfluence > 0
        ? ((currentInfluence - initialInfluence) / initialInfluence * 100).toFixed(1)
        : "N/A";
      console.log(`[trend-settle] Market ${market.id}: outcome=${outcome}, change=${changePct}%, winners=${winningBets.length}, pool=${totalPool}`);
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
