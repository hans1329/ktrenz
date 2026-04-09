// P2 Pipeline: 스타 독립 트렌드 키워드 발굴 엔진
// 네이버 뉴스에서 K-pop/엔터 관련 최신 트렌드 키워드를 직접 수집
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NAVER_TIMEOUT_MS = 10000;
const OPENAI_TIMEOUT_MS = 30000;

async function fetchWithTimeout(
  input: string | URL, init: RequestInit = {}, timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── 네이버 뉴스 검색 ──
async function searchNaverNews(
  query: string, clientId: string, clientSecret: string, display = 30,
): Promise<{ title: string; description: string; link: string }[]> {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const res = await fetchWithTimeout(url, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
  }, NAVER_TIMEOUT_MS);
  if (!res.ok) {
    console.error(`[p2-discover] Naver search failed for "${query}": ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    title: item.title.replace(/<[^>]*>/g, ""),
    description: item.description.replace(/<[^>]*>/g, ""),
    link: item.link,
  }));
}

// ── OpenAI 키워드 추출 ──
async function extractTrendingKeywords(
  articles: { title: string; description: string }[],
  openaiKey: string,
): Promise<{
  keyword: string;
  keyword_ko: string;
  keyword_en: string;
  category: string;
  relevance_score: number;
  context: string;
}[]> {
  const articleTexts = articles.slice(0, 30).map((a, i) => `[${i + 1}] ${a.title} — ${a.description}`).join("\n");

  const systemPrompt = `You are a K-pop and Korean entertainment trend analyst.
From the given news articles, extract SPECIFIC TRENDING PROPER NOUNS — brand names, product names, collaboration names, event names, place names, etc.

RULES:
- Extract ONLY proper nouns (specific names of things). NO generic words.
- REJECT: general descriptors (뮤직비디오, 화보, 광고, 컴백, 콘서트, 팬미팅, 럭셔리 뷰티 브랜드)
- REJECT: artist/group names themselves (BTS, aespa, etc.) — we want what they're associated WITH
- REJECT: platform names (YouTube, Instagram, TikTok, Spotify)
- REJECT: agency names (HYBE, SM, YG, JYP)
- ACCEPT: specific brand collabs ("Gentle Monster x NewJeans"), product names ("하이볼 스파클링"), event names ("KCON LA 2025"), place names ("올리브영 명동")
- Each keyword should be something a consumer or fan could search for and buy/visit/experience
- relevance_score: 0-1, how relevant to K-pop/entertainment industry

Return JSON array:
[{"keyword":"original keyword","keyword_ko":"한국어","keyword_en":"English","category":"brand|product|place|event|fashion|beauty|food|media|music|social","relevance_score":0.8,"context":"brief explanation in Korean"}]

Return at most 15 keywords. Quality over quantity.`;

  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `오늘 K-pop/엔터 관련 뉴스입니다. 트렌딩 키워드를 추출해주세요:\n\n${articleTexts}` },
      ],
    }),
  }, OPENAI_TIMEOUT_MS);

  if (!res.ok) {
    console.error(`[p2-discover] OpenAI failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const keywords = Array.isArray(parsed) ? parsed : parsed.keywords || parsed.results || [];
    return keywords.filter((k: any) => k.keyword && k.relevance_score >= 0.3);
  } catch {
    console.error("[p2-discover] Failed to parse OpenAI response");
    return [];
  }
}

// ── 스타 역매핑 ──
async function matchStars(
  keywords: { keyword: string; context: string }[],
  supabase: any,
): Promise<Map<string, string>> {
  const { data: stars } = await supabase
    .from("ktrenz_stars")
    .select("id, display_name, name_ko")
    .eq("is_active", true);

  if (!stars?.length) return new Map();

  const map = new Map<string, string>();
  for (const kw of keywords) {
    const text = `${kw.keyword} ${kw.context}`.toLowerCase();
    for (const star of stars) {
      const names = [star.display_name, star.name_ko].filter(Boolean).map((n: string) => n.toLowerCase());
      if (names.some(name => text.includes(name))) {
        map.set(kw.keyword, star.id);
        break;
      }
    }
  }
  return map;
}

// ── 검색 쿼리 목록 (K-pop/엔터 관련 트렌드 발굴용) ──
const DISCOVERY_QUERIES = [
  "아이돌 브랜드 협업",
  "케이팝 패션 트렌드",
  "아이돌 광고 모델",
  "케이팝 뷰티 콜라보",
  "아이돌 팝업스토어",
  "한류 브랜드",
  "케이팝 컬래버레이션",
  "아이돌 화보 브랜드",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const naverId = Deno.env.get("NAVER_CLIENT_ID");
    const naverSecret = Deno.env.get("NAVER_CLIENT_SECRET");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!naverId || !naverSecret) {
      return new Response(JSON.stringify({ error: "NAVER credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 여러 검색 쿼리로 뉴스 수집
    console.log(`[p2-discover] Starting with ${DISCOVERY_QUERIES.length} queries`);
    const allArticles: { title: string; description: string; link: string }[] = [];
    
    for (const query of DISCOVERY_QUERIES) {
      const articles = await searchNaverNews(query, naverId, naverSecret, 20);
      allArticles.push(...articles);
      // Rate limit 방지
      await new Promise(r => setTimeout(r, 200));
    }

    // 제목 기준 중복 제거
    const seen = new Set<string>();
    const uniqueArticles = allArticles.filter(a => {
      const key = a.title.slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[p2-discover] Collected ${allArticles.length} → ${uniqueArticles.length} unique articles`);

    if (uniqueArticles.length === 0) {
      return new Response(JSON.stringify({ success: true, keywords: 0, message: "No articles found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. AI 키워드 추출
    const keywords = await extractTrendingKeywords(uniqueArticles, openaiKey);
    console.log(`[p2-discover] AI extracted ${keywords.length} keywords`);

    if (keywords.length === 0) {
      return new Response(JSON.stringify({ success: true, keywords: 0, message: "No keywords extracted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. 스타 역매핑
    const starMap = await matchStars(keywords, supabase);
    console.log(`[p2-discover] Matched ${starMap.size} keywords to stars`);

    // 4. DB 저장 (upsert by unique index)
    let saved = 0;
    let skipped = 0;
    for (const kw of keywords) {
      const { error } = await supabase
        .from("ktrenz_p2_keywords")
        .upsert({
          keyword: kw.keyword,
          keyword_ko: kw.keyword_ko || kw.keyword,
          keyword_en: kw.keyword_en || null,
          discover_source: "naver_rising",
          discover_date: new Date().toISOString().split("T")[0],
          category: kw.category || null,
          relevance_score: kw.relevance_score || 0,
          matched_star_id: starMap.get(kw.keyword) || null,
          raw_context: { context: kw.context },
          status: "active",
        }, {
          onConflict: "keyword,discover_source,discover_date",
          ignoreDuplicates: true,
        });

      if (error) {
        console.error(`[p2-discover] Insert error for "${kw.keyword}":`, error.message);
        skipped++;
      } else {
        saved++;
      }
    }

    const result = {
      success: true,
      articles_collected: uniqueArticles.length,
      keywords_extracted: keywords.length,
      keywords_saved: saved,
      keywords_skipped: skipped,
      star_matches: starMap.size,
      keywords: keywords.map(k => ({
        keyword: k.keyword,
        category: k.category,
        relevance: k.relevance_score,
        star: starMap.get(k.keyword) ? "matched" : null,
      })),
    };

    console.log(`[p2-discover] Done:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-discover] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
