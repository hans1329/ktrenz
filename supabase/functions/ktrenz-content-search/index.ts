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

// ── Extract og:image from a page ──
async function extractOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
    }, 5000);
    if (!res.ok) return null;
    const html = await res.text();
    // Extract og:image from meta tags
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const imgUrl = ogMatch[1];
      // Ensure HTTPS
      return imgUrl.startsWith("//") ? `https:${imgUrl}` : imgUrl;
    }
    return null;
  } catch { return null; }
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
      thumbnail: item.thumbnail || null,
      date: item.pubDate || item.postdate || null,
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

// ── TikTok (tiktok-api23 RapidAPI — collect-tiktok-trends와 동일 구조) ──
async function searchTikTok(rapidApiKey: string, query: string, count = 15): Promise<any[]> {
  try {
    const url = `https://tiktok-api23.p.rapidapi.com/api/search/video?keyword=${encodeURIComponent(query)}&search_id=0`;
    const res = await fetchWithTimeout(url, {
      headers: { "x-rapidapi-host": "tiktok-api23.p.rapidapi.com", "x-rapidapi-key": rapidApiKey },
    });
    if (!res.ok) { await res.text(); return []; }
    const text = await res.text();
    if (!text || text.trim().length === 0) return [];
    let data: any;
    try { data = JSON.parse(text); } catch { return []; }
    // tiktok-api23 응답: { item_list: [...] }
    const items = data?.item_list || [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, count).filter((v: any) => v && v.id).map((v: any) => {
      const stats = v.stats || {};
      const author = v.author || {};
      return {
        source: "tiktok",
        title: v.desc || "",
        description: "",
        url: `https://www.tiktok.com/@${author.uniqueId || "user"}/video/${v.id}`,
        thumbnail: v.video?.cover || v.video?.dynamicCover || null,
        date: v.createTime ? new Date(v.createTime * 1000).toISOString() : null,
        metadata: {
          author: author.nickname || author.uniqueId,
          plays: Number(stats.playCount) || 0,
          likes: Number(stats.diggCount) || 0,
          comments: Number(stats.commentCount) || 0,
        },
      };
    });
  } catch { return []; }
}

// ── Instagram (instagram120 RapidAPI — POST method) ──
async function searchInstagram(rapidApiKey: string, handle: string | null, query: string): Promise<any[]> {
  if (!handle) return [];
  try {
    const res = await fetchWithTimeout("https://instagram120.p.rapidapi.com/api/instagram/posts", {
      method: "POST",
      headers: {
        "x-rapidapi-host": "instagram120.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: handle, maxId: "" }),
    }, 15000);
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const edges = data?.result?.edges || [];
    return edges.slice(0, 15).map((edge: any) => {
      const p = edge?.node || edge;
      return {
        source: "instagram",
        title: (p.caption?.text || "").substring(0, 200),
        description: "",
        url: `https://www.instagram.com/p/${p.code || p.shortcode}/`,
        thumbnail: p.image_versions2?.candidates?.[0]?.url || p.display_url || null,
        date: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : null,
        metadata: {
          likes: p.like_count || 0,
          comments: p.comment_count || 0,
        },
      };
    });
  } catch { return []; }
}

// ── Reddit (SerpAPI) ──
async function searchReddit(serpApiKey: string, query: string): Promise<any[]> {
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", `site:reddit.com ${query}`);
    url.searchParams.set("tbs", "qdr:d");
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
      thumbnail: r.thumbnail || r.rich_snippet?.top?.detected_extensions?.thumbnail || null,
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
      .select("id, display_name, name_ko, social_handles, star_type")
      .eq("id", star_id)
      .maybeSingle();
    if (starErr || !star) {
      return new Response(JSON.stringify({ error: "Star not found", detail: starErr?.message }), {
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
    const [naverNewsRaw, naverBlogRaw, youtubeRaw, tiktokRaw, instagramRaw, redditRaw] = await Promise.all([
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "news", searchQuery, 15) : Promise.resolve([]),
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "blog", searchQuery, 10) : Promise.resolve([]),
      YT_KEY ? searchYouTube(YT_KEY, searchQueryEn, 15) : Promise.resolve([]),
      RAPIDAPI_KEY ? searchTikTok(RAPIDAPI_KEY, searchQueryEn, 15) : Promise.resolve([]),
      RAPIDAPI_KEY ? searchInstagram(RAPIDAPI_KEY, star.social_handles?.instagram || null, searchQuery) : Promise.resolve([]),
      SERPAPI_KEY ? searchReddit(SERPAPI_KEY, searchQueryEn) : Promise.resolve([]),
    ]);

    // Deduplicate per source: by URL first, then by normalized title similarity
    function dedup(items: any[], dedupDesc = false): any[] {
      const seenUrls = new Set<string>();
      const seenDescs = new Set<string>();
      return items.filter((item) => {
        const url = (item.url || "").split("?")[0].replace(/\/+$/, "");
        if (url && seenUrls.has(url)) return false;
        if (url) seenUrls.add(url);
        // For news: same description = same event photo articles
        if (dedupDesc) {
          const desc = (item.description || "").replace(/\s+/g, " ").trim().slice(0, 80);
          if (desc.length > 20 && seenDescs.has(desc)) return false;
          if (desc.length > 20) seenDescs.add(desc);
        }
        return true;
      });
    }

    const naverNewsDeduped = dedup(naverNewsRaw, true);
    const naverBlog = dedup(naverBlogRaw);
    const youtube = dedup(youtubeRaw);
    const tiktok = dedup(tiktokRaw);
    const instagram = dedup(instagramRaw);
    const reddit = dedup(redditRaw);

    // Enrich Naver News & Reddit with og:image (parallel, up to 10 each)
    const enrichWithOgImage = async (items: any[], limit = 10) => {
      const toEnrich = items.slice(0, limit);
      const enriched = await Promise.all(
        toEnrich.map(async (item: any) => {
          if (item.thumbnail) return item;
          const ogImg = await extractOgImage(item.url);
          return ogImg ? { ...item, thumbnail: ogImg } : item;
        })
      );
      return items.length > limit ? [...enriched, ...items.slice(limit)] : enriched;
    };

    const [naverNews, redditEnriched] = await Promise.all([
      enrichWithOgImage(naverNewsDeduped, 10),
      enrichWithOgImage(reddit, 7),
    ]);

    const results = {
      star: {
        id: star.id,
        display_name: star.display_name,
        name_ko: star.name_ko,
        star_type: star.star_type,
      },
      sources: {
        naver_news: naverNews,
        naver_blog: naverBlog,
        youtube,
        tiktok,
        instagram,
        reddit: redditEnriched,
      },
      counts: {
        naver_news: naverNews.length,
        naver_news_raw: naverNewsRaw.length,
        naver_blog: naverBlog.length,
        youtube: youtube.length,
        tiktok: tiktok.length,
        instagram: instagram.length,
        reddit: redditEnriched.length,
        total: naverNews.length + naverBlog.length + youtube.length + tiktok.length + instagram.length + redditEnriched.length,
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
