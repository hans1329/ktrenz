// T2 Trend Detect Global v4: Firecrawl + YouTube API 직접 호출
// 소스 1: Firecrawl — Reddit/TikTok 팬 커뮤니티 검색 (주력)
// 소스 2: YouTube Data API — 최근 영상 제목/설명에서 상업 키워드 추출
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
  detection_source?: string;
}

// 플랫폼/미디어/아티스트명 등 제외할 키워드
const NOISE_BLACKLIST = new Set([
  "youtube", "spotify", "tiktok", "instagram", "twitter", "x", "facebook",
  "apple music", "melon", "genie", "bugs", "flo", "vibe", "soundcloud",
  "weverse", "vlive", "bubble", "universe", "phoning", "lysn",
  "naver", "google", "daum", "kakao", "billboard", "hanteo", "gaon",
  "circle chart", "oricon", "mnet", "kbs", "sbs", "mbc", "jtbc", "tvn",
  "reddit", "allkpop", "soompi", "koreaboo",
  // 일반적인 노이즈
  "kpop", "k-pop", "korean", "korea", "seoul", "comeback", "album",
  "music video", "mv", "teaser", "concert", "tour", "fan", "fandom",
  "idol", "debut", "ep", "single", "tracklist", "photocard",
]);

// ── 소스 1: Firecrawl — Reddit/TikTok 검색 (주력) ──
async function detectViaFirecrawl(
  apiKey: string,
  artistName: string,
  groupName: string | null,
  openaiKey: string
): Promise<ExtractedKeyword[]> {
  if (!apiKey || !openaiKey) return [];

  const searchName = groupName ? `${groupName} ${artistName}` : artistName;

  try {
    const queries = [
      `"${searchName}" brand OR collaboration OR endorsement OR ambassador site:reddit.com`,
      `"${searchName}" wearing OR fashion OR beauty OR product site:reddit.com OR site:tiktok.com`,
    ];

    const allResults: any[] = [];
    for (const query of queries) {
      try {
        const response = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, limit: 5, tbs: "qdr:w" }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.data?.length) allResults.push(...data.data);
        } else {
          const errText = await response.text();
          console.warn(`[detect-global] Firecrawl search error: ${errText.slice(0, 150)}`);
        }
      } catch (e) {
        console.warn(`[detect-global] Firecrawl fetch error: ${(e as Error).message}`);
      }
    }

    if (!allResults.length) return [];

    const texts = allResults.slice(0, 10).map((r: any) =>
      `[${r.title || ""}] ${(r.description || r.markdown || "").slice(0, 400)}`
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
            content: `Extract commercial entities (brands, products, places, fashion items, beauty products, collaboration partners) from fan community search results about a K-pop artist.

STRICT RULES:
- Only COMMERCIAL entities with a direct connection to the artist
- Do NOT include: artist names, group names, member names, agency names (SM, YG, JYP, HYBE, etc.)
- Do NOT include: song/album titles, generic K-pop terms, platform names
- Do NOT include: generic terms like "K-beauty", "Korean makeup", "Glass Skin" unless it's a specific product name
- COMPOUND NAMES: Keep multi-word brand names together ("Polo Ralph Lauren" not split)
- ONE ENTITY PER KEYWORD
- Maximum 5 keywords, minimum confidence 0.6
- Use ENGLISH keyword names
- Provide keyword_en, keyword_ko, keyword_ja, keyword_zh translations
- Provide context and context_ko, context_ja, context_zh translations

Return ONLY a JSON array. If no genuine commercial entities found, return [].`,
          },
          {
            role: "user",
            content: `Artist: ${searchName}\n\nFan community search results:\n${texts}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) return [];

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    let parsed: ExtractedKeyword[];
    try {
      const obj = JSON.parse(aiContent);
      parsed = Array.isArray(obj) ? obj : (obj.keywords || obj.entities || obj.results || []);
    } catch {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      parsed = JSON.parse(jsonMatch[0]);
    }

    return parsed
      .filter((k) => {
        if (!k.keyword || !k.category) return false;
        if ((k.confidence || 0) < 0.6) return false;
        const kwLower = k.keyword.toLowerCase();
        if (NOISE_BLACKLIST.has(kwLower)) return false;
        // 2글자 이하 키워드 제거 (CB, GO 등 노이즈)
        if (k.keyword.length <= 2) return false;
        return true;
      })
      .map((k) => ({
        ...k,
        confidence: k.confidence || 0.7,
        detection_source: "firecrawl",
      }));
  } catch (e) {
    console.warn(`[detect-global] Firecrawl error for ${artistName}: ${(e as Error).message}`);
    return [];
  }
}

// ── 소스 2: YouTube Data API — 최근 영상에서 상업 키워드 직접 추출 ──
async function detectViaYouTube(
  youtubeKey: string,
  channelId: string | null,
  artistName: string,
  openaiKey: string
): Promise<ExtractedKeyword[]> {
  if (!youtubeKey || !channelId || !openaiKey) return [];

  try {
    // @handle 형식이면 채널 검색으로 ID 변환
    let resolvedChannelId = channelId;
    if (channelId.startsWith("@")) {
      const handleRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?forHandle=${channelId}&part=id&key=${youtubeKey}`
      );
      if (!handleRes.ok) {
        console.warn(`[detect-global] YT handle resolve failed for ${channelId}`);
        return [];
      }
      const handleData = await handleRes.json();
      resolvedChannelId = handleData.items?.[0]?.id;
      if (!resolvedChannelId) return [];
    }

    // 최근 영상 5개 가져오기 (search API 대신 activities 또는 playlistItems 사용 → 쿼터 절약)
    // uploads playlist = "UU" + channelId 뒤 2글자 제거
    const uploadsPlaylistId = "UU" + resolvedChannelId.slice(2);
    const listRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=snippet&maxResults=5&key=${youtubeKey}`
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.warn(`[detect-global] YT playlistItems error: ${errText.slice(0, 150)}`);
      return [];
    }

    const listData = await listRes.json();
    const items = listData.items || [];
    if (!items.length) return [];

    // 3일 이내 영상만 필터
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const recentItems = items.filter((item: any) => {
      const pubDate = new Date(item.snippet?.publishedAt || 0).getTime();
      return pubDate > threeDaysAgo;
    });

    if (!recentItems.length) return [];

    const videoTexts = recentItems.map((item: any) => {
      const s = item.snippet || {};
      const title = s.title || "";
      const desc = (s.description || "").slice(0, 500);
      return `[${title}] ${desc}`;
    }).join("\n---\n");

    // OpenAI로 상업 키워드 추출
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
            content: `Extract commercial entities (brands, products, places, fashion items, beauty products) from YouTube video titles and descriptions of a K-pop artist.

