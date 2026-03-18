// T2 Trend Track: 감지된 상업 키워드의 Google Trends + YouTube 검색 데이터를 추적
// 인과관계 증명: baseline(첫 추적) → peak 갱신 → influence_index 산출
// YouTube Data API로 키워드 관련 영상의 조회수/영상 수를 함께 수집
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TrendResult {
  keyword: string;
  interest_score: number;
  region: string;
  timeline: { date: string; value: number }[];
}

interface YouTubeSearchResult {
  video_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  top_video: { title: string; videoId: string; views: number } | null;
}

class ThrottleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThrottleError";
  }
}

async function fetchGoogleTrends(
  serpApiKey: string,
  keyword: string,
  artistName: string,
  region: string = "worldwide"
): Promise<TrendResult | null> {
  const query = `${artistName} ${keyword}`;

  const params = new URLSearchParams({
    engine: "google_trends",
    q: query,
    data_type: "TIMESERIES",
    date: "now 7-d",
    api_key: serpApiKey,
  });

  if (region !== "worldwide") {
    params.set("geo", region);
  }

  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!response.ok) {
    const err = await response.text();
    if (err.includes("throttled") || err.includes("exceeded") || response.status === 429) {
      throw new ThrottleError(`SerpAPI throttled: ${err.slice(0, 100)}`);
    }
    console.warn(`[trend-track] SerpAPI error for "${query}": ${err.slice(0, 150)}`);
    return { keyword, interest_score: 0, region, timeline: [] };
  }

  const data = await response.json();
  const timelineData = data.interest_over_time?.timeline_data || [];

  if (!timelineData.length) {
    return { keyword, interest_score: 0, region, timeline: [] };
  }

  const timeline = timelineData.map((t: any) => ({
    date: t.date || "",
    value: t.values?.[0]?.extracted_value ?? 0,
  }));

  const latestValue = timeline[timeline.length - 1]?.value ?? 0;

  return { keyword, interest_score: latestValue, region, timeline };
}

// ─── YouTube Data API: 키워드 관련 최근 영상 검색 + 통계 수집 ───
async function fetchYouTubeKeywordData(
  ytApiKey: string,
  keyword: string,
  artistName: string,
): Promise<YouTubeSearchResult | null> {
  try {
    const query = `${artistName} ${keyword}`;

    // 최근 7일 이내 영상 검색
    const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const searchParams = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      order: "relevance",
      publishedAfter,
      maxResults: "10",
      key: ytApiKey,
    });

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams}`
    );

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.warn(`[trend-track] YouTube search error: ${err.slice(0, 150)}`);
      return null;
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];

    if (!items.length) {
      return { video_count: 0, total_views: 0, total_likes: 0, total_comments: 0, top_video: null };
    }

    // 영상 ID 목록으로 통계 조회 (1회 호출)
    const videoIds = items.map((item: any) => item.id?.videoId).filter(Boolean);
    if (!videoIds.length) {
      return { video_count: 0, total_views: 0, total_likes: 0, total_comments: 0, top_video: null };
    }

    const statsParams = new URLSearchParams({
      part: "statistics",
      id: videoIds.join(","),
      key: ytApiKey,
    });

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${statsParams}`
    );

    if (!statsRes.ok) {
      const err = await statsRes.text();
      console.warn(`[trend-track] YouTube stats error: ${err.slice(0, 150)}`);
      return null;
    }

    const statsData = await statsRes.json();
    const statsItems = statsData.items || [];

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let topViews = 0;
    let topVideoId = "";
    let topTitle = "";

    for (let i = 0; i < statsItems.length; i++) {
      const stats = statsItems[i].statistics || {};
      const views = parseInt(stats.viewCount || "0", 10);
      const likes = parseInt(stats.likeCount || "0", 10);
      const comments = parseInt(stats.commentCount || "0", 10);

      totalViews += views;
      totalLikes += likes;
      totalComments += comments;

      if (views > topViews) {
        topViews = views;
        topVideoId = statsItems[i].id;
        // 검색 결과에서 제목 매칭
        const matchingItem = items.find((it: any) => it.id?.videoId === statsItems[i].id);
        topTitle = matchingItem?.snippet?.title || "";
      }
    }

    return {
      video_count: statsItems.length,
      total_views: totalViews,
      total_likes: totalLikes,
      total_comments: totalComments,
      top_video: topVideoId ? { title: topTitle, videoId: topVideoId, views: topViews } : null,
    };
  } catch (e) {
    console.warn(`[trend-track] YouTube data error: ${(e as Error).message}`);
    return null;
  }
}

