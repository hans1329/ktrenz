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

// ── Charset-aware text decoder ──
// Many Korean news sites serve EUC-KR; res.text() defaults to UTF-8 and garbles the text.
async function fetchTextWithCharset(res: Response): Promise<string> {
  // 1. Check Content-Type header for charset
  const ct = res.headers.get("content-type") || "";
  const charsetMatch = ct.match(/charset=["']?([^;"'\s]+)/i);
  let charset = charsetMatch?.[1]?.toLowerCase() || "";

  const buf = await res.arrayBuffer();

  // 2. If header doesn't specify, peek into first 2KB for <meta charset="...">
  if (!charset) {
    const peek = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 2048));
    const metaMatch = peek.match(/<meta[^>]+charset=["']?([^"';\s>]+)/i)
      || peek.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s]+)/i);
    if (metaMatch?.[1]) charset = metaMatch[1].toLowerCase();
  }

  // 3. Normalise common aliases
  if (charset === "euc-kr" || charset === "euc_kr" || charset === "x-euc-kr") charset = "euc-kr";
  if (!charset || charset === "utf-8") charset = "utf-8";

  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    // Fallback to UTF-8 if decoder doesn't support the charset
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

// ── Check if a string contains garbled (mojibake) text ──
function isGarbled(text: string): boolean {
  if (!text || text.length === 0) return false;
  // Count replacement characters and non-printable chars
  let badChars = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xFFFD) badChars++; // Unicode replacement char
  }
  return badChars > text.length * 0.1; // >10% replacement chars = garbled
}

// ── Extract og:image from a page ──
async function extractOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
    }, 5000);
    if (!res.ok) return null;
    const html = await fetchTextWithCharset(res);
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const imgUrl = ogMatch[1];
      return imgUrl.startsWith("//") ? `https:${imgUrl}` : imgUrl;
    }
    return null;
  } catch { return null; }
}

// ── Scrape article body text (top N chars) ──
async function scrapeBodyText(pageUrl: string, maxChars = 500): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
    }, 5000);
    if (!res.ok) return null;
    const html = await fetchTextWithCharset(res);
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
      || html.match(/id=["']?articleBody["']?[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/id=["']?newsct_article["']?[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/class=["'][^"']*article[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/class=["'][^"']*news[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (articleMatch?.[1]) {
      const text = articleMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > 0 ? text.substring(0, maxChars) : null;
    }
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const combined = paragraphs
      .map((p: string) => p.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .filter((t: string) => t.length > 30)
      .join(" ");
    return combined.length > 0 ? combined.substring(0, maxChars) : null;
  } catch { return null; }
}

// ── Extract first URL from text (for Reddit snippets) ──
function extractUrlFromText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)"'<>\]]+/);
  return m ? m[0] : null;
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

// ── TikTok (핸들 기반 피드 수집 — 키워드 검색은 빈 응답 반환하므로 피드 방식 사용) ──
const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";

