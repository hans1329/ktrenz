// T2 Trend Track: 감지된 상업 키워드의 Google Trends 검색량을 SerpAPI로 추적
// ktrenz_trend_triggers에서 active 키워드를 읽어 검색량 변화를 ktrenz_trend_tracking에 기록
// throttle 감지 시 즉시 체이닝 중단, 배치 간 충분한 딜레이 확보
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

// SerpAPI throttle 에러를 구별하기 위한 커스텀 에러
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
  const queries = [`${artistName} ${keyword}`, keyword];

  for (const query of queries) {
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
      // throttle 감지 → 즉시 상위로 전파
      if (err.includes("throttled") || err.includes("exceeded") || response.status === 429) {
        throw new ThrottleError(`SerpAPI throttled: ${err.slice(0, 100)}`);
      }
      console.warn(`[trend-track] SerpAPI error for "${query}": ${err.slice(0, 150)}`);
      continue;
    }

    const data = await response.json();
    const timelineData = data.interest_over_time?.timeline_data || [];

    if (!timelineData.length) continue;

    const timeline = timelineData.map((t: any) => ({
      date: t.date || "",
      value: t.values?.[0]?.extracted_value ?? 0,
    }));

    const latestValue = timeline[timeline.length - 1]?.value ?? 0;

    if (latestValue > 0 || timeline.some((t: any) => t.value > 0)) {
      return { keyword, interest_score: latestValue, region, timeline };
    }
  }

  return { keyword, interest_score: 0, region, timeline: [] };
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
      regions = ["worldwide"],  // 기본 worldwide만 (API 절약)
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!serpApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SERPAPI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 단일 트리거 모드
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
      // active 상태인 최근 트리거 (배치 처리)
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

    console.log(`[trend-track] Tracking ${triggers.length} triggers (offset=${batchOffset}, total=${totalTriggers}) across ${regions.length} regions`);

    let trackedCount = 0;
    let throttled = false;
    const results: any[] = [];

    for (const trigger of triggers) {
      if (throttled) break;

      for (const region of regions) {
        if (throttled) break;

        try {
          const result = await fetchGoogleTrends(
            serpApiKey,
            trigger.keyword,
            trigger.artist_name,
            region
          );

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

            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: trigger.id,
              wiki_entry_id: trigger.wiki_entry_id,
              keyword: trigger.keyword,
              interest_score: result.interest_score,
              region,
              delta_pct: Math.round(deltaPct * 100) / 100,
              raw_response: { timeline: result.timeline },
            });

            trackedCount++;
            results.push({
              keyword: trigger.keyword,
              artist: trigger.artist_name,
              region,
              interest_score: result.interest_score,
              delta_pct: deltaPct,
            });
          }

          // SerpAPI rate limit 방지: 호출 간 3초 딜레이
          await new Promise((r) => setTimeout(r, 3000));
        } catch (e) {
          if (e instanceof ThrottleError) {
            console.warn(`[trend-track] ⚠️ THROTTLED — stopping all requests. Tracked ${trackedCount} so far.`);
            throttled = true;
            break;
          }
          console.warn(`[trend-track] Error tracking ${trigger.keyword}/${region}: ${e.message}`);
        }
      }

      // 14일 이상 추적된 트리거는 자동 만료
      if (!throttled) {
        const triggerAge = Date.now() - new Date(trigger.detected_at).getTime();
        if (triggerAge > 14 * 24 * 60 * 60 * 1000) {
          await sb
            .from("ktrenz_trend_triggers")
            .update({ status: "expired" })
            .eq("id", trigger.id);
          console.log(`[trend-track] Expired trigger: ${trigger.keyword} (${trigger.artist_name})`);
        }
      }
    }

    console.log(`[trend-track] Done: tracked ${trackedCount} keyword-region pairs${throttled ? " (stopped: throttled)" : ""}`);

    // 체이닝: throttle 발생 시 절대 체이닝하지 않음
    let chained = false;
    if (!triggerId && !throttled) {
      const nextOffset = batchOffset + batchSize;
      if (nextOffset < totalTriggers) {
        // 다음 배치 전 15초 딜레이 후 체이닝
        console.log(`[trend-track] Waiting 15s before chaining next batch: offset=${nextOffset}, remaining=${totalTriggers - nextOffset}`);
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
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-track] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
