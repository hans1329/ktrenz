// T2 Trend Detect: 스타 대상 실시간 네이버 뉴스 검색 → AI 상업 키워드 추출
// ktrenz_stars의 group/solo/member 타입 아티스트를 대상으로 직접 검색하여 ktrenz_trend_triggers에 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedKeyword {
  keyword: string;
  keyword_en?: string;
  keyword_ko?: string;
  keyword_ja?: string;
  keyword_zh?: string;
  category: "brand" | "product" | "place" | "food" | "fashion" | "beauty" | "media" | "music" | "event";
  confidence: number;
  context: string;
  context_ko?: string;
  context_ja?: string;
  context_zh?: string;
  source_article_index?: number;
  commercial_intent?: "ad" | "sponsorship" | "collaboration" | "organic" | "rumor";
  brand_intent?: "awareness" | "conversion" | "association" | "loyalty";
  fan_sentiment?: "positive" | "negative" | "neutral" | "mixed";
  trend_potential?: number;
  purchase_stage?: "awareness" | "interest" | "consideration" | "purchase" | "review";
}

// Platform names and non-trackable entities blacklist
const PLATFORM_BLACKLIST = new Set([
  "youtube", "spotify", "tiktok", "instagram", "twitter", "x", "facebook",
  "apple music", "melon", "genie", "bugs", "flo", "vibe", "soundcloud",
  "weverse", "vlive", "bubble", "universe", "phoning", "lysn",
  "naver", "google", "daum", "kakao", "naver news", "theqoo", "pann",
  "billboard", "hanteo", "gaon", "circle chart", "oricon",
  "mnet", "kbs", "sbs", "mbc", "jtbc", "tvn", "tv chosun",
]);

// 이미지 수집 불가 도메인 (봇 차단, 핫링크 차단)
const SOURCE_IMAGE_BLACKLIST = [
  "ddaily.co.kr",
  "fbcdn.net",
  "cdninstagram.com",
  "scontent.",
];

// 텍스트 오버레이/배너 스타일 이미지를 걸러내기 위한 URL 패턴
const TEXT_OVERLAY_IMAGE_PATTERNS = [
  /thumb_\d+x\d+/i,           // 리사이즈된 썸네일 (텍스트 합성본 많음)
  /card_img|card_news/i,       // 카드뉴스 이미지
  /infographic/i,              // 인포그래픽
  /screenshot/i,               // 스크린샷
  /text_image|textimg/i,       // 텍스트 이미지 명시
  /ranking|chart|graph/i,      // 차트/랭킹 이미지
  /photo_layout|composite/i,   // 합성 레이아웃
];

// OG 이미지가 텍스트 오버레이/배너일 가능성이 높은지 판별
function isLikelyTextOverlayImage(url: string): boolean {
  // 카드뉴스/인포그래픽 패턴
  if (TEXT_OVERLAY_IMAGE_PATTERNS.some(p => p.test(url))) return true;
  // 극단적 가로 비율 (배너) - URL에 크기 힌트가 있는 경우
  const sizeMatch = url.match(/(\d{3,4})x(\d{2,4})/);
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1]);
    const h = parseInt(sizeMatch[2]);
    if (w > 0 && h > 0 && w / h > 3) return true; // 극단적 배너
  }
  return false;
}

// URL 정규화: HTML 엔티티 디코딩
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, "&");
}

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

// ─── Naver 통합 검색 (News / Blog / Shop) ───
interface NaverSearchResult {
  items: any[];
  total: number;
}

async function searchNaver(
  clientId: string,
  clientSecret: string,
  endpoint: "news" | "blog" | "shop",
  query: string,
  display: number = 50,
): Promise<NaverSearchResult> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(display, 100)));
    url.searchParams.set("sort", endpoint === "shop" ? "date" : "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      console.warn(`[trend-detect] Naver ${endpoint} API failed: ${response.status}`);
      return { items: [], total: 0 };
    }

    const data = await response.json();
    return { items: data.items || [], total: data.total || 0 };
  } catch (e) {
    console.warn(`[trend-detect] Naver ${endpoint} search error: ${(e as Error).message}`);
    return { items: [], total: 0 };
  }
}

// ─── Buzz Score 정규화: 최근 7일 기사 건수 기반 (max 100건/소스) ───
function normalizeBuzzScore(newsCount: number, blogCount: number): number {
  const newsCap = 100;  // display=100 기준 최대치
  const blogCap = 100;
  const newsNorm = newsCount > 0 ? (Math.log10(newsCount + 1) / Math.log10(newsCap + 1)) * 100 : 0;
  const blogNorm = blogCount > 0 ? (Math.log10(blogCount + 1) / Math.log10(blogCap + 1)) * 100 : 0;
  const buzzScore = Math.round(Math.min(newsNorm * 0.6 + blogNorm * 0.4, 100));
  return buzzScore;
}

// ─── 키워드별 Naver 뉴스/블로그 건수 조회 ───
async function fetchKeywordBuzzCounts(
  clientId: string,
  clientSecret: string,
  artistName: string,
  keyword: string,
): Promise<{ newsTotal: number; blogTotal: number }> {
  const query = `"${artistName}" "${keyword}"`;
  const [newsResult, blogResult] = await Promise.all([
    searchNaverTotal(clientId, clientSecret, "news", query),
    searchNaverTotal(clientId, clientSecret, "blog", query),
  ]);
  return { newsTotal: newsResult, blogTotal: blogResult };
}

// Naver API total 필드 사용 (display 제한 없는 전체 건수)
async function searchNaverTotal(
  clientId: string,
  clientSecret: string,
  endpoint: "news" | "blog",
  query: string,
): Promise<number> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", "1"); // total만 필요하므로 최소
    url.searchParams.set("sort", "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) return 0;
    const data = await response.json();
    return data.total || 0;
  } catch {
    return 0;
  }
}

// ─── 7일 이내 기사 카운트 + API total 반환 ───
function parseBlogPostdate(pd: string): number {
  if (!pd || pd.length !== 8) return 0;
  return new Date(`${pd.slice(0,4)}-${pd.slice(4,6)}-${pd.slice(6,8)}T00:00:00+09:00`).getTime();
}

async function searchNaverRecent7d(
  clientId: string, clientSecret: string,
  endpoint: "news" | "blog", query: string,
): Promise<{ recent: number; total: number }> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", "100");
    url.searchParams.set("sort", "date");
    const response = await fetch(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!response.ok) return { recent: 0, total: 0 };
    const data = await response.json();
    const apiTotal = data.total || 0;
    const items = data.items || [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const item of items) {
      let pubTime: number;
      if (endpoint === "blog") {
        pubTime = parseBlogPostdate(item.postdate);
      } else {
        pubTime = item.pubDate ? new Date(item.pubDate).getTime() : 0;
      }
      if (pubTime >= sevenDaysAgo) count++;
    }
    return { recent: count, total: apiTotal };
  } catch { return { recent: 0, total: 0 }; }
}

