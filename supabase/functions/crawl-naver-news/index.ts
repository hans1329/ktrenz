// 네이버 뉴스 검색 API를 통한 아티스트 뉴스 수집
// Firecrawl 대신 네이버 개발자 API 직접 사용
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverNewsResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverNewsItem[];
}

async function searchNaverNews(
  clientId: string,
  clientSecret: string,
  query: string,
  display: number = 100,
  sort: string = "date",
): Promise<NaverNewsItem[]> {
  try {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(display, 100)));
    url.searchParams.set("sort", sort);

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[crawl-naver-news] Naver API failed: ${response.status} ${err}`);
      return [];
    }

    const data: NaverNewsResponse = await response.json();
    return data.items || [];
  } catch (e) {
    console.warn(`[crawl-naver-news] Error: ${(e as Error).message}`);
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { artistName, wikiEntryId } = body;

    if (!artistName) {
      return new Response(
        JSON.stringify({ success: false, error: "artistName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const clientId = Deno.env.get("NAVER_CLIENT_ID");
    const clientSecret = Deno.env.get("NAVER_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "NAVER_CLIENT_ID/SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 24시간 필터를 위한 cutoff
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    // 한국어 + 영어 검색 병렬 실행
    const [koResults, enResults] = await Promise.all([
      searchNaverNews(clientId, clientSecret, `"${artistName}"`, 100, "date"),
      searchNaverNews(clientId, clientSecret, `"${artistName}" kpop`, 50, "date"),
    ]);

    // 중복 제거 (link 기준)
    const seenLinks = new Set<string>();
    const allItems: NaverNewsItem[] = [];
    for (const item of [...koResults, ...enResults]) {
      if (!seenLinks.has(item.link)) {
        seenLinks.add(item.link);
        allItems.push(item);
      }
    }

    // 24시간 이내 필터링
    const filtered = allItems.filter((item) => {
      const pubTime = new Date(item.pubDate).getTime();
      return !isNaN(pubTime) && pubTime >= cutoff24h;
    });

    const mentionCount = filtered.length;
    const weight = 1.3; // naver 가중치
    const weightedCount = Math.round(mentionCount * weight);

    const topMentions = filtered.slice(0, 5).map((item) => ({
      title: stripHtml(item.title),
      url: item.originallink || item.link,
      description: stripHtml(item.description),
      source: "naver_news",
    }));

    console.log(
      `[crawl-naver-news] ${artistName}: ${mentionCount} articles (24h), total fetched: ${allItems.length}`,
    );

    // DB 업데이트
    if (wikiEntryId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      // 스냅샷 저장
      await sb.from("ktrenz_data_snapshots").insert({
        wiki_entry_id: wikiEntryId,
        platform: "naver_news",
        metrics: {
          mention_count: mentionCount,
          weighted_count: weightedCount,
          weight,
          total_fetched: allItems.length,
        },
        raw_response: { top_items: topMentions },
      });

      // buzz_multi 스냅샷의 source_breakdown에 naver 데이터 반영
      // → crawl-x-mentions의 naver 소스 대신 이 데이터가 사용됨
    }

    return new Response(
      JSON.stringify({
        success: true,
        artistName,
        mentionCount,
        weightedCount,
        weight,
        totalFetched: allItems.length,
        topMentions,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[crawl-naver-news] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
