// T2 Trend Detect: 순수 키워드 발견 엔진
// 아티스트 대상 네이버 뉴스/블로그 + YouTube 검색 → AI 키워드 추출 → ktrenz_keywords + ktrenz_keyword_sources에 저장
// 추적(tracking)은 별도 ktrenz-trend-track에서 수행 (이 함수에서는 buzz score 수집하지 않음)
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
  category: "brand" | "product" | "place" | "restaurant" | "food" | "fashion" | "beauty" | "media" | "music" | "event" | "social";
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
  _tiktok_cover_url?: string | null;
  _tiktok_source_url?: string | null;
}

// Platform names and non-trackable entities blacklist
const PLATFORM_BLACKLIST = new Set([
  "youtube", "spotify", "tiktok", "instagram", "twitter", "x", "facebook",
  "apple music", "melon", "genie", "bugs", "flo", "vibe", "soundcloud",
  "weverse", "vlive", "bubble", "universe", "phoning", "lysn",
  "naver", "google", "daum", "kakao", "naver news", "theqoo", "pann",
  "billboard", "hanteo", "한터차트", "한터", "gaon", "circle chart", "써클차트", "oricon",
  "mnet", "kbs", "sbs", "mbc", "jtbc", "tvn", "tv chosun",
  "netflix", "넷플릭스", "disney+", "디즈니플러스", "disney plus",
  "amazon", "아마존", "hulu", "wavve", "웨이브", "tving", "티빙", "coupang play", "쿠팡플레이",
  "sns", "hybe", "sm", "yg", "jyp", "starship", "pledis", "cube",
]);

// 소속사/기획사 이름 (부분 일치 방식으로 차단)
const AGENCY_BLACKLIST_PATTERNS = [
  "엔터테인먼트", "entertainment",
  "hybe", "하이브", "bighit", "빅히트",
  "sm엔터", "sm entertainment", "에스엠",
  "yg엔터", "yg entertainment", "와이지",
  "jyp엔터", "jyp entertainment", "제이와이피",
  "starship", "스타쉽", "큐브엔터", "cube entertainment",
  "pledis", "플레디스", "woollim", "울림",
  "fnc엔터", "fnc entertainment",
  "rbw", "알비더블유",
  "koz엔터", "koz entertainment",
  "ador", "아도어",
  "belift", "빌리프",
  "ist엔터", "ist entertainment",
  "wm엔터", "wm entertainment",
  "top media", "탑미디어",
  "fantiago", "판타지오",
  "jellyfish", "젤리피쉬",
  "dsp미디어", "dsp media",
  "antenna", "안테나",
  "aomg",
  "p nation", "피네이션",
];

function isAgencyKeyword(kw: string): boolean {
  const lower = kw.toLowerCase();
  return AGENCY_BLACKLIST_PATTERNS.some(p => lower.includes(p));
}

// 이미지 수집 불가 도메인 (봇 차단, 핫링크 차단)
const SOURCE_IMAGE_BLACKLIST = [
  "ddaily.co.kr",
  "fbcdn.net",
  "cdninstagram.com",
  "scontent.",
];

// ── 메이저 매체 판별: 동일 기사 중복 시 메이저 매체 기사를 우선 유지 ──
const MAJOR_OUTLET_PATTERNS = [
  "yna.co.kr", "yonhapnews", // 연합뉴스
  "chosun.com", "donga.com", "joongang.co.kr", "hani.co.kr", // 4대 일간지
  "hankyung.com", "mk.co.kr", "mt.co.kr", "sedaily.com", // 경제지
  "sbs.co.kr", "kbs.co.kr", "mbc.co.kr", "jtbc.co.kr", // 방송사
  "newsen.com", "starnews.co.kr", "xsportsnews", "spotvnews", "osen.mt.co.kr", // 연예매체
  "entertain.naver.com", "news.naver.com",
  "sports.chosun.com", "isplus.com", "heraldcorp.com",
];
function isMajorOutlet(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return MAJOR_OUTLET_PATTERNS.some(p => lower.includes(p));
}

// ── 제목 유사도 기반 중복 제거 ──
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.replace(/[^\w\uAC00-\uD7AF]/g, " ").split(/\s+/).filter(w => w.length >= 2));
  const wordsB = new Set(b.replace(/[^\w\uAC00-\uD7AF]/g, " ").split(/\s+/).filter(w => w.length >= 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

function deduplicateArticles<T extends { title: string; isMajor?: boolean }>(articles: T[]): T[] {
  // 메이저 매체 우선 정렬
  const sorted = [...articles].sort((a, b) => (b.isMajor ? 1 : 0) - (a.isMajor ? 1 : 0));
  const kept: T[] = [];
  for (const article of sorted) {
    const isDup = kept.some(k => titleSimilarity(k.title, article.title) >= 0.75);
    if (!isDup) kept.push(article);
  }
  if (articles.length > kept.length) {
    console.log(`[trend-detect] Dedup: ${articles.length} → ${kept.length} articles (removed ${articles.length - kept.length} duplicates)`);
  }
  return kept;
}

// ── OpenAI Vision 기반 이미지 품질 분류 ──
// OG 이미지들을 일괄로 분석하여 텍스트 오버레이/카드뉴스/배너 이미지를 식별
async function classifyImagesWithVision(
  imageUrls: string[],
  openaiKey: string,
): Promise<Set<string>> {
  const textOverlaySet = new Set<string>();
  if (imageUrls.length === 0) return textOverlaySet;

  // 비용 절감: 최대 10개까지만 분석 (주기당 아티스트 1명 기준)
  const batch = imageUrls.slice(0, 10);

  const userContent: any[] = [
    {
      type: "text",
      text: `Analyze these ${batch.length} images. For each image, determine if it is a CLEAN photo (person/scene with minimal text) or a TEXT-HEAVY image (card news, infographic, banner, screenshot, chart, text overlay, composite layout with heavy text).

Reply ONLY with a JSON array of objects: [{"index": 0, "text_heavy": true/false}]
No explanation needed.`,
    },
  ];

  for (let i = 0; i < batch.length; i++) {
    userContent.push({
      type: "image_url",
      image_url: { url: batch[i], detail: "low" },
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[trend-detect] Vision API error ${res.status}, skipping image classification`);
      return textOverlaySet;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";

    // JSON 배열 파싱
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);
      for (const r of results) {
        if (r.text_heavy && typeof r.index === "number" && r.index < batch.length) {
          textOverlaySet.add(batch[r.index]);
          console.log(`[trend-detect] Vision: text-heavy image #${r.index} → ${batch[r.index].slice(0, 80)}`);
        }
      }
    }
  } catch (e) {
    console.warn(`[trend-detect] Vision classification error:`, (e as Error).message);
  }

  return textOverlaySet;
}

// URL 정규화: HTML 엔티티 디코딩 + 트래킹 픽셀/오염 URL 차단
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.includes('data:image/') || url.includes('base64,')) return null;
  if (url.includes('facebook.com/tr') || url.includes('/tr?id=') || url.includes('&ev=PageView')) return null;
  if (url.includes('noscript=1')) return null;
  let cleaned = url.replace(/&amp;/g, "&");
  // http → https 강제 변환 (og:image 등에서 http:// 제공하는 사이트 대응)
  if (cleaned.startsWith("http://")) cleaned = cleaned.replace("http://", "https://");
  return cleaned;
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[()\[\]{}'"`“”‘’·,\-_\s]+/g, "");
}

function collectNameVariants(...inputs: Array<string | null | undefined>): Set<string> {
  const variants = new Set<string>();

  for (const input of inputs) {
    if (!input) continue;
    const trimmed = input.trim();
    if (!trimmed) continue;

    variants.add(trimmed.toLowerCase());

    const normalized = normalizeForCompare(trimmed);
    if (normalized) variants.add(normalized);

    const withoutParen = trimmed.replace(/\([^)]*\)/g, " ").trim();
    if (withoutParen && withoutParen !== trimmed) {
      variants.add(withoutParen.toLowerCase());
      const normalizedWithoutParen = normalizeForCompare(withoutParen);
      if (normalizedWithoutParen) variants.add(normalizedWithoutParen);
    }

    for (const match of trimmed.matchAll(/\(([^)]+)\)/g)) {
      const inner = match[1]?.trim();
      if (!inner) continue;
      variants.add(inner.toLowerCase());
      const normalizedInner = normalizeForCompare(inner);
      if (normalizedInner) variants.add(normalizedInner);
    }
  }

  return variants;
}

function matchesBlockedNameKeyword(
  candidate: { keyword?: string | null; keyword_ko?: string | null; keyword_en?: string | null },
  blockedNames: Set<string>,
): boolean {
  for (const value of [candidate.keyword, candidate.keyword_ko, candidate.keyword_en]) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    // 1) 정확히 일치
    if (blockedNames.has(trimmed.toLowerCase()) || blockedNames.has(normalizeForCompare(trimmed))) {
      return true;
    }
    // 2) 복합 이름 차단: "그룹명 멤버명", "멤버명 그룹명" 등
    //    키워드를 공백/슬래시로 분리 후, 모든 토큰이 blockedNames에 포함되면 차단
    const tokens = trimmed.split(/[\s\/]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every(t =>
      blockedNames.has(t.toLowerCase()) || blockedNames.has(normalizeForCompare(t))
    )) {
      return true;
    }
  }

  return false;
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

// ─── YouTube 검색 (발견용: 최근 7일 영상 제목에서 키워드 후보 추출) ───
interface YouTubeDetectResult {
  items: { title: string; description: string; url: string; publishedAt: string; thumbnailUrl: string | null }[];
  totalResults: number;
}

async function searchYouTubeForDetect(
  apiKey: string,
  query: string,
  maxResults: number = 15,
  onQuotaExhausted?: (key: string) => void,
): Promise<YouTubeDetectResult> {
  try {
    const publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("order", "relevance");
    searchUrl.searchParams.set("publishedAfter", publishedAfter);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("relevanceLanguage", "ko");
    searchUrl.searchParams.set("key", apiKey);

    // 10초 타임아웃으로 YouTube API 지연이 전체 배치를 블로킹하지 않도록 함
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(searchUrl.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 403) {
        console.warn(`[trend-detect] YouTube API key exhausted (403), marking for rotation`);
        onQuotaExhausted?.(apiKey);
        return { items: [], totalResults: -1 }; // -1 signals quota exhaustion for retry
      }
      console.warn(`[trend-detect] YouTube API error: ${response.status} - ${errText.slice(0, 200)}`);
      return { items: [], totalResults: 0 };
    }
    const data = await response.json();
    const items = (data.items || []).map((item: any) => ({
      title: item.snippet?.title || "",
      description: (item.snippet?.description || "").slice(0, 200),
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      publishedAt: item.snippet?.publishedAt || "",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || null,
    }));
    return { items, totalResults: data.pageInfo?.totalResults || items.length };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("abort") || msg.includes("signal")) {
      console.warn(`[trend-detect] YouTube search timeout (10s), skipping: ${query}`);
    } else {
      console.warn(`[trend-detect] YouTube search error: ${msg}`);
    }
    return { items: [], totalResults: 0 };
  }
}

// YouTube 검색 with 자동 키 로테이션 (403 시 다음 키로 재시도)
async function searchYouTubeWithRotation(
  getKey: () => string | null,
  markExhausted: (key: string) => void,
  query: string,
  maxResults: number = 15,
): Promise<YouTubeDetectResult> {
  for (let attempt = 0; attempt < 7; attempt++) {
    const key = getKey();
    if (!key) return { items: [], totalResults: 0 }; // 모든 키 소진
    const result = await searchYouTubeForDetect(key, query, maxResults, markExhausted);
    if (result.totalResults === -1) continue; // 403 → 다음 키로 재시도
    return result;
  }
  console.warn(`[trend-detect] All YouTube API keys exhausted`);
  return { items: [], totalResults: 0 };
}

