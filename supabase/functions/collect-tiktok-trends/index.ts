// TikTok Trend Collector: 핸들 기반 피드 방식 (검색 → 유저 피드 전환)
// 1) /api/user/info?uniqueId={handle} → secUid 획득 (DB 캐싱)
// 2) /api/user/posts?secUid={secUid}&count=35 → 피드 조회
// 3) AI 키워드 추출 → ktrenz_trend_triggers 저장
// 4) 스냅샷 → ktrenz_social_snapshots 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";
const FEED_COUNT = 35;
const DAILY_API_CALL_HARD_LIMIT = 450;
const FETCH_TIMEOUT_MS = 12_000;
const AI_FETCH_TIMEOUT_MS = 20_000;
const RATE_LIMIT_SLEEP_MS = 500;
const TIMEGUARD_MS = 130_000;

// ── 타임아웃 fetch 헬퍼 ──
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeout);
    return resp;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ─── 아티스트/멤버 이름 키워드 필터 ───
function isStarNameKeyword(keyword: string, blockedNames: Set<string>): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  if (blockedNames.has(kw)) return true;
  const cleaned = kw.replace(/^by/i, "").trim();
  if (cleaned && blockedNames.has(cleaned)) return true;
  const tokens = cleaned.split(/[\s\/]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every(t => blockedNames.has(t))) return true;
  return false;
}

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

// ── Step 1: uniqueId → secUid 조회 ──
async function getUserSecUid(apiKey: string, uniqueId: string): Promise<string | null> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/user/info?uniqueId=${encodeURIComponent(uniqueId)}`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": TIKTOK_API_HOST,
        "x-rapidapi-key": apiKey,
      },
    }, FETCH_TIMEOUT_MS);

    if (!resp.ok) {
      console.warn(`[tiktok] user/info failed for @${uniqueId}: HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const secUid = data?.userInfo?.user?.secUid;
    if (!secUid) {
      console.warn(`[tiktok] No secUid in response for @${uniqueId}: statusCode=${data?.statusCode}`);
      return null;
    }

    console.log(`[tiktok] Resolved @${uniqueId} → secUid=${secUid.slice(0, 20)}...`);
    return secUid;
  } catch (e) {
    console.warn(`[tiktok] user/info error for @${uniqueId}: ${(e as Error).message}`);
    return null;
  }
}

