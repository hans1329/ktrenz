// T2 Trend Track v5: ktrenz_keywords 기반 추적 엔진
// 수집(detect)이 ktrenz_keywords에 키워드를 저장하면, track이 "키워드 단독" 검색으로 시장 버즈를 측정
// baseline_score는 첫 추적 시 설정, 이후 peak/influence 갱신
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripHtmlTags(text: string | null | undefined): string {
  return (text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeHistoryPattern(history: number[], deltaPct: number): string {
  if (history.length < 2) return "초기 반응을 형성 중인 단계";

  const first = history[0] ?? 0;
  const last = history[history.length - 1] ?? 0;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const spread = max - min;

  if (history.length >= 4) {
    const lastThree = history.slice(-3);
    const isRebound = lastThree[2] > lastThree[1] && lastThree[1] <= lastThree[0];
    const isCooling = lastThree[2] < lastThree[1] && lastThree[1] <= lastThree[0];
    const isHolding = spread <= Math.max(5, last * 0.15);

    if (isRebound) return "한 차례 반응이 잦아든 뒤 다시 언급이 붙는 재상승 국면";
    if (isCooling) return "초기 반응 이후 열기가 서서히 정리되는 흐름";
    if (isHolding) return "짧은 기간 동안 관심도가 일정하게 유지되는 흐름";
  }

  if (deltaPct >= 35) return "짧은 시간 안에 반응이 빠르게 커진 확산 구간";
  if (deltaPct <= -35) return "직전 대비 화제성이 눈에 띄게 빠진 조정 구간";
  if (last > first) return "완만하게 저변을 넓혀가는 상승 흐름";
  if (last < first) return "집중 반응 이후 진폭을 줄여가는 정리 흐름";
  return "특정 계기 이후 비슷한 강도로 언급이 이어지는 상태";
}

function describeFreshness(ageDays: number): string {
  if (ageDays <= 1) return "방금 포착된 신규 이슈";
  if (ageDays <= 3) return "최근 며칠 사이 급부상한 이슈";
  if (ageDays <= 7) return "이번 주 내내 반응을 이어가는 이슈";
  return "단기 화제를 지나 잔존 관심을 확인하는 이슈";
}

function describeCategory(keywordCategory: string | null | undefined): string {
  switch (keywordCategory) {
    case "brand":
      return "브랜드·광고 접점에서 반응을 읽어야 하는 키워드";
    case "product":
    case "goods":
    case "shopping":
      return "소비 전환 맥락과 분리해 화제 자체를 봐야 하는 키워드";
    case "event":
      return "행사·출연 계기로 움직이는 키워드";
    case "social":
      return "팬 커뮤니티 반응이 빠르게 번지는 키워드";
    default:
      return "기사·콘텐츠 맥락에서 해석해야 하는 키워드";
  }
}

// ─── AI 동적 컨텍스트 생성 ───
async function generateDynamicContext(
  keyword: any,
  artistName: string,
  buzzScore: number,
  deltaPct: number,
  trackingHistory: number[],
): Promise<string | null> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;

  try {
    const baseline = keyword.baseline_score ?? 0;
    const peak = keyword.peak_score ?? 0;
    const ageDays = Math.round((Date.now() - new Date(keyword.created_at).getTime()) / 86400000);
    const historyPattern = summarizeHistoryPattern(trackingHistory, deltaPct);
    const freshness = describeFreshness(ageDays);
    const categoryGuide = describeCategory(keyword.keyword_category);

    const momentum = deltaPct > 30 ? "급격히 상승 중"
      : deltaPct > 10 ? "상승세"
      : deltaPct > -10 ? "안정적"
      : deltaPct > -30 ? "하락세"
      : "급격히 하락 중";

    const peakStatus = peak > 0 && buzzScore >= peak * 0.9 ? "피크 수준 유지"
      : peak > 0 && buzzScore >= peak * 0.5 ? "피크 대비 중간 수준"
      : peak > 0 ? "피크 대비 낮은 수준"
      : "초기 단계";

    const contextFacts = [
      stripHtmlTags(keyword.source_title),
      stripHtmlTags(keyword.keyword_ko || keyword.keyword),
      artistName,
    ].filter(Boolean);

    const prompt = `당신은 K-pop 트렌드 편집자입니다. 아래 추적 정보를 기반으로, 이 키워드 트렌드의 현재 상태를 2문장 이하의 편집자 톤(Editorial Narrative)으로 작성하세요.

★ 절대 금지 사항:
- 내부 점수, 수치, 퍼센트, 스코어, 지수 등 구체적 숫자를 일절 언급하지 마세요.
- 이전 컨텍스트의 문장을 재사용하거나 어순만 바꾸는 것도 금지합니다.

★ 작성 규칙:
- '[구체적 상황/배경] → [현재 트렌드 현상/대중 반응]' 패턴을 따르세요.
- 핵심 사실 중 최소 1개를 반영: ${contextFacts.join(" / ")}
- 반드시 한국어로 작성하세요.

아티스트: ${artistName}
키워드: ${keyword.keyword}
카테고리: ${keyword.keyword_category || "general"}
카테고리 해석 가이드: ${categoryGuide}
이슈 신선도: ${freshness}
히스토리 패턴: ${historyPattern}
현재 추세: ${momentum}
피크 대비 상태: ${peakStatus}
감지 후 경과일: ${ageDays}일
${keyword.source_title ? `소스 제목: ${stripHtmlTags(keyword.source_title)}` : ""}
${keyword.context ? `이전 컨텍스트(참고만, 재사용 금지): ${stripHtmlTags(keyword.context)}` : ""}

해석만 작성하세요. 라벨이나 접두사 없이.`;

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
        temperature: 0.95,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.warn(`[trend-track] AI context failed: ${(e as Error).message}`);
    return null;
  }
}

// ─── 네이버 검색 (뉴스/블로그) ───
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

// ─── Buzz Score 정규화 ───
function normalizeBuzzScore(newsCount: number, blogCount: number): number {
  const newsCap = 100;
  const blogCap = 100;
  const newsNorm = newsCount > 0 ? (Math.log10(newsCount + 1) / Math.log10(newsCap + 1)) * 100 : 0;
  const blogNorm = blogCount > 0 ? (Math.log10(blogCount + 1) / Math.log10(blogCap + 1)) * 100 : 0;
  return Math.round(Math.min(newsNorm * 0.6 + blogNorm * 0.4, 100));
}

// ─── 네이버 쇼핑 API ───
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

// ─── 네이버 데이터랩 API ───
async function searchNaverDatalab(
  clientId: string, clientSecret: string, keyword: string,
): Promise<{ latestRatio: number; trend: number[]; period: string }> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
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
      trend: ratios.slice(-7),
      period: `${fmt(startDate)}~${fmt(endDate)}`,
    };
  } catch { return { latestRatio: 0, trend: [], period: "" }; }
}