// 하위 호환용 래퍼
async function searchNaverNews(
  clientId: string,
  clientSecret: string,
  query: string,
  display: number = 50,
): Promise<NaverNewsItem[]> {
  const result = await searchNaver(clientId, clientSecret, "news", query, display);
  return result.items as NaverNewsItem[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

function isJapanese(text: string): boolean {
  const jpChars = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  return (jpChars?.length || 0) >= 3;
}

// ─── OG Image 추출 (본문 img 폴백 포함) ───
async function fetchOgImage(url: string): Promise<string | null> {
  // 상대 경로를 절대 URL로 변환하는 헬퍼
  function resolveUrl(src: string, baseUrl: string): string | null {
    if (!src || src.length < 3) return null;
    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    // 상대 경로 → 절대 URL
    try {
      const base = new URL(baseUrl);
      if (src.startsWith("/")) return `${base.origin}${src}`;
      return `${base.origin}/${src}`;
    } catch {
      return null;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    // 1) og:image
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const resolved = resolveUrl(ogMatch[1].replace(/&amp;/g, "&"), url);
      if (resolved) return resolved;
    }

    // 2) twitter:image
    const twMatch = html.match(/<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const resolved = resolveUrl(twMatch[1].replace(/&amp;/g, "&"), url);
      if (resolved) return resolved;
    }

    // 3) 본문 내 첫 번째 <img> 폴백
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const m of imgMatches) {
      const src = m[1];
      if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
      if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner/i.test(src)) continue;
      const resolved = resolveUrl(src.replace(/&amp;/g, "&"), url);
      if (resolved) return resolved;
    }

    return null;
  } catch {
    return null;
  }
}
// ── 카테고리 컨텍스트 라벨 ──
function getCategoryContext(category: string): string {
  const labels: Record<string, string> = {
    kpop: "K-pop artist",
    actor: "Korean actor/actress",
    singer: "Korean singer",
    baseball: "Korean baseball player",
    athlete: "Korean athlete",
    chef: "Korean celebrity chef",
    politician: "Korean politician",
    influencer: "Korean influencer",
    comedian: "Korean comedian/MC",
    other: "Korean public figure",
  };
  return labels[category] || labels.other;
}

// ─── Tool Calling 스키마 정의 ───
const TOOL_EXTRACT_KEYWORDS = {
  type: "function" as const,
  function: {
    name: "extract_keywords",
    description: "Extract commercial/cultural trend keywords from article texts. Each keyword must be explicitly mentioned in the articles. You MUST verify article subject attribution for each keyword.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string", description: "Original keyword as it appears in the article (Korean or English)" },
              keyword_en: { type: "string", description: "English translation/name" },
              keyword_ko: { type: "string", description: "Korean name" },
              keyword_ja: { type: "string", description: "Japanese translation" },
              keyword_zh: { type: "string", description: "Chinese translation" },
              category: { type: "string", enum: ["brand", "product", "place", "food", "fashion", "beauty", "media", "music", "event"] },
              confidence: { type: "number", description: "0.0-1.0 based on how clearly the text links the entity to the artist" },
              context: { type: "string", description: "English context sentence" },
              context_ko: { type: "string", description: "Korean context sentence" },
              context_ja: { type: "string", description: "Japanese context sentence" },
              context_zh: { type: "string", description: "Chinese context sentence" },
              source_article_index: { type: "integer", description: "1-based index of the source article" },
              commercial_intent: { type: "string", enum: ["ad", "sponsorship", "collaboration", "organic", "rumor"], description: "Nature of the association" },
              brand_intent: { type: "string", enum: ["awareness", "conversion", "association", "loyalty"], description: "Brand perspective intent" },
              fan_sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"], description: "Predicted fandom reaction" },
              trend_potential: { type: "number", description: "0.0-1.0 viral trend likelihood" },
              // ── Attribution verification fields ──
              ownership_artist: { type: "string", description: "The artist who ACTUALLY OWNS/CREATED this keyword (e.g., the artist who released this song/album). If this is a song title, who sang it? If a brand collab, who is the ambassador? Must be the TRUE OWNER, not just who mentioned it." },
              ownership_confidence: { type: "number", description: "0.0-1.0 confidence that this keyword truly belongs to the searched artist, not another artist" },
              ownership_reason: { type: "string", description: "Brief explanation of why this keyword belongs (or doesn't belong) to the searched artist" },
              // ── Member attribution fields (NEW) ──
              article_subject_name: { type: "string", description: "The ACTUAL person who is the main subject of the article where this keyword was found. Write the name as it appears in the article (e.g., '현진', 'Hyunjin', '원진'). If the article is about a group activity with no specific member focus, write the group name." },
              article_subject_match: { type: "boolean", description: "true ONLY if the article's main subject is the SEARCHED artist. false if the article focuses on a different member of the same group, or a different person entirely." },
              // ── Rejection classification (NEW) ──
              rejection_flags: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "wrong_member",       // Article is about a different member of the same group
                    "wrong_artist",       // Article is about a completely different artist
                    "generic_word",       // Keyword is a common/generic word, not a proper noun
                    "passing_mention",    // Entity only mentioned in passing, no direct relationship
                    "metaphor_comparison",// Entity used as metaphor or comparison
                    "tv_gimmick",         // TV show costume, prop, or ephemeral segment
                    "ambiguous_name",     // Artist name matches a common word in the article
                    "noise"              // General noise that doesn't represent a meaningful trend
                  ],
                },
                description: "List of reasons why this keyword SHOULD be rejected. Empty array [] if the keyword is valid. Be honest — flag ALL applicable issues."
              },
              purchase_stage: {
                type: "string",
                enum: ["awareness", "interest", "consideration", "purchase", "review"],
                description: "Consumer purchase funnel stage: awareness = first exposure via star, interest = active search/curiosity, consideration = comparing options/prices, purchase = buying intent/action, review = post-purchase reviews/unboxing"
              },
            },
            required: ["keyword", "keyword_en", "keyword_ko", "category", "confidence", "context", "context_ko", "source_article_index", "commercial_intent", "brand_intent", "fan_sentiment", "trend_potential", "ownership_artist", "ownership_confidence", "ownership_reason", "article_subject_name", "article_subject_match", "rejection_flags", "purchase_stage"],
          },
          description: "Array of extracted keywords. Maximum 7. Include ALL candidates even if you think they should be rejected — use rejection_flags to mark issues.",
        },
      },
      required: ["keywords"],
    },
  },
};

const TOOL_ANALYZE_INTENT = {
  type: "function" as const,
  function: {
    name: "analyze_trend_intent",
    description: "Analyze the overall trend intent and market signal from the extracted keywords for the given artist.",
    parameters: {
      type: "object",
      properties: {
        market_signal: { type: "string", enum: ["strong_momentum", "emerging", "steady", "declining", "noise"], description: "Overall market signal strength" },
        dominant_sector: { type: "string", description: "Primary industry sector being impacted (fashion, beauty, music, food, etc.)" },
        audience_overlap: { type: "string", enum: ["core_fandom", "general_public", "niche_community", "cross_fandom"], description: "Who is driving the trend" },
        monetization_readiness: { type: "number", description: "0.0-1.0 score of how ready this trend is for commercial exploitation" },
        signal_summary: { type: "string", description: "One-sentence Korean summary of the trend signal for this artist" },
      },
      required: ["market_signal", "dominant_sector", "audience_overlap", "monetization_readiness", "signal_summary"],
    },
  },
};