// ── Step 2: secUid → 피드 조회 ──
async function getUserPosts(apiKey: string, secUid: string, count: number = FEED_COUNT): Promise<TikTokVideo[]> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/user/posts?secUid=${encodeURIComponent(secUid)}&count=${count}&cursor=0`;
    const resp = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": TIKTOK_API_HOST,
        "x-rapidapi-key": apiKey,
      },
    }, FETCH_TIMEOUT_MS);

    if (!resp.ok) {
      console.warn(`[tiktok] user/posts failed: HTTP ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const items = data?.data?.itemList || [];
    if (!Array.isArray(items)) {
      console.warn(`[tiktok] Unexpected posts structure: ${JSON.stringify(data).slice(0, 200)}`);
      return [];
    }

    return items
      .filter((v: any) => v && v.id)
      .map((v: any) => {
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
    console.warn(`[tiktok] user/posts error: ${(e as Error).message}`);
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

// ── AI 키워드 추출 ──
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

  const videoSummaries = videos.map((v, i) => {
    const parts = [`[${i + 1}] Views: ${v.stats.playCount.toLocaleString()}`];
    if (v.desc) parts.push(`Desc: "${v.desc.slice(0, 300)}"`);
    if (v.author.uniqueId) parts.push(`@${v.author.uniqueId}${v.author.verified ? " ✓" : ""}`);
    const hashtags = (v.desc.match(/#[\w가-힣]+/g) || []).map((h: string) => h.slice(1));
    if (hashtags.length) parts.push(`#Tags: ${hashtags.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const prompt = `You are a K-Pop commercial trend analyst. Analyze the following TikTok videos from ${artistName}'s official account and extract commercially significant keywords.

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
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
    }, AI_FETCH_TIMEOUT_MS);

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

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const { limit: batchLimit, dryRun, offset: requestOffset, mode: requestMode } = body;

    // ── secUid 캐싱 전용 모드 ──
    if (requestMode === "cache_secuid") {
      const apiKey = Deno.env.get("RAPIDAPI_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ success: false, error: "RAPIDAPI_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      // 캐싱 안 된 스타만 조회
      const cacheLimit = batchLimit || 200;
      const { data: uncached, error: ucErr } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, social_handles")
        .eq("is_active", true)
        .not("social_handles->tiktok", "is", null)
        .neq("social_handles->>tiktok" as any, "")
        .neq("social_handles->>tiktok" as any, "_not_found")
        .is("social_handles->tiktok_secuid" as any, null)
        .order("display_name")
        .limit(cacheLimit);

      if (ucErr) throw ucErr;
      if (!uncached?.length) {
        return new Response(JSON.stringify({ success: true, message: "All TikTok handles already cached", cached: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let cached = 0, failed = 0, apiCalls = 0;
      for (const star of uncached as any[]) {
        if (Date.now() - startTime > TIMEGUARD_MS) {
          console.warn(`[tiktok-cache] ⏱ Timeguard at ${Math.round((Date.now() - startTime) / 1000)}s`);
          break;
        }
        const handle = ((star.social_handles?.tiktok) || "").replace(/^@/, "").trim();
        if (!handle) continue;

        const secUid = await getUserSecUid(apiKey, handle);
        apiCalls++;

        if (secUid) {
          const merged = { ...star.social_handles, tiktok_secuid: secUid };
          await sb.from("ktrenz_stars").update({ social_handles: merged }).eq("id", star.id);
          cached++;
          console.log(`[tiktok-cache] ✅ @${handle} (${star.display_name})`);
        } else {
          failed++;
          console.warn(`[tiktok-cache] ❌ @${handle} (${star.display_name})`);
        }
        await new Promise(r => setTimeout(r, 300));
      }

      console.log(`[tiktok-cache] Done: ${cached} cached, ${failed} failed, ${apiCalls} API calls in ${Date.now() - startTime}ms`);
      return new Response(JSON.stringify({ success: true, mode: "cache_secuid", cached, failed, apiCalls, total: uncached.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // ★ 일일 API 호출 하드 리밋 체크
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

    if (todayApiCalls >= DAILY_API_CALL_HARD_LIMIT) {
      console.warn(`[tiktok] HARD LIMIT reached: ${todayApiCalls} >= ${DAILY_API_CALL_HARD_LIMIT}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "daily_hard_limit", todayApiCalls, limit: DAILY_API_CALL_HARD_LIMIT }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 핸들 보유 스타만 조회 (핸들 기반 피드 방식) ──
    const ttOffset = requestOffset || 0;
    const ttBatchSize = batchLimit || 50;
    const { data: stars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_type, group_star_id, social_handles")
      .eq("is_active", true)
      .not("social_handles->tiktok", "is", null)
      .neq("social_handles->>tiktok" as any, "")
      .neq("social_handles->>tiktok" as any, "_not_found")
      .order("display_name")
      .range(ttOffset, ttOffset + ttBatchSize - 1);

    if (starsErr) throw starsErr;
    if (!stars?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No stars with TikTok handles in this batch", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 남은 쿼터 내에서만 처리 (피드 조회 1호출 + secUid 조회 최대 1호출 = 최대 2호출/스타)
    const remainingCalls = DAILY_API_CALL_HARD_LIMIT - todayApiCalls;
    const safeBatchSize = Math.min(stars.length, Math.floor(remainingCalls / 2));
    const starsToProcess = stars.slice(0, safeBatchSize);

    console.log(`[tiktok] Feed mode: ${starsToProcess.length}/${stars.length} artists (offset=${ttOffset}, todayApiCalls=${todayApiCalls}, remaining=${remainingCalls})`);

    // ─── 글로벌 스타 이름 셋 구축 (키워드 필터용) ───
    const globalStarNames = new Set<string>();
    for (const s of (stars || [])) {
      if (s.display_name) globalStarNames.add(s.display_name.toLowerCase());
      if (s.name_ko) globalStarNames.add(s.name_ko.toLowerCase());
    }

    const results: any[] = [];
    const snapshotsToInsert: any[] = [];
    let totalKeywords = 0;
    let apiCallCount = 0;
    let feedSuccessCount = 0;
    let secUidCacheHits = 0;

    for (const star of starsToProcess as any[]) {
      // 타임가드
      if (Date.now() - startTime > TIMEGUARD_MS) {
        console.warn(`[tiktok] ⏱ Timeguard at ${Math.round((Date.now() - startTime) / 1000)}s, stopping`);
        break;
      }

      // 하드 리밋 재확인
      if (todayApiCalls + apiCallCount >= DAILY_API_CALL_HARD_LIMIT) {
        console.warn(`[tiktok] Mid-batch hard limit at ${todayApiCalls + apiCallCount} calls`);
        break;
      }

      try {
        const handles = star.social_handles || {};
        const tiktokHandle = (handles.tiktok || "").replace(/^@/, "").trim();
        if (!tiktokHandle) continue;

        // ── secUid: DB 캐시 → API 조회 ──
        let secUid = handles.tiktok_secuid || null;

        if (!secUid) {
          // API로 secUid 조회
          secUid = await getUserSecUid(apiKey, tiktokHandle);
          apiCallCount++;

          if (secUid) {
            // DB에 캐싱
            const merged = { ...handles, tiktok_secuid: secUid };
            await sb.from("ktrenz_stars")
              .update({ social_handles: merged })
              .eq("id", star.id);
            console.log(`[tiktok] Cached secUid for @${tiktokHandle}`);
          } else {
            console.warn(`[tiktok] Could not resolve secUid for @${tiktokHandle}, skipping`);
            results.push({ star_id: star.id, display_name: star.display_name, error: "secUid_not_found" });
            await new Promise(r => setTimeout(r, RATE_LIMIT_SLEEP_MS));
            continue;
          }
        } else {
          secUidCacheHits++;
        }

        // ── 피드 조회 ──
        const videos = await getUserPosts(apiKey, secUid, FEED_COUNT);
        apiCallCount++;

        if (videos.length > 0) feedSuccessCount++;

        const metrics = aggregateMetrics(videos);
        const topPosts = extractTopPosts(videos);
        const tikTokActivityScore = calculateTikTokActivityScore(metrics);

        results.push({
          star_id: star.id,
          display_name: star.display_name,
          handle: tiktokHandle,
          video_count: metrics.video_count,
          total_views: metrics.total_views,
          tiktok_score: tikTokActivityScore,
        });

        if (!dryRun) {
          // 1) 스냅샷 저장
          snapshotsToInsert.push({
            star_id: star.id,
            platform: "tiktok",
            keyword: `@${tiktokHandle}`,
            keyword_type: "user_feed",
            metrics: {
              ...metrics,
              tiktok_activity_score: tikTokActivityScore,
              tiktok_handle: tiktokHandle,
            },
            top_posts: topPosts,
          });

          // 2) AI 키워드 추출
          if (openaiKey && videos.length > 0) {
            const keywords = await extractKeywordsFromVideos(videos, star.display_name, openaiKey);

            if (keywords.length > 0) {
              const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
              const { data: existing } = await sb
                .from("ktrenz_trend_triggers")
                .select("keyword")
                .eq("star_id", star.id)
                .eq("trigger_source", "tiktok")
                .gte("detected_at", threeDaysAgo);

              const existingKws = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
              const now = new Date().toISOString();

              const pureKoreanNameRegex = /^[가-힣]{2,4}$/;
              const newTriggers = keywords
                .filter((kw) => {
                  if (existingKws.has(kw.keyword.toLowerCase())) return false;
                  if (isStarNameKeyword(kw.keyword, globalStarNames)) {
                    console.warn(`[tiktok] ⛔ Star name filtered: "${kw.keyword}" (${star.display_name})`);
                    return false;
                  }
                  const kwTrimmed = kw.keyword.trim();
                  const kwKo = (kw.keyword_ko || "").trim();
                  if (pureKoreanNameRegex.test(kwTrimmed) || pureKoreanNameRegex.test(kwKo)) {
                    console.warn(`[tiktok] ⛔ Person-name filtered: "${kw.keyword}" (${star.display_name})`);
                    return false;
                  }
                  return true;
                })
                .map((kw) => {
                  const matchingVideo = videos.find(
                    (v) => v.desc.toLowerCase().includes(kw.keyword.toLowerCase())
                  );
                  const sourceImageUrl = matchingVideo?.coverUrl || topPosts[0]?.cover || null;

                  return {
                    star_id: star.id,
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
                    source_url: `https://www.tiktok.com/@${tiktokHandle}`,
                    source_title: `TikTok @${tiktokHandle}`,
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
                      tiktok_handle: tiktokHandle,
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
                  console.log(`[tiktok] ${star.display_name}: ${newTriggers.length} keywords saved`);
                }
              }
            }
          }
        }

        console.log(`  @${tiktokHandle} (${star.display_name}): ${metrics.video_count} videos, ${metrics.total_views} views, score=${tikTokActivityScore}`);
        await new Promise(r => setTimeout(r, RATE_LIMIT_SLEEP_MS));
      } catch (e) {
        console.warn(`[tiktok] Error for ${star.display_name}: ${(e as Error).message}`);
        results.push({ star_id: star.id, display_name: star.display_name, error: (e as Error).message });
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
    const elapsed = Date.now() - startTime;

    // 로그 기록
    try {
      await sb.from("ktrenz_collection_log").insert({
        platform: "tiktok",
        status: "success",
        records_collected: totalKeywords,
        error_message: `artists=${results.length}, snapshots=${snapshotsToInsert.length}, keywords=${totalKeywords}, totalViews=${totalViews}, apiCalls=${apiCallCount}, offset=${ttOffset}, feedSuccess=${feedSuccessCount}, secUidCacheHits=${secUidCacheHits}`,
      });
    } catch { /* ignore log errors */ }

    console.log(`[tiktok] Done in ${elapsed}ms: ${results.length} artists, feedSuccess=${feedSuccessCount}, secUidCacheHits=${secUidCacheHits}, keywords=${totalKeywords}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: !!dryRun,
        mode: "user_feed",
        processed: results.length,
        feedSuccess: feedSuccessCount,
        secUidCacheHits,
        snapshotsInserted: dryRun ? 0 : snapshotsToInsert.length,
        keywordsSaved: totalKeywords,
        totalViews,
        apiCalls: apiCallCount,
        elapsed_ms: elapsed,
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
