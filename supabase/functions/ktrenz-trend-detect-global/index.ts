// T2 Trend Detect Global: Perplexity + Firecrawl로 글로벌 뉴스에서 상업 키워드 추출
// 기존 detect(네이버 뉴스)와 별도 단계로 실행
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
  source_url?: string;
  source_title?: string;
}

// ── Firecrawl: 주요 글로벌 매체에서 아티스트 관련 기사 크롤링 ──
async function crawlGlobalMedia(
  firecrawlKey: string,
  artistName: string
): Promise<{ title: string; description?: string; url?: string }[]> {
  const articles: { title: string; description?: string; url?: string }[] = [];

  // 주요 K-pop 글로벌 매체 검색
  const sources = [
    `site:soompi.com ${artistName}`,
    `site:allkpop.com ${artistName}`,
    `site:koreaboo.com ${artistName}`,
  ];

  for (const query of sources) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          limit: 5,
          tbs: "qdr:d", // 최근 24시간
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[detect-global] Firecrawl search error for "${query}": ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const results = data.data || [];

      for (const item of results) {
        articles.push({
          title: item.title || "",
          description: item.description || item.markdown?.slice(0, 300) || "",
          url: item.url || "",
        });
      }

      // Rate limit 방지
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.warn(`[detect-global] Firecrawl error for "${query}": ${e.message}`);
    }
  }

  return articles;
}

// ── Perplexity: 글로벌 뉴스/SNS에서 상업 트렌드 직접 감지 ──
async function detectGlobalTrends(
  perplexityKey: string,
  artistName: string
): Promise<ExtractedKeyword[]> {
  const prompt = `Search for VERY RECENT global news and social media posts (last 24 hours) about K-pop artist "${artistName}" and identify any commercial entities they are currently associated with.

Look for:
- Brand collaborations, endorsements, ambassador roles
- Products they were seen wearing, using, or promoting
- Restaurants, cafes, or places they visited
- Fashion items or beauty products featured in their recent appearances
- Media appearances (TV shows, interviews, variety shows)

STRICT Rules:
- Only include entities from VERY RECENT news (last 24 hours)
- Each entity must have a clear, direct connection to the artist
- Do NOT include the artist name itself, their agency/label, or generic music terms
- Assign confidence 0.0-1.0 based on how clearly the entity is linked
- Categorize as: brand, product, place, food, fashion, beauty, or media
- Maximum 5 keywords
- Use ENGLISH names for keywords
- Provide translations: keyword_ko, keyword_ja, keyword_zh
- Provide translated context: context_ko, context_ja, context_zh
- Include source_url and source_title if available from your search

Return ONLY a JSON array. If no commercial entities found, return [].
Example: [{"keyword":"Dior","keyword_ko":"디올","keyword_ja":"ディオール","keyword_zh":"迪奥","category":"fashion","confidence":0.95,"context":"appointed as global ambassador for Dior Beauty","context_ko":"디올 뷰티 글로벌 앰배서더로 발탁","context_ja":"ディオール ビューティーのグローバルアンバサダーに任命","context_zh":"被任命为迪奥美妆全球大使","source_url":"https://example.com/article","source_title":"Artist Named Dior Ambassador"}]`;

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
          {
            role: "system",
            content: "You are a trend analysis expert specializing in K-pop industry commercial trends. Search for the most recent global news and extract commercial entities. Return ONLY valid JSON arrays.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        search_recency_filter: "day",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[detect-global] Perplexity global search error: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed.filter((k) => k.keyword && k.category && typeof k.confidence === "number");
  } catch (e) {
    console.warn(`[detect-global] Perplexity extraction error: ${e.message}`);
    return [];
  }
}

