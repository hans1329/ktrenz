// T2 Trend Detect Global v3: 팬 커뮤니티 기반 글로벌 상업 키워드 감지
// 소스 1: Perplexity — Reddit/Twitter/TikTok 팬 커뮤니티 검색 (뉴스 매체 제외)
// 소스 2: Firecrawl — Reddit/TikTok 보조 검색
// 소스 3: YouTube 댓글 — 이미 수집된 댓글에서 AI로 브랜드/상품 추출
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
  source_url?: string;
  source_title?: string;
  commercial_intent?: "ad" | "sponsorship" | "collaboration" | "organic" | "rumor";
  brand_intent?: "awareness" | "conversion" | "association" | "loyalty";
  fan_sentiment?: "positive" | "negative" | "neutral" | "mixed";
  trend_potential?: number;
  detection_source?: string; // "perplexity" | "firecrawl" | "yt_comments"
}

const PLATFORM_BLACKLIST = new Set([
  "youtube", "spotify", "tiktok", "instagram", "twitter", "x", "facebook",
  "apple music", "melon", "genie", "bugs", "flo", "vibe", "soundcloud",
  "weverse", "vlive", "bubble", "universe", "phoning", "lysn",
  "naver", "google", "daum", "kakao", "billboard", "hanteo", "gaon",
  "circle chart", "oricon", "mnet", "kbs", "sbs", "mbc", "jtbc", "tvn",
  "reddit", "allkpop", "soompi", "koreaboo",
]);

// 뉴스 매체 블랙리스트 — Perplexity 최대 20개 제한
const NEWS_DOMAIN_EXCLUDES = [
  "-allkpop.com", "-soompi.com", "-koreaboo.com", "-kpopstarz.com",
  "-hellokpop.com", "-kpopmap.com",
  "-billboard.com", "-variety.com", "-rollingstone.com",
  "-naver.com", "-daum.net", "-chosun.com",
  "-donga.com", "-yna.co.kr", "-yonhapnews.co.kr",
  "-news1.kr", "-newsis.com", "-theqoo.net", "-dcinside.com",
  "-nme.com",
];

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    kpop: "K-pop",
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

// ── 공통 AI 추출 프롬프트 ──
function buildExtractionPrompt(artistLabel: string): string {
  return `Search for VERY RECENT fan discussions and social media posts (last 48 hours) about ${artistLabel} on Reddit (r/kpop, r/bangtan, etc.), Twitter/X, and TikTok fan communities. Identify commercial entities fans are discussing in relation to this artist.

Look for fan discussions about:
- Brand collaborations, endorsements, ambassador roles fans are excited about
- Products fans noticed the artist wearing, using, or promoting
- Restaurants, cafes, or places the artist visited that fans are talking about
- Fashion items or beauty products featured in recent appearances
- Media content (TV shows, songs, albums) fans are discussing
- Fan projects related to specific commercial entities

STRICT Rules:
- Only include entities from VERY RECENT fan discussions (last 48 hours)
- Each entity must have a clear, direct connection to the artist
- Do NOT include the artist name itself, their agency/label, or generic terms
- Do NOT include platform names (YouTube, Spotify, TikTok, Instagram, Twitter/X, etc.)
- Do NOT include news outlet names (AllKPop, Soompi, Koreaboo, Billboard, etc.)
- Assign confidence 0.0-1.0 based on how widely fans are discussing it
- Categorize as: brand, product, place, food, fashion, beauty, or media
- COMPOUND NAMES: Keep multi-word brand names together ("Polo Ralph Lauren" not "Polo" and "Ralph Lauren")
- ONE ENTITY PER KEYWORD: Each keyword = one commercial entity
- Maximum 5 keywords
- Use ENGLISH names for keywords
- Provide "keyword_en", "keyword_ko", "keyword_ja", "keyword_zh"
- Provide translated context: context_ko, context_ja, context_zh
- Include source_url and source_title if available

INTENT ANALYSIS:
- "commercial_intent": "ad" | "sponsorship" | "collaboration" | "organic" | "rumor"
- "brand_intent": "awareness" | "conversion" | "association" | "loyalty"
- "fan_sentiment": "positive" | "negative" | "neutral" | "mixed"
- "trend_potential": 0.0-1.0 (higher for viral fan discussions, lower for routine)

Return ONLY a JSON array. If no commercial entities found, return [].
Example: [{"keyword":"Dior","keyword_en":"Dior","keyword_ko":"디올","keyword_ja":"ディオール","keyword_zh":"迪奥","category":"fashion","confidence":0.95,"context":"fans celebrating new Dior Beauty ambassador announcement on Reddit","context_ko":"레딧에서 디올 뷰티 앰배서더 발탁 축하 팬 반응","context_ja":"Redditでディオールビューティーアンバサダー就任をファンが祝福","context_zh":"粉丝在Reddit庆祝迪奥美妆大使任命","source_url":"https://reddit.com/r/kpop/...","source_title":"Fans react to Dior ambassador","commercial_intent":"sponsorship","brand_intent":"awareness","fan_sentiment":"positive","trend_potential":0.9}]`;
}

