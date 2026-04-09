const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY") || "";
  const HOST = "instagram120.p.rapidapi.com";

  const tests = [
    { name: "POST profile", url: `https://${HOST}/api/instagram/profile`, body: { username: "bts.bighitofficial" } },
    { name: "POST posts", url: `https://${HOST}/api/instagram/posts`, body: { username: "bts.bighitofficial", maxId: "" } },
    { name: "GET posts", url: `https://${HOST}/api/instagram/posts/bts.bighitofficial?count=3`, body: null },
  ];

  const results: any[] = [];
  for (const t of tests) {
    try {
      const init: RequestInit = {
        headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": RAPIDAPI_KEY, "Content-Type": "application/json" },
      };
      if (t.body) {
        init.method = "POST";
        init.body = JSON.stringify(t.body);
      }
      const res = await fetch(t.url, init);
      const quota: Record<string,string> = {};
      for (const [k, v] of res.headers.entries()) {
        if (k.includes("ratelimit") || k.includes("remaining")) quota[k] = v;
      }
      const body = await res.text();
      results.push({ name: t.name, status: res.status, quota, body: body.substring(0, 600) });
    } catch (e) {
      results.push({ name: t.name, error: String(e) });
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
