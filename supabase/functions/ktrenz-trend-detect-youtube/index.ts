// T2 Trend Detect YouTube: 멤버별 최근 YouTube 영상 제목/설명에서 상업 키워드 AI 추출
// YouTube Data API → 영상 검색 → 제목+설명 텍스트를 OpenAI로 분석 → ktrenz_trend_triggers 저장
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
  source_video_index?: number;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  channelTitle: string;
  thumbnailUrl: string | null;
}

// ─── YouTube Data API: 멤버 관련 최근 영상 검색 ───
async function searchYouTubeVideos(
  ytApiKey: string,
  query: string,
  maxResults: number = 15,
): Promise<YouTubeVideo[]> {
  try {
    const publishedAfter = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      order: "date",
      publishedAfter,
      maxResults: String(maxResults),
      relevanceLanguage: "ko",
      key: ytApiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!res.ok) {
      const err = await res.text();
      console.warn(`[detect-youtube] YouTube search error: ${err.slice(0, 150)}`);
      return [];
    }

    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId || "",
      title: item.snippet?.title || "",
      description: item.snippet?.description || "",
      publishedAt: item.snippet?.publishedAt || "",
      channelTitle: item.snippet?.channelTitle || "",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null,
    }));
  } catch (e) {
    console.warn(`[detect-youtube] YouTube search error: ${(e as Error).message}`);
    return [];
  }
}

