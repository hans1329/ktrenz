// T2 Trend Detect Global v7: Firecrawl 감지 + 네이버 실측 baseline
// 감지 시점에 네이버 뉴스/블로그 검색으로 실제 buzz score를 baseline으로 설정
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// 이미지 수집 불가 도메인
const SOURCE_IMAGE_BLACKLIST = [
  "ddaily.co.kr",
  "fbcdn.net",
  "cdninstagram.com",
  "scontent.",
];

// URL 정규화: HTML 엔티티 디코딩
function sanitizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/&amp;/g, "&");
}

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
  source_url?: string;
  source_title?: string;
  commercial_intent?: "ad" | "sponsorship" | "collaboration" | "organic" | "rumor";
  brand_intent?: "awareness" | "conversion" | "association" | "loyalty";
  fan_sentiment?: "positive" | "negative" | "neutral" | "mixed";
  trend_potential?: number;
  detection_source?: string;
}

// 플랫폼/미디어/아티스트명 등 제외할 키워드 (강화)
const NOISE_BLACKLIST = new Set([
  // 플랫폼
  "youtube", "spotify", "tiktok", "instagram", "twitter", "x", "facebook",
  "apple music", "melon", "genie", "bugs", "flo", "vibe", "soundcloud",
  "weverse", "vlive", "bubble", "universe", "phoning", "lysn",
  "naver", "google", "daum", "kakao", "netflix", "hulu", "disney+", "amazon",
  "pinterest", "snapchat", "threads", "whatsapp", "telegram", "discord",
  // 차트/미디어
  "billboard", "hanteo", "gaon", "circle chart", "oricon",
  "mnet", "kbs", "sbs", "mbc", "jtbc", "tvn", "kcon",
  "reddit", "allkpop", "soompi", "koreaboo",
  // 일반 노이즈 (음악 이벤트 키워드는 제거 — music 카테고리로 감지)
  "kpop", "k-pop", "korean", "korea", "seoul",
  "music video", "mv", "teaser", "fan", "fandom",
  "idol", "ep", "single", "tracklist", "photocard",
  "merch", "merchandise", "lightstick", "official", "channel",
  // 엔터사
  "hybe", "sm entertainment", "yg entertainment", "jyp entertainment",
  "starship entertainment", "pledis", "cube entertainment", "fnc entertainment",
  "bighit", "big hit", "kakao entertainment", "cj enm",
  // 기타 일반어
  "fashion", "beauty", "music", "dance", "video", "photo", "live",
  "news", "article", "interview", "performance", "stage", "award",
]);

// ── Firecrawl — Reddit/TikTok 검색 (주력) ──
async function detectViaFirecrawl(
  apiKey: string,
  artistName: string,
  groupName: string | null,
  openaiKey: string
): Promise<ExtractedKeyword[]> {
  if (!apiKey || !openaiKey) return [];

  try {
    // 더 넓은 검색 쿼리 — 상업적 키워드뿐 아니라 브랜드/패션/뷰티 연관 전반
    const searchQuery = groupName
      ? `"${artistName}" "${groupName}" brand OR fashion OR beauty OR wearing OR ambassador OR campaign OR collection 2026`
      : `"${artistName}" kpop brand OR fashion OR beauty OR wearing OR ambassador OR campaign OR collection 2026`;

    const fcController = new AbortController();
    const fcTimeout = setTimeout(() => fcController.abort(), 15000);
    const fcResponse = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 8,
        lang: "en",
        tbs: "qdr:m",
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal: fcController.signal,
    });
    clearTimeout(fcTimeout);

    if (!fcResponse.ok) {
      const errText = await fcResponse.text();
      console.warn(`[detect-global] Firecrawl error: ${errText.slice(0, 100)}`);
      return [];
    }

    const fcData = await fcResponse.json();
    const results = fcData.data || [];
    console.log(`[detect-global] Firecrawl "${artistName}": ${results.length} results, success=${fcData.success}`);
    if (!results.length) {
      console.warn(`[detect-global] Firecrawl returned 0 results for "${artistName}". Raw keys: ${Object.keys(fcData).join(",")}`);
      return [];
    }

    const searchContent = results
      .map((r: any) => {
        const md = (r.markdown || "").slice(0, 800);
        const title = r.title || "";
        return `[${title}]\n${md}`;
      })
      .join("\n---\n")
      .slice(0, 4000);

    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 20000);
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Extract commercial entities AND music events mentioned in articles/discussions about a K-pop artist.

