// T2 Trend Track v6: 5-Source Multi-Platform Keyword Buzz Tracker
// 키워드 단독으로 5개 플랫폼(네이버 뉴스/블로그, 데이터랩, 유튜브, 틱톡, 인스타)의
// 원본 측정값을 수집하고, 이전 주기 대비 변화율(delta%)을 가중 합산하여 종합 influence 산출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── 가중치 ───
const WEIGHTS = {
  naver: 0.25,    // 뉴스/블로그
  datalab: 0.15,  // 네이버 데이터랩 검색 트렌드
  youtube: 0.25,  // 유튜브 검색 통계
  tiktok: 0.20,   // 틱톡 검색
  insta: 0.15,    // 인스타그램 검색
};

const MIN_THRESHOLD = 1; // delta 계산 시 0 나눔 방지용 최소 임계

// ─── 소스별 측정값 타입 ───
interface SourceRaw {
  naver_news_total: number;
  naver_blog_total: number;
  naver_news_24h: number;
  naver_blog_24h: number;
  datalab_ratio: number;
  datalab_trend_7d: number[];
  youtube_video_count: number;
  youtube_total_views: number;
  youtube_total_comments: number;
  tiktok_video_count: number;
  tiktok_total_views: number;
  tiktok_total_likes: number;
  tiktok_total_comments: number;
  insta_post_count: number;
  insta_total_likes: number;
  insta_total_comments: number;
}

function emptyRaw(): SourceRaw {
  return {
    naver_news_total: 0, naver_blog_total: 0, naver_news_24h: 0, naver_blog_24h: 0,
    datalab_ratio: 0, datalab_trend_7d: [],
    youtube_video_count: 0, youtube_total_views: 0, youtube_total_comments: 0,
    tiktok_video_count: 0, tiktok_total_views: 0, tiktok_total_likes: 0, tiktok_total_comments: 0,
    insta_post_count: 0, insta_total_likes: 0, insta_total_comments: 0,
  };
}

// ─── 소스별 "활동량" 단일값 산출 (delta 계산용) ───
function naverActivity(r: SourceRaw): number {
  return (r.naver_news_24h + r.naver_blog_24h) * 3 + r.naver_news_total + r.naver_blog_total;
}
function datalabActivity(r: SourceRaw): number {
  return r.datalab_ratio;
}
function youtubeActivity(r: SourceRaw): number {
  return r.youtube_total_views + r.youtube_total_comments * 10;
}
function tiktokActivity(r: SourceRaw): number {
  return r.tiktok_total_views + r.tiktok_total_likes * 2 + r.tiktok_total_comments * 5;
}
function instaActivity(r: SourceRaw): number {
  return r.insta_total_likes + r.insta_total_comments * 5;
}

// ─── Delta % 계산 ───
function calcDelta(current: number, previous: number): number {
  const base = Math.max(previous, MIN_THRESHOLD);
  return Math.round(((current - base) / base) * 10000) / 100;
}

// ─── 가중 합산 delta ───
function computeWeightedDelta(current: SourceRaw, prev: SourceRaw): { weightedDelta: number; sourceScores: Record<string, number> } {
  const deltas: Record<string, number> = {
    naver: calcDelta(naverActivity(current), naverActivity(prev)),
    datalab: calcDelta(datalabActivity(current), datalabActivity(prev)),
    youtube: calcDelta(youtubeActivity(current), youtubeActivity(prev)),
    tiktok: calcDelta(tiktokActivity(current), tiktokActivity(prev)),
    insta: calcDelta(instaActivity(current), instaActivity(prev)),
  };

  let weightedDelta = 0;
  for (const [src, w] of Object.entries(WEIGHTS)) {
    weightedDelta += deltas[src] * w;
  }

  return { weightedDelta: Math.round(weightedDelta * 100) / 100, sourceScores: deltas };
}

