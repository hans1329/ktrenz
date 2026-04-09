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

    // 1. 기존 데이터 삭제 (매 수집마다 fresh data)
    const { error: delErr } = await supabase
      .from("ktrenz_p2_keywords")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
    if (delErr) console.error("[p2-discover] Delete error:", delErr.message);

    // 2. SerpAPI Google Trends Trending Now (Korea)
    console.log("[p2-discover] Fetching Google Trends Korea...");
    const trendUrl = `https://serpapi.com/search.json?engine=google_trends_trending_now&geo=KR&api_key=${serpApiKey}`;
    const trendRes = await fetch(trendUrl);
    
    if (!trendRes.ok) {
      const errText = await trendRes.text();
      console.error(`[p2-discover] SerpAPI error: ${trendRes.status} ${errText}`);
      return new Response(JSON.stringify({ error: `SerpAPI error: ${trendRes.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trendData = await trendRes.json();
    const trendingSearches = trendData.trending_searches || [];

    console.log(`[p2-discover] Got ${trendingSearches.length} trending searches`);

    // 3. Parse and save keywords
    const today = new Date().toISOString().split("T")[0];
    let saved = 0;
    const keywordsList: { keyword: string; volume: string; articles: number }[] = [];

    for (const trend of trendingSearches) {
      const keyword = trend.query || trend.title;
      if (!keyword) continue;

      const searchVolume = trend.search_volume || trend.formattedTraffic || "";
      const articles = trend.articles?.length || 0;
      const articleTitles = (trend.articles || [])
        .slice(0, 3)
        .map((a: any) => a.title)
        .filter(Boolean);

      const { error } = await supabase
        .from("ktrenz_p2_keywords")
        .upsert({
          keyword,
          keyword_ko: keyword,
          keyword_en: null,
          discover_source: "google_trends_kr",
          discover_date: today,
          category: null,
          relevance_score: 0,
          matched_star_id: null,
          raw_context: {
            search_volume: searchVolume,
            article_count: articles,
            article_titles: articleTitles,
            source_url: trend.serpapi_link || null,
          },
          status: "active",
        }, {
          onConflict: "keyword,discover_source,discover_date",
          ignoreDuplicates: true,
        });

      if (error) {
        console.error(`[p2-discover] Insert error for "${keyword}":`, error.message);
      } else {
        saved++;
        keywordsList.push({ keyword, volume: searchVolume, articles });
      }
    }

    const result = {
      success: true,
      source: "google_trends_kr",
      total_trending: trendingSearches.length,
      saved,
      keywords: keywordsList.slice(0, 20),
    };

    console.log(`[p2-discover] Done: ${saved} keywords saved`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-discover] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
