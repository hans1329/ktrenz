// T2 Trend Track v8: Baseline-Delta + Velocity Dual Metric Tracker
// 키워드 단독으로 5개 플랫폼 원본 측정값을 수집
// delta_pct = 베이스값(첫 수집) 대비 변동률 (장기 성장률)
// velocity = 직전 수집 대비 변동률 (단기 추세 방향)
// 컨텍스트 갱신 없음 — 추적은 순수 수치 측정만 수행
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── 가중치 ───
const WEIGHTS = {
  naver: 0.25,
  datalab: 0.15,
  youtube: 0.25,
  tiktok: 0.20,
  insta: 0.15,
};

const MIN_THRESHOLD = 1;

// ─── 소스별 측정값 타입 (null = 미수집, 0 = 수집했으나 결과 없음) ───
interface SourceRaw {
  naver_news_total: number | null;
  naver_blog_total: number | null;
  naver_news_24h: number | null;
  naver_blog_24h: number | null;
  datalab_ratio: number | null;
  datalab_trend_7d: number[];
  youtube_video_count: number | null;
  youtube_total_views: number | null;
  youtube_total_comments: number | null;
  tiktok_video_count: number | null;
  tiktok_total_views: number | null;
  tiktok_total_likes: number | null;
  tiktok_total_comments: number | null;
  insta_post_count: number | null;
  insta_total_likes: number | null;
  insta_total_comments: number | null;
}

interface SourceAvailability {
  naver: boolean;
  datalab: boolean;
  youtube: boolean;
  tiktok: boolean;
  insta: boolean;
}

function getSourceAvailability(r: SourceRaw): SourceAvailability {
  return {
    naver: r.naver_news_total !== null || r.naver_blog_total !== null,
    datalab: r.datalab_ratio !== null,
    youtube: r.youtube_total_views !== null,
    tiktok: r.tiktok_total_views !== null,
    insta: r.insta_total_likes !== null,
  };
}

