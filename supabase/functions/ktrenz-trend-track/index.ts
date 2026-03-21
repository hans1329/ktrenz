// T2 Trend Track v3: 기존 active 키워드의 버즈 점수 재측정 + delta 계산
// detect와 동일한 공식: news(60%) + blog(40%), 네이버 API 단독
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── detect와 동일한 Buzz Score 공식 ───
function normalizeBuzzScore(newsTotal: number, blogTotal: number): number {
  const newsCap = 1000;
  const blogCap = 10000;
  const newsNorm = newsTotal > 0 ? (Math.log10(newsTotal + 1) / Math.log10(newsCap)) * 100 : 0;
  const blogNorm = blogTotal > 0 ? (Math.log10(blogTotal + 1) / Math.log10(blogCap)) * 100 : 0;
  return Math.round(Math.min(newsNorm * 0.6 + blogNorm * 0.4, 100));
}

async function searchNaverCount(
  clientId: string, clientSecret: string,
  endpoint: "news" | "blog", query: string,
): Promise<number> {
  try {
    // 최근 7일 기사만 카운트
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", "100");
    url.searchParams.set("sort", "date");
    const response = await fetch(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const items = data.items || [];
    if (items.length === 0) return 0;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = items.filter((item: any) => {
      const pubTime = new Date(item.pubDate).getTime();
      return !isNaN(pubTime) && pubTime >= sevenDaysAgo;
    }).length;

    return recentCount;
  } catch { return 0; }
}

// peak/influence 갱신
async function updateCausalMetrics(sb: any, triggerId: string, buzzScore: number) {
  const { data: trigger } = await sb
    .from("ktrenz_trend_triggers")
    .select("baseline_score, peak_score")
    .eq("id", triggerId)
    .single();
  if (!trigger) return;

  const updates: any = {};
  const baseline = trigger.baseline_score ?? 0;

  if (baseline <= 0 && buzzScore > 0) {
    // baseline 미설정 → 지금 설정
    updates.baseline_score = buzzScore;
    updates.peak_score = buzzScore;
  } else if (baseline > 0) {
    if (buzzScore > (trigger.peak_score || 0)) {
      updates.peak_score = buzzScore;
      updates.peak_at = new Date().toISOString();
    }
    const currentPeak = updates.peak_score ?? trigger.peak_score ?? buzzScore;
    updates.influence_index = Math.round(((currentPeak - baseline) / baseline) * 10000) / 100;
  }

  if (Object.keys(updates).length > 0) {
    await sb.from("ktrenz_trend_triggers").update(updates).eq("id", triggerId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { triggerId, batchSize = 5, batchOffset = 0, shopOnly = false } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const naverClientId = Deno.env.get("NAVER_CLIENT_ID") || "";
    const naverClientSecret = Deno.env.get("NAVER_CLIENT_SECRET") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!naverClientId || !naverClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "NAVER_CLIENT_ID/SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 대상 조회: active 상태의 기존 키워드 ───
    let triggers: any[];
    let totalTriggers = 0;

    if (triggerId) {
      const { data } = await sb.from("ktrenz_trend_triggers").select("*").eq("id", triggerId).single();
      triggers = data ? [data] : [];
      totalTriggers = triggers.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let countQ = sb.from("ktrenz_trend_triggers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active").gte("detected_at", weekAgo);
      let dataQ = sb.from("ktrenz_trend_triggers")
        .select("*").eq("status", "active").gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false });

      if (shopOnly) {
        countQ = countQ.eq("trigger_source", "naver_shop");
        dataQ = dataQ.eq("trigger_source", "naver_shop");
      } else {
        countQ = countQ.neq("trigger_source", "naver_shop");
        dataQ = dataQ.neq("trigger_source", "naver_shop");
      }

      const { count } = await countQ;
      totalTriggers = count ?? 0;
      const { data } = await dataQ.range(batchOffset, batchOffset + batchSize - 1);
      triggers = data || [];
    }

    if (!triggers.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active triggers to track", tracked: 0, totalTriggers, totalCandidates: totalTriggers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 중복 제거 ───
    const seen = new Map<string, string>();
    const dedupTriggers: any[] = [];
    const dupMap = new Map<string, string[]>();
    for (const t of triggers) {
      const key = `${t.artist_name}|${t.keyword}`;
      if (!seen.has(key)) { seen.set(key, t.id); dedupTriggers.push(t); dupMap.set(t.id, []); }
      else { dupMap.get(seen.get(key)!)!.push(t.id); }
    }

    console.log(`[trend-track] ${dedupTriggers.length} unique triggers (offset=${batchOffset}, total=${totalTriggers})`);

    let trackedCount = 0;
    const results: any[] = [];

    for (const trigger of dedupTriggers) {
      try {
        const kwQuery = trigger.keyword_ko || trigger.keyword;
        const searchQuery = `"${trigger.artist_name}" "${kwQuery}"`;

        const [newsTotal, blogTotal] = await Promise.all([
          searchNaverCount(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverCount(naverClientId, naverClientSecret, "blog", searchQuery),
        ]);

        const buzzScore = normalizeBuzzScore(newsTotal, blogTotal);

        // delta: baseline 대비 변화율
        const prevScore = trigger.baseline_score || 0;
        const deltaPct = prevScore > 0
          ? Math.round(((buzzScore - prevScore) / prevScore) * 10000) / 100
          : buzzScore > 0 ? 100 : 0;

        // tracking 레코드 저장
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: trigger.id,
          wiki_entry_id: trigger.wiki_entry_id,
          keyword: trigger.keyword,
          interest_score: buzzScore,
          region: "naver",
          delta_pct: deltaPct,
          raw_response: { news_total: newsTotal, blog_total: blogTotal, search_query: searchQuery },
        });

        // 중복 트리거 복사
        for (const dupId of (dupMap.get(trigger.id) || [])) {
          const dup = triggers.find((t: any) => t.id === dupId);
          if (dup) {
            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: dupId, wiki_entry_id: dup.wiki_entry_id, keyword: dup.keyword,
              interest_score: buzzScore, region: "naver", delta_pct: deltaPct,
              raw_response: { news_total: newsTotal, blog_total: blogTotal },
            });
            await updateCausalMetrics(sb, dupId, buzzScore);
          }
        }

        await updateCausalMetrics(sb, trigger.id, buzzScore);
        trackedCount++;
        results.push({ keyword: trigger.keyword, artist: trigger.artist_name, buzz_score: buzzScore, delta_pct: deltaPct });
        console.log(`[trend-track] ✓ "${trigger.artist_name}/${trigger.keyword}" buzz=${buzzScore} Δ=${deltaPct}%`);

        await new Promise(r => setTimeout(r, 500)); // rate limit
      } catch (e) {
        console.warn(`[trend-track] Error: ${trigger.keyword}: ${(e as Error).message}`);
      }

      // ─── 스마트 만료 ───
      const ageDays = (Date.now() - new Date(trigger.detected_at).getTime()) / 86400000;
      const influence = trigger.influence_index ?? 0;
      let shouldExpire = false, expireReason = "";

      if (ageDays >= 3 && influence <= 5) {
        const { data: recent } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score").eq("trigger_id", trigger.id)
          .gte("tracked_at", new Date(Date.now() - 3 * 86400000).toISOString())
          .order("tracked_at", { ascending: false }).limit(10);
        const scores = (recent ?? []).map((r: any) => r.interest_score);
        if (scores.length >= 3 && scores.every((s: number) => s <= (trigger.baseline_score ?? 10))) {
          shouldExpire = true; expireReason = "early_decay";
        }
      }
      if (!shouldExpire && ageDays > 14) {
        if (influence <= 20) { shouldExpire = true; expireReason = "lifecycle_end"; }
      }
      if (!shouldExpire && ageDays > 30) { shouldExpire = true; expireReason = "hard_cap_30d"; }

      if (shouldExpire) {
        const now = new Date();
        const lifetimeH = Math.round((now.getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10;
        const peakDelayH = trigger.peak_at
          ? Math.round((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10 : 0;
        await sb.from("ktrenz_trend_triggers").update({
          status: "expired", expired_at: now.toISOString(), lifetime_hours: lifetimeH, peak_delay_hours: peakDelayH,
        }).eq("id", trigger.id);
        console.log(`[trend-track] Expired (${expireReason}): ${trigger.keyword}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, batchOffset, totalCandidates: totalTriggers, totalTriggers,
        tracked: trackedCount, results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[trend-track] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