// ─── 종합 buzz score (현재 활동량의 로그 스케일 합산) ───
function computeBuzzScore(r: SourceRaw): number {
  const n = naverActivity(r);
  const d = datalabActivity(r);
  const y = youtubeActivity(r);
  const t = tiktokActivity(r);
  const i = instaActivity(r);
  // 각 소스 활동량을 로그 스케일로 0~20 범위 후 합산 → 0~100
  const logScale = (v: number, cap: number) => v > 0 ? (Math.log10(v + 1) / Math.log10(cap + 1)) * 20 : 0;
  return Math.round(Math.min(
    logScale(n, 10000) + logScale(d, 100) + logScale(y, 10000000) + logScale(t, 10000000) + logScale(i, 1000000),
    100
  ));
}

// ══════════════════════════════════════════════
// ─── API 호출 함수들 ───
// ══════════════════════════════════════════════

// ── 네이버 뉴스/블로그 ──
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
    const oneDayAgo = Date.now() - 86400000;
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    let count24h = 0, count7d = 0;
    for (const item of items) {
      const pubTime = endpoint === "blog" ? parseBlogPostdate(item.postdate) : (item.pubDate ? new Date(item.pubDate).getTime() : 0);
      if (pubTime >= oneDayAgo) count24h++;
      if (pubTime >= sevenDaysAgo) count7d++;
    }
    return { recent24h: count24h, recent7d: count7d, total: apiTotal };
  } catch { return { recent24h: 0, recent7d: 0, total: 0 }; }
}

// ── 네이버 데이터랩 ──
async function searchNaverDatalab(
  clientId: string, clientSecret: string, keyword: string,
): Promise<{ latestRatio: number; trend: number[] }> {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: fmt(startDate), endDate: fmt(endDate), timeUnit: "date",
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
    if (!response.ok) return { latestRatio: 0, trend: [] };
    const data = await response.json();
    const ratios = (data.results?.[0]?.data || []).map((d: any) => d.ratio || 0);
    return { latestRatio: ratios.length > 0 ? Math.round(ratios[ratios.length - 1] * 100) / 100 : 0, trend: ratios.slice(-7) };
  } catch { return { latestRatio: 0, trend: [] }; }
}

// ── 유튜브 검색 ──
async function searchYouTube(
  apiKey: string, keyword: string,
): Promise<{ videoCount: number; totalViews: number; totalComments: number }> {
  try {
    // 1) 최근 7일 영상 검색
    const publishedAfter = new Date(Date.now() - 7 * 86400000).toISOString();
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "id");
    searchUrl.searchParams.set("q", keyword);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("order", "date");
    searchUrl.searchParams.set("publishedAfter", publishedAfter);
    searchUrl.searchParams.set("maxResults", "10");
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) return { videoCount: 0, totalViews: 0, totalComments: 0 };
    const searchData = await searchRes.json();
    const videoIds = (searchData.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
    const videoCount = searchData.pageInfo?.totalResults || videoIds.length;

    if (videoIds.length === 0) return { videoCount, totalViews: 0, totalComments: 0 };

    // 2) 영상 통계 조회
    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics");
    statsUrl.searchParams.set("id", videoIds.slice(0, 10).join(","));
    statsUrl.searchParams.set("key", apiKey);

    const statsRes = await fetch(statsUrl.toString());
    if (!statsRes.ok) return { videoCount, totalViews: 0, totalComments: 0 };
    const statsData = await statsRes.json();

    let totalViews = 0, totalComments = 0;
    for (const item of (statsData.items || [])) {
      totalViews += Number(item.statistics?.viewCount || 0);
      totalComments += Number(item.statistics?.commentCount || 0);
    }
    return { videoCount, totalViews, totalComments };
  } catch { return { videoCount: 0, totalViews: 0, totalComments: 0 }; }
}

// ── 틱톡 검색 (RapidAPI) ──
const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";

