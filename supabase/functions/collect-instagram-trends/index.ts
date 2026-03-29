// Instagram Trend Collector: RapidAPI Instagram API를 통해 아티스트 피드/스토리에서 트렌드 데이터 수집
// 프로필 조회 → feed/stories 수집 → AI 키워드 추출 → ktrenz_trend_triggers 저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RAPIDAPI_HOST = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com";
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

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
async function instaFetch(endpoint: string, rapidApiKey: string): Promise<any> {
  const res = await fetch(`${RAPIDAPI_BASE}/${endpoint}`, {
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram API [${res.status}]: ${body}`);
  }

  return res.json();
}

// ── 프로필 조회 → pk(user_id) + username 캐싱 ──
async function resolveInstagramProfile(
  artistName: string,
  rapidApiKey: string,
): Promise<{ pk: string; username: string; follower_count: number } | null> {
  try {
    // 아티스트명으로 직접 검색 시도 (공식 계정은 보통 그룹명 + "official")
    const variants = [
      artistName.toLowerCase().replace(/[^a-z0-9]/g, ""),
      artistName.toLowerCase().replace(/[^a-z0-9]/g, "") + "official",
      artistName.toLowerCase().replace(/\s+/g, "_"),
      artistName.toLowerCase().replace(/\s+/g, "."),
    ];

    for (const username of variants) {
      try {
        const profile = await instaFetch(`profile?username=${username}`, rapidApiKey);
        if (profile?.pk && profile?.is_verified) {
          return {
            pk: String(profile.pk),
            username: profile.username,
            follower_count: profile.follower_count || 0,
          };
        }
      } catch {
        // 해당 username이 없으면 다음 시도
        continue;
      }
    }

    return null;
  } catch (e) {
    console.warn(`[instagram] Profile resolution failed for ${artistName}: ${(e as Error).message}`);
    return null;
  }
}

// ── 피드 포스트 파싱 ──
function parseFeedItems(data: any): InstaPost[] {
  const items = data?.items || (Array.isArray(data) ? data : []);
  const posts: InstaPost[] = [];

  for (const item of items.slice(0, 12)) { // 최근 12개 포스트만
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
    const mediaUrl = imageVersions.length > 0 ? imageVersions[0].url : null;

    // 24시간 이내 포스트만
    const takenAt = item.taken_at || 0;
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    if (takenAt < oneDayAgo) continue;

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
    const batchSize = body.batch_size || 20;
    const offset = body.offset || 0;
    const targetStarId = body.star_id || null; // 특정 스타만 처리

    // ── 대상 아티스트 조회 ──
    let query = sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, social_handles, star_type, group_star_id")
      .eq("is_active", true)
      .in("star_type", ["group", "solo", "member"]);

    if (targetStarId) {
      query = query.eq("id", targetStarId);
    } else {
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

    console.log(`[instagram] Processing ${stars.length} stars (offset=${offset}, batch=${batchSize})`);

    let totalKeywords = 0;
    let profilesResolved = 0;
    let apiCalls = 0;
    const results: string[] = [];
    const errors: string[] = [];

    for (const star of stars) {
      try {
        const socialHandles = (star.social_handles || {}) as Record<string, string>;
        let igUsername = socialHandles.instagram || null;
        let igUserId = socialHandles.instagram_pk || null;

        // ── 1. 인스타 핸들 자동 검색 (캐싱 안 된 경우) ──
        if (!igUsername) {
          apiCalls++;
          const profile = await resolveInstagramProfile(star.display_name, rapidApiKey);

          if (profile) {
            igUsername = profile.username;
            igUserId = profile.pk;
            profilesResolved++;

            // social_handles에 캐싱
            const updatedHandles = {
              ...socialHandles,
              instagram: profile.username,
              instagram_pk: profile.pk,
              instagram_followers: profile.follower_count,
            };

            await sb
              .from("ktrenz_stars")
              .update({ social_handles: updatedHandles })
              .eq("id", star.id);

            console.log(`[instagram] Resolved ${star.display_name} → @${profile.username} (${profile.follower_count} followers)`);
          } else {
            // 검색 실패 시 빈 값으로 캐싱 (재시도 방지)
            const updatedHandles = { ...socialHandles, instagram: "_not_found" };
            await sb
              .from("ktrenz_stars")
              .update({ social_handles: updatedHandles })
              .eq("id", star.id);

            console.log(`[instagram] Could not resolve Instagram for ${star.display_name}`);
            continue;
          }
        }

        if (igUsername === "_not_found") continue;

        // pk가 없으면 프로필 조회
        if (!igUserId) {
          apiCalls++;
          try {
            const profile = await instaFetch(`profile?username=${igUsername}`, rapidApiKey);
            igUserId = String(profile.pk);
            const updatedHandles = {
              ...socialHandles,
              instagram_pk: igUserId,
              instagram_followers: profile.follower_count || 0,
            };
            await sb
              .from("ktrenz_stars")
              .update({ social_handles: updatedHandles })
              .eq("id", star.id);
          } catch {
            console.warn(`[instagram] Failed to get pk for @${igUsername}`);
            continue;
          }
        }

        // ── 2. 피드 + 스토리 수집 ──
        let allPosts: InstaPost[] = [];

        // 피드 (최근 포스트)
        try {
          apiCalls++;
          const feedData = await instaFetch(`feed?user_id=${igUserId}`, rapidApiKey);
          const feedPosts = parseFeedItems(feedData);
          allPosts.push(...feedPosts);
        } catch (e) {
          console.warn(`[instagram] Feed fetch failed for @${igUsername}: ${(e as Error).message}`);
        }

        // 스토리
        try {
          apiCalls++;
          const storyData = await instaFetch(`stories?user_id=${igUserId}`, rapidApiKey);
          const storyPosts = parseStoryItems(storyData);
          allPosts.push(...storyPosts);
        } catch (e) {
          console.warn(`[instagram] Stories fetch failed for @${igUsername}: ${(e as Error).message}`);
        }

        if (allPosts.length === 0) {
          results.push(`${star.display_name}: no recent posts/stories`);
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
            },
          };
        });

        // 중복 체크: 같은 star_id + keyword + trigger_source(instagram) + 3일 이내
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await sb
          .from("ktrenz_trend_triggers")
          .select("keyword")
          .eq("star_id", star.id)
          .eq("trigger_source", "instagram")
          .gte("detected_at", threeDaysAgo);

        const existingKws = new Set((existing || []).map((e: any) => e.keyword.toLowerCase()));
        const newTriggers = triggers.filter((t) => !existingKws.has(t.keyword.toLowerCase()));

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

        // Rate limiting: 500ms 대기
        await new Promise((r) => setTimeout(r, 500));
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
        api_calls: apiCalls,
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
