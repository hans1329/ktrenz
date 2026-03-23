import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, org_id, star_id, context } = await req.json();
    if (!type || !org_id) {
      return new Response(JSON.stringify({ error: "type and org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Check cache
    const { data: cached } = await sb
      .from("ktrenz_b2b_ai_insights")
      .select("content, generated_at")
      .eq("org_id", org_id)
      .eq("insight_type", type)
      .gt("expires_at", new Date().toISOString())
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({ insight: cached.content, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build prompt based on type
    const systemPrompts: Record<string, string> = {
      trend_comparison: `You are a K-Pop trend intelligence analyst for B2B clients. Analyze Pre/Post trend data for stars and provide actionable insights. Focus on: search volume changes, sentiment shifts, purchase intent indicators, and commercial impact. Format with clear sections and bullet points. Respond in English.`,
      star_benchmark: `You are a competitive intelligence analyst for K-Pop marketing. Compare star performance metrics across different entertainment companies. Highlight strengths, weaknesses, and opportunities. Include market positioning insights. Respond in English.`,
      market_opportunity: `You are a strategic consultant for K-Pop brand collaborations. Identify emerging opportunities based on current trend data. Prioritize by ROI potential and timing urgency. Provide specific actionable recommendations. Respond in English.`,
      campaign_impact: `You are a marketing analytics expert specializing in K-Pop endorsements. Analyze campaign performance by comparing Pre (before star involvement) and Post (after) metrics. Focus on: search volume lift, sentiment improvement, purchase intent change, and estimated revenue impact. Respond in English.`,
    };

    const systemPrompt = systemPrompts[type] || systemPrompts.market_opportunity;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context || `Generate ${type} insight for organization ${org_id}` },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content ?? "No insight generated.";

    // Cache the insight
    await sb.from("ktrenz_b2b_ai_insights").insert({
      org_id,
      insight_type: type,
      star_id: star_id || null,
      content: { text: reply, model: "gpt-4o-mini" },
    });

    return new Response(JSON.stringify({ insight: { text: reply }, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("b2b-insight error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
