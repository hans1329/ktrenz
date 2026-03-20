// FPMM Prediction Market: Place bet on trend keyword
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { triggerId, side, amount } = await req.json();

    // Validate input
    if (!triggerId || !side || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["yes", "no"].includes(side)) {
      return new Response(JSON.stringify({ error: "Invalid side" }), {
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
      // Create market with seed liquidity
      const { data: newMarket, error: createErr } = await sb
        .from("ktrenz_trend_markets")
        .insert({
          trigger_id: triggerId,
          pool_yes: 100,
          pool_no: 100,
          total_volume: 0,
          status: "open",
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

    // FPMM calculation
    // Constant product: k = pool_yes * pool_no
    // User buys shares of `side`, adding `amount` to opposite pool
    const poolYes = Number(market.pool_yes);
    const poolNo = Number(market.pool_no);
    const k = poolYes * poolNo;

    let shares: number;
    let newPoolYes: number;
    let newPoolNo: number;

    if (side === "yes") {
      // User adds to YES pool, receives YES shares
      // New pool_no after adding bet: pool_no + amount
      // New pool_yes = k / new_pool_no
      // Shares = old_pool_yes + amount - new_pool_yes
      newPoolNo = poolNo + betAmount;
      newPoolYes = k / newPoolNo;
      shares = poolYes + betAmount - newPoolYes;
    } else {
      newPoolYes = poolYes + betAmount;
      newPoolNo = k / newPoolYes;
      shares = poolNo + betAmount - newPoolNo;
    }

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
        pool_yes: newPoolYes,
        pool_no: newPoolNo,
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
        side,
        amount: betAmount,
        shares,
      });

    if (betErr) {
      console.error("[trend-bet] Insert bet error:", betErr);
    }

    // Calculate new prices for response
    const priceYes = newPoolNo / (newPoolYes + newPoolNo);
    const priceNo = newPoolYes / (newPoolYes + newPoolNo);

    return new Response(
      JSON.stringify({
        success: true,
        shares: Math.round(shares * 100) / 100,
        priceYes: Math.round(priceYes * 1000) / 1000,
        priceNo: Math.round(priceNo * 1000) / 1000,
        poolYes: Math.round(newPoolYes * 100) / 100,
        poolNo: Math.round(newPoolNo * 100) / 100,
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
