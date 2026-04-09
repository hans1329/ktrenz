// P2 YouTube Trending Test
// YouTube Data API v3 - mostPopular videos in Korea

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
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "YOUTUBE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Most Popular videos in Korea
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "KR");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);

    console.log("[p2-yt-test] Fetching mostPopular KR videos...");

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[p2-yt-test] YouTube API error ${res.status}:`, errBody);
      return new Response(JSON.stringify({
        error: `YouTube API ${res.status}`,
        detail: errBody,
      }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const items = data.items || [];

    console.log(`[p2-yt-test] Got ${items.length} videos`);

    // Extract keywords from video titles and tags
    const results = items.map((item: any, idx: number) => ({
      rank: idx + 1,
      title: item.snippet?.title,
      channel: item.snippet?.channelTitle,
      tags: (item.snippet?.tags || []).slice(0, 10),
      views: item.statistics?.viewCount,
      category_id: item.snippet?.categoryId,
      published_at: item.snippet?.publishedAt,
    }));

    // Collect unique tags across all videos
    const allTags = new Set<string>();
    for (const r of results) {
      for (const tag of r.tags) {
        allTags.add(tag);
      }
    }

    const summary = {
      success: true,
      total_videos: items.length,
      unique_tags: allTags.size,
      sample_tags: Array.from(allTags).slice(0, 30),
      videos: results.slice(0, 10), // show top 10 for brevity
    };

    console.log(`[p2-yt-test] ${items.length} videos, ${allTags.size} unique tags`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-yt-test] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
