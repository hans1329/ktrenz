// P2 Pipeline: 네이버 쇼핑 인사이트 인기 키워드 수집
// 네이버 DataLab 쇼핑 인사이트에서 카테고리별 인기 검색 키워드를 수집
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 주요 쇼핑 카테고리 코드 (네이버 DataLab 기준)
const SHOPPING_CATEGORIES = [
  { code: "50000000", name: "패션의류" },
  { code: "50000001", name: "패션잡화" },
  { code: "50000002", name: "화장품/미용" },
  { code: "50000003", name: "디지털/가전" },
  { code: "50000004", name: "가구/인테리어" },
  { code: "50000005", name: "출산/육아" },
  { code: "50000006", name: "식품" },
  { code: "50000007", name: "스포츠/레저" },
  { code: "50000008", name: "생활/건강" },
  { code: "50000009", name: "여가/생활편의" },
];

async function fetchShoppingKeywords(
  categoryCode: string,
  naverId: string,
  naverSecret: string,
): Promise<{ keyword: string; ratio: number }[]> {
  // 네이버 DataLab 쇼핑 인사이트 내부 API 사용
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 7);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const url = "https://openapi.naver.com/v1/datalab/shopping/category/keyword/top";
  const body = {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    timeUnit: "date",
    category: categoryCode,
    device: "",
    gender: "",
    ages: [],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": naverId,
        "X-Naver-Client-Secret": naverSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // 공식 API가 아닐 수 있으므로 fallback
      console.log(`[p2-naver] Category ${categoryCode} API returned ${res.status}, trying fallback...`);
      return await fetchShoppingKeywordsFallback(categoryCode);
    }

    const data = await res.json();
    const results = data.results?.[0]?.data || [];
    return results.map((d: any) => ({
      keyword: d.keyword || d.period,
      ratio: d.ratio || 0,
    }));
  } catch (err) {
    console.error(`[p2-naver] Error for category ${categoryCode}:`, err);
    return await fetchShoppingKeywordsFallback(categoryCode);
  }
}

// Fallback: 네이버 DataLab 웹 내부 API
async function fetchShoppingKeywordsFallback(
  categoryCode: string,
): Promise<{ keyword: string; ratio: number }[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const url = `https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver`;
    const params = new URLSearchParams({
      cid: categoryCode,
      timeUnit: "date",
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      age: "",
      gender: "",
      device: "",
      page: "1",
      count: "20",
    });

    const res = await fetch(`${url}?${params}`, {
      headers: {
        "Referer": "https://datalab.naver.com/shoppingInsight/sKeyword.naver",
        "User-Agent": "Mozilla/5.0 (compatible; K-TRENZ/1.0)",
      },
    });

    if (!res.ok) {
      console.log(`[p2-naver] Fallback also failed for ${categoryCode}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const ranks = data.ranks || [];
    return ranks.map((r: any) => ({
      keyword: r.keyword || r.name,
      ratio: r.value || r.ratio || 0,
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const naverId = Deno.env.get("NAVER_CLIENT_ID");
    const naverSecret = Deno.env.get("NAVER_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!naverId || !naverSecret) {
      return new Response(JSON.stringify({ error: "NAVER credentials missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. 기존 naver_shopping 데이터 삭제
    await supabase.from("ktrenz_p2_keywords")
      .delete()
      .eq("discover_source", "naver_shopping");

    console.log("[p2-naver] Fetching shopping keywords for", SHOPPING_CATEGORIES.length, "categories");

    const today = new Date().toISOString().split("T")[0];
    const allRows: any[] = [];

    // 2. 카테고리별 인기 키워드 수집
    for (const cat of SHOPPING_CATEGORIES) {
      const keywords = await fetchShoppingKeywords(cat.code, naverId, naverSecret);
      console.log(`[p2-naver] ${cat.name}: ${keywords.length} keywords`);

      for (const kw of keywords) {
        if (!kw.keyword) continue;
        allRows.push({
          keyword: kw.keyword,
          keyword_ko: kw.keyword,
          discover_source: "naver_shopping",
          discover_date: today,
          category: cat.name,
          relevance_score: 0,
          raw_context: {
            category_code: cat.code,
            category_name: cat.name,
            ratio: kw.ratio,
          },
          status: "active",
        });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[p2-naver] Total: ${allRows.length} keywords collected`);

    // 3. 중복 제거 (같은 키워드가 여러 카테고리에 있을 수 있음)
    const seen = new Set<string>();
    const uniqueRows = allRows.filter(r => {
      const key = r.keyword;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. Batch upsert
    if (uniqueRows.length > 0) {
      const { error } = await supabase
        .from("ktrenz_p2_keywords")
        .upsert(uniqueRows, { onConflict: "keyword,discover_source,discover_date", ignoreDuplicates: true });

      if (error) console.error("[p2-naver] Insert error:", error.message);
    }

    const result = {
      success: true,
      source: "naver_shopping",
      categories_checked: SHOPPING_CATEGORIES.length,
      total_collected: allRows.length,
      unique_saved: uniqueRows.length,
      by_category: SHOPPING_CATEGORIES.map(c => ({
        name: c.name,
        count: allRows.filter(r => r.category === c.name).length,
      })),
    };

    console.log(`[p2-naver] Done: ${uniqueRows.length} unique keywords saved`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-naver] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
