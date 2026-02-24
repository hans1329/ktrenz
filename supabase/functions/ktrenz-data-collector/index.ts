import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Firecrawl 스크래핑 ---
async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<any> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Firecrawl error ${resp.status}: ${err}`);
  }
  return resp.json();
}

// --- Circle Chart 파싱 ---
function parseCircleChart(markdown: string): Array<{
  rank: number;
  album: string;
  artist: string;
  sales: number;
  distributor: string;
}> {
  const results: Array<any> = [];
  // Circle Chart 마크다운에서 Rank/Album/Artist/Sales/Distribution 패턴 매칭
  // 스크린샷 기준: 숫자(rank), 앨범명, 아티스트명(괄호 포함), 숫자(sales), 배급사
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    // 순위 숫자 찾기
    const rankMatch = lines[i].match(/^(\d{1,3})$/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1]);
      // 다음 줄들에서 앨범/아티스트/판매량 찾기
      let album = "";
      let artist = "";
      let sales = 0;
      let distributor = "";

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        // 판매량 (콤마 포함 숫자)
        const salesMatch = lines[j].match(/^([\d,]+)$/);
        if (salesMatch && parseInt(salesMatch[1].replace(/,/g, "")) > 100) {
          sales = parseInt(salesMatch[1].replace(/,/g, ""));
          continue;
        }
        // 아티스트 (한글 괄호 포함)
        const artistMatch = lines[j].match(/^(.+?)\s*[\(（](.+?)[\)）]$/);
        if (artistMatch) {
          artist = lines[j];
          continue;
        }
        // 배급사
        if (/Music|Entertainment|PLUS|Kakao|Dreamus|Genie|Stone|Warner|Universal|Interpark/i.test(lines[j])) {
          distributor = lines[j];
          continue;
        }
        // 앨범명 (위 패턴에 안 걸리면)
        if (!album && !lines[j].startsWith("!") && !lines[j].startsWith("[") && lines[j].length > 1) {
          album = lines[j];
        }
      }

      if (album && sales > 0) {
        results.push({ rank, album, artist: artist || "Unknown", sales, distributor });
      }
    }
    i++;
  }

  return results;
}

// --- 한터차트 초동 데이터 파싱 ---
function parseHanteoInitial(markdown: string): Array<{
  album: string;
  artist: string;
  first_week_sales: number;
}> {
  const results: Array<any> = [];
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    // 패턴: 앨범명 -> 판매량(숫자,콤마) -> 아티스트명
    const salesMatch = lines[i].match(/^([\d,]+)$/);
    if (salesMatch) {
      const sales = parseInt(salesMatch[1].replace(/,/g, ""));
      if (sales > 1000) {
        // 이전 줄 = 앨범명, 다음 줄 = 아티스트명
        const album = i > 0 ? lines[i - 1] : "";
        const artist = i + 1 < lines.length ? lines[i + 1] : "";
        if (album && !album.startsWith("!") && !album.startsWith("[") && artist) {
          results.push({
            album: album.replace(/^!\[.*?\]\(.*?\)\s*/, ""),
            artist,
            first_week_sales: sales,
          });
        }
      }
    }
  }

  return results;
}

// --- 아티스트명 → wiki_entry 매칭 ---
async function matchArtistToWikiEntry(
  adminClient: any,
  artistName: string
): Promise<string | null> {
  // 괄호 안의 영문/한글명 추출
  const names: string[] = [artistName];
  const bracketMatch = artistName.match(/[\(（](.+?)[\)）]/);
  if (bracketMatch) {
    names.push(bracketMatch[1].trim());
    names.push(artistName.replace(/\s*[\(（].+?[\)）]/, "").trim());
  }

  for (const name of names) {
    if (!name) continue;
    const { data } = await adminClient
      .from("wiki_entries")
      .select("id, title")
      .ilike("title", `%${name}%`)
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { source } = await req.json().catch(() => ({ source: "all" }));
    const collectSources = source === "all" ? ["circle_chart", "hanteo"] : [source];

    const results: Record<string, any> = {};

    // --- Circle Chart 수집 ---
    if (collectSources.includes("circle_chart")) {
      console.log("[DataCollector] Scraping Circle Chart...");
      try {
        const circleData = await scrapeWithFirecrawl(
          "https://circlechart.kr/page_chart/album.circle",
          FIRECRAWL_API_KEY
        );
        const md = circleData?.data?.markdown || circleData?.markdown || "";
        const parsed = parseCircleChart(md);
        console.log(`[DataCollector] Circle Chart parsed ${parsed.length} entries`);

        let saved = 0;
        for (const entry of parsed) {
          const wikiEntryId = await matchArtistToWikiEntry(adminClient, entry.artist);
          await adminClient.from("ktrenz_data_snapshots").insert({
            wiki_entry_id: wikiEntryId,
            platform: "circle_chart",
            metrics: {
              rank: entry.rank,
              album: entry.album,
              artist: entry.artist,
              weekly_sales: entry.sales,
              distributor: entry.distributor,
              chart_type: "weekly_album",
            },
            raw_response: wikiEntryId ? undefined : { unmatched_artist: entry.artist },
          });
          saved++;
        }

        await adminClient.from("ktrenz_collection_log").insert({
          platform: "circle_chart",
          status: parsed.length > 0 ? "success" : "partial",
          records_collected: saved,
        });
        results.circle_chart = { parsed: parsed.length, saved };
      } catch (e) {
        console.error("[DataCollector] Circle Chart error:", e);
        await adminClient.from("ktrenz_collection_log").insert({
          platform: "circle_chart",
          status: "error",
          error_message: e.message,
          records_collected: 0,
        });
        results.circle_chart = { error: e.message };
      }
    }

    // --- 한터차트 초동 수집 ---
    if (collectSources.includes("hanteo")) {
      console.log("[DataCollector] Scraping Hanteo Chart...");
      try {
        const hanteoData = await scrapeWithFirecrawl(
          "https://www.hanteochart.com/honors/initial",
          FIRECRAWL_API_KEY
        );
        const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
        const parsed = parseHanteoInitial(md);
        console.log(`[DataCollector] Hanteo initial parsed ${parsed.length} entries`);

        let saved = 0;
        for (const entry of parsed) {
          const wikiEntryId = await matchArtistToWikiEntry(adminClient, entry.artist);
          await adminClient.from("ktrenz_data_snapshots").insert({
            wiki_entry_id: wikiEntryId,
            platform: "hanteo",
            metrics: {
              album: entry.album,
              artist: entry.artist,
              first_week_sales: entry.first_week_sales,
              chart_type: "initial_sales",
            },
            raw_response: wikiEntryId ? undefined : { unmatched_artist: entry.artist },
          });
          saved++;
        }

        await adminClient.from("ktrenz_collection_log").insert({
          platform: "hanteo",
          status: parsed.length > 0 ? "success" : "partial",
          records_collected: saved,
        });
        results.hanteo = { parsed: parsed.length, saved };
      } catch (e) {
        console.error("[DataCollector] Hanteo error:", e);
        await adminClient.from("ktrenz_collection_log").insert({
          platform: "hanteo",
          status: "error",
          error_message: e.message,
          records_collected: 0,
        });
        results.hanteo = { error: e.message };
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[DataCollector] Fatal error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
