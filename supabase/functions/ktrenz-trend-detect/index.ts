// T2 Trend Detect: Naver 뉴스 기사에서 AI로 상업 키워드(브랜드/제품/장소) 추출
// Tier 1 아티스트의 최근 naver_news 스냅샷을 분석하여 ktrenz_trend_triggers에 저장
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

// Fetch OG image from a URL (best-effort, returns null on failure)
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
    const html = await res.text();
    // Parse og:image from HTML
    const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}
// Perplexity API로 뉴스 기사에서 상업 키워드 추출
async function extractCommercialKeywords(
  perplexityKey: string,
  artistName: string,
  articles: { title: string; description?: string; url?: string }[]
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const articleTexts = articles
    .slice(0, 10) // 최대 10개 기사
    .map((a, i) => `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}`)
    .join("\n");

  const prompt = `Analyze these recent Korean news articles about K-pop artist "${artistName}" and extract commercial entities (brands, products, places, foods, fashion items, beauty products, media appearances).

Articles:
${articleTexts}

STRICT Rules:
- ONLY extract entities that are EXPLICITLY MENTIONED in the article text above
- Do NOT use your own knowledge about the artist's past endorsements, brand deals, or history
- Do NOT list brands/products that are NOT written in the articles
- If an article is about chart performance, awards, or music releases, there may be NO commercial entities — return []
- Only extract entities that represent a CURRENT or UPCOMING commercial connection (event attendance, new endorsement, product launch, collaboration)
- Do NOT extract the artist name itself or their agency/label
- Do NOT extract generic music industry terms (album, concert, chart, Billboard, etc.)
- Do NOT extract TV show names unless the artist is appearing as a guest/model (regular music show stages don't count)
- Assign confidence 0.0-1.0 based on how clearly the entity is linked to the artist IN THE ARTICLE
- Categorize each as: brand, product, place, food, fashion, beauty, or media
- Maximum 5 keywords per batch — pick the most commercially relevant ones
- IMPORTANT: Always use the ENGLISH name of the entity as the keyword (e.g. "Netflix" not "넷플릭스", "Lollapalooza" not "롤라팔루자")
- If the entity is originally Korean, romanize it (e.g. "Mexicana Chicken" not "멕시카나치킨")
- For each keyword, also provide translations: keyword_ko (Korean), keyword_ja (Japanese), keyword_zh (Chinese simplified)
- If the entity is already well-known in that language, use the commonly used name (e.g. keyword: "Chanel", keyword_ko: "샤넬", keyword_ja: "シャネル", keyword_zh: "香奈儿")

- For each keyword, also include "source_article_index": the 1-based article number from the list above that MOST directly mentions this entity. If multiple articles mention it, pick the most relevant one.
- For each keyword, also provide translated context: "context_ko" (Korean), "context_ja" (Japanese), "context_zh" (Chinese simplified). The context should be a brief explanation of WHY this entity is trending, translated naturally.

Return ONLY a JSON array. If no commercial entities found in the articles, return [].
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
          { role: "system", content: "You are a trend analysis expert. Extract commercial entities ONLY from the provided article texts. Never use external knowledge about the artist's endorsement history. If articles are about music charts or awards with no commercial entities, return []. Return ONLY valid JSON arrays." },
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

    // JSON 추출 (코드블록 안에 있을 수 있음)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed.filter(
      (k) => k.keyword && k.category && typeof k.confidence === "number"
    );
  } catch (e) {
    console.warn(`[trend-detect] Extraction error: ${e.message}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { wikiEntryId, artistName, starId, batchSize = 5, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 단일 아티스트 모드
    if (wikiEntryId && artistName) {
      const result = await detectForArtist(sb, perplexityKey, wikiEntryId, artistName, starId);
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 배치 모드: Tier 1 아티스트 순회
    const { data: tier1 } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name")
      .eq("tier", 1)
      .order("wiki_entry_id", { ascending: true });

    const uniqueIds = [...new Set((tier1 || []).map((t: any) => t.wiki_entry_id).filter(Boolean))];
    const batch = uniqueIds.slice(batchOffset, batchOffset + batchSize);

    if (!batch.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in batch", batchOffset, totalCandidates: uniqueIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 아티스트 이름 매핑
    const nameMap = new Map<string, string>();
    for (const t of tier1 || []) {
      if (t?.wiki_entry_id && t?.display_name) nameMap.set(t.wiki_entry_id, t.display_name);
    }

    // star_id 매핑
    const { data: starData } = await sb
      .from("ktrenz_stars")
      .select("id, wiki_entry_id")
      .in("wiki_entry_id", batch);
    const starMap = new Map<string, string>();
    for (const s of starData || []) {
      if (s.wiki_entry_id) starMap.set(s.wiki_entry_id, s.id);
    }

    console.log(`[trend-detect] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} artists`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const entryId of batch) {
      try {
        const name = nameMap.get(entryId) || "Unknown";
        const sid = starMap.get(entryId) || null;
        const result = await detectForArtist(sb, perplexityKey, entryId, name, sid);
        successCount++;
        totalKeywords += result.keywordsFound;
        console.log(`[trend-detect] ✓ ${name}: ${result.keywordsFound} keywords`);

        // Rate limit 방지
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[trend-detect] ✗ ${entryId}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        batchSize,
        processed: batch.length,
        totalCandidates: uniqueIds.length,
        successCount,
        totalKeywords,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-detect] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function detectForArtist(
  sb: any,
  perplexityKey: string,
  wikiEntryId: string,
  artistName: string,
  starId?: string | null
): Promise<{ keywordsFound: number; keywords: ExtractedKeyword[] }> {
  // 최근 24시간 naver_news 스냅샷 가져오기
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots } = await sb
    .from("ktrenz_data_snapshots")
    .select("metrics, raw_response")
    .eq("wiki_entry_id", wikiEntryId)
    .eq("platform", "naver_news")
    .gte("collected_at", cutoff)
    .order("collected_at", { ascending: false })
    .limit(1);

  const snap = snapshots?.[0];
  if (!snap) {
    return { keywordsFound: 0, keywords: [] };
  }

  // 뉴스 기사 목록 추출 (다양한 raw_response 구조 지원)
  const articles: { title: string; description?: string; url?: string }[] = [];
  const rawItems = snap.raw_response?.items || snap.raw_response?.articles || snap.raw_response?.top_items || [];
  for (const item of rawItems) {
    articles.push({
      title: (item.title || "").replace(/<[^>]*>/g, ""),
      description: (item.description || "").replace(/<[^>]*>/g, ""),
      url: item.link || item.url || "",
    });
  }

  // 메타데이터의 top_articles / top_items도 확인
  const topItems = snap.metrics?.top_articles || snap.metrics?.top_items || [];
  for (const item of topItems) {
    if (!articles.find((a) => a.title === item.title)) {
      articles.push({
        title: (item.title || "").replace(/<[^>]*>/g, ""),
        description: (item.description || "").replace(/<[^>]*>/g, ""),
        url: item.url || item.link || "",
      });
    }
  }

  if (!articles.length) {
    return { keywordsFound: 0, keywords: [] };
  }

  // AI로 상업 키워드 추출
  const keywords = await extractCommercialKeywords(perplexityKey, artistName, articles);

  if (!keywords.length) {
    return { keywordsFound: 0, keywords: [] };
  }

  // 중복 방지: 같은 아티스트+키워드가 최근 7일 이내 이미 감지되었는지 확인
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from("ktrenz_trend_triggers")
    .select("keyword")
    .eq("wiki_entry_id", wikiEntryId)
    .gte("detected_at", weekAgo);

  const existingKeywords = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
  const newKeywords = keywords.filter((k) => !existingKeywords.has(k.keyword.toLowerCase()));

  if (newKeywords.length > 0) {
    // Fetch OG images for source articles in parallel (best-effort)
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

    const uniqueUrls = [...new Set(sourceArticles.map(a => a?.url).filter(Boolean))] as string[];
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
        wiki_entry_id: wikiEntryId,
        star_id: starId || null,
        trigger_type: "news_mention",
        trigger_source: "naver_news",
        artist_name: artistName,
        keyword: k.keyword,
        keyword_ko: k.keyword_ko || null,
        keyword_ja: k.keyword_ja || null,
        keyword_zh: k.keyword_zh || null,
        keyword_category: k.category,
        context: k.context,
        confidence: k.confidence,
        source_url: sourceUrl,
        source_title: sourceArticle?.title || null,
        source_image_url: sourceUrl ? ogImageMap.get(sourceUrl) || null : null,
        status: "active",
        metadata: { article_count: articles.length },
      };
    });

    await sb.from("ktrenz_trend_triggers").insert(rows);
    console.log(`[trend-detect] ${artistName}: inserted ${newKeywords.length} new keywords (${newKeywords.map((k) => k.keyword).join(", ")})`);
  }

  return { keywordsFound: newKeywords.length, keywords: newKeywords };
}
