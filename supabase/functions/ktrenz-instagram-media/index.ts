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

async function fetchInstagramFeed(handle: string, rapidApiKey: string) {
  const response = await fetch(`https://${RAPIDAPI_HOST}/api/instagram/posts`, {
    method: "POST",
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: handle.replace(/^@/, ""), maxId: "" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Instagram API [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return data?.result?.edges || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { star_id, item_url } = await req.json();
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

    const { data: star, error: starError } = await supabase
      .from("ktrenz_stars")
      .select("id, display_name, social_handles")
      .eq("id", star_id)
      .maybeSingle();

    if (starError || !star) {
      throw new Error(starError?.message || "Star not found");
    }

    const handle = (star.social_handles as Record<string, string | undefined> | null)?.instagram;
    if (!handle) {
      return new Response(JSON.stringify({ error: "Instagram handle not found for star" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const edges = await fetchInstagramFeed(handle, rapidApiKey);
    const node = edges
      .map((edge: any) => edge?.node || edge)
      .find((entry: any) => (entry?.code || entry?.shortcode) === shortcode);

    if (!node) {
      return new Response(JSON.stringify({ error: "Instagram post not found in feed" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = resolveMedia(node);
    if (!items.length) {
      return new Response(JSON.stringify({ error: "No playable Instagram media found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ shortcode, items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});