// ── 소스 1: Perplexity — 팬 커뮤니티 검색 ──
async function detectViaPerplexity(
  apiKey: string,
  artistName: string,
  groupName: string | null,
  starCategory: string
): Promise<ExtractedKeyword[]> {
  if (!apiKey) {
    console.warn("[detect-global] PERPLEXITY_API_KEY not set, skipping Perplexity source");
    return [];
  }

  const categoryLabel = getCategoryLabel(starCategory);
  const artistLabel = groupName
    ? `"${artistName}" (member of ${categoryLabel} group ${groupName})`
    : `${categoryLabel} celebrity "${artistName}"`;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: "You are a K-pop fan community analyst. Search ONLY fan community sources: Reddit (r/kpop, artist-specific subreddits), Twitter/X fan accounts, TikTok fan content, Tumblr, fan forums. Do NOT search news sites or press articles. Focus on what FANS are discussing, not what journalists report. Return ONLY valid JSON arrays.",
          },
          { role: "user", content: buildExtractionPrompt(artistLabel) },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        search_recency_filter: "day",
        search_domain_filter: [
          // 모든 뉴스 매체 제외 — 팬 커뮤니티 소스만 허용
          ...NEWS_DOMAIN_EXCLUDES,
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[detect-global] Perplexity error for ${artistName}: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed
      .filter((k) => {
        if (!k.keyword || !k.category || typeof k.confidence !== "number") return false;
        const kwLower = k.keyword.toLowerCase();
        if (PLATFORM_BLACKLIST.has(kwLower)) return false;
        return true;
      })
      .map((k) => ({ ...k, detection_source: "perplexity" }));
  } catch (e) {
    console.warn(`[detect-global] Perplexity error: ${(e as Error).message}`);
    return [];
  }
}

