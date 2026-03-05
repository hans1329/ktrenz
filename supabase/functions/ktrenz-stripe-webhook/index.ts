import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const pointsAmount = parseInt(session.metadata?.points_amount || "0", 10);
    const packageKey = session.metadata?.package_key;

    if (!userId || !pointsAmount) {
      console.error("Missing metadata in session", session.id);
      return new Response("OK", { status: 200 });
    }

    console.log(`[WEBHOOK] Crediting ${pointsAmount} points to user ${userId}`);

    // Update purchase record
    await supabase
      .from("ktrenz_point_purchases")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        stripe_payment_intent_id: session.payment_intent as string,
      })
      .eq("stripe_session_id", session.id);

    // Credit points via upsert
    const { data: existing } = await supabase
      .from("ktrenz_user_points")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();

    const currentPoints = existing?.points ?? 0;
    await supabase
      .from("ktrenz_user_points")
      .upsert(
        { user_id: userId, points: currentPoints + pointsAmount },
        { onConflict: "user_id" },
      );

    // Record transaction
    await supabase.from("ktrenz_point_transactions").insert({
      user_id: userId,
      points: pointsAmount,
      reason: `Purchased K-Points ${packageKey} pack`,
      source: "stripe_purchase",
    });

    console.log(`[WEBHOOK] Successfully credited ${pointsAmount} points to ${userId}`);
  }

  return new Response("OK", { status: 200 });
});
