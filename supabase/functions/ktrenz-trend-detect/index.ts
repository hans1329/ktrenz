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
  category: "brand" | "product" | "place" | "food" | "fashion" | "beauty" | "media";
  confidence: number;
  context: string;
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

  const prompt = `Analyze these recent Korean news articles about K-pop artist "${artistName}" and extract any commercial entities (brands, products, places, foods, fashion items, beauty products, media appearances) that are mentioned IN RELATION TO the artist.

Articles:
${articleTexts}

Rules:
- Only extract entities that are DIRECTLY associated with the artist (worn by, endorsed, visited, collaborated with, etc.)
- Do NOT extract the artist name itself or their agency/label
- Do NOT extract generic music industry terms (album, concert, chart, etc.)
- Assign confidence 0.0-1.0 based on how clearly the entity is linked to the artist
- Categorize each as: brand, product, place, food, fashion, beauty, or media

Return ONLY a JSON array. If no commercial entities found, return [].
Example: [{"keyword":"Chanel","category":"fashion","confidence":0.9,"context":"wore Chanel outfit at airport"}]`;

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
          { role: "system", content: "You are a trend analysis expert that extracts commercial entities from K-pop news. Return ONLY valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
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
      .select("wiki_entry_id, name_en")
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
      if (t?.wiki_entry_id && t?.name_en) nameMap.set(t.wiki_entry_id, t.name_en);
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

  // 뉴스 기사 목록 추출
  const articles: { title: string; description?: string; url?: string }[] = [];
  const rawItems = snap.raw_response?.items || snap.raw_response?.articles || [];
  for (const item of rawItems) {
    articles.push({
      title: (item.title || "").replace(/<[^>]*>/g, ""),
      description: (item.description || "").replace(/<[^>]*>/g, ""),
      url: item.link || item.url || "",
    });
  }

  // 메타데이터의 top_articles도 확인
  const topArticles = snap.metrics?.top_articles || [];
  for (const item of topArticles) {
    if (!articles.find((a) => a.title === item.title)) {
      articles.push({
        title: item.title || "",
        description: item.description || "",
        url: item.url || "",
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
    const rows = newKeywords.map((k) => ({
      wiki_entry_id: wikiEntryId,
      star_id: starId || null,
      trigger_type: "news_mention",
      trigger_source: "naver_news",
      artist_name: artistName,
      keyword: k.keyword,
      keyword_category: k.category,
      context: k.context,
      confidence: k.confidence,
      source_url: articles[0]?.url || null,
      source_title: articles[0]?.title || null,
      status: "active",
      metadata: { article_count: articles.length },
    }));

    await sb.from("ktrenz_trend_triggers").insert(rows);
    console.log(`[trend-detect] ${artistName}: inserted ${newKeywords.length} new keywords (${newKeywords.map((k) => k.keyword).join(", ")})`);
  }

  return { keywordsFound: newKeywords.length, keywords: newKeywords };
}
