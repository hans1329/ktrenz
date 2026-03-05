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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { package_key } = await req.json();
    if (!package_key) throw new Error("package_key required");

    // Fetch package from DB
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: pkg, error: pkgError } = await adminClient
      .from("ktrenz_point_packages")
      .select("package_key, points, price_cents, stripe_price_id, currency")
      .eq("package_key", package_key)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) throw new Error("Invalid or inactive package");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) customerId = customers.data[0].id;

    const origin = req.headers.get("origin") || "https://ktrenz.lovable.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
      mode: "payment",
      success_url: `${origin}/agent?purchase=success&session_id={CHECKOUT_ID}`,
      cancel_url: `${origin}/agent?purchase=cancelled`,
      metadata: {
        user_id: user.id,
        package_key: pkg.package_key,
        points_amount: String(pkg.points),
      },
    });

    // Record pending purchase
    await adminClient.from("ktrenz_point_purchases").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      package_key: pkg.package_key,
      points_amount: pkg.points,
      price_cents: pkg.price_cents,
      currency: pkg.currency || "usd",
      status: "pending",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
