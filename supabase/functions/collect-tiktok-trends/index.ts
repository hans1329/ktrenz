// TikTok Trend Collector: RapidAPI tiktok-api23를 통해 아티스트별 TikTok 검색 데이터 수집
// 검색 결과에서 조회수/좋아요/댓글/공유 통계 집계 → ktrenz_social_snapshots 저장 + social_score 보강
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";
const SEARCH_COUNT = 10; // 검색 결과 수

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
      .filter((item: any) => item.item) // 영상 결과만
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

// 검색 결과에서 메트릭 집계
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
    total_views: totalViews,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    video_count: videos.length,
    avg_views: avgViews,
    avg_engagement_rate: avgEngagementRate,
    max_views: maxViews,
    recent_24h_count: recent24h,
    verified_author_count: verifiedCount,
  };
}

// Top posts 요약 (상위 5개)
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

// TikTok 점수 계산 (social_score 보강용)
// 기존 social_score(팔로워 기반)에 합산할 TikTok activity 점수
function calculateTikTokActivityScore(metrics: TikTokMetrics): number {
  if (metrics.video_count === 0) return 0;

  // 조회수 기반 (로그 스케일, 최대 30점)
  const viewScore = Math.min(30, Math.round(Math.log10(Math.max(1, metrics.total_views)) * 5));

  // 인게이지먼트 기반 (최대 20점)
  const engagementScore = Math.min(20, Math.round(metrics.avg_engagement_rate * 2));

  // 최근성 보너스 (24h 내 콘텐츠 비율, 최대 15점)
  const recencyRate = metrics.video_count > 0 ? metrics.recent_24h_count / metrics.video_count : 0;
  const recencyScore = Math.round(recencyRate * 15);

  // 인증 작성자 보너스 (최대 10점)
  const verifiedScore = Math.min(10, metrics.verified_author_count * 5);

  // 콘텐츠 볼륨 보너스 (최대 10점)
  const volumeScore = Math.min(10, metrics.video_count);

  return viewScore + engagementScore + recencyScore + verifiedScore + volumeScore;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ktrenz_stars에서 활성 아티스트 (group/solo만, member는 그룹으로 커버)
    const { data: stars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, wiki_entry_id, star_type")
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

    console.log(`[tiktok] Processing ${stars.length} artists (dryRun=${!!dryRun})`);

    // v3_scores_v2의 현재 social_score 조회 (기존 팔로워 점수와 합산 위해)
    const wikiIds = stars.map((s: any) => s.wiki_entry_id).filter(Boolean);
    const { data: currentScores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, social_score")
      .in("wiki_entry_id", wikiIds);

    const scoreMap = new Map<string, { id: string; socialScore: number }>();
    for (const s of (currentScores || []) as any[]) {
      if (!scoreMap.has(s.wiki_entry_id)) {
        scoreMap.set(s.wiki_entry_id, { id: s.id, socialScore: Number(s.social_score) || 0 });
      }
    }

    // 이전 TikTok 스냅샷 조회 (기존 tiktok 점수 복원 방지 위해)
    const { data: prevSnapshots } = await sb
      .from("ktrenz_social_snapshots")
      .select("star_id, metrics")
      .in("star_id", stars.map((s: any) => s.id))
      .eq("platform", "tiktok")
      .order("collected_at", { ascending: false })
      .limit(stars.length);

    const prevTikTokScoreMap = new Map<string, number>();
    const seenStars = new Set<string>();
    for (const snap of (prevSnapshots || []) as any[]) {
      if (seenStars.has(snap.star_id)) continue;
      seenStars.add(snap.star_id);
      prevTikTokScoreMap.set(snap.star_id, Number((snap.metrics as any)?.tiktok_activity_score) || 0);
    }

    const results: any[] = [];
    const snapshotsToInsert: any[] = [];
    const scoreUpdates: { id: string; social_score: number }[] = [];

    for (const star of stars as any[]) {
      try {
        const searchKeyword = star.display_name;
        const videos = await searchTikTok(apiKey, searchKeyword, SEARCH_COUNT);

        const metrics = aggregateMetrics(videos);
        const topPosts = extractTopPosts(videos);
        const tikTokActivityScore = calculateTikTokActivityScore(metrics);

        const result = {
          star_id: star.id,
          display_name: star.display_name,
          video_count: metrics.video_count,
          total_views: metrics.total_views,
          tiktok_score: tikTokActivityScore,
        };
        results.push(result);

        if (!dryRun && star.wiki_entry_id) {
          // 스냅샷 저장
          snapshotsToInsert.push({
            star_id: star.id,
            wiki_entry_id: star.wiki_entry_id,
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

          // social_score 업데이트: 기존 팔로워 점수에서 이전 TikTok 점수를 빼고 새 점수를 더함
          const scoreEntry = scoreMap.get(star.wiki_entry_id);
          if (scoreEntry) {
            const prevTikTokScore = prevTikTokScoreMap.get(star.id) || 0;
            const baseSocialScore = Math.max(0, scoreEntry.socialScore - prevTikTokScore);
            const newSocialScore = baseSocialScore + tikTokActivityScore;
            scoreUpdates.push({ id: scoreEntry.id, social_score: newSocialScore });
          }
        }

        console.log(`  ${star.display_name}: ${metrics.video_count} videos, ${metrics.total_views} views, score=${tikTokActivityScore}`);

        // Rate limit: RapidAPI 무료 플랜 보호 (500ms 간격)
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

      // social_score 배치 업데이트 (10개씩)
      for (let i = 0; i < scoreUpdates.length; i += 10) {
        const chunk = scoreUpdates.slice(i, i + 10);
        await Promise.all(chunk.map(u =>
          sb.from("v3_scores_v2").update({ social_score: u.social_score }).eq("id", u.id)
        ));
      }
    }

    const totalViews = results.reduce((s, r) => s + (r.total_views || 0), 0);
    const avgScore = results.length > 0
      ? Math.round(results.reduce((s, r) => s + (r.tiktok_score || 0), 0) / results.length)
      : 0;

    console.log(`[tiktok] Done: ${results.length} artists, ${snapshotsToInsert.length} snapshots, ${scoreUpdates.length} scores updated, totalViews=${totalViews}`);

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: !!dryRun,
        processed: results.length,
        snapshotsInserted: dryRun ? 0 : snapshotsToInsert.length,
        scoresUpdated: dryRun ? 0 : scoreUpdates.length,
        totalViews,
        avgScore,
        results: results.slice(0, 20), // 최대 20개만 반환
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
