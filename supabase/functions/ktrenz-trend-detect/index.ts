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
  category: "brand" | "product" | "place" | "food" | "fashion" | "beauty" | "media";
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

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

// ─── Naver News 실시간 검색 ───
async function searchNaverNews(
  clientId: string,
  clientSecret: string,
  query: string,
  display: number = 50,
): Promise<NaverNewsItem[]> {
  try {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(display, 100)));
    url.searchParams.set("sort", "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      console.warn(`[trend-detect] Naver API failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (e) {
    console.warn(`[trend-detect] Naver search error: ${(e as Error).message}`);
    return [];
  }
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
    // 50KB까지 읽어 og:image가 뒤에 있는 사이트도 커버
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    // 1) og:image 메타 태그
    const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    // 2) twitter:image 메타 태그
    const twMatch = html.match(/<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i);
    if (twMatch?.[1]) return twMatch[1];

    // 3) 본문 내 첫 번째 <img> 폴백 (광고/아이콘 제외)
    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const m of imgMatches) {
      const src = m[1];
      // 작은 아이콘, 광고, 트래커 이미지 제외
      if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
      if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner/i.test(src)) continue;
      // 최소한 뉴스 사진일 가능성이 있는 것만
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//")) {
        return src.startsWith("//") ? `https:${src}` : src;
      }
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