// ── 소스 2: Firecrawl — Reddit/TikTok 보조 검색 ──
async function detectViaFirecrawl(
  apiKey: string,
  artistName: string,
  groupName: string | null,
  openaiKey: string
): Promise<ExtractedKeyword[]> {
  if (!apiKey || !openaiKey) {
    console.warn("[detect-global] FIRECRAWL_API_KEY or OPENAI_API_KEY not set, skipping Firecrawl source");
    return [];
  }

  const searchName = groupName ? `${groupName} ${artistName}` : artistName;

  try {
    // Reddit + TikTok에서 최근 상업 멘션 검색
    const queries = [
      `"${searchName}" brand OR collaboration OR wearing OR sponsored site:reddit.com`,
      `"${searchName}" fashion OR beauty OR product site:tiktok.com`,
    ];

    const allResults: any[] = [];
    for (const query of queries) {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: 5, tbs: "qdr:d" }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.length) allResults.push(...data.data);
      }
    }

    if (!allResults.length) return [];

    // OpenAI로 검색 결과에서 상업 키워드 추출
    const texts = allResults.slice(0, 8).map((r: any) =>
      `[${r.title || ""}] ${(r.description || r.markdown || "").slice(0, 300)}`
    ).join("\n---\n");

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
            content: "Extract commercial entities (brands, products, places, fashion, beauty, media) mentioned in relation to a K-pop artist from fan community posts. Return ONLY a JSON array of objects with: keyword, keyword_en, keyword_ko, category, confidence, context. Max 3 keywords. If none found, return [].",
          },
          {
            role: "user",
            content: `Artist: ${searchName}\n\nFan community posts:\n${texts}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!aiResponse.ok) return [];

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed
      .filter((k) => k.keyword && k.category)
      .map((k) => ({
        ...k,
        confidence: k.confidence || 0.6,
        detection_source: "firecrawl",
        source_url: allResults[0]?.url || null,
      }));
  } catch (e) {
    console.warn(`[detect-global] Firecrawl error: ${(e as Error).message}`);
    return [];
  }
}

// ── 소스 3: YouTube 댓글에서 상업 키워드 추출 ──
async function detectViaYouTubeComments(
  sb: any,
  wikiEntryId: string,
  artistName: string,
  openaiKey: string
): Promise<ExtractedKeyword[]> {
  if (!openaiKey) return [];

  try {
    // 최근 YouTube 스냅샷에서 댓글 데이터 가져오기
    const { data: snap } = await sb
      .from("ktrenz_data_snapshots")
      .select("metrics, raw_response")
      .eq("wiki_entry_id", wikiEntryId)
      .eq("platform", "youtube")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snap) return [];

    // raw_response에서 최근 영상의 제목/설명 추출
    const videos = snap.raw_response?.recentVideos || snap.raw_response?.items || [];
    if (!videos.length) return [];

    const videoTexts = videos.slice(0, 5).map((v: any) => {
      const title = v.title || v.snippet?.title || "";
      const desc = (v.description || v.snippet?.description || "").slice(0, 200);
      return `[${title}] ${desc}`;
    }).join("\n---\n");

    if (!videoTexts.trim()) return [];

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
            content: "Extract commercial entities (brands, products, places, fashion items, beauty products, collaboration partners) from YouTube video titles and descriptions of a K-pop artist. Focus on commercial mentions, NOT the artist's own songs/albums (unless it's a brand collaboration). Return ONLY a JSON array with: keyword, keyword_en, keyword_ko, category, confidence, context. Max 3 keywords. If none found, return [].",
          },
          {
            role: "user",
            content: `Artist: ${artistName}\n\nRecent YouTube video info:\n${videoTexts}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }),
    });

    if (!aiResponse.ok) return [];

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];
    return parsed
      .filter((k) => k.keyword && k.category)
      .map((k) => ({
        ...k,
        confidence: k.confidence || 0.5,
        detection_source: "yt_comments",
      }));
  } catch (e) {
    console.warn(`[detect-global] YT comments error for ${artistName}: ${(e as Error).message}`);
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

// ── 키워드 병합 및 중복 제거 ──
function mergeKeywords(sources: ExtractedKeyword[][]): ExtractedKeyword[] {
  const merged = new Map<string, ExtractedKeyword>();

  for (const keywords of sources) {
    for (const kw of keywords) {
      const key = kw.keyword.toLowerCase();
      const existing = merged.get(key);
      if (!existing || kw.confidence > existing.confidence) {
        merged.set(key, kw);
      }
    }
  }

  // 최대 8개, confidence 순 정렬
  return [...merged.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
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
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // ktrenz_stars에서 active 아티스트 가져오기
    const { data: stars } = await sb
      .from("ktrenz_stars")
      .select("id, wiki_entry_id, display_name, star_type, group_star_id, star_category")
      .eq("is_active", true)
      .not("wiki_entry_id", "is", null)
      .order("display_name", { ascending: true });

    // 그룹 정보 일괄 조회
    const groupStarIds = [...new Set((stars || []).map((s: any) => s.group_star_id).filter(Boolean))];
    const groupNameMap = new Map<string, string>();
    if (groupStarIds.length > 0) {
      const { data: groups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name")
        .in("id", groupStarIds);
      for (const g of (groups || [])) {
        groupNameMap.set(g.id, g.display_name);
      }
    }

    // wiki_entry_id 기준 중복 제거
    const entryMap = new Map<string, { starId: string; displayName: string; groupName: string | null; starCategory: string }>();
    for (const s of (stars || [])) {
      if (s.wiki_entry_id && !entryMap.has(s.wiki_entry_id)) {
        const gName = s.group_star_id ? groupNameMap.get(s.group_star_id) || null : null;
        entryMap.set(s.wiki_entry_id, { starId: s.id, displayName: s.display_name, groupName: gName, starCategory: s.star_category || "kpop" });
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

    console.log(`[detect-global] v3 batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} artists (Perplexity+Firecrawl+YT)`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const entryId of batch) {
      try {
        const entry = entryMap.get(entryId);
        const name = entry?.displayName || "Unknown";
        const sid = entry?.starId || null;
        const gName = entry?.groupName || null;
        const category = entry?.starCategory || "kpop";

        // 3개 소스 병렬 실행
        const [perplexityKws, firecrawlKws, ytKws] = await Promise.all([
          detectViaPerplexity(perplexityKey, name, gName, category),
          detectViaFirecrawl(firecrawlKey, name, gName, openaiKey),
          detectViaYouTubeComments(sb, entryId, name, openaiKey),
        ]);

        const allKeywords = mergeKeywords([perplexityKws, firecrawlKws, ytKws]);
        const sourceCounts = `ppx=${perplexityKws.length},fc=${firecrawlKws.length},yt=${ytKws.length}`;
        console.log(`[detect-global] ${gName ? `${gName}/` : ""}${name}: ${sourceCounts} → merged=${allKeywords.length}`);

        if (!allKeywords.length) {
          successCount++;
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        // OG Image 수집
        const uniqueUrls = [...new Set(allKeywords.map((k) => k.source_url).filter(Boolean))] as string[];
        const ogImageMap = new Map<string, string | null>();
        await Promise.allSettled(
          uniqueUrls.map(async (url) => ogImageMap.set(url, await fetchOgImage(url)))
        );

        const candidateRows = allKeywords.map((k) => ({
          row: {
            wiki_entry_id: entryId,
            star_id: sid || null,
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
            source_image_url: k.source_url ? ogImageMap.get(k.source_url) || null : null,
            commercial_intent: k.commercial_intent || null,
            brand_intent: k.brand_intent || null,
            fan_sentiment: k.fan_sentiment || null,
            trend_potential: k.trend_potential ?? null,
            status: "pending",
            metadata: { source: "global_detect_v3", detection_source: k.detection_source, sources: sourceCounts },
          },
        }));

        // 3일 내 중복 체크 (keyword_en 기준으로도 체크하여 국내 중복 방지)
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("id, keyword, keyword_en, keyword_ko, keyword_ja, keyword_zh, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
          .eq("wiki_entry_id", entryId)
          .gte("detected_at", threeDaysAgo);

        // keyword AND keyword_en 기준 중복 체크 (국내 한글 키워드와도 비교)
        const existingByKeyword = new Map<string, any>();
        for (const e of (existing || [])) {
          existingByKeyword.set((e.keyword || "").toLowerCase(), e);
          if (e.keyword_en) existingByKeyword.set(e.keyword_en.toLowerCase(), e);
          if (e.keyword_ko) existingByKeyword.set(e.keyword_ko.toLowerCase(), e);
        }

        // 크로스 아티스트 중복 제거 (keyword_en 기준 추가)
        const allKwTexts = allKeywords.flatMap((k) => [k.keyword, k.keyword_en || k.keyword].filter(Boolean));
        const { data: crossExisting } = await sb
          .from("ktrenz_trend_triggers")
          .select("keyword, keyword_en")
          .neq("wiki_entry_id", entryId)
          .gte("detected_at", threeDaysAgo)
          .in("keyword", allKwTexts);

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

          // 크로스 아티스트 중복 필터
          if (crossSet.has(kwLower) || crossSet.has(kwEnLower)) {
            console.warn(`[detect-global] Cross-artist duplicate: "${candidate.row.keyword}"`);
            continue;
          }

          // 같은 아티스트 기존 키워드 체크 (한/영 모두 비교)
          const current = existingByKeyword.get(kwLower) || existingByKeyword.get(kwEnLower);

          if (!current) {
            if (batchInsertedKeys.has(kwLower) || batchInsertedKeys.has(kwEnLower)) continue;
            batchInsertedKeys.add(kwLower);
            batchInsertedKeys.add(kwEnLower);
            rowsToInsert.push(candidate.row);
            continue;
          }

          // 백필: 누락된 번역 등 채우기
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

        // Rate limit 방지 (병렬 3소스이므로 딜레이 축소)
        await new Promise((r) => setTimeout(r, 2000));
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
