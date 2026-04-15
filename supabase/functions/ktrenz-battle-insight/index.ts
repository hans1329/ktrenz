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
    const { run_id, star_id, star_name, language = "en" } = await req.json();
    if (!run_id || !star_id) {
      return new Response(JSON.stringify({ error: "run_id and star_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Check cache first (language-aware)
    const { data: cached } = await sb
      .from("ktrenz_b2_insights")
      .select("insight_text, insight_data")
      .eq("run_id", run_id)
      .eq("star_id", star_id)
      .eq("language", language)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch items for this run
    const { data: items } = await sb
      .from("ktrenz_b2_items")
      .select("source, title, description, engagement_score, url")
      .eq("run_id", run_id)
      .eq("star_id", star_id)
      .order("engagement_score", { ascending: false })
      .limit(30);

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build summary for AI
    const sourceCounts: Record<string, number> = {};
    items.forEach((it) => {
      sourceCounts[it.source] = (sourceCounts[it.source] || 0) + 1;
    });

    const topTitles = items.slice(0, 10).map((it) => `[${it.source}] ${it.title}`).join("\n");

    const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

    const langInstruction = language === "ko"
      ? "한국어로 작성해주세요."
      : language === "ja"
      ? "日本語で書いてください。"
      : language === "zh"
      ? "请用中文撰写。"
      : "Write in English.";

    const prompt = `You are a K-pop trend analyst. Analyze the following content data for "${star_name}" collected today (${today}) and write a fun, engaging trend briefing.

Source distribution: ${JSON.stringify(sourceCounts)}
Total contents: ${items.length}

Top content titles:
${topTitles}

Requirements:
- Write a catchy 1-line headline (max 30 chars)
- Write 2-3 bullet points highlighting the most interesting trends, patterns, or notable content themes
- IMPORTANT: Focus on lifestyle trends — what they're eating, what they're wearing, where they went, what they did. This is more interesting than just content counts.
- If the content titles hint at fashion brands, restaurants, locations, activities, extract and highlight those specifically.
- Add a "lifestyle" section with up to 3 short items about food/fashion/places if detectable from content (can be empty array if nothing found)
- Keep it concise, fun, and insightful — like a daily briefing for fans
- Use emojis sparingly for visual appeal
- ${langInstruction}

Return JSON: { "headline": "...", "bullets": ["...", "..."], "lifestyle": [{"category": "fashion|food|place|activity", "text": "..."}], "vibe": "hot|rising|steady" }`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a witty K-pop trend analyst. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: { headline?: string; bullets?: string[]; lifestyle?: { category: string; text: string }[]; vibe?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { headline: "Trend Update", bullets: [content], lifestyle: [], vibe: "steady" };
    }

    const insightText = [parsed.headline || "", ...(parsed.bullets || [])].join("\n");

    // Cache in DB (per language)
    await sb.from("ktrenz_b2_insights").upsert(
      { run_id, star_id, language, insight_text: insightText, insight_data: parsed },
      { onConflict: "run_id,star_id,language" }
    );

    // Award 30 K-Cashes to the first analyzer
    let firstAnalyzer = false;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        const BONUS_AMOUNT = 30;
        // Check if bonus was already given for this run+star combo
        const { data: existingBonus } = await sb
          .from("ktrenz_point_transactions")
          .select("id")
          .eq("reason", "first_trend_analysis")
          .eq("metadata->>run_id", run_id)
          .eq("metadata->>star_id", star_id)
          .limit(1)
          .maybeSingle();

        if (!existingBonus) {
          // Record transaction
          await sb.from("ktrenz_point_transactions").insert({
            user_id: user.id,
            amount: BONUS_AMOUNT,
            reason: "first_trend_analysis",
            description: "First trend analysis bonus",
            metadata: { run_id, star_id, star_name },
          });
          // Update balance
          const { data: existing } = await sb
            .from("ktrenz_user_points")
            .select("points, lifetime_points")
            .eq("user_id", user.id)
            .maybeSingle();
          if (existing) {
            await sb.from("ktrenz_user_points")
              .update({
                points: (existing.points || 0) + BONUS_AMOUNT,
                lifetime_points: (existing.lifetime_points || 0) + BONUS_AMOUNT,
              })
              .eq("user_id", user.id);
          } else {
            await sb.from("ktrenz_user_points").insert({
              user_id: user.id,
              points: BONUS_AMOUNT,
              lifetime_points: BONUS_AMOUNT,
            });
          }
          firstAnalyzer = true;
        }
      }
    }

    return new Response(JSON.stringify({ insight_text: insightText, insight_data: parsed, first_analyzer: firstAnalyzer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("battle-insight error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
