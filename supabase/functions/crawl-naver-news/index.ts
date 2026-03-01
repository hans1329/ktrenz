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
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\[사진\]|\[포토\]|\[화보\]|\[영상\]/g, "").trim();
}

// 제목 유사도 체크 (간단한 토큰 기반)
function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.replace(/[^가-힣a-zA-Z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 1));
  const tokensB = new Set(b.replace(/[^가-힣a-zA-Z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function deduplicateByTitle(items: { title: string }[]): typeof items {
  const result: typeof items = [];
  for (const item of items) {
    const isDup = result.some(r => titleSimilarity(r.title, item.title) > 0.6);
    if (!isDup) result.push(item);
  }
  return result;
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KTrenZBot/1.0)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // og:image 메타태그 추출
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
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
    const weight = 1.3;
    const weightedCount = Math.round(mentionCount * weight);

    // 제목 기반 중복 제거 후 상위 5개
    const strippedFiltered = filtered.map(item => ({ ...item, cleanTitle: stripHtml(item.title) }));
    const deduplicated = deduplicateByTitle(strippedFiltered.map(i => ({ ...i, title: i.cleanTitle })));
    const top5Indices = deduplicated.slice(0, 5).map(d => strippedFiltered.findIndex(s => s.cleanTitle === d.title));
    const top5 = top5Indices.map(i => filtered[i]);

    // 상위 기사의 og:image 병렬 추출
    const ogImages = await Promise.all(
      top5.map((item) => fetchOgImage(item.originallink || item.link))
    );

    const topMentions = top5.map((item, i) => ({
      title: stripHtml(item.title),
      url: item.originallink || item.link,
      description: stripHtml(item.description),
      source: "naver_news",
      image: ogImages[i] || null,
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
