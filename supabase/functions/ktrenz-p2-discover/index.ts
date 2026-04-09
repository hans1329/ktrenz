// P2 Pipeline: Google Trends Korea 실시간 급상승 검색어 수집
// SerpAPI를 통해 한국 급상승 검색어를 가져와 ktrenz_p2_keywords에 저장
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
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!serpApiKey) {
      return new Response(JSON.stringify({ error: "SERPAPI_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 기존 데이터 전체 삭제
    await supabase.from("ktrenz_p2_keywords").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 2. SerpAPI Google Trends Trending Now (Korea)
    console.log("[p2-discover] Fetching Google Trends Korea...");
    const trendRes = await fetch(
      `https://serpapi.com/search.json?engine=google_trends_trending_now&geo=KR&api_key=${serpApiKey}`
    );

    if (!trendRes.ok) {
      const errText = await trendRes.text();
      console.error(`[p2-discover] SerpAPI error: ${trendRes.status}`);
      return new Response(JSON.stringify({ error: `SerpAPI ${trendRes.status}`, detail: errText.slice(0, 200) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trendData = await trendRes.json();
    const trends = trendData.trending_searches || [];
    console.log(`[p2-discover] Got ${trends.length} trending searches`);

    // 3. Build batch rows (limit 50 most relevant)
    const today = new Date().toISOString().split("T")[0];
    const rows = trends.slice(0, 50).map((t: any) => {
      const keyword = t.query || t.title || "";
      const articleTitles = (t.articles || []).slice(0, 3).map((a: any) => a.title).filter(Boolean);
      return {
        keyword,
        keyword_ko: keyword,
        discover_source: "google_trends_kr",
        discover_date: today,
        relevance_score: 0,
        raw_context: {
          search_volume: t.search_volume || t.formattedTraffic || "",
          article_count: t.articles?.length || 0,
          article_titles: articleTitles,
        },
        status: "active",
      };
    }).filter((r: any) => r.keyword.length > 0);

    // 4. Batch upsert
    const { error: insertErr, data: inserted } = await supabase
      .from("ktrenz_p2_keywords")
      .upsert(rows, { onConflict: "keyword,discover_source,discover_date", ignoreDuplicates: true })
      .select("id");

    if (insertErr) {
      console.error("[p2-discover] Batch insert error:", insertErr.message);
    }

    const saved = inserted?.length || rows.length;
    console.log(`[p2-discover] Done: ${saved} keywords saved`);

    return new Response(JSON.stringify({
      success: true,
      source: "google_trends_kr",
      total_from_api: trends.length,
      saved,
      keywords: rows.slice(0, 20).map((r: any) => ({
        keyword: r.keyword,
        volume: r.raw_context.search_volume,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-discover] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
