// Instagram Trend Collector: RapidAPI Instagram API를 통해 아티스트 피드에서 트렌드 데이터 수집
// 프로필 조회 → feed 수집 → AI 키워드 추출 → ktrenz_trend_triggers 저장
// ★ 최적화: fetchWithTimeout, 타임가드, 축소된 rate-limit sleep, 정확한 processed 카운트
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RAPIDAPI_HOST = "instagram120.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;
const MAX_RESOLVE_PER_RUN = 5;
const POST_AGE_DAYS = 7;
const TIMEGUARD_MS = 130_000;       // 전체 타임가드 (130초 — 150초 플랫폼 한도 내 안전 마진)
const IG_FETCH_TIMEOUT_MS = 12_000; // Instagram API 개별 호출 타임아웃
const AI_FETCH_TIMEOUT_MS = 20_000; // OpenAI 호출 타임아웃
const RATE_LIMIT_SLEEP_MS = 500;    // 호출 간 대기 (1.5s → 0.5s로 축소)

// ── 타임아웃 fetch 헬퍼 ──
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = init.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // 외부 signal과 내부 타임아웃 signal 모두 대응
  if (existingSignal) {
    existingSignal.addEventListener("abort", () => controller.abort());
  }

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

interface InstaPost {
  caption_text: string;
  location_name: string | null;
  location_id: string | null;
  hashtags: string[];
  usertags: string[];
  taken_at: number;
  media_url: string | null;
  like_count: number;
  comment_count: number;
  media_type: string;
  shortcode: string | null;
}

// ── RapidAPI 호출 헬퍼 ──
async function instaFetch(endpoint: string, body: Record<string, any>, rapidApiKey: string, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetchWithTimeout(`${RAPIDAPI_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, IG_FETCH_TIMEOUT_MS);

    if (res.status === 429 && attempt < retries) {
      await res.text();
      console.warn(`[instagram] 429 rate limit, waiting 3s before retry...`);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Instagram API [${res.status}]: ${text}`);
    }

    return res.json();
  }
}

