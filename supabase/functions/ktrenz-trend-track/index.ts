// T2 Trend Track v4: 기존 active 키워드의 버즈 점수 재측정 + delta 계산 + AI 동적 컨텍스트
// detect와 동일한 공식: news(60%) + blog(40%), 네이버 API 단독
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── AI 동적 컨텍스트 생성 ───
async function generateDynamicContext(
  trigger: any,
  buzzScore: number,
  deltaPct: number,
  trackingHistory: number[],
): Promise<string | null> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;

  try {
    const baseline = trigger.baseline_score ?? 0;
    const peak = trigger.peak_score ?? 0;
    const influence = trigger.influence_index ?? 0;
    const ageDays = Math.round((Date.now() - new Date(trigger.detected_at).getTime()) / 86400000);
    const isShop = trigger.trigger_source === "naver_shop";
    const trendDirection = trackingHistory.length >= 3
      ? (trackingHistory[trackingHistory.length - 1] > trackingHistory[0] ? "rising" : "declining")
      : "stable";

    const prompt = `You are a K-pop trend data analyst. Based on the following real-time tracking data, write a concise 1-2 sentence interpretation of the current status of this keyword trend. Write in English. Be specific with numbers and direction. Use a punchy editorial tone.

Artist: ${trigger.artist_name}
Keyword: ${trigger.keyword}
Category: ${trigger.keyword_category || "general"}
Source: ${isShop ? "Shopping/Commerce" : "News/Blog"}
Current Score: ${buzzScore}
Baseline Score: ${baseline}
Peak Score: ${peak}
Score Change: ${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%
Influence Index: ${influence}
Trend Direction (last 3 readings): ${trendDirection}
Recent Scores: [${trackingHistory.slice(-5).join(", ")}]
Days Since Detection: ${ageDays}
${trigger.context ? `Previous Context: ${trigger.context}` : ""}

Write ONLY the interpretation, no labels or prefixes.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.warn(`[trend-track] AI context error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn(`[trend-track] AI context failed: ${(e as Error).message}`);
    return null;
  }
}

// ─── 네이버 쇼핑 API: 키워드만으로 상품 수 조회 ───
async function searchNaverShop(
  clientId: string, clientSecret: string, keyword: string,
): Promise<{ total: number; recentItems: number }> {
  try {
    const url = new URL("https://openapi.naver.com/v1/search/shop.json");
    url.searchParams.set("query", keyword);
    url.searchParams.set("display", "100");
    url.searchParams.set("sort", "date");
    const response = await fetch(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!response.ok) return { total: 0, recentItems: 0 };
    const data = await response.json();
    return { total: data.total || 0, recentItems: (data.items || []).length };
  } catch { return { total: 0, recentItems: 0 }; }
}

// ─── 네이버 데이터랩 검색어 트렌드 API ───
async function searchNaverDatalab(
  clientId: string, clientSecret: string, keyword: string,
): Promise<{ latestRatio: number; trend: number[]; period: string }> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30일
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        timeUnit: "date",
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });

    if (!response.ok) return { latestRatio: 0, trend: [], period: "" };
    const data = await response.json();
    const results = data.results?.[0]?.data || [];
    const ratios = results.map((d: any) => d.ratio || 0);
    const latestRatio = ratios.length > 0 ? ratios[ratios.length - 1] : 0;

    return {
      latestRatio: Math.round(latestRatio * 100) / 100,
      trend: ratios.slice(-7), // 최근 7일 트렌드
      period: `${fmt(startDate)}~${fmt(endDate)}`,
    };
  } catch { return { latestRatio: 0, trend: [], period: "" }; }
}

// ─── 쇼핑 복합 점수: 데이터랩 검색량(60%) + 상품 수 정규화(40%) ───
function computeShopScore(datalabRatio: number, shopTotal: number): number {
  // datalabRatio: 0~100 (네이버 상대값)
  const searchScore = datalabRatio; // 이미 0~100 스케일
  // shopTotal: 상품 수 → 로그 정규화 (max ~100k 기준)
  const shopNorm = shopTotal > 0 ? (Math.log10(shopTotal + 1) / Math.log10(100001)) * 100 : 0;
  return Math.round(Math.min(searchScore * 0.6 + shopNorm * 0.4, 100));
}

