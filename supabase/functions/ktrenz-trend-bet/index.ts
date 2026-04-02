// Reward-based prediction: no K-Token wagering, just pick a band
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_OUTCOMES = ["mild", "strong", "explosive"] as const;

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

    const { triggerId, outcome } = await req.json();

    if (!triggerId || !outcome) {
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

    // Get or create market
    let { data: market } = await sb
      .from("ktrenz_trend_markets")
      .select("*")
      .eq("trigger_id", triggerId)
      .eq("status", "open")
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
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

    // Check if user already predicted for this market
    const { data: existingBet } = await sb
      .from("ktrenz_trend_bets")
      .select("id")
      .eq("market_id", market.id)
      .eq("user_id", user.id)
      .limit(1);

    if (existingBet && existingBet.length > 0) {
      return new Response(JSON.stringify({ error: "Already predicted for this market" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert prediction record (amount=0, no K-Token deducted)
    const { error: betErr } = await sb
      .from("ktrenz_trend_bets")
      .insert({
        market_id: market.id,
        user_id: user.id,
        outcome,
        amount: 0,
        shares: 0,
      });

    if (betErr) {
      console.error("[trend-bet] Insert prediction error:", betErr);
      return new Response(JSON.stringify({ error: "Failed to save prediction" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update participant count in market
    await sb
      .from("ktrenz_trend_markets")
      .update({
        total_volume: Number(market.total_volume ?? 0) + 1,
      })
      .eq("id", market.id);

    return new Response(
      JSON.stringify({ success: true, outcome }),
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