// 인과관계 지표 업데이트: baseline 설정 + peak/influence 갱신
async function updateCausalMetrics(
  sb: any,
  triggerId: string,
  interestScore: number
) {
  const { data: trigger } = await sb
    .from("ktrenz_trend_triggers")
    .select("baseline_score, peak_score")
    .eq("id", triggerId)
    .single();

  if (!trigger) return;

  const updates: any = {};

  if (!trigger.baseline_score && interestScore > 0) {
    updates.baseline_score = interestScore;
  }

  if (interestScore > (trigger.peak_score || 0)) {
    updates.peak_score = interestScore;
    updates.peak_at = new Date().toISOString();
  }

  const baseline = updates.baseline_score ?? trigger.baseline_score ?? 0;
  const peak = updates.peak_score ?? trigger.peak_score ?? 0;
  if (baseline > 0 && peak > baseline) {
    updates.influence_index = Math.round(((peak - baseline) / baseline) * 10000) / 100;
  }

  if (Object.keys(updates).length > 0) {
    await sb
      .from("ktrenz_trend_triggers")
      .update(updates)
      .eq("id", triggerId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      triggerId,
      batchSize = 5,
      batchOffset = 0,
      regions = ["worldwide"],
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SERPAPI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let triggers: any[];
    let totalTriggers = 0;

    if (triggerId) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("id", triggerId)
        .single();
      triggers = data ? [data] : [];
      totalTriggers = triggers.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("status", "active")
        .gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false });

      const allTriggers = data || [];
      totalTriggers = allTriggers.length;
      triggers = allTriggers.slice(batchOffset, batchOffset + batchSize);
    }

    if (!triggers.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active triggers to track", tracked: 0, totalTriggers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trend-track] Tracking ${triggers.length} triggers (offset=${batchOffset}, total=${totalTriggers}) across ${regions.length} regions, YouTube=${!!ytApiKey}`);

    let trackedCount = 0;
    let throttled = false;
    const results: any[] = [];

    for (const trigger of triggers) {
      if (throttled) break;

      for (const region of regions) {
        if (throttled) break;

        try {
          // 1) Google Trends 추적
          const result = await fetchGoogleTrends(
            serpApiKey,
            trigger.keyword,
            trigger.artist_name,
            region
          );

          // 2) YouTube 검색 추적 (worldwide 리전에서만, YouTube API 키가 있을 때만)
          let ytResult: YouTubeSearchResult | null = null;
          if (region === "worldwide" && ytApiKey) {
            ytResult = await fetchYouTubeKeywordData(ytApiKey, trigger.keyword, trigger.artist_name);
            if (ytResult) {
              console.log(`[trend-track] YT: "${trigger.artist_name} ${trigger.keyword}" → ${ytResult.video_count} videos, ${ytResult.total_views} views`);
            }
          }

          if (result) {
            const { data: prevTracking } = await sb
              .from("ktrenz_trend_tracking")
              .select("interest_score")
              .eq("trigger_id", trigger.id)
              .eq("region", region)
              .order("tracked_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const prevScore = prevTracking?.interest_score || 0;
            const deltaPct = prevScore > 0
              ? ((result.interest_score - prevScore) / prevScore) * 100
              : result.interest_score > 0 ? 100 : 0;

            // raw_response에 Google Trends timeline + YouTube 데이터 함께 저장
            const rawResponse: any = { timeline: result.timeline };
            if (ytResult) {
              rawResponse.youtube = {
                video_count: ytResult.video_count,
                total_views: ytResult.total_views,
                total_likes: ytResult.total_likes,
                total_comments: ytResult.total_comments,
                top_video: ytResult.top_video,
              };
            }

            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: trigger.id,
              wiki_entry_id: trigger.wiki_entry_id,
              keyword: trigger.keyword,
              interest_score: result.interest_score,
              region,
              delta_pct: Math.round(deltaPct * 100) / 100,
              raw_response: rawResponse,
            });

            // 인과관계 지표 업데이트 (worldwide 기준)
            if (region === "worldwide") {
              await updateCausalMetrics(sb, trigger.id, result.interest_score);
            }

            trackedCount++;
            results.push({
              keyword: trigger.keyword,
              artist: trigger.artist_name,
              region,
              interest_score: result.interest_score,
              delta_pct: deltaPct,
              youtube: ytResult ? {
                video_count: ytResult.video_count,
                total_views: ytResult.total_views,
              } : null,
            });
          }

          await new Promise((r) => setTimeout(r, 3000));
        } catch (e) {
          if (e instanceof ThrottleError) {
            console.warn(`[trend-track] ⚠️ THROTTLED — stopping. Tracked ${trackedCount} so far.`);
            throttled = true;
            break;
          }
          console.warn(`[trend-track] Error tracking ${trigger.keyword}/${region}: ${(e as Error).message}`);
        }
      }

      // 14일 이상 추적된 트리거 자동 만료 + 라이프사이클 메트릭 계산
      if (!throttled) {
        const triggerAge = Date.now() - new Date(trigger.detected_at).getTime();
        if (triggerAge > 14 * 24 * 60 * 60 * 1000) {
          const now = new Date();
          const lifetimeHours = Math.round((now.getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10;
          const peakDelayHours = trigger.peak_at
            ? Math.round((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10
            : 0;

          await sb
            .from("ktrenz_trend_triggers")
            .update({
              status: "expired",
              expired_at: now.toISOString(),
              lifetime_hours: lifetimeHours,
              peak_delay_hours: peakDelayHours,
            })
            .eq("id", trigger.id);
          console.log(`[trend-track] Expired trigger: ${trigger.keyword} (${trigger.artist_name}) — lifetime=${lifetimeHours}h, peak_delay=${peakDelayHours}h`);
        }
      }
    }

    console.log(`[trend-track] Done: tracked ${trackedCount} pairs${throttled ? " (throttled)" : ""}`);

    // 체이닝
    let chained = false;
    if (!triggerId && !throttled) {
      const nextOffset = batchOffset + batchSize;
      if (nextOffset < totalTriggers) {
        console.log(`[trend-track] Chaining next batch: offset=${nextOffset}`);
        await new Promise((r) => setTimeout(r, 15000));

        sb.functions.invoke("ktrenz-trend-track", {
          body: { batchSize, batchOffset: nextOffset, regions },
        }).catch((e: any) => console.warn(`[trend-track] Chain error: ${e.message}`));
        chained = true;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        totalTriggers,
        triggersProcessed: triggers.length,
        tracked: trackedCount,
        throttled,
        chained,
        youtubeEnabled: !!ytApiKey,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-track] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});