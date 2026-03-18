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
    const { namuwiki_url } = await req.json();
    if (!namuwiki_url || !namuwiki_url.includes("namu.wiki")) {
      return new Response(
        JSON.stringify({ error: "유효한 나무위키 URL이 필요합니다" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Scrape the Namuwiki page using Firecrawl
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY가 설정되지 않았습니다" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Scraping Namuwiki URL:", namuwiki_url);
    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: namuwiki_url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeRes.json();
    if (!scrapeRes.ok || !scrapeData.success) {
      console.error("Firecrawl error:", scrapeData);
      return new Response(
        JSON.stringify({ error: `스크래핑 실패: ${scrapeData.error || scrapeRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
    if (!markdown || markdown.length < 100) {
      return new Response(
        JSON.stringify({ error: "페이지 내용을 가져올 수 없습니다" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Use Perplexity to extract structured artist info
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ error: "PERPLEXITY_API_KEY가 설정되지 않았습니다" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Take first ~4000 chars to stay within token limits (the infobox is at the top)
    const truncated = markdown.slice(0, 6000);

    const extractPrompt = `아래는 나무위키에서 스크래핑한 K-POP 아티스트 페이지의 마크다운 내용입니다.

이 내용에서 다음 정보를 정확히 추출하여 JSON 형식으로 반환하세요:

{
  "display_name": "영문 활동명 (공식 영문명)",
  "name_ko": "한글 활동명",
  "star_type": "group | solo | member 중 하나",
  "group_name": "소속 그룹명 (멤버인 경우, 없으면 null)",
  "members": ["멤버1", "멤버2"] (그룹인 경우 멤버 목록, 아니면 빈 배열),
  "debut_date": "데뷔일 (있으면)",
  "agency": "소속사",
  "social_handles": {
    "instagram": "인스타그램 핸들",
    "twitter": "트위터/X 핸들",
    "youtube": "유튜브 채널명 또는 ID",
    "tiktok": "틱톡 핸들"
  }
}

규칙:
- 영문명이 없으면 한글명을 로마자 표기로 변환
- star_type은 그룹이면 "group", 솔로 가수면 "solo", 그룹의 멤버 개인 페이지면 "member"
- social_handles에서 찾을 수 없는 항목은 null로
- JSON만 반환하세요, 다른 텍스트 없이

마크다운 내용:
${truncated}`;

    const aiRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "당신은 나무위키 K-POP 아티스트 페이지에서 구조화된 데이터를 추출하는 전문가입니다. 반드시 유효한 JSON만 반환하세요.",
          },
          { role: "user", content: extractPrompt },
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      console.error("Perplexity error:", aiData);
      return new Response(
        JSON.stringify({ error: `AI 파싱 실패: ${aiRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawText = aiData.choices?.[0]?.message?.content || "";
    console.log("AI raw response:", rawText);

    // Extract JSON from the response
    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("JSON parse error:", e, rawText);
      return new Response(
        JSON.stringify({ error: "AI 응답에서 JSON을 추출할 수 없습니다", raw: rawText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Parsed artist data:", parsed);

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
