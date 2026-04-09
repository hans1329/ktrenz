const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY") || "";
  const HOST = "instagram120.p.rapidapi.com";

  const tests = [
    { name: "search", url: `https://${HOST}/api/search/hashtag?query=bts` },
    { name: "hashtag_posts", url: `https://${HOST}/api/hashtag/posts?hashtag=bts&count=5` },
    { name: "user_info", url: `https://${HOST}/api/user/info?username=bts.bighitofficial` },
    { name: "user_posts_v2", url: `https://${HOST}/api/user/posts?username=bts.bighitofficial&count=3` },
    { name: "user_feed_v2", url: `https://${HOST}/api/user/feed?username=bts.bighitofficial&count=3` },
    { name: "explore", url: `https://${HOST}/api/explore/posts?count=5` },
    { name: "trending", url: `https://${HOST}/api/trending` },
    { name: "search_users", url: `https://${HOST}/api/search/users?query=bts` },
  ];

  const results: any[] = [];
  for (const t of tests) {
    try {
      const res = await fetch(t.url, {
        headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": RAPIDAPI_KEY },
      });
      const body = await res.text();
      results.push({ name: t.name, status: res.status, body: body.substring(0, 400) });
    } catch (e) {
      results.push({ name: t.name, error: String(e) });
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
