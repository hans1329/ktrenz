// P2 Pipeline: TikTok Trending Korea via tiktok-api23 (RapidAPI)
// Strategy: search popular Korean trend seed keywords → extract hashtags
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TIKTOK_API_HOST = "tiktok-api23.p.rapidapi.com";

// Korean trend seed keywords to search
const SEED_KEYWORDS = [
  "한국 트렌드", "kpop", "viral korea", "틱톡 인기",
  "korean fashion", "korean beauty", "먹방", "챌린지",
  "korean drama", "핫플", "요즘 유행", "korean trend 2025",
];

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

    console.log("[p2-tiktok] Starting TikTok trending keyword extraction...");

    const tagMap = new Map<string, { views: number; desc: string; author: string; seedKeyword: string }>();
    let totalVideos = 0;
    let apiCalls = 0;

    for (const seed of SEED_KEYWORDS) {
      try {
        const url = `https://${TIKTOK_API_HOST}/api/search/video?keyword=${encodeURIComponent(seed)}&search_id=0`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "x-rapidapi-host": TIKTOK_API_HOST,
            "x-rapidapi-key": rapidApiKey,
          },
        });
        apiCalls++;

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[p2-tiktok] Search "${seed}" failed ${res.status}: ${errText.substring(0, 200)}`);
          continue;
        }

        const data = await res.json();
        const items = data?.item_list || [];
        totalVideos += items.length;

        for (const item of items) {
          const desc: string = item.desc || "";
          const views = item.stats?.playCount || 0;
          const author = item.author?.uniqueId || "";

          // Extract hashtags from description
          const hashtags = desc.match(/#[\w\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]+/g) || [];
          for (const tag of hashtags) {
            const clean = tag.replace("#", "").trim();
            if (!clean || clean.length < 2) continue;
            const existing = tagMap.get(clean);
            if (!existing || views > existing.views) {
              tagMap.set(clean, { views, desc: desc.substring(0, 100), author, seedKeyword: seed });
            }
          }

          // Extract from challenges/textExtra
          const challenges = item.challenges || item.textExtra || [];
          for (const c of challenges) {
            const name = c.hashtagName || c.title || "";
            if (!name || name.length < 2) continue;
            const existing = tagMap.get(name);
            if (!existing || views > existing.views) {
              tagMap.set(name, { views, desc: desc.substring(0, 100), author, seedKeyword: seed });
            }
          }
        }

        console.log(`[p2-tiktok] "${seed}" → ${items.length} videos, running hashtags: ${tagMap.size}`);
      } catch (err) {
        console.warn(`[p2-tiktok] Error searching "${seed}":`, err);
      }
    }

    const sorted = Array.from(tagMap.entries())
      .sort((a, b) => b[1].views - a[1].views);

    console.log(`[p2-tiktok] Done: ${apiCalls} API calls, ${totalVideos} videos, ${sorted.length} unique hashtags`);

    const result = {
      success: true,
      source: "tiktok_trending_kr",
      api_calls: apiCalls,
      total_videos: totalVideos,
      unique_hashtags: sorted.length,
      top_100: sorted.slice(0, 100).map(([tag, info], idx) => ({
        rank: idx + 1,
        tag,
        views: info.views,
        author: info.author,
        seed: info.seedKeyword,
      })),
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
