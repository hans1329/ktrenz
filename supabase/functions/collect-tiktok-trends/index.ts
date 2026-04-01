// TikTok Trend Collector: RapidAPI tiktok-api23를 통해 아티스트별 TikTok 검색 데이터 수집
// 1) 검색 결과에서 조회수/좋아요/댓글/공유 통계 집계 → ktrenz_social_snapshots 저장
// 2) 영상 설명(desc)에서 AI 키워드 추출 → ktrenz_trend_triggers 저장 (인스타와 동일 패턴)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";
const SEARCH_COUNT = 10;
// ★ 하드 리밋: 월 500건 무료, 초과 시 개당 과금 → 일일 최대 450건으로 안전 마진 확보
const DAILY_API_CALL_HARD_LIMIT = 450;

interface TikTokVideo {
  id: string;
  desc: string;
  createTime: number;
  stats: {
    playCount: number;
    diggCount: number;
    commentCount: number;
    shareCount: number;
  };
  author: {
    uniqueId: string;
    nickname: string;
    followerCount?: number;
    verified?: boolean;
  };
  coverUrl: string;
}

interface TikTokMetrics {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  video_count: number;
  avg_views: number;
  avg_engagement_rate: number;
  max_views: number;
  recent_24h_count: number;
  verified_author_count: number;
}

