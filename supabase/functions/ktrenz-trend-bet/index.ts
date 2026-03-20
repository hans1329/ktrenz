// Multi-outcome CPMM Prediction Market: Predict trend growth range
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_OUTCOMES = ["decline", "mild", "strong", "explosive"] as const;
type Outcome = typeof VALID_OUTCOMES[number];

const POOL_KEYS: Record<Outcome, string> = {
  decline: "pool_decline",
  mild: "pool_mild",
  strong: "pool_strong",
  explosive: "pool_explosive",
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

    // Verify user
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

    // Validate input
    if (!triggerId || !outcome || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VALID_OUTCOMES.includes(outcome)) {
      return new Response(JSON.stringify({ error: "Invalid outcome. Must be: decline, mild, strong, explosive" }), {
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
      // Get current influence_index to record initial state
      const { data: trigger } = await sb
        .from("ktrenz_trend_triggers")
        .select("influence_index")
        .eq("id", triggerId)
        .single();

      const { data: newMarket, error: createErr } = await sb
        .from("ktrenz_trend_markets")
        .insert({
          trigger_id: triggerId,
          pool_decline: 100,
          pool_mild: 100,
          pool_strong: 100,
          pool_explosive: 100,
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

    // Multi-outcome CPMM calculation
    // k = product of all pools
    // User buys shares of `outcome`: add betAmount to all OTHER pools
    // New pool for chosen outcome = k / product(other new pools)
    // Shares = old_pool_chosen + betAmount - new_pool_chosen
    const pools: Record<Outcome, number> = {
      decline: Number(market.pool_decline),
      mild: Number(market.pool_mild),
      strong: Number(market.pool_strong),
      explosive: Number(market.pool_explosive),
    };

    const k = pools.decline * pools.mild * pools.strong * pools.explosive;

    // Add betAmount to all pools except the chosen one
    const newPools = { ...pools };
    for (const o of VALID_OUTCOMES) {
      if (o !== outcome) {
        newPools[o] = pools[o] + betAmount;
      }
    }

    // Calculate new pool for chosen outcome from constant product
    const productOthers = VALID_OUTCOMES
      .filter(o => o !== outcome)
      .reduce((p, o) => p * newPools[o], 1);

    newPools[outcome as Outcome] = k / productOthers;

    const shares = pools[outcome as Outcome] + betAmount - newPools[outcome as Outcome];

    if (shares <= 0) {
      return new Response(JSON.stringify({ error: "Invalid bet calculation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct points
    await sb.rpc("ktrenz_increment_points" as any, {
      p_user_id: user.id,
      p_amount: -betAmount,
    });

    // Update market pools
    const { error: updateErr } = await sb
      .from("ktrenz_trend_markets")
      .update({
        pool_decline: newPools.decline,
        pool_mild: newPools.mild,
        pool_strong: newPools.strong,
        pool_explosive: newPools.explosive,
        total_volume: Number(market.total_volume) + betAmount,
      })
      .eq("id", market.id);

    if (updateErr) {
      // Refund points on failure
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

    // Calculate prices for response (price = product of OTHER pools / sum of all such products)
    const totalPool = newPools.decline + newPools.mild + newPools.strong + newPools.explosive;
    const prices: Record<string, number> = {};
    for (const o of VALID_OUTCOMES) {
      // Price of outcome o = (sum of other pools) / (N-1) / totalPool ... 
      // Actually for CPMM: price_i = (1/pool_i) / sum(1/pool_j for all j)
      prices[o] = (1 / newPools[o]);
    }
    const priceSum = Object.values(prices).reduce((s, p) => s + p, 0);
    for (const o of VALID_OUTCOMES) {
      prices[o] = prices[o] / priceSum;
    }

    return new Response(
      JSON.stringify({
        success: true,
        shares: Math.round(shares * 100) / 100,
        prices: {
          decline: Math.round(prices.decline * 1000) / 1000,
          mild: Math.round(prices.mild * 1000) / 1000,
          strong: Math.round(prices.strong * 1000) / 1000,
          explosive: Math.round(prices.explosive * 1000) / 1000,
        },
        pools: {
          decline: Math.round(newPools.decline * 100) / 100,
          mild: Math.round(newPools.mild * 100) / 100,
          strong: Math.round(newPools.strong * 100) / 100,
          explosive: Math.round(newPools.explosive * 100) / 100,
        },
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