function getActiveWeights(avail: SourceAvailability): Record<string, number> {
  const active: Record<string, number> = {};
  let sum = 0;
  for (const [src, w] of Object.entries(WEIGHTS)) {
    if (avail[src as keyof SourceAvailability]) {
      active[src] = w;
      sum += w;
    }
  }
  if (sum > 0 && sum < 1) {
    for (const src of Object.keys(active)) {
      active[src] = active[src] / sum;
    }
  }
  return active;
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

// ─── 소스별 "활동량" 단일값 산출 ───
function naverActivity(r: SourceRaw): number {
  return ((r.naver_news_24h ?? 0) + (r.naver_blog_24h ?? 0)) * 3 + (r.naver_news_total ?? 0) + (r.naver_blog_total ?? 0);
}
function datalabActivity(r: SourceRaw): number {
  return r.datalab_ratio ?? 0;
}
function youtubeActivity(r: SourceRaw): number {
  return (r.youtube_total_views ?? 0) + (r.youtube_total_comments ?? 0) * 10;
}
function tiktokActivity(r: SourceRaw): number {
  return (r.tiktok_total_views ?? 0) + (r.tiktok_total_likes ?? 0) * 2 + (r.tiktok_total_comments ?? 0) * 5;
}
function instaActivity(r: SourceRaw): number {
  return (r.insta_total_likes ?? 0) + (r.insta_total_comments ?? 0) * 5;
}

// ─── Delta % 계산 (±500% cap) ───
function calcDelta(current: number, reference: number): number {
  const base = Math.max(reference, MIN_THRESHOLD);
  const raw = ((current - base) / base) * 100;
  return Math.round(Math.max(-500, Math.min(500, raw)) * 100) / 100;
}

// ─── 가중 합산 delta (기준값 대비, 미수집 소스 가중치 재정규화) ───
function computeWeightedDelta(current: SourceRaw, reference: SourceRaw): { weightedDelta: number; sourceScores: Record<string, number> } {
  const avail = getSourceAvailability(current);
  const activeWeights = getActiveWeights(avail);

  const deltas: Record<string, number> = {
    naver: avail.naver ? calcDelta(naverActivity(current), naverActivity(reference)) : 0,
    datalab: avail.datalab ? calcDelta(datalabActivity(current), datalabActivity(reference)) : 0,
    youtube: avail.youtube ? calcDelta(youtubeActivity(current), youtubeActivity(reference)) : 0,
    tiktok: avail.tiktok ? calcDelta(tiktokActivity(current), tiktokActivity(reference)) : 0,
    insta: avail.insta ? calcDelta(instaActivity(current), instaActivity(reference)) : 0,
  };

  let weightedDelta = 0;
  for (const [src, w] of Object.entries(activeWeights)) {
    weightedDelta += deltas[src] * w;
  }

  return { weightedDelta: Math.round(weightedDelta * 100) / 100, sourceScores: deltas };
}

// ─── 종합 buzz score ───
function computeBuzzScore(r: SourceRaw): number {
  const avail = getSourceAvailability(r);
  const activeCount = Object.values(avail).filter(Boolean).length;
  if (activeCount === 0) return 0;

  const logScale = (v: number, cap: number) => v > 0 ? (Math.log10(v + 1) / Math.log10(cap + 1)) * 20 : 0;

  let sum = 0;
  if (avail.naver) sum += logScale(naverActivity(r), 10000);
  if (avail.datalab) sum += logScale(datalabActivity(r), 100);
  if (avail.youtube) sum += logScale(youtubeActivity(r), 10000000);
  if (avail.tiktok) sum += logScale(tiktokActivity(r), 10000000);
  if (avail.insta) sum += logScale(instaActivity(r), 1000000);

  const scaled = (sum / activeCount) * 5;
  return Math.round(Math.min(scaled, 100));
}

// ══════════════════════════════════════════════
// ─── API 호출 함수들 ───
// ══════════════════════════════════════════════

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

async function searchNaverDatalab(
  clientId: string, clientSecret: string, keyword: string,
): Promise<{ latestRatio: number; trend: number[] } | null> {
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
    if (!response.ok) return null;
    const data = await response.json();
    const ratios = (data.results?.[0]?.data || []).map((d: any) => d.ratio || 0);
    return { latestRatio: ratios.length > 0 ? Math.round(ratios[ratios.length - 1] * 100) / 100 : 0, trend: ratios.slice(-7) };
  } catch { return null; }
}

async function searchYouTube(
  apiKey: string, keyword: string,
): Promise<{ videoCount: number; totalViews: number; totalComments: number }> {
  try {
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

const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";

async function searchTikTok(
  apiKey: string, keyword: string,
): Promise<{ videoCount: number; totalViews: number; totalLikes: number; totalComments: number } | null> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/search/general?keyword=${encodeURIComponent(keyword)}&count=10`;
    const res = await fetch(url, {
      headers: { "x-rapidapi-host": TIKTOK_API_HOST, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
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
  } catch { return null; }
}

const INSTA120_HOST = "instagram120.p.rapidapi.com";

// ─── 인스타그램 피드 캐시 (아티스트 핸들 단위 → API 1회 호출) ───
const instaFeedCache = new Map<string, any[] | null>();
let instaApiCallsSaved = 0;

async function fetchInstaFeed(apiKey: string, handle: string): Promise<any[] | null> {
  if (instaFeedCache.has(handle)) {
    instaApiCallsSaved++;
    return instaFeedCache.get(handle)!;
  }
  try {
    const res = await fetch(`https://${INSTA120_HOST}/api/instagram/posts`, {
      method: "POST",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": INSTA120_HOST,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: handle }),
    });
    if (!res.ok) { instaFeedCache.set(handle, null); return null; }
    const data = await res.json();
    const edges = data?.result?.edges || [];
    instaFeedCache.set(handle, edges);
    return edges;
  } catch { instaFeedCache.set(handle, null); return null; }
}

