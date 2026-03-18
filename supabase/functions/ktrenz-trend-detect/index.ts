// T2 Trend Detect: 멤버 대상 실시간 네이버 뉴스 검색 → AI 상업 키워드 추출
// ktrenz_stars의 member 타입 아티스트를 대상으로 직접 검색하여 ktrenz_trend_triggers에 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedKeyword {
  keyword: string;
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
}

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

// ─── OG Image 추출 ───
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KTrenzBot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 30000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();
    const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

// ─── Perplexity AI 키워드 추출 ───
async function extractCommercialKeywords(
  perplexityKey: string,
  memberName: string,
  groupName: string | null,
  articles: { title: string; description?: string; url?: string }[]
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const artistLabel = groupName ? `${memberName} (member of ${groupName})` : memberName;

  const articleTexts = articles
    .slice(0, 10)
    .map((a, i) => `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}`)
    .join("\n");

  const prompt = `Analyze these recent Korean news articles and extract commercial entities (brands, products, places, foods, fashion items, beauty products, media appearances) that are DIRECTLY linked to K-pop artist "${memberName}"${groupName ? ` (member of ${groupName})` : ""}.

Articles:
${articleTexts}

CRITICAL ATTRIBUTION RULE:
- You MUST only extract entities where "${memberName}" is the PRIMARY artist connected to that entity IN THE ARTICLE TEXT.
- If the article mentions "${memberName}" only peripherally, do NOT extract entities from that article.
- Ask yourself: "Is ${memberName} INDIVIDUALLY the REASON this entity is newsworthy?" If NO, skip it.
- Group activities (group comeback, group concert) should NOT be extracted — only INDIVIDUAL member activities count.

STRICT Rules:
- ONLY extract entities that are EXPLICITLY MENTIONED in the article text above
- Do NOT use your own knowledge about the artist's past endorsements
- Do NOT list brands/products that are NOT written in the articles
- Only extract entities representing a CURRENT or UPCOMING commercial connection where "${memberName}" is the MAIN actor INDIVIDUALLY
- Do NOT extract the artist name itself, their group name, or their agency/label
- Do NOT extract generic music industry terms (album, concert, chart, Billboard, etc.)
- Do NOT extract TV show names unless the artist is appearing as a guest/model
- Assign confidence 0.0-1.0 based on how clearly the entity is linked to "${memberName}" specifically
- Categorize each as: brand, product, place, food, fashion, beauty, or media
- Maximum 5 keywords per batch
- IMPORTANT: Always use the ENGLISH name of the entity as the keyword
- If the entity is originally Korean, romanize it
- For each keyword, also provide translations: keyword_ko (Korean), keyword_ja (Japanese), keyword_zh (Chinese simplified)
- For each keyword, include "source_article_index": the 1-based article number
- For each keyword, provide translated context: "context_ko", "context_ja", "context_zh"

Return ONLY a JSON array. If no commercial entities found where "${memberName}" is the primary individual actor, return [].
Example: [{"keyword":"Chanel","keyword_ko":"샤넬","keyword_ja":"シャネル","keyword_zh":"香奈儿","category":"fashion","confidence":0.9,"context":"wore Chanel outfit at airport[1]","context_ko":"공항에서 샤넬 의상 착용[1]","context_ja":"空港でシャネルの衣装を着用[1]","context_zh":"在机场穿着香奈儿服装[1]","source_article_index":1}]`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a trend analysis expert specializing in individual K-pop member activities. Extract commercial entities ONLY from the provided article texts. Focus on INDIVIDUAL member activities, not group activities. Never use external knowledge. Return ONLY valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        search_recency_filter: "week",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[trend-detect] Perplexity API error: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed.filter(
      (k) => k.keyword && k.category && typeof k.confidence === "number"
    );
  } catch (e) {
    console.warn(`[trend-detect] Extraction error: ${(e as Error).message}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { starId, memberName, groupName, wikiEntryId, artistName, batchSize = 5, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const naverClientId = Deno.env.get("NAVER_CLIENT_ID");
    const naverClientSecret = Deno.env.get("NAVER_CLIENT_SECRET");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!naverClientId || !naverClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "NAVER_CLIENT_ID/SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 단일 멤버 모드 (수동 테스트용)
    if (starId && memberName) {
      const result = await detectForMember(
        sb, perplexityKey, naverClientId, naverClientSecret,
        { id: starId, display_name: memberName, name_ko: null, group_name: groupName || null, group_wiki_entry_id: wikiEntryId || null }
      );
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 레거시 호환: wikiEntryId + artistName으로 호출 시
    if (wikiEntryId && artistName) {
      const result = await detectForMember(
        sb, perplexityKey, naverClientId, naverClientSecret,
        { id: null, display_name: artistName, name_ko: null, group_name: null, group_wiki_entry_id: wikiEntryId }
      );
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 배치 모드: ktrenz_stars의 member 타입 순회
    const { data: members } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, group_star_id")
      .eq("is_active", true)
      .eq("star_type", "member")
      .order("display_name", { ascending: true });

    const allMembers = members || [];

    // group_star_id로 그룹 정보 일괄 조회
    const groupIds = [...new Set(allMembers.map((m: any) => m.group_star_id).filter(Boolean))];
    let groupMap: Record<string, { display_name: string; wiki_entry_id: string | null }> = {};
    if (groupIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, wiki_entry_id")
        .in("id", groupIds);
      for (const g of (groups || [])) {
        groupMap[g.id] = { display_name: g.display_name, wiki_entry_id: g.wiki_entry_id };
      }
    }

    const batch = allMembers.slice(batchOffset, batchOffset + batchSize);

    if (!batch.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No members in batch", batchOffset, totalCandidates: allMembers.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trend-detect] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} members (total: ${allMembers.length})`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const member of batch) {
      try {
        const group = member.group_star_id ? groupMap[member.group_star_id] : null;
        const result = await detectForMember(
          sb, perplexityKey, naverClientId, naverClientSecret,
          {
            id: member.id,
            display_name: member.display_name,
            name_ko: member.name_ko,
            group_name: group?.display_name || null,
            group_wiki_entry_id: group?.wiki_entry_id || null,
          }
        );
        successCount++;
        totalKeywords += result.keywordsFound;
        console.log(`[trend-detect] ✓ ${member.display_name}: ${result.keywordsFound} keywords (${result.articlesFound} articles)`);

        // Rate limit 방지: Naver API + Perplexity 간 간격
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[trend-detect] ✗ ${member.display_name}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        batchSize,
        processed: batch.length,
        totalCandidates: allMembers.length,
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
  group_wiki_entry_id: string | null;
}

async function detectForMember(
  sb: any,
  perplexityKey: string,
  naverClientId: string,
  naverClientSecret: string,
  member: MemberInfo,
): Promise<{ keywordsFound: number; articlesFound: number; keywords: ExtractedKeyword[] }> {
  // 검색어 결정: 한글명 우선, 없으면 영문명
  const searchName = member.name_ko || member.display_name;

  // 네이버 뉴스 실시간 검색
  const newsItems = await searchNaverNews(naverClientId, naverClientSecret, `"${searchName}"`, 50);

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
    perplexityKey, member.display_name, member.group_name, articles
  );

  if (!keywords.length) {
    return { keywordsFound: 0, articlesFound: articles.length, keywords: [] };
  }

  // 중복 방지: 같은 키워드가 최근 7일 이내 이미 감지되었는지
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from("ktrenz_trend_triggers")
    .select("keyword, star_id")
    .gte("detected_at", weekAgo)
    .in("keyword", keywords.map((k) => k.keyword));

  const existingKeywords = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
  const newKeywords = keywords.filter((k) => !existingKeywords.has(k.keyword.toLowerCase()));

  if (newKeywords.length > 0) {
    // OG image 추출
    const sourceArticles = newKeywords.map((k) => {
      let articleIdx = 0;
      if (k.source_article_index && k.source_article_index > 0) {
        articleIdx = k.source_article_index - 1;
      } else {
        const refMatch = k.context?.match(/\[(\d+)\]/);
        if (refMatch) articleIdx = parseInt(refMatch[1], 10) - 1;
      }
      return articles[articleIdx] || articles[0];
    });

    const uniqueUrls = [...new Set(sourceArticles.map((a) => a?.url).filter(Boolean))] as string[];
    const ogImageMap = new Map<string, string | null>();
    await Promise.allSettled(
      uniqueUrls.map(async (url) => {
        ogImageMap.set(url, await fetchOgImage(url));
      })
    );

    const rows = newKeywords.map((k, i) => {
      const sourceArticle = sourceArticles[i];
      const sourceUrl = sourceArticle?.url || null;

      return {
        wiki_entry_id: member.group_wiki_entry_id || null,
        star_id: member.id || null,
        trigger_type: "news_mention",
        trigger_source: "naver_news",
        artist_name: member.display_name,
        keyword: k.keyword,
        keyword_ko: k.keyword_ko || null,
        keyword_ja: k.keyword_ja || null,
        keyword_zh: k.keyword_zh || null,
        keyword_category: k.category,
        context: k.context,
        context_ko: k.context_ko || null,
        context_ja: k.context_ja || null,
        context_zh: k.context_zh || null,
        confidence: k.confidence,
        source_url: sourceUrl,
        source_title: sourceArticle?.title || null,
        source_image_url: sourceUrl ? ogImageMap.get(sourceUrl) || null : null,
        status: "active",
        metadata: {
          article_count: articles.length,
          search_name: searchName,
          group_name: member.group_name,
        },
      };
    });

    await sb.from("ktrenz_trend_triggers").insert(rows);
    console.log(`[trend-detect] ${member.display_name}: inserted ${newKeywords.length} new keywords (${newKeywords.map((k) => k.keyword).join(", ")})`);
  }

  return { keywordsFound: newKeywords.length, articlesFound: articles.length, keywords: newKeywords };
}