// ─── OpenAI 기반 키워드 추출 (기사 텍스트만 분석, 외부 검색 없음) ───
async function extractCommercialKeywords(
  openaiKey: string,
  memberName: string,
  groupName: string | null,
  articles: { title: string; description?: string; url?: string }[],
  starCategory: string = "kpop"
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const articleTexts = articles
    .slice(0, 25)
    .map((a, i) => `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}`)
    .join("\n");

  const categoryContext = getCategoryContext(starCategory);

  const systemPrompt = `You are a strict text-analysis tool. You MUST only analyze the article texts provided below. You have NO external knowledge. You cannot search the web. If a brand/product/entity is NOT explicitly written in the provided text, you MUST NOT output it. Return ONLY a JSON array.`;

  const userPrompt = `Below are Korean news article titles and descriptions. Extract commercial entities (brands, products, places, foods, fashion items, beauty products, media appearances) ONLY if they are EXPLICITLY WRITTEN in the text AND connected to "${memberName}"${groupName ? ` (member of ${groupName})` : ""} (${categoryContext}).

Articles:
${articleTexts}

RULES:
1. ONLY extract entities whose name literally appears in the article text above.
2. "${memberName}" should be mentioned in the article. Articles about the group "${groupName || "N/A"}" are acceptable IF "${memberName}" is specifically mentioned or if the entity is clearly linked to the group's activity.
3. STRICTLY FORBIDDEN keywords — NEVER extract any of these:
   - The artist's own name ("${memberName}"), group name ("${groupName || "N/A"}"), other member names, sub-unit names
   - ANY combination containing the artist/group name (e.g., "${memberName} + descriptor" like "아이브 가을" for artist "가을" is FORBIDDEN)
   - Agency/label names (SM, JYP, HYBE, YG, etc.), generic music terms (album, comeback, 컴백)
   - Brand reputation rankings/indexes (브랜드평판, brand reputation) — these are NOT commercial entities
   - Platform names (YouTube, Spotify, TikTok, Instagram, Twitter/X, Melon, Genie, Apple Music, Weverse, VLive, Bubble, etc.) — we track what trends ON platforms, not the platforms themselves
   - Broadcast networks as standalone keywords (KBS, MBC, SBS, JTBC, tvN, Mnet) — UNLESS the specific SHOW NAME is the keyword
4. Chart names (Billboard, Hanteo, etc.), concert/tour names, and festival names (Coachella, MAMA, etc.) are FORBIDDEN as standalone keywords. ONLY extract them if tied to a specific commercial brand (e.g., "Coachella x Adidas" → extract "Adidas", NOT "Coachella").
5. Do NOT hallucinate or use prior knowledge about this artist's endorsements.
6. Maximum 5 keywords. Confidence 0.0-1.0 based on how clearly the text links the entity to "${memberName}".
7. Categories: brand, product, place, food, fashion, beauty, media. Category guide: "media" includes TV shows, dramas, movies, variety shows, interviews, and entertainment content. Songs/albums by the artist themselves are NOT valid keywords. Songs/albums by OTHER artists CAN be extracted if there's a collaboration. "product" is for physical consumer goods.
7a. CONTEXT-BASED DISAMBIGUATION (CRITICAL): When a keyword is an ordinary word (e.g., "아파트", "Flower", "Pink Venom", "Butter") but the article context discusses charts, streaming, music awards, Billboard, MV views, album sales, or any music-related achievement, it is a SONG/ALBUM TITLE — classify as "media", NEVER as "place", "product", or "food" based on the literal dictionary meaning. Always prioritize the article's context over the word's literal meaning.
8. IMPORTANT: Use the ORIGINAL Korean name as it appears in the article text as "keyword". For internationally known brands (Chanel, Nike, etc.), use the English name directly. For Korean-origin names (이연복, 쇼미더머니, 컴포즈커피, etc.), keep the Korean as "keyword".
9. Always provide "keyword_en" (English translation/name), "keyword_ko" (Korean), "keyword_ja" (Japanese), "keyword_zh" (Chinese).
10. Include "source_article_index" (1-based) pointing to the article where the entity appears.
11. Provide translated context: context, context_ko, context_ja, context_zh. Do NOT include article reference numbers like [1], [2] etc. in the context fields. Write clean, natural sentences.
12. SKIP articles that are just ranking/reputation lists mentioning many artists. Only extract from articles with SPECIFIC, unique content about "${memberName}" and a commercial entity.

INTENT ANALYSIS (required for each keyword):
13. "commercial_intent": Classify the nature of the association — "ad" (paid advertisement), "sponsorship" (official brand deal/ambassador), "collaboration" (creative partnership), "organic" (natural/unpaid mention or usage), "rumor" (unconfirmed association).
14. "brand_intent": From the brand's perspective — "awareness" (brand name exposure/visibility), "conversion" (driving purchases/sales), "association" (image/identity linking), "loyalty" (deepening existing fan-brand relationship).
15. "fan_sentiment": Predicted fandom reaction — "positive" (fans excited/supportive), "negative" (fans upset/boycotting), "neutral" (informational, no strong reaction), "mixed" (divided opinions).
16. "trend_potential": A 0.0-1.0 score predicting whether this keyword will become a viral trend. Consider: Is this novel/surprising? Is there emotional resonance with fans? Is there visual/shareable content? Does it involve a major brand or cultural moment? Higher for new collaborations, lower for routine mentions.

TREND VALUE FILTER: Only extract keywords worth tracking for trend prediction. Ask: "Would a brand strategist or trend forecaster want to monitor this?" If not, skip it.

If NO commercial entities are found, return [].
Example: [{"keyword":"Chanel","keyword_en":"Chanel","keyword_ko":"샤넬","keyword_ja":"シャネル","keyword_zh":"香奈儿","category":"fashion","confidence":0.9,"context":"wore Chanel outfit at airport","context_ko":"공항에서 샤넬 의상 착용","context_ja":"空港でシャネルの衣装を着用","context_zh":"在机场穿着香奈儿服装","source_article_index":1,"commercial_intent":"organic","brand_intent":"awareness","fan_sentiment":"positive","trend_potential":0.7}]`;

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
        temperature: 0.05,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[trend-detect] OpenAI API error: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log(`[trend-detect] AI raw response for ${memberName}: ${content.slice(0, 500)}`);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`[trend-detect] No JSON array found in AI response for ${memberName}`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    console.log(`[trend-detect] AI extracted ${parsed.length} keywords for ${memberName}: ${parsed.map(k => k.keyword).join(", ")}`);

    // 후검증: 완화된 매칭 — 정확 매칭 또는 핵심 단어(2글자+) 중 하나라도 기사에 존재하면 통과
    const allText = articles.map(a => `${a.title} ${a.description || ""}`).join(" ").toLowerCase();
    return parsed.filter((k) => {
      if (!k.keyword || !k.category || typeof k.confidence !== "number") return false;
      
      // ── 아티스트/그룹 이름 필터 (하드코드 방어) ──
      const kwLower = k.keyword.toLowerCase();
      const kwKo = k.keyword_ko?.toLowerCase() || "";
      const kwEn = k.keyword_en?.toLowerCase() || "";
      const memberLower = memberName.toLowerCase();
      const groupLower = (groupName || "").toLowerCase();
      
      // 키워드가 아티스트/그룹 이름을 포함하거나 일치하면 제거
      const nameBlacklist = [memberLower, groupLower].filter(Boolean);
      for (const blocked of nameBlacklist) {
        if (!blocked) continue;
        if (kwLower === blocked || kwKo === blocked || kwEn === blocked) {
          console.warn(`[trend-detect] Blocked artist/group name as keyword: "${k.keyword}"`);
          return false;
        }
        // "아이브 가을" contains "가을" (memberName)
        if (kwLower.includes(blocked) || kwKo.includes(blocked) || blocked.includes(kwLower)) {
          console.warn(`[trend-detect] Blocked keyword containing artist/group name: "${k.keyword}" (matches "${blocked}")`);
          return false;
        }
      }
      
      // confidence 0.8 이상이면 후검증 스킵 (AI가 확신하는 경우)
      if (k.confidence >= 0.8) {
        console.log(`[trend-detect] High confidence (${k.confidence}), skipping text check: "${k.keyword}"`);
        return true;
      }
      
      // 1) 정확 매칭 (keyword, keyword_ko, keyword_en 중 하나라도)
      if (allText.includes(kwLower) || (kwKo && allText.includes(kwKo)) || (kwEn && allText.includes(kwEn))) return true;
      
      // 2) 단어 분리 매칭: keyword_ko를 공백으로 분리 후 2글자 이상 단어 중 하나라도 매칭
      if (kwKo) {
        const tokens = kwKo.split(/[\s·,]+/).filter(t => t.length >= 2);
        if (tokens.length > 0 && tokens.some(t => allText.includes(t))) {
          console.log(`[trend-detect] Partial match for "${k.keyword_ko}" via token in text`);
          return true;
        }
      }
      
      // 3) 영문 키워드 단어 분리 매칭
      const enTokens = kwLower.split(/[\s'']+/).filter(t => t.length >= 3);
      if (enTokens.length > 1 && enTokens.some(t => allText.includes(t))) {
        console.log(`[trend-detect] Partial EN match for "${k.keyword}" via token in text`);
        return true;
      }
      
      console.warn(`[trend-detect] Filtered out: "${k.keyword}" / "${k.keyword_ko}" (not in article text, conf=${k.confidence})`);
      return false;
    });
  } catch (e) {
    console.warn(`[trend-detect] Extraction error: ${(e as Error).message}`);
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

    for (const star of batch) {
      try {
        const isGroup = star.star_type === "group";
        const isSolo = star.star_type === "solo";
        const group = star.group_star_id ? groupMap[star.group_star_id] : null;

        // 그룹: group_name은 자기 자신, wiki_entry_id도 자기 자신
        // 솔로: group 없음
        // 멤버: 소속 그룹 참조
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
        console.log(`[trend-detect] ✓ ${star.display_name} (${star.star_type}): ${result.keywordsFound} keywords (${result.articlesFound} articles)`);

        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[trend-detect] ✗ ${star.display_name}: ${(e as Error).message}`);
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
): Promise<{ keywordsFound: number; articlesFound: number; keywords: ExtractedKeyword[] }> {
  // 검색어 결정: 한글명 우선, 없으면 영문명
  // 그룹 멤버인 경우 "그룹명 멤버명" 형태로 검색하여 동명이인 방지 (예: "스트레이 키즈 필릭스")
  const searchName = member.name_ko || member.display_name;
  const groupLabel = member.group_name_ko || member.group_name;
  const searchQuery = groupLabel
    ? `"${searchName}" "${groupLabel}"`
    : `"${searchName}"`;

  // 네이버 뉴스 실시간 검색
  const newsItems = await searchNaverNews(naverClientId, naverClientSecret, searchQuery, 50);

  // 24시간 이내 + 일본어 기사 필터링
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = newsItems.filter((item) => {
    const pubTime = new Date(item.pubDate).getTime();
    if (isNaN(pubTime) || pubTime < cutoff24h) return false;
    if (isJapanese(item.title) || isJapanese(item.description)) return false;
    return true;
  });

  const articles = filtered.map((item) => ({
    title: stripHtml(item.title),
    description: stripHtml(item.description),
    url: item.originallink || item.link,
  }));

  if (!articles.length) {
    return { keywordsFound: 0, articlesFound: 0, keywords: [] };
  }

  // AI로 상업 키워드 추출
  const keywords = await extractCommercialKeywords(
    openaiKey, member.display_name, member.group_name, articles, member.star_category
  );

  if (!keywords.length) {
    return { keywordsFound: 0, articlesFound: articles.length, keywords: [] };
  }

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

  const uniqueUrls = [...new Set(keywordSources.map((item) => item.sourceUrl).filter(Boolean))] as string[];
  const ogImageMap = new Map<string, string | null>();
  await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      ogImageMap.set(url, await fetchOgImage(url));
    })
  );

  const candidateRows = keywordSources.map(({ keywordData, sourceArticle, sourceUrl }) => ({
    extractedKeyword: keywordData,
    row: {
      wiki_entry_id: member.group_wiki_entry_id || null,
      star_id: member.id || null,
      trigger_type: "news_mention",
      trigger_source: "naver_news",
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
      source_image_url: sourceUrl ? ogImageMap.get(sourceUrl) || null : null,
      status: "active",
      metadata: {
        article_count: articles.length,
        search_name: searchName,
        group_name: member.group_name,
      },
    },
  }));

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

  for (const candidate of candidateRows) {
    const kwLower = candidate.row.keyword.toLowerCase();
    const kwEnLower = candidate.row.keyword_en?.toLowerCase() || "";
    const kwKoLower = candidate.row.keyword_ko?.toLowerCase() || "";

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

  console.log(
    `[trend-detect] ${member.display_name}: inserted ${rowsToInsert.length} new keywords, backfilled ${backfillPromises.length} existing keywords`
  );

  return { keywordsFound: rowsToInsert.length, articlesFound: articles.length, keywords: insertedKeywords };
}