function filterInstaFeedByKeyword(
  edges: any[], keyword: string,
): { postCount: number; totalLikes: number; totalComments: number } {
  const kwLower = keyword.toLowerCase().replace(/\s+/g, "");
  const cutoff = Math.floor(Date.now() / 1000) - 86400 * 7;
  let postCount = 0, totalLikes = 0, totalComments = 0;
  for (const edge of edges) {
    const node = edge.node;
    if (!node) continue;
    if (node.taken_at && node.taken_at < cutoff) continue;
    const caption = typeof node.caption === "string" ? node.caption : (node.caption?.text || "");
    const captionLower = caption.toLowerCase().replace(/\s+/g, "");
    if (captionLower.includes(kwLower)) {
      postCount++;
      totalLikes += Number(node.like_count || 0);
      totalComments += Number(node.comment_count || 0);
    }
  }
  return { postCount, totalLikes, totalComments };
}

async function searchInstagram(
  apiKey: string, keyword: string, instagramHandle?: string | null,
): Promise<{ postCount: number; totalLikes: number; totalComments: number } | null> {
  if (!instagramHandle) return null;
  const edges = await fetchInstaFeed(apiKey, instagramHandle);
  if (!edges) return null;
  return filterInstaFeedByKeyword(edges, keyword);
}

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

    // ─── YouTube API 키 로테이션 ───
    const YT_KEYS: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const k = Deno.env.get(`YOUTUBE_API_KEY_${i}`);
      if (k) YT_KEYS.push(k);
    }
    if (YT_KEYS.length === 0) {
      const legacy = Deno.env.get("YOUTUBE_API_KEY");
      if (legacy) YT_KEYS.push(legacy);
    }
    const youtubeApiKey = YT_KEYS.length > 0 ? YT_KEYS[batchOffset % YT_KEYS.length] : "";
    console.log(`[trend-track] Using YouTube API key #${(batchOffset % YT_KEYS.length) + 1} of ${YT_KEYS.length}`);

    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // ─── YouTube 일일 쿼터 관리 ───
    const YT_DAILY_LIMIT = YT_KEYS.length * 100;
    let ytQuotaRemaining = 0;
    let ytQuotaUsed = 0;

    const today = new Date().toISOString().slice(0, 10);
    const { data: ytQuotaState } = await sb
      .from("ktrenz_pipeline_state")
      .select("current_offset, total_candidates, updated_at")
      .eq("run_id", `yt_track_quota_${today}`)
      .eq("phase", "youtube_track_quota")
      .limit(1);

    if (ytQuotaState?.length) {
      ytQuotaUsed = ytQuotaState[0].current_offset || 0;
    } else {
      await sb.from("ktrenz_pipeline_state").insert({
        run_id: `yt_track_quota_${today}`,
        phase: "youtube_track_quota",
        status: "running",
        current_offset: 0,
        total_candidates: YT_DAILY_LIMIT,
        batch_size: YT_DAILY_LIMIT,
      });
    }
    ytQuotaRemaining = Math.max(0, YT_DAILY_LIMIT - ytQuotaUsed);
    const ytEnabled = youtubeApiKey && ytQuotaRemaining > 0;
    console.log(`[trend-track] YouTube quota: used=${ytQuotaUsed}/${YT_DAILY_LIMIT}, remaining=${ytQuotaRemaining}, enabled=${ytEnabled}`);

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

    // ── 아티스트 인스타그램 핸들 조회 (instagram120용) ──
    const uniqueStarIds = [...new Set([...(allSources || [])].map(s => s.star_id).filter(Boolean))];
    const instaHandleByStarId = new Map<string, string>();
    if (uniqueStarIds.length > 0) {
      const { data: stars } = await sb.from("ktrenz_stars")
        .select("id, social_handles")
        .in("id", uniqueStarIds.slice(0, 500));
      for (const star of (stars || [])) {
        const handle = (star.social_handles as any)?.instagram;
        if (handle) instaHandleByStarId.set(star.id, handle);
      }
      console.log(`[trend-track] Instagram handles loaded: ${instaHandleByStarId.size}/${uniqueStarIds.length} stars`);
    }

    // ── 레거시 트리거 매핑 ──
    const { data: legacyTriggers } = await sb.from("ktrenz_trend_triggers").select("id, keyword, metadata").in("status", ["active", "pending"]);
    const triggerByKeywordId = new Map<string, string>();
    for (const t of (legacyTriggers || [])) {
      const kwId = (t.metadata as any)?.keyword_id;
      if (kwId) triggerByKeywordId.set(kwId, t.id);
    }

    console.log(`[trend-track] 🚀 v8 baseline-delta tracking: ${keywords.length} keywords (offset=${batchOffset}, total=${totalKeywords})`);
    console.log(`[trend-track] APIs: naver=✓ datalab=✓ youtube=${ytEnabled ? "✓" : "✗(quota)"} tiktok=${rapidApiKey ? "✓" : "✗"} insta=${rapidApiKey ? "✓" : "✗"}`);

    let trackedCount = 0;
    const results: any[] = [];

    const TIMEGUARD_MS = 240000; // 240초 경과 시 남은 키워드 건너뛰기
    const trackStartTime = Date.now();

    for (const kw of keywords) {
      if (Date.now() - trackStartTime > TIMEGUARD_MS) {
        console.warn(`[trend-track] ⏱ Timeguard: ${Math.round((Date.now() - trackStartTime) / 1000)}s elapsed, skipping remaining ${keywords.length - trackedCount} keywords`);
        break;
      }
      try {
        const kwQuery = kw.keyword_ko || kw.keyword;
        const source = sourceByKeyword.get(kw.id);
        const artistName = source?.artist_name || "Unknown";
        const isShoppingCategory = ["brand", "product", "goods", "shopping"].includes(kw.keyword_category || "");
        const searchQuery = `"${kwQuery}"`;

        // ─── 이전 추적 데이터 조회 (직전 1건 — velocity 계산용) ───
        const { data: prevTracking } = await sb.from("ktrenz_trend_tracking")
          .select("interest_score, naver_news_total, naver_blog_total, naver_news_24h, naver_blog_24h, datalab_ratio, youtube_video_count, youtube_total_views, youtube_total_comments, tiktok_video_count, tiktok_total_views, tiktok_total_likes, tiktok_total_comments, insta_post_count, insta_total_likes, insta_total_comments")
          .eq("keyword_id", kw.id)
          .order("tracked_at", { ascending: false })
          .limit(1);

        const hasPrevTracking = prevTracking && prevTracking.length > 0;
        const prevRaw: SourceRaw = hasPrevTracking ? {
          naver_news_total: prevTracking[0].naver_news_total ?? null,
          naver_blog_total: prevTracking[0].naver_blog_total ?? null,
          naver_news_24h: prevTracking[0].naver_news_24h ?? null,
          naver_blog_24h: prevTracking[0].naver_blog_24h ?? null,
          datalab_ratio: prevTracking[0].datalab_ratio ?? null,
          datalab_trend_7d: [],
          youtube_video_count: prevTracking[0].youtube_video_count ?? null,
          youtube_total_views: prevTracking[0].youtube_total_views ?? null,
          youtube_total_comments: prevTracking[0].youtube_total_comments ?? null,
          tiktok_video_count: prevTracking[0].tiktok_video_count ?? null,
          tiktok_total_views: prevTracking[0].tiktok_total_views ?? null,
          tiktok_total_likes: prevTracking[0].tiktok_total_likes ?? null,
          tiktok_total_comments: prevTracking[0].tiktok_total_comments ?? null,
          insta_post_count: prevTracking[0].insta_post_count ?? null,
          insta_total_likes: prevTracking[0].insta_total_likes ?? null,
          insta_total_comments: prevTracking[0].insta_total_comments ?? null,
        } : emptyRaw();

        // ─── 베이스라인 raw 조회 (delta_pct 계산용) ───
        const baselineRaw: SourceRaw = (kw.baseline_raw && typeof kw.baseline_raw === "object" && Object.keys(kw.baseline_raw).length > 0)
          ? {
              naver_news_total: kw.baseline_raw.naver_news_total ?? null,
              naver_blog_total: kw.baseline_raw.naver_blog_total ?? null,
              naver_news_24h: kw.baseline_raw.naver_news_24h ?? null,
              naver_blog_24h: kw.baseline_raw.naver_blog_24h ?? null,
              datalab_ratio: kw.baseline_raw.datalab_ratio ?? null,
              datalab_trend_7d: kw.baseline_raw.datalab_trend_7d || [],
              youtube_video_count: kw.baseline_raw.youtube_video_count ?? null,
              youtube_total_views: kw.baseline_raw.youtube_total_views ?? null,
              youtube_total_comments: kw.baseline_raw.youtube_total_comments ?? null,
              tiktok_video_count: kw.baseline_raw.tiktok_video_count ?? null,
              tiktok_total_views: kw.baseline_raw.tiktok_total_views ?? null,
              tiktok_total_likes: kw.baseline_raw.tiktok_total_likes ?? null,
              tiktok_total_comments: kw.baseline_raw.tiktok_total_comments ?? null,
              insta_post_count: kw.baseline_raw.insta_post_count ?? null,
              insta_total_likes: kw.baseline_raw.insta_total_likes ?? null,
              insta_total_comments: kw.baseline_raw.insta_total_comments ?? null,
            }
          : emptyRaw();

        // ─── 5소스 병렬 수집 ───
        const ytSkipped = !(ytEnabled && ytQuotaRemaining > 0) || YT_KEYS.length === 0;
        const socialSkipped = !rapidApiKey;
        const ytKeyForThis = YT_KEYS.length > 0 ? YT_KEYS[trackedCount % YT_KEYS.length] : "";

        const instaHandle = source?.star_id ? instaHandleByStarId.get(source.star_id) : undefined;

        const [newsResult, blogResult, datalabResult, ytResult, tiktokResult, instaResult] = await Promise.all([
          searchNaverRecent(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverRecent(naverClientId, naverClientSecret, "blog", searchQuery),
          searchNaverDatalab(naverClientId, naverClientSecret, kwQuery),
          ytSkipped ? Promise.resolve(null) : searchYouTube(ytKeyForThis, kwQuery).then(r => { ytQuotaRemaining--; ytQuotaUsed++; return r; }),
          socialSkipped ? Promise.resolve(null) : searchTikTok(rapidApiKey, kwQuery),
          (socialSkipped || !instaHandle) ? Promise.resolve(null) : searchInstagram(rapidApiKey, kwQuery, instaHandle),
        ]);

        const currentRaw: SourceRaw = {
          naver_news_total: newsResult.total,
          naver_blog_total: blogResult.total,
          naver_news_24h: newsResult.recent24h,
          naver_blog_24h: blogResult.recent24h,
          datalab_ratio: datalabResult ? datalabResult.latestRatio : null,
          datalab_trend_7d: datalabResult ? datalabResult.trend : [],
          youtube_video_count: ytResult ? ytResult.videoCount : null,
          youtube_total_views: ytResult ? ytResult.totalViews : null,
          youtube_total_comments: ytResult ? ytResult.totalComments : null,
          tiktok_video_count: tiktokResult ? tiktokResult.videoCount : null,
          tiktok_total_views: tiktokResult ? tiktokResult.totalViews : null,
          tiktok_total_likes: tiktokResult ? tiktokResult.totalLikes : null,
          tiktok_total_comments: tiktokResult ? tiktokResult.totalComments : null,
          insta_post_count: instaResult ? instaResult.postCount : null,
          insta_total_likes: instaResult ? instaResult.totalLikes : null,
          insta_total_comments: instaResult ? instaResult.totalComments : null,
        };

        // ─── 종합 buzz 계산 ───
        const buzzScore = computeBuzzScore(currentRaw);

        // ─── 첫 추적 판정 ───
        const isFirstTrack = kw.baseline_score === 0 || kw.baseline_score === null || !hasPrevTracking;

        // ─── delta_pct: 베이스값(첫 수집) 대비 변동률 ───
        const { weightedDelta: deltaFromBaseline, sourceScores: baselineSourceScores } = isFirstTrack
          ? { weightedDelta: 0, sourceScores: { naver: 0, datalab: 0, youtube: 0, tiktok: 0, insta: 0 } }
          : computeWeightedDelta(currentRaw, baselineRaw);

        // ─── velocity: 직전 수집 대비 변동률 ───
        const { weightedDelta: velocity } = (isFirstTrack || !hasPrevTracking)
          ? { weightedDelta: 0 }
          : computeWeightedDelta(currentRaw, prevRaw);

        // ─── baseline/peak/influence 갱신 ───
        let baseline = kw.baseline_score ?? 0;
        let peak = kw.peak_score ?? 0;
        let influence = kw.influence_index ?? 0;
        const kwUpdates: any = { last_tracked_at: new Date().toISOString(), velocity };

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

        const avail = getSourceAvailability(currentRaw);
        const activeCount = Object.values(avail).filter(Boolean).length;
        console.log(`[trend-track] ✓ "${kwQuery}" buzz=${buzzScore} Δbase=${deltaFromBaseline}% vel=${velocity}% sources=${activeCount}/5 [nv=${avail.naver?"✓":"✗"} dl=${avail.datalab?"✓":"✗"} yt=${avail.youtube?"✓":"✗"} tt=${avail.tiktok?"✓":"✗"} ig=${avail.insta?"✓":"✗"}]${isFirstTrack ? " [FIRST]" : ""}`);

        // ─── ktrenz_keywords 업데이트 ───
        await sb.from("ktrenz_keywords").update(kwUpdates).eq("id", kw.id);

        // ─── ktrenz_trend_tracking 저장 ───
        const triggerId = triggerByKeywordId.get(kw.id) || null;
        const { error: trackInsertErr } = await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: triggerId,
          keyword_id: kw.id,
          wiki_entry_id: null,
          keyword: kw.keyword,
          interest_score: buzzScore,
          region: "multi",
          delta_pct: deltaFromBaseline,       // 베이스 대비 변동률
          weighted_delta: deltaFromBaseline,   // 동기화
          velocity: velocity,                  // 직전 대비 변동률
          source_scores: baselineSourceScores,
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
          raw_response: { scoring_mode: "v8_baseline_delta_velocity", weights: WEIGHTS, active_sources: avail, active_count: activeCount },
        });
        if (trackInsertErr) {
          console.error(`[trend-track] ❌ tracking insert failed for "${kw.keyword}":`, trackInsertErr.message, trackInsertErr.details);
        }

        // ─── 레거시 동기화 ───
        if (triggerId) {
          await sb.from("ktrenz_trend_triggers").update({
            baseline_score: baseline, peak_score: peak, influence_index: influence,
            prev_api_total: (currentRaw.naver_news_total ?? 0) + (currentRaw.naver_blog_total ?? 0),
          }).eq("id", triggerId);
        }

        // ─── 쇼핑 카테고리: 별도 테이블 ───
        if (isShoppingCategory && datalabResult) {
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

        // ─── 팔로우 알림 ──
        if (triggerId) await notifyKeywordFollowers(sb, triggerId, kw.keyword, artistName, influence, deltaFromBaseline);

        trackedCount++;
        results.push({
          keyword: kw.keyword, artist: artistName, buzz_score: buzzScore,
          delta_from_baseline: deltaFromBaseline, velocity,
          source_scores: baselineSourceScores,
          baseline, peak, influence, is_first_track: isFirstTrack,
        });

        await new Promise(r => setTimeout(r, 300));

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

    // ─── YouTube 쿼터 사용량 DB 업데이트 ───
    if (ytQuotaUsed > 0) {
      await sb.from("ktrenz_pipeline_state")
        .update({ current_offset: ytQuotaUsed, updated_at: new Date().toISOString() })
        .eq("run_id", `yt_track_quota_${today}`)
        .eq("phase", "youtube_track_quota");
    }

    console.log(`[trend-track] 📊 Instagram cache: ${instaFeedCache.size} feeds fetched, ${instaApiCallsSaved} API calls saved`);

    return new Response(
      JSON.stringify({ success: true, batchOffset, totalCandidates: totalKeywords, tracked: trackedCount, ytQuotaUsed, ytQuotaRemaining, instaCacheSaved: instaApiCallsSaved, results }),
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