STRICT RULES:
- Only COMMERCIAL entities that appear in the video text
- Do NOT include: artist names, song/album titles, agency names
- Do NOT include: generic music terms, platform names
- Do NOT extract keywords that are NOT literally present in the provided text
- COMPOUND NAMES: Keep multi-word brand names together
- Maximum 3 keywords per video set, minimum confidence 0.7
- Provide keyword_en, keyword_ko, keyword_ja, keyword_zh
- Provide context and translated contexts

Return ONLY a JSON array. If no commercial entities found, return [].`,
          },
          {
            role: "user",
            content: `Artist: ${artistName}\n\nRecent YouTube videos:\n${videoTexts}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) return [];

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    let parsed: ExtractedKeyword[];
    try {
      const obj = JSON.parse(aiContent);
      parsed = Array.isArray(obj) ? obj : (obj.keywords || obj.entities || obj.results || []);
    } catch {
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      parsed = JSON.parse(jsonMatch[0]);
    }

    // 텍스트 매칭 검증: 영상 본문에 실제 존재하는지
    const videoTextsLower = videoTexts.toLowerCase();
    return parsed
      .filter((k) => {
        if (!k.keyword || !k.category) return false;
        if ((k.confidence || 0) < 0.7) return false;
        const kwLower = k.keyword.toLowerCase();
        if (NOISE_BLACKLIST.has(kwLower)) return false;
        if (k.keyword.length <= 2) return false;
        // 환각 방지: 실제 영상 텍스트에 존재하는지 검증
        if (!videoTextsLower.includes(kwLower)) {
          console.warn(`[detect-global] YT hallucination filtered: "${k.keyword}" not in video text`);
          return false;
        }
        return true;
      })
      .map((k) => ({
        ...k,
        confidence: k.confidence || 0.7,
        detection_source: "youtube_api",
      }));
  } catch (e) {
    console.warn(`[detect-global] YouTube API error for ${artistName}: ${(e as Error).message}`);
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
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const youtubeKey = Deno.env.get("YOUTUBE_API_KEY") || "";
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

    // YouTube 채널 ID 일괄 조회 (v3_artist_tiers에서)
    const allEntryIds = [...entryMap.keys()];
    const ytChannelMap = new Map<string, string>();
    if (allEntryIds.length > 0) {
      // 배치로 조회 (50개씩)
      for (let i = 0; i < allEntryIds.length; i += 50) {
        const chunk = allEntryIds.slice(i, i + 50);
        const { data: tiers } = await sb
          .from("v3_artist_tiers")
          .select("wiki_entry_id, youtube_channel_id")
          .in("wiki_entry_id", chunk)
          .not("youtube_channel_id", "is", null);
        for (const t of (tiers || [])) {
          if (t.youtube_channel_id) ytChannelMap.set(t.wiki_entry_id, t.youtube_channel_id);
        }
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

    console.log(`[detect-global] v4 batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} artists (Firecrawl+YouTube)`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const entryId of batch) {
      try {
        const entry = entryMap.get(entryId);
        const name = entry?.displayName || "Unknown";
        const sid = entry?.starId || null;
        const gName = entry?.groupName || null;
        const ytChannelId = ytChannelMap.get(entryId) || null;

        // 2개 소스 병렬 실행
        const [firecrawlKws, ytKws] = await Promise.all([
          detectViaFirecrawl(firecrawlKey, name, gName, openaiKey),
          detectViaYouTube(youtubeKey, ytChannelId, name, openaiKey),
        ]);

        const allKeywords = mergeKeywords([firecrawlKws, ytKws]);
        const sourceCounts = `fc=${firecrawlKws.length},yt=${ytKws.length}`;
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
            metadata: { source: "global_detect_v4", detection_source: k.detection_source, sources: sourceCounts },
          },
        }));

        // 3일 내 중복 체크
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("id, keyword, keyword_en, keyword_ko, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
          .eq("wiki_entry_id", entryId)
          .gte("detected_at", threeDaysAgo);

        const existingByKeyword = new Map<string, any>();
        for (const e of (existing || [])) {
          existingByKeyword.set((e.keyword || "").toLowerCase(), e);
          if (e.keyword_en) existingByKeyword.set(e.keyword_en.toLowerCase(), e);
          if (e.keyword_ko) existingByKeyword.set(e.keyword_ko.toLowerCase(), e);
        }

        // 크로스 아티스트 중복 제거
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
