// T2 Trend Detect Global: Perplexity 웹 검색으로 글로벌 뉴스에서 상업 키워드 추출
// Firecrawl search 제거 (구글 검색과 SerpAPI 중복 방지)
// Perplexity는 웹 검색이 목적이므로 유지, 기사 텍스트 분석은 OpenAI 사용
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

// ── Perplexity: 글로벌 뉴스/SNS에서 상업 트렌드 직접 감지 ──
// Perplexity는 웹 검색 엔진이므로 글로벌 감지에 적합 (국내 detect의 환각 문제와 다른 용도)
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
    console.warn(`[detect-global] Perplexity extraction error: ${(e as Error).message}`);
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
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!perplexityKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PERPLEXITY_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ktrenz_stars에서 active 아티스트 가져오기 (v3_artist_tiers 제거)
    const { data: stars } = await sb
      .from("ktrenz_stars")
      .select("id, wiki_entry_id, display_name")
      .eq("is_active", true)
      .not("wiki_entry_id", "is", null)
      .order("display_name", { ascending: true });

    // wiki_entry_id 기준 중복 제거
    const entryMap = new Map<string, { starId: string; displayName: string }>();
    for (const s of (stars || [])) {
      if (s.wiki_entry_id && !entryMap.has(s.wiki_entry_id)) {
        entryMap.set(s.wiki_entry_id, { starId: s.id, displayName: s.display_name });
      }
    }

    const uniqueIds = [...entryMap.keys()];
    const batch = uniqueIds.slice(batchOffset, batchOffset + batchSize);

    if (!batch.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in batch", batchOffset, totalCandidates: uniqueIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[detect-global] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} artists (Perplexity only, no Firecrawl)`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const entryId of batch) {
      try {
        const entry = entryMap.get(entryId);
        const name = entry?.displayName || "Unknown";
        const sid = entry?.starId || null;

        // Perplexity 글로벌 트렌드 감지 (웹 검색 용도 — 의도된 사용)
        const allKeywords = await detectGlobalTrends(perplexityKey, name);
        console.log(`[detect-global] ${name}: Perplexity found ${allKeywords.length} keywords`);

        if (!allKeywords.length) {
          successCount++;
          console.log(`[detect-global] ${name}: No global keywords found`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        // OG Image 수집
        const uniqueUrls = [...new Set(allKeywords.map((k) => k.source_url).filter(Boolean))] as string[];
        const ogImageMap = new Map<string, string | null>();
        await Promise.allSettled(
          uniqueUrls.map(async (url) => {
            ogImageMap.set(url, await fetchOgImage(url));
          })
        );

        const candidateRows = allKeywords.map((k) => ({
          extractedKeyword: k,
          row: {
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
            metadata: { source: "global_detect", perplexity_count: allKeywords.length },
          },
        }));

        // 7일 내 중복 체크 + 백필
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
          .eq("wiki_entry_id", entryId)
          .gte("detected_at", weekAgo);

        const existingByKeyword = new Map((existing || []).map((e: any) => [e.keyword.toLowerCase(), e]));
        const rowsToInsert: any[] = [];
        const backfillPromises: PromiseLike<unknown>[] = [];

        for (const candidate of candidateRows) {
          const current = existingByKeyword.get(candidate.row.keyword.toLowerCase());

          if (!current) {
            rowsToInsert.push(candidate.row);
            continue;
          }

          const patch: Record<string, unknown> = {};
          const backfillFields = [
            "keyword_ko", "keyword_ja", "keyword_zh",
            "context", "context_ko", "context_ja", "context_zh",
            "source_url", "source_title", "source_image_url",
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
          await sb.from("ktrenz_trend_triggers").insert(rowsToInsert);
          console.log(`[detect-global] ${name}: inserted ${rowsToInsert.length} new keywords (${rowsToInsert.map((k: any) => k.keyword).join(", ")})`);
        }

        if (backfillPromises.length > 0) {
          await Promise.allSettled(backfillPromises);
          console.log(`[detect-global] ${name}: backfilled ${backfillPromises.length} existing keywords`);
        }

        successCount++;
        totalKeywords += rowsToInsert.length;

        // Rate limit 방지
        await new Promise((r) => setTimeout(r, 3000));
      } catch (e) {
        console.error(`[detect-global] ✗ ${entryId}: ${(e as Error).message}`);
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
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});