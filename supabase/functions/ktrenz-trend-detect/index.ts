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
3. Do NOT extract: the artist's own name, group name, agency/label name, generic music terms (album, comeback).
4. Chart names (Billboard, Hanteo, etc.), concert/tour names, and festival names (Coachella, MAMA, etc.) CAN be extracted as context keywords IF they involve a specific commercial entity (e.g., "Coachella x Adidas collaboration" → extract "Adidas"). Do NOT extract them as standalone keywords.
5. Do NOT hallucinate or use prior knowledge about this artist's endorsements.
6. Maximum 5 keywords. Confidence 0.0-1.0 based on how clearly the text links the entity to "${memberName}".
7. Categories: brand, product, place, food, fashion, beauty, media.
8. Use the ENGLISH name as "keyword". Romanize Korean-origin names.
9. Provide translations: keyword_ko, keyword_ja, keyword_zh.
10. Include "source_article_index" (1-based) pointing to the article where the entity appears.
11. Provide translated context: context, context_ko, context_ja, context_zh. Do NOT include article reference numbers like [1], [2] etc. in the context fields. Write clean, natural sentences.

If NO commercial entities are found, return [].
Example: [{"keyword":"Chanel","keyword_ko":"샤넬","keyword_ja":"シャネル","keyword_zh":"香奈儿","category":"fashion","confidence":0.9,"context":"wore Chanel outfit at airport","context_ko":"공항에서 샤넬 의상 착용","context_ja":"空港でシャネルの衣装を着用","context_zh":"在机场穿着香奈儿服装","source_article_index":1}]`;

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
        max_tokens: 1000,
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
      
      // confidence 0.7 이상이면 후검증 스킵 (AI가 확신하는 경우)
      if (k.confidence >= 0.8) {
        console.log(`[trend-detect] High confidence (${k.confidence}), skipping text check: "${k.keyword}"`);
        return true;
      }
      
      const kwLower = k.keyword.toLowerCase();
      const kwKo = k.keyword_ko?.toLowerCase() || "";
      
      // 1) 정확 매칭
      if (allText.includes(kwLower) || (kwKo && allText.includes(kwKo))) return true;
      
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

    // 배치 모드: ktrenz_stars의 member 타입 순회
    const { data: members } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, group_star_id, star_category")
      .eq("is_active", true)
      .eq("star_type", "member")
      .order("display_name", { ascending: true });

    const allMembers = members || [];

    // group_star_id로 그룹 정보 일괄 조회
    const groupIds = [...new Set(allMembers.map((m: any) => m.group_star_id).filter(Boolean))];
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
          sb, openaiKey, naverClientId, naverClientSecret,
          {
            id: member.id,
            display_name: member.display_name,
            name_ko: member.name_ko,
            group_name: group?.display_name || null,
            group_name_ko: group?.name_ko || null,
            group_wiki_entry_id: group?.wiki_entry_id || null,
            star_category: member.star_category || "kpop",
          }
        );
        successCount++;
        totalKeywords += result.keywordsFound;
        console.log(`[trend-detect] ✓ ${member.display_name}: ${result.keywordsFound} keywords (${result.articlesFound} articles)`);

        // Rate limit 방지: Naver API + OpenAI 간 간격
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
  const { data: existing } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
    .eq("star_id", member.id)
    .gte("detected_at", threeDaysAgo)
    .in("keyword", keywords.map((k) => k.keyword));

  const existingByKeyword = new Map((existing || []).map((e: any) => [e.keyword.toLowerCase(), e]));

  // 크로스 아티스트 중복 제거
  const { data: crossExisting } = await sb
    .from("ktrenz_trend_triggers")
    .select("keyword")
    .neq("star_id", member.id)
    .gte("detected_at", threeDaysAgo)
    .in("keyword", keywords.map((k) => k.keyword));

  const crossSet = new Set((crossExisting || []).map((e: any) => e.keyword.toLowerCase()));

  const rowsToInsert: any[] = [];
  const insertedKeywords: ExtractedKeyword[] = [];
  const backfillPromises: PromiseLike<unknown>[] = [];
  const batchInsertedKeys = new Set<string>(); // 같은 배치 내 중복 방지

  for (const candidate of candidateRows) {
    const kwLower = candidate.row.keyword.toLowerCase();

    // 크로스 아티스트 중복 필터
    if (crossSet.has(kwLower)) {
      console.warn(`[trend-detect] Cross-artist duplicate filtered: "${candidate.row.keyword}"`);
      continue;
    }

    const current = existingByKeyword.get(kwLower);

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
