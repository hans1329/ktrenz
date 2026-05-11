import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAPIDAPI_HOST = "instagram120.p.rapidapi.com";

type InstagramMediaAsset = {
  type: "video" | "image";
  url: string;
  poster: string | null;
};

function extractShortcode(url: string): string | null {
  return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] ?? null;
}

function pickLargestUrl<T extends { url?: string | null; width?: number | null; height?: number | null }>(items: T[] | null | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const sorted = [...items].sort((a, b) => {
    const areaA = Number(a.width || 0) * Number(a.height || 0);
    const areaB = Number(b.width || 0) * Number(b.height || 0);
    return areaB - areaA;
  });

  return sorted.find((item) => item?.url)?.url ?? null;
}

function pickImageUrl(node: any): string | null {
  return pickLargestUrl(node?.image_versions2?.candidates) || node?.display_uri || node?.thumbnail_url || null;
}

function pickVideoUrl(node: any): string | null {
  return pickLargestUrl(node?.video_versions) || node?.video_url || null;
}

function normalizeMediaNode(node: any): InstagramMediaAsset | null {
  const poster = pickImageUrl(node);
  const mediaType = Number(node?.media_type || 1);

  if (mediaType === 2) {
    const videoUrl = pickVideoUrl(node);
    if (!videoUrl) return null;
    return {
      type: "video",
      url: videoUrl,
      poster,
    };
  }

  const imageUrl = pickImageUrl(node);
  if (!imageUrl) return null;

  return {
    type: "image",
    url: imageUrl,
    poster: imageUrl,
  };
}

function resolveMedia(node: any): InstagramMediaAsset[] {
  if (Number(node?.media_type) === 8 && Array.isArray(node?.carousel_media)) {
    return node.carousel_media
      .map((entry: any) => normalizeMediaNode(entry))
      .filter(Boolean);
  }

  const single = normalizeMediaNode(node);
  return single ? [single] : [];
}