// ── Firecrawl 기사에서 키워드 추출 (Perplexity 활용) ──
async function extractFromCrawledArticles(
  perplexityKey: string,
  artistName: string,
  articles: { title: string; description?: string; url?: string }[]
): Promise<ExtractedKeyword[]> {
  if (!articles.length) return [];

  const articleTexts = articles
    .slice(0, 10)
    .map((a, i) => `[${i + 1}] ${a.title}${a.description ? ` - ${a.description}` : ""}${a.url ? ` (${a.url})` : ""}`)
    .join("\n");

  const prompt = `Analyze these recent GLOBAL news articles about K-pop artist "${artistName}" and extract commercial entities.

Articles:
${articleTexts}

STRICT Rules:
- ONLY extract entities that are EXPLICITLY MENTIONED in the article text above
- Do NOT use your own knowledge about the artist's past endorsements
- Only extract entities representing CURRENT commercial connections
- Do NOT extract the artist name, agency/label, or generic music terms
- Categorize as: brand, product, place, food, fashion, beauty, or media
- Maximum 5 keywords — pick the most commercially relevant
- Use ENGLISH names for keywords
- Provide translations: keyword_ko, keyword_ja, keyword_zh
- Provide translated context: context_ko, context_ja, context_zh
- Include source_url (from the article URL) and source_title
- Assign confidence 0.0-1.0

Return ONLY a JSON array. If no commercial entities found, return [].`;

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
          {
            role: "system",
            content: "Extract commercial entities ONLY from the provided article texts. Never use external knowledge. Return ONLY valid JSON arrays.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed.filter((k) => k.keyword && k.category && typeof k.confidence === "number");
  } catch (e) {
    console.warn(`[detect-global] Crawl extraction error: ${e.message}`);
    return [];
  }
}

// ── OG Image 가져오기 ──
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
    const match =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

// ── 메인 핸들러 ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { batchSize = 5, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tier 1 아티스트 가져오기
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

    // 이름 매핑
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

    console.log(`[detect-global] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} artists`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const entryId of batch) {
      try {
        const name = nameMap.get(entryId) || "Unknown";
        const sid = starMap.get(entryId) || null;

        // 1) Perplexity 글로벌 트렌드 직접 감지
        const perplexityKeywords = await detectGlobalTrends(perplexityKey, name);
        console.log(`[detect-global] ${name}: Perplexity found ${perplexityKeywords.length} keywords`);

        // 2) Firecrawl로 글로벌 매체 크롤링 + 키워드 추출
        let crawlKeywords: ExtractedKeyword[] = [];
        if (firecrawlKey) {
          const crawledArticles = await crawlGlobalMedia(firecrawlKey, name);
          console.log(`[detect-global] ${name}: Firecrawl found ${crawledArticles.length} articles`);

          if (crawledArticles.length > 0) {
            crawlKeywords = await extractFromCrawledArticles(perplexityKey, name, crawledArticles);
            console.log(`[detect-global] ${name}: Firecrawl extracted ${crawlKeywords.length} keywords`);
          }
        }

        // 3) 결과 병합 (중복 제거)
        const allKeywords = [...perplexityKeywords];
        const existingKwSet = new Set(perplexityKeywords.map((k) => k.keyword.toLowerCase()));
        for (const ck of crawlKeywords) {
          if (!existingKwSet.has(ck.keyword.toLowerCase())) {
            allKeywords.push(ck);
            existingKwSet.add(ck.keyword.toLowerCase());
          }
        }

        if (!allKeywords.length) {
          successCount++;
          console.log(`[detect-global] ${name}: No global keywords found`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // 4) DB 중복 확인 (7일 이내 동일 키워드)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("keyword")
          .eq("wiki_entry_id", entryId)
          .gte("detected_at", weekAgo);

        const existingDbKeywords = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
        const newKeywords = allKeywords.filter((k) => !existingDbKeywords.has(k.keyword.toLowerCase()));

        if (newKeywords.length > 0) {
          // OG image 수집
          const uniqueUrls = [...new Set(newKeywords.map((k) => k.source_url).filter(Boolean))] as string[];
          const ogImageMap = new Map<string, string | null>();
          await Promise.allSettled(
            uniqueUrls.map(async (url) => {
              ogImageMap.set(url, await fetchOgImage(url));
            })
          );

          const rows = newKeywords.map((k) => ({
            wiki_entry_id: entryId,
            star_id: sid || null,
            trigger_type: "news_mention",
            trigger_source: "global_news",
            artist_name: name,
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
            source_url: k.source_url || null,
            source_title: k.source_title || null,
            source_image_url: k.source_url ? ogImageMap.get(k.source_url) || null : null,
            status: "active",
            metadata: { source: "global_detect", perplexity_count: perplexityKeywords.length, firecrawl_count: crawlKeywords.length },
          }));

          await sb.from("ktrenz_trend_triggers").insert(rows);
          console.log(`[detect-global] ${name}: inserted ${newKeywords.length} new keywords (${newKeywords.map((k) => k.keyword).join(", ")})`);
        }

        successCount++;
        totalKeywords += newKeywords.length;

        // Rate limit 방지
        await new Promise((r) => setTimeout(r, 3000));
      } catch (e) {
        console.error(`[detect-global] ✗ ${entryId}: ${e.message}`);
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
    console.error("[detect-global] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