RULES:
- Extract named commercial brands, products, places, restaurants, fashion brands, beauty brands the artist is linked to
- Include: brand ambassador deals, airport fashion items, products seen in content, endorsed products, CF deals
- ALSO extract MUSIC EVENTS: named album/single titles, named tours/concerts, comeback announcements with specific release names
  - Use category "music" for these. Generic terms like "comeback" or "album" alone are NOT valid — must be a SPECIFIC named release/event.
- Do NOT include: artist names, group names, agency names
- Do NOT include: platform names (YouTube, Netflix, Spotify, TikTok, Instagram, etc.)
- Do NOT include: generic terms (fashion, beauty, music, dance, etc.)
- Do NOT include: chart names, show names, award names
- COMPOUND NAMES: Keep multi-word brand names together (e.g. "Louis Vuitton" not "Vuitton")
- Maximum 7 keywords, minimum confidence 0.5
- Provide keyword (English), keyword_ko (Korean translation), keyword_ja (Japanese), keyword_zh (Chinese)
- Provide context (English sentence about the association) and context_ko, context_ja, context_zh
- category: brand | product | place | food | fashion | beauty | music
- commercial_intent: ad | sponsorship | collaboration | organic | rumor (use "organic" for music events)
- brand_intent: awareness | conversion | association | loyalty
- fan_sentiment: positive | negative | neutral | mixed
- trend_potential: 0-100 (comebacks/new albums should be 80+)

Return ONLY a JSON object: { "keywords": [...] }. If nothing found, return { "keywords": [] }.`,
          },
          {
            role: "user",
            content: `Artist: ${artistName}${groupName ? ` (member of ${groupName})` : ""}\n\nFan community content:\n${searchContent}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: aiController.signal,
    });
    clearTimeout(aiTimeout);

    if (!aiResponse.ok) {
      console.warn(`[detect-global] OpenAI error for ${artistName}: ${aiResponse.status}`);
      return [];
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    console.log(`[detect-global] AI raw for ${artistName}: ${aiContent.slice(0, 300)}`);

    let parsed: ExtractedKeyword[];
    try {
      const obj = JSON.parse(aiContent);
      parsed = Array.isArray(obj)
        ? obj
        : (obj.keywords || obj.entities || obj.results || obj.data || obj.commercial_entities || obj.items || []);
    } catch {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(parsed)) parsed = [];
    console.log(`[detect-global] AI parsed ${artistName}: ${parsed.length} keywords before filter`);

    parsed = parsed.map((k: any) => ({
      ...k,
      keyword: k.keyword || k.keyword_en || k.name || "",
      category: k.category || "brand",
    }));

    // 소스 URL/타이틀 추가
    const firstResult = results[0];
    return parsed
      .filter((k) => {
        if (!k.keyword) { console.log(`[detect-global] FILTER: empty keyword`); return false; }
        if (typeof k.confidence === "number" && k.confidence < 0.5) { console.log(`[detect-global] FILTER: low confidence ${k.keyword}=${k.confidence}`); return false; }
        const kwLower = k.keyword.toLowerCase();
        if (NOISE_BLACKLIST.has(kwLower)) { console.log(`[detect-global] FILTER: blacklist "${k.keyword}"`); return false; }
        if (k.keyword.length <= 2) { console.log(`[detect-global] FILTER: too short "${k.keyword}"`); return false; }
        if (kwLower === artistName.toLowerCase()) { console.log(`[detect-global] FILTER: artist name "${k.keyword}"`); return false; }
        if (groupName && kwLower === groupName.toLowerCase()) { console.log(`[detect-global] FILTER: group name "${k.keyword}"`); return false; }
        return true;
      })
      .map((k) => ({
        ...k,
        confidence: k.confidence || 0.7,
        detection_source: "firecrawl",
        source_url: k.source_url || firstResult?.url || null,
        source_title: k.source_title || firstResult?.title || null,
      }));
  } catch (e) {
    console.warn(`[detect-global] Firecrawl error for ${artistName}: ${(e as Error).message}`);
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
    return sanitizeImageUrl(match?.[1] || null);
  } catch {
    return null;
  }
}

