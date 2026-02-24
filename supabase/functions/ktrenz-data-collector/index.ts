import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── 한글↔영문 아티스트명 매핑 ──
const ARTIST_NAME_MAP: Record<string, string[]> = {
  "방탄소년단": ["BTS", "방탄소년단"],
  "세븐틴": ["SEVENTEEN", "세븐틴", "SVT"],
  "스트레이 키즈": ["Stray Kids", "스트레이키즈", "SKZ"],
  "엔시티 드림": ["NCT DREAM", "NCT Dream", "엔시티드림"],
  "엔시티 127": ["NCT 127", "엔시티127"],
  "엔시티": ["NCT", "엔시티"],
  "투모로우바이투게더": ["TOMORROW X TOGETHER (TXT)", "TXT", "투바투"],
  "에스파": ["aespa", "에스파"],
  "르세라핌": ["LE SSERAFIM", "르세라핌"],
  "아이브": ["IVE", "아이브"],
  "뉴진스": ["NewJeans", "뉴진스", "NJZ"],
  "블랙핑크": ["BLACKPINK", "블랙핑크"],
  "트와이스": ["TWICE", "트와이스"],
  "에이티즈": ["ATEEZ", "에이티즈"],
  "더보이즈": ["The Boyz", "더보이즈"],
  "엔하이픈": ["ENHYPEN", "엔하이픈"],
  "정국": ["Jungkook", "정국"],
  "지민": ["Jimin", "지민"],
  "베이비몬스터": ["Babymonster", "BABYMONSTER", "베이비몬스터"],
  "보넥도": ["BOYNEXTDOOR", "보이넥스트도어"],
  "제로베이스원": ["ZEROBASEONE", "ZB1", "제로베이스원"],
  "라이즈": ["RIIZE", "라이즈"],
  "엑소": ["EXO", "엑소"],
  "레드벨벳": ["Red Velvet", "레드벨벳"],
  "샤이니": ["SHINee", "샤이니"],
  "빅뱅": ["BIGBANG", "빅뱅"],
  "몬스타엑스": ["MONSTA X", "몬스타엑스"],
  "갓세븐": ["GOT7", "갓세븐"],
  "아이들": ["(G)I-DLE", "여자아이들", "아이들"],
  "트레저": ["TREASURE", "트레저"],
  "피원하모니": ["P1Harmony", "피원하모니"],
  "사이커스": ["Xikers", "사이커스"],
  "위너": ["WINNER", "위너"],
  "아이콘": ["iKON", "아이콘"],
};

