import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { triggerId, language = "ko" } = await req.json();
    if (!triggerId) throw new Error("triggerId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache first
    const { data: cached } = await supabase
      .from("ktrenz_trend_ai_insights")
      .select("agency_insight, ai_insight, created_at")
      .eq("trigger_id", triggerId)
      .eq("language", language)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({ success: true, cached: true, ...cached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch trigger data
    const { data: trigger, error: trigError } = await supabase
      .from("ktrenz_trend_triggers")
      .select("*")
      .eq("id", triggerId)
      .single();

    if (trigError || !trigger) throw new Error("Trigger not found");

    // Fetch tracking history for context
    const { data: history } = await supabase
      .from("ktrenz_trend_tracking")
      .select("tracked_at, interest_score, delta_pct")
      .eq("trigger_id", triggerId)
      .order("tracked_at", { ascending: true })
      .limit(50);

    // Fetch artist name
    let artistName = trigger.artist_name;
    if (trigger.star_id) {
      const { data: star } = await supabase
        .from("ktrenz_stars")
        .select("display_name, name_ko")
        .eq("id", trigger.star_id)
        .single();
      if (star) {
        artistName = language === "ko" && star.name_ko ? star.name_ko : star.display_name;
      }
    }

    const keyword = language === "ko" && trigger.keyword_ko ? trigger.keyword_ko : trigger.keyword;
    const context = language === "ko" && trigger.context_ko ? trigger.context_ko : trigger.context;
    const snippet = trigger.source_snippet || "";

    const peakDelay = trigger.peak_at
      ? ((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000).toFixed(1)
      : null;

    const trackingInfo = history && history.length > 0
      ? `Tracking data (${history.length} records): Latest score=${history[history.length - 1]?.interest_score}, First score=${history[0]?.interest_score}`
      : "No tracking data available yet";

    const dataContext = `
Artist: ${artistName}
Keyword: ${keyword} (${trigger.keyword_en || trigger.keyword})
Category: ${trigger.keyword_category}
Status: ${trigger.status}
Influence Index: +${trigger.influence_index?.toFixed(1) || 0}%
Baseline Score: ${trigger.baseline_score ?? "N/A"}
Peak Score: ${trigger.peak_score ?? "N/A"}
Confidence: ${(trigger.confidence * 100).toFixed(0)}%
Commercial Intent: ${trigger.commercial_intent || "unknown"}
Brand Intent: ${trigger.brand_intent || "unknown"}
Fan Sentiment: ${trigger.fan_sentiment || "unknown"}
Trend Potential: ${trigger.trend_potential ?? "N/A"}
Detection Source: ${trigger.trigger_source}
Detected At: ${trigger.detected_at}
Peak At: ${trigger.peak_at || "Not peaked yet"}
Peak Delay: ${peakDelay ? peakDelay + "h" : "N/A"}
Context: ${context || "N/A"}
Article Snippet: ${snippet || "N/A"}
Buzz metadata: news=${(trigger.metadata as any)?.buzz_news_total ?? "N/A"}, blog=${(trigger.metadata as any)?.buzz_blog_total ?? "N/A"}, article_count=${(trigger.metadata as any)?.article_count ?? "N/A"}
${trackingInfo}
`;

    const langInstruction = language === "ko"
      ? "모든 응답을 한국어로 작성하세요."
      : language === "ja"
      ? "すべての回答を日本語で書いてください。"
      : language === "zh"
      ? "请用中文撰写所有回答。"
      : "Write all responses in English.";

    const systemPrompt = `You are a K-pop trend intelligence analyst. You provide data-driven, actionable insights for entertainment agencies and brand marketers.
${langInstruction}
Be specific, cite actual numbers from the data, and avoid generic filler. Keep each section concise (3-5 sentences).`;

    const userPrompt = `Based on the following trend data, generate two analyses:

${dataContext}

**AGENCY INSIGHT**: Analyze the commercial opportunity for agencies/brands. Cover:
- Commercial potential assessment (based on influence index, intent, and sentiment)
- Timing recommendation (based on peak delay and lifecycle stage)
- Specific actionable recommendation for the ${trigger.keyword_category} category
- Risk factors or caveats

**AI INSIGHT**: Analyze the trend pattern and predict trajectory. Cover:
- Current trend stage (viral/growing/peaking/declining) with evidence
- Comparison to typical K-pop trend patterns
- 48-72h prediction based on the data trajectory
- Key signals to watch

Format your response EXACTLY as:
===AGENCY===
[agency insight text]
===AI===
[ai insight text]`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) throw new Error("Rate limited, try again later");
      if (aiResponse.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const fullText = aiData.choices?.[0]?.message?.content || "";

    // Parse sections
    const agencyMatch = fullText.match(/===AGENCY===\s*([\s\S]*?)===AI===/);
    const aiMatch = fullText.match(/===AI===\s*([\s\S]*?)$/);

    const agencyInsight = agencyMatch?.[1]?.trim() || fullText;
    const aiInsight = aiMatch?.[1]?.trim() || "";

    // Get user from auth header
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    // Cache in DB
    await supabase
      .from("ktrenz_trend_ai_insights")
      .upsert({
        trigger_id: triggerId,
        language,
        agency_insight: agencyInsight,
        ai_insight: aiInsight,
        model_used: "gemini-2.5-flash",
        generated_by: userId,
      }, { onConflict: "trigger_id,language" });

    return new Response(JSON.stringify({
      success: true,
      cached: false,
      agency_insight: agencyInsight,
      ai_insight: aiInsight,
      created_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ktrenz-trend-insight error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