// ─── 쇼핑 복합 점수 ───
function computeShopScore(datalabRatio: number, shopTotal: number): number {
  const searchScore = datalabRatio;
  const shopNorm = shopTotal > 0 ? (Math.log10(shopTotal + 1) / Math.log10(1000001)) * 100 : 0;
  const w = searchScore > 0 ? 0.6 : 0;
  const shopW = searchScore > 0 ? 0.4 : 1.0;
  const raw = searchScore * w + shopNorm * shopW;
  return Math.round(Math.min(raw, 100) * 100) / 100;
}

// ── 키워드 팔로우 알림 ──
async function notifyKeywordFollowers(sb: any, triggerId: string, keyword: string, artistName: string, influenceIndex: number, deltaPct: number) {
  try {
    if (Math.abs(deltaPct) < 10) return;
    const { data: followers } = await sb
      .from("ktrenz_keyword_follows")
      .select("id, user_id, keyword, last_influence_index")
      .eq("trigger_id", triggerId);
    if (!followers?.length) return;

    const notifications: any[] = [];
    for (const f of followers) {
      const oldVal = f.last_influence_index ?? 0;
      const changeAbs = Math.abs(influenceIndex - oldVal);
      if (changeAbs < 5 && Math.abs(deltaPct) < 20) continue;
      const direction = influenceIndex > oldVal ? "up" : "down";
      const emoji = direction === "up" ? "📈" : "📉";
      const message = `${emoji} ${keyword} (${artistName}): ${oldVal.toFixed(0)} → ${influenceIndex.toFixed(0)} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`;
      notifications.push({
        user_id: f.user_id, follow_id: f.id, trigger_id: triggerId,
        keyword, artist_name: artistName,
        notification_type: direction === "up" ? "influence_up" : "influence_down",
        old_value: oldVal, new_value: influenceIndex, delta_pct: deltaPct, message,
      });
    }
    if (notifications.length > 0) {
      await sb.from("ktrenz_keyword_notifications").insert(notifications);
      for (const f of followers) {
        await sb.from("ktrenz_keyword_follows").update({ last_influence_index: influenceIndex }).eq("id", f.id);
      }
      console.log(`[trend-track] Notified ${notifications.length} followers for ${keyword}`);
    }
  } catch (e) {
    console.warn(`[trend-track] Notify error: ${(e as Error).message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { keywordId, batchSize = 10, batchOffset = 0 } = body;

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

    // ─── 대상 조회: ktrenz_keywords에서 active 키워드 (7일 이내) ───
    let keywords: any[];
    let totalKeywords = 0;

    if (keywordId) {
      const { data } = await sb.from("ktrenz_keywords").select("*").eq("id", keywordId).single();
      keywords = data ? [data] : [];
      totalKeywords = keywords.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count } = await sb.from("ktrenz_keywords")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", weekAgo);

      totalKeywords = count ?? 0;

      const { data } = await sb.from("ktrenz_keywords")
        .select("*")
        .eq("status", "active")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .range(batchOffset, batchOffset + batchSize - 1);

      keywords = data || [];
    }

    if (!keywords.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active keywords to track", tracked: 0, totalCandidates: totalKeywords }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 각 키워드의 첫 번째 소스(아티스트 연결점)를 조회 ──
    const keywordIds = keywords.map((k: any) => k.id);
    const { data: allSources } = await sb.from("ktrenz_keyword_sources")
      .select("keyword_id, star_id, artist_name")
      .in("keyword_id", keywordIds.slice(0, 500))
      .order("created_at", { ascending: true });

    // keyword_id → 첫 번째 소스 매핑
    const sourceByKeyword = new Map<string, { star_id: string; artist_name: string }>();
    for (const s of (allSources || [])) {
      if (!sourceByKeyword.has(s.keyword_id)) {
        sourceByKeyword.set(s.keyword_id, { star_id: s.star_id, artist_name: s.artist_name });
      }
    }

    // ── 레거시 ktrenz_trend_triggers에서 keyword_id 매핑 조회 ──
    // metadata->keyword_id로 연결된 트리거 조회 (레거시 호환)
    const { data: legacyTriggers } = await sb.from("ktrenz_trend_triggers")
      .select("id, keyword, keyword_ko, metadata")
      .in("status", ["active", "pending"]);

    const triggerByKeywordId = new Map<string, string>();
    for (const t of (legacyTriggers || [])) {
      const kwId = (t.metadata as any)?.keyword_id;
      if (kwId) triggerByKeywordId.set(kwId, t.id);
    }

    console.log(`[trend-track] ${keywords.length} keywords (offset=${batchOffset}, total=${totalKeywords})`);

    let trackedCount = 0;
    const results: any[] = [];

    for (const kw of keywords) {
      try {
        const kwQuery = kw.keyword_ko || kw.keyword;
        const source = sourceByKeyword.get(kw.id);
        const artistName = source?.artist_name || "Unknown";
        const isShoppingCategory = ["brand", "product", "goods", "shopping"].includes(kw.keyword_category || "");

        // 이전 추적 기록 조회 (ktrenz_trend_tracking에서 keyword_id 기준)
        const { data: prevTracking } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score")
          .eq("keyword_id", kw.id)
          .order("tracked_at", { ascending: false })
          .limit(1);
        const prevTrackScore = prevTracking?.[0]?.interest_score ?? null;

        // ─── "키워드 단독" 네이버 검색으로 시장 버즈 측정 ───
        const searchQuery = `"${kwQuery}"`;
        const [newsResult, blogResult] = await Promise.all([
          searchNaverRecent(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverRecent(naverClientId, naverClientSecret, "blog", searchQuery),
        ]);

        const news24h = newsResult.recent24h;
        const blog24h = blogResult.recent24h;
        const news7d = newsResult.recent7d;
        const blog7d = blogResult.recent7d;
        const apiNewsTotal = newsResult.total;
        const apiBlogTotal = blogResult.total;
        const apiTotal = apiNewsTotal + apiBlogTotal;

        // buzz score = 24h 가중 + 7d
        const buzzScore = (news24h + blog24h) * 3 + (news7d + blog7d);

        // ─── baseline 설정 (첫 추적 시) ───
        const isFirstTrack = kw.baseline_score === 0 || kw.baseline_score === null;
        let baseline = kw.baseline_score ?? 0;
        let peak = kw.peak_score ?? 0;
        let influence = kw.influence_index ?? 0;

        const kwUpdates: any = { last_tracked_at: new Date().toISOString() };

        if (isFirstTrack && buzzScore > 0) {
          baseline = buzzScore;
          peak = buzzScore;
          influence = 0;
          kwUpdates.baseline_score = baseline;
          kwUpdates.peak_score = peak;
          kwUpdates.influence_index = 0;
          console.log(`[trend-track] 📊 First track baseline set: "${kwQuery}" = ${baseline}`);
        } else if (baseline > 0) {
          // peak 갱신
          if (buzzScore > peak) {
            peak = buzzScore;
            kwUpdates.peak_score = peak;
            kwUpdates.peak_at = new Date().toISOString();
          }
          // influence_index 계산
          const effectiveBaseline = Math.max(baseline, 10);
          influence = Math.round(((peak - baseline) / effectiveBaseline) * 10000) / 100;
          kwUpdates.influence_index = influence;
        }

        // delta 계산
        const refScore = prevTrackScore ?? baseline;
        const deltaPct = refScore > 0
          ? Math.round(((buzzScore - refScore) / refScore) * 10000) / 100
          : buzzScore > 0 ? 100 : 0;

        const rawResponse = {
          news_24h: news24h, blog_24h: blog24h,
          news_7d: news7d, blog_7d: blog7d,
          news_api_total: apiNewsTotal, blog_api_total: apiBlogTotal,
          api_total: apiTotal,
          search_query: searchQuery,
          scoring_mode: "naver_keyword_only",
        };

        console.log(`[trend-track] ✓ "${artistName}/${kwQuery}" buzz=${buzzScore} (24h:${news24h+blog24h} 7d:${news7d+blog7d}) Δ=${deltaPct}%${isFirstTrack ? " [FIRST]" : ""}`);

        // ─── ktrenz_keywords 업데이트 ───
        await sb.from("ktrenz_keywords").update(kwUpdates).eq("id", kw.id);

        // ─── ktrenz_trend_tracking에 추적 기록 저장 ───
        const triggerId = triggerByKeywordId.get(kw.id) || null;
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: triggerId,
          keyword_id: kw.id,
          wiki_entry_id: null,
          keyword: kw.keyword,
          interest_score: buzzScore,
          region: "naver",
          delta_pct: deltaPct,
          raw_response: rawResponse,
        });

        // ─── 레거시 ktrenz_trend_triggers 동기화 ───
        if (triggerId) {
          const triggerUpdates: any = {
            baseline_score: baseline,
            peak_score: peak,
            influence_index: influence,
            prev_api_total: apiTotal,
          };
          await sb.from("ktrenz_trend_triggers").update(triggerUpdates).eq("id", triggerId);
        }

        // ─── 쇼핑 카테고리: 별도 테이블 수집 ───
        if (isShoppingCategory) {
          try {
            const [datalabResult, shopResult] = await Promise.all([
              searchNaverDatalab(naverClientId, naverClientSecret, kwQuery),
              searchNaverShop(naverClientId, naverClientSecret, kwQuery),
            ]);
            const compositeScore = computeShopScore(datalabResult.latestRatio, shopResult.total);

            await sb.from("ktrenz_shopping_tracking").insert({
              trigger_id: triggerId,
              star_id: source?.star_id || null,
              keyword: kwQuery,
              keyword_category: kw.keyword_category,
              datalab_ratio: datalabResult.latestRatio,
              datalab_trend_7d: datalabResult.trend,
              shop_total: shopResult.total,
              shop_recent_items: shopResult.recentItems,
              composite_score: compositeScore,
              search_volume: datalabResult.latestRatio,
              raw_response: {
                datalab_period: datalabResult.period,
                datalab_trend: datalabResult.trend,
                shop_total: shopResult.total,
                shop_recent_items: shopResult.recentItems,
              },
            });
            console.log(`[trend-track] 🛒 Shopping: "${kwQuery}" datalab=${datalabResult.latestRatio} shop=${shopResult.total}`);
          } catch (shopErr) {
            console.warn(`[trend-track] Shopping error "${kwQuery}": ${(shopErr as Error).message}`);
          }
        }

        // ─── AI 동적 컨텍스트 (변동 ±15% 이상) ───
        if (Math.abs(deltaPct) >= 15) {
          const { data: recentTracking } = await sb.from("ktrenz_trend_tracking")
            .select("interest_score")
            .eq("keyword_id", kw.id)
            .order("tracked_at", { ascending: false })
            .limit(10);
          const history = (recentTracking ?? []).map((r: any) => r.interest_score).reverse();

          const newContext = await generateDynamicContext(kw, artistName, buzzScore, deltaPct, history);
          if (newContext) {
            // ktrenz_keywords 컨텍스트 업데이트
            await sb.from("ktrenz_keywords").update({
              context: newContext,
              context_ko: newContext, context_ja: null, context_zh: null,
            }).eq("id", kw.id);
            // 레거시 동기화
            if (triggerId) {
              await sb.from("ktrenz_trend_triggers").update({
                context: newContext,
                context_ko: newContext, context_ja: null, context_zh: null,
              }).eq("id", triggerId);
            }
            console.log(`[trend-track] 🤖 Context updated: ${kw.keyword}`);
          }
        }

        // ── 팔로우 알림 (레거시 트리거 기반) ──
        if (triggerId) {
          await notifyKeywordFollowers(sb, triggerId, kw.keyword, artistName, influence, deltaPct);
        }

        trackedCount++;
        results.push({
          keyword: kw.keyword, artist: artistName, buzz_score: buzzScore,
          delta_pct: deltaPct, api_total: apiTotal, baseline, peak, influence,
          is_first_track: isFirstTrack, has_shopping: isShoppingCategory,
        });

        await new Promise(r => setTimeout(r, 500)); // rate limit

        // ─── 스마트 만료 ───
        const ageDays = (Date.now() - new Date(kw.created_at).getTime()) / 86400000;
        let shouldExpire = false, expireReason = "";

        if (ageDays >= 3 && influence <= 5) {
          const { data: recent } = await sb.from("ktrenz_trend_tracking")
            .select("interest_score").eq("keyword_id", kw.id)
            .gte("tracked_at", new Date(Date.now() - 3 * 86400000).toISOString())
            .order("tracked_at", { ascending: false }).limit(10);
          const scores = (recent ?? []).map((r: any) => r.interest_score);
          if (scores.length >= 3 && scores.every((s: number) => s <= Math.max(baseline, 10))) {
            shouldExpire = true; expireReason = "early_decay";
          }
        }
        if (!shouldExpire && ageDays > 14 && influence <= 20) {
          shouldExpire = true; expireReason = "lifecycle_end";
        }
        if (!shouldExpire && ageDays > 30) {
          shouldExpire = true; expireReason = "hard_cap_30d";
        }

        if (shouldExpire) {
          const now = new Date();
          const lifetimeH = Math.round((now.getTime() - new Date(kw.created_at).getTime()) / 3600000 * 10) / 10;
          const peakDelayH = kw.peak_at
            ? Math.round((new Date(kw.peak_at).getTime() - new Date(kw.created_at).getTime()) / 3600000 * 10) / 10 : 0;

          // ktrenz_keywords 만료
          await sb.from("ktrenz_keywords").update({
            status: "expired",
            metadata: { ...((kw.metadata as any) || {}), expired_at: now.toISOString(), lifetime_hours: lifetimeH, peak_delay_hours: peakDelayH, expire_reason: expireReason },
          }).eq("id", kw.id);

          // 레거시 동기화
          if (triggerId) {
            await sb.from("ktrenz_trend_triggers").update({
              status: "expired", expired_at: now.toISOString(), lifetime_hours: lifetimeH, peak_delay_hours: peakDelayH,
            }).eq("id", triggerId);
          }
          console.log(`[trend-track] Expired (${expireReason}): ${kw.keyword}`);
        }
      } catch (e) {
        console.warn(`[trend-track] Error: ${kw.keyword}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true, batchOffset, totalCandidates: totalKeywords,
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