// ─── OpenAI: YouTube 영상 텍스트에서 상업 키워드 추출 ───
async function extractKeywordsFromVideos(
  openaiKey: string,
  memberName: string,
  groupName: string | null,
  videos: YouTubeVideo[],
): Promise<ExtractedKeyword[]> {
  if (!videos.length) return [];

  const videoTexts = videos
    .slice(0, 15)
    .map((v, i) => `[${i + 1}] Title: ${v.title}\nDesc: ${v.description.slice(0, 300)}\nChannel: ${v.channelTitle}`)
    .join("\n\n");

  const systemPrompt = `You are a strict text-analysis tool. You MUST only analyze the YouTube video texts provided below. You have NO external knowledge. If a brand/product/entity is NOT explicitly written in the provided text, you MUST NOT output it. Return ONLY a JSON array.`;

  const userPrompt = `Below are recent YouTube video titles and descriptions related to "${memberName}"${groupName ? ` (member of ${groupName})` : ""}. Extract commercial entities (brands, products, places, foods, fashion items, beauty products, media appearances) ONLY if they are EXPLICITLY WRITTEN in the text AND connected to "${memberName}" or their group "${groupName || "N/A"}".

Videos:
${videoTexts}

RULES:
1. ONLY extract entities whose name literally appears in the video text above.
2. "${memberName}" should be mentioned or the video should be about "${memberName}" or their group. Group videos are acceptable IF they contain commercial entities.
3. Do NOT extract: the artist's own name, group name, agency/label name, generic music terms (album, comeback, MV, music video, official), channel names.
4. Chart names, concert names, and festival names CAN provide context but should NOT be extracted as standalone keywords. Extract the commercial entity instead.
5. Do NOT hallucinate or use prior knowledge about this artist's endorsements.
6. YouTube videos often contain brand collaborations, product placements, fashion items, mukbang/food items, travel destinations — focus on these.
7. Maximum 5 keywords. Confidence 0.0-1.0 based on how clearly the text links the entity to "${memberName}".
8. Categories: brand, product, place, food, fashion, beauty, media.
9. Use the ENGLISH name as "keyword". Romanize Korean-origin names.
10. Provide translations: keyword_ko, keyword_ja, keyword_zh.
11. Include "source_video_index" (1-based) pointing to the video where the entity appears.
12. Provide translated context: context, context_ko, context_ja, context_zh.

If NO commercial entities are found, return [].
Example: [{"keyword":"Gentle Monster","keyword_ko":"젠틀몬스터","keyword_ja":"ジェントルモンスター","keyword_zh":"Gentle Monster","category":"fashion","confidence":0.85,"context":"wearing Gentle Monster sunglasses in vlog[2]","context_ko":"브이로그에서 젠틀몬스터 선글라스 착용[2]","context_ja":"Vlogでジェントルモンスターのサングラスを着用[2]","context_zh":"在Vlog中佩戴Gentle Monster太阳镜[2]","source_video_index":2}]`;

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
      console.warn(`[detect-youtube] OpenAI error: ${err.slice(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedKeyword[];

    // 후검증: 추출된 키워드가 실제 영상 텍스트에 존재하는지 확인
    const allText = videos.map((v) => `${v.title} ${v.description}`).join(" ").toLowerCase();
    return parsed.filter((k) => {
      if (!k.keyword || !k.category || typeof k.confidence !== "number") return false;
      const kwLower = k.keyword.toLowerCase();
      const kwKo = k.keyword_ko?.toLowerCase() || "";
      const existsInText = allText.includes(kwLower) || (kwKo && allText.includes(kwKo));
      if (!existsInText) {
        console.warn(`[detect-youtube] Filtered hallucinated keyword: "${k.keyword}"`);
      }
      return existsInText;
    });
  } catch (e) {
    console.warn(`[detect-youtube] Extraction error: ${(e as Error).message}`);
    return [];
  }
}

interface MemberInfo {
  id: string | null;
  display_name: string;
  name_ko: string | null;
  group_name: string | null;
  group_wiki_entry_id: string | null;
}

async function detectForMember(
  sb: any,
  openaiKey: string,
  ytApiKey: string,
  member: MemberInfo,
): Promise<{ keywordsFound: number; videosFound: number; keywords: ExtractedKeyword[] }> {
  // 검색어: 영문명 사용 (YouTube는 글로벌 플랫폼)
  const query = member.group_name
    ? `${member.group_name} ${member.display_name}`
    : member.display_name;

  const videos = await searchYouTubeVideos(ytApiKey, query, 15);

  if (!videos.length) {
    return { keywordsFound: 0, videosFound: 0, keywords: [] };
  }

  const keywords = await extractKeywordsFromVideos(
    openaiKey, member.display_name, member.group_name, videos
  );

  if (!keywords.length) {
    return { keywordsFound: 0, videosFound: videos.length, keywords: [] };
  }

  // 7일 내 동일 멤버 기존 키워드 중복 체크 + 백필
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, context, context_ko, context_ja, context_zh, source_url, source_title, source_image_url")
    .eq("star_id", member.id)
    .gte("detected_at", weekAgo)
    .in("keyword", keywords.map((k) => k.keyword));

  const existingByKeyword = new Map((existing || []).map((e: any) => [e.keyword.toLowerCase(), e]));

  // 크로스 아티스트 중복 제거
  const { data: crossExisting } = await sb
    .from("ktrenz_trend_triggers")
    .select("keyword")
    .neq("star_id", member.id)
    .gte("detected_at", weekAgo)
    .in("keyword", keywords.map((k) => k.keyword));

  const crossSet = new Set((crossExisting || []).map((e: any) => e.keyword.toLowerCase()));

  const rowsToInsert: any[] = [];
  const insertedKeywords: ExtractedKeyword[] = [];
  const backfillPromises: PromiseLike<unknown>[] = [];

  for (const kw of keywords) {
    const kwLower = kw.keyword.toLowerCase();

    // 크로스 아티스트 중복 필터
    if (crossSet.has(kwLower)) {
      console.warn(`[detect-youtube] Cross-artist duplicate filtered: "${kw.keyword}"`);
      continue;
    }

    const videoIdx = (kw.source_video_index || 1) - 1;
    const sourceVideo = videos[videoIdx] || videos[0];

    const current = existingByKeyword.get(kwLower);

    if (!current) {
      rowsToInsert.push({
        wiki_entry_id: member.group_wiki_entry_id || null,
        star_id: member.id || null,
        trigger_type: "youtube_mention",
        trigger_source: "youtube_search",
        artist_name: member.display_name,
        keyword: kw.keyword,
        keyword_ko: kw.keyword_ko || null,
        keyword_ja: kw.keyword_ja || null,
        keyword_zh: kw.keyword_zh || null,
        keyword_category: kw.category,
        context: kw.context,
        context_ko: kw.context_ko || null,
        context_ja: kw.context_ja || null,
        context_zh: kw.context_zh || null,
        confidence: kw.confidence,
        source_url: `https://www.youtube.com/watch?v=${sourceVideo.videoId}`,
        source_title: sourceVideo.title,
        source_image_url: sourceVideo.thumbnailUrl,
        status: "active",
        metadata: {
          video_count: videos.length,
          search_query: query,
          group_name: member.group_name,
          channel_title: sourceVideo.channelTitle,
          source_type: "youtube",
        },
      });
      insertedKeywords.push(kw);
      continue;
    }

    // 백필: 빈 필드 채우기
    const patch: Record<string, unknown> = {};
    const backfillFields = [
      "keyword_ko", "keyword_ja", "keyword_zh",
      "context", "context_ko", "context_ja", "context_zh",
      "source_url", "source_title", "source_image_url",
    ] as const;

    for (const field of backfillFields) {
      const currentValue = (current as Record<string, any>)[field];
      let nextValue: unknown;
      if (field === "source_url") nextValue = `https://www.youtube.com/watch?v=${sourceVideo.videoId}`;
      else if (field === "source_title") nextValue = sourceVideo.title;
      else if (field === "source_image_url") nextValue = sourceVideo.thumbnailUrl;
      else nextValue = (kw as Record<string, any>)[field];
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
  }

  if (backfillPromises.length > 0) {
    await Promise.allSettled(backfillPromises);
  }

  console.log(
    `[detect-youtube] ${member.display_name}: inserted ${rowsToInsert.length} new keywords, backfilled ${backfillPromises.length} existing keywords (${videos.length} videos)`
  );

  return { keywordsFound: rowsToInsert.length, videosFound: videos.length, keywords: insertedKeywords };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { starId, memberName, groupName, batchSize = 3, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!ytApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 단일 멤버 모드 (수동 테스트)
    if (starId && memberName) {
      const result = await detectForMember(sb, openaiKey, ytApiKey, {
        id: starId,
        display_name: memberName,
        name_ko: null,
        group_name: groupName || null,
        group_wiki_entry_id: null,
      });
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 배치 모드: ktrenz_stars member 순회
    const { data: members } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, group_star_id")
      .eq("is_active", true)
      .eq("star_type", "member")
      .order("display_name", { ascending: true });

    const allMembers = members || [];

    // 그룹 정보 일괄 조회
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

    console.log(`[detect-youtube] Batch offset=${batchOffset} size=${batchSize}, processing ${batch.length} members (total: ${allMembers.length})`);

    let successCount = 0;
    let totalKeywords = 0;

    for (const member of batch) {
      try {
        const group = member.group_star_id ? groupMap[member.group_star_id] : null;
        const result = await detectForMember(sb, openaiKey, ytApiKey, {
          id: member.id,
          display_name: member.display_name,
          name_ko: member.name_ko,
          group_name: group?.display_name || null,
          group_wiki_entry_id: group?.wiki_entry_id || null,
        });
        successCount++;
        totalKeywords += result.keywordsFound;
        console.log(`[detect-youtube] ✓ ${member.display_name}: ${result.keywordsFound} keywords (${result.videosFound} videos)`);

        // YouTube API 쿼터 보호: 멤버 간 2초 간격
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[detect-youtube] ✗ ${member.display_name}: ${(e as Error).message}`);
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
    console.error("[detect-youtube] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
