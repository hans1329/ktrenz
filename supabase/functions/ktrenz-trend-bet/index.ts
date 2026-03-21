// Fixed-multiplier prediction market: 3 outcomes with tiered payouts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_OUTCOMES = ["mild", "strong", "explosive"] as const;
type Outcome = typeof VALID_OUTCOMES[number];

// Fixed payout multipliers
const MULTIPLIERS: Record<Outcome, number> = {
  mild: 1.2,
  strong: 3.0,
  explosive: 10.0,
};

// Settlement thresholds (influence_index % change)
// mild: +0% ~ +15%
// strong: +15% ~ +50%
// explosive: +50%+
const THRESHOLDS = {
  mild: { min: 0, max: 15 },
  strong: { min: 15, max: 100 },
  explosive: { min: 100, max: Infinity },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { triggerId, outcome, amount } = await req.json();

    if (!triggerId || !outcome || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_OUTCOMES.includes(outcome)) {
      return new Response(JSON.stringify({ error: "Invalid outcome. Must be: mild, strong, explosive" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const betAmount = Number(amount);
    if (isNaN(betAmount) || betAmount < 10) {
      return new Response(JSON.stringify({ error: "Minimum bet is 10 K-Token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (betAmount > 1000) {
      return new Response(JSON.stringify({ error: "Maximum bet is 1000 K-Token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user has enough points
    const { data: pointsData } = await sb
      .from("ktrenz_user_points")
      .select("points")
      .eq("user_id", user.id)
      .single();

    const currentPoints = pointsData?.points ?? 0;
    if (currentPoints < betAmount) {
      return new Response(JSON.stringify({ error: "Insufficient K-Token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get or create market
    let { data: market } = await sb
      .from("ktrenz_trend_markets")
      .select("*")
      .eq("trigger_id", triggerId)
      .single();

    if (!market) {
      const { data: trigger } = await sb
        .from("ktrenz_trend_triggers")
        .select("influence_index")
        .eq("id", triggerId)
        .single();

      const { data: newMarket, error: createErr } = await sb
        .from("ktrenz_trend_markets")
        .insert({
          trigger_id: triggerId,
          pool_mild: 0,
          pool_strong: 0,
          pool_explosive: 0,
          total_volume: 0,
          status: "open",
          initial_influence: trigger?.influence_index ?? 0,
        })
        .select()
        .single();

      if (createErr) {
        console.error("[trend-bet] Create market error:", createErr);
        return new Response(JSON.stringify({ error: "Failed to create market" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      market = newMarket;
    }

    if (market.status !== "open") {
      return new Response(JSON.stringify({ error: "Market is closed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fixed multiplier: shares = amount * multiplier (potential payout)
    const multiplier = MULTIPLIERS[outcome as Outcome];
    const shares = betAmount * multiplier;

    // Deduct points
    await sb.rpc("ktrenz_increment_points" as any, {
      p_user_id: user.id,
      p_amount: -betAmount,
    });

    // Update market pools (track total bet per outcome)
    const poolKey = `pool_${outcome}`;
    const currentPool = Number(market[poolKey] ?? 0);
    const { error: updateErr } = await sb
      .from("ktrenz_trend_markets")
      .update({
        [poolKey]: currentPool + betAmount,
        total_volume: Number(market.total_volume) + betAmount,
      })
      .eq("id", market.id);

    if (updateErr) {
      await sb.rpc("ktrenz_increment_points" as any, {
        p_user_id: user.id,
        p_amount: betAmount,
      });
      console.error("[trend-bet] Update market error:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to update market" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert bet record
    const { error: betErr } = await sb
      .from("ktrenz_trend_bets")
      .insert({
        market_id: market.id,
        user_id: user.id,
        outcome,
        amount: betAmount,
        shares,
      });

    if (betErr) {
      console.error("[trend-bet] Insert bet error:", betErr);
    }

    // Return updated pools
    const pools = {
      mild: Number(market.pool_mild ?? 0) + (outcome === "mild" ? betAmount : 0),
      strong: Number(market.pool_strong ?? 0) + (outcome === "strong" ? betAmount : 0),
      explosive: Number(market.pool_explosive ?? 0) + (outcome === "explosive" ? betAmount : 0),
    };

    return new Response(
      JSON.stringify({
        success: true,
        shares: Math.round(shares * 100) / 100,
        multiplier,
        pools,
        totalVolume: Number(market.total_volume) + betAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-bet] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
