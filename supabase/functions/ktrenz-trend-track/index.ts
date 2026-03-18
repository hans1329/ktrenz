// T2 Trend Track: 감지된 상업 키워드의 Google Trends 검색량을 SerpAPI로 추적
// ktrenz_trend_triggers에서 active 키워드를 읽어 검색량 변화를 ktrenz_trend_tracking에 기록
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

// SerpAPI Google Trends로 키워드 검색량 조회
async function fetchGoogleTrends(
  serpApiKey: string,
  keyword: string,
  artistName: string,
  region: string = "worldwide"
): Promise<TrendResult | null> {
  try {
    // 전략 1: 아티스트+키워드 조합, 전략 2: 키워드 단독
    // 조합 검색에서 데이터가 없으면 키워드 단독으로 폴백
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
        console.warn(`[trend-track] SerpAPI error for "${query}": ${err.slice(0, 200)}`);
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
      
      // 유의미한 데이터가 있으면 반환
      if (latestValue > 0 || timeline.some((t: any) => t.value > 0)) {
        return {
          keyword,
          interest_score: latestValue,
          region,
          timeline,
        };
      }
    }

    return { keyword, interest_score: 0, region, timeline: [] };
  } catch (e) {
    console.warn(`[trend-track] Fetch error for "${keyword}": ${e.message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { triggerId, batchSize = 10, regions = ["worldwide", "KR", "US", "JP"] } = body;

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

    // 단일 트리거 또는 배치 모드
    let triggers: any[];

    if (triggerId) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("id", triggerId)
        .single();
      triggers = data ? [data] : [];
    } else {
      // active 상태인 최근 트리거 가져오기 (7일 이내)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("status", "active")
        .gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false })
        .limit(batchSize);
      triggers = data || [];
    }

    if (!triggers.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active triggers to track", tracked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[trend-track] Tracking ${triggers.length} triggers across ${regions.length} regions`);

    let trackedCount = 0;
    const results: any[] = [];

    for (const trigger of triggers) {
      for (const region of regions) {
        try {
          const result = await fetchGoogleTrends(
            serpApiKey,
            trigger.keyword,
            trigger.artist_name,
            region
          );

          if (result) {
            // 이전 추적 데이터와 비교하여 delta 계산
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

          // SerpAPI rate limit 방지
          await new Promise((r) => setTimeout(r, 1000));
        } catch (e) {
          console.warn(`[trend-track] Error tracking ${trigger.keyword}/${region}: ${e.message}`);
        }
      }

      // 14일 이상 추적된 트리거는 자동 만료
      const triggerAge = Date.now() - new Date(trigger.detected_at).getTime();
      if (triggerAge > 14 * 24 * 60 * 60 * 1000) {
        await sb
          .from("ktrenz_trend_triggers")
          .update({ status: "expired" })
          .eq("id", trigger.id);
        console.log(`[trend-track] Expired trigger: ${trigger.keyword} (${trigger.artist_name})`);
      }
    }

    console.log(`[trend-track] Done: tracked ${trackedCount} keyword-region pairs`);

    return new Response(
      JSON.stringify({
        success: true,
        triggersProcessed: triggers.length,
        tracked: trackedCount,
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
