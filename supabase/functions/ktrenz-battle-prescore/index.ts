// ktrenz-battle-prescore: 전체 tier-1 스타 대상 네이버 뉴스 기사수 기반 가점수 스코어링
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10; // parallel naver requests per batch
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getNaverNewsCount(
  clientId: string, clientSecret: string, query: string
): Promise<number> {
  try {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "1");
    url.searchParams.set("sort", "date");
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total || 0;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const naverId = Deno.env.get("NAVER_CLIENT_ID") || "";
    const naverSecret = Deno.env.get("NAVER_CLIENT_SECRET") || "";

    if (!naverId || !naverSecret) {
      return new Response(JSON.stringify({ error: "Naver API keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Get all tier-1 active stars
    const { data: stars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_category, image_url")
      .eq("is_active", true)
      .order("display_name");

    if (starsErr) throw starsErr;
    if (!stars || stars.length === 0) {
      return new Response(JSON.stringify({ error: "No active stars found", count: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const batchId = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const results: any[] = [];

    // Process in batches to avoid rate limiting
    for (let i = 0; i < stars.length; i += BATCH_SIZE) {
      const batch = stars.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (star) => {
          const searchName = star.name_ko || star.display_name;
          const newsCount = await getNaverNewsCount(naverId, naverSecret, searchName);
          // Simple pre-score: news count directly (can be refined later)
          const preScore = newsCount;
          return {
            star_id: star.id,
            news_count: newsCount,
            pre_score: preScore,
            batch_id: batchId,
          };
        })
      );
      results.push(...batchResults);

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < stars.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Delete old prescores and insert new ones
    await sb.from("ktrenz_b2_prescores").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Insert in chunks (Supabase default limit)
    for (let i = 0; i < results.length; i += 500) {
      const chunk = results.slice(i, i + 500);
      const { error: insertErr } = await sb.from("ktrenz_b2_prescores").insert(chunk);
      if (insertErr) console.error("Insert error:", insertErr);
    }

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_stars: results.length,
      scored: results.filter((r) => r.news_count > 0).length,
      top_10: results
        .sort((a, b) => b.pre_score - a.pre_score)
        .slice(0, 10)
        .map((r) => {
          const star = stars.find((s) => s.id === r.star_id);
          return { name: star?.display_name, name_ko: star?.name_ko, news_count: r.news_count, pre_score: r.pre_score };
        }),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Prescore error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