// ─── OpenAI Tool Calling 기반 키워드 추출 ───
async function extractCommercialKeywords(
  openaiKey: string,
  memberName: string,
  groupName: string | null,
  articles: { title: string; description?: string; url?: string }[],
  starCategory: string = "kpop",
  nameKo: string | null = null,
  groupNameKo: string | null = null,
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const articleTexts = articles
    .slice(0, 25)
    .map((a, i) => `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}`)
    .join("\n");

  const categoryContext = getCategoryContext(starCategory);

  // 모든 이름 변형을 수집하여 프롬프트에 명시
  const allNames = [memberName, nameKo, groupName, groupNameKo].filter(Boolean) as string[];
  const nameListStr = allNames.map(n => `"${n}"`).join(", ");

  const systemPrompt = `You are a trend-forecasting analyst and cultural intelligence expert. Your job is to extract SPECIFIC NAMED ENTITIES that have a DIRECT, ACTIVE commercial or cultural relationship with the given artist from Korean news articles.

CRITICAL RULES — READ CAREFULLY:

1. ABSOLUTELY FORBIDDEN KEYWORDS (instant rejection):
   - The artist's own name in ANY language/spelling: ${nameListStr}
   - Any variation, nickname, or abbreviation of the above names
   - Agency/label names, platform names (YouTube, Spotify, Naver, etc.)
   - Chart names (Billboard, Hanteo, Gaon, etc.)
   - Generic K-pop terms: 컴백, comeback, album, concert, 앨범, 콘서트, 팬미팅, fanmeeting, 음방, 활동, 무대
   - Generic locations: city names, district names, country names, airports
   - TV campaign/variety show gimmicks, costumes, or ephemeral entertainment segments (e.g., wearing a costume on a show)

2. CONTEXTUAL RELEVANCE — MOST IMPORTANT RULE:
   - A keyword is valid ONLY if the artist has a DIRECT, ACTIVE relationship with the entity
   - ✅ VALID: The artist endorses/wears/uses the brand, stars in the show, performs at the event, collaborates with the entity
   - ❌ INVALID: Entity merely MENTIONED in passing, used as comparison/metaphor, part of another person's story, or background context
   
   DETAILED EXAMPLES of what to REJECT:
   - "미쓰라가 삼성 이재용 회장과 동문인지 확인" → "삼성" INVALID (comparison, no business relationship)
   - "하이라이트 멤버들이 BTS 공연 하이라이트를 감상" → "BTS" INVALID (the article mentions BTS but the keyword is about Highlight watching it)
   - Article about Artist A mentions "이 곡은 마치 뉴진스의 Hype Boy 같다" → "Hype Boy" INVALID (metaphorical comparison)
   - "한(Han)이 카르티에 행사에 참석" but the article is actually about Hyunjin → "Cartier" INVALID for Han (misattribution)
   - "홍진경이 핫도그 탈을 입고 촬영장 입성" → "핫도그" INVALID (costume gimmick, not a commercial relationship)
   - "코미디언과 아이돌이 MC로 함께하는 캠페인" → campaign name INVALID if it's a one-off TV segment, not the artist's own project
   
   DETAILED EXAMPLES of what to ACCEPT:
   - "카리나가 프라다 2026 S/S 컬렉션 앰버서더로 발탁" → "프라다" VALID (direct endorsement)
   - "뉴진스 x 코카콜라 컬래버 광고 공개" → "코카콜라" VALID (brand collaboration)
   - "아이유가 '나의 아저씨' 재방송으로 화제" → "나의 아저씨" VALID (starred in the show)

3. AMBIGUOUS ARTIST NAMES — CRITICAL:
   - Some artist names are common words (e.g., "Highlight" = 하이라이트, "Han" = 한, "Win" = 윈, "Joy" = 조이)
   - When the artist name is ambiguous, CAREFULLY verify the article is actually about THIS specific artist
   - If an article uses the word in its general meaning (e.g., "하이라이트 영상" = highlight video), it is NOT about the artist
   - Set ownership_confidence to 0.0 if the article isn't clearly about the searched artist

4. MEMBER ATTRIBUTION — VERIFY THE ARTICLE SUBJECT:
   - When searching for a GROUP MEMBER, the article may mention the GROUP but focus on a DIFFERENT MEMBER
   - You MUST check: is the article's MAIN SUBJECT specifically about "${memberName}"?
   - If the article says "스트레이 키즈 현진이 까르띠에 행사 참석" and you are analyzing for "Han" (한), this keyword belongs to Hyunjin, NOT Han
   - Even if the group name appears in the article, the keyword belongs to whichever member is the ACTUAL SUBJECT
   - Set ownership_confidence to 0.0 if a different member of the same group is the article's subject
   - RULE: If the article body specifically names a DIFFERENT member (e.g., 현진, Hyunjin) as the subject of the keyword relationship, reject it for the current search target

5. CROSS-ARTIST CONTAMINATION — VERIFY OWNERSHIP:
   - If the article mentions multiple artists, each keyword belongs ONLY to the artist who has the direct relationship
   - "로제 콘서트에서 골든 앨범 언급" → "Golden" belongs to Jungkook, NOT Rosé
   - "P1Harmony 기사에서 AB6IX 멤버 비교" → "AB6IX" does NOT belong to P1Harmony
   - Always ask: "WHO is the true owner of this keyword?" and set ownership_artist accordingly

6. Each keyword must be a SPECIFIC proper noun — a brand, product, place, show title, food item, or event name
7. The keyword must LITERALLY appear in the article text
8. OWNERSHIP CHECK: Set ownership_confidence below 0.5 if the relationship is indirect, metaphorical, or just a passing mention
9. Maximum 7 keywords. Quality over quantity — return ZERO if no valid entities found.
10. When in doubt, DO NOT extract. False negatives are far better than false positives.`;

  const userPrompt = `Analyze these Korean news articles about "${memberName}"${groupName ? ` (member of ${groupName})` : ""}${nameKo ? ` (Korean: ${nameKo})` : ""} (${categoryContext}).

REMEMBER: 
- Do NOT extract ${nameListStr} or any artist/group names as keywords. Only extract specific brands, products, places, show titles, etc.
- CRITICAL: For each article, verify that the article's MAIN SUBJECT is "${memberName}"${nameKo ? ` (${nameKo})` : ""}. If the article is about a DIFFERENT member of the same group, set ownership_confidence to 0.0.
- If the article mentions "${memberName}" only in a list or passing reference while focusing on another person, reject the keyword.

Articles:
${articleTexts}

Call extract_keywords with the specific named entities found, then call analyze_trend_intent.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL_EXTRACT_KEYWORDS, TOOL_ANALYZE_INTENT],
        tool_choice: "required",
        temperature: 0.05,
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[trend-detect] OpenAI API error: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];

    if (!toolCalls.length) {
      console.warn(`[trend-detect] No tool calls in AI response for ${memberName}`);
      // Fallback: try parsing content directly
      const content = data.choices?.[0]?.message?.content || "";
      console.log(`[trend-detect] AI content fallback for ${memberName}: ${content.slice(0, 300)}`);
      return [];
    }

    let extractedKeywords: ExtractedKeyword[] = [];
    let trendIntent: any = null;

    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments);
        if (tc.function.name === "extract_keywords") {
          const rawKeywords = args.keywords || [];
          console.log(`[trend-detect] Tool calling extracted ${rawKeywords.length} keywords for ${memberName}: ${rawKeywords.map((k: any) => `${k.keyword}(subj:${k.article_subject_name},match:${k.article_subject_match},flags:${(k.rejection_flags||[]).join("|")},own:${k.ownership_artist},${k.ownership_confidence})`).join(", ")}`);

          // ── 구조적 검증 필터 (Tool Calling 출력 기반) ──
          for (const k of rawKeywords) {
            const ownerArtist = (k.ownership_artist || "").toLowerCase();
            const searchedArtist = memberName.toLowerCase();
            const searchedGroup = (groupName || "").toLowerCase();
            const searchedNameKo = (nameKo || "").toLowerCase();
            const rejectionFlags: string[] = k.rejection_flags || [];

            // ── 1단계: rejection_flags 기반 자동 차단 ──
            const hardRejectFlags = ["wrong_member", "wrong_artist", "generic_word", "tv_gimmick", "ambiguous_name"];
            const activeHardRejects = rejectionFlags.filter((f: string) => hardRejectFlags.includes(f));
            if (activeHardRejects.length > 0) {
              console.warn(`[trend-detect] ⛔ Rejected by flags: "${k.keyword}" → [${activeHardRejects.join(",")}] (subject: ${k.article_subject_name})`);
              continue;
            }

            // soft reject flags: passing_mention, metaphor_comparison, noise
            // 2개 이상이면 차단
            const softRejectFlags = rejectionFlags.filter((f: string) => ["passing_mention", "metaphor_comparison", "noise"].includes(f));
            if (softRejectFlags.length >= 2) {
              console.warn(`[trend-detect] ⚠️ Rejected by multiple soft flags: "${k.keyword}" → [${softRejectFlags.join(",")}]`);
              continue;
            }

            // ── 2단계: article_subject_match 기반 차단 ──
            if (k.article_subject_match === false) {
              const subjectName = (k.article_subject_name || "").toLowerCase();
              // 기사 주체가 다른 사람이고, 그게 검색 대상도 아니고 그룹도 아닌 경우 → 차단
              if (subjectName && subjectName !== searchedArtist && subjectName !== searchedGroup
                  && (!searchedNameKo || subjectName !== searchedNameKo)) {
                console.warn(`[trend-detect] ⛔ Subject mismatch: "${k.keyword}" → article about "${k.article_subject_name}", not "${memberName}"`);
                continue;
              }
            }

            // ── 3단계: ownership_confidence 기반 차단 ──
            if (k.ownership_confidence < 0.5) {
              console.warn(`[trend-detect] ⛔ Ownership rejected: "${k.keyword}" → owner="${k.ownership_artist}" (conf=${k.ownership_confidence}, reason: ${k.ownership_reason})`);
              continue;
            }

            // ── 4단계: ownership_artist 불일치 차단 ──
            if (ownerArtist && ownerArtist !== searchedArtist && ownerArtist !== searchedGroup 
                && (!searchedNameKo || ownerArtist !== searchedNameKo)
                && !ownerArtist.includes(searchedArtist) && !searchedArtist.includes(ownerArtist)) {
              console.warn(`[trend-detect] ⛔ Ownership mismatch: "${k.keyword}" belongs to "${k.ownership_artist}", not "${memberName}" (reason: ${k.ownership_reason})`);
              continue;
            }

            // ✅ 모든 검증 통과
            console.log(`[trend-detect] ✅ Accepted: "${k.keyword}" (subject: ${k.article_subject_name}, match: ${k.article_subject_match}, flags: [${rejectionFlags.join(",")}], ownership: ${k.ownership_confidence}, stage: ${k.purchase_stage || "n/a"})`);
            extractedKeywords.push({
              keyword: k.keyword,
              keyword_en: k.keyword_en,
              keyword_ko: k.keyword_ko,
              keyword_ja: k.keyword_ja,
              keyword_zh: k.keyword_zh,
              category: k.category,
              confidence: k.confidence,
              context: k.context,
              context_ko: k.context_ko,
              context_ja: k.context_ja,
              context_zh: k.context_zh,
              source_article_index: k.source_article_index,
              commercial_intent: k.commercial_intent,
              brand_intent: k.brand_intent,
              fan_sentiment: k.fan_sentiment,
              trend_potential: k.trend_potential,
              purchase_stage: k.purchase_stage || undefined,
            });
          }
        } else if (tc.function.name === "analyze_trend_intent") {
          trendIntent = args;
          console.log(`[trend-detect] Trend intent for ${memberName}: signal=${args.market_signal}, sector=${args.dominant_sector}, audience=${args.audience_overlap}, monetization=${args.monetization_readiness}, summary="${args.signal_summary}"`);
        }
      } catch (parseErr) {
        console.warn(`[trend-detect] Failed to parse tool call for ${memberName}: ${(parseErr as Error).message}`);
      }
    }

    // ── 후검증: 플랫폼 블랙리스트 + 아티스트명 필터 (강화) ──
    const allText = articles.map(a => `${a.title} ${a.description || ""}`).join(" ").toLowerCase();

    // 모든 이름 변형 수집 (한글/영문/그룹명 모두)
    const allNameVariants = new Set<string>();
    for (const n of [memberName, nameKo, groupName, groupNameKo]) {
      if (n) allNameVariants.add(n.toLowerCase());
    }

    extractedKeywords = extractedKeywords.filter((k) => {
      if (!k.keyword || !k.category || typeof k.confidence !== "number") return false;

      const kwLower = k.keyword.toLowerCase();
      const kwKo = k.keyword_ko?.toLowerCase() || "";
      const kwEn = k.keyword_en?.toLowerCase() || "";

      // 플랫폼 블랙리스트
      if (PLATFORM_BLACKLIST.has(kwLower) || PLATFORM_BLACKLIST.has(kwEn) || PLATFORM_BLACKLIST.has(kwKo)) {
        console.warn(`[trend-detect] Blocked platform keyword: "${k.keyword}"`);
        return false;
      }

      // 아티스트/그룹 이름 차단 — 정확 일치 OR 키워드가 이름과 동일
      for (const blocked of allNameVariants) {
        // 정확 일치
        if (kwLower === blocked || kwKo === blocked || kwEn === blocked) {
          console.warn(`[trend-detect] Blocked artist/group name as keyword (exact): "${k.keyword}"`);
          return false;
        }
        // 키워드가 이름만으로 구성 (공백/조사 제거 후)
        const kwStripped = kwLower.replace(/[\s·,\-]+/g, "");
        const blockedStripped = blocked.replace(/[\s·,\-]+/g, "");
        if (kwStripped === blockedStripped) {
          console.warn(`[trend-detect] Blocked artist/group name as keyword (normalized): "${k.keyword}"`);
          return false;
        }
      }

      // 2글자 이하 단문 차단
      if (kwLower.length <= 1 && (!kwKo || kwKo.length <= 1)) return false;

      // 일반적인 한국어 K-pop 노이즈 키워드 차단
      const NOISE_BLACKLIST = new Set([
        "브랜드평판", "아이돌", "인기", "팬들", "컴백", "활동", "무대",
        "음방", "팬미팅", "콘서트", "앨범", "신곡", "타이틀곡",
        "데뷔", "연습생", "아이돌 개인 브랜드평판", "인천국제공항",
        "김포국제공항", "대만", "일본", "중국", "미국", "한국",
        // 일반 지명 (트렌드 가치 없음)
        "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
        "경기도", "강원도", "충청도", "전라도", "경상도", "제주도",
        "강남", "강남구", "서울 강남구", "서초구", "송파구", "종로구", "서울시 종로구",
        "홍대", "이태원", "명동", "동대문", "압구정", "청담",
        "도쿄", "오사카", "뉴욕", "파리", "런던", "방콕", "자카르타",
        "airport", "인천공항", "공항", "출국", "입국",
      ]);
      if (NOISE_BLACKLIST.has(kwLower) || NOISE_BLACKLIST.has(kwKo)) {
        console.warn(`[trend-detect] Blocked noise keyword: "${k.keyword}"`);
        return false;
      }

      // ownership_confidence 낮으면 차단 (맥락적 관련성 부족)
      if (k.ownership_confidence !== undefined && k.ownership_confidence < 0.5) {
        console.warn(`[trend-detect] Blocked low-ownership keyword: "${k.keyword}" (ownership=${k.ownership_confidence}, reason=${k.ownership_reason})`);
        return false;
      }

      // confidence 0.8 이상이면 텍스트 검증 스킵
      if (k.confidence >= 0.8) return true;

      // 텍스트 존재 검증
      if (allText.includes(kwLower) || (kwKo && allText.includes(kwKo)) || (kwEn && allText.includes(kwEn))) return true;

      if (kwKo) {
        const tokens = kwKo.split(/[\s·,]+/).filter(t => t.length >= 2);
        if (tokens.length > 0 && tokens.some(t => allText.includes(t))) return true;
      }

      const enTokens = kwLower.split(/[\s'']+/).filter(t => t.length >= 3);
      if (enTokens.length > 1 && enTokens.some(t => allText.includes(t))) return true;

      console.warn(`[trend-detect] Filtered out: "${k.keyword}" / "${k.keyword_ko}" (not in article text, conf=${k.confidence})`);
      return false;
    });

    console.log(`[trend-detect] Final ${extractedKeywords.length} keywords for ${memberName} after ownership+post-validation`);
    return extractedKeywords;
  } catch (e) {
    console.warn(`[trend-detect] Extraction error: ${(e as Error).message}`);
    return [];
  }
}

// ─── 쇼핑 결과에서 브랜드/상품 키워드 직접 추출 ───
function extractShopKeywords(
  shopItems: any[],
  memberName: string,
  groupName: string | null,
): ExtractedKeyword[] {
  if (!shopItems.length) return [];

  const memberLower = memberName.toLowerCase();
  const groupLower = (groupName || "").toLowerCase();
  // name_ko 추출 (괄호 안 한글명도 체크)
  const koMatch = memberName.match(/\(([가-힣]+)\)/);
  const nameKoLower = koMatch ? koMatch[1].toLowerCase() : "";
  const allNameVariants = [memberLower, groupLower, nameKoLower].filter(Boolean);

  // 쇼핑 상품명에서 브랜드명 추출 — 타이틀에 아티스트/그룹명이 포함된 상품만
  const brandCounts = new Map<string, { count: number; category: string; title: string; mallName: string }>();

  for (const item of shopItems) {
    const title = stripHtml(item.title || "");
    const titleLower = title.toLowerCase();
    const mallName = item.mallName || "";
    const brand = item.brand || "";
    const category1 = (item.category1 || "").toLowerCase();
    const category2 = (item.category2 || "").toLowerCase();

    // ★ 핵심 필터: 상품 타이틀에 아티스트/그룹/한글명이 실제 포함된 것만 통과
    const titleContainsArtist = allNameVariants.some(n => n.length >= 2 && titleLower.includes(n));
    if (!titleContainsArtist) continue;

    // 카테고리 매핑
    let kwCategory: ExtractedKeyword["category"] = "product";
    if (/패션|의류|신발|가방|액세서리/.test(category1 + category2)) kwCategory = "fashion";
    else if (/화장품|뷰티|스킨케어/.test(category1 + category2)) kwCategory = "beauty";
    else if (/식품|음료/.test(category1 + category2)) kwCategory = "food";

    // 브랜드 필드가 명확한 경우만 사용
    const brandName = brand;
    if (!brandName || brandName.length < 2) continue;
    const brandLower = brandName.toLowerCase();
    // 무의미 브랜드명 필터
    if (["unknown", "기타", "없음", "no brand", "etc", "n/a"].includes(brandLower)) continue;
    // 아티스트/그룹 이름 자체는 브랜드로 추출하지 않음
    if (allNameVariants.some(n => brandLower === n || brandLower.includes(n) || n.includes(brandLower))) continue;
    if (PLATFORM_BLACKLIST.has(brandLower)) continue;

    const existing = brandCounts.get(brandLower);
    if (existing) {
      existing.count++;
    } else {
      brandCounts.set(brandLower, { count: 1, category: kwCategory, title, mallName });
    }
  }

  // 2회 이상 등장하거나 명확한 브랜드명이 있는 것만 추출
  const results: ExtractedKeyword[] = [];
  for (const [brand, info] of brandCounts) {
    if (info.count < 2 && brand.split(/\s+/).length > 2) continue; // 긴 상품명은 2회 이상만
    results.push({
      keyword: brand,
      keyword_ko: brand,
      keyword_en: brand, // 쇼핑 결과에서 영문 변환은 후처리에서
      category: info.category as ExtractedKeyword["category"],
      confidence: Math.min(0.5 + info.count * 0.1, 0.9),
      context: `${memberName} related product found in Naver Shopping (${info.count} listings)`,
      context_ko: `네이버 쇼핑에서 ${memberName} 관련 상품 ${info.count}건 발견`,
      source_article_index: 0,
      commercial_intent: "organic",
      brand_intent: "conversion",
      fan_sentiment: "positive",
      trend_potential: Math.min(0.3 + info.count * 0.05, 0.8),
    });
  }

  return results.slice(0, 5);
}

// ─── AI 키워드 + 쇼핑 키워드 병합 (중복 제거) ───
function mergeKeywords(
  aiKeywords: ExtractedKeyword[],
  shopKeywords: ExtractedKeyword[],
): ExtractedKeyword[] {
  const seen = new Set<string>();
  const merged: ExtractedKeyword[] = [];

  // AI 키워드 우선
  for (const k of aiKeywords) {
    const key = (k.keyword_ko || k.keyword).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(k);
    }
  }

  // 쇼핑 키워드 추가 (AI에서 이미 발견된 것은 스킵)
  for (const k of shopKeywords) {
    const key = (k.keyword_ko || k.keyword).toLowerCase();
    // AI 키워드와 부분 매칭도 체크
    const isDuplicate = seen.has(key) || [...seen].some(existing =>
      existing.includes(key) || key.includes(existing)
    );
    if (!isDuplicate) {
      seen.add(key);
      // 쇼핑 소스 표시
      k.context = `[Shop] ${k.context}`;
      merged.push(k);
    }
  }

  return merged;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const COLLECTION_PAUSED = false;

  try {
    const body = await req.json().catch(() => ({}));
    const { starId, memberName, groupName, wikiEntryId, artistName, batchSize = 5, batchOffset = 0 } = body;

    if (COLLECTION_PAUSED) {
      console.warn(`[trend-detect] Collection paused. Ignoring request offset=${batchOffset}, size=${batchSize}`);
      return new Response(
        JSON.stringify({
          success: true,
          paused: true,
          starId: starId ?? null,
          memberName: memberName ?? artistName ?? null,
          groupName: groupName ?? null,
          wikiEntryId: wikiEntryId ?? null,
          batchOffset,
          batchSize,
          message: "T2 trend detection is temporarily paused",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const naverClientId = Deno.env.get("NAVER_CLIENT_ID");
    const naverClientSecret = Deno.env.get("NAVER_CLIENT_SECRET");
    const sb = createClient(supabaseUrl, supabaseKey);

    // 단일 멤버 모드 (수동 테스트용)
    if (starId && memberName) {
      const result = await detectForMember(
        sb, openaiKey, naverClientId, naverClientSecret,
        { id: starId, display_name: memberName, name_ko: null, group_name: groupName || null, group_name_ko: null, group_wiki_entry_id: wikiEntryId || null, star_category: body.starCategory || "kpop" }
      );
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 레거시 호환: wikiEntryId + artistName으로 호출 시
    if (wikiEntryId && artistName) {
      const result = await detectForMember(
        sb, openaiKey, naverClientId, naverClientSecret,
        { id: null, display_name: artistName, name_ko: null, group_name: null, group_name_ko: null, group_wiki_entry_id: wikiEntryId, star_category: "kpop" }
      );
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 배치 모드: ktrenz_stars의 group/solo/member 타입 순회
    const { data: allStars } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, group_star_id, star_category, star_type")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"])
      .order("display_name", { ascending: true });

    const allCandidates = allStars || [];

    // group_star_id로 그룹 정보 일괄 조회 (member 타입용)
    const groupIds = [...new Set(allCandidates.map((m: any) => m.group_star_id).filter(Boolean))];
    let groupMap: Record<string, { display_name: string; name_ko: string | null; wiki_entry_id: string | null }> = {};
    if (groupIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, wiki_entry_id")
        .in("id", groupIds);
      for (const g of (groups || [])) {
        groupMap[g.id] = { display_name: g.display_name, name_ko: g.name_ko, wiki_entry_id: g.wiki_entry_id };
      }
    }

    const batch = allCandidates.slice(batchOffset, batchOffset + batchSize);

    if (!batch.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No stars in batch", batchOffset, totalCandidates: allCandidates.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trend-detect] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} stars (total: ${allCandidates.length})`);

    let successCount = 0;
    let totalKeywords = 0;
    let totalNews = 0;
    let totalBlogs = 0;
    let totalShop = 0;
    let totalInserted = 0;
    let totalBackfilled = 0;
    let totalFiltered = 0;
    const artistResults: Array<{
      name: string;
      type: string;
      news: number;
      blog: number;
      shop: number;
      aiExtracted: number;
      shopExtracted: number;
      inserted: number;
      backfilled: number;
      filtered: number;
    }> = [];

    for (const star of batch) {
      try {
        const isGroup = star.star_type === "group";
        const isSolo = star.star_type === "solo";
        const group = star.group_star_id ? groupMap[star.group_star_id] : null;

        const memberInfo: MemberInfo = {
          id: star.id,
          display_name: star.display_name,
          name_ko: star.name_ko,
          group_name: isGroup ? null : (isSolo ? null : (group?.display_name || null)),
          group_name_ko: isGroup ? null : (isSolo ? null : (group?.name_ko || null)),
          group_wiki_entry_id: isGroup ? null : (isSolo ? null : (group?.wiki_entry_id || null)),
          star_category: star.star_category || "kpop",
        };

        const result = await detectForMember(
          sb, openaiKey, naverClientId, naverClientSecret, memberInfo
        );
        successCount++;
        totalKeywords += result.keywordsFound;
        totalNews += result.sourceStats.news;
        totalBlogs += result.sourceStats.blog;
        totalShop += result.sourceStats.shop;
        totalInserted += result.insertStats.inserted;
        totalBackfilled += result.insertStats.backfilled;
        totalFiltered += result.insertStats.filtered;

        artistResults.push({
          name: star.display_name,
          type: star.star_type,
          news: result.sourceStats.news,
          blog: result.sourceStats.blog,
          shop: result.sourceStats.shop,
          aiExtracted: result.sourceStats.aiExtracted,
          shopExtracted: result.sourceStats.shopExtracted,
          inserted: result.insertStats.inserted,
          backfilled: result.insertStats.backfilled,
          filtered: result.insertStats.filtered,
        });

        // ─── 기존 active 키워드 추적 (track phase 통합) ───
        const trackResult = await trackExistingKeywords(
          sb, naverClientId, naverClientSecret, star.id, star.display_name, star.name_ko
        );
        if (trackResult.tracked > 0) {
          console.log(`[trend-detect] ⟳ ${star.display_name}: tracked ${trackResult.tracked} existing keywords`);
        }

        // ─── DB에 스타별 처리 결과 기록 ───
        const detectResult = {
          news: result.sourceStats.news,
          blog: result.sourceStats.blog,
          shop: result.sourceStats.shop,
          keywords: result.keywordsFound,
          inserted: result.insertStats.inserted,
          tracked: trackResult.tracked,
          status: result.keywordsFound > 0 ? "found" : (result.sourceStats.news === 0 && result.sourceStats.blog === 0 ? "no_news" : "no_keywords"),
        };
        await sb.from("ktrenz_stars").update({
          last_detected_at: new Date().toISOString(),
          last_detect_result: detectResult,
        }).eq("id", star.id);

        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[trend-detect] ✗ ${star.display_name}: ${(e as Error).message}`);
        artistResults.push({
          name: star.display_name,
          type: star.star_type,
          news: 0, blog: 0, shop: 0,
          aiExtracted: 0, shopExtracted: 0,
          inserted: 0, backfilled: 0, filtered: 0,
        });
        // 에러도 기록
        await sb.from("ktrenz_stars").update({
          last_detected_at: new Date().toISOString(),
          last_detect_result: { status: "error", error: (e as Error).message },
        }).eq("id", star.id).catch(() => {});
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        batchSize,
        processed: batch.length,
        totalCandidates: allCandidates.length,
        successCount,
        totalKeywords,
        sourceStats: { news: totalNews, blog: totalBlogs, shop: totalShop },
        insertStats: { inserted: totalInserted, backfilled: totalBackfilled, filtered: totalFiltered },
        artistResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-detect] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface MemberInfo {
  id: string | null;
  display_name: string;
  name_ko: string | null;
  group_name: string | null;
  group_name_ko: string | null;
  group_wiki_entry_id: string | null;
  star_category: string;
}

async function detectForMember(
  sb: any,
  openaiKey: string,
  naverClientId: string,
  naverClientSecret: string,
  member: MemberInfo,
): Promise<{
  keywordsFound: number;
  articlesFound: number;
  keywords: ExtractedKeyword[];
  sourceStats: { news: number; blog: number; shop: number; aiExtracted: number; shopExtracted: number };
  insertStats: { inserted: number; backfilled: number; filtered: number };
}> {
  // 검색어 결정: 한글명 우선, 없으면 영문명
  // 그룹 멤버인 경우 "그룹명 멤버명" 형태로 검색하여 동명이인 방지 (예: "스트레이 키즈 필릭스")
  const searchName = member.name_ko || member.display_name;
  const groupLabel = member.group_name_ko || member.group_name;
  const searchQuery = groupLabel
    ? `"${searchName}" "${groupLabel}"`
    : `"${searchName}"`;

  // ─── 2소스 병렬 검색: News + Blog (Shopping 비활성화) ───
  const [newsResult, blogResult] = await Promise.all([
    searchNaver(naverClientId, naverClientSecret, "news", searchQuery, 50),
    searchNaver(naverClientId, naverClientSecret, "blog", searchQuery, 30),
  ]);

  const newsItems = newsResult.items;
  const blogItems = blogResult.items;
  const shopItems: any[] = []; // Shopping 수집 비활성화

  // 72시간 이내 + 일본어 기사 필터링 (News + Blog)
   const cutoff72h = Date.now() - 72 * 60 * 60 * 1000;
  const filterByTime = (items: any[]) => items.filter((item) => {
    const pubTime = new Date(item.pubDate || item.postdate).getTime();
    if (isNaN(pubTime) || pubTime < cutoff72h) return false;
    if (isJapanese(item.title) || isJapanese(item.description || item.bloggername || "")) return false;
    return true;
  });

  const filteredNews = filterByTime(newsItems);
  const filteredBlogs = filterByTime(blogItems);

  // News + Blog → AI 분석용 기사 목록으로 통합
  const articles = [
    ...filteredNews.map((item: any) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description),
      url: item.originallink || item.link,
    })),
    ...filteredBlogs.map((item: any) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description || ""),
      url: item.link,
    })),
  ];

  // Shopping → 상품명에서 직접 브랜드/상품 키워드 추출
  const shopKeywords = extractShopKeywords(shopItems, member.display_name, member.group_name);
  console.log(`[trend-detect] ${member.display_name}: news=${filteredNews.length}(total=${newsResult.total}) blog=${filteredBlogs.length}(total=${blogResult.total}) shop=${shopItems.length} shopKW=${shopKeywords.length}`);

  const srcStats = { news: filteredNews.length, blog: filteredBlogs.length, shop: shopItems.length, aiExtracted: 0, shopExtracted: shopKeywords.length };

  if (!articles.length && !shopKeywords.length) {
    return { keywordsFound: 0, articlesFound: 0, keywords: [], sourceStats: srcStats, insertStats: { inserted: 0, backfilled: 0, filtered: 0 } };
  }

  // AI로 상업 키워드 추출 (News + Blog 통합) — nameKo, groupNameKo 전달
  const aiKeywords = articles.length > 0
    ? await extractCommercialKeywords(
        openaiKey, member.display_name, member.group_name, articles, member.star_category,
        member.name_ko, member.group_name_ko
      )
    : [];

  srcStats.aiExtracted = aiKeywords.length;

  // Shop 키워드 + AI 키워드 병합 (중복 제거)
  const mergedKeywords = mergeKeywords(aiKeywords, shopKeywords);

  if (!mergedKeywords.length) {
    return { keywordsFound: 0, articlesFound: articles.length, keywords: [], sourceStats: srcStats, insertStats: { inserted: 0, backfilled: 0, filtered: 0 } };
  }

  // 아래부터 기존 로직 (keywords → mergedKeywords로 교체)
  const keywords = mergedKeywords;

  // 최근 7일 내 동일 멤버 키워드는 재삽입하지 않되, 빈 필드는 백필
  const keywordSources = keywords.map((k) => {
    let articleIdx = 0;
    if (k.source_article_index && k.source_article_index > 0) {
      articleIdx = k.source_article_index - 1;
    } else {
      const refMatch = k.context?.match(/\[(\d+)\]/);
      if (refMatch) articleIdx = parseInt(refMatch[1], 10) - 1;
    }

    const sourceArticle = articles[articleIdx] || articles[0];
    return { keywordData: k, sourceArticle, sourceUrl: sourceArticle?.url || null };
  });

  // 모든 기사 URL에서 OG 이미지를 수집 (최대 10개 기사)
  const allArticleUrls = articles
    .slice(0, 10)
    .map(a => a.url)
    .filter(Boolean)
    .filter(url => !SOURCE_IMAGE_BLACKLIST.some(d => url.includes(d)));
  const uniqueUrls = [...new Set([
    ...keywordSources.map((item) => item.sourceUrl).filter(Boolean) as string[],
    ...allArticleUrls,
  ])];
  const ogImageMap = new Map<string, string | null>();
  await Promise.allSettled(
    uniqueUrls
      .filter(url => !SOURCE_IMAGE_BLACKLIST.some(d => url.includes(d)))
      .map(async (url) => {
        ogImageMap.set(url, await fetchOgImage(url));
      })
  );

  // 키워드별 최적 이미지 선택: 텍스트 오버레이 이미지를 건너뛰고 깨끗한 사진 우선
  function selectBestImage(primaryUrl: string | null): string | null {
    // 1차: 주 소스 기사 이미지 (텍스트 오버레이가 아닌 경우)
    if (primaryUrl) {
      const img = ogImageMap.get(primaryUrl);
      if (img && !isLikelyTextOverlayImage(img)) return sanitizeImageUrl(img);
    }
    // 2차: 다른 기사들에서 깨끗한 이미지 찾기
    for (const [url, img] of ogImageMap) {
      if (!img || url === primaryUrl) continue;
      if (!isLikelyTextOverlayImage(img)) return sanitizeImageUrl(img);
    }
    // 3차: 텍스트 오버레이여도 없는 것보다는 나음
    if (primaryUrl) {
      const img = ogImageMap.get(primaryUrl);
      if (img) return sanitizeImageUrl(img);
    }
    return null;
  }

  // ─── 키워드별 buzz raw counts + normalized score ───
  const keywordBuzzData = new Map<string, { newsTotal: number; blogTotal: number; score: number }>();
  const buzzPromises = keywords.map(async (k) => {
    const kwQuery = k.keyword_ko || k.keyword;
    const artistLabel = member.name_ko || member.display_name;
    const { newsTotal, blogTotal } = await fetchKeywordBuzzCounts(
      naverClientId, naverClientSecret, artistLabel, kwQuery
    );
    const buzzScore = normalizeBuzzScore(newsTotal, blogTotal);
    keywordBuzzData.set(k.keyword.toLowerCase(), { newsTotal, blogTotal, score: buzzScore });
    console.log(`[trend-detect] buzz: "${artistLabel} ${kwQuery}" → news=${newsTotal} blog=${blogTotal} → score=${buzzScore}`);
  });
  await Promise.all(buzzPromises);

  const candidateRows = keywordSources.map(({ keywordData, sourceArticle, sourceUrl }) => {
    const buzz = keywordBuzzData.get(keywordData.keyword.toLowerCase()) || { newsTotal: 0, blogTotal: 0, score: 0 };
    return {
      extractedKeyword: keywordData,
      row: {
        wiki_entry_id: member.group_wiki_entry_id || null,
        star_id: member.id || null,
        trigger_type: "news_mention",
        trigger_source: keywordData.context?.startsWith("[Shop]") ? "naver_shop" : "naver_multi",
        artist_name: member.display_name,
        keyword: keywordData.keyword,
        keyword_en: keywordData.keyword_en || null,
        keyword_ko: keywordData.keyword_ko || null,
        keyword_ja: keywordData.keyword_ja || null,
        keyword_zh: keywordData.keyword_zh || null,
        keyword_category: keywordData.category,
        context: keywordData.context,
        context_ko: keywordData.context_ko || null,
        context_ja: keywordData.context_ja || null,
        context_zh: keywordData.context_zh || null,
        confidence: keywordData.confidence,
        source_url: sourceUrl,
        source_title: sourceArticle?.title || null,
        source_image_url: sanitizeImageUrl(sourceUrl ? ogImageMap.get(sourceUrl) || null : null),
        source_snippet: sourceArticle?.description?.slice(0, 500) || null,
        commercial_intent: keywordData.commercial_intent || null,
        brand_intent: keywordData.brand_intent || null,
        fan_sentiment: keywordData.fan_sentiment || null,
        trend_potential: keywordData.trend_potential ?? null,
        purchase_stage: keywordData.purchase_stage || null,
        baseline_score: buzz.newsTotal + buzz.blogTotal,
        status: "pending",
        metadata: {
          article_count: articles.length,
          search_name: searchName,
          group_name: member.group_name,
          buzz_news_total: buzz.newsTotal,
          buzz_blog_total: buzz.blogTotal,
          buzz_score_normalized: buzz.score,
        },
      },
    };
  });

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 키워드 목록: keyword (원문) + keyword_en (영문) + keyword_ko (한글) 모두로 중복 체크
  const allKeywordVariants = keywords.flatMap((k) => [
    k.keyword, k.keyword_en, k.keyword_ko
  ].filter(Boolean) as string[]);
  const uniqueVariants = [...new Set(allKeywordVariants)];

  const { data: existing } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_en, keyword_ko, keyword_ja, keyword_zh, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
    .eq("star_id", member.id)
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo);

  // keyword, keyword_en, keyword_ko 모두를 키로 매핑하여 크로스 소스 중복 감지
  const existingByKeyword = new Map<string, any>();
  for (const e of (existing || [])) {
    for (const field of [e.keyword, e.keyword_en, e.keyword_ko]) {
      if (field) existingByKeyword.set(field.toLowerCase(), e);
    }
  }

  // 크로스 아티스트 중복 제거 (keyword, keyword_en, keyword_ko 모두 체크)
  const { data: crossExisting } = await sb
    .from("ktrenz_trend_triggers")
    .select("keyword, keyword_en, keyword_ko")
    .neq("star_id", member.id)
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo);

  const crossSet = new Set<string>();
  for (const e of (crossExisting || [])) {
    if (e.keyword) crossSet.add(e.keyword.toLowerCase());
    if (e.keyword_en) crossSet.add(e.keyword_en.toLowerCase());
    if (e.keyword_ko) crossSet.add(e.keyword_ko.toLowerCase());
  }

  const rowsToInsert: any[] = [];
  const insertedKeywords: ExtractedKeyword[] = [];
  const backfillPromises: PromiseLike<unknown>[] = [];
  const batchInsertedKeys = new Set<string>(); // 같은 배치 내 중복 방지

  // 아티스트/그룹명과 일치하는 키워드 차단용 셋 (정규화 포함)
  const artistNameSet = new Set<string>();
  for (const n of [member.display_name, member.name_ko, member.group_name, member.group_name_ko]) {
    if (n) {
      artistNameSet.add(n.toLowerCase());
      artistNameSet.add(n.toLowerCase().replace(/[\s·,\-]+/g, ""));
    }
  }

  // 노이즈 블랙리스트
  const INSERT_NOISE_BLACKLIST = new Set([
    "브랜드평판", "아이돌", "인기", "팬들", "컴백", "활동", "무대",
    "음방", "팬미팅", "콘서트", "앨범", "신곡", "타이틀곡",
    "데뷔", "연습생", "아이돌 개인 브랜드평판", "인천국제공항",
    "김포국제공항", "대만", "일본", "중국", "미국", "한국",
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기도", "강원도", "충청도", "전라도", "경상도", "제주도",
    "강남", "강남구", "서울 강남구", "서초구", "송파구", "종로구", "서울시 종로구",
    "홍대", "이태원", "명동", "동대문", "압구정", "청담",
    "도쿄", "오사카", "뉴욕", "파리", "런던", "방콕", "자카르타",
    "airport", "인천공항", "공항", "출국", "입국",
  ]);

  for (const candidate of candidateRows) {
    const kwLower = candidate.row.keyword.toLowerCase();
    const kwEnLower = candidate.row.keyword_en?.toLowerCase() || "";
    const kwKoLower = candidate.row.keyword_ko?.toLowerCase() || "";
    const kwStripped = kwLower.replace(/[\s·,\-]+/g, "");

    // 아티스트/그룹명과 일치하는 키워드 차단 (정규화 포함)
    if (artistNameSet.has(kwLower) || artistNameSet.has(kwStripped) ||
        (kwKoLower && (artistNameSet.has(kwKoLower) || artistNameSet.has(kwKoLower.replace(/[\s·,\-]+/g, "")))) ||
        (kwEnLower && (artistNameSet.has(kwEnLower) || artistNameSet.has(kwEnLower.replace(/[\s·,\-]+/g, ""))))) {
      console.warn(`[trend-detect] Artist name keyword filtered: "${candidate.row.keyword}"`);
      continue;
    }

    // 노이즈 필터
    if (INSERT_NOISE_BLACKLIST.has(kwLower) || INSERT_NOISE_BLACKLIST.has(kwKoLower)) {
      console.warn(`[trend-detect] Noise keyword filtered at insert: "${candidate.row.keyword}"`);
      continue;
    }

    // 크로스 아티스트 중복 필터 (keyword, keyword_en, keyword_ko 모두 체크)
    if (crossSet.has(kwLower) || (kwEnLower && crossSet.has(kwEnLower)) || (kwKoLower && crossSet.has(kwKoLower))) {
      console.warn(`[trend-detect] Cross-artist duplicate filtered: "${candidate.row.keyword}"`);
      continue;
    }

    const current = existingByKeyword.get(kwLower) || (kwEnLower ? existingByKeyword.get(kwEnLower) : null) || (kwKoLower ? existingByKeyword.get(kwKoLower) : null);

    if (!current) {
      if (batchInsertedKeys.has(kwLower)) {
        continue; // 같은 배치에서 이미 삽입 예정
      }
      batchInsertedKeys.add(kwLower);
      rowsToInsert.push(candidate.row);
      insertedKeywords.push(candidate.extractedKeyword);
      continue;
    }

    const patch: Record<string, unknown> = {};
    const backfillFields = [
      "keyword_en",
      "keyword_ko",
      "keyword_ja",
      "keyword_zh",
      "context",
      "context_ko",
      "context_ja",
      "context_zh",
      "source_url",
      "source_title",
      "source_image_url",
      "source_snippet",
    ] as const;

    for (const field of backfillFields) {
      const currentValue = (current as Record<string, any>)[field];
      const nextValue = (candidate.row as Record<string, any>)[field];
      if ((currentValue == null || currentValue === "") && nextValue) {
        patch[field] = nextValue;
      }
    }

    if (Object.keys(patch).length > 0) {
      backfillPromises.push(
        sb.from("ktrenz_trend_triggers").update(patch).eq("id", current.id)
      );
    }
  }

  if (rowsToInsert.length > 0) {
    const { data: inserted } = await sb.from("ktrenz_trend_triggers").insert(rowsToInsert).select("id");
    // 비동기 이미지 캐시 호출
    if (inserted?.length) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/ktrenz-cache-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ triggerIds: inserted.map((r: any) => r.id) }),
      }).catch((e) => console.warn(`[trend-detect] cache-image fire-and-forget error: ${e.message}`));
    }
  }

  if (backfillPromises.length > 0) {
    await Promise.allSettled(backfillPromises);
  }

  const filteredCount = candidateRows.length - rowsToInsert.length - backfillPromises.length;

  console.log(
    `[trend-detect] ${member.display_name}: inserted ${rowsToInsert.length} new, backfilled ${backfillPromises.length}, filtered ${filteredCount}`
  );

  return {
    keywordsFound: rowsToInsert.length,
    articlesFound: articles.length,
    keywords: insertedKeywords,
    sourceStats: srcStats,
    insertStats: { inserted: rowsToInsert.length, backfilled: backfillPromises.length, filtered: Math.max(0, filteredCount) },
  };
}

// ─── 기존 active 키워드 재측정 (track phase 통합) ───
async function trackExistingKeywords(
  sb: any,
  naverClientId: string,
  naverClientSecret: string,
  starId: string,
  displayName: string,
  nameKo: string | null,
): Promise<{ tracked: number }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: activeTriggers } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, artist_name, baseline_score, peak_score, influence_index, detected_at, peak_at, trigger_source, prev_api_total")
    .eq("star_id", starId)
    .eq("status", "active")
    .gte("detected_at", weekAgo)
    .neq("trigger_source", "naver_shop");

  if (!activeTriggers?.length) return { tracked: 0 };

  let tracked = 0;
  const artistLabel = nameKo || displayName;

  for (const trigger of activeTriggers) {
    try {
      const kwQuery = trigger.keyword_ko || trigger.keyword;
      const searchQuery = `"${artistLabel}" "${kwQuery}"`;

      const [newsResult, blogResult] = await Promise.all([
        searchNaverRecent7d(naverClientId, naverClientSecret, "news", searchQuery),
        searchNaverRecent7d(naverClientId, naverClientSecret, "blog", searchQuery),
      ]);

      const newsRecent = newsResult.recent;
      const blogRecent = blogResult.recent;
      const rawCount = newsRecent + blogRecent;
      const buzzScore = normalizeBuzzScore(newsRecent, blogRecent);
      const apiTotal = newsResult.total + blogResult.total;
      const baseline = trigger.baseline_score || 0;
      const deltaPct = baseline > 0
        ? Math.round(((rawCount - baseline) / baseline) * 10000) / 100
        : rawCount > 0 ? 100 : 0;

      const prevApiTotal = trigger.prev_api_total || 0;
      const dailyDelta = prevApiTotal > 0 ? apiTotal - prevApiTotal : 0;

      // tracking 레코드 저장
      await sb.from("ktrenz_trend_tracking").insert({
        trigger_id: trigger.id,
        keyword: trigger.keyword,
        interest_score: rawCount,
        region: "naver",
        delta_pct: deltaPct,
        raw_response: {
          news_recent: newsRecent, blog_recent: blogRecent,
          news_api_total: newsResult.total, blog_api_total: blogResult.total,
          api_total: apiTotal, daily_delta: dailyDelta,
          buzz_score_normalized: buzzScore, search_query: searchQuery,
        },
      });

      // peak/influence 갱신 + prev_api_total 저장
      const updates: any = { prev_api_total: apiTotal };
      if (baseline <= 0 && rawCount > 0) {
        updates.baseline_score = rawCount;
        updates.peak_score = rawCount;
      } else if (baseline > 0) {
        if (rawCount > (trigger.peak_score || 0)) {
          updates.peak_score = rawCount;
          updates.peak_at = new Date().toISOString();
        }
        const currentPeak = updates.peak_score ?? trigger.peak_score ?? rawCount;
        updates.influence_index = Math.round(((currentPeak - baseline) / baseline) * 10000) / 100;
      }
      await sb.from("ktrenz_trend_triggers").update(updates).eq("id", trigger.id);

      // 스마트 만료
      const ageDays = (Date.now() - new Date(trigger.detected_at).getTime()) / 86400000;
      const influence = trigger.influence_index ?? 0;
      let shouldExpire = false, expireReason = "";

      if (ageDays >= 3 && influence <= 5) {
        const { data: recent } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score").eq("trigger_id", trigger.id)
          .gte("tracked_at", new Date(Date.now() - 3 * 86400000).toISOString())
          .order("tracked_at", { ascending: false }).limit(10);
        const scores = (recent ?? []).map((r: any) => r.interest_score);
        if (scores.length >= 3 && scores.every((s: number) => s <= (trigger.baseline_score ?? 10))) {
          shouldExpire = true; expireReason = "early_decay";
        }
      }
      if (!shouldExpire && ageDays > 14 && influence <= 20) { shouldExpire = true; expireReason = "lifecycle_end"; }
      if (!shouldExpire && ageDays > 30) { shouldExpire = true; expireReason = "hard_cap_30d"; }

      if (shouldExpire) {
        const now = new Date();
        await sb.from("ktrenz_trend_triggers").update({
          status: "expired",
          expired_at: now.toISOString(),
          lifetime_hours: Math.round((now.getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10,
          peak_delay_hours: trigger.peak_at
            ? Math.round((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10 : 0,
        }).eq("id", trigger.id);
      }

      tracked++;
      await new Promise(r => setTimeout(r, 300)); // rate limit
    } catch (e) {
      console.warn(`[trend-detect] track error: ${trigger.keyword}: ${(e as Error).message}`);
    }
  }

  return { tracked };
}