async function getTikTokSecUid(apiKey: string, handle: string): Promise<string | null> {
  try {
    const url = `https://${TIKTOK_API_HOST}/api/user/info?uniqueId=${encodeURIComponent(handle)}`;
    const res = await fetchWithTimeout(url, {
      headers: { "x-rapidapi-host": TIKTOK_API_HOST, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.userInfo?.user?.secUid || null;
  } catch { return null; }
}

async function searchTikTok(rapidApiKey: string, handle: string | null, secUid: string | null, count = 15): Promise<any[]> {
  if (!handle && !secUid) return [];
  try {
    // Resolve secUid if not cached
    let uid = secUid;
    if (!uid && handle) {
      uid = await getTikTokSecUid(rapidApiKey, handle);
      if (!uid) return [];
    }

    const url = `https://${TIKTOK_API_HOST}/api/user/posts?secUid=${encodeURIComponent(uid!)}&count=${count}&cursor=0`;
    const res = await fetchWithTimeout(url, {
      headers: { "x-rapidapi-host": TIKTOK_API_HOST, "x-rapidapi-key": rapidApiKey },
    });
    if (!res.ok) { console.warn(`[TikTok] user/posts HTTP ${res.status}`); await res.text(); return []; }
    const text = await res.text();
    console.log(`[TikTok] response length=${text.length}`);
    if (!text || text.trim().length === 0) return [];
    let data: any;
    try { data = JSON.parse(text); } catch { return []; }
    const items = data?.itemList || data?.item_list || data?.data?.itemList || data?.data?.item_list || [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, count).filter((v: any) => v && v.id).map((v: any) => {
      const stats = v.stats || {};
      const author = v.author || {};
      return {
        source: "tiktok",
        title: v.desc || "",
        description: "",
        url: `https://www.tiktok.com/@${author.uniqueId || handle || "user"}/video/${v.id}`,
        thumbnail: v.video?.cover || v.video?.dynamicCover || null,
        date: v.createTime ? new Date(v.createTime * 1000).toISOString() : null,
        metadata: {
          author: author.nickname || author.uniqueId || handle,
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
    const body = await req.json();
    const star_id = body.star_id;
    const batch_id = body.batch_id || null;
    const search_round = body.search_round || 1;
    if (!star_id) {
      return new Response(JSON.stringify({ error: "star_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch star info
    const { data: star, error: starErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, social_handles, star_type, group_star_id, search_qualifier")
      .eq("id", star_id)
      .maybeSingle();
    if (starErr || !star) {
      return new Response(JSON.stringify({ error: "Star not found", detail: starErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build search query with group context for members ──
    let groupNameKo: string | null = null;
    if (star.star_type === "member" && star.group_star_id) {
      const { data: group } = await sb
        .from("ktrenz_stars")
        .select("name_ko, display_name")
        .eq("id", star.group_star_id)
        .maybeSingle();
      if (group) {
        groupNameKo = group.name_ko || group.display_name;
      }
    }

    // For member: "그룹명 이름" to narrow search; for others: name as-is
    const searchQuery = (star.star_type === "member" && groupNameKo)
      ? `${groupNameKo} ${star.name_ko || star.display_name}`
      : star.name_ko || star.display_name;
    const searchQueryEn = star.display_name;

    // Fetch member names for title filtering (group → members)
    let memberNames: string[] = [];
    if (star.star_type === "group") {
      const { data: members } = await sb
        .from("ktrenz_stars")
        .select("display_name, name_ko")
        .eq("group_star_id", star_id)
        .eq("star_type", "member");
      if (members) {
        memberNames = members.flatMap((m: any) => [m.display_name, m.name_ko].filter(Boolean));
      }
    }

    // Build keyword set for title relevance check
    const relevanceKeywords = [
      star.display_name,
      star.name_ko,
      ...(groupNameKo ? [groupNameKo] : []),
      ...memberNames,
    ].filter(Boolean).map((k: string) => k.toLowerCase());

    // For member-type stars with short Korean names (≤3 chars),
    // require group name or English name co-occurrence to prevent homonym contamination
    // e.g. "성훈" matches "박성훈" (politician) → blocked unless "엔하이픈" or "ENHYPEN" also appears
    const needsGroupContext = star.star_type === "member" && groupNameKo
      && star.name_ko && star.name_ko.length <= 3;
    const groupContextKeywords = needsGroupContext
      ? [groupNameKo!, star.display_name].map((k) => k.toLowerCase())
      : [];

    function isTitleRelevant(title: string): boolean {
      const t = title.toLowerCase();
      const hasAnyKeyword = relevanceKeywords.some((kw) => t.includes(kw));
      if (!hasAnyKeyword) return false;

      // For short-name members: if title contains the Korean name,
      // verify it's not a substring of a longer name (e.g. "박성훈" vs "성훈")
      // But allow Korean grammatical particles after the name (e.g. "카리나로", "성훈이")
      if (needsGroupContext && star.name_ko) {
        const nameKo = star.name_ko;
        const idx = t.indexOf(nameKo.toLowerCase());
        if (idx >= 0) {
          const charBefore = idx > 0 ? t[idx - 1] : "";
          const charAfter = t[idx + nameKo.length] || "";
          const koreanRange = /[\uAC00-\uD7A3]/;
          // Common Korean particles/suffixes that follow names naturally
          const koreanParticles = "가는을를의에와과도로이은랑한며서";
          const isParticleAfter = koreanRange.test(charAfter) && koreanParticles.includes(charAfter);
          const isEmbedded = koreanRange.test(charBefore) || (koreanRange.test(charAfter) && !isParticleAfter);
          if (isEmbedded) {
            // Embedded in longer name → require group/english name co-occurrence
            return groupContextKeywords.some((gk) => t.includes(gk));
          }
        }
      }
      return true;
    }

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

    console.log(`[TikTok] handle=${star.social_handles?.tiktok || 'none'}, secuid=${star.social_handles?.tiktok_secuid ? 'cached' : 'none'}`);
    // Parallel search all sources
    const [naverNewsRaw, naverBlogRaw, youtubeRaw, tiktokRaw, instagramRaw, redditRaw] = await Promise.all([
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "news", searchQuery, 15) : Promise.resolve([]),
      NAVER_ID ? searchNaver(NAVER_ID, NAVER_SECRET, "blog", searchQuery, 10) : Promise.resolve([]),
      YT_KEY ? searchYouTube(YT_KEY, searchQueryEn, 15) : Promise.resolve([]),
      RAPIDAPI_KEY ? searchTikTok(RAPIDAPI_KEY, star.social_handles?.tiktok || null, star.social_handles?.tiktok_secuid || null, 15) : Promise.resolve([]),
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

    const naverNewsDeduped = dedup(naverNewsRaw, true).filter((i: any) => isTitleRelevant(i.title));
    const naverBlog = dedup(naverBlogRaw).filter((i: any) => isTitleRelevant(i.title));
    const youtube = dedup(youtubeRaw).filter((i: any) => isTitleRelevant(i.title));
    const tiktok = dedup(tiktokRaw);
    const instagram = dedup(instagramRaw);
    const reddit = dedup(redditRaw).filter((i: any) => isTitleRelevant(i.title));

    // Enrich with og:image where thumbnails are missing
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

    // Enrich naver news: og:image + body text + full title scraping (charset-aware)
    const enrichNaverNews = async (items: any[], limit = 10) => {
      const toEnrich = items.slice(0, limit);
      const enriched = await Promise.all(
        toEnrich.map(async (item: any) => {
          let updated = { ...item };
          try {
            const res = await fetchWithTimeout(item.url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
            }, 8000);
            if (res.ok) {
              const html = await fetchTextWithCharset(res);
              // Full title from og:title or <title>
              const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
              if (ogTitleMatch?.[1]) {
                const fullTitle = ogTitleMatch[1].replace(/<[^>]*>/g, "").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
                if (fullTitle.length > updated.title.length && !isGarbled(fullTitle)) {
                  updated.title = fullTitle;
                }
              } else {
                const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleTagMatch?.[1]) {
                  const rawTitle = titleTagMatch[1].replace(/<[^>]*>/g, "").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
                  const cleanTitle = rawTitle.replace(/\s*[-|]\s*[^-|]+$/, "").trim();
                  if (cleanTitle.length > updated.title.length && !isGarbled(cleanTitle)) {
                    updated.title = cleanTitle;
                  }
                }
              }
              // Body text
              const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
                || html.match(/id=["']?articleBody["']?[^>]*>([\s\S]*?)<\/div>/i)
                || html.match(/id=["']?newsct_article["']?[^>]*>([\s\S]*?)<\/div>/i)
                || html.match(/class=["'][^"']*article[_-]?body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
                || html.match(/class=["'][^"']*news[_-]?content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
              if (articleMatch?.[1]) {
                const bodyText = articleMatch[1].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
                if (bodyText.length > (updated.description || "").length && !isGarbled(bodyText)) {
                  updated.description = bodyText.substring(0, 500);
                }
              }
              // og:image
              if (!updated.thumbnail) {
                const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                if (ogImgMatch?.[1]) {
                  const imgUrl = ogImgMatch[1];
                  updated.thumbnail = imgUrl.startsWith("//") ? `https:${imgUrl}` : imgUrl;
                }
              }
              // Validate og:image immediately — some sites return 404 on og:image URLs
              if (updated.thumbnail) {
                try {
                  const ogHeadRes = await fetchWithTimeout(updated.thumbnail, {
                    method: "HEAD",
                    headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
                  }, 3000);
                  if (!ogHeadRes.ok) {
                    // Try GET with Range as some servers don't support HEAD
                    const ogGetRes = await fetchWithTimeout(updated.thumbnail, {
                      method: "GET",
                      headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)", "Range": "bytes=0-0" },
                    }, 3000);
                    if (!ogGetRes.ok && ogGetRes.status !== 206) {
                      console.warn(`[enrichNews] og:image invalid (${ogHeadRes.status}): ${updated.thumbnail}`);
                      updated.thumbnail = null; // Clear so body extraction runs
                    }
                  }
                } catch {
                  console.warn(`[enrichNews] og:image unreachable: ${updated.thumbnail}`);
                  updated.thumbnail = null;
                }
              }
              // Fallback: robust body image extraction (ported from trend-detect)
              if (!updated.thumbnail) {
                function extractAttr(tag: string, attr: string): string | null {
                  const m = tag.match(new RegExp(`\\b${attr}=(?:["']([^"']+)["']|([^\\s>]+))`, "i"));
                  return m?.[1] || m?.[2] || null;
                }
                function parseSrcset(raw: string): string | null {
                  const parts = raw.split(/,\s+(?=https?:\/\/|\/)/);
                  const urls: string[] = [];
                  for (const p of parts) {
                    const t = p.trim();
                    if (!t) continue;
                    const si = t.search(/\s+\d+(\.\d+)?[wx]\s*$/);
                    const u = si > 0 ? t.slice(0, si).trim() : t;
                    if (u && !u.startsWith("data:")) urls.push(u);
                  }
                  return urls.length > 0 ? urls[urls.length - 1] : null;
                }
                function resolveImgUrl(src: string): string | null {
                  if (!src || src.length < 3) return null;
                  if (src.startsWith("//")) return `https:${src}`;
                  if (src.startsWith("http")) return src;
                  try {
                    const base = new URL(item.url);
                    return src.startsWith("/") ? `${base.origin}${src}` : `${base.origin}/${src}`;
                  } catch { return null; }
                }

                const imgTagRegex = /<img[^>]*>/gi;
                // Also scan <source> tags inside <picture> elements
                const combinedTagRegex = /<(?:img|source)[^>]*>/gi;
                let imgTagMatch;
                while ((imgTagMatch = combinedTagRegex.exec(html)) !== null) {
                  const tag = imgTagMatch[0];
                  const isSource = tag.toLowerCase().startsWith("<source");

                  // Determine src: data-srcset > data-src > srcset > src
                  let src: string | null = null;
                  const ds = extractAttr(tag, "data-srcset");
                  if (ds) src = parseSrcset(ds);
                  if (!src) { const d = extractAttr(tag, "data-src"); if (d && !d.startsWith("data:")) src = d; }
                  if (!src) { const ss = extractAttr(tag, "srcset"); if (ss) src = parseSrcset(ss); }
                  if (!src) { const s = extractAttr(tag, "src"); if (s && !s.startsWith("data:")) src = s; }
                  if (!src) continue;

                  // Filter out non-photo assets
                  if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
                  if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner|ico_|btn_|ad_|\/menu\/|\/sns\d|\/gong\.|\/common\/|\/layout\//i.test(src)) continue;

                  // Skip sidebar/related article areas
                  const lb = html.slice(Math.max(0, imgTagMatch.index - 500), imgTagMatch.index);
                  if (/class=["'][^"']*(?:news_slide|best_click|rank|aside|related|recommend|popular|sidebar)["']|id=["'](?:aside|sidebar|taboola)["']/i.test(lb)) continue;

                  // Width filter (only for img tags, not source)
                  if (!isSource) {
                    const wm = extractAttr(tag, "width");
                    if (wm && parseInt(wm) < 200) continue;
                  }

                  const resolved = resolveImgUrl(src.replace(/&amp;/g, "&"));
                  if (!resolved || resolved.includes("data:image/") || resolved.length < 20) continue;

                  updated.thumbnail = resolved;
                  break;
                }
              }
            }
          } catch { /* skip enrichment on error */ }
          return updated;
        })
      );
      return items.length > limit ? [...enriched, ...items.slice(limit)] : enriched;
    };

    // Reddit: og:title for full title + og:image
    const enrichReddit = async (items: any[], limit = 10) => {
      const toEnrich = items.slice(0, limit);
      const enriched = await Promise.all(
        toEnrich.map(async (item: any) => {
          let updated = { ...item };
          try {
            const pageUrl = item.url || "";
            if (pageUrl) {
              const res = await fetchWithTimeout(pageUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)" },
              }, 5000);
              if (res.ok) {
                const html = await res.text();
                // Full title
                const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
                if (ogTitleMatch?.[1]) {
                  const fullTitle = ogTitleMatch[1].replace(/<[^>]*>/g, "").trim();
                  if (fullTitle.length > updated.title.length) {
                    updated.title = fullTitle;
                  }
                }
                // og:image
                if (!updated.thumbnail) {
                  const embeddedUrl = extractUrlFromText(updated.description || "");
                  if (embeddedUrl && !embeddedUrl.includes("reddit.com")) {
                    const ogImg = await extractOgImage(embeddedUrl);
                    if (ogImg) { updated.thumbnail = ogImg; return updated; }
                  }
                  const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
                  if (ogImgMatch?.[1]) {
                    const imgUrl = ogImgMatch[1];
                    updated.thumbnail = imgUrl.startsWith("//") ? `https:${imgUrl}` : imgUrl;
                  }
                }
              }
            }
          } catch { /* skip */ }
          return updated;
        })
      );
      return items.length > limit ? [...enriched, ...items.slice(limit)] : enriched;
    };

    const [naverNews, naverBlogEnriched, redditEnriched] = await Promise.all([
      enrichNaverNews(naverNewsDeduped, 10),
      enrichWithOgImage(naverBlog, 10),
      enrichReddit(reddit, 7),
    ]);

    const contentScore = naverNewsRaw.length + naverBlogRaw.length + youtubeRaw.length + tiktokRaw.length + instagramRaw.length + redditRaw.length;

    const countsObj = {
      naver_news: naverNews.length,
      naver_news_raw: naverNewsRaw.length,
      naver_blog: naverBlogEnriched.length,
      naver_blog_raw: naverBlogRaw.length,
      youtube: youtube.length,
      youtube_raw: youtubeRaw.length,
      tiktok: tiktok.length,
      tiktok_raw: tiktokRaw.length,
      instagram: instagram.length,
      instagram_raw: instagramRaw.length,
      reddit: redditEnriched.length,
      reddit_raw: redditRaw.length,
      total: naverNews.length + naverBlogEnriched.length + youtube.length + tiktok.length + instagram.length + redditEnriched.length,
    };

    // ── Atomic replacement: delete previous runs/items for this star ──
    // Only delete old runs when search_round === 1 (initial collection)
    // Round 2 must preserve round 1 data for settlement comparison
    if (search_round === 1) {
      const { data: oldRuns } = await sb
        .from("ktrenz_b2_runs")
        .select("id")
        .eq("star_id", star_id);
      if (oldRuns && oldRuns.length > 0) {
        const oldRunIds = oldRuns.map((r: any) => r.id);
        for (let i = 0; i < oldRunIds.length; i += 50) {
          const chunk = oldRunIds.slice(i, i + 50);
          await sb.from("ktrenz_b2_items").delete().in("run_id", chunk);
        }
        await sb.from("ktrenz_b2_runs").delete().eq("star_id", star_id);
      }
    }

    // ── Save to B2 tables ──
    const { data: runData, error: runErr } = await sb
      .from("ktrenz_b2_runs")
      .insert({
        star_id,
        content_score: contentScore,
        counts: countsObj,
        batch_id: batch_id,
        search_round: search_round,
      })
      .select("id")
      .single();

    if (runErr) {
      console.error("[B2] run insert error:", runErr.message);
    }

    const runId = runData?.id;

    // Validate thumbnail URLs and cache http-only images to Supabase Storage
    const STORAGE_BUCKET = "trend-images";
    const validateThumbnail = async (url: string | null): Promise<string | null> => {
      if (!url) return null;
      try {
        // For http:// URLs on HTTPS pages (mixed content), cache to storage
        if (url.startsWith("http://")) {
          // First try https:// version
          const httpsUrl = url.replace("http://", "https://");
          try {
            const httpsRes = await fetchWithTimeout(httpsUrl, { method: "HEAD" }, 3000);
            if (httpsRes.ok) {
              const ct = httpsRes.headers.get("content-type") || "";
              if (ct.startsWith("image") || !ct) return httpsUrl;
            }
          } catch { /* https not supported, proceed to cache */ }

          // Download and cache to Supabase Storage
          try {
            const dlRes = await fetchWithTimeout(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; KtrenzBot/1.0)", "Accept": "image/*" },
            }, 5000);
            if (!dlRes.ok) return null;
            const ct = dlRes.headers.get("content-type") || "image/jpeg";
            if (!ct.startsWith("image")) return null;
            const data = new Uint8Array(await dlRes.arrayBuffer());
            if (data.length < 500) return null;
            const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)))).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
            const path = `b2-cache/${hash}.${ext}`;
            const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(path, data, {
              contentType: ct, upsert: true,
            });
            if (upErr) { console.warn("[B2] storage upload error:", upErr.message); return null; }
            const { data: pubData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
            return pubData?.publicUrl || null;
          } catch { return null; }
        }

        // Try HEAD first (fast)
        const headRes = await fetchWithTimeout(url, { method: "HEAD" }, 3000);
        if (headRes.ok) {
          const ct = headRes.headers.get("content-type") || "";
          if (ct.startsWith("image") || !ct) return url;
        }
        // If HEAD fails (405, 403, etc.), try GET with range header
        if (!headRes.ok || headRes.status === 405 || headRes.status === 403) {
          const getRes = await fetchWithTimeout(url, {
            method: "GET",
            headers: { "Range": "bytes=0-0" },
          }, 3000);
          if (getRes.ok || getRes.status === 206) return url;
        }
        return null;
      } catch { return null; }
    };

    const allSourceItems = [
      ...naverNews.map((i: any) => ({ ...i, source: "naver_news" })),
      ...naverBlogEnriched.map((i: any) => ({ ...i, source: "naver_blog" })),
      ...youtube.map((i: any) => ({ ...i, source: "youtube" })),
      ...tiktok.map((i: any) => ({ ...i, source: "tiktok" })),
      ...instagram.map((i: any) => ({ ...i, source: "instagram" })),
      ...redditEnriched.map((i: any) => ({ ...i, source: "reddit" })),
    ];

    if (runId) {

      const thumbnailChecks = await Promise.all(
        allSourceItems.map((item: any) => validateThumbnail(item.thumbnail))
      );

      const b2Items = allSourceItems.map((item: any, idx: number) => {
        const validThumb = thumbnailChecks[idx];
        return {
          run_id: runId,
          star_id,
          source: item.source,
          title: (item.title || "").substring(0, 500),
          description: (item.description || "").substring(0, 1000),
          url: item.url || "",
          thumbnail: validThumb,
          has_thumbnail: !!validThumb,
          published_at: item.date || null,
          engagement_score: contentScore,
          card_status: "available",
          metadata: item.metadata || {},
        };
      });

      // Batch insert (Supabase default limit ~1000)
      const BATCH = 200;
      for (let i = 0; i < b2Items.length; i += BATCH) {
        const batch = b2Items.slice(i, i + BATCH);
        const { error: itemErr } = await sb.from("ktrenz_b2_items").insert(batch);
        if (itemErr) console.error(`[B2] items batch ${i} error:`, itemErr.message);
      }

      // ── Cache Instagram/TikTok thumbnails to Supabase Storage ──
      // These CDN URLs expire, so we download and store them immediately
      const SOCIAL_SOURCES = new Set(["instagram", "tiktok"]);
      const socialItems = b2Items.filter(
        (item: any) => SOCIAL_SOURCES.has(item.source) && item.thumbnail && !item.thumbnail.includes(supabaseUrl)
      );

      if (socialItems.length > 0) {
        console.log(`[B2] Caching ${socialItems.length} social thumbnails (instagram/tiktok)`);
        const BUCKET = "trend-images";
        const FOLDER = "b2-cache";

        const cachePromises = socialItems.map(async (item: any) => {
          try {
            const res = await fetch(item.thumbnail, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/*",
                "Referer": item.source === "instagram" ? "https://www.instagram.com/" : "https://www.tiktok.com/",
              },
            });
            if (!res.ok) { console.warn(`[B2-cache] fetch failed ${res.status}: ${item.thumbnail.slice(0, 80)}`); return; }
            const ct = res.headers.get("content-type") || "image/jpeg";
            if (!ct.startsWith("image/")) return;
            const data = new Uint8Array(await res.arrayBuffer());
            if (data.length < 500) return;

            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.thumbnail))))
              .slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
            const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
            const path = `${FOLDER}/${hash}.${ext}`;

            const { error: upErr } = await sb.storage.from(BUCKET).upload(path, data, {
              contentType: ct, upsert: true,
            });
            if (upErr) { console.warn(`[B2-cache] upload error: ${upErr.message}`); return; }

            const cachedUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
            // Update the item's thumbnail in DB
            await sb.from("ktrenz_b2_items")
              .update({ thumbnail: cachedUrl })
              .eq("run_id", item.run_id)
              .eq("url", item.url);

            console.log(`[B2-cache] ✓ ${item.source}: ${cachedUrl}`);
          } catch (e: any) {
            console.warn(`[B2-cache] error: ${e.message}`);
          }
        });

        // Run in parallel but don't block the response
        await Promise.allSettled(cachePromises);
        console.log(`[B2] Social thumbnail caching complete`);
      }
    }

    // Also fix http:// thumbnails in the real-time response sources
    const fixHttpThumbs = async (items: any[]): Promise<any[]> => {
      return Promise.all(items.map(async (item: any) => {
        if (item.thumbnail?.startsWith("http://")) {
          const cached = await validateThumbnail(item.thumbnail);
          return { ...item, thumbnail: cached };
        }
        return item;
      }));
    };
    const [fixedNews, fixedBlog, fixedReddit] = await Promise.all([
      fixHttpThumbs(naverNews),
      fixHttpThumbs(naverBlogEnriched),
      fixHttpThumbs(redditEnriched),
    ]);

    const results = {
      star: {
        id: star.id,
        display_name: star.display_name,
        name_ko: star.name_ko,
        star_type: star.star_type,
      },
      sources: {
        naver_news: fixedNews,
        naver_blog: fixedBlog,
        youtube,
        tiktok,
        instagram,
        reddit: fixedReddit,
      },
      counts: {
        ...countsObj,
        content_score: contentScore,
      },
      b2: {
        run_id: runId || null,
        saved: !!runId,
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