// TikTok 검색 API 호출
async function searchTikTok(
  apiKey: string,
  keyword: string,
  count: number = SEARCH_COUNT,
): Promise<TikTokVideo[]> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/search/general?keyword=${encodeURIComponent(keyword)}&count=${count}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": TIKTOK_API_HOST,
        "x-rapidapi-key": apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[tiktok] Search failed for "${keyword}": ${response.status} ${err.slice(0, 200)}`);
      return [];
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) {
      console.warn(`[tiktok] Empty response for "${keyword}"`);
      return [];
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn(`[tiktok] Invalid JSON for "${keyword}": ${text.slice(0, 100)}`);
      return [];
    }
    const items = data.data || [];

    return items
      .filter((item: any) => item.item)
      .map((item: any) => {
        const v = item.item;
        const stats = v.stats || {};
        const author = v.author || {};
        return {
          id: v.id || "",
          desc: v.desc || "",
          createTime: v.createTime || 0,
          stats: {
            playCount: Number(stats.playCount) || 0,
            diggCount: Number(stats.diggCount) || 0,
            commentCount: Number(stats.commentCount) || 0,
            shareCount: Number(stats.shareCount) || 0,
          },
          author: {
            uniqueId: author.uniqueId || "",
            nickname: author.nickname || "",
            followerCount: Number(author.followerCount) || 0,
            verified: author.verified || false,
          },
          coverUrl: v.video?.cover || v.video?.originCover || "",
        };
      });
  } catch (e) {
    console.warn(`[tiktok] Search error for "${keyword}": ${(e as Error).message}`);
    return [];
  }
}

function aggregateMetrics(videos: TikTokVideo[]): TikTokMetrics {
  if (videos.length === 0) {
    return {
      total_views: 0, total_likes: 0, total_comments: 0, total_shares: 0,
      video_count: 0, avg_views: 0, avg_engagement_rate: 0, max_views: 0,
      recent_24h_count: 0, verified_author_count: 0,
    };
  }

  const cutoff24h = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
  let maxViews = 0, recent24h = 0, verifiedCount = 0;

  for (const v of videos) {
    totalViews += v.stats.playCount;
    totalLikes += v.stats.diggCount;
    totalComments += v.stats.commentCount;
    totalShares += v.stats.shareCount;
    if (v.stats.playCount > maxViews) maxViews = v.stats.playCount;
    if (v.createTime >= cutoff24h) recent24h++;
    if (v.author.verified) verifiedCount++;
  }

  const avgViews = Math.round(totalViews / videos.length);
  const totalEngagement = totalLikes + totalComments + totalShares;
  const avgEngagementRate = totalViews > 0
    ? Math.round((totalEngagement / totalViews) * 10000) / 100
    : 0;

  return {
    total_views: totalViews, total_likes: totalLikes,
    total_comments: totalComments, total_shares: totalShares,
    video_count: videos.length, avg_views: avgViews,
    avg_engagement_rate: avgEngagementRate, max_views: maxViews,
    recent_24h_count: recent24h, verified_author_count: verifiedCount,
  };
}

function extractTopPosts(videos: TikTokVideo[]): any[] {
  return [...videos]
    .sort((a, b) => b.stats.playCount - a.stats.playCount)
    .slice(0, 5)
    .map(v => ({
      id: v.id,
      desc: v.desc.slice(0, 200),
      views: v.stats.playCount,
      likes: v.stats.diggCount,
      comments: v.stats.commentCount,
      shares: v.stats.shareCount,
      author: v.author.uniqueId,
      author_name: v.author.nickname,
      verified: v.author.verified,
      cover: v.coverUrl,
      created_at: new Date(v.createTime * 1000).toISOString(),
    }));
}

function calculateTikTokActivityScore(metrics: TikTokMetrics): number {
  if (metrics.video_count === 0) return 0;
  const viewScore = Math.min(30, Math.round(Math.log10(Math.max(1, metrics.total_views)) * 5));
  const engagementScore = Math.min(20, Math.round(metrics.avg_engagement_rate * 2));
  const recencyRate = metrics.video_count > 0 ? metrics.recent_24h_count / metrics.video_count : 0;
  const recencyScore = Math.round(recencyRate * 15);
  const verifiedScore = Math.min(10, metrics.verified_author_count * 5);
  const volumeScore = Math.min(10, metrics.video_count);
  return viewScore + engagementScore + recencyScore + verifiedScore + volumeScore;
}

// ── AI 키워드 추출 (인스타와 동일 패턴) ──
async function extractKeywordsFromVideos(
  videos: TikTokVideo[],
  artistName: string,
  openaiKey: string,
): Promise<Array<{
  keyword: string;
  keyword_en: string;
  keyword_ko: string;
  category: string;
  context: string;
  context_ko: string;
  confidence: number;
  commercial_intent: string;
  source_type: string;
}>> {
  if (videos.length === 0) return [];

  // 영상 설명 요약 생성
  const videoSummaries = videos.map((v, i) => {
    const parts = [`[${i + 1}] Views: ${v.stats.playCount.toLocaleString()}`];
    if (v.desc) parts.push(`Desc: "${v.desc.slice(0, 300)}"`);
    if (v.author.uniqueId) parts.push(`@${v.author.uniqueId}${v.author.verified ? " ✓" : ""}`);
    // desc에서 해시태그 추출
    const hashtags = (v.desc.match(/#[\w가-힣]+/g) || []).map((h: string) => h.slice(1));
    if (hashtags.length) parts.push(`#Tags: ${hashtags.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const prompt = `You are a K-Pop commercial trend analyst. Analyze the following TikTok videos related to ${artistName} and extract commercially significant keywords.

VIDEOS:
${videoSummaries}