// ─── Buzz Score 정규화: 최근 7일 기사 건수 기반 (max 100건/소스) ───
function normalizeBuzzScore(newsCount: number, blogCount: number): number {
  const newsCap = 100;
  const blogCap = 100;
  const newsNorm = newsCount > 0 ? (Math.log10(newsCount + 1) / Math.log10(newsCap + 1)) * 100 : 0;
  const blogNorm = blogCount > 0 ? (Math.log10(blogCount + 1) / Math.log10(blogCap + 1)) * 100 : 0;
  return Math.round(Math.min(newsNorm * 0.6 + blogNorm * 0.4, 100));
}

// display=100, sort=date → 7일 이내 기사만 카운트 + API total 반환
function parseBlogPostdate(pd: string): number {
  if (!pd || pd.length !== 8) return 0;
  return new Date(`${pd.slice(0,4)}-${pd.slice(4,6)}-${pd.slice(6,8)}T00:00:00+09:00`).getTime();
}

async function searchNaverRecent(
  clientId: string, clientSecret: string,
  endpoint: "news" | "blog", query: string,
): Promise<{ recent24h: number; recent7d: number; total: number }> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", "100");
    url.searchParams.set("sort", "date");
    const response = await fetch(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!response.ok) return { recent24h: 0, recent7d: 0, total: 0 };
    const data = await response.json();
    const apiTotal = data.total || 0;
    const items = data.items || [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let count24h = 0;
    let count7d = 0;
    for (const item of items) {
      let pubTime: number;
      if (endpoint === "blog") {
        pubTime = parseBlogPostdate(item.postdate);
      } else {
        pubTime = item.pubDate ? new Date(item.pubDate).getTime() : 0;
      }
      if (pubTime >= oneDayAgo) count24h++;
      if (pubTime >= sevenDaysAgo) count7d++;
    }
    return { recent24h: count24h, recent7d: count7d, total: apiTotal };
  } catch { return { recent24h: 0, recent7d: 0, total: 0 }; }
}

