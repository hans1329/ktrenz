const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SocialHandles = {
  instagram: string | null;
  twitter: string | null;
  youtube: string | null;
  tiktok: string | null;
};

function firstMatch(markdown: string, regex: RegExp): string | null {
  const match = markdown.match(regex);
  return match?.[1] ?? null;
}

function extractSocialHandlesFromMarkdown(markdown: string): SocialHandles {
  const instagram = firstMatch(markdown, /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i);
  const tiktok = firstMatch(markdown, /https?:\/\/(?:www\.)?tiktok\.com\/@?([A-Za-z0-9._]+)/i);

  const youtubeMatch = markdown.match(
    /https?:\/\/(?:www\.)?youtube\.com\/(?:@([A-Za-z0-9._-]+)|channel\/([A-Za-z0-9_-]+)|c\/([A-Za-z0-9._-]+)|user\/([A-Za-z0-9._-]+))/i,
  );
  const youtube = youtubeMatch?.[1] || youtubeMatch?.[2] || youtubeMatch?.[3] || youtubeMatch?.[4] || null;

  let twitter: string | null = null;
  for (const match of markdown.matchAll(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)/gi)) {
    const handle = match[1] || null;
    const start = match.index ?? 0;
    const context = markdown.slice(Math.max(0, start - 40), Math.min(markdown.length, start + 120)).toLowerCase();
    if (context.includes("스태프") || context.includes("staff")) continue;
    twitter = handle;
    break;
  }

  return { instagram, twitter, youtube, tiktok };
}

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

    const extractedHandles = extractSocialHandlesFromMarkdown(markdown);
    console.log("Extracted social handles:", JSON.stringify(extractedHandles));

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY가 설정되지 않았습니다" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const truncated = markdown.slice(0, 15000);

    const extractPrompt = `아래는 나무위키에서 스크래핑한 K-POP 아티스트/배우 페이지의 마크다운 내용입니다.

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
- star_type: 그룹이면 "group", 솔로 가수/배우면 "solo", 그룹 멤버 개인 페이지면 "member"
- members 배열: 그룹인 경우 현재 활동 중인 멤버만 포함. 탈퇴/졸업 멤버 제외
- 솔로/멤버인 경우 members는 빈 배열
- JSON만 반환하세요, 다른 텍스트 없이
- social_handles는 문서에 없으면 null 허용

마크다운 내용:
${truncated}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "당신은 나무위키 아티스트/배우 페이지에서 구조화된 데이터를 추출하는 전문가입니다. 반드시 유효한 JSON만 반환하세요. 웹 검색을 하지 말고, 제공된 마크다운 텍스트에서만 정보를 추출하세요.",
          },
          { role: "user", content: extractPrompt },
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      console.error("OpenAI error:", aiData);
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

    parsed.social_handles = {
      instagram: extractedHandles.instagram || parsed.social_handles?.instagram || null,
      twitter: extractedHandles.twitter || parsed.social_handles?.twitter || null,
      youtube: extractedHandles.youtube || parsed.social_handles?.youtube || null,
      tiktok: extractedHandles.tiktok || parsed.social_handles?.tiktok || null,
    };

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
