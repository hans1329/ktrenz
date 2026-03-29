// T2 Trend Track v4: 기존 active 키워드의 버즈 점수 재측정 + delta 계산 + AI 동적 컨텍스트
// detect와 동일한 공식: news(60%) + blog(40%), 네이버 API 단독
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

function buildContextFacts(trigger: any): string[] {
  const facts = [
    stripHtmlTags(trigger.source_title),
    stripHtmlTags(trigger.keyword_ko || trigger.keyword),
    stripHtmlTags(trigger.artist_name),
  ].filter(Boolean);

  return Array.from(new Set(facts)).slice(0, 3);
}

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
    const historyPattern = summarizeHistoryPattern(trackingHistory, deltaPct);
    const freshness = describeFreshness(ageDays);
    const categoryGuide = describeCategory(trigger.keyword_category);
    const contextFacts = buildContextFacts(trigger);

    // 트렌드 방향성을 정성적으로 변환
    const momentum = deltaPct > 30 ? "급격히 상승 중"
      : deltaPct > 10 ? "상승세"
      : deltaPct > -10 ? "안정적"
      : deltaPct > -30 ? "하락세"
      : "급격히 하락 중";

    const peakStatus = peak > 0 && buzzScore >= peak * 0.9 ? "피크 수준 유지"
      : peak > 0 && buzzScore >= peak * 0.5 ? "피크 대비 중간 수준"
      : peak > 0 ? "피크 대비 낮은 수준"
      : "초기 단계";

    const prompt = `당신은 K-pop 트렌드 편집자입니다. 아래 추적 정보를 기반으로, 이 키워드 트렌드의 현재 상태를 2문장 이하의 편집자 톤(Editorial Narrative)으로 작성하세요.

★ 절대 금지 사항:
- 내부 점수, 수치, 퍼센트, 스코어, 지수 등 구체적 숫자를 일절 언급하지 마세요.
- "점수가 31", "244% 변화", "influence index" 같은 표현을 절대 사용하지 마세요.
- 아래 금지 문구를 그대로 반복하지 마세요: "현재는 그 관심이 급격히 하락하고 있다", "초기의 뜨거운 반응과는 달리", "팬들의 열기가 다소 식어가며 안정세를 보이고 있다".
- 이전 컨텍스트의 문장을 재사용하거나 어순만 바꾸는 것도 금지합니다.

★ 작성 규칙:
- '[구체적 상황/배경] → [현재 트렌드 현상/대중 반응]' 패턴을 따르세요.
- 기사에서 나올 법한 구체적 맥락(브랜드명, 행사, 콜라보, 콘텐츠 장면, 팬 반응 포인트 등)을 포함하세요.
- 문장마다 서로 다른 정보 역할을 가지세요. 1문장은 계기/맥락, 2문장은 현재 반응의 질감과 흐름을 설명하세요.
- 하락 국면이라도 무조건 "식었다"고 쓰지 말고, 잔존 화제·담론 이동·반응 정리·재상승 여지 중 실제 흐름에 맞는 표현을 고르세요.
- 아래 핵심 사실 중 최소 1개를 자연스럽게 반영하세요: ${contextFacts.length ? contextFacts.join(" / ") : "키워드와 아티스트의 결합 맥락"}
- 반드시 한국어로 작성하세요.

아티스트: ${trigger.artist_name}
키워드: ${trigger.keyword}
카테고리: ${trigger.keyword_category || "general"}
분야: ${isShop ? "쇼핑/커머스" : "뉴스/블로그"}
카테고리 해석 가이드: ${categoryGuide}
이슈 신선도: ${freshness}
히스토리 패턴: ${historyPattern}
현재 추세: ${momentum}
피크 대비 상태: ${peakStatus}
트렌드 방향 (최근 추이): ${trendDirection}
감지 후 경과일: ${ageDays}일
 ${trigger.source_title ? `소스 제목: ${stripHtmlTags(trigger.source_title)}` : ""}
 ${trigger.context ? `이전 컨텍스트(내용만 참고, 문장 재사용 금지): ${stripHtmlTags(trigger.context)}` : ""}

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
  // shopTotal: 상품 수 → 로그 정규화 (max ~1M 기준)
  const shopNorm = shopTotal > 0 ? (Math.log10(shopTotal + 1) / Math.log10(1000001)) * 100 : 0;
  // datalab이 0이면 shop 가중치를 높여서 변동 반영
  const w = searchScore > 0 ? 0.6 : 0;
  const shopW = searchScore > 0 ? 0.4 : 1.0;
  const raw = searchScore * w + shopNorm * shopW;
  return Math.round(Math.min(raw, 100) * 100) / 100; // 소수점 2자리 유지
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

// peak/influence 갱신 — apiTotal (raw API 건수)로 비교해야 detect의 baseline_score와 스케일 일치
async function updateCausalMetrics(sb: any, triggerId: string, apiTotal: number, isShopTrigger = false) {
  const { data: trigger } = await sb
    .from("ktrenz_trend_triggers")
    .select("baseline_score, peak_score")
    .eq("id", triggerId)
    .single();
  if (!trigger) return;

  const updates: any = {};
  const baseline = trigger.baseline_score ?? 0;

  if (baseline <= 0 && apiTotal > 0) {
    updates.baseline_score = apiTotal;
    updates.peak_score = apiTotal;
    updates.influence_index = 0;
  } else if (baseline > 0) {
    if (apiTotal > (trigger.peak_score || 0)) {
      updates.peak_score = apiTotal;
      updates.peak_at = new Date().toISOString();
    }
    const currentPeak = updates.peak_score ?? trigger.peak_score ?? apiTotal;
    const effectiveBaseline = Math.max(baseline, 10);
    updates.influence_index = Math.round(((currentPeak - baseline) / effectiveBaseline) * 10000) / 100;
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

    // ── 소셜/유튜브 소스 키워드의 플랫폼 점수 조회 헬퍼 ──
    async function getSocialScore(starId: string, platform: string): Promise<number> {
      try {
        if (platform === "youtube_search") {
          // YouTube: 키워드 검색 결과 수 기반 활성도 (YouTube Data API)
          const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
          if (!ytApiKey) return 0;
          const { data: trigger } = await sb.from("ktrenz_trend_triggers")
            .select("keyword, artist_name")
            .eq("star_id", starId)
            .eq("trigger_source", "youtube_search")
            .limit(1)
            .single();
          if (!trigger) return 0;
          const q = `${trigger.artist_name} ${trigger.keyword}`;
          const params = new URLSearchParams({
            part: "snippet", q, type: "video", order: "date",
            publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            maxResults: "1", relevanceLanguage: "ko", key: ytApiKey,
          });
          const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
          if (!res.ok) return 0;
          const json = await res.json();
          const totalResults = json.pageInfo?.totalResults ?? 0;
          // 0~100 정규화: log scale
          return Math.min(100, Math.round(Math.log10(totalResults + 1) * 25));
        }
        const { data } = await sb.from("ktrenz_social_snapshots")
          .select("metrics")
          .eq("star_id", starId)
          .eq("platform", platform)
          .order("collected_at", { ascending: false })
          .limit(1);
        if (!data?.length) return 0;
        const m = data[0].metrics as any;
        if (platform === "tiktok") return m?.tiktok_activity_score ?? 0;
        if (platform === "instagram") return m?.instagram_activity_score ?? 0;
        return 0;
      } catch { return 0; }
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
        const isShoppingCategory = ["brand", "product", "goods", "shopping"].includes(trigger.keyword_category || "");

        // 이전 추적 기록의 interest_score를 가져와서 delta 계산에 사용
        const { data: prevTracking } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score")
          .eq("trigger_id", trigger.id)
          .order("tracked_at", { ascending: false })
          .limit(1);
        const prevTrackScore = prevTracking?.[0]?.interest_score ?? null;

        // ─── 모든 키워드: 뉴스 + 블로그 버즈 점수 (통합) ───
        const searchQuery = `"${trigger.artist_name}" "${kwQuery}"`;
        const [newsResult, blogResult] = await Promise.all([
          searchNaverRecent(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverRecent(naverClientId, naverClientSecret, "blog", searchQuery),
        ]);

        const news24h = newsResult.recent24h;
        const blog24h = blogResult.recent24h;
        const news7d = newsResult.recent7d;
        const blog7d = blogResult.recent7d;
        const naverBuzzScore = (news24h + blog24h) * 3 + (news7d + blog7d);
        const apiNewsTotal = newsResult.total;
        const apiBlogTotal = blogResult.total;
        const apiTotal = apiNewsTotal + apiBlogTotal;
        const prevApiTotal = trigger.prev_api_total || 0;
        const dailyDelta = prevApiTotal > 0 ? apiTotal - prevApiTotal : 0;

        // ─── 소셜 소스 키워드: 하이브리드 점수 (소셜 50% + 네이버 50%) ───
        const isSocialSource = ["tiktok", "instagram"].includes(trigger.trigger_source || "");
        let buzzScore: number;
        let socialScore = 0;

        if (isSocialSource) {
          socialScore = await getSocialScore(trigger.star_id, trigger.trigger_source);
          // 네이버 버즈를 0-100 정규화
          const naverNorm = normalizeBuzzScore(news7d, blog7d);
          // 하이브리드: 소셜 자체 지표 50% + 네이버 버즈 50%
          buzzScore = Math.round(socialScore * 0.5 + naverNorm * 0.5);
        } else {
          buzzScore = naverBuzzScore;
        }

        const refScore = prevTrackScore ?? trigger.baseline_score ?? 0;
        const deltaPct = refScore > 0
          ? Math.round(((buzzScore - refScore) / refScore) * 10000) / 100
          : buzzScore > 0 ? 100 : 0;

        const rawResponse = {
          news_24h: news24h, blog_24h: blog24h,
          news_7d: news7d, blog_7d: blog7d,
          news_api_total: apiNewsTotal, blog_api_total: apiBlogTotal,
          api_total: apiTotal, daily_delta: dailyDelta,
          search_query: searchQuery,
          ...(isSocialSource ? {
            scoring_mode: "hybrid",
            social_score: socialScore,
            naver_normalized: normalizeBuzzScore(news7d, blog7d),
            social_platform: trigger.trigger_source,
          } : { scoring_mode: "naver_only" }),
        };

        console.log(`[trend-track] ✓ "${trigger.artist_name}/${trigger.keyword}" buzz=${buzzScore}${isSocialSource ? ` (hybrid: social=${socialScore} naver=${normalizeBuzzScore(news7d, blog7d)})` : ` (24h:${news24h+blog24h} 7d:${news7d+blog7d})`} Δ=${deltaPct}%`);

        // ─── 쇼핑 카테고리: 별도 테이블에 쇼핑 데이터 수집 ───
        if (isShoppingCategory) {
          try {
            const [datalabResult, shopResult] = await Promise.all([
              searchNaverDatalab(naverClientId, naverClientSecret, kwQuery),
              searchNaverShop(naverClientId, naverClientSecret, kwQuery),
            ]);
            const compositeScore = computeShopScore(datalabResult.latestRatio, shopResult.total);

            await sb.from("ktrenz_shopping_tracking").insert({
              trigger_id: trigger.id,
              star_id: trigger.star_id || null,
              keyword: kwQuery,
              keyword_category: trigger.keyword_category,
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
            console.log(`[trend-track] 🛒 Shopping data saved: "${kwQuery}" datalab=${datalabResult.latestRatio} shop=${shopResult.total} composite=${compositeScore}`);
          } catch (shopErr) {
            console.warn(`[trend-track] Shopping tracking error for "${kwQuery}": ${(shopErr as Error).message}`);
          }
        }

        // tracking 레코드 저장 (뉴스/블로그 기반 점수)
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: trigger.id,
          wiki_entry_id: null,
          keyword: trigger.keyword,
          interest_score: buzzScore,
          region: "naver",
          delta_pct: deltaPct,
          raw_response: rawResponse,
        });

        // 중복 트리거 복사
        for (const dupId of (dupMap.get(trigger.id) || [])) {
          const dup = triggers.find((t: any) => t.id === dupId);
          if (dup) {
            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: dupId, wiki_entry_id: null, keyword: dup.keyword,
              interest_score: buzzScore, region: "naver",
              delta_pct: deltaPct, raw_response: rawResponse,
            });
            await updateCausalMetrics(sb, dupId, apiTotal, false);
            await sb.from("ktrenz_trend_triggers").update({ prev_api_total: apiTotal }).eq("id", dupId);
          }
        }

        await updateCausalMetrics(sb, trigger.id, apiTotal, false);
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
              context_ko: newContext, context_ja: null, context_zh: null,
            }).eq("id", trigger.id);
            console.log(`[trend-track] 🤖 Dynamic context updated: ${trigger.keyword}`);
          }
        }

        await notifyKeywordFollowers(sb, trigger, deltaPct);

        trackedCount++;
        results.push({ keyword: trigger.keyword, artist: trigger.artist_name, buzz_score: buzzScore, daily_delta: dailyDelta, delta_pct: deltaPct, api_total: apiTotal, source: "news_blog", has_shopping: isShoppingCategory });

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