// peak/influence 갱신
async function updateCausalMetrics(sb: any, triggerId: string, buzzScore: number, isShopTrigger = false) {
  const { data: trigger } = await sb
    .from("ktrenz_trend_triggers")
    .select("baseline_score, peak_score")
    .eq("id", triggerId)
    .single();
  if (!trigger) return;

  const updates: any = {};
  const baseline = trigger.baseline_score ?? 0;

  // 쇼핑 키워드: composite score는 0~100 스케일인데 baseline이 100 초과면 스케일 불일치 → 리셋
  const needsBaselineReset = isShopTrigger && baseline > 100;

  if ((baseline <= 0 || needsBaselineReset) && buzzScore > 0) {
    // baseline 미설정 또는 스케일 불일치 → 지금 설정
    updates.baseline_score = buzzScore;
    updates.peak_score = buzzScore;
    updates.influence_index = 0;
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

// ── 키워드 팔로우 알림 생성 ──
async function notifyKeywordFollowers(sb: any, trigger: any, deltaPct: number) {
  try {
    // 변동이 ±10% 미만이면 알림 생략
    if (Math.abs(deltaPct) < 10) return;

    // 이 키워드를 팔로우하는 사용자 조회
    const { data: followers } = await sb
      .from("ktrenz_keyword_follows")
      .select("id, user_id, keyword, last_influence_index")
      .eq("trigger_id", trigger.id);

    if (!followers?.length) return;

    const currentInfluence = trigger.influence_index ?? 0;
    const notifications: any[] = [];

    for (const f of followers) {
      const oldVal = f.last_influence_index ?? 0;
      const changeAbs = Math.abs(currentInfluence - oldVal);
      // 최소 5점 이상 변동 시에만 알림
      if (changeAbs < 5 && Math.abs(deltaPct) < 20) continue;

      const direction = currentInfluence > oldVal ? "up" : "down";
      const emoji = direction === "up" ? "📈" : "📉";
      const message = `${emoji} ${trigger.keyword} (${trigger.artist_name}): ${oldVal.toFixed(0)} → ${currentInfluence.toFixed(0)} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`;

      notifications.push({
        user_id: f.user_id,
        follow_id: f.id,
        trigger_id: trigger.id,
        keyword: trigger.keyword,
        artist_name: trigger.artist_name,
        notification_type: direction === "up" ? "influence_up" : "influence_down",
        old_value: oldVal,
        new_value: currentInfluence,
        delta_pct: deltaPct,
        message,
      });
    }

    if (notifications.length > 0) {
      await sb.from("ktrenz_keyword_notifications").insert(notifications);
      // last_influence_index 갱신
      for (const f of followers) {
        await sb.from("ktrenz_keyword_follows").update({ last_influence_index: currentInfluence }).eq("id", f.id);
      }
      console.log(`[trend-track] Notified ${notifications.length} followers for ${trigger.keyword}`);
    }
  } catch (e) {
    console.warn(`[trend-track] Notify error: ${(e as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { triggerId, batchSize = 10, batchOffset = 0 } = body;

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

    // ─── 대상 조회: 모든 active 키워드 (trigger_source 구분 없이) ───
    let triggers: any[];
    let totalTriggers = 0;

    if (triggerId) {
      const { data } = await sb.from("ktrenz_trend_triggers").select("*").eq("id", triggerId).single();
      triggers = data ? [data] : [];
      totalTriggers = triggers.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count } = await sb.from("ktrenz_trend_triggers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active").gte("detected_at", weekAgo);

      totalTriggers = count ?? 0;

      const { data } = await sb.from("ktrenz_trend_triggers")
        .select("*").eq("status", "active").gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false })
        .range(batchOffset, batchOffset + batchSize - 1);

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
        const isShopTrigger = trigger.trigger_source === "naver_shop";

        let buzzScore: number;
        let apiTotal: number;
        let dailyDelta: number;
        let deltaPct: number;
        let rawResponse: any;

        if (isShopTrigger) {
          // ─── 쇼핑 키워드: 데이터랩 검색트렌드 + 네이버 쇼핑 상품수 ───
          const [datalabResult, shopResult] = await Promise.all([
            searchNaverDatalab(naverClientId, naverClientSecret, kwQuery),
            searchNaverShop(naverClientId, naverClientSecret, kwQuery),
          ]);

          buzzScore = computeShopScore(datalabResult.latestRatio, shopResult.total);
          apiTotal = shopResult.total;
          const prevApiTotal = trigger.prev_api_total || 0;
          dailyDelta = prevApiTotal > 0 ? apiTotal - prevApiTotal : 0;
          const prevScore = trigger.baseline_score || 0;
          deltaPct = prevScore > 0
            ? Math.round(((buzzScore - prevScore) / prevScore) * 10000) / 100
            : buzzScore > 0 ? 100 : 0;

          rawResponse = {
            source: "naver_shop_composite",
            datalab_ratio: datalabResult.latestRatio,
            datalab_trend_7d: datalabResult.trend,
            datalab_period: datalabResult.period,
            shop_total: shopResult.total,
            shop_recent_items: shopResult.recentItems,
            composite_score: buzzScore,
            daily_delta: dailyDelta,
            search_keyword: kwQuery,
          };

          console.log(`[trend-track] 🛒 "${trigger.artist_name}/${kwQuery}" datalab=${datalabResult.latestRatio} shop=${shopResult.total} composite=${buzzScore} Δ=${deltaPct}%`);
        } else {
          // ─── 일반 키워드: 뉴스 + 블로그 버즈 ───
          const searchQuery = `"${trigger.artist_name}" "${kwQuery}"`;
          const [newsResult, blogResult] = await Promise.all([
            searchNaverRecent(naverClientId, naverClientSecret, "news", searchQuery),
            searchNaverRecent(naverClientId, naverClientSecret, "blog", searchQuery),
          ]);

          // 24시간 기사수(가중 3x) + 7일 기사수로 민감도 향상
          const news24h = newsResult.recent24h;
          const blog24h = blogResult.recent24h;
          const news7d = newsResult.recent7d;
          const blog7d = blogResult.recent7d;
          buzzScore = (news24h + blog24h) * 3 + (news7d + blog7d);
          const apiNewsTotal = newsResult.total;
          const apiBlogTotal = blogResult.total;
          apiTotal = apiNewsTotal + apiBlogTotal;
          const prevApiTotal = trigger.prev_api_total || 0;
          dailyDelta = prevApiTotal > 0 ? apiTotal - prevApiTotal : 0;
          const prevScore = trigger.baseline_score || 0;
          deltaPct = prevScore > 0
            ? Math.round(((buzzScore - prevScore) / prevScore) * 10000) / 100
            : buzzScore > 0 ? 100 : 0;

          rawResponse = {
            news_24h: news24h, blog_24h: blog24h,
            news_7d: news7d, blog_7d: blog7d,
            news_api_total: apiNewsTotal, blog_api_total: apiBlogTotal,
            api_total: apiTotal, daily_delta: dailyDelta,
            search_query: searchQuery,
          };

          console.log(`[trend-track] ✓ "${trigger.artist_name}/${trigger.keyword}" buzz=${buzzScore} (24h:${news24h+blog24h} 7d:${news7d+blog7d}) Δ=${deltaPct}%`);
        }

        // tracking 레코드 저장
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: trigger.id,
          wiki_entry_id: trigger.wiki_entry_id,
          keyword: trigger.keyword,
          interest_score: buzzScore,
          region: isShopTrigger ? "naver_shop" : "naver",
          delta_pct: deltaPct,
          raw_response: rawResponse,
        });

        // 중복 트리거 복사
        for (const dupId of (dupMap.get(trigger.id) || [])) {
          const dup = triggers.find((t: any) => t.id === dupId);
          if (dup) {
            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: dupId, wiki_entry_id: dup.wiki_entry_id, keyword: dup.keyword,
              interest_score: buzzScore, region: isShopTrigger ? "naver_shop" : "naver",
              delta_pct: deltaPct, raw_response: rawResponse,
            });
            await updateCausalMetrics(sb, dupId, buzzScore, isShopTrigger);
            await sb.from("ktrenz_trend_triggers").update({ prev_api_total: apiTotal }).eq("id", dupId);
          }
        }

        await updateCausalMetrics(sb, trigger.id, buzzScore, isShopTrigger);
        await sb.from("ktrenz_trend_triggers").update({ prev_api_total: apiTotal }).eq("id", trigger.id);

        // ─── AI 동적 컨텍스트 생성 (변동폭 ±15% 이상일 때만) ───
        if (Math.abs(deltaPct) >= 15) {
          const { data: recentTracking } = await sb.from("ktrenz_trend_tracking")
            .select("interest_score")
            .eq("trigger_id", trigger.id)
            .order("tracked_at", { ascending: false })
            .limit(10);
          const history = (recentTracking ?? []).map((r: any) => r.interest_score).reverse();

          const newContext = await generateDynamicContext(trigger, buzzScore, deltaPct, history);
          if (newContext) {
            await sb.from("ktrenz_trend_triggers").update({
              context: newContext,
              context_ko: null, context_ja: null, context_zh: null,
            }).eq("id", trigger.id);
            console.log(`[trend-track] 🤖 Dynamic context updated: ${trigger.keyword}`);
          }
        }

        await notifyKeywordFollowers(sb, trigger, deltaPct);

        trackedCount++;
        results.push({ keyword: trigger.keyword, artist: trigger.artist_name, buzz_score: buzzScore, daily_delta: dailyDelta, delta_pct: deltaPct, api_total: apiTotal, source: isShopTrigger ? "shop_composite" : "news_blog" });

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
