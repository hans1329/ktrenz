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
  // 키워드 단독 검색: 아티스트+키워드 조합은 검색량이 너무 적어 0이 되는 문제 해결
  // 아티스트 연관성은 감지(detect) 단계에서 이미 확보됨
  const query = keyword;

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

  // 평균값 사용: Google Trends는 peak=100으로 정규화하므로
  // max/latest 대신 평균을 쓰면 실제 관심도 수준을 반영
  const values = timeline.map((t: { value: number }) => t.value);
  const avgScore = values.length > 0
    ? Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length)
    : 0;

  return { keyword, interest_score: avgScore, region, timeline };
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
// 1회차: baseline + peak 동시 설정 (influence=0 정상)
// 2회차+: peak만 갱신, influence = (peak - baseline) / baseline * 100
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
  const hasBaseline = trigger.baseline_score != null && trigger.baseline_score > 0;

  // 1회차: baseline이 없으면 설정
  if (!hasBaseline && interestScore > 0) {
    updates.baseline_score = interestScore;
    updates.peak_score = interestScore;
    // 1회차는 influence=0 (비교 대상 없음)
  } else if (hasBaseline) {
    // 2회차+: peak 갱신 (현재 score가 기존 peak보다 높으면)
    if (interestScore > (trigger.peak_score || 0)) {
      updates.peak_score = interestScore;
      updates.peak_at = new Date().toISOString();
    }

    // influence_index 계산: 최신 score vs baseline
    // peak 기반이 아닌 현재 score 기반으로 계산하여 실시간 변동 반영
    const baseline = trigger.baseline_score;
    const currentPeak = updates.peak_score ?? trigger.peak_score ?? interestScore;
    if (baseline > 0 && currentPeak > baseline) {
      updates.influence_index = Math.round(((currentPeak - baseline) / baseline) * 10000) / 100;
    } else if (baseline > 0 && interestScore < baseline) {
      // score가 baseline 아래로 떨어지면 음수 influence (하락 트렌드)
      updates.influence_index = Math.round(((interestScore - baseline) / baseline) * 10000) / 100;
    }
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

  const COLLECTION_PAUSED = false;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      triggerId,
      batchSize = 5,
      batchOffset = 0,
      regions = ["worldwide"],
      shopOnly = false,
    } = body;

    if (COLLECTION_PAUSED) {
      console.warn(`[trend-track] Collection paused. Ignoring request offset=${batchOffset}, size=${batchSize}`);
      return new Response(
        JSON.stringify({
          success: true,
          paused: true,
          triggerId: triggerId ?? null,
          batchOffset,
          batchSize,
          regions,
          message: "T2 trend tracking is temporarily paused",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

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

      // shopOnly: 관리자 수동 실행 시 쇼핑 키워드만 추적
      // 기본: 쇼핑 키워드 제외 (자동 파이프라인)
      let countQuery = sb
        .from("ktrenz_trend_triggers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("detected_at", weekAgo);

      let dataQuery = sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("status", "active")
        .gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false });

      if (shopOnly) {
        countQuery = countQuery.eq("trigger_source", "naver_shop");
        dataQuery = dataQuery.eq("trigger_source", "naver_shop");
      } else {
        // 자동 파이프라인: 쇼핑 제외 (baseline=0도 최초 1회 추적 허용)
        countQuery = countQuery.neq("trigger_source", "naver_shop");
        dataQuery = dataQuery.neq("trigger_source", "naver_shop");
      }

      const { count: exactCount } = await countQuery;
      totalTriggers = exactCount ?? 0;

      const { data } = await dataQuery.range(batchOffset, batchOffset + batchSize - 1);
      triggers = data || [];
    }

    if (!triggers.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active triggers to track", tracked: 0, totalTriggers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 중복 제거: artist_name + keyword 조합 기준으로 첫 번째만 SerpAPI 호출 ───
    const seen = new Map<string, string>(); // compositeKey → triggerId
    const dedupTriggers: any[] = [];
    const dupMap = new Map<string, string[]>(); // primaryId → [dupId, dupId, ...]

    for (const t of triggers) {
      const key = `${t.artist_name}|${t.keyword}`;
      if (!seen.has(key)) {
        seen.set(key, t.id);
        dedupTriggers.push(t);
        dupMap.set(t.id, []);
      } else {
        const primaryId = seen.get(key)!;
        dupMap.get(primaryId)!.push(t.id);
      }
    }

    const skippedDups = triggers.length - dedupTriggers.length;
    console.log(`[trend-track] Tracking ${dedupTriggers.length} unique triggers (${skippedDups} duplicates skipped, offset=${batchOffset}, total=${totalTriggers}) across ${regions.length} regions, YouTube=${!!ytApiKey}`);

    let trackedCount = 0;
    let throttled = false;
    const results: any[] = [];

    for (const trigger of dedupTriggers) {
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

            // 중복 트리거에도 동일 tracking 데이터 복사
            const dupIds = dupMap.get(trigger.id) || [];
            for (const dupId of dupIds) {
              const dupTrigger = triggers.find((t: any) => t.id === dupId);
              if (dupTrigger) {
                await sb.from("ktrenz_trend_tracking").insert({
                  trigger_id: dupId,
                  wiki_entry_id: dupTrigger.wiki_entry_id,
                  keyword: dupTrigger.keyword,
                  interest_score: result.interest_score,
                  region,
                  delta_pct: Math.round(deltaPct * 100) / 100,
                  raw_response: rawResponse,
                });
                if (region === "worldwide") {
                  await updateCausalMetrics(sb, dupId, result.interest_score);
                }
              }
            }

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

      // 스마트 만료: 조기 만료 + 연장 추적
      if (!throttled) {
        const triggerAgeMs = Date.now() - new Date(trigger.detected_at).getTime();
        const triggerAgeDays = triggerAgeMs / (24 * 60 * 60 * 1000);
        const currentInfluence = trigger.influence_index ?? 0;

        let shouldExpire = false;
        let expireReason = "";

        // 1) 조기 만료: 3일 이상 경과 & influence_index ≤ 5 이면 최근 3일 연속 낮은지 확인
        if (triggerAgeDays >= 3 && currentInfluence <= 5) {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentScores } = await sb
            .from("ktrenz_trend_tracking")
            .select("interest_score")
            .eq("trigger_id", trigger.id)
            .gte("tracked_at", threeDaysAgo)
            .order("tracked_at", { ascending: false })
            .limit(10);

          const scores = (recentScores ?? []).map((r: any) => r.interest_score);
          // 최근 기록이 3개 이상이고 모두 기준 이하면 조기 만료
          if (scores.length >= 3 && scores.every((s: number) => s <= (trigger.baseline_score ?? 10))) {
            shouldExpire = true;
            expireReason = "early_decay";
          }
        }

        // 2) 14일 초과: influence_index > 20 이면 연장, 아니면 만료
        if (!shouldExpire && triggerAgeDays > 14) {
          if (currentInfluence > 20) {
            // 연장 추적 — 만료하지 않음
            console.log(`[trend-track] Extended tracking: ${trigger.keyword} (${trigger.artist_name}) — influence=${currentInfluence}, age=${Math.round(triggerAgeDays)}d`);
          } else {
            shouldExpire = true;
            expireReason = "lifecycle_end";
          }
        }

        // 3) 최대 30일 하드캡
        if (!shouldExpire && triggerAgeDays > 30) {
          shouldExpire = true;
          expireReason = "hard_cap_30d";
        }

        if (shouldExpire) {
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
          console.log(`[trend-track] Expired trigger (${expireReason}): ${trigger.keyword} (${trigger.artist_name}) — lifetime=${lifetimeHours}h, peak_delay=${peakDelayHours}h`);
        }
      }
    }

    console.log(`[trend-track] Done: tracked ${trackedCount} pairs${throttled ? " (throttled)" : ""}`);

    // DB 상태머신 호환: totalCandidates를 반환하여 cron이 마지막 배치를 판정
    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        totalCandidates: totalTriggers,
        totalTriggers,
        triggersProcessed: triggers.length,
        uniqueTracked: dedupTriggers.length,
        duplicatesSkipped: skippedDups,
        tracked: trackedCount,
        throttled,
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