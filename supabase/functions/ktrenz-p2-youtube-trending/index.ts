// P2 Pipeline: YouTube Trending Korea
// YouTube Data API v3 - mostPopular videos → extract tags as keywords
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
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "YOUTUBE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[p2-yt] Fetching mostPopular KR videos...");

    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "KR");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[p2-yt] YouTube API error ${res.status}:`, errBody);
      return new Response(JSON.stringify({ error: `YouTube API ${res.status}`, detail: errBody }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const items = data.items || [];
    console.log(`[p2-yt] Got ${items.length} videos`);

    const today = new Date().toISOString().split("T")[0];

    // Extract tags with view count for popularity ranking
    const tagMap = new Map<string, { views: number; videoTitle: string; channel: string }>();

    for (const item of items) {
      const tags: string[] = item.snippet?.tags || [];
      const views = parseInt(item.statistics?.viewCount || "0", 10);
      const videoTitle = item.snippet?.title || "";
      const channel = item.snippet?.channelTitle || "";

      for (const tag of tags) {
        const normalized = tag.trim();
        if (!normalized || normalized.length < 2) continue;
        
        const existing = tagMap.get(normalized);
        if (!existing || views > existing.views) {
          tagMap.set(normalized, { views, videoTitle, channel });
        }
      }
    }

    // Sort by views (popularity)
    const sorted = Array.from(tagMap.entries())
      .sort((a, b) => b[1].views - a[1].views);

    console.log(`[p2-yt] ${sorted.length} unique tags extracted`);

    // Delete old youtube_trending data
    await supabase.from("ktrenz_p2_keywords")
      .delete()
      .eq("discover_source", "youtube_trending_kr");

    // Build rows
    const rows = sorted.map(([tag, info], idx) => ({
      keyword: tag,
      keyword_ko: tag,
      discover_source: "youtube_trending_kr",
      discover_date: today,
      category: "youtube",
      relevance_score: 0,
      raw_context: {
        views: info.views,
        video_title: info.videoTitle,
        channel: info.channel,
        rank: idx + 1,
      },
      status: "active",
    }));

    // Batch upsert (max 200 per batch)
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase
        .from("ktrenz_p2_keywords")
        .upsert(batch, { onConflict: "keyword,discover_source,discover_date", ignoreDuplicates: true });
      if (error) console.error("[p2-yt] Insert error:", error.message);
      else saved += batch.length;
    }

    const result = {
      success: true,
      source: "youtube_trending_kr",
      videos_fetched: items.length,
      unique_tags: sorted.length,
      saved,
    };

    console.log(`[p2-yt] Done: ${saved} keywords saved`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-yt] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