async function searchTikTok(
  apiKey: string, keyword: string,
): Promise<{ videoCount: number; totalViews: number; totalLikes: number; totalComments: number }> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/search/general?keyword=${encodeURIComponent(keyword)}&count=10`;
    const res = await fetch(url, {
      headers: { "x-rapidapi-host": TIKTOK_API_HOST, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) return { videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 };
    const text = await res.text();
    if (!text.trim()) return { videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 };
    const data = JSON.parse(text);
    const items = (data.data || []).filter((i: any) => i.item);
    let totalViews = 0, totalLikes = 0, totalComments = 0;
    for (const item of items) {
      const s = item.item?.stats || {};
      totalViews += Number(s.playCount || 0);
      totalLikes += Number(s.diggCount || 0);
      totalComments += Number(s.commentCount || 0);
    }
    return { videoCount: items.length, totalViews, totalLikes, totalComments };
  } catch { return { videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 }; }
}

// ── 인스타그램 검색 (RapidAPI) ──
const INSTA_API_HOST = "instagram-scraper-api2.p.rapidapi.com";

async function searchInstagram(
  apiKey: string, keyword: string,
): Promise<{ postCount: number; totalLikes: number; totalComments: number }> {
  try {
    const url = `https://${INSTA_API_HOST}/v1/hashtag?hashtag=${encodeURIComponent(keyword.replace(/\s+/g, ""))}`;
    const res = await fetch(url, {
      headers: { "x-rapidapi-host": INSTA_API_HOST, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) return { postCount: 0, totalLikes: 0, totalComments: 0 };
    const data = await res.json();
    const items = data.data?.items || [];
    let totalLikes = 0, totalComments = 0;
    for (const item of items) {
      totalLikes += Number(item.like_count || 0);
      totalComments += Number(item.comment_count || 0);
    }
    return { postCount: items.length || data.data?.count || 0, totalLikes, totalComments };
  } catch { return { postCount: 0, totalLikes: 0, totalComments: 0 }; }
}

// ── 네이버 쇼핑 ──
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