// ── 메인 핸들러 ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const COLLECTION_PAUSED = false;

  try {
    const body = await req.json().catch(() => ({}));
    const { batchSize = 5, batchOffset = 0 } = body;

    if (COLLECTION_PAUSED) {
      return new Response(
        JSON.stringify({ success: true, paused: true, batchOffset, batchSize, message: "Paused" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // ktrenz_stars에서 active 아티스트 가져오기 (wiki_entry_id 필터 제거 — 모든 스타 대상)
    const { data: stars } = await sb
      .from("ktrenz_stars")
      .select("id, wiki_entry_id, display_name, star_type, group_star_id, star_category")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"])
      .order("display_name", { ascending: true });

    // 그룹 정보 일괄 조회 (display_name + wiki_entry_id)
    const groupStarIds = [...new Set((stars || []).map((s: any) => s.group_star_id).filter(Boolean))];
    const groupInfoMap = new Map<string, { displayName: string; wikiEntryId: string | null }>();
    if (groupStarIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, wiki_entry_id")
        .in("id", groupStarIds);
      for (const g of (groups || [])) {
        groupInfoMap.set(g.id, { displayName: g.display_name, wikiEntryId: g.wiki_entry_id });
      }
    }

    // star_id 기준으로 배치 구성 (wiki_entry_id 없어도 포함)
    interface StarCandidate {
      starId: string;
      displayName: string;
      groupName: string | null;
      wikiEntryId: string | null;
      starCategory: string;
    }
    const allCandidates: StarCandidate[] = [];
    for (const s of (stars || [])) {
      const groupInfo = s.group_star_id ? groupInfoMap.get(s.group_star_id) : null;
      const gName = groupInfo?.displayName || null;
      // wiki_entry_id: 자기 것 우선, 없으면 그룹 것 사용
      const resolvedWikiEntryId = s.wiki_entry_id || groupInfo?.wikiEntryId || null;
      allCandidates.push({
        starId: s.id,
        displayName: s.display_name,
        groupName: gName,
        wikiEntryId: resolvedWikiEntryId,
        starCategory: s.star_category || "kpop",
      });
    }

    const batch = allCandidates.slice(batchOffset, batchOffset + batchSize);

    if (!batch.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in batch", batchOffset, totalCandidates: allCandidates.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[detect-global] v6 batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} stars (all active, Firecrawl only)`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const candidate of batch) {
      try {
        const { starId, displayName: name, groupName: gName, wikiEntryId, starCategory } = candidate;

        // Firecrawl 단독 실행
        const keywords = await detectViaFirecrawl(firecrawlKey, name, gName, openaiKey);

        // 중복 키워드 제거 (같은 아티스트 내)
        const seen = new Set<string>();
        const deduped = keywords.filter((k) => {
          const key = k.keyword.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 5);

        console.log(`[detect-global] ${gName ? `${gName}/` : ""}${name}: fc=${deduped.length}`);

        if (!deduped.length) {
          successCount++;
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        // OG Image 수집
        const uniqueUrls = [...new Set(deduped.map((k) => k.source_url).filter(Boolean))] as string[];
        const ogImageMap = new Map<string, string | null>();
        await Promise.allSettled(
          uniqueUrls
            .filter(url => !SOURCE_IMAGE_BLACKLIST.some(d => url.includes(d)))
            .map(async (url) => ogImageMap.set(url, await fetchOgImage(url)))
        );

        const candidateRows = deduped.map((k) => ({
          row: {
            wiki_entry_id: wikiEntryId || null,
            star_id: starId || null,
            trigger_type: "news_mention",
            trigger_source: "global_news",
            artist_name: name,
            keyword: k.keyword,
            keyword_en: k.keyword_en || k.keyword,
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
            source_image_url: sanitizeImageUrl(k.source_url ? ogImageMap.get(k.source_url) || null : null),
            commercial_intent: k.commercial_intent || null,
            brand_intent: k.brand_intent || null,
            fan_sentiment: k.fan_sentiment || null,
            trend_potential: k.trend_potential ?? null,
            // baseline은 0으로 초기화 → 추적(track) 시 네이버 기반 실측값으로 설정
            baseline_score: 0,
            status: "pending",
            metadata: { source: "global_detect_v6", detection_source: k.detection_source },
          },
        }));

        // 3일 내 중복 체크 (star_id 기준, 없으면 wiki_entry_id)
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        let existingQuery = sb
          .from("ktrenz_trend_triggers")
          .select("id, keyword, keyword_en, keyword_ko, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
          .gte("detected_at", threeDaysAgo);
        if (starId) {
          existingQuery = existingQuery.eq("star_id", starId);
        } else if (wikiEntryId) {
          existingQuery = existingQuery.eq("wiki_entry_id", wikiEntryId);
        } else {
          existingQuery = existingQuery.eq("artist_name", name);
        }
        const { data: existing } = await existingQuery;

        const existingByKeyword = new Map<string, any>();
        for (const e of (existing || [])) {
          existingByKeyword.set((e.keyword || "").toLowerCase(), e);
          if (e.keyword_en) existingByKeyword.set(e.keyword_en.toLowerCase(), e);
          if (e.keyword_ko) existingByKeyword.set(e.keyword_ko.toLowerCase(), e);
        }

        // 크로스 아티스트 중복 제거
        const allKwTexts = deduped.flatMap((k) => [k.keyword, k.keyword_en || k.keyword].filter(Boolean));
        let crossQuery = sb
          .from("ktrenz_trend_triggers")
          .select("keyword, keyword_en")
          .gte("detected_at", threeDaysAgo)
          .in("keyword", allKwTexts);
        if (starId) {
          crossQuery = crossQuery.neq("star_id", starId);
        } else if (wikiEntryId) {
          crossQuery = crossQuery.neq("wiki_entry_id", wikiEntryId);
        } else {
          crossQuery = crossQuery.neq("artist_name", name);
        }
        const { data: crossExisting } = await crossQuery;

        const crossSet = new Set<string>();
        for (const e of (crossExisting || [])) {
          crossSet.add((e.keyword || "").toLowerCase());
          if (e.keyword_en) crossSet.add(e.keyword_en.toLowerCase());
        }

        const rowsToInsert: any[] = [];
        const backfillPromises: PromiseLike<unknown>[] = [];
        const batchInsertedKeys = new Set<string>();

        for (const candidate of candidateRows) {
          const kwLower = candidate.row.keyword.toLowerCase();
          const kwEnLower = (candidate.row.keyword_en || "").toLowerCase();

          if (crossSet.has(kwLower) || crossSet.has(kwEnLower)) {
            console.warn(`[detect-global] Cross-artist duplicate: "${candidate.row.keyword}"`);
            continue;
          }

          const current = existingByKeyword.get(kwLower) || existingByKeyword.get(kwEnLower);

          if (!current) {
            if (batchInsertedKeys.has(kwLower) || batchInsertedKeys.has(kwEnLower)) continue;
            batchInsertedKeys.add(kwLower);
            batchInsertedKeys.add(kwEnLower);
            rowsToInsert.push(candidate.row);
            continue;
          }

          // 백필
          const patch: Record<string, unknown> = {};
          const fields = ["keyword_ko", "keyword_ja", "keyword_zh", "context", "context_ko", "context_ja", "context_zh", "source_url", "source_title", "source_image_url"] as const;
          for (const field of fields) {
            const cv = (current as Record<string, any>)[field];
            const nv = (candidate.row as Record<string, any>)[field];
            if ((cv == null || cv === "") && nv) patch[field] = nv;
          }

          if (Object.keys(patch).length > 0) {
            backfillPromises.push(sb.from("ktrenz_trend_triggers").update(patch).eq("id", current.id));
          }
        }

        if (rowsToInsert.length > 0) {
          const { data: inserted } = await sb.from("ktrenz_trend_triggers").insert(rowsToInsert).select("id");
          console.log(`[detect-global] ${name}: inserted ${rowsToInsert.length} (${rowsToInsert.map((k: any) => k.keyword).join(", ")})`);

          if (inserted?.length) {
            fetch(`${supabaseUrl}/functions/v1/ktrenz-cache-image`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ triggerIds: inserted.map((r: any) => r.id) }),
            }).catch(() => {});
          }
        }

        if (backfillPromises.length > 0) {
          await Promise.allSettled(backfillPromises);
          console.log(`[detect-global] ${name}: backfilled ${backfillPromises.length}`);
        }

        successCount++;
        totalKeywords += rowsToInsert.length;

        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[detect-global] ✗ ${candidate.displayName} (${candidate.starId}): ${(e as Error).message}`);
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
    console.error("[detect-global] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
