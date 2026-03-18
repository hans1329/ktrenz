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

    // Step 1: Scrape
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

    // Step 2: AI extraction
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ error: "PERPLEXITY_API_KEY가 설정되지 않았습니다" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Use more content for groups to capture member section
    const truncated = markdown.slice(0, 8000);

    const extractPrompt = `아래는 나무위키에서 스크래핑한 K-POP 아티스트 페이지의 마크다운 내용입니다.

이 내용에서 다음 정보를 정확히 추출하여 JSON 형식으로 반환하세요:

{
  "display_name": "영문 활동명 (공식 영문명)",
  "name_ko": "한글 활동명",
  "star_type": "group | solo | member 중 하나",
  "group_name": "소속 그룹명 (멤버인 경우, 없으면 null)",
  "members": [
    {"name_en": "영문 활동명", "name_ko": "한글 활동명", "namuwiki_path": "나무위키 문서명 (URL 인코딩 전 원본)"}
  ],
  "debut_date": "데뷔일 (있으면)",
  "agency": "소속사",
  "social_handles": {
    "instagram": "인스타그램 핸들 (@제외)",
    "twitter": "트위터/X 핸들 (@제외)",
    "youtube": "유튜브 채널명 또는 ID",
    "tiktok": "틱톡 핸들 (@제외)"
  }
}

규칙:
- 영문명이 없으면 한글명을 공식 로마자 표기로 변환
- star_type: 그룹이면 "group", 솔로 가수면 "solo", 그룹 멤버 개인 페이지면 "member"
- members 배열: 그룹인 경우 현재 활동 중인 멤버만 포함. 탈퇴/졸업 멤버 제외
  - namuwiki_path는 나무위키에서 해당 멤버 문서로 이동할 때 사용되는 문서 제목 (예: "장원영", "카리나(에스파)")
  - 멤버의 영문명과 한글명을 반드시 포함
- 솔로/멤버인 경우 members는 빈 배열
- social_handles에서 찾을 수 없는 항목은 null
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

    // Normalize members to have namuwiki_url
    if (parsed.members && Array.isArray(parsed.members)) {
      parsed.members = parsed.members.map((m: any) => {
        if (typeof m === "string") {
          return { name_en: m, name_ko: m, namuwiki_url: null };
        }
        const path = m.namuwiki_path || m.name_ko || m.name_en;
        return {
          name_en: m.name_en || m.name_ko,
          name_ko: m.name_ko || m.name_en,
          namuwiki_url: path ? `https://namu.wiki/w/${encodeURIComponent(path)}` : null,
        };
      });
    }

    console.log("Parsed artist data:", JSON.stringify(parsed));

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