async function fetchInstagramFeed(handle: string, rapidApiKey: string, maxId = "") {
  const response = await fetch(`https://${RAPIDAPI_HOST}/api/instagram/posts`, {
    method: "POST",
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: handle.replace(/^@/, ""), maxId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram API [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return {
    edges: data?.result?.edges || [],
    nextMaxId: data?.result?.next_max_id || data?.result?.page_info?.end_cursor || "",
  };
}

// Try a direct single-post endpoint first (instant, no feed scan). The
// instagram120 host may or may not expose this; we silently fall through
// to feed-pagination if it 404s or returns nothing.
async function fetchInstagramPostByShortcode(shortcode: string, rapidApiKey: string): Promise<any | null> {
  try {
    const response = await fetch(`https://${RAPIDAPI_HOST}/api/instagram/post`, {
      method: "POST",
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shortcode, code: shortcode }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    // Different endpoints return different shapes; try common keys.
    return data?.result?.media || data?.result?.node || data?.result || data?.media || null;
  } catch {
    return null;
  }
}

// Per-handle in-memory feed cache. Edge functions are short-lived but reused
// for several minutes between cold starts, so consecutive lookups for the
// same artist within a session skip the RapidAPI round-trip entirely.
type FeedCacheEntry = { ts: number; edges: any[] };
const feedCache = new Map<string, FeedCacheEntry>();
const FEED_TTL_MS = 5 * 60 * 1000; // IG CDN URLs typically live ~30 min; 5 min cache leaves headroom
// DB cache TTL — extended 2026-05-12 from 25min to 4h. IG CDN URLs are
// observed to live 4-6h with the signed params we get back. When a URL
// does expire mid-playback, the client's onLoadError fires force=true and
// refetches fresh — so the trade-off is "most users hit instant DB cache"
// vs "few unlucky users see one 2-5s reload."
const DB_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  try {
    // item_id is preferred (lets us read/write DB cache); item_url and star_id
    // are used to resolve from RapidAPI on miss. star_id remains required so
    // the resolver knows which IG handle to pull the feed from. force=true
    // bypasses both DB cache and in-memory feed cache — used by clients when
    // a cached URL expires mid-playback.
    const { star_id, item_url, item_id, force } = await req.json();
    if (!star_id || !item_url) {
      return new Response(JSON.stringify({ error: "star_id and item_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortcode = extractShortcode(item_url);
    if (!shortcode) {
      return new Response(JSON.stringify({ error: "Invalid Instagram URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ error: "RAPIDAPI_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. DB cache check (skipped if force=true) ────────────────────
    if (item_id && !force) {
      const tDbCache0 = Date.now();
      const { data: cached } = await supabase
        .from("ktrenz_h1_ig_media_cache")
        .select("items, expires_at")
        .eq("item_id", item_id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cached?.items) {
        const total = Date.now() - t0;
        console.info(`[ig-media] db_cache_hit item=${item_id} db_read_ms=${Date.now() - tDbCache0} total_ms=${total}`);
        return new Response(
          JSON.stringify({ shortcode, items: cached.items, cache_hit: true, cache_layer: "db" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (force && item_id) {
      // Forced refresh — drop the row so subsequent reads aren't stale either.
      await supabase.from("ktrenz_h1_ig_media_cache").delete().eq("item_id", item_id);
      // Also drop the in-memory feed cache for this artist's handle (resolved
      // below). Cheaper to clear by handle than enumerate.
    }

    // ── 2. Resolve from RapidAPI ───────────────────────────────────────
    const tDb0 = Date.now();
    const { data: star, error: starError } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, social_handles")
      .eq("id", star_id)
      .maybeSingle();
    const tDb = Date.now() - tDb0;

    if (starError || !star) {
      throw new Error(starError?.message || "Star not found");
    }

    const handle = (star.social_handles as Record<string, string | undefined> | null)?.instagram;
    if (!handle) {
      return new Response(
        JSON.stringify({ shortcode, items: [], reason: "no_ig_handle" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const handleKey = handle.replace(/^@/, "").toLowerCase();
    if (force) feedCache.delete(handleKey);

    // ── Strategy A: direct single-post endpoint (fastest path) ───────
    let node: any = null;
    const tDirect0 = Date.now();
    const direct = await fetchInstagramPostByShortcode(shortcode, rapidApiKey);
    if (direct && (direct?.code || direct?.shortcode || direct?.id || direct?.video_url || direct?.image_versions2)) {
      node = direct;
      console.info(`[ig-media] direct_hit shortcode=${shortcode} ms=${Date.now() - tDirect0}`);
    }

    // ── Strategy B: scan recent feed (cached) + paginate if needed ────
    let cacheHit = false;
    if (!node) {
      const cached = feedCache.get(handleKey);
      let edges: any[];
      if (cached && Date.now() - cached.ts < FEED_TTL_MS) {
        edges = cached.edges;
        cacheHit = true;
      } else {
        const tApi0 = Date.now();
        const first = await fetchInstagramFeed(handle, rapidApiKey);
        edges = first.edges;
        // Paginate up to 2 more pages if shortcode not in first page —
        // covers older posts that weren't surfaced in the latest feed.
        let nextMaxId = first.nextMaxId;
        let pages = 1;
        while (
          nextMaxId &&
          pages < 3 &&
          !edges
            .map((edge: any) => edge?.node || edge)
            .some((entry: any) => (entry?.code || entry?.shortcode) === shortcode)
        ) {
          const next = await fetchInstagramFeed(handle, rapidApiKey, nextMaxId);
          edges = [...edges, ...next.edges];
          nextMaxId = next.nextMaxId;
          pages += 1;
        }
        const tApi = Date.now() - tApi0;
        feedCache.set(handleKey, { ts: Date.now(), edges });
        console.info(`[ig-media] handle=${handleKey} feed_fetch_ms=${tApi} edges=${edges.length} pages=${pages}`);
      }

      node = edges
        .map((edge: any) => edge?.node || edge)
        .find((entry: any) => (entry?.code || entry?.shortcode) === shortcode);
    }

    if (!node) {
      console.info(`[ig-media] miss handle=${handleKey} shortcode=${shortcode} cache_hit=${cacheHit}`);
      // Return 200 with empty items + reason so the client doesn't see a
      // browser-level 404 noise in console (it falls back to the open-in-IG
      // CTA either way).
      return new Response(
        JSON.stringify({ shortcode, items: [], reason: "post_not_in_feed", cache_hit: cacheHit }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const items = resolveMedia(node);
    if (!items.length) {
      return new Response(
        JSON.stringify({ shortcode, items: [], reason: "no_playable_media" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. Persist to DB cache (fire-and-forget) ──────────────────────
    if (item_id) {
      const expires = new Date(Date.now() + DB_CACHE_TTL_MS).toISOString();
      supabase
        .from("ktrenz_h1_ig_media_cache")
        .upsert({ item_id, shortcode, items, resolved_at: new Date().toISOString(), expires_at: expires }, { onConflict: "item_id" })
        .then(({ error }) => {
          if (error) console.warn(`[ig-media] db_cache_write_failed item=${item_id}:`, error.message);
        });
    }

    const total = Date.now() - t0;
    console.info(`[ig-media] resolved handle=${handleKey} shortcode=${shortcode} feed_cache=${cacheHit} db_ms=${tDb} total_ms=${total}`);
    return new Response(
      JSON.stringify({ shortcode, items, cache_hit: cacheHit, cache_layer: "rapidapi" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`[ig-media] error after ${Date.now() - t0}ms:`, (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});