// ─── AI 동적 컨텍스트 ───
function stripHtmlTags(text: string | null | undefined): string {
  return (text || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function summarizeHistoryPattern(history: number[], deltaPct: number): string {
  if (history.length < 2) return "초기 반응을 형성 중인 단계";
  const last = history[history.length - 1] ?? 0;
  const first = history[0] ?? 0;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const spread = max - min;
  if (history.length >= 4) {
    const lt = history.slice(-3);
    if (lt[2] > lt[1] && lt[1] <= lt[0]) return "한 차례 반응이 잦아든 뒤 다시 언급이 붙는 재상승 국면";
    if (lt[2] < lt[1] && lt[1] <= lt[0]) return "초기 반응 이후 열기가 서서히 정리되는 흐름";
    if (spread <= Math.max(5, last * 0.15)) return "짧은 기간 동안 관심도가 일정하게 유지되는 흐름";
  }
  if (deltaPct >= 35) return "짧은 시간 안에 반응이 빠르게 커진 확산 구간";
  if (deltaPct <= -35) return "직전 대비 화제성이 눈에 띄게 빠진 조정 구간";
  if (last > first) return "완만하게 저변을 넓혀가는 상승 흐름";
  if (last < first) return "집중 반응 이후 진폭을 줄여가는 정리 흐름";
  return "특정 계기 이후 비슷한 강도로 언급이 이어지는 상태";
}

async function generateDynamicContext(
  keyword: any, artistName: string, buzzScore: number, deltaPct: number, trackingHistory: number[],
): Promise<string | null> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;
  try {
    const ageDays = Math.round((Date.now() - new Date(keyword.created_at).getTime()) / 86400000);
    const historyPattern = summarizeHistoryPattern(trackingHistory, deltaPct);
    const momentum = deltaPct > 30 ? "급격히 상승 중" : deltaPct > 10 ? "상승세" : deltaPct > -10 ? "안정적" : deltaPct > -30 ? "하락세" : "급격히 하락 중";

    const prompt = `당신은 K-pop 트렌드 편집자입니다. 아래 추적 정보를 기반으로, 이 키워드 트렌드의 현재 상태를 2문장 이하의 편집자 톤(Editorial Narrative)으로 작성하세요.

★ 절대 금지: 내부 점수, 수치, 퍼센트 등 구체적 숫자 언급 금지. 이전 컨텍스트 재사용 금지.
★ 작성 규칙: '[구체적 상황] → [트렌드 현상/대중 반응]' 패턴. 반드시 한국어.

아티스트: ${artistName}
키워드: ${keyword.keyword_ko || keyword.keyword}
히스토리 패턴: ${historyPattern}
현재 추세: ${momentum}
감지 후 경과일: ${ageDays}일
${keyword.source_title ? `소스 제목: ${stripHtmlTags(keyword.source_title)}` : ""}
${keyword.context ? `이전 컨텍스트(참고만, 재사용 금지): ${stripHtmlTags(keyword.context)}` : ""}

해석만 작성하세요.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], max_tokens: 150, temperature: 0.95 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch { return null; }
}

// ── 키워드 팔로우 알림 ──
async function notifyKeywordFollowers(sb: any, triggerId: string, keyword: string, artistName: string, influenceIndex: number, deltaPct: number) {
  try {
    if (Math.abs(deltaPct) < 10) return;
    const { data: followers } = await sb.from("ktrenz_keyword_follows").select("id, user_id, keyword, last_influence_index").eq("trigger_id", triggerId);
    if (!followers?.length) return;
    const notifications: any[] = [];
    for (const f of followers) {
      const oldVal = f.last_influence_index ?? 0;
      if (Math.abs(influenceIndex - oldVal) < 5 && Math.abs(deltaPct) < 20) continue;
      const dir = influenceIndex > oldVal ? "up" : "down";
      const emoji = dir === "up" ? "📈" : "📉";
      notifications.push({
        user_id: f.user_id, follow_id: f.id, trigger_id: triggerId,
        keyword, artist_name: artistName,
        notification_type: dir === "up" ? "influence_up" : "influence_down",
        old_value: oldVal, new_value: influenceIndex, delta_pct: deltaPct,
        message: `${emoji} ${keyword} (${artistName}): ${oldVal.toFixed(0)} → ${influenceIndex.toFixed(0)} (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`,
      });
    }
    if (notifications.length > 0) {
      await sb.from("ktrenz_keyword_notifications").insert(notifications);
      for (const f of followers) {
        await sb.from("ktrenz_keyword_follows").update({ last_influence_index: influenceIndex }).eq("id", f.id);
      }
    }
  } catch (e) { console.warn(`[trend-track] Notify error: ${(e as Error).message}`); }
}

// ══════════════════════════════════════════════
// ─── MAIN HANDLER ───
// ══════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { keywordId, batchSize = 10, batchOffset = 0 } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const naverClientId = Deno.env.get("NAVER_CLIENT_ID") || "";
    const naverClientSecret = Deno.env.get("NAVER_CLIENT_SECRET") || "";
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!naverClientId || !naverClientSecret) {
      return new Response(JSON.stringify({ success: false, error: "NAVER credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── 대상 조회: ktrenz_keywords에서 active 키워드 (7일 이내) ───
    let keywords: any[];
    let totalKeywords = 0;

    if (keywordId) {
      const { data } = await sb.from("ktrenz_keywords").select("*").eq("id", keywordId).single();
      keywords = data ? [data] : [];
      totalKeywords = keywords.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { count } = await sb.from("ktrenz_keywords").select("id", { count: "exact", head: true }).eq("status", "active").gte("created_at", weekAgo);
      totalKeywords = count ?? 0;
      const { data } = await sb.from("ktrenz_keywords").select("*").eq("status", "active").gte("created_at", weekAgo)
        .order("created_at", { ascending: false }).range(batchOffset, batchOffset + batchSize - 1);
      keywords = data || [];
    }

    if (!keywords.length) {
      return new Response(JSON.stringify({ success: true, message: "No active keywords", tracked: 0, totalCandidates: totalKeywords }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 소스(아티스트 연결점) 조회 ──
    const keywordIds = keywords.map((k: any) => k.id);
    const { data: allSources } = await sb.from("ktrenz_keyword_sources")
      .select("keyword_id, star_id, artist_name")
      .in("keyword_id", keywordIds.slice(0, 500))
      .order("created_at", { ascending: true });

    const sourceByKeyword = new Map<string, { star_id: string; artist_name: string }>();
    for (const s of (allSources || [])) {
      if (!sourceByKeyword.has(s.keyword_id)) sourceByKeyword.set(s.keyword_id, { star_id: s.star_id, artist_name: s.artist_name });
    }

    // ── 레거시 트리거 매핑 ──
    const { data: legacyTriggers } = await sb.from("ktrenz_trend_triggers").select("id, keyword, metadata").in("status", ["active", "pending"]);
    const triggerByKeywordId = new Map<string, string>();
    for (const t of (legacyTriggers || [])) {
      const kwId = (t.metadata as any)?.keyword_id;
      if (kwId) triggerByKeywordId.set(kwId, t.id);
    }

    console.log(`[trend-track] 🚀 5-source tracking: ${keywords.length} keywords (offset=${batchOffset}, total=${totalKeywords})`);
    console.log(`[trend-track] APIs: naver=✓ datalab=✓ youtube=${youtubeApiKey ? "✓" : "✗"} tiktok=${rapidApiKey ? "✓" : "✗"} insta=${rapidApiKey ? "✓" : "✗"}`);

    let trackedCount = 0;
    const results: any[] = [];

    for (const kw of keywords) {
      try {
        const kwQuery = kw.keyword_ko || kw.keyword;
        const source = sourceByKeyword.get(kw.id);
        const artistName = source?.artist_name || "Unknown";
        const isShoppingCategory = ["brand", "product", "goods", "shopping"].includes(kw.keyword_category || "");
        const searchQuery = `"${kwQuery}"`;

        // ─── 이전 추적 데이터 조회 (소스별 raw) ───
        const { data: prevTracking } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score, naver_news_total, naver_blog_total, naver_news_24h, naver_blog_24h, datalab_ratio, youtube_video_count, youtube_total_views, youtube_total_comments, tiktok_video_count, tiktok_total_views, tiktok_total_likes, tiktok_total_comments, insta_post_count, insta_total_likes, insta_total_comments")
          .eq("keyword_id", kw.id)
          .order("tracked_at", { ascending: false })
          .limit(1);

        const prevRaw: SourceRaw = prevTracking?.[0] ? {
          naver_news_total: prevTracking[0].naver_news_total || 0,
          naver_blog_total: prevTracking[0].naver_blog_total || 0,
          naver_news_24h: prevTracking[0].naver_news_24h || 0,
          naver_blog_24h: prevTracking[0].naver_blog_24h || 0,
          datalab_ratio: prevTracking[0].datalab_ratio || 0,
          datalab_trend_7d: [],
          youtube_video_count: prevTracking[0].youtube_video_count || 0,
          youtube_total_views: prevTracking[0].youtube_total_views || 0,
          youtube_total_comments: prevTracking[0].youtube_total_comments || 0,
          tiktok_video_count: prevTracking[0].tiktok_video_count || 0,
          tiktok_total_views: prevTracking[0].tiktok_total_views || 0,
          tiktok_total_likes: prevTracking[0].tiktok_total_likes || 0,
          tiktok_total_comments: prevTracking[0].tiktok_total_comments || 0,
          insta_post_count: prevTracking[0].insta_post_count || 0,
          insta_total_likes: prevTracking[0].insta_total_likes || 0,
          insta_total_comments: prevTracking[0].insta_total_comments || 0,
        } : emptyRaw();

        // ─── 5소스 병렬 수집 ───
        const [newsResult, blogResult, datalabResult, ytResult, tiktokResult, instaResult] = await Promise.all([
          searchNaverRecent(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverRecent(naverClientId, naverClientSecret, "blog", searchQuery),
          searchNaverDatalab(naverClientId, naverClientSecret, kwQuery),
          youtubeApiKey ? searchYouTube(youtubeApiKey, kwQuery) : Promise.resolve({ videoCount: 0, totalViews: 0, totalComments: 0 }),
          rapidApiKey ? searchTikTok(rapidApiKey, kwQuery) : Promise.resolve({ videoCount: 0, totalViews: 0, totalLikes: 0, totalComments: 0 }),
          rapidApiKey ? searchInstagram(rapidApiKey, kwQuery) : Promise.resolve({ postCount: 0, totalLikes: 0, totalComments: 0 }),
        ]);

        const currentRaw: SourceRaw = {
          naver_news_total: newsResult.total,
          naver_blog_total: blogResult.total,
          naver_news_24h: newsResult.recent24h,
          naver_blog_24h: blogResult.recent24h,
          datalab_ratio: datalabResult.latestRatio,
          datalab_trend_7d: datalabResult.trend,
          youtube_video_count: ytResult.videoCount,
          youtube_total_views: ytResult.totalViews,
          youtube_total_comments: ytResult.totalComments,
          tiktok_video_count: tiktokResult.videoCount,
          tiktok_total_views: tiktokResult.totalViews,
          tiktok_total_likes: tiktokResult.totalLikes,
          tiktok_total_comments: tiktokResult.totalComments,
          insta_post_count: instaResult.postCount,
          insta_total_likes: instaResult.totalLikes,
          insta_total_comments: instaResult.totalComments,
        };

        // ─── 종합 buzz + 가중 delta 계산 ───
        const buzzScore = computeBuzzScore(currentRaw);
        const isFirstTrack = kw.baseline_score === 0 || kw.baseline_score === null;
        const { weightedDelta, sourceScores } = isFirstTrack
          ? { weightedDelta: 0, sourceScores: { naver: 0, datalab: 0, youtube: 0, tiktok: 0, insta: 0 } }
          : computeWeightedDelta(currentRaw, prevRaw);

        // ─── baseline/peak/influence 갱신 ───
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
          kwUpdates.baseline_raw = currentRaw;
          kwUpdates.peak_raw = currentRaw;
          console.log(`[trend-track] 📊 First track: "${kwQuery}" buzz=${baseline}`);
        } else if (baseline > 0) {
          if (buzzScore > peak) {
            peak = buzzScore;
            kwUpdates.peak_score = peak;
            kwUpdates.peak_at = new Date().toISOString();
            kwUpdates.peak_raw = currentRaw;
          }
          const effectiveBaseline = Math.max(baseline, 10);
          influence = Math.round(((peak - baseline) / effectiveBaseline) * 10000) / 100;
          kwUpdates.influence_index = influence;
        }

        console.log(`[trend-track] ✓ "${kwQuery}" buzz=${buzzScore} Δw=${weightedDelta}% naver=${sourceScores.naver}% yt=${sourceScores.youtube}% tt=${sourceScores.tiktok}% ig=${sourceScores.insta}%${isFirstTrack ? " [FIRST]" : ""}`);

        // ─── ktrenz_keywords 업데이트 ───
        await sb.from("ktrenz_keywords").update(kwUpdates).eq("id", kw.id);

        // ─── ktrenz_trend_tracking 저장 (소스별 raw 포함) ───
        const triggerId = triggerByKeywordId.get(kw.id) || null;
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: triggerId,
          keyword_id: kw.id,
          wiki_entry_id: null,
          keyword: kw.keyword,
          interest_score: buzzScore,
          region: "multi",
          delta_pct: weightedDelta,
          weighted_delta: weightedDelta,
          source_scores: sourceScores,
          // 소스별 원본값
          naver_news_total: currentRaw.naver_news_total,
          naver_blog_total: currentRaw.naver_blog_total,
          naver_news_24h: currentRaw.naver_news_24h,
          naver_blog_24h: currentRaw.naver_blog_24h,
          datalab_ratio: currentRaw.datalab_ratio,
          datalab_trend_7d: currentRaw.datalab_trend_7d,
          youtube_video_count: currentRaw.youtube_video_count,
          youtube_total_views: currentRaw.youtube_total_views,
          youtube_total_comments: currentRaw.youtube_total_comments,
          tiktok_video_count: currentRaw.tiktok_video_count,
          tiktok_total_views: currentRaw.tiktok_total_views,
          tiktok_total_likes: currentRaw.tiktok_total_likes,
          tiktok_total_comments: currentRaw.tiktok_total_comments,
          insta_post_count: currentRaw.insta_post_count,
          insta_total_likes: currentRaw.insta_total_likes,
          insta_total_comments: currentRaw.insta_total_comments,
          raw_response: { scoring_mode: "multi_source_v6", weights: WEIGHTS },
        });

        // ─── 레거시 동기화 ───
        if (triggerId) {
          await sb.from("ktrenz_trend_triggers").update({
            baseline_score: baseline, peak_score: peak, influence_index: influence,
            prev_api_total: currentRaw.naver_news_total + currentRaw.naver_blog_total,
          }).eq("id", triggerId);
        }

        // ─── 쇼핑 카테고리: 별도 테이블 ───
        if (isShoppingCategory) {
          try {
            const shopResult = await searchNaverShop(naverClientId, naverClientSecret, kwQuery);
            const compositeScore = datalabResult.latestRatio * 0.6 + (shopResult.total > 0 ? (Math.log10(shopResult.total + 1) / Math.log10(1000001)) * 100 * 0.4 : 0);
            await sb.from("ktrenz_shopping_tracking").insert({
              trigger_id: triggerId, star_id: source?.star_id || null,
              keyword: kwQuery, keyword_category: kw.keyword_category,
              datalab_ratio: datalabResult.latestRatio, datalab_trend_7d: datalabResult.trend,
              shop_total: shopResult.total, shop_recent_items: shopResult.recentItems,
              composite_score: Math.round(Math.min(compositeScore, 100) * 100) / 100,
              search_volume: datalabResult.latestRatio,
              raw_response: { shop_total: shopResult.total, shop_recent_items: shopResult.recentItems },
            });
          } catch (e) { console.warn(`[trend-track] Shopping error: ${(e as Error).message}`); }
        }

        // ─── AI 동적 컨텍스트 (변동 ±15%) ───
        if (Math.abs(weightedDelta) >= 15) {
          const { data: recentTracking } = await sb.from("ktrenz_trend_tracking")
            .select("interest_score").eq("keyword_id", kw.id)
            .order("tracked_at", { ascending: false }).limit(10);
          const history = (recentTracking ?? []).map((r: any) => r.interest_score).reverse();
          const newContext = await generateDynamicContext(kw, artistName, buzzScore, weightedDelta, history);
          if (newContext) {
            await sb.from("ktrenz_keywords").update({ context: newContext, context_ko: newContext, context_ja: null, context_zh: null }).eq("id", kw.id);
            if (triggerId) {
              await sb.from("ktrenz_trend_triggers").update({ context: newContext, context_ko: newContext, context_ja: null, context_zh: null }).eq("id", triggerId);
            }
          }
        }

        // ── 팔로우 알림 ──
        if (triggerId) await notifyKeywordFollowers(sb, triggerId, kw.keyword, artistName, influence, weightedDelta);

        trackedCount++;
        results.push({
          keyword: kw.keyword, artist: artistName, buzz_score: buzzScore,
          weighted_delta: weightedDelta, source_scores: sourceScores,
          baseline, peak, influence, is_first_track: isFirstTrack,
        });

        await new Promise(r => setTimeout(r, 300)); // rate limit

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
        if (!shouldExpire && ageDays > 14 && influence <= 20) { shouldExpire = true; expireReason = "lifecycle_end"; }
        if (!shouldExpire && ageDays > 30) { shouldExpire = true; expireReason = "hard_cap_30d"; }

        if (shouldExpire) {
          const now = new Date();
          const lifetimeH = Math.round((now.getTime() - new Date(kw.created_at).getTime()) / 3600000 * 10) / 10;
          const peakDelayH = kw.peak_at ? Math.round((new Date(kw.peak_at).getTime() - new Date(kw.created_at).getTime()) / 3600000 * 10) / 10 : 0;
          await sb.from("ktrenz_keywords").update({
            status: "expired",
            metadata: { ...((kw.metadata as any) || {}), expired_at: now.toISOString(), lifetime_hours: lifetimeH, peak_delay_hours: peakDelayH, expire_reason: expireReason },
          }).eq("id", kw.id);
          if (triggerId) {
            await sb.from("ktrenz_trend_triggers").update({ status: "expired", expired_at: now.toISOString(), lifetime_hours: lifetimeH, peak_delay_hours: peakDelayH }).eq("id", triggerId);
          }
          console.log(`[trend-track] 💀 Expired (${expireReason}): ${kw.keyword}`);
        }
      } catch (e) {
        console.warn(`[trend-track] Error: ${kw.keyword}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, batchOffset, totalCandidates: totalKeywords, tracked: trackedCount, results }),
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
