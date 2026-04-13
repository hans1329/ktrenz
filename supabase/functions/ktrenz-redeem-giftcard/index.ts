import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RELOADLY_AUTH_URL = "https://auth.reloadly.com/oauth/token";
// Sandbox: https://giftcards-sandbox.reloadly.com
// Production: https://giftcards.reloadly.com
const RELOADLY_API_URL = "https://giftcards-sandbox.reloadly.com";

async function getReloadlyToken(): Promise<string> {
  const clientId = Deno.env.get("RELOADLY_CLIENT_ID");
  const clientSecret = Deno.env.get("RELOADLY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Reloadly credentials not configured");

  const res = await fetch(RELOADLY_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      audience: "https://giftcards-sandbox.reloadly.com",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Reloadly auth failed [${res.status}]: ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ── List available products ──
    if (action === "list_products") {
      const { country_code = "US" } = body;
      const token = await getReloadlyToken();

      const res = await fetch(
        `${RELOADLY_API_URL}/countries/${country_code}/products?includeRange=true&includeFixed=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/com.reloadly.giftcards-v1+json",
          },
        }
      );

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Reloadly products API failed [${res.status}]: ${errBody}`);
      }

      const products = await res.json();

      // Filter Spotify-related products
      const spotifyProducts = (products as any[]).filter((p: any) =>
        p.productName?.toLowerCase().includes("spotify") ||
        p.brand?.brandName?.toLowerCase().includes("spotify")
      );

      return new Response(JSON.stringify({ products: spotifyProducts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Order a gift card ──
    if (action === "order") {
      const { product_id, denomination, country_code = "US" } = body;
      if (!product_id || !denomination) {
        return new Response(JSON.stringify({ error: "product_id and denomination required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check user's K-Cash balance
      const kcashCost = Math.ceil(denomination * 1000); // e.g. $10 = 10,000 K-Cash
      const { data: txRows } = await supabaseAdmin
        .from("ktrenz_point_transactions")
        .select("amount")
        .eq("user_id", user.id);

      const balance = (txRows ?? []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

      if (balance < kcashCost) {
        return new Response(
          JSON.stringify({ error: "Insufficient K-Cash", balance, required: kcashCost }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create order record first
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("ktrenz_giftcard_orders")
        .insert({
          user_id: user.id,
          product_id,
          product_name: body.product_name || "Spotify Gift Card",
          country_code,
          denomination,
          currency_code: body.currency_code || "USD",
          kcash_cost: kcashCost,
          status: "pending",
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      // Deduct K-Cash
      await supabaseAdmin.from("ktrenz_point_transactions").insert({
        user_id: user.id,
        amount: -kcashCost,
        reason: "giftcard_redeem",
        description: `Gift card redemption: ${body.product_name || "Spotify"} $${denomination}`,
        metadata: { order_id: order.id },
      });

      // Call Reloadly to order
      try {
        const token = await getReloadlyToken();

        const orderRes = await fetch(`${RELOADLY_API_URL}/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/com.reloadly.giftcards-v1+json",
          },
          body: JSON.stringify({
            productId: product_id,
            countryCode: country_code,
            quantity: 1,
            unitPrice: denomination,
            customIdentifier: order.id,
            senderName: "KTrenZ",
            recipientEmail: "", // Empty = no email, we'll get pin from response
            recipientPhoneDetails: {},
          }),
        });

        if (!orderRes.ok) {
          const errBody = await orderRes.text();
          // Refund K-Cash on failure
          await supabaseAdmin.from("ktrenz_point_transactions").insert({
            user_id: user.id,
            amount: kcashCost,
            reason: "giftcard_refund",
            description: `Refund for failed gift card order`,
            metadata: { order_id: order.id },
          });

          await supabaseAdmin
            .from("ktrenz_giftcard_orders")
            .update({ status: "failed", error_message: errBody })
            .eq("id", order.id);

          throw new Error(`Reloadly order failed [${orderRes.status}]: ${errBody}`);
        }

        const orderData = await orderRes.json();

        // Extract pin/code from response
        const pinCode =
          orderData.product?.pinCode ||
          orderData.redeemCode?.cardNumber ||
          orderData.cardNumber ||
          null;

        await supabaseAdmin
          .from("ktrenz_giftcard_orders")
          .update({
            status: "fulfilled",
            reloadly_transaction_id: orderData.transactionId,
            pin_code: pinCode,
            fulfilled_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        return new Response(
          JSON.stringify({
            success: true,
            order_id: order.id,
            transaction_id: orderData.transactionId,
            pin_code: pinCode,
            kcash_deducted: kcashCost,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (reloadlyError) {
        // If we haven't already handled the refund
        const errorMsg = (reloadlyError as Error).message;
        if (!errorMsg.includes("Reloadly order failed")) {
          await supabaseAdmin.from("ktrenz_point_transactions").insert({
            user_id: user.id,
            amount: kcashCost,
            reason: "giftcard_refund",
            description: `Refund for failed gift card order`,
            metadata: { order_id: order.id },
          });
          await supabaseAdmin
            .from("ktrenz_giftcard_orders")
            .update({ status: "failed", error_message: errorMsg })
            .eq("id", order.id);
        }
        throw reloadlyError;
      }
    }

    // ── Get user's order history ──
    if (action === "history") {
      const { data: orders } = await supabaseAdmin
        .from("ktrenz_giftcard_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ orders: orders ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Gift card error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
