// T2 Trend Track: 감지된 상업 키워드의 Google Trends 검색량을 SerpAPI로 추적
// 인과관계 증명: baseline(첫 추적) → peak 갱신 → influence_index 산출
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

  // 첫 추적 시 baseline 설정 (baseline이 0이면 아직 설정 안 된 것)
  if (!trigger.baseline_score && interestScore > 0) {
    updates.baseline_score = interestScore;
  }

  // peak 갱신
  if (interestScore > (trigger.peak_score || 0)) {
    updates.peak_score = interestScore;
    updates.peak_at = new Date().toISOString();
  }

  // influence_index 재계산: (peak - baseline) / max(baseline, 1) * 100
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
            });
          }

          await new Promise((r) => setTimeout(r, 3000));
        } catch (e) {
          if (e instanceof ThrottleError) {
            console.warn(`[trend-track] ⚠️ THROTTLED — stopping. Tracked ${trackedCount} so far.`);
            throttled = true;
            break;
          }
          console.warn(`[trend-track] Error tracking ${trigger.keyword}/${region}: ${e.message}`);
        }
      }

      // 14일 이상 추적된 트리거 자동 만료
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
