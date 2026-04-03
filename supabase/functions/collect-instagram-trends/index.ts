// Instagram Trend Collector: RapidAPI Instagram API를 통해 아티스트 피드/스토리에서 트렌드 데이터 수집
// 프로필 조회 → feed/stories 수집 → AI 키워드 추출 → ktrenz_trend_triggers 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RAPIDAPI_HOST = "instagram120.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;
const MAX_RESOLVE_PER_RUN = 5; // 미검색 아티스트 프로필 검색 제한 (축소)
const POST_AGE_DAYS = 7; // 7일 이내 포스트만 수집 (기존 3일에서 완화)

// ─── 아티스트/멤버 이름 키워드 필터 (동명 복합 키워드 차단) ───
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

// ── RapidAPI 호출 헬퍼 (instagram120: POST 방식) ──
async function instaFetch(endpoint: string, body: Record<string, any>, rapidApiKey: string, retries = 1): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${RAPIDAPI_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < retries) {
      await res.text(); // consume body
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

// ── 프로필 조회 → pk(user_id) + username 캐싱 (instagram120: POST /api/instagram/profile) ──
async function resolveInstagramProfile(
  artistName: string,
  rapidApiKey: string,
): Promise<{ pk: string; username: string; follower_count: number } | null> {
  try {
    const variants = [
      artistName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      artistName.toLowerCase().replace(/[^a-z0-9]/g, "") + "official",
    ];

    for (const username of variants) {
      try {
        const data = await instaFetch("api/instagram/profile", { username }, rapidApiKey);
        const profile = data?.result;
        if (!profile?.id) continue;
        const followerCount = profile.edge_followed_by?.count || 0;
        // 팔로워 1만 이상이면 공식 계정으로 간주 (instagram120은 is_verified 미제공)
        if (followerCount >= 10000) {
          return {
            pk: String(profile.id),
            username: profile.username || username,
            follower_count: followerCount,
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (e) {
    console.warn(`[instagram] Profile resolution failed for ${artistName}: ${(e as Error).message}`);
    return null;
  }
}

// ── 피드 포스트 파싱 (instagram120: edges[].node 구조) ──
function parseFeedItems(data: any): InstaPost[] {
  const edges = data?.result?.edges || [];
  const posts: InstaPost[] = [];

  for (const edge of edges.slice(0, 12)) { // 최근 12개 포스트만
    const item = edge.node;
    if (!item) continue;

    // caption 추출 (instagram120: item.caption.text)
    const caption = item.caption;
    const captionText = typeof caption === "string" ? caption : (caption?.text || "");

    // 해시태그 추출
    const hashtags = (captionText.match(/#[\w가-힣]+/g) || []).map((h: string) => h.slice(1));

    // 위치 정보
    const location = item.location;
    const locationName = location?.name || location?.short_name || null;

    // 유저 태그
    const usertagItems = item.usertags?.in || [];
    const usertags = usertagItems.map((t: any) => t.user?.username).filter(Boolean);

    // 이미지 URL
    const imageVersions = item.image_versions2?.candidates || [];
    const mediaUrl = imageVersions.length > 0 ? imageVersions[0].url : (item.display_uri || null);

    // POST_AGE_DAYS 이내 포스트만
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

// ── 스토리 파싱 ──
function parseStoryItems(data: any): InstaPost[] {
  const items = Array.isArray(data) ? data : (data?.items || []);
  const stories: InstaPost[] = [];

  for (const item of items) {
    const storyHashtags: string[] = [];
    const storyLocations: string[] = [];
    const storyMentions: string[] = [];

    // 스토리 스티커에서 해시태그, 위치, 멘션 추출
    const stickers = item.story_bloks_stickers || item.reel_mentions || [];
    for (const sticker of stickers) {
      if (sticker.bloks_sticker?.sticker_data?.ig_mention) {
        storyMentions.push(sticker.bloks_sticker.sticker_data.ig_mention.username);
      }
    }

    // story_hashtags
    const hashtagStickers = item.story_hashtags || [];
    for (const hs of hashtagStickers) {
      if (hs.hashtag?.name) storyHashtags.push(hs.hashtag.name);
    }

    // story_locations
    const locationStickers = item.story_locations || [];
    for (const ls of locationStickers) {
      if (ls.location?.name) storyLocations.push(ls.location.name);
    }

    // 캡션 텍스트 (스토리에선 보통 없지만)
    const caption = item.caption?.text || "";

    const imageVersions = item.image_versions2?.candidates || [];
    const mediaUrl = imageVersions.length > 0 ? imageVersions[0].url : null;

    stories.push({
      caption_text: caption,
      location_name: storyLocations.length > 0 ? storyLocations[0] : null,
      location_id: null,
      hashtags: storyHashtags,
      usertags: storyMentions,
      taken_at: item.taken_at || 0,
      media_url: mediaUrl,
      like_count: 0,
      comment_count: 0,
      media_type: "story",
      shortcode: item.code || item.shortcode || null,
    });
  }

  return stories;
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

  // 포스트 요약 생성
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

  try {
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!rapidApiKey) throw new Error("RAPIDAPI_KEY not configured");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    // ── 리셋 모드: _not_found 캐싱 일괄 초기화 ──
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
    const targetStarId = body.star_id || null; // 특정 스타만 처리

    // ── 대상 아티스트 조회 ──
    // skipResolve: 핸들이 있는 아티스트만 처리 (프로필 검색 비활성화)
    const skipResolve = body.skipResolve !== false; // 기본값 true

    let query = sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, social_handles, star_type, group_star_id")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"]);

    if (targetStarId) {
      query = query.eq("id", targetStarId);
    } else {
      // 핸들이 있는 아티스트만 필터링 (skipResolve 모드)
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

    // ─── 글로벌 스타 이름 셋 구축 (키워드 필터용) ───
    const globalStarNames = new Set<string>();
    for (const s of stars) {
      if (s.display_name) globalStarNames.add(s.display_name.toLowerCase());
      if (s.name_ko) globalStarNames.add(s.name_ko.toLowerCase());
    }
    console.log(`[instagram] Built globalStarNames: ${globalStarNames.size} entries`);

    console.log(`[instagram] Processing ${stars.length} stars (offset=${offset}, batch=${batchSize})`);

    let totalKeywords = 0;
    let profilesResolved = 0;
    let apiCalls = 0;
    let resolveAttempts = 0; // 프로필 검색 시도 카운터
    const results: string[] = [];
    const errors: string[] = [];

    // 일일 API 사용량 조회 (ktrenz_collection_log에서 오늘 인스타 api_calls 합산)
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

    // 하드 리밋: 하루 최대 API 호출 수 (BASIC 플랜 과금 방지)
    const DAILY_HARD_LIMIT = 100; // 안전하게 100건으로 제한
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

        // ── 1. 인스타 핸들이 없으면 스킵 (자동매칭 비활성화 — 부정확 매칭 방지) ──
        if (!igUsername) {
          continue;
        }

        // _not_found 캐싱: 7일 경과 시 재시도
        if (igUsername === "_not_found") {
          const checkedAt = socialHandles.instagram_checked_at;
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          if (checkedAt && (Date.now() - new Date(checkedAt).getTime()) > sevenDaysMs) {
            const updatedHandles = { ...socialHandles };
            delete updatedHandles.instagram;
            delete updatedHandles.instagram_checked_at;
            await sb.from("ktrenz_stars").update({ social_handles: updatedHandles }).eq("id", star.id);
            console.log(`[instagram] Reset _not_found for ${star.display_name} (7d expired)`);
          }
          continue;
        }

        // pk가 없으면 프로필 조회 (instagram120: POST /api/instagram/profile)
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
            await sb
              .from("ktrenz_stars")
              .update({ social_handles: updatedHandles })
              .eq("id", star.id);
          } catch {
            console.warn(`[instagram] Failed to get pk for @${igUsername}`);
            // pk 없어도 username으로 posts 조회 가능하므로 계속 진행
          }
        }

        // ── 2. 피드 수집 (instagram120: POST /api/instagram/posts, username 기반) ──
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
          continue;
        }

        console.log(`[instagram] ${star.display_name} (@${igUsername}): ${allPosts.length} posts/stories`);

        // ── 3. AI 키워드 추출 ──
        const keywords = await extractKeywordsFromPosts(allPosts, star.display_name, openaiKey);

        if (keywords.length === 0) {
          results.push(`${star.display_name}: no keywords extracted`);
          continue;
        }

        // ── 4. ktrenz_trend_triggers에 저장 ──
        const now = new Date().toISOString();

        // 소셜 스냅샷 저장 (트래킹 시 소셜 점수 참조용)
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
          wiki_entry_id: null,
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
          // 해당 키워드와 관련된 포스트에서 이미지 URL 추출
          const matchingPost = allPosts.find(
            (p) => p.caption_text.toLowerCase().includes(kw.keyword.toLowerCase()) || p.location_name === kw.keyword
          );
          const sourceImageUrl = matchingPost?.media_url || allPosts[0]?.media_url || null;

          return {
            star_id: star.id,
            wiki_entry_id: null,
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

        // 중복 체크: 같은 star_id + keyword + trigger_source(instagram) + 7일 이내
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
          if (isStarNameKeyword(t.keyword, globalStarNames)) {
            console.warn(`[instagram] ⛔ Star name keyword filtered: "${t.keyword}" (${star.display_name})`);
            return false;
          }
          // 순수 인물명 필터 (한글 2~4자만으로 구성된 키워드 제거)
          const kwTrimmed = t.keyword.trim();
          const kwKo = (t.keyword_ko || "").trim();
          if (pureKoreanNameRegex.test(kwTrimmed) || pureKoreanNameRegex.test(kwKo)) {
            console.warn(`[instagram] ⛔ Pure person-name filtered: "${t.keyword}" (${star.display_name})`);
            return false;
          }
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

        // Rate limiting: 1.5s 대기 (Pro plan 초당 제한 대응)
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[instagram] Error processing ${star.display_name}: ${msg}`);
        errors.push(`${star.display_name}: ${msg}`);

        // Rate limit 감지 시 중단
        if (msg.includes("reached requests limit") || msg.includes("429")) {
          console.warn("[instagram] Rate limit reached, stopping batch");
          break;
        }
      }
    }

    // 로그 기록
    await sb.from("ktrenz_collection_log").insert({
      platform: "instagram",
      status: errors.length > 0 ? "partial" : "success",
      records_collected: totalKeywords,
      error_message: `batch=${batchSize}, offset=${offset}, resolved=${profilesResolved}, api_calls=${apiCalls}, keywords=${totalKeywords}, errors=${errors.length}. ${results.slice(0, 10).join("; ")}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: stars.length,
        profiles_resolved: profilesResolved,
        resolve_attempts: resolveAttempts,
        api_calls: apiCalls,
        budget_remaining: Math.max(0, remainingBudget - apiCalls),
        keywords_saved: totalKeywords,
        results: results.slice(0, 30),
        errors: errors.slice(0, 10),
        next_offset: offset + batchSize,
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