RULES:
- Extract brand names, product names, place names, fashion items, beauty products, collaboration partners, viral challenges, dance trends
- Hashtags that reference specific brands, products, or trends are HIGH VALUE
- ⚠️ AIRPORT keywords (인천공항, 공항패션, airport fashion) → classify as "fashion"
- 🍴 RESTAURANT/CAFE: Any restaurant, cafe, bar, bakery → classify as "restaurant" (NOT "place" or "food")
- "food" category is for food brands, packaged food products — NOT specific restaurants
- "place" category is for non-dining venues (concert halls, shops, landmarks)
- "social" category is for viral challenges, fan trends, dance trends specific to TikTok
- Exclude: generic hashtags (#fyp, #foryou, #kpop, #viral, #tiktok), the artist's own name, platform names
- Each keyword must have real commercial or cultural significance

Return JSON array:
[{
  "keyword": "original keyword",
  "keyword_en": "English translation",
  "keyword_ko": "Korean translation",
  "category": "brand|product|place|restaurant|food|fashion|beauty|media|music|event|social",
  "context": "English context sentence",
  "context_ko": "Korean context sentence",
  "confidence": 0.0-1.0,
  "commercial_intent": "ad|sponsorship|collaboration|organic|rumor",
  "source_type": "tiktok_video|tiktok_hashtag|tiktok_challenge"
}]

If no meaningful commercial keywords found, return [].`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.warn(`[tiktok] OpenAI API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.keywords || parsed.results || []);
  } catch (e) {
    console.warn(`[tiktok] AI extraction failed: ${(e as Error).message}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { limit: batchLimit, dryRun } = body;

    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "RAPIDAPI_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.warn("[tiktok] OPENAI_API_KEY not configured — keyword extraction will be skipped");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ★ 일일 API 호출 하드 리밋 체크 (월 500건 무료, 초과 과금 방지)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLogs } = await sb
      .from("ktrenz_collection_log")
      .select("error_message")
      .eq("platform", "tiktok")
      .eq("status", "success")
      .gte("collected_at", todayStart.toISOString());

    let todayApiCalls = 0;
    for (const log of todayLogs || []) {
      const match = (log as any).error_message?.match(/apiCalls=(\d+)/);
      if (match) todayApiCalls += parseInt(match[1]);
    }

    // ktrenz_stars에서 활성 아티스트 (star_id 기반)
    const { data: stars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_type")
      .eq("is_active", true)
      .in("star_type", ["group", "solo"])
      .order("display_name")
      .limit(batchLimit || 50);

    if (starsErr) throw starsErr;
    if (!stars?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active stars", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 하드 리밋 초과 시 즉시 중단
    if (todayApiCalls >= DAILY_API_CALL_HARD_LIMIT) {
      console.warn(`[tiktok] HARD LIMIT reached: ${todayApiCalls} >= ${DAILY_API_CALL_HARD_LIMIT}, aborting`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "daily_hard_limit", todayApiCalls, limit: DAILY_API_CALL_HARD_LIMIT }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 남은 쿼터 내에서만 처리할 아티스트 수 제한
    const remainingCalls = DAILY_API_CALL_HARD_LIMIT - todayApiCalls;
    const safeBatchSize = Math.min(stars.length, remainingCalls);
    const starsToProcess = stars.slice(0, safeBatchSize);

    console.log(`[tiktok] Processing ${starsToProcess.length}/${stars.length} artists (dryRun=${!!dryRun}, todayApiCalls=${todayApiCalls}, remaining=${remainingCalls})`);


    const results: any[] = [];
    const snapshotsToInsert: any[] = [];
    let totalKeywords = 0;

    for (const star of stars as any[]) {
      try {
        const searchKeyword = star.display_name;
        const videos = await searchTikTok(apiKey, searchKeyword, SEARCH_COUNT);

        const metrics = aggregateMetrics(videos);
        const topPosts = extractTopPosts(videos);
        const tikTokActivityScore = calculateTikTokActivityScore(metrics);

        results.push({
          star_id: star.id,
          display_name: star.display_name,
          video_count: metrics.video_count,
          total_views: metrics.total_views,
          tiktok_score: tikTokActivityScore,
        });

        if (!dryRun) {
          // 1) 스냅샷 저장 (기존 통계 수집)
          snapshotsToInsert.push({
            star_id: star.id,
            wiki_entry_id: null,
            platform: "tiktok",
            keyword: searchKeyword,
            keyword_type: "artist_search",
            metrics: {
              ...metrics,
              tiktok_activity_score: tikTokActivityScore,
              search_keyword: searchKeyword,
            },
            top_posts: topPosts,
          });

          // 2) AI 키워드 추출 → ktrenz_trend_triggers 저장
          if (openaiKey && videos.length > 0) {
            const keywords = await extractKeywordsFromVideos(videos, star.display_name, openaiKey);

            if (keywords.length > 0) {
              // 중복 체크: 같은 star_id + keyword + trigger_source(tiktok) + 3일 이내
              const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
              const { data: existing } = await sb
                .from("ktrenz_trend_triggers")
                .select("keyword")
                .eq("star_id", star.id)
                .eq("trigger_source", "tiktok")
                .gte("detected_at", threeDaysAgo);

              const existingKws = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
              const now = new Date().toISOString();

              // 키워드별 관련 영상의 커버 이미지 추출
              const newTriggers = keywords
                .filter((kw) => !existingKws.has(kw.keyword.toLowerCase()))
                .map((kw) => {
                  const matchingVideo = videos.find(
                    (v) => v.desc.toLowerCase().includes(kw.keyword.toLowerCase())
                  );
                  const sourceImageUrl = matchingVideo?.coverUrl || topPosts[0]?.cover || null;

                  return {
                    star_id: star.id,
                    wiki_entry_id: null,
                    trigger_type: "keyword",
                    trigger_source: "tiktok",
                    artist_name: star.display_name,
                    keyword: kw.keyword,
                    keyword_en: kw.keyword_en || kw.keyword,
                    keyword_ko: kw.keyword_ko || kw.keyword,
                    keyword_category: kw.category || "social",
                    context: kw.context || "",
                    context_ko: kw.context_ko || "",
                    confidence: kw.confidence || 0.7,
                    source_url: `https://www.tiktok.com/search?q=${encodeURIComponent(star.display_name)}`,
                    source_title: `TikTok search: ${star.display_name}`,
                    detected_at: now,
                    status: "pending",
                    baseline_score: 10,
                    commercial_intent: kw.commercial_intent || "organic",
                    source_image_url: sourceImageUrl,
                    source_snippet: videos
                      .filter((v) => v.desc.toLowerCase().includes(kw.keyword.toLowerCase()))
                      .map((v) => v.desc.slice(0, 100))
                      .join(" | ")
                      .slice(0, 500),
                    metadata: {
                      source_type: kw.source_type || "tiktok_video",
                      tiktok_search_keyword: searchKeyword,
                      tiktok_video_count: metrics.video_count,
                      tiktok_total_views: metrics.total_views,
                      embed_video_id: matchingVideo?.id || videos[0]?.id || null,
                    },
                  };
                });

              if (newTriggers.length > 0) {
                const { error: insertErr } = await sb.from("ktrenz_trend_triggers").insert(newTriggers);
                if (insertErr) {
                  console.error(`[tiktok] Trigger insert error for ${star.display_name}: ${insertErr.message}`);
                } else {
                  totalKeywords += newTriggers.length;
                  console.log(`[tiktok] ${star.display_name}: ${newTriggers.length} keywords extracted & saved`);
                }
              }
            }
          }
        }

        console.log(`  ${star.display_name}: ${metrics.video_count} videos, ${metrics.total_views} views, score=${tikTokActivityScore}`);

        // Rate limit: RapidAPI 보호 (500ms 간격)
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.warn(`[tiktok] Error for ${star.display_name}: ${(e as Error).message}`);
        results.push({
          star_id: star.id,
          display_name: star.display_name,
          error: (e as Error).message,
        });
      }
    }

    // 배치 INSERT (20개씩)
    if (!dryRun) {
      for (let i = 0; i < snapshotsToInsert.length; i += 20) {
        const chunk = snapshotsToInsert.slice(i, i + 20);
        const { error: insertErr } = await sb.from("ktrenz_social_snapshots").insert(chunk);
        if (insertErr) console.error(`[tiktok] Snapshot insert error:`, insertErr.message);
      }
    }

    const totalViews = results.reduce((s, r) => s + (r.total_views || 0), 0);
    const avgScore = results.length > 0
      ? Math.round(results.reduce((s, r) => s + (r.tiktok_score || 0), 0) / results.length)
      : 0;

    // 로그 기록
    try {
      await sb.from("ktrenz_collection_log").insert({
        platform: "tiktok",
        status: "success",
        records_collected: totalKeywords,
        error_message: `artists=${results.length}, snapshots=${snapshotsToInsert.length}, keywords=${totalKeywords}, totalViews=${totalViews}`,
      });
    } catch { /* ignore log errors */ }

    console.log(`[tiktok] Done: ${results.length} artists, ${snapshotsToInsert.length} snapshots, ${totalKeywords} keywords, totalViews=${totalViews}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: !!dryRun,
        processed: results.length,
        snapshotsInserted: dryRun ? 0 : snapshotsToInsert.length,
        keywordsSaved: totalKeywords,
        totalViews,
        avgScore,
        results: results.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[tiktok] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
