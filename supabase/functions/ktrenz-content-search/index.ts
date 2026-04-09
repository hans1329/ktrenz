// ktrenz-content-search: 스타 이름으로 네이버/유튜브/틱톡/인스타/레딧 콘텐츠 검색
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Naver News + Blog ──
async function searchNaver(
  clientId: string, clientSecret: string, endpoint: "news" | "blog", query: string, display = 20,
): Promise<any[]> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(display));
    url.searchParams.set("sort", "date");
    const res = await fetchWithTimeout(url.toString(), {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      source: endpoint === "news" ? "naver_news" : "naver_blog",
      title: (item.title || "").replace(/<[^>]*>/g, ""),
      description: (item.description || "").replace(/<[^>]*>/g, ""),
      url: item.originallink || item.link,
      thumbnail: null,
      date: item.pubDate || null,
      metadata: { bloggername: item.bloggername, bloggerlink: item.bloggerlink },
    }));
  } catch { return []; }
}

// ── YouTube Data API ──
async function searchYouTube(apiKey: string, query: string, maxResults = 15): Promise<any[]> {
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "date");
    url.searchParams.set("regionCode", "KR");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", apiKey);
    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      source: "youtube",
      title: item.snippet?.title || "",
      description: item.snippet?.description || "",
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
      date: item.snippet?.publishedAt || null,
      metadata: { channelTitle: item.snippet?.channelTitle, videoId: item.id?.videoId },
    }));
  } catch { return []; }
}

// ── TikTok (tiktok-api23 RapidAPI) ──
async function searchTikTok(rapidApiKey: string, query: string, count = 15): Promise<any[]> {
  try {
    const url = `https://tiktok-api23.p.rapidapi.com/api/search/video?keyword=${encodeURIComponent(query)}&search_id=0&count=${count}`;
    const res = await fetchWithTimeout(url, {
      headers: { "x-rapidapi-host": "tiktok-api23.p.rapidapi.com", "x-rapidapi-key": rapidApiKey },
    });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const items = data?.data?.videos || data?.data?.item_list || [];
    return items.slice(0, count).map((v: any) => ({
      source: "tiktok",
      title: v.desc || v.title || "",
      description: "",
      url: `https://www.tiktok.com/@${v.author?.unique_id || "user"}/video/${v.video_id || v.id || v.aweme_id}`,
      thumbnail: v.cover?.url_list?.[0] || v.video?.cover?.url_list?.[0] || v.origin_cover?.url_list?.[0] || null,
      date: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
      metadata: {
        author: v.author?.nickname || v.author?.unique_id,
        plays: v.statistics?.play_count || v.play_count || 0,
        likes: v.statistics?.digg_count || v.digg_count || 0,
      },
    }));
  } catch { return []; }
}

// ── Instagram (instagram120 RapidAPI) ──
async function searchInstagram(rapidApiKey: string, handle: string | null, query: string): Promise<any[]> {
  if (!handle) return [];
  try {
    // Use feed endpoint for the given handle
    const url = `https://instagram120.p.rapidapi.com/api/instagram/posts/${encodeURIComponent(handle)}?count=15`;
    const res = await fetchWithTimeout(url, {
      headers: { "x-rapidapi-host": "instagram120.p.rapidapi.com", "x-rapidapi-key": rapidApiKey },
    }, 15000);
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const posts = data?.data || data?.items || data || [];
    if (!Array.isArray(posts)) return [];
    return posts.slice(0, 15).map((p: any) => ({
      source: "instagram",
      title: (p.caption?.text || p.edge_media_to_caption?.edges?.[0]?.node?.text || "").substring(0, 200),
      description: "",
      url: p.link || `https://www.instagram.com/p/${p.shortcode || p.code}/`,
      thumbnail: p.thumbnail_url || p.display_url || p.image_versions2?.candidates?.[0]?.url || null,
      date: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : null,
      metadata: {
        likes: p.like_count || p.edge_liked_by?.count || 0,
        comments: p.comment_count || p.edge_media_to_comment?.count || 0,
      },
    }));
  } catch { return []; }
}

// ── Reddit (SerpAPI) ──
async function searchReddit(serpApiKey: string, query: string): Promise<any[]> {
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", `site:reddit.com ${query}`);
    url.searchParams.set("num", "15");
    url.searchParams.set("api_key", serpApiKey);
    const res = await fetchWithTimeout(url.toString(), {}, 12000);
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    return (data.organic_results || []).filter((r: any) =>
      r.link?.includes("reddit.com")
    ).slice(0, 15).map((r: any) => ({
      source: "reddit",
      title: r.title || "",
      description: r.snippet || "",
      url: r.link,
      thumbnail: r.thumbnail || null,
      date: r.date || null,
      metadata: { subreddit: r.link?.match(/reddit\.com\/r\/([^/]+)/)?.[1] || "" },
    }));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { star_id } = await req.json();
    if (!star_id) {
      return new Response(JSON.stringify({ error: "star_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch star info
    const { data: star, error: starErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, group_name, group_name_ko, social_handles")
      .eq("id", star_id)
      .maybeSingle();
    if (starErr || !star) {
      return new Response(JSON.stringify({ error: "Star not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchQuery = star.name_ko || star.display_name;
    const searchQueryEn = star.display_name;

    // API Keys
    const NAVER_ID = Deno.env.get("NAVER_CLIENT_ID") || "";
    const NAVER_SECRET = Deno.env.get("NAVER_CLIENT_SECRET") || "";
    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY") || "";
    const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY") || "";

    // Pick a YouTube key
    const ytKeys: string[] = [];
    for (let i = 0; i <= 7; i++) {
      const k = Deno.env.get(i === 0 ? "YOUTUBE_API_KEY" : `YOUTUBE_API_KEY_${i}`);
      if (k) ytKeys.push(k);
    }
    const YT_KEY = ytKeys[Math.floor(Math.random() * ytKeys.length)] || "";

    // Parallel search all sources
    const [naverNews, naverBlog, youtube, tiktok, instagram, reddit] = await Promise.all([
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "news", searchQuery, 15) : Promise.resolve([]),
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "blog", searchQuery, 10) : Promise.resolve([]),
      YT_KEY ? searchYouTube(YT_KEY, searchQueryEn, 15) : Promise.resolve([]),
      RAPIDAPI_KEY ? searchTikTok(RAPIDAPI_KEY, searchQueryEn, 15) : Promise.resolve([]),
      RAPIDAPI_KEY ? searchInstagram(RAPIDAPI_KEY, star.social_handles?.instagram || null, searchQuery) : Promise.resolve([]),
      SERPAPI_KEY ? searchReddit(SERPAPI_KEY, searchQueryEn) : Promise.resolve([]),
    ]);

    const results = {
      star: {
        id: star.id,
        display_name: star.display_name,
        name_ko: star.name_ko,
        group_name: star.group_name,
      },
      sources: {
        naver_news: naverNews,
        naver_blog: naverBlog,
        youtube,
        tiktok,
        instagram,
        reddit,
      },
      counts: {
        naver_news: naverNews.length,
        naver_blog: naverBlog.length,
        youtube: youtube.length,
        tiktok: tiktok.length,
        instagram: instagram.length,
        reddit: reddit.length,
        total: naverNews.length + naverBlog.length + youtube.length + tiktok.length + instagram.length + reddit.length,
      },
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[content-search] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