// ── Firecrawl 스크래핑 ──
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
      waitFor: 5000,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Firecrawl error ${resp.status}: ${err}`);
  }
  return resp.json();
}

// ── 한터차트 초동 데이터 파싱 ──
function parseHanteoInitial(markdown: string): Array<{
  album: string;
  artist: string;
  first_week_sales: number;
}> {
  const results: Array<any> = [];
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const salesMatch = lines[i].match(/^([\d,]+)$/);
    if (salesMatch) {
      const sales = parseInt(salesMatch[1].replace(/,/g, ""));
      if (sales > 1000) {
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

// ── 아티스트명 → wiki_entry 매칭 (한글 매핑 강화) ──
async function matchArtistToWikiEntry(
  adminClient: any,
  artistName: string
): Promise<string | null> {
  // 1) 매핑 테이블에서 영문명 후보 추출
  const candidates: string[] = [artistName];
  
  for (const [korName, aliases] of Object.entries(ARTIST_NAME_MAP)) {
    if (aliases.some(a => artistName.includes(a)) || artistName.includes(korName)) {
      candidates.push(...aliases);
    }
  }

  // 2) 괄호 안의 이름도 추출
  const bracketMatch = artistName.match(/[\(（](.+?)[\)）]/);
  if (bracketMatch) {
    candidates.push(bracketMatch[1].trim());
    candidates.push(artistName.replace(/\s*[\(（].+?[\)）]/, "").trim());
  }

  // 3) 중복 제거 후 검색
  const unique = [...new Set(candidates.filter(Boolean))];
  
  for (const name of unique) {
    const { data } = await adminClient
      .from("wiki_entries")
      .select("id, title")
      .ilike("title", `%${name}%`)
      .eq("schema_type", "artist")
      .limit(1);
    if (data?.[0]) return data[0].id;
  }
  return null;
}

// ── 판매량 → 스코어 변환 ──
function calculateAlbumSalesScore(totalFirstWeekSales: number): number {
  // sqrt 기반 스코어링: 500만장 → ~2236, 100만장 → ~1000, 10만장 → ~316
  return Math.round(Math.sqrt(totalFirstWeekSales / 10) * 10);
}

// ── v3_scores 업데이트 ──
async function updateV3ScoresWithSales(
  adminClient: any,
  wikiEntryId: string,
  salesData: { album: string; first_week_sales: number }[]
): Promise<void> {
  const totalSales = salesData.reduce((sum, d) => sum + d.first_week_sales, 0);
  const topAlbum = salesData.sort((a, b) => b.first_week_sales - a.first_week_sales)[0];
  const score = calculateAlbumSalesScore(totalSales);

  // 최신 scored_at 기준으로 1개 행만 가져옴
  const { data: existing } = await adminClient
    .from("v3_scores")
    .select("id, youtube_score, buzz_score, spotify_score, twitter_score")
    .eq("wiki_entry_id", wikiEntryId)
    .order("scored_at", { ascending: false })
    .limit(1);

  const salesPayload = {
    album_sales_score: score,
    album_sales_data: {
      total_first_week_sales: totalSales,
      top_album: topAlbum?.album,
      top_album_sales: topAlbum?.first_week_sales,
      album_count: salesData.length,
      albums: salesData.slice(0, 5),
    },
    album_sales_updated_at: new Date().toISOString(),
  };

  if (existing?.[0]) {
    const row = existing[0];
    const newTotal = (row.youtube_score || 0) + (row.buzz_score || 0) + 
                     (row.spotify_score || 0) + (row.twitter_score || 0) + score;
    
    const { error } = await adminClient.from("v3_scores")
      .update({ ...salesPayload, total_score: newTotal })
      .eq("id", row.id);
    
    if (error) console.error(`[DataCollector] v3_scores update error for ${wikiEntryId}:`, error);
    else console.log(`[DataCollector] v3_scores updated: ${wikiEntryId}, albumScore=${score}`);
  } else {
    await adminClient.from("v3_scores").insert({
      wiki_entry_id: wikiEntryId,
      ...salesPayload,
      total_score: score,
    });
  }
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
    const collectSources = source === "all" ? ["hanteo"] : [source];

    const results: Record<string, any> = {};

    // ── 한터차트 초동 수집 ──
    if (collectSources.includes("hanteo")) {
      console.log("[DataCollector] Scraping Hanteo Chart...");
      try {
        const hanteoData = await scrapeWithFirecrawl(
          "https://www.hanteochart.com/honors/initial",
          FIRECRAWL_API_KEY
        );
        const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
        const parsed = parseHanteoInitial(md);
        console.log(`[DataCollector] Hanteo parsed ${parsed.length} entries`);

        let saved = 0;
        let matched = 0;
        
        // 아티스트별로 그룹핑
        const artistAlbums: Record<string, { wikiEntryId: string | null; albums: any[] }> = {};

        for (const entry of parsed) {
          const wikiEntryId = await matchArtistToWikiEntry(adminClient, entry.artist);
          
          if (!artistAlbums[entry.artist]) {
            artistAlbums[entry.artist] = { wikiEntryId, albums: [] };
          }
          artistAlbums[entry.artist].albums.push(entry);

          // 스냅샷 저장
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
          if (wikiEntryId) matched++;
        }

        // v3_scores 업데이트 (매칭된 아티스트만)
        let scoresUpdated = 0;
        for (const [artistName, data] of Object.entries(artistAlbums)) {
          if (data.wikiEntryId) {
            await updateV3ScoresWithSales(adminClient, data.wikiEntryId, data.albums);
            scoresUpdated++;
          }
        }

        await adminClient.from("ktrenz_collection_log").insert({
          platform: "hanteo",
          status: parsed.length > 0 ? "success" : "partial",
          records_collected: saved,
        });

        console.log(`[DataCollector] Hanteo: saved=${saved}, matched=${matched}, scoresUpdated=${scoresUpdated}`);
        results.hanteo = { parsed: parsed.length, saved, matched, scoresUpdated };
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
