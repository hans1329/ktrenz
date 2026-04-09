// P2 Pipeline: TikTok Trending Korea via tiktok-api23 (RapidAPI)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ error: "RAPIDAPI_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[p2-tiktok] Fetching trending from tiktok-api23...");

    // tiktok-api23: GET /api/trending/feed with country_code
    const url = new URL("https://tiktok-api23.p.rapidapi.com/api/trending/feed");
    url.searchParams.set("count", "30");
    url.searchParams.set("region", "KR");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-rapidapi-host": "tiktok-api23.p.rapidapi.com",
        "x-rapidapi-key": rapidApiKey,
      },
    });

    const statusCode = res.status;
    const body = await res.text();

    if (!res.ok) {
      console.error(`[p2-tiktok] API error ${statusCode}:`, body);
      return new Response(JSON.stringify({ 
        error: `tiktok-api23 ${statusCode}`, 
        detail: body.substring(0, 500) 
      }), {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      console.error("[p2-tiktok] Invalid JSON response:", body.substring(0, 300));
      return new Response(JSON.stringify({ error: "Invalid JSON", preview: body.substring(0, 300) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract hashtags/keywords from trending videos
    const items = data?.itemList || data?.items || data?.data?.items || [];
    console.log(`[p2-tiktok] Got ${items.length} items. Keys: ${Object.keys(data).join(",")}`);

    const tagMap = new Map<string, { views: number; desc: string; author: string }>();

    for (const item of items) {
      const desc: string = item.desc || "";
      const views = item.stats?.playCount || item.playCount || 0;
      const author = item.author?.uniqueId || item.author?.nickname || "";

      // Extract hashtags from description
      const hashtags = desc.match(/#[\w\uAC00-\uD7AF\u3040-\u30FF]+/g) || [];
      for (const tag of hashtags) {
        const clean = tag.replace("#", "").trim();
        if (!clean || clean.length < 2) continue;
        const existing = tagMap.get(clean);
        if (!existing || views > existing.views) {
          tagMap.set(clean, { views, desc: desc.substring(0, 100), author });
        }
      }

      // Also extract from challenges/textExtra if available
      const challenges = item.challenges || item.textExtra || [];
      for (const c of challenges) {
        const name = c.hashtagName || c.title || c.hashtagTitle || "";
        if (!name || name.length < 2) continue;
        const existing = tagMap.get(name);
        if (!existing || views > existing.views) {
          tagMap.set(name, { views, desc: desc.substring(0, 100), author });
        }
      }
    }

    const sorted = Array.from(tagMap.entries())
      .sort((a, b) => b[1].views - a[1].views);

    console.log(`[p2-tiktok] ${sorted.length} unique hashtags extracted`);

    // Return test result (don't save to DB yet)
    const result = {
      success: true,
      source: "tiktok_trending_kr",
      api_response_keys: Object.keys(data),
      items_count: items.length,
      unique_hashtags: sorted.length,
      sample_hashtags: sorted.slice(0, 20).map(([tag, info]) => ({
        tag,
        views: info.views,
        author: info.author,
      })),
      raw_first_item_keys: items.length > 0 ? Object.keys(items[0]) : [],
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-tiktok] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