// ── 피드 포스트 파싱 ──
function parseFeedItems(data: any): InstaPost[] {
  const edges = data?.result?.edges || [];
  const posts: InstaPost[] = [];

  for (const edge of edges.slice(0, 12)) {
    const item = edge.node;
    if (!item) continue;

    const caption = item.caption;
    const captionText = typeof caption === "string" ? caption : (caption?.text || "");
    const hashtags = (captionText.match(/#[\w가-힣]+/g) || []).map((h: string) => h.slice(1));
    const location = item.location;
    const locationName = location?.name || location?.short_name || null;
    const usertagItems = item.usertags?.in || [];
    const usertags = usertagItems.map((t: any) => t.user?.username).filter(Boolean);
    const imageVersions = item.image_versions2?.candidates || [];
    const mediaUrl = imageVersions.length > 0 ? imageVersions[0].url : (item.display_uri || null);

    const takenAt = item.taken_at || 0;
    const cutoff = Math.floor(Date.now() / 1000) - 86400 * POST_AGE_DAYS;
    if (takenAt < cutoff) continue;

    posts.push({
      caption_text: captionText,
      location_name: locationName,
      location_id: location?.pk ? String(location.pk) : null,
      hashtags,
      usertags,
      taken_at: takenAt,
      media_url: mediaUrl,
      like_count: item.like_count || 0,
      comment_count: item.comment_count || 0,
      media_type: item.media_type === 2 ? "video" : "image",
      shortcode: item.code || item.shortcode || null,
    });
  }

  return posts;
}

// ── AI 키워드 추출 ──
async function extractKeywordsFromPosts(
  posts: InstaPost[],
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
  if (posts.length === 0) return [];

  const postSummaries = posts.map((p, i) => {
    const parts = [`[${i + 1}] (${p.media_type})`];
    if (p.caption_text) parts.push(`Caption: "${p.caption_text.slice(0, 200)}"`);
    if (p.location_name) parts.push(`📍Location: ${p.location_name}`);
    if (p.hashtags.length) parts.push(`#Tags: ${p.hashtags.join(", ")}`);
    if (p.usertags.length) parts.push(`@Mentions: ${p.usertags.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const prompt = `You are a K-Pop commercial trend analyst. Analyze the following Instagram posts/stories from ${artistName} and extract commercially significant keywords.

POSTS:
${postSummaries}

RULES:
- Extract brand names, product names, place names, restaurant/cafe names, fashion items, beauty products, collaboration partners
- Location tags from stories are HIGH VALUE signals (artist visited locations)
- ⚠️ AIRPORT keywords (인천공항, 공항패션, airport fashion) → classify as "fashion"
- 🍴 RESTAURANT/CAFE: Any restaurant, cafe, bar, bakery, or dining establishment the artist visited → classify as "restaurant" (NOT "place" or "food")
- "food" category is for food brands, packaged food products, or food-related campaigns — NOT for specific restaurants
- "place" category is for non-dining venues (concert halls, travel destinations, shops, landmarks)
- Exclude: generic hashtags (#kpop, #love), the artist's own name, platform names
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
  "source_type": "feed_post|story|story_location|story_hashtag"
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
      console.warn(`[instagram] OpenAI API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : (parsed.keywords || parsed.results || []);
  } catch (e) {
    console.warn(`[instagram] AI extraction failed: ${(e as Error).message}`);
    return [];
  }
}

// ── 메인 핸들러 ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const fnStartTime = Date.now();

  try {
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!rapidApiKey) throw new Error("RAPIDAPI_KEY not configured");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    // ── 리셋 모드 ──
    if (body.action === "reset_not_found") {
      const resetLimit = body.limit || 50;
      const { data: allStars } = await sb
        .from("ktrenz_stars")
        .select("id, social_handles")
        .eq("is_active", true)
        .limit(500);

      let resetCount = 0;
      for (const star of (allStars || [])) {
        if (resetCount >= resetLimit) break;
        const handles = (star.social_handles || {}) as Record<string, any>;
        if (handles.instagram !== "_not_found") continue;
        delete handles.instagram;
        delete handles.instagram_checked_at;
        await sb.from("ktrenz_stars").update({ social_handles: handles }).eq("id", star.id);
        resetCount++;
      }

      return new Response(
        JSON.stringify({ success: true, action: "reset_not_found", reset_count: resetCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchSize = body.batchSize || body.batch_size || 20;
    const offset = body.offset || 0;
    const targetStarId = body.star_id || null;
    const skipResolve = body.skipResolve !== false;

    let query = sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, social_handles, star_type, group_star_id")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"]);

    if (targetStarId) {
      query = query.eq("id", targetStarId);
    } else {
      if (skipResolve) {
        query = query.not("social_handles->instagram", "is", null)
          .neq("social_handles->>instagram" as any, "_not_found")
          .neq("social_handles->>instagram" as any, "");
      }
      query = query.range(offset, offset + batchSize - 1).order("display_name");
    }

    const { data: stars, error: starsErr } = await query;
    if (starsErr) throw starsErr;
    if (!stars?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No stars to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 글로벌 스타 이름 셋 구축 ───
    const globalStarNames = new Set<string>();
    for (const s of stars) {
      if (s.display_name) globalStarNames.add(s.display_name.toLowerCase());
      if (s.name_ko) globalStarNames.add(s.name_ko.toLowerCase());
    }

    console.log(`[instagram] Processing ${stars.length} stars (offset=${offset}, batch=${batchSize})`);

    let totalKeywords = 0;
    let profilesResolved = 0;
    let apiCalls = 0;
    let processedCount = 0; // ★ 실제 처리 완료된 스타 수
    const results: string[] = [];
    const errors: string[] = [];

    // 일일 API 사용량 조회
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLogs } = await sb
      .from("ktrenz_collection_log")
      .select("error_message")
      .eq("platform", "instagram")
      .gte("collected_at", todayStart.toISOString());

    let estimatedUsedCalls = 0;
    for (const log of (todayLogs || [])) {
      const match = log.error_message?.match(/api_calls=(\d+)/);
      if (match) estimatedUsedCalls += parseInt(match[1]);
    }

    const DAILY_HARD_LIMIT = 100;
    let remainingBudget = DAILY_HARD_LIMIT - estimatedUsedCalls;
    if (remainingBudget <= 0) {
      console.warn(`[instagram] Daily hard limit reached (${estimatedUsedCalls}/${DAILY_HARD_LIMIT}). Aborting batch.`);
      await sb.from("ktrenz_collection_log").insert({
        platform: "instagram",
        status: "budget_exhausted",
        records_collected: 0,
        error_message: `Daily limit reached: ${estimatedUsedCalls}/${DAILY_HARD_LIMIT} calls used`,
      });
      return new Response(
        JSON.stringify({ success: true, processed: 0, budget_exhausted: true, api_calls_today: estimatedUsedCalls }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[instagram] Daily budget: ${remainingBudget}/${DAILY_HARD_LIMIT} remaining (${estimatedUsedCalls} used today)`);

    for (const star of stars) {
      // ★ 타임가드: 전체 실행 시간 초과 시 즉시 중단 (남은 스타는 다음 배치에서)
      if (Date.now() - fnStartTime > TIMEGUARD_MS) {
        console.log(`[instagram] ⏱ Timeguard hit at ${Math.round((Date.now() - fnStartTime) / 1000)}s, processed=${processedCount}/${stars.length}`);
        results.push(`TIMEGUARD after ${processedCount} stars`);
        break;
      }

      // 예산 소진 시 즉시 중단
      if (apiCalls >= remainingBudget) {
        console.log(`[instagram] Daily API budget exhausted (${apiCalls} calls). Stopping.`);
        results.push(`BUDGET_EXHAUSTED after ${apiCalls} API calls`);
        break;
      }

      try {
        const socialHandles = (star.social_handles || {}) as Record<string, string>;
        let igUsername = socialHandles.instagram || null;
        let igUserId = socialHandles.instagram_pk || null;

        if (!igUsername) {
          processedCount++;
          continue;
        }

        if (igUsername === "_not_found") {
          const checkedAt = socialHandles.instagram_checked_at;
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          if (checkedAt && (Date.now() - new Date(checkedAt).getTime()) > sevenDaysMs) {
            const updatedHandles = { ...socialHandles };
            delete updatedHandles.instagram;
            delete updatedHandles.instagram_checked_at;
            await sb.from("ktrenz_stars").update({ social_handles: updatedHandles }).eq("id", star.id);
          }
          processedCount++;
          continue;
        }

        // pk가 없으면 프로필 조회
        if (!igUserId) {
          apiCalls++;
          try {
            const data = await instaFetch("api/instagram/profile", { username: igUsername }, rapidApiKey);
            const profile = data?.result;
            igUserId = String(profile?.id || "");
            const updatedHandles = {
              ...socialHandles,
              instagram_pk: igUserId,
              instagram_followers: profile?.edge_followed_by?.count || 0,
            };
            await sb.from("ktrenz_stars").update({ social_handles: updatedHandles }).eq("id", star.id);
          } catch {
            console.warn(`[instagram] Failed to get pk for @${igUsername}`);
          }
        }

        // ── 피드 수집 ──
        let allPosts: InstaPost[] = [];

        try {
          apiCalls++;
          const feedData = await instaFetch("api/instagram/posts", { username: igUsername, maxId: "" }, rapidApiKey);
          const feedPosts = parseFeedItems(feedData);
          allPosts.push(...feedPosts);
        } catch (e) {
          console.warn(`[instagram] Feed fetch failed for @${igUsername}: ${(e as Error).message}`);
        }

        if (allPosts.length === 0) {
          results.push(`${star.display_name}: no recent posts`);
          processedCount++;
          continue;
        }

        console.log(`[instagram] ${star.display_name} (@${igUsername}): ${allPosts.length} posts`);

        // ── AI 키워드 추출 ──
        const keywords = await extractKeywordsFromPosts(allPosts, star.display_name, openaiKey);

        if (keywords.length === 0) {
          results.push(`${star.display_name}: no keywords extracted`);
          processedCount++;
          continue;
        }

        // ── 스냅샷 & 트리거 저장 ──
        const now = new Date().toISOString();
        const totalLikes = allPosts.reduce((s, p) => s + p.like_count, 0);
        const totalComments = allPosts.reduce((s, p) => s + p.comment_count, 0);
        const avgEngagement = allPosts.length > 0
          ? Math.round((totalLikes + totalComments) / allPosts.length)
          : 0;
        const instaActivityScore = Math.min(100, Math.round(
          Math.log10(Math.max(1, totalLikes)) * 8 +
          Math.log10(Math.max(1, totalComments)) * 12 +
          Math.min(20, allPosts.length * 5)
        ));

        await sb.from("ktrenz_social_snapshots").insert({
          star_id: star.id,
          platform: "instagram",
          keyword: star.display_name,
          keyword_type: "artist_feed",
          metrics: {
            post_count: allPosts.length,
            total_likes: totalLikes,
            total_comments: totalComments,
            avg_engagement: avgEngagement,
            instagram_activity_score: instaActivityScore,
          },
          top_posts: allPosts.slice(0, 5).map(p => ({
            caption: p.caption_text.slice(0, 200),
            location: p.location_name,
            likes: p.like_count,
            comments: p.comment_count,
            media_type: p.media_type,
            media_url: p.media_url,
            taken_at: new Date(p.taken_at * 1000).toISOString(),
          })),
        });

        const triggers = keywords.map((kw) => {
          const matchingPost = allPosts.find(
            (p) => p.caption_text.toLowerCase().includes(kw.keyword.toLowerCase()) || p.location_name === kw.keyword
          );
          const sourceImageUrl = matchingPost?.media_url || allPosts[0]?.media_url || null;

          return {
            star_id: star.id,
            trigger_type: "keyword",
            trigger_source: "instagram",
            artist_name: star.display_name,
            keyword: kw.keyword,
            keyword_en: kw.keyword_en || kw.keyword,
            keyword_ko: kw.keyword_ko || kw.keyword,
            keyword_category: kw.category || "brand",
            context: kw.context || "",
            context_ko: kw.context_ko || "",
            confidence: kw.confidence || 0.7,
            source_url: `https://www.instagram.com/${igUsername}/`,
            source_title: `Instagram @${igUsername}`,
            detected_at: now,
            status: "pending",
            baseline_score: 0,
            commercial_intent: kw.commercial_intent || "organic",
            source_image_url: sourceImageUrl,
            source_snippet: allPosts
              .filter((p) => p.caption_text.includes(kw.keyword) || p.location_name === kw.keyword)
              .map((p) => p.caption_text.slice(0, 100))
              .join(" | ")
              .slice(0, 500),
            metadata: {
              source_type: kw.source_type || "feed_post",
              instagram_username: igUsername,
              instagram_pk: igUserId,
              embed_shortcode: matchingPost?.shortcode || allPosts.find(p => p.shortcode)?.shortcode || null,
            },
          };
        });

        // 중복 체크
        const lookbackDays = new Date(Date.now() - POST_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("keyword")
          .eq("star_id", star.id)
          .eq("trigger_source", "instagram")
          .gte("detected_at", lookbackDays);

        const existingKws = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
        const pureKoreanNameRegex = /^[가-힣]{2,4}$/;
        const newTriggers = triggers.filter((t) => {
          if (existingKws.has(t.keyword.toLowerCase())) return false;
          if (isStarNameKeyword(t.keyword, globalStarNames)) return false;
          const kwTrimmed = t.keyword.trim();
          const kwKo = (t.keyword_ko || "").trim();
          if (pureKoreanNameRegex.test(kwTrimmed) || pureKoreanNameRegex.test(kwKo)) return false;
          return true;
        });

        if (newTriggers.length > 0) {
          const { error: insertErr } = await sb.from("ktrenz_trend_triggers").insert(newTriggers);
          if (insertErr) {
            console.error(`[instagram] Insert error for ${star.display_name}: ${insertErr.message}`);
            errors.push(`${star.display_name}: insert error`);
          } else {
            totalKeywords += newTriggers.length;
            results.push(`${star.display_name}: ${newTriggers.length} keywords saved`);
          }
        } else {
          results.push(`${star.display_name}: all keywords already exist`);
        }

        processedCount++;

        // Rate limiting: 축소된 대기 (API 예산으로 속도 제어)
        await new Promise((r) => setTimeout(r, RATE_LIMIT_SLEEP_MS));
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[instagram] Error processing ${star.display_name}: ${msg}`);
        errors.push(`${star.display_name}: ${msg}`);
        processedCount++; // 에러 스타도 처리 완료로 카운트 (무한 재시도 방지)

        if (msg.includes("reached requests limit") || msg.includes("429")) {
          console.warn("[instagram] Rate limit reached, stopping batch");
          break;
        }
      }
    }

    const elapsed = Date.now() - fnStartTime;
    console.log(`[instagram] Done in ${elapsed}ms: processed=${processedCount}/${stars.length}, keywords=${totalKeywords}, apiCalls=${apiCalls}`);

    // 로그 기록
    await sb.from("ktrenz_collection_log").insert({
      platform: "instagram",
      status: errors.length > 0 ? "partial" : "success",
      records_collected: totalKeywords,
      error_message: `batch=${batchSize}, offset=${offset}, processed=${processedCount}, api_calls=${apiCalls}, keywords=${totalKeywords}, errors=${errors.length}, elapsed=${elapsed}ms. ${results.slice(0, 10).join("; ")}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        profiles_resolved: profilesResolved,
        api_calls: apiCalls,
        budget_remaining: Math.max(0, remainingBudget - apiCalls),
        keywords_saved: totalKeywords,
        results: results.slice(0, 30),
        errors: errors.slice(0, 10),
        next_offset: offset + batchSize,
        elapsed_ms: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[instagram] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