// ─── Buzz Score 정규화 (UI 표시용으로 유지) ───
function normalizeBuzzScore(newsCount: number, blogCount: number): number {
  const newsCap = 100;
  const blogCap = 100;
  const newsNorm = newsCount > 0 ? (Math.log10(newsCount + 1) / Math.log10(newsCap + 1)) * 100 : 0;
  const blogNorm = blogCount > 0 ? (Math.log10(blogCount + 1) / Math.log10(blogCap + 1)) * 100 : 0;
  const buzzScore = Math.round(Math.min(newsNorm * 0.6 + blogNorm * 0.4, 100));
  return buzzScore;
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

// ─── 기사 이미지 전량 수집 (캡션/alt 텍스트 포함) ───
interface ArticleImage {
  url: string;
  caption: string; // alt text + nearby caption text
  isOg: boolean;   // og:image or twitter:image
  inArticleBody: boolean; // 기사 본문 컨테이너 내 이미지 여부
  index: number;   // position in article
}

async function fetchArticleImages(articleUrl: string): Promise<ArticleImage[]> {
  function resolveUrl(src: string, baseUrl: string): string | null {
    if (!src || src.length < 3) return null;
    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
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
    const res = await fetch(articleUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const reader = res.body?.getReader();
    if (!reader) return [];
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const images: ArticleImage[] = [];
    const seenUrls = new Set<string>();
    let imgIndex = 0;

    // 기사 본문 컨테이너 시작/끝 위치 감지 (뉴스엔: #CLtag, articleBody, article class 등)
    const articleBodyPatterns = [
      /itemprop=["']articleBody["']/i,
      /id=["'](?:CLtag|articleBody|article[_-]?body|news[_-]?body|content[_-]?body|article[_-]?content)["']/i,
      /class=["'][^"']*(?:article[_-]?body|news[_-]?body|article[_-]?content|article[_-]?text|content[_-]?body|story[_-]?body|artclBody|newsct_article)["']/i,
    ];
    let articleBodyStart = -1;
    let articleBodyEnd = html.length;
    for (const pattern of articleBodyPatterns) {
      const m = html.match(pattern);
      if (m && m.index != null) {
        articleBodyStart = m.index;
        // 해당 컨테이너의 닫는 태그까지를 본문 범위로 잡음 (최대 50KB 제한)
        const closeTagSearch = html.slice(articleBodyStart, Math.min(articleBodyStart + 50000, html.length));
        // 중첩 div 대응: 같은 레벨의 닫는 태그를 찾기 위해 간략한 탐색
        const closeIdx = closeTagSearch.lastIndexOf("</div>");
        if (closeIdx > 0) articleBodyEnd = articleBodyStart + closeIdx;
        break;
      }
    }

    // 1) og:image
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const resolved = resolveUrl(ogMatch[1].replace(/&amp;/g, "&"), articleUrl);
      if (resolved && !seenUrls.has(resolved)) {
        seenUrls.add(resolved);
        images.push({ url: resolved, caption: "", isOg: true, inArticleBody: false, index: imgIndex++ });
      }
    }

    // 2) twitter:image
    const twMatch = html.match(/<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const resolved = resolveUrl(twMatch[1].replace(/&amp;/g, "&"), articleUrl);
      if (resolved && !seenUrls.has(resolved)) {
        seenUrls.add(resolved);
        images.push({ url: resolved, caption: "", isOg: true, inArticleBody: false, index: imgIndex++ });
      }
    }

    // 3) 본문 내 모든 <img> + 주변 캡션 텍스트 수집
    // <figure>, <figcaption>, <em>, <span class="caption">, alt 등에서 캡션 추출
    const imgRegex = /<(?:figure|div)[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>[\s\S]*?(?:<(?:figcaption|em|span|p|div)[^>]*>([\s\S]*?)<\/(?:figcaption|em|span|p|div)>)?[\s\S]*?<\/(?:figure|div)>|<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
    
    // 각 <img> 태그와 주변 텍스트 수집 (lazy-loading 대응: data-srcset, data-src 우선)
    const imgTagRegex = /<img[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgTagRegex.exec(html)) !== null) {
      const imgTag = imgMatch[0];
      
      // lazy-loading 대응: data-srcset > data-src > srcset > src 순으로 실제 이미지 URL 추출
      let src: string | null = null;
      
      // 속성 파서: quoted/unquoted HTML 속성 모두 지원
      function extractImgAttr(tag: string, attr: string): string | null {
        const match = tag.match(new RegExp(`\\b${attr}=(?:["']([^"']+)["']|([^\\s>]+))`, "i"));
        const value = match?.[1] || match?.[2] || null;
        return value ? value.trim() : null;
      }
      
      // srcset 파서: URL 내부 콤마(Cloudflare CDN 등 f=auto,w=1200)를 안전하게 처리
      function parseSrcset(raw: string): string | null {
        const entries: string[] = [];
        const parts = raw.split(/,\s+(?=https?:\/\/|\/)/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const spaceIdx = trimmed.search(/\s+\d+(\.\d+)?[wx]\s*$/);
          const url = spaceIdx > 0 ? trimmed.slice(0, spaceIdx).trim() : trimmed;
          if (url && !url.startsWith("data:")) entries.push(url);
        }
        return entries.length > 0 ? entries[entries.length - 1] : null;
      }
      
      // data-srcset (SBS 등 lazy-load 사이트)
      const dataSrcset = extractImgAttr(imgTag, "data-srcset");
      if (dataSrcset) {
        src = parseSrcset(dataSrcset);
      }
      
      // data-src
      if (!src) {
        const dataSrc = extractImgAttr(imgTag, "data-src");
        if (dataSrc && !dataSrc.startsWith("data:")) src = dataSrc;
      }
      
      // srcset
      if (!src) {
        const srcset = extractImgAttr(imgTag, "srcset");
        if (srcset) {
          src = parseSrcset(srcset);
        }
      }

      // src (폴백, 단 base64/data URI는 스킵)
      if (!src) {
        const rawSrc = extractImgAttr(imgTag, "src");
        if (rawSrc && !rawSrc.startsWith("data:") && !rawSrc.includes("data:image/")) {
          src = rawSrc;
        }
      }
      
      if (!src) continue;
      if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
      if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner|\/menu\/|\/sns\d|\/gong\.|\/common\/|\/layout\//i.test(src)) continue;

      // 사이드바/관련기사 컨테이너 내 이미지 제외
      // 이미지 위치 앞 500자를 역방향 탐색하여 사이드바 컨테이너 감지
      const lookbackStart = Math.max(0, imgMatch.index - 500);
      const lookbackText = html.slice(lookbackStart, imgMatch.index);
      const sidebarPatterns = /class=["'][^"']*(?:news_slide|best_click|best_list|rank|aside|related|recommend|popular|most_read|hot_issue|star_sns|sidebar)["']|id=["'](?:aside|sidebar|taboola)["']/i;
      if (sidebarPatterns.test(lookbackText)) continue;
      // 트래킹 픽셀 필터링
      if (/facebook\.com\/tr|\/tr\?id=|noscript=1/i.test(src)) continue;
      
      const resolved = resolveUrl(src.replace(/&amp;/g, "&"), articleUrl);
      if (!resolved || seenUrls.has(resolved)) continue;
      // 최종 검증: resolved URL에 data:image가 섞여있는 경우 스킵
      if (resolved.includes("data:image/") || resolved.includes("base64,")) continue;
      seenUrls.add(resolved);
      
      // alt 텍스트 추출
      let caption = extractImgAttr(imgTag, "alt") || "";
      
      // 이미지 주변 200자 범위에서 캡션 텍스트 추출
      const pos = imgMatch.index;
      const surroundingText = html.slice(pos, Math.min(pos + 500, html.length));
      
      // <figcaption>, <em>, <span class="caption">, <p class="caption"> 등에서 캡션 추출
      const captionMatch = surroundingText.match(/<(?:figcaption|em|span|p|div)[^>]*class=["'][^"']*(?:caption|desc|photo_txt|image_desc|artimg|photo-caption)[^"']*["'][^>]*>([\s\S]*?)<\/(?:figcaption|em|span|p|div)>/i)
        || surroundingText.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)
        || surroundingText.match(/<em[^>]*>([\s\S]*?)<\/em>/i);
      
      if (captionMatch?.[1]) {
        const captionText = captionMatch[1].replace(/<[^>]*>/g, "").trim();
        if (captionText.length > 2 && captionText.length < 200) {
          caption = caption ? `${caption} ${captionText}` : captionText;
        }
      }
      
      const isInBody = articleBodyStart >= 0 && imgMatch.index >= articleBodyStart && imgMatch.index <= articleBodyEnd;
      images.push({ url: resolved, caption, isOg: false, inArticleBody: isInBody, index: imgIndex++ });
      
      // 최대 15개까지만
      if (images.length >= 15) break;
    }

    // 4) <video> poster 또는 .viewer background-image에서 영상 썸네일 추출
    if (images.length === 0 || images.every(i => i.isOg)) {
      // video poster attribute
      const videoPosterMatch = html.match(/<video[^>]*\bposter=["']([^"']+)["']/i);
      if (videoPosterMatch?.[1]) {
        const resolved = resolveUrl(videoPosterMatch[1].replace(/&amp;/g, "&"), articleUrl);
        if (resolved && !seenUrls.has(resolved) && !resolved.includes("data:image/")) {
          seenUrls.add(resolved);
          images.push({ url: resolved, caption: "video thumbnail", isOg: false, inArticleBody: false, index: imgIndex++ });
        }
      }
      // background-image in style (e.g. MBC/SBS video viewer div)
      const bgImageMatch = html.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
      if (bgImageMatch?.[1]) {
        const resolved = resolveUrl(bgImageMatch[1].replace(/&amp;/g, "&"), articleUrl);
        if (resolved && !seenUrls.has(resolved) && !resolved.includes("data:image/") && !/\.(gif|svg|ico)(\?|$)/i.test(resolved)) {
          seenUrls.add(resolved);
          images.push({ url: resolved, caption: "video thumbnail", isOg: false, inArticleBody: false, index: imgIndex++ });
        }
      }
    }

    return images;
  } catch {
    return [];
  }
}

// 하위 호환용 래퍼 (단일 이미지 반환)
async function fetchOgImage(url: string): Promise<string | null> {
  const images = await fetchArticleImages(url);
  return images.length > 0 ? images[0].url : null;
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
              category: { type: "string", enum: ["brand", "product", "place", "restaurant", "food", "fashion", "beauty", "media", "music", "event"] },
              confidence: { type: "number", description: "0.0-1.0 based on how clearly the text links the entity to the artist" },
              context: { type: "string", description: "3-4 sentences in Korean (한국어). NEVER copy the article headline. NEVER end with '...' or '…' — every sentence must be complete. Write an original editorial narrative from the article BODY content. 매거진 에디터가 쓰는 것처럼 구체적이고 생동감 있는 내러티브를 작성. 반드시 포함: (1) 구체적 출처·매체·행사명 (2) 아티스트가 무엇을 했는지/어떤 상황인지 디테일 (3) 왜 이것이 주목할 만한지 (4) 기사 본문의 고유한 정보(날짜, 장소, 브랜드, 제품 모델명, 상대방 이름 등). 전체 내러티브를 생략 없이 완성할 것. 말줄임표(...)로 끝내지 말 것." },
              context_ko: { type: "string", description: "MUST be identical to the 'context' field (since context is already in Korean). Copy the same Korean text here." },
              context_ja: { type: "string", description: "Japanese translation of context. 2-3文で、雑誌エディターのように具体的で生き生きとしたナラティブを記述。出典・詳細・注目ポイントを含む。" },
              context_zh: { type: "string", description: "Chinese translation of context. 用2-3句话，像杂志编辑一样写出具体生动的叙事。包含来源、细节和亮点。" },
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
                    "non_kstar_subject",  // The article's main subject is NOT a K-star (Korean entertainer/celebrity). e.g., a brand, company, organization, or non-Korean entity is the subject
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
  globalStarNames?: Map<string, string>,
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const articleTexts = articles
    .slice(0, 25)
    .map((a, i) => {
      let text = `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}`;
      // 본문 발췌가 있으면 AI에 추가 제공 (주체 판별 정확도 향상)
      if ((a as any).bodyExcerpt) {
        text += `\n    [본문 발췌] ${(a as any).bodyExcerpt}`;
      }
      return text;
    })
    .join("\n");

  const categoryContext = getCategoryContext(starCategory);

  // 모든 이름 변형을 수집하여 프롬프트에 명시
  const allNames = [memberName, nameKo, groupName, groupNameKo].filter(Boolean) as string[];
  const nameListStr = allNames.map(n => `"${n}"`).join(", ");

  const systemPrompt = `You are a Korean entertainment news analyst. You read Korean news article titles and descriptions, then extract SPECIFIC NAMED ENTITIES mentioned IN THE PROVIDED TEXT.

★★★ THE MOST IMPORTANT RULE ★★★
You may ONLY extract keywords that LITERALLY APPEAR in the article titles/descriptions provided below.
- You must NOT use your own knowledge about the artist.
- If "팔레트" does not appear in any article text, you CANNOT extract "팔레트" — even if you know it's the artist's song.
- If "나의 아저씨" does not appear in any article text, you CANNOT extract it.
- ★★★ CONTEXT WRITING RULES (STRICTLY ENFORCED) ★★★
  You are a SENIOR MAGAZINE EDITOR writing trend briefings. The context MUST read like a compelling editorial note, NOT a news wire report.
  
  🚫 NEVER START WITH THE ARTICLE HEADLINE: Do NOT copy, paraphrase, or rumnble the article title/headline as the opening sentence. The context must be YOUR original editorial narrative based on the article's CONTENT, not its headline. Headlines often contain clickbait phrases like "OO 옆에서 웃었다", "[SD셀픽]", "돈 들어온다" — these must NOT appear in context.
  
  Write 3-4 FULL SENTENCES following this structure:
  1️⃣ SCENE-SETTING: Name the specific source/venue/event AND describe what happened in vivid detail (what they wore, said, did, where, when, with whom)
  2️⃣ STORY HOOK: What makes this noteworthy? Include a twist, contrast, surprise, significance, or unique angle FROM THE ARTICLE
  3️⃣ ADDITIONAL DETAIL: Add more concrete facts from the article (co-stars, outfit details, venue specifics, dates, numbers MENTIONED IN THE ARTICLE). Do NOT fabricate reactions or impacts.
  4️⃣ SIGNIFICANCE: Why does this matter for the trend landscape? Connect to broader context if the article provides it.
  
  ⚠️ ABSOLUTE PROHIBITION — NO INFERRED REACTIONS:
  You must NEVER write reactions, impacts, or consequences that are NOT explicitly stated in the article text.
  ❌ "검색 급등" / "화제" / "반응이 쏟아지고" / "매진 행렬" / "확산 중" — UNLESS the article literally says this with evidence
  ❌ "팬들 사이에서 OO이라는 반응이 나왔다" — UNLESS the article quotes actual fan reactions
  ❌ "역설적 현상이 발생" — UNLESS the article describes this phenomenon
  If the article only reports a factual event (e.g., "A wore B at C"), describe the event richly but do NOT invent public reactions or trend impacts.
  
  ❌ TERRIBLE (will be rejected — headline copy or one-line summary):
  "필릭스, 이재용 옆에서 웃었다…'이재용복, 돈 들어온다' — 그룹 스트레이키즈 필릭스가 이재용을 만났다."
  "유리가 연극 '더 와스프'에서 강렬한 연기 변신을 선보이며 관객들의 이목을 집중시키고 있다."
  WHY BAD: Copies the headline, too short, no unique details from the article body.
  
  ❌ BAD (fabricated reactions — REJECTED):
  "OO이 OO에서 뛰어난 활약을 보이며 팬들의 뜨거운 반응을 얻고 있다."
  WHY BAD: Reactions/impacts that don't exist in the article. This is FABRICATION.
  
  ✅ EXCELLENT (rich factual detail, no headline copy, no fabrication):
  "스트레이 키즈 필릭스가 3일 자신의 SNS를 통해 삼성전자 이재용 회장과 나란히 선 사진을 공개했다. 블랙 정장 차림에 밝은 금발 헤어의 필릭스가 손으로 이 회장을 가리키는 포즈를 취했으며, 이 만남은 삼성과의 글로벌 브랜드 협업 관계를 시사하는 장면으로 읽힌다. 필릭스는 이미 루이비통의 글로벌 앰배서더로도 활동 중이다."
  "에스콰이어 4월호 표지에서 윈터가 '거의 생얼'에 가까운 미니멀 메이크업으로 등장, 폴로 랄프 로렌 레드 니트 드레스와 실버 액세서리를 매치한 레트로 무드의 화보를 공개했다. 같은 호에서 단독 8페이지 분량의 인터뷰도 함께 수록되어 있다."
  WHY GOOD: Packed with specific details from the article body, no headline fragments, no fabricated reactions.
  
  REMEMBER: Extract UNIQUE DETAILS from the article BODY — brand names, product models, venue names, dates, outfit descriptions, co-stars, specific numbers. The context should contain information that ONLY someone who read THIS specific article would know. But NEVER add reactions or impacts the article doesn't mention. Write the FULL narrative — do not truncate or abbreviate. NEVER end a sentence with "..." or "…" — always complete the sentence fully. If the source text is truncated, write your own complete ending based on available facts.
  
- If no valid keywords exist in the provided articles, return an EMPTY array. This is the correct behavior.

WHAT MAKES A VALID KEYWORD:
- A specific brand, product name, show title, event name, place name, or food item
- It LITERALLY appears in the article title or description text
- The artist has a DIRECT relationship with it (endorsement, appearance, collaboration, starring role)
- ✅ Article says "카리나 프라다 앰버서더 발탁" → "프라다" VALID (appears in text, direct relationship)
- ❌ You know IU sang "Palette" but no article mentions it → "팔레트" INVALID (not in provided text)

${globalStarNames && globalStarNames.size > 0 ? `KNOWN STARS IN OUR DATABASE (★ CROSS-REFERENCE THIS LIST ★):
Below are ALL known K-stars tracked in our system. You MUST use this list to:
1. VERIFY ARTICLE SUBJECT: If the article is PRIMARILY about a person in this list who is NOT "${memberName}"${groupName ? ` or "${groupName}"` : ""}, set article_subject_match=false and add "wrong_artist" to rejection_flags. For example, if you're searching for "민니" but the article is actually about "쯔양" (who is in this list), that's a wrong_artist.
2. REJECT STAR NAMES AS KEYWORDS: If a keyword matches ANY name in this list, it's a STAR NAME, not a valid commercial keyword — DO NOT extract it.
3. DETECT CROSS-CONTAMINATION: Search results for "${memberName}" may include articles where "${memberName}" appears only in passing while the article actually focuses on a DIFFERENT star from this list.

Known K-stars: ${[...new Set(globalStarNames.values())].join(", ")}
` : ''}FORBIDDEN KEYWORDS (instant rejection):
- The artist's own name: ${nameListStr}
- Agency/label names, platform names (YouTube, Spotify, Naver, etc.)
- Chart names, generic K-pop terms (컴백, 앨범, 콘서트, 팬미팅)
- Generic locations (city names, country names)
- ⚠️ AIRPORT EXCEPTION: "인천공항", "공항패션", "airport fashion" → These are NOT generic locations. When an artist is spotted at an airport wearing notable outfits, classify as "fashion" (e.g., "인천공항룩", "공항 패션"). Only reject airports when there is NO fashion/styling context.
- 🍴 RESTAURANT/CAFE RULE: Any specific restaurant, cafe, bar, bakery, or dining establishment → classify as "restaurant" (NOT "place" or "food"). "food" is for packaged food brands/products. "place" is for non-dining venues.
- TV gimmicks, costumes, ephemeral segments
- Body measurements, weight, height, physical stats (e.g., "59kg", "170cm", "59kg 인증", "체중 공개", "몸무게") — these are personal data, NOT commercial trends
- Diet/weight-related personal topics (e.g., "다이어트 인증", "체중 감량", "살 빠진") — unless it's a SPECIFIC diet BRAND or PRODUCT name
- ⚠️ FASHION ITEM EXCEPTION: Clothing items like "비키니" (bikini), "수영복" (swimwear), "란제리" (lingerie), "크롭탑" etc. are FASHION items, NOT body/physical stats. Classify them as "fashion" and extract normally. These represent commercial fashion trends, not personal body data.
- 🚫 GENERIC COMMON NOUNS (★ MUST FLAG AS generic_word ★): Single common nouns that are NOT proper nouns/brand names MUST be rejected. Examples: "게임" (game), "영상" (video), "콘텐츠" (content), "노래" (song), "춤" (dance), "운동" (exercise), "요리" (cooking), "여행" (travel), "사진" (photo), "영화" (movie as generic). These words have no commercial trend value without a specific brand/product name attached. Only extract if it's part of a SPECIFIC proper noun (e.g., "게임" ❌ but "이터널리턴" ✅, "영화" ❌ but "범죄도시4" ✅).

🚫 CORPORATE/PHARMA NAME TRAP (★ CRITICAL — COMMON FALSE POSITIVE ★):
- When searching for an artist name (e.g., "수호", "바비", "엑소"), news results often include UNRELATED articles about companies or drugs whose names COINCIDENTALLY contain the artist's name.
- CORPORATE names ending in: 시스템즈, 테크, 바이오, 제약, 홀딩스, systems, tech, bio, pharma, holdings, inc, corp, ltd → MUST add "noise" to rejection_flags
- PHARMACEUTICAL/chemical names ending in: 스모, 맙, 닙, 졸, 렐, 틴, mab, nib, smo, zol, vir, tin, rel → MUST add "noise" to rejection_flags  
- Examples: "엑소시스템즈" is a COMPANY (not EXO), "바비스모" is a DRUG (not Bobby/바비) → reject with "noise" flag
- ASK YOURSELF: "Is this keyword a real commercial brand/product that the ARTIST is associated with, or is it a corporate/pharmaceutical entity that just happens to contain part of the artist's name?" If the latter → reject immediately.

CATEGORY CLASSIFICATION GUIDE:
- "music": Song titles, album names, mixtapes, EPs, singles, OSTs, music projects, featuring/collaboration tracks, music videos — ANY music release or music-related content
- "event": Fan meetings, concerts, tours, award shows, festivals, exhibitions, fan signs, pop-up stores, challenges, certifications (인증), viral challenges — physical/live EVENTS or fan-driven challenges/certifications
- "brand": Brand endorsements, ambassadorships, advertising campaigns, brand collaborations — must be a NAMED BRAND, not a personal activity
- "fashion": Specific fashion items, designer names, fashion shows, styling trends
- "beauty": Cosmetics, skincare, beauty brands
- "food": Restaurant names, food brands, food collaborations
- "media": Drama/movie titles, variety show names, YouTube content, documentary titles
- "social": Social media challenges, viral certifications (인증), fan-driven trends, SNS campaigns, TikTok trends — online community-driven activities that are NOT tied to a specific brand/product
- "product": Specific product names/models
- "place": Specific venue names, location-based trends
- ⚠️ IMPORTANT: Album releases, song titles, music projects, music collaborations → ALWAYS "music", NEVER "event"

MEMBER ATTRIBUTION (CRITICAL):
- When searching for a GROUP MEMBER, verify the article is SPECIFICALLY about THIS member, not the group as a whole
- If an article is about the GROUP (e.g., "스테이씨가 상하이에서 공연") but you're searching for a MEMBER (e.g., "아이사"), set article_subject_match = false and article_subject_name = the GROUP NAME
- "스테이씨 상하이 팬미팅 개최" → for member "아이사" → article_subject_name = "스테이씨", article_subject_match = false, ownership_confidence = 0.1
- "스트레이 키즈 현진이 까르띠에 행사 참석" → for "Han" → article_subject_name = "현진", article_subject_match = false, ownership_confidence = 0.0
- ONLY set article_subject_match = true if the article SPECIFICALLY names or focuses on the searched member
- Group-wide activities (tours, comebacks, group schedules) should NEVER be attributed to individual members

MULTI-ARTIST ARTICLE DETECTION (★ CRITICAL ★):
- When an article title lists MULTIPLE artist names (e.g., "제니·리사·나나, 파격 비키니"), identify who the article MAINLY focuses on by reading the FULL content — not just the first name listed.
- The main subject is the artist who the article DESCRIBES IN MOST DETAIL (actions, quotes, events, styling details).
- If the article gives roughly equal coverage to multiple artists, the main subject is the artist who appears first AND has the most descriptive content.
- If you're searching for "${memberName}" but the article's main subject is a DIFFERENT artist, set article_subject_match = false, article_subject_name = the actual main subject, and add "wrong_artist" to rejection_flags.
- Example: "제니·리사·나나, 파격적 노출 수위" — if the article body focuses on 제니's outfit and 리사/나나 are only briefly mentioned → for "리사" search → article_subject_name = "제니", article_subject_match = false, rejection_flags = ["wrong_artist"]

OWNERSHIP VERIFICATION:
- Each keyword belongs ONLY to the artist with the direct relationship
- Set ownership_confidence below 0.5 for indirect/metaphorical/passing mentions

K-STAR SUBJECT VERIFICATION (★ CRITICAL ★):
- This system tracks trends of K-STARS (Korean entertainers/celebrities: K-pop artists, actors, comedians, etc.)
- The article's MAIN SUBJECT must be a K-star. If the article's subject is a brand, company, organization, fashion label, sports team, or non-Korean entity, flag it as "non_kstar_subject"
- Example: "트리플에스" is a brand/company, NOT a K-star → flag "non_kstar_subject"
- Example: "오픈와이와이(OPEN YY)" is a fashion brand → flag "non_kstar_subject"  
- Example: "한국패션협회" is an organization → flag "non_kstar_subject"
- Even if the keyword APPEARS in the article text, if the article's main actor is NOT a K-star, it must be rejected
- Ask yourself: "Is the article's protagonist a Korean entertainer/celebrity?" If NO → flag "non_kstar_subject"

Maximum 7 keywords. Quality over quantity. Return ZERO keywords if nothing valid found.
When in doubt, DO NOT extract. False negatives are far better than false positives.`;

  const userPrompt = `Below are Korean news article titles and descriptions found by searching for "${memberName}"${groupName ? ` (member of ${groupName})` : ""}${nameKo ? ` (Korean: ${nameKo})` : ""} (${categoryContext}).

★ IMPORTANT: "${memberName}" is a ${categoryContext}. If an article is about a DIFFERENT person named "${memberName}" (e.g., a gaming YouTuber, streamer, athlete, or any non-entertainment figure), you MUST set article_subject_match=false and add "wrong_artist" to rejection_flags. Only extract keywords from articles about the ${categoryContext} "${memberName}".

★ CRITICAL REMINDER:
- ONLY extract keywords that LITERALLY APPEAR in the article texts below.
- Do NOT use your general knowledge about this artist to generate keywords.
- The context_ko field must be a RICH EDITORIAL NARRATIVE (2-3 sentences): describe the specific situation with vivid details (who, what, where, when, wearing what), then the unique angle or significance. Write like a magazine editor, NOT a news wire. Include specific names, brands, venues, dates from the article.
- If no article contains a valid extractable entity, call extract_keywords with an empty array.
- source_article_index MUST point to the exact article [number] where the keyword appears.

Articles:
${articleTexts}

Call extract_keywords with the specific named entities found IN THE ABOVE TEXT, then call analyze_trend_intent.`;

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
            const hardRejectFlags = ["wrong_member", "wrong_artist", "generic_word", "tv_gimmick", "ambiguous_name", "non_kstar_subject"];
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
              
              // 2a. 기사 주체가 그룹명인 경우 (그룹 기사가 멤버에 귀속되는 것 차단)
              // 멤버 검색 시 그룹 전체 기사에서 추출된 키워드는 멤버에 귀속시키지 않음
              if (subjectName && searchedGroup) {
                const groupNameKoLower = (groupNameKo || "").toLowerCase();
                if (subjectName === searchedGroup || (groupNameKoLower && subjectName === groupNameKoLower)) {
                  console.warn(`[trend-detect] ⛔ Group article → member rejected: "${k.keyword}" → article about group "${k.article_subject_name}", searched for member "${memberName}"`);
                  continue;
                }
              }
              
              // 2b. 기사 주체가 다른 사람이고, 그게 검색 대상도 아니고 그룹도 아닌 경우 → 차단
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

            // ── 5단계: 키워드가 아티스트 이름 자체인 경우 차단 (exact match) ──
            const kwLower = (k.keyword || "").toLowerCase().trim();
            const kwKoLower = (k.keyword_ko || "").toLowerCase().trim();
            const kwEnLower = (k.keyword_en || "").toLowerCase().trim();
            const allArtistNames = [
              memberName, nameKo, groupName, groupNameKo,
            ].filter(Boolean).map((n: string) => n.toLowerCase().trim());
            // Also check without spaces (e.g., "G DRAGON" vs "G-DRAGON")
            const normalizeForCompare = (s: string) => s.replace(/[-\s·.]/g, "").toLowerCase();
            const normalizedKw = normalizeForCompare(k.keyword || "");
            const normalizedKwKo = normalizeForCompare(k.keyword_ko || "");
            const normalizedKwEn = normalizeForCompare(k.keyword_en || "");
            const isArtistNameKeyword = allArtistNames.some(name => {
              const normalized = normalizeForCompare(name);
              return kwLower === name || kwKoLower === name || kwEnLower === name
                || normalizedKw === normalized || normalizedKwKo === normalized || normalizedKwEn === normalized;
            });
            if (isArtistNameKeyword) {
              console.warn(`[trend-detect] ⛔ Artist name as keyword rejected: "${k.keyword}" (ko: ${k.keyword_ko}, en: ${k.keyword_en}) matches artist name [${allArtistNames.join(", ")}]`);
              continue;
            }

            // ── 6단계: 소스 기사에 아티스트 이름이 실제 포함되는지 코드 레벨 검증 ──
            // AI가 article_subject_match=true로 판정해도 기사 제목/설명에 이름이 없으면 차단
            if (typeof k.source_article_index === "number" && k.source_article_index > 0) {
              const srcArticle = articles[k.source_article_index - 1];
              if (srcArticle) {
                const artText = `${srcArticle.title} ${srcArticle.description || ""}`.toLowerCase();
                // 아티스트의 모든 이름 변형 중 하나라도 기사 텍스트에 포함되어야 함
                const nameVariantsForCheck = [memberName, nameKo, groupName, groupNameKo]
                  .filter(Boolean)
                  .map((n: string) => n.toLowerCase().trim());
                const articleMentionsArtist = nameVariantsForCheck.some(n => {
                  if (n.length < 2) return false;
                  return artText.includes(n) || artText.includes(n.replace(/[\s\-]/g, ""));
                });
                if (!articleMentionsArtist) {
                  console.warn(`[trend-detect] ⛔ Source article does NOT mention artist: "${k.keyword}" from article[${k.source_article_index}] "${srcArticle.title?.slice(0, 60)}" — searched for [${nameVariantsForCheck.join(", ")}]`);
                  continue;
                }
              }
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

      // 소속사/기획사 이름 차단 (부분 일치)
      if (isAgencyKeyword(kwLower) || isAgencyKeyword(kwKo) || isAgencyKeyword(kwEn)) {
        console.warn(`[trend-detect] Blocked agency keyword: "${k.keyword}"`);
        return false;
      }

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

      // 글로벌 스타 이름과 일치하는 키워드 차단 (다른 아티스트 이름이 키워드로 추출되는 것 방지)
      if (globalStarNames) {
        const matchedStar = globalStarNames.get(kwLower) || globalStarNames.get(kwKo) || globalStarNames.get(kwEn)
          || globalStarNames.get(normalizeForCompare(k.keyword || "")) || globalStarNames.get(normalizeForCompare(k.keyword_ko || ""));
        if (matchedStar && !allNameVariants.has(kwLower)) {
          console.warn(`[trend-detect] Blocked other star name as keyword: "${k.keyword}" (matches star: ${matchedStar})`);
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
        // 일반 명사 (고유명사 아닌 단독 사용 시 트렌드 가치 없음)
        "게임", "game", "영상", "video", "콘텐츠", "content", "노래", "song",
        "춤", "dance", "운동", "exercise", "요리", "cooking", "여행", "travel",
        "사진", "photo", "영화", "movie", "드라마", "drama", "방송", "broadcast",
        "음악", "music", "공연", "performance", "무대", "stage",
        "채널", "channel", "라이브", "live", "스트리밍", "streaming",
        // 반복 오수집 브랜드/플랫폼
        "오픈와이와이", "open yy", "openyy",
        "트리플엑스", "triple x", "triplex",
        "엑소시스템즈", "exo systems", "exosystems",
      ]);
      // 숫자+단위 패턴 필터 (59kg, 180cm, "59kg 인증" 등 숫자+단위가 포함된 키워드)
      const MEASUREMENT_PATTERN = /\b\d+(\.\d+)?\s*(kg|cm|mm|ml|l|g|oz|lb|lbs|m|km|cc|inch|인치|센치|킬로|그램|미리)s?\b/i;
      if (MEASUREMENT_PATTERN.test(kwLower) || MEASUREMENT_PATTERN.test(kwKo)) {
        console.warn(`[trend-detect] Blocked measurement keyword: "${k.keyword}"`);
        return false;
      }
      // 체중/신체 수치 키워드 차단 (단, 인증/챌린지는 허용)
      const BODY_STAT_PATTERN = /^(?:체중|몸무게|키\s?\d|체지방|bmi|body\s?weight)$/i;
      if (BODY_STAT_PATTERN.test(kwKo) || BODY_STAT_PATTERN.test(kwLower)) {
        console.warn(`[trend-detect] Blocked body stat keyword: "${k.keyword}"`);
        return false;
      }
      if (NOISE_BLACKLIST.has(kwLower) || NOISE_BLACKLIST.has(kwKo)) {
        console.warn(`[trend-detect] Blocked noise keyword: "${k.keyword}"`);
        return false;
      }

      // ── 기업명 패턴 차단: 아티스트/그룹명 + 기업 접미사 조합 (엑소시스템즈, 빅히트테크 등) ──
      const CORP_SUFFIXES = [
        "시스템즈", "시스템", "테크", "테크놀로지", "바이오", "제약", "홀딩스",
        "그룹", "코퍼레이션", "인터내셔널", "글로벌", "캐피탈", "파이낸스",
        "로지스틱스", "솔루션", "솔루션즈", "엔지니어링", "건설", "산업",
        "systems", "tech", "technology", "bio", "pharma", "holdings",
        "corp", "corporation", "international", "global", "capital",
        "logistics", "solutions", "engineering", "industries",
      ];
      const corpCheck = (kw: string) => {
        const lower = kw.toLowerCase();
        return CORP_SUFFIXES.some(suffix => lower.endsWith(suffix) && lower.length > suffix.length + 1);
      };
      if (corpCheck(kwLower) || corpCheck(kwKo)) {
        console.warn(`[trend-detect] Blocked corporate name keyword: "${k.keyword}" (ko: "${k.keyword_ko}")`);
        return false;
      }

      if (k.ownership_confidence !== undefined && k.ownership_confidence < 0.5) {
        console.warn(`[trend-detect] Blocked low-ownership keyword: "${k.keyword}" (ownership=${k.ownership_confidence}, reason=${k.ownership_reason})`);
        return false;
      }

      // ★ confidence와 무관하게 항상 텍스트 존재 검증 수행 (AI 환각 방지)

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
      context: `네이버 쇼핑에서 ${memberName} 관련 상품 ${info.count}건 발견`,
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

// ─── TikTok 소셜 키워드 추출 (AI 분류) ───
async function extractSocialKeywordsFromTikTok(
  openaiKey: string,
  sb: any,
  starId: string | null,
  memberName: string,
  groupName: string | null,
  allMemberNames?: string[], // 그룹의 모든 멤버명 (필터 강화용)
): Promise<ExtractedKeyword[]> {
  if (!starId) return [];

  // 최근 24시간 내 TikTok 스냅샷 조회
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots } = await sb
    .from("ktrenz_social_snapshots")
    .select("top_posts, metrics")
    .eq("star_id", starId)
    .eq("platform", "tiktok")
    .gte("collected_at", cutoff)
    .order("collected_at", { ascending: false })
    .limit(1);

  if (!snapshots?.length) return [];

  const topPosts = (snapshots[0].top_posts || []) as any[];
  if (!topPosts.length) return [];

  // TikTok 영상 설명을 기사-like 포맷으로 변환
  const tiktokArticles = topPosts
    .filter((p: any) => p.desc && p.desc.trim().length > 5)
    .map((p: any, i: number) => ({
      title: `[TikTok] ${p.desc.slice(0, 200)}`,
      description: `Views: ${(p.views || 0).toLocaleString()}, Likes: ${(p.likes || 0).toLocaleString()}, Author: @${p.author || "unknown"}${p.verified ? " ✓" : ""}`,
      url: `https://www.tiktok.com/@${p.author}/video/${p.id}`,
      cover: p.cover || null,
    }));

  if (!tiktokArticles.length) return [];

  const articleTexts = tiktokArticles
    .map((a: any, i: number) => `[${i + 1}] ${a.title} - ${a.description}`)
    .join("\n");

  // 아티스트/멤버/팬덤명 변형 목록 생성 (부분일치 필터용)
  const artistAliases = new Set<string>();
  const addAlias = (n: string | null | undefined) => {
    if (!n) return;
    const lower = n.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    if (lower.length >= 2) artistAliases.add(lower);
  };
  addAlias(memberName);
  addAlias(groupName);
  // 그룹의 모든 멤버명도 필터에 추가 (그룹 레벨 처리 시 멤버명 누락 방지)
  if (allMemberNames) {
    for (const mn of allMemberNames) addAlias(mn);
  }
  // 흔한 팬덤명 패턴: 멤버명+fyp, 멤버명+edit, 그룹명+fan 등
  const FANDOM_SUFFIXES = ["fyp", "edit", "edits", "fan", "fans", "stan", "stans", "lover", "lovers", "bestleader", "best", "era", "challenge"];
  const allNames = [memberName, groupName, ...(allMemberNames || [])].filter(Boolean);
  const baseNames = allNames.map(n => n!.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const base of baseNames) {
    if (base.length < 2) continue;
    artistAliases.add(base);
    for (const suffix of FANDOM_SUFFIXES) {
      artistAliases.add(base + suffix);
    }
  }
  // 알려진 팬덤명 매핑
  const KNOWN_FANDOMS: Record<string, string[]> = {
    "aespa": ["my", "mys"],
    "ateez": ["atiny"],
    "bts": ["army"],
    "blackpink": ["blink"],
    "twice": ["once"],
    "stray kids": ["stay"],
    "seventeen": ["carat"],
    "nct": ["nctzen"],
    "enhypen": ["engene"],
    "txt": ["moa"],
    "itzy": ["midzy"],
    "ive": ["dive"],
    "le sserafim": ["fearnot"],
    "newjeans": ["bunnies"],
    "stayc": ["swith"],
    "ab6ix": ["abnew"],
    "the boyz": ["deobi"],
    "treasure": ["teume"],
    "nmixx": ["nswer"],
    "riize": ["briize"],
    "(g)i-dle": ["neverland"],
    "gidle": ["neverland"],
  };
  for (const base of baseNames) {
    const fandoms = KNOWN_FANDOMS[base] || [];
    for (const f of fandoms) artistAliases.add(f);
  }

  const memberNamesStr = allMemberNames?.length ? `, members: ${allMemberNames.join(", ")}` : "";
  const systemPrompt = `You are a K-Pop social media trend analyst specializing in TikTok viral content.
Analyze the TikTok video descriptions below to extract SOCIAL TREND keywords related to the artist "${memberName}".

WHAT TO EXTRACT (specific, actionable trends only — must have a PROPER NAME):
- Named viral challenges with specific titles (e.g., "Supernova Challenge", "BOTTOMS UP Challenge")
- Specific choreography trends with song/move names (e.g., "LOOK AT ME performance", "Magnetic dance break")
- Collaboration content with OTHER artist/brand names (e.g., "Puma x ATEEZ collab")
- Named fan events or campaigns with specific titles

STRICT REJECTION RULES — DO NOT EXTRACT ANY OF THESE:
- Artist names, member names, or ANY variation: ${memberName}${groupName ? `, ${groupName}` : ""}${memberNamesStr}
- Fandom names (ARMY, BLINK, ATINY, MY, STAY, CARAT, MOA, ENGENE, etc.)
- Member name + ANY suffix (e.g., "Wooyoung edits", "Hongjoong best leader")
- Author-credit or attribution phrases (e.g., "by Minji", "by민지", "호시 by", "민니, 호시", "민지 ver")
- Generic descriptions of content (e.g., "facial expressions", "crowd reaction", "concert moments", "fan edits", "stage presence", "SNS", "daily life")
- Generic hashtags (#fyp, #kpop, #foryou, #viral, #dance, #trending)
- Platform names (TikTok, YouTube, Instagram)
- Non-K-pop content (gaming references like "dandysworld", "bailey", etc.)
- Award show abbreviations without specific context (e.g., "kgma" alone)

KEY RULE: The keyword must be a SPECIFIC PROPER NOUN or NAMED TREND, not a generic description of what's happening in the video.

Set category to "social" for ALL extracted keywords.
Maximum 2 keywords. EXTREME QUALITY BAR. Return EMPTY array for 90%+ of inputs — only extract genuinely viral, named trends.`;

  const userPrompt = `TikTok videos related to "${memberName}"${groupName ? ` (${groupName})` : ""}:

${articleTexts}

Extract ONLY specific viral/trending social keywords. Reject artist names, fandom names, and generic tags. Call extract_keywords.`;

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
        tools: [TOOL_EXTRACT_KEYWORDS],
        tool_choice: { type: "function", function: { name: "extract_keywords" } },
        temperature: 0.05,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      console.warn(`[trend-detect] TikTok AI error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    const results: ExtractedKeyword[] = [];

    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments);
        const rawKws = args.keywords || [];
        for (const k of rawKws) {
          // 강화된 아티스트/팬덤명 필터
          if (!k.keyword || k.keyword.length < 2) continue;
          const kwLower = k.keyword.toLowerCase().replace(/^#/, "");
          const kwNorm = kwLower.replace(/[^a-z0-9가-힣]/g, "");
          const kwCompact = kwLower.replace(/[\s·,_\-]+/g, "");
          if (PLATFORM_BLACKLIST.has(kwLower)) continue;

          // TikTok 편집자/작성자 표기, 멤버 이름 나열형 차단
          const looksLikeAttribution = /(^|\s)by\s*[a-z0-9가-힣]+$/i.test(kwLower)
            || /^by[a-z0-9가-힣]+$/i.test(kwCompact)
            || /^[a-z0-9가-힣]+\s*by$/i.test(kwLower)
            || /\bver\b/i.test(kwLower)
            || /(?:^|\s)(?:직캠|캠|focus|fancam|edit|edits|version|ver)(?:$|\s)/i.test(kwLower);
          if (looksLikeAttribution) {
            console.log(`[trend-detect] TikTok filter: rejected "${k.keyword}" (attribution/edit pattern)`);
            continue;
          }

          // 정확 일치 또는 부분 일치 필터: 키워드가 아티스트/팬덤명이거나 포함하면 차단
          let isArtistRelated = false;
          for (const alias of artistAliases) {
            const aliasCompact = alias.replace(/[\s·,_\-]+/g, "");
            if (
              kwNorm === alias
              || kwNorm.includes(alias)
              || alias.includes(kwNorm)
              || kwCompact === `by${aliasCompact}`
              || kwCompact.startsWith(`by${aliasCompact}`)
              || kwCompact.endsWith(`by${aliasCompact}`)
            ) {
              isArtistRelated = true;
              break;
            }
          }
          if (isArtistRelated) {
            console.log(`[trend-detect] TikTok filter: rejected "${k.keyword}" (artist/fandom match)`);
            continue;
          }

          const aliasMentionCount = Array.from(artistAliases).reduce((count, alias) => {
            if (!alias || alias.length < 2) return count;
            return kwNorm.includes(alias) ? count + 1 : count;
          }, 0);
          if (aliasMentionCount >= 2) {
            console.log(`[trend-detect] TikTok filter: rejected "${k.keyword}" (multiple artist/member aliases)`);
            continue;
          }

          // 제네릭 해시태그 필터 (확장)
          const genericTags = new Set([
            "fyp", "foryou", "kpop", "viral", "dance", "music", "cover", "reaction",
            "fancam", "edit", "edits", "trend", "trending", "stan", "bias", "idol", "concert",
            "performance", "live", "shorts", "reels", "xyzbca", "fypシ", "parati",
            "korean", "korea", "seoul", "hallyu", "kdrama", "oppa",
            "facialexpressions", "facial", "expressions", "crowdreaction", "crowd",
            "sns", "selca", "selfie", "cute", "funny", "aesthetic", "vlog",
            "dailylife", "daily", "fanedit", "fanmade", "compilation",
            "bestmoments", "moments", "highlights", "stage", "airport",
            "dandysworld", "dandy", "bailey", "by",
          ]);
          if (genericTags.has(kwNorm)) continue;

          results.push({
            keyword: k.keyword,
            keyword_en: k.keyword_en || k.keyword,
            keyword_ko: k.keyword_ko || null,
            keyword_ja: k.keyword_ja || null,
            keyword_zh: k.keyword_zh || null,
            category: "social",
            confidence: k.confidence || 0.7,
            context: k.context_ko || k.context || `${memberName} 관련 TikTok 트렌드`,
            context_ko: k.context_ko || k.context || `${memberName} 관련 TikTok 트렌드`,
            context_ja: k.context_ja || null,
            context_zh: k.context_zh || null,
            source_article_index: k.source_article_index,
            commercial_intent: k.commercial_intent || "organic",
            brand_intent: k.brand_intent || "awareness",
            fan_sentiment: k.fan_sentiment || "positive",
            trend_potential: k.trend_potential || 0.6,
            purchase_stage: k.purchase_stage || "awareness",
            _tiktok_cover_url: (() => {
              const idx = k.source_article_index ? k.source_article_index - 1 : 0;
              return (idx >= 0 && idx < tiktokArticles.length) ? tiktokArticles[idx].cover : (tiktokArticles[0]?.cover || null);
            })(),
            _tiktok_source_url: (() => {
              const idx = k.source_article_index ? k.source_article_index - 1 : 0;
              return (idx >= 0 && idx < tiktokArticles.length) ? tiktokArticles[idx].url : (tiktokArticles[0]?.url || null);
            })(),
          });
        }
      } catch (parseErr) {
        console.warn(`[trend-detect] TikTok tool parse error: ${(parseErr as Error).message}`);
      }
    }

    console.log(`[trend-detect] TikTok social: ${results.length} keywords for ${memberName}`);
    return results;
  } catch (e) {
    console.warn(`[trend-detect] TikTok extraction error: ${(e as Error).message}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const COLLECTION_PAUSED = false;

  try {
    const body = await req.json().catch(() => ({}));
    const { starId, memberName, groupName, wikiEntryId, artistName, batchSize = 5, batchOffset = 0 } = body;
    // star_id 단독 파라미터 지원 (body.star_id도 허용)
    const resolvedStarId = starId || body.star_id || null;

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

    // ─── YouTube API 키 로테이션 (7개 키) ───
    const YT_KEYS: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const k = Deno.env.get(`YOUTUBE_API_KEY_${i}`);
      if (k) YT_KEYS.push(k);
    }
    if (YT_KEYS.length === 0) {
      const legacy = Deno.env.get("YOUTUBE_API_KEY");
      if (legacy) YT_KEYS.push(legacy);
    }
    let ytKeyOffset = 0;
    const ytExhaustedKeys = new Set<number>();
    function getNextYtKey(): string | null {
      if (YT_KEYS.length === 0 || ytExhaustedKeys.size >= YT_KEYS.length) return null;
      for (let attempt = 0; attempt < YT_KEYS.length; attempt++) {
        const idx = ytKeyOffset % YT_KEYS.length;
        ytKeyOffset++;
        if (!ytExhaustedKeys.has(idx)) return YT_KEYS[idx];
      }
      return null;
    }
    function markYtKeyExhausted(key: string) {
      const idx = YT_KEYS.indexOf(key);
      if (idx >= 0) ytExhaustedKeys.add(idx);
    }
    console.log(`[trend-detect] APIs: naver=${naverClientId ? '✓' : '✗'} youtube=${YT_KEYS.length} keys openai=${openaiKey ? '✓' : '✗'}`);

    // 글로벌 스타 이름 DB 로드 (AI 프롬프트 컨텍스트 + 코드 레벨 필터용 — 모든 모드 공통)
    const { data: _allStarNamesData } = await sb
      .from("ktrenz_stars")
      .select("display_name, name_ko")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"]);
    const globalStarNames = new Map<string, string>();
    for (const _s of (_allStarNamesData || [])) {
      if (_s.display_name) {
        globalStarNames.set(_s.display_name.toLowerCase(), _s.display_name);
        globalStarNames.set(normalizeForCompare(_s.display_name), _s.display_name);
      }
      if (_s.name_ko) {
        globalStarNames.set(_s.name_ko.toLowerCase(), _s.display_name);
        globalStarNames.set(normalizeForCompare(_s.name_ko), _s.display_name);
      }
    }
    console.log(`[trend-detect] Loaded ${globalStarNames.size} global star name variants for cross-reference`);

    // 단일 스타 모드: star_id만으로도 DB에서 조회하여 실행
    if (resolvedStarId) {
      let singleMemberName = memberName;
      let singleGroupName = groupName || null;
      let singleGroupNameKo: string | null = null;
      let singleNameKo: string | null = null;
      let singleStarCategory = body.starCategory || "kpop";

      // memberName이 없으면 DB에서 조회
      if (!singleMemberName) {
        const { data: starData } = await sb
          .from("ktrenz_stars")
          .select("display_name, name_ko, group_star_id, star_category")
          .eq("id", resolvedStarId)
          .single();
        if (starData) {
          singleMemberName = starData.display_name;
          singleNameKo = starData.name_ko;
          singleStarCategory = starData.star_category || "kpop";
          if (starData.group_star_id) {
            const { data: groupData } = await sb
              .from("ktrenz_stars")
              .select("display_name, name_ko")
              .eq("id", starData.group_star_id)
              .single();
            if (groupData) {
              singleGroupName = groupData.display_name;
              singleGroupNameKo = groupData.name_ko;
            }
          }
        }
      }

      if (singleMemberName) {
        const ytSearchFn = YT_KEYS.length > 0
          ? (q: string, max: number) => searchYouTubeWithRotation(getNextYtKey, markYtKeyExhausted, q, max)
          : undefined;
        const result = await detectForMember(
          sb, openaiKey, naverClientId, naverClientSecret,
          { id: resolvedStarId, display_name: singleMemberName, name_ko: singleNameKo, group_name: singleGroupName, group_name_ko: singleGroupNameKo, star_category: singleStarCategory },
          globalStarNames, undefined, ytSearchFn
        );
        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 레거시 호환 (wikiEntryId) 경로 제거 — star_id만 지원

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
    let groupMap: Record<string, { display_name: string; name_ko: string | null }> = {};
    if (groupIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko")
        .in("id", groupIds);
      for (const g of (groups || [])) {
        groupMap[g.id] = { display_name: g.display_name, name_ko: g.name_ko };
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
    let totalYouTube = 0;
    let totalInserted = 0;
    let totalBackfilled = 0;
    let totalFiltered = 0;
    // 같은 run 내 크로스 아티스트 중복 키워드 방지용 공유 Set
    const runInsertedKeywords = new Set<string>();
    const artistResults: Array<{
      name: string;
      type: string;
      news: number;
      blog: number;
      shop: number;
      youtube: number;
      aiExtracted: number;
      shopExtracted: number;
      inserted: number;
      backfilled: number;
      filtered: number;
    }> = [];

    const TIMEGUARD_MS = 80000; // 80초 — 마지막 아티스트(최대 45s) + 여유분으로 wall time(~150s) 이내 보장
    const PER_STAR_TIMEOUT_MS = 45000; // 개별 아티스트 처리 최대 45초
    const batchStartTime = Date.now();

    for (const star of batch) {
      if (Date.now() - batchStartTime > TIMEGUARD_MS) {
        console.warn(`[trend-detect] ⏱ Timeguard: ${Math.round((Date.now() - batchStartTime) / 1000)}s elapsed, skipping remaining ${batch.length - artistResults.length} stars`);
        break;
      }
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
          star_category: star.star_category || "kpop",
        };

        // 같은 그룹 다른 멤버 이름 목록 (sibling filter용)
        let siblingNames: string[] | undefined;
        if (star.star_type === "member" && star.group_star_id) {
          siblingNames = allCandidates
            .filter((s: any) => s.group_star_id === star.group_star_id && s.id !== star.id)
            .flatMap((s: any) => [s.display_name, s.name_ko].filter(Boolean));
        }

        const ytSearchFn = YT_KEYS.length > 0
          ? (q: string, max: number) => searchYouTubeWithRotation(getNextYtKey, markYtKeyExhausted, q, max)
          : undefined;
        // 개별 아티스트 타임아웃: wall-time 초과 방지
        const starStart = Date.now();
        const result = await Promise.race([
          detectForMember(
            sb, openaiKey, naverClientId, naverClientSecret, memberInfo, globalStarNames, runInsertedKeywords, ytSearchFn, siblingNames
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`STAR_TIMEOUT: ${star.display_name} exceeded ${PER_STAR_TIMEOUT_MS / 1000}s`)), PER_STAR_TIMEOUT_MS)
          ),
        ]);
        console.log(`[trend-detect] ✓ ${star.display_name}: ${result.keywordsFound} keywords (${Math.round((Date.now() - starStart) / 1000)}s)`);
        successCount++;
        totalKeywords += result.keywordsFound;
        totalNews += result.sourceStats.news;
        totalBlogs += result.sourceStats.blog;
        totalShop += result.sourceStats.shop;
        totalYouTube += result.sourceStats.youtube || 0;
        totalInserted += result.insertStats.inserted;
        totalBackfilled += result.insertStats.backfilled;
        totalFiltered += result.insertStats.filtered;

        artistResults.push({
          name: star.display_name,
          type: star.star_type,
          news: result.sourceStats.news,
          blog: result.sourceStats.blog,
          shop: result.sourceStats.shop,
          youtube: result.sourceStats.youtube || 0,
          tiktok: result.sourceStats.tiktok || 0,
          aiExtracted: result.sourceStats.aiExtracted,
          shopExtracted: result.sourceStats.shopExtracted,
          socialExtracted: result.sourceStats.socialExtracted || 0,
          inserted: result.insertStats.inserted,
          backfilled: result.insertStats.backfilled,
          filtered: result.insertStats.filtered,
        });

        // ─── DB에 스타별 처리 결과 기록 (추적 제거됨 — track phase에서 별도 처리) ───
        const detectResult = {
          news: result.sourceStats.news,
          blog: result.sourceStats.blog,
          shop: result.sourceStats.shop,
          youtube: result.sourceStats.youtube || 0,
          keywords: result.keywordsFound,
          inserted: result.insertStats.inserted,
          status: result.keywordsFound > 0 ? "found" : (result.sourceStats.news === 0 && result.sourceStats.blog === 0 && (result.sourceStats.youtube || 0) === 0 ? "no_sources" : "no_keywords"),
        };
        await sb.from("ktrenz_stars").update({
          last_detected_at: new Date().toISOString(),
          last_detect_result: detectResult,
          media_exposure: result.totalArticleCount ?? 0,
        }).eq("id", star.id);

        await new Promise((r) => setTimeout(r, 300));
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
        try {
          await sb.from("ktrenz_stars").update({
            last_detected_at: new Date().toISOString(),
            last_detect_result: { status: "error", error: (e as Error).message },
          }).eq("id", star.id);
        } catch (_) { /* ignore */ }
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
  star_category: string;
}

async function detectForMember(
  sb: any,
  openaiKey: string,
  naverClientId: string,
  naverClientSecret: string,
  member: MemberInfo,
  globalStarNames?: Map<string, string>,
  runInsertedKeywords?: Set<string>,
  ytSearch?: (query: string, max: number) => Promise<YouTubeDetectResult>,
  siblingNames?: string[],
): Promise<{
  keywordsFound: number;
  articlesFound: number;
  totalArticleCount: number;
  keywords: ExtractedKeyword[];
  sourceStats: { news: number; blog: number; shop: number; youtube: number; aiExtracted: number; shopExtracted: number };
  insertStats: { inserted: number; backfilled: number; filtered: number };
}> {
  // 검색어 결정: 한글명 우선, 없으면 영문명
  // 그룹 멤버인 경우 "그룹명 멤버명" 형태로 검색하여 동명이인 방지 (예: "스트레이 키즈 필릭스")
  const searchName = member.name_ko || member.display_name;
  const groupLabel = member.group_name_ko || member.group_name;
  const searchQuery = groupLabel
    ? `"${searchName}" "${groupLabel}"`
    : `"${searchName}"`;

  // ─── 3소스 병렬 검색: News + Blog + YouTube (키 로테이션 포함) ───
  const ytSearchQuery = groupLabel ? `${searchName} ${groupLabel}` : (member.name_ko || member.display_name); // YouTube는 그룹 컨텍스트를 포함해 동명이인 오수집 방지
  const [newsResult, blogResult, ytResult] = await Promise.all([
    searchNaver(naverClientId, naverClientSecret, "news", searchQuery, 30),
    searchNaver(naverClientId, naverClientSecret, "blog", searchQuery, 20),
    ytSearch ? ytSearch(ytSearchQuery, 15) : Promise.resolve({ items: [], totalResults: 0 } as YouTubeDetectResult),
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

  // ── 같은 그룹 다른 멤버 제목 필터 (Same-Group Sibling Filter) ──
  // 기사 제목에 같은 그룹의 다른 멤버명이 있고 검색 대상 멤버명은 없는 기사 제거
  const memberNameLower = searchName.toLowerCase();
  const memberNameVariants = [memberNameLower];
  if (member.display_name && member.display_name.toLowerCase() !== memberNameLower) {
    memberNameVariants.push(member.display_name.toLowerCase());
  }
  const siblingNamesLower = (siblingNames || [])
    .map(n => n.toLowerCase().trim())
    .filter(n => n.length >= 2 && !memberNameVariants.includes(n));

  function filterSiblingArticles<T extends { title: string }>(items: T[]): T[] {
    if (!siblingNamesLower.length) return items;
    return items.filter(item => {
      const titleLower = stripHtml(item.title).toLowerCase();
      // 제목에 검색 대상 멤버명이 있으면 통과
      if (memberNameVariants.some(n => titleLower.includes(n))) return true;
      // 제목에 같은 그룹 다른 멤버명이 있으면 차단
      const hasSibling = siblingNamesLower.some(n => titleLower.includes(n));
      if (hasSibling) {
        console.warn(`[trend-detect] ⛔ Sibling filter: "${item.title.slice(0, 80)}" — contains sibling name but NOT "${searchName}"`);
        return false;
      }
      return true;
    });
  }

  const sibFilteredNews = filterSiblingArticles(filteredNews);
  const sibFilteredBlogs = filterSiblingArticles(filteredBlogs);
  const sibFilterCount = (filteredNews.length - sibFilteredNews.length) + (filteredBlogs.length - sibFilteredBlogs.length);
  if (sibFilterCount > 0) {
    console.log(`[trend-detect] ${member.display_name}: Sibling filter removed ${sibFilterCount} articles`);
  }

  const ytGroupVariants = groupLabel
    ? [...new Set([groupLabel, member.group_name, member.group_name_ko].filter((name): name is string => !!name).map((name) => name.toLowerCase()))]
    : [];

  // YouTube 영상: 7일 이내 + 일본어 필터링 + 멤버 검색 시 그룹 컨텍스트 필수
  // 아티스트명 변형도 준비 (짧은 이름의 경우 제목에 아티스트명 존재 필수)
  const artistNameVariants = [...new Set([searchName, member.display_name, member.name_ko].filter((n): n is string => !!n).map(n => n.toLowerCase()))];
  const isShortName = searchName.length <= 3; // BX, RM, V 등 짧은 이름

  const filteredYT = ytResult.items.filter(item => {
    if (isJapanese(item.title) || isJapanese(item.description)) return false;

    // 짧은 아티스트명: 영상 제목에 아티스트명이 독립 토큰으로 존재해야 함
    if (isShortName) {
      const titleLower = item.title.toLowerCase();
      const hasArtistInTitle = artistNameVariants.some(name => {
        // 단어 경계 체크: 앞뒤에 알파벳/숫자가 아닌 문자 또는 문자열 시작/끝
        const regex = new RegExp(`(?:^|[^a-z0-9가-힣])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9가-힣]|$)`, 'i');
        return regex.test(titleLower);
      });
      if (!hasArtistInTitle) return false;
    }

    if (ytGroupVariants.length > 0) {
      // 그룹 컨텍스트는 제목(title)에서만 확인 — 설명문(description)은 노이즈가 많아 제외
      const titleLowerForGroup = item.title.toLowerCase();
      const compactTitle = titleLowerForGroup.replace(/[\s\-_]+/g, "");
      const hasGroupContext = ytGroupVariants.some((variant) => {
        const compactVariant = variant.replace(/[\s\-_]+/g, "");
        // 짧은 그룹명(≤3자)은 단어 경계 매칭 필수 (XG, BTS 등의 부분 매칭 방지)
        if (variant.length <= 3) {
          const regex = new RegExp(`(?:^|[^a-z0-9가-힣])${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9가-힣]|$)`, 'i');
          return regex.test(titleLowerForGroup);
        }
        return titleLowerForGroup.includes(variant) || (compactVariant.length >= 2 && compactTitle.includes(compactVariant));
      });
      if (!hasGroupContext) return false;
    }
    return true;
  });
  const sibFilteredYT = filterSiblingArticles(filteredYT);

  // News + Blog + YouTube → AI 분석용 기사 목록으로 통합
  // ── 메이저 매체 위주로 AI 분석 대상 구성 + 전체 기사 수는 점수용으로 별도 보존 ──
  const totalArticleCount = newsResult.total + blogResult.total; // 네이버 API 반환 전체 검색 결과 수
  const totalYoutubeCount = ytResult.totalResults;

  // 뉴스: 메이저 매체 우선, 나머지는 메이저가 부족할 때만 보충
  const majorNews = sibFilteredNews.filter((item: any) => isMajorOutlet(item.originallink || item.link));
  const minorNews = sibFilteredNews.filter((item: any) => !isMajorOutlet(item.originallink || item.link));
  const selectedNews = majorNews.length >= 10 ? majorNews.slice(0, 15) : [...majorNews, ...minorNews.slice(0, 10 - majorNews.length)];

  const rawArticles: Array<{ title: string; description: string; url: string; imageUrl?: string | null; bodyExcerpt?: string; isMajor?: boolean }> = [
    ...selectedNews.map((item: any) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description),
      url: item.originallink || item.link,
      isMajor: true,
    })),
    ...sibFilteredBlogs.slice(0, 10).map((item: any) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description || ""),
      url: item.link,
      isMajor: false,
    })),
    ...sibFilteredYT.map((item) => ({
      title: `[YouTube] ${item.title}`,
      description: item.description,
      url: item.url,
      imageUrl: item.thumbnailUrl || null,
      isMajor: false,
    })),
  ];

  // ── 제목 유사도 기반 중복 제거: 메이저 매체 우선 유지 ──
  const articles = deduplicateArticles(rawArticles);

  // ── 기사 본문 일부 fetch (상위 5개, 주체 판별 정확도 향상) ──
  const BODY_FETCH_COUNT = 5;
  const bodyFetchTargets = articles.slice(0, BODY_FETCH_COUNT).filter(a => a.url && !a.title.startsWith("[YouTube]"));
  if (bodyFetchTargets.length > 0) {
    await Promise.allSettled(bodyFetchTargets.map(async (article) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(article.url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          redirect: "follow",
        });
        clearTimeout(timeout);
        if (!res.ok) return;
        const reader = res.body?.getReader();
        if (!reader) return;
        let html = "";
        const decoder = new TextDecoder();
        while (html.length < 100_000) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
        }
        reader.cancel();
        // 본문 추출: articleBody/CLtag 등 컨테이너 내부 텍스트
        const bodyPatterns = [
          /itemprop=["']articleBody["']/i,
          /id=["'](?:CLtag|articleBody|article[_-]?body|news[_-]?body|content[_-]?body)["']/i,
          /class=["'][^"']*(?:article[_-]?body|news[_-]?body|artclBody|newsct_article)["']/i,
        ];
        let bodyStart = -1;
        for (const p of bodyPatterns) {
          const m = html.match(p);
          if (m?.index != null) { bodyStart = m.index; break; }
        }
        const bodyHtml = bodyStart >= 0 ? html.slice(bodyStart, bodyStart + 5000) : html.slice(0, 5000);
        const bodyText = bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        article.bodyExcerpt = bodyText.slice(0, 800);
      } catch { /* timeout or fetch error — skip */ }
    }));
  }

  // Shopping → 상품명에서 직접 브랜드/상품 키워드 추출
  const shopKeywords = extractShopKeywords(shopItems, member.display_name, member.group_name);
  console.log(`[trend-detect] ${member.display_name}: news=${selectedNews.length}/${filteredNews.length}(total=${newsResult.total}) blog=${sibFilteredBlogs.length}(total=${blogResult.total}) youtube=${filteredYT.length}(total=${ytResult.totalResults}) articles(deduped)=${articles.length} shop=${shopItems.length} shopKW=${shopKeywords.length}`);

  const srcStats = { news: filteredNews.length, blog: filteredBlogs.length, shop: shopItems.length, youtube: filteredYT.length, tiktok: 0, aiExtracted: 0, shopExtracted: shopKeywords.length, socialExtracted: 0 };

  // ─── TikTok 소셜 키워드 추출 (AI 분류) ───
  let socialKeywords: ExtractedKeyword[] = [];
  try {
    // 그룹인 경우 멤버명 목록을 가져와서 필터 강화
    let memberNames: string[] | undefined;
    if (member.id && !member.group_name) {
      // group 또는 solo → 멤버 목록 조회
      const { data: members } = await sb
        .from("ktrenz_stars")
        .select("display_name, name_ko")
        .eq("group_star_id", member.id)
        .eq("is_active", true);
      if (members?.length) {
        memberNames = members.flatMap((m: any) => [m.display_name, m.name_ko].filter(Boolean));
      }
    }
    socialKeywords = await extractSocialKeywordsFromTikTok(
      openaiKey, sb, member.id, member.display_name, member.group_name, memberNames
    );
    srcStats.socialExtracted = socialKeywords.length;
    srcStats.tiktok = socialKeywords.length > 0 ? 1 : 0;
  } catch (e) {
    console.warn(`[trend-detect] TikTok social error for ${member.display_name}: ${(e as Error).message}`);
  }

  if (!articles.length && !shopKeywords.length && !socialKeywords.length) {
    return { keywordsFound: 0, articlesFound: 0, totalArticleCount, keywords: [], sourceStats: srcStats, insertStats: { inserted: 0, backfilled: 0, filtered: 0 } };
  }

  // AI로 상업 키워드 추출 (News + Blog 통합) — nameKo, groupNameKo 전달
  const aiKeywords = articles.length > 0
    ? await extractCommercialKeywords(
        openaiKey, member.display_name, member.group_name, articles, member.star_category,
        member.name_ko, member.group_name_ko, globalStarNames
      )
    : [];

  srcStats.aiExtracted = aiKeywords.length;

  // Shop 키워드 + AI 키워드 + Social 키워드 병합 (중복 제거)
  const mergedKeywords = mergeKeywords(mergeKeywords(aiKeywords, shopKeywords), socialKeywords);

  if (!mergedKeywords.length) {
    return { keywordsFound: 0, articlesFound: articles.length, totalArticleCount, keywords: [], sourceStats: srcStats, insertStats: { inserted: 0, backfilled: 0, filtered: 0 } };
  }

  // 아래부터 기존 로직 (keywords → mergedKeywords로 교체)
  const keywords = mergedKeywords;

  // 최근 7일 내 동일 멤버 키워드는 재삽입하지 않되, 빈 필드는 백필
  const keywordSources = keywords.map((k) => {
    // 소셜(TikTok) 키워드는 TikTok URL을 직접 사용
    if (k.category === "social" && k._tiktok_source_url) {
      return {
        keywordData: k,
        sourceArticle: { title: k.context || "", description: k.context_ko || "", url: k._tiktok_source_url },
        sourceUrl: k._tiktok_source_url,
      };
    }

    let articleIdx = -1;
    if (k.source_article_index && k.source_article_index > 0) {
      articleIdx = k.source_article_index - 1;
    } else {
      const refMatch = k.context?.match(/\[(\d+)\]/);
      if (refMatch) articleIdx = parseInt(refMatch[1], 10) - 1;
    }

    // ★ fallback을 articles[0]으로 하지 않음 — 매칭 실패 시 키워드 텍스트로 기사 검색
    let sourceArticle = (articleIdx >= 0 && articleIdx < articles.length) ? articles[articleIdx] : null;

    // 인덱스 매칭 실패 시 키워드가 포함된 기사를 찾아 매칭
    if (!sourceArticle) {
      const kwLower = (k.keyword_ko || k.keyword || "").toLowerCase();
      if (kwLower.length >= 2) {
        sourceArticle = articles.find(a => {
          const text = `${a.title} ${a.description || ""}`.toLowerCase();
          return text.includes(kwLower);
        }) || null;
      }
    }

    return { keywordData: k, sourceArticle, sourceUrl: sourceArticle?.url || null };
  });

  // 모든 기사 URL에서 이미지 전량 수집 (캡션 포함)
  const allArticleUrls = articles
    .slice(0, 10)
    .map(a => a.url)
    .filter(Boolean)
    .filter(url => !SOURCE_IMAGE_BLACKLIST.some(d => url.includes(d)));
  const uniqueUrls = [...new Set([
    ...keywordSources.map((item) => item.sourceUrl).filter(Boolean) as string[],
    ...allArticleUrls,
  ])];
  const articleImagesMap = new Map<string, ArticleImage[]>();
  await Promise.allSettled(
    uniqueUrls
      .filter(url => !SOURCE_IMAGE_BLACKLIST.some(d => url.includes(d)))
      .map(async (url) => {
        articleImagesMap.set(url, await fetchArticleImages(url));
      })
  );

  // ── Vision API로 이미지 품질 일괄 분류 ──
  const allImages = Array.from(articleImagesMap.values()).flat().map(i => i.url);
  const uniqueImageUrls = [...new Set(allImages)];
  const textHeavyImages = await classifyImagesWithVision(uniqueImageUrls, openaiKey);

  // 키워드별 이미지 선택: 캡션/alt에서 키워드 토큰 매칭 → 아티스트명 매칭 → 본문 이미지 순
  function selectBestImage(primaryUrl: string | null, keywordText?: string, artistName?: string): string | null {
    if (!primaryUrl) return null;
    const images = articleImagesMap.get(primaryUrl);
    if (!images || images.length === 0) return null;

    // 유효 이미지 필터 (텍스트 헤비 제외)
    const validImages = images.filter(img => !textHeavyImages.has(img.url));
    if (validImages.length === 0) return null;

    // 키워드 토큰 분리 (by접두사 제거, 슬래시·공백 분리)
    const keywordTokens: string[] = [];
    if (keywordText) {
      const cleaned = keywordText.replace(/^by/i, "").trim().toLowerCase();
      cleaned.split(/[\s\/]+/).filter(t => t.length >= 2).forEach(t => keywordTokens.push(t));
    }

    // 아티스트명 토큰 (키워드 토큰과 구분)
    const artistTokens: string[] = [];
    if (artistName) artistTokens.push(artistName.toLowerCase());
    if (member.name_ko) artistTokens.push(member.name_ko.toLowerCase());
    if (member.display_name) artistTokens.push(member.display_name.toLowerCase());

    // 스코어링: 키워드 토큰 매칭 > 아티스트명 매칭 > 본문 위치
    let bestScore = -1;
    let bestImg: ArticleImage | null = null;

    for (const img of validImages) {
      let score = 0;
      const captionLower = img.caption.toLowerCase();

      // 키워드 고유 토큰 매칭 (아티스트명 제외한 토큰) — 최고 우선순위
      const uniqueKwTokens = keywordTokens.filter(t => !artistTokens.includes(t));
      const kwMatches = uniqueKwTokens.filter(t => captionLower.includes(t)).length;
      if (kwMatches > 0) score += 100 * kwMatches;

      // 아티스트명 매칭
      const artistMatches = artistTokens.filter(t => captionLower.includes(t)).length;
      if (artistMatches > 0) score += 10 * artistMatches;

      // 본문 컨테이너 내부 보너스
      if (img.inArticleBody) score += 5;

      // OG 이미지는 패널티 (복합기사에서 대표 이미지 ≠ 키워드 이미지)
      if (img.isOg) score -= 2;

      if (score > bestScore) {
        bestScore = score;
        bestImg = img;
      }
    }

    // 키워드/아티스트 매칭이 있는 높은 점수만 확정 (10+점 = 아티스트명 이상 매칭)
    // 5점 이하(inArticleBody만)는 사이드바 오염 가능성 → og:image 우선
    if (bestImg && bestScore >= 10) {
      console.log(`[trend-detect] 🎯 Scored image (${bestScore}pts): "${bestImg.caption.slice(0, 60)}" for "${keywordText || artistName}"`);
      return sanitizeImageUrl(bestImg.url);
    }

    // 폴백 1: og:image 우선 (사이드바 이미지 오염 방지)
    const ogImages = validImages.filter(img => img.isOg);
    if (ogImages.length > 0) {
      return sanitizeImageUrl(ogImages[0].url);
    }

    // 폴백 2: 기사 본문 컨테이너 내부 이미지
    const articleBodyImages = validImages.filter(img => !img.isOg && img.inArticleBody);
    if (articleBodyImages.length > 0) {
      return sanitizeImageUrl(articleBodyImages[0].url);
    }

    // 폴백 3: 일반 본문 이미지
    const bodyImages = validImages.filter(img => !img.isOg);
    if (bodyImages.length > 0) {
      return sanitizeImageUrl(bodyImages[0].url);
    }

    // 최종 폴백
    return sanitizeImageUrl(validImages[0].url);
  }

  // ─── 순수 수집: buzz score 수집 없이 키워드와 소스 정보만 준비 ───
  const candidateRows = keywordSources.map(({ keywordData, sourceArticle, sourceUrl }) => {
    return {
      extractedKeyword: keywordData,
      // ktrenz_keywords 테이블용 데이터
      keywordRow: {
        keyword: keywordData.keyword,
        keyword_en: keywordData.keyword_en || null,
        keyword_ko: keywordData.keyword_ko || null,
        keyword_ja: keywordData.keyword_ja || null,
        keyword_zh: keywordData.keyword_zh || null,
        keyword_category: keywordData.category,
        status: "active",
        context: keywordData.context,
        context_ko: keywordData.context_ko || null,
        context_ja: keywordData.context_ja || null,
        context_zh: keywordData.context_zh || null,
        source_url: sourceUrl,
        source_title: sourceArticle?.title || null,
        source_image_url: (keywordData._tiktok_cover_url && sourceUrl?.includes("tiktok.com"))
          ? keywordData._tiktok_cover_url
          : (sourceUrl?.includes("youtube.com/watch") && sourceArticle?.imageUrl)
            ? sourceArticle.imageUrl
            : selectBestImage(sourceUrl, keywordData.keyword_ko || keywordData.keyword, member.display_name),
        source_snippet: sourceArticle?.description?.slice(0, 500) || null,
        metadata: (keywordData._tiktok_source_url && sourceUrl?.includes("tiktok.com")) ? {
          source: "tiktok",
          search_name: searchName,
          group_name: member.group_name,
        } : {
          article_count: articles.length,
          total_article_count: totalArticleCount, // 네이버 검색 전체 결과 수 (점수 반영용)
          total_youtube_count: totalYoutubeCount,
          search_name: searchName,
          group_name: member.group_name,
          ...(sourceArticle?.title?.startsWith("[YouTube]") ? { source: "youtube" } : {}),
        },
      },
      // ktrenz_keyword_sources 테이블용 데이터
      sourceRow: {
        star_id: member.id || null,
        artist_name: member.display_name,
        trigger_type: (keywordData._tiktok_source_url && sourceUrl?.includes("tiktok.com")) ? "social_trend" : "news_mention",
        trigger_source: (keywordData._tiktok_source_url && sourceUrl?.includes("tiktok.com"))
          ? "tiktok"
          : sourceArticle?.title?.startsWith("[YouTube]")
            ? "youtube"
            : "naver_news",
        source_url: sourceUrl,
        source_title: sourceArticle?.title || null,
        source_image_url: (keywordData._tiktok_cover_url && sourceUrl?.includes("tiktok.com"))
          ? keywordData._tiktok_cover_url
          : (sourceUrl?.includes("youtube.com/watch") && sourceArticle?.imageUrl)
            ? sourceArticle.imageUrl
            : selectBestImage(sourceUrl, keywordData.keyword_ko || keywordData.keyword, member.display_name),
        source_snippet: sourceArticle?.description?.slice(0, 500) || null,
        context: keywordData.context,
        context_ko: keywordData.context_ko || null,
        context_ja: keywordData.context_ja || null,
        context_zh: keywordData.context_zh || null,
        confidence: keywordData.confidence,
        commercial_intent: keywordData.commercial_intent || null,
        brand_intent: keywordData.brand_intent || null,
        fan_sentiment: keywordData.fan_sentiment || null,
        trend_potential: keywordData.trend_potential ?? null,
        purchase_stage: keywordData.purchase_stage || null,
        metadata: keywordData._tiktok_source_url ? { source: "tiktok" } : {},
      },
    };
  });

  // ── 기존 키워드 중복 체크 (ktrenz_keywords 테이블 기준) ──
  const allKeywordVariants = keywords.flatMap((k) => [
    k.keyword, k.keyword_en, k.keyword_ko
  ].filter(Boolean) as string[]);

  const { data: existingKeywords } = await sb
    .from("ktrenz_keywords")
    .select("id, keyword, keyword_en, keyword_ko")
    .eq("status", "active");

  const existingByKeyword = new Map<string, any>();
  for (const e of (existingKeywords || [])) {
    for (const field of [e.keyword, e.keyword_en, e.keyword_ko]) {
      if (field) existingByKeyword.set(field.toLowerCase(), e);
    }
  }

  // 기존 keyword_sources에서 같은 아티스트의 최근 3일 내 소스 중복 확인
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const existingKeywordIds = (existingKeywords || []).map((e: any) => e.id);
  let existingSourceSet = new Set<string>();
  if (existingKeywordIds.length > 0 && member.id) {
    const { data: existingSources } = await sb
      .from("ktrenz_keyword_sources")
      .select("keyword_id")
      .eq("star_id", member.id)
      .in("keyword_id", existingKeywordIds.slice(0, 500))
      .gte("created_at", threeDaysAgo);
    for (const s of (existingSources || [])) {
      existingSourceSet.add(s.keyword_id);
    }
  }

  const keywordsToInsert: any[] = [];
  const sourcesToInsert: any[] = [];
  const insertedKeywords: ExtractedKeyword[] = [];
  const batchInsertedKeys = new Set<string>();

  // 아티스트/그룹/멤버 이름과 일치하는 키워드 차단용 셋
  const artistNameSet = collectNameVariants(
    member.display_name,
    member.name_ko,
    member.group_name,
    member.group_name_ko,
  );

  if (member.id) {
    const { data: relatedMembers } = await sb
      .from("ktrenz_stars")
      .select("display_name, name_ko")
      .eq("group_star_id", member.id);

    for (const related of relatedMembers || []) {
      for (const variant of collectNameVariants(related.display_name, related.name_ko)) {
        artistNameSet.add(variant);
      }
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
    // 알려진 오탐 키워드
    "바비스모", "vabysmo", "엑소시스템즈", "exo systems", "exosystems",
  ]);

  // 기업/법인 접미사 → 아티스트 키워드가 아닌 기업명 차단
  const CORP_SUFFIXES = [
    "시스템즈", "시스템", "테크", "테크놀로지", "바이오", "제약", "홀딩스",
    "그룹", "인더스트리", "솔루션", "솔루션즈", "캐피탈", "파이낸셜",
    "systems", "tech", "technology", "bio", "pharma", "pharmaceutical",
    "holdings", "industries", "solutions", "capital", "financial",
    "inc", "corp", "corporation", "ltd", "llc", "gmbh",
  ];

  // 의약품/화학물질 접미사 → 약품 명명 규칙 (INN 접미사)
  const PHARMA_SUFFIXES = [
    "스모", "맙", "닙", "졸", "틴", "벨", "센트", "프릴",
    "mab", "nib", "zol", "vir", "smo", "tin", "pril", "sartan",
    "statin", "olol", "oxin", "azole", "gliptin", "lukast",
    "cillin", "mycin", "cycline", "floxacin",
  ];

  function isCorpOrPharmaKeyword(kw: string): boolean {
    const lower = kw.toLowerCase().trim();
    if (lower.length < 4) return false;
    // 기업 접미사 체크
    for (const suffix of CORP_SUFFIXES) {
      if (lower.endsWith(suffix) && lower.length > suffix.length + 1) return true;
    }
    // 의약품 접미사 체크 (한글은 3글자 이상, 영문은 5글자 이상일 때만)
    for (const suffix of PHARMA_SUFFIXES) {
      const isKorean = /[가-힣]/.test(suffix);
      const minLen = isKorean ? 3 : 5;
      if (lower.length >= minLen && lower.endsWith(suffix) && lower.length > suffix.length + 1) return true;
    }
    return false;
  }

  for (const candidate of candidateRows) {
    const kwLower = candidate.keywordRow.keyword.toLowerCase();
    const kwEnLower = candidate.keywordRow.keyword_en?.toLowerCase() || "";
    const kwKoLower = candidate.keywordRow.keyword_ko?.toLowerCase() || "";
    const kwStripped = kwLower.replace(/[\s·,\-]+/g, "");

    // 아티스트/그룹/그룹 멤버 이름과 일치하는 키워드 차단
    if (matchesBlockedNameKeyword(candidate.keywordRow, artistNameSet)) {
      console.warn(`[trend-detect] Artist/member name keyword filtered: "${candidate.keywordRow.keyword}" (${member.display_name})`);
      continue;
    }

    // 글로벌 스타 이름과 일치하는 키워드 차단
    if (globalStarNames) {
      const matchedStar = globalStarNames.get(kwLower) || globalStarNames.get(kwKoLower) || globalStarNames.get(kwEnLower)
        || globalStarNames.get(kwStripped);
      if (matchedStar) {
        console.warn(`[trend-detect] Global star name keyword filtered at insert: "${candidate.keywordRow.keyword}" (matches star: ${matchedStar})`);
        continue;
      }
    }

    // 노이즈 필터
    if (INSERT_NOISE_BLACKLIST.has(kwLower) || INSERT_NOISE_BLACKLIST.has(kwKoLower)) {
      console.warn(`[trend-detect] Noise keyword filtered at insert: "${candidate.keywordRow.keyword}"`);
      continue;
    }

    // 기업명/의약품명 패턴 필터
    if (isCorpOrPharmaKeyword(kwLower) || isCorpOrPharmaKeyword(kwKoLower) || isCorpOrPharmaKeyword(kwEnLower)) {
      console.warn(`[trend-detect] Corp/pharma pattern filtered: "${candidate.keywordRow.keyword}" (ko: ${kwKoLower}, en: ${kwEnLower})`);
      continue;
    }

    // 순수 인물명 필터 (한글 2~3자 이름만으로 구성된 키워드 제거, 복합 키워드는 유지)
    // 예: "전지현" → 제거, "전지현 광고" → 유지, "by필릭스" → 유지(위에서 이미 처리)
    const pureKoreanNameRegex = /^[가-힣]{2,4}$/;
    const kwTrimmed = candidate.keywordRow.keyword.trim();
    const kwKoTrimmed = (candidate.keywordRow.keyword_ko || "").trim();
    if (pureKoreanNameRegex.test(kwTrimmed) || pureKoreanNameRegex.test(kwKoTrimmed)) {
      // 우리 스타 테이블에 있는 이름이면 위에서 이미 차단됨 → 여기서는 외부 인물명 차단
      // 혹시 우리 스타와 관련된 제품/행사명이 2~3자일 수 있으므로, 한글 이름 패턴만 차단
      const isLikelyName = (s: string) => pureKoreanNameRegex.test(s) && !/[0-9]/.test(s);
      if (isLikelyName(kwTrimmed) || isLikelyName(kwKoTrimmed)) {
        console.warn(`[trend-detect] Pure person-name keyword filtered: "${candidate.keywordRow.keyword}" (ko: ${kwKoTrimmed})`);
        continue;
      }
    }

    // 같은 run 내 다른 아티스트가 이미 삽입한 키워드 차단
    if (runInsertedKeywords && (runInsertedKeywords.has(kwLower) || (kwKoLower && runInsertedKeywords.has(kwKoLower)) || (kwEnLower && runInsertedKeywords.has(kwEnLower)))) {
      console.warn(`[trend-detect] Run-level cross-artist duplicate filtered: "${candidate.keywordRow.keyword}"`);
      continue;
    }

    // 기존 키워드 존재 여부 확인
    const existingKw = existingByKeyword.get(kwLower) || (kwEnLower ? existingByKeyword.get(kwEnLower) : null) || (kwKoLower ? existingByKeyword.get(kwKoLower) : null);

    if (existingKw) {
      // 키워드는 이미 존재 → 이 아티스트의 소스만 추가 (3일 내 중복 아닌 경우)
      if (!existingSourceSet.has(existingKw.id)) {
        sourcesToInsert.push({
          ...candidate.sourceRow,
          keyword_id: existingKw.id,
        });
        console.log(`[trend-detect] Adding source for existing keyword "${candidate.keywordRow.keyword}" via ${member.display_name}`);
      }
      continue;
    }

    if (batchInsertedKeys.has(kwLower)) {
      continue;
    }
    batchInsertedKeys.add(kwLower);
    if (runInsertedKeywords) {
      runInsertedKeywords.add(kwLower);
      if (kwKoLower) runInsertedKeywords.add(kwKoLower);
      if (kwEnLower) runInsertedKeywords.add(kwEnLower);
    }
    keywordsToInsert.push({ keywordRow: candidate.keywordRow, sourceRow: candidate.sourceRow });
    insertedKeywords.push(candidate.extractedKeyword);
  }

  // ── 새 키워드 삽입 (ktrenz_keywords) + 소스 연결 (ktrenz_keyword_sources) ──
  let insertedCount = 0;
  if (keywordsToInsert.length > 0) {
    const kwRows = keywordsToInsert.map(k => k.keywordRow);
    const { data: inserted, error: insertError } = await sb.from("ktrenz_keywords").insert(kwRows).select("id");

    if (insertError) {
      console.error(`[trend-detect] Keyword insert error: ${insertError.message}`);
    } else if (inserted?.length) {
      insertedCount = inserted.length;
      // 삽입된 키워드에 소스 연결
      const newSources = inserted.map((kw: any, idx: number) => ({
        ...keywordsToInsert[idx].sourceRow,
        keyword_id: kw.id,
      }));
      sourcesToInsert.push(...newSources);

      // 비동기 이미지 캐시 호출 (기존 호환)
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      // ktrenz_trend_triggers에도 호환용 삽입 (기존 UI/track과 연동 유지)
      const triggerRows = inserted.map((kw: any, idx: number) => {
        const kr = keywordsToInsert[idx].keywordRow;
        const sr = keywordsToInsert[idx].sourceRow;
        return {
          wiki_entry_id: null,
          star_id: sr.star_id,
          trigger_type: sr.trigger_type,
          trigger_source: sr.trigger_source,
          artist_name: sr.artist_name,
          keyword: kr.keyword,
          keyword_en: kr.keyword_en,
          keyword_ko: kr.keyword_ko,
          keyword_ja: kr.keyword_ja,
          keyword_zh: kr.keyword_zh,
          keyword_category: kr.keyword_category,
          context: kr.context,
          context_ko: kr.context_ko,
          context_ja: kr.context_ja,
          context_zh: kr.context_zh,
          confidence: sr.confidence,
          source_url: kr.source_url,
          source_title: kr.source_title,
          source_image_url: kr.source_image_url,
          source_snippet: kr.source_snippet,
          commercial_intent: sr.commercial_intent,
          brand_intent: sr.brand_intent,
          fan_sentiment: sr.fan_sentiment,
          trend_potential: sr.trend_potential,
          purchase_stage: sr.purchase_stage,
          baseline_score: 0,
          peak_score: 0,
          status: "active",
          metadata: {
            ...kr.metadata,
            keyword_id: kw.id, // 새 테이블 참조
          },
        };
      });
      const { data: triggerInserted } = await sb.from("ktrenz_trend_triggers").insert(triggerRows).select("id");
      if (triggerInserted?.length) {
        fetch(`${supabaseUrl}/functions/v1/ktrenz-cache-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ triggerIds: triggerInserted.map((r: any) => r.id) }),
        }).catch((e) => console.warn(`[trend-detect] cache-image fire-and-forget error: ${e.message}`));
      }
    }
  }

  // ── 소스 연결 삽입 ──
  if (sourcesToInsert.length > 0) {
    const { error: srcError } = await sb.from("ktrenz_keyword_sources").insert(sourcesToInsert);
    if (srcError) {
      console.error(`[trend-detect] Source insert error: ${srcError.message}`);
    }
  }

  console.log(
    `[trend-detect] ${member.display_name}: inserted ${insertedCount} new keywords, ${sourcesToInsert.length} sources`
  );

  return {
    keywordsFound: insertedCount,
    articlesFound: articles.length,
    totalArticleCount,
    keywords: insertedKeywords,
    sourceStats: srcStats,
    insertStats: { inserted: insertedCount, backfilled: 0, filtered: Math.max(0, candidateRows.length - insertedCount) },
  };
}
