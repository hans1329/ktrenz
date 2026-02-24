// ktrenz-data-collector: 통합 데이터 수집기
// - YouTube, 한터차트 초동, Last.fm/Deezer 음악, Buzz(X+TikTok+뉴스 등)
// - source: "all" | "youtube" | "hanteo" | "music" | "buzz"
// - wikiEntryId: 특정 아티스트만 수집 (선택)
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

// ══════════════════════════════════════
// YouTube Data API v3
// ══════════════════════════════════════

async function fetchYouTubeData(artistName: string, apiKey: string): Promise<{
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  totalViewCount: number;
  totalVideoCount: number;
  recentVideoCount: number;
  recentTotalViews: number;
  recentTotalLikes: number;
  recentTotalComments: number;
  topVideos: any[];
} | null> {
  try {
    // 1) 채널 검색
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(artistName + " official")}&key=${apiKey}&maxResults=1`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();
    const channelId = searchData?.items?.[0]?.id?.channelId;
    if (!channelId) return null;

    // 2) 채널 통계
    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`;
    const channelResp = await fetch(channelUrl);
    const channelData = await channelResp.json();
    const channel = channelData?.items?.[0];
    if (!channel) return null;

    const stats = channel.statistics;
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViewCount = parseInt(stats.viewCount) || 0;
    const totalVideoCount = parseInt(stats.videoCount) || 0;

    // 3) 최근 영상 10개
    const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=10&key=${apiKey}`;
    const videosResp = await fetch(videosUrl);
    const videosData = await videosResp.json();
    const videoIds = (videosData?.items || []).map((v: any) => v.id?.videoId).filter(Boolean);

    let recentTotalViews = 0, recentTotalLikes = 0, recentTotalComments = 0;
    const topVideos: any[] = [];

    if (videoIds.length > 0) {
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
      const statsResp = await fetch(statsUrl);
      const statsData = await statsResp.json();
      for (const v of statsData?.items || []) {
        const views = parseInt(v.statistics?.viewCount) || 0;
        const likes = parseInt(v.statistics?.likeCount) || 0;
        const comments = parseInt(v.statistics?.commentCount) || 0;
        recentTotalViews += views;
        recentTotalLikes += likes;
        recentTotalComments += comments;
        topVideos.push({
          videoId: v.id,
          title: v.snippet?.title,
          viewCount: views,
          likeCount: likes,
        });
      }
      topVideos.sort((a, b) => b.viewCount - a.viewCount);
    }

    return {
      channelId,
      channelTitle: channel.snippet?.title || artistName,
      subscriberCount,
      totalViewCount,
      totalVideoCount,
      recentVideoCount: videoIds.length,
      recentTotalViews,
      recentTotalLikes,
      recentTotalComments,
      topVideos: topVideos.slice(0, 5),
    };
  } catch (e) {
    console.error(`[DataCollector] YouTube error for ${artistName}:`, e);
    return null;
  }
}

function calculateYouTubeScore(data: {
  subscriberCount: number;
  totalViewCount: number;
  recentTotalViews: number;
  recentTotalLikes: number;
  recentTotalComments: number;
}): number {
  // 구독자: log10 스케일 (1억 → 80)
  const subScore = data.subscriberCount > 0 ? Math.log10(data.subscriberCount) * 10 : 0;
  // 총조회수: log10 (100억 → 100)
  const viewScore = data.totalViewCount > 0 ? Math.log10(data.totalViewCount) * 10 : 0;
  // 최근 활동: sqrt 스케일
  const recentScore = Math.sqrt(data.recentTotalViews / 1000) * 5 +
    Math.sqrt(data.recentTotalLikes / 100) * 3 +
    Math.sqrt(data.recentTotalComments / 100) * 2;

  return Math.round(subScore + viewScore + recentScore);
}

// ══════════════════════════════════════
// Hanteo Chart (Firecrawl scraping)
// ══════════════════════════════════════

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<any> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 5000 }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Firecrawl error ${resp.status}: ${err}`);
  }
  return resp.json();
}

function parseHanteoInitial(markdown: string): Array<{ album: string; artist: string; first_week_sales: number }> {
  const results: Array<any> = [];
  const lines = markdown.split("\n").map(l => l.trim()).filter(Boolean);
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

// ══════════════════════════════════════
// Last.fm + Deezer (Music)
// ══════════════════════════════════════

async function fetchLastfmArtist(artistName: string, apiKey: string) {
  try {
    const infoResp = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`
    );
    if (!infoResp.ok) return null;
    const infoData = await infoResp.json();
    const stats = infoData?.artist?.stats;
    if (!stats) return null;
    const tracksResp = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json&limit=10`
    );
    const tracksData = await tracksResp.json();
    const topTracks = (tracksData?.toptracks?.track ?? []).map((t: any) => ({
      name: t.name, playcount: parseInt(t.playcount) || 0,
    }));
    return {
      playcount: parseInt(stats.playcount) || 0,
      listeners: parseInt(stats.listeners) || 0,
      topTracks,
    };
  } catch (e) {
    console.error(`[DataCollector] Last.fm error for ${artistName}:`, e);
    return null;
  }
}

async function fetchDeezerArtist(artistName: string) {
  try {
    const searchResp = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`);
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();
    const artist = searchData?.data?.[0];
    if (!artist) return null;
    const detailResp = await fetch(`https://api.deezer.com/artist/${artist.id}`);
    const detail = await detailResp.json();
    const tracksResp = await fetch(`https://api.deezer.com/artist/${artist.id}/top?limit=10`);
    const tracksData = await tracksResp.json();
    const topTracks = (tracksData?.data ?? []).map((t: any) => ({ title: t.title, rank: t.rank || 0 }));
    return { fans: detail?.nb_fan || 0, nbAlbum: detail?.nb_album || 0, topTracks };
  } catch (e) {
    console.error(`[DataCollector] Deezer error for ${artistName}:`, e);
    return null;
  }
}

function calculateMusicScore(lastfm: any, deezer: any): number {
  let score = 0;
  if (lastfm) {
    if (lastfm.playcount > 0) score += Math.round(Math.log10(lastfm.playcount) * 10);
    if (lastfm.listeners > 0) score += Math.round(Math.log10(lastfm.listeners) * 8);
  }
  if (deezer?.fans > 0) score += Math.round(Math.log10(deezer.fans) * 8);
  return score;
}

// ══════════════════════════════════════
// Artist ↔ wiki_entry 매칭
// ══════════════════════════════════════

async function matchArtistToWikiEntry(adminClient: any, artistName: string): Promise<string | null> {
  const candidates: string[] = [artistName];
  for (const [korName, aliases] of Object.entries(ARTIST_NAME_MAP)) {
    if (aliases.some(a => artistName.includes(a)) || artistName.includes(korName)) {
      candidates.push(...aliases);
    }
  }
  const bracketMatch = artistName.match(/[\(（](.+?)[\)）]/);
  if (bracketMatch) {
    candidates.push(bracketMatch[1].trim());
    candidates.push(artistName.replace(/\s*[\(（].+?[\)）]/, "").trim());
  }
  const unique = [...new Set(candidates.filter(Boolean))];
  for (const name of unique) {
    const { data } = await adminClient
      .from("wiki_entries").select("id, title")
      .ilike("title", `%${name}%`).eq("schema_type", "artist").limit(1);
    if (data?.[0]) return data[0].id;
  }
  return null;
}

// ══════════════════════════════════════
// v3_scores 업데이트 헬퍼
// ══════════════════════════════════════

async function upsertV3Score(adminClient: any, wikiEntryId: string, payload: Record<string, any>) {
  // wiki_entry_id UNIQUE constraint로 ON CONFLICT UPSERT 사용
  // 기존 값은 COALESCE로 보존 — payload에 있는 필드만 업데이트
  const { data: existing } = await adminClient
    .from("v3_scores")
    .select("id, youtube_score, buzz_score, music_score, album_sales_score")
    .eq("wiki_entry_id", wikiEntryId)
    .maybeSingle();

  if (existing) {
    // UPDATE: payload 필드만 변경
    const { error } = await adminClient
      .from("v3_scores")
      .update(payload)
      .eq("id", existing.id);
    if (error) console.error(`[DataCollector] v3_scores update error for ${wikiEntryId}:`, error);
  } else {
    // INSERT: 새 아티스트
    const { error } = await adminClient
      .from("v3_scores")
      .insert({ wiki_entry_id: wikiEntryId, ...payload });
    if (error) console.error(`[DataCollector] v3_scores insert error for ${wikiEntryId}:`, error);
  }
}

// ══════════════════════════════════════
// 개별 아티스트 전체 소스 수집
// ══════════════════════════════════════

async function collectForSingleArtist(
  adminClient: any,
  wikiEntryId: string,
  artistTitle: string,
  keys: { youtube?: string; firecrawl?: string; lastfm?: string },
  artistMeta?: any
) {
  const results: Record<string, any> = {};

  // 1) YouTube
  if (keys.youtube) {
    try {
      const ytData = await fetchYouTubeData(artistTitle, keys.youtube);
      if (ytData) {
        const ytScore = calculateYouTubeScore(ytData);
        await upsertV3Score(adminClient, wikiEntryId, {
          youtube_score: ytScore,
          raw_data: ytData,
        });
        await adminClient.from("ktrenz_data_snapshots").insert({
          wiki_entry_id: wikiEntryId, platform: "youtube",
          metrics: { subscriberCount: ytData.subscriberCount, totalViewCount: ytData.totalViewCount, recentTotalViews: ytData.recentTotalViews },
        });
        results.youtube = { score: ytScore };
        console.log(`[DataCollector] YouTube: ${artistTitle} → ${ytScore}`);
      }
    } catch (e) { results.youtube = { error: e.message }; }
  }

  // 2) Music (Last.fm + Deezer)
  try {
    const lastfm = keys.lastfm ? await fetchLastfmArtist(artistTitle, keys.lastfm) : null;
    const deezer = await fetchDeezerArtist(artistTitle);
    if (lastfm || deezer) {
      const musicScore = calculateMusicScore(lastfm, deezer);
      await upsertV3Score(adminClient, wikiEntryId, {
        music_score: musicScore,
        music_data: {
          lastfm: lastfm ? { playcount: lastfm.playcount, listeners: lastfm.listeners, top_tracks: lastfm.topTracks?.slice(0, 5) } : null,
          deezer: deezer ? { fans: deezer.fans, nb_album: deezer.nbAlbum, top_tracks: deezer.topTracks?.slice(0, 5) } : null,
        },
        music_updated_at: new Date().toISOString(),
      });
      if (lastfm) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: wikiEntryId, platform: "lastfm", metrics: { playcount: lastfm.playcount, listeners: lastfm.listeners } });
      if (deezer) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: wikiEntryId, platform: "deezer", metrics: { fans: deezer.fans, nb_album: deezer.nbAlbum } });
      results.music = { score: musicScore };
      console.log(`[DataCollector] Music: ${artistTitle} → ${musicScore}`);
    }
  } catch (e) { results.music = { error: e.message }; }

  // 3) Buzz (crawl-x-mentions 호출)
  if (keys.firecrawl) {
    try {
      const hashtags = artistMeta?.hashtags || [];
      const buzzResp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/crawl-x-mentions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({ artistName: artistTitle, wikiEntryId, hashtags }),
      });
      const buzzResult = await buzzResp.json();
      results.buzz = { score: buzzResult.buzzScore, mentions: buzzResult.mentionCount };
      console.log(`[DataCollector] Buzz: ${artistTitle} → ${buzzResult.buzzScore}`);
    } catch (e) { results.buzz = { error: e.message }; }
  }

  // 4) Hanteo Album Sales (한터차트 초동)
  if (keys.firecrawl) {
    try {
      console.log(`[DataCollector] Scraping Hanteo for ${artistTitle}...`);
      const hanteoData = await scrapeWithFirecrawl("https://www.hanteochart.com/honors/initial", keys.firecrawl);
      const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
      const parsed = parseHanteoInitial(md);

      // 이 아티스트와 매칭되는 앨범만 필터
      const matchedAlbums: any[] = [];
      for (const entry of parsed) {
        const entryWikiId = await matchArtistToWikiEntry(adminClient, entry.artist);
        if (entryWikiId === wikiEntryId) {
          matchedAlbums.push(entry);
        }
      }

      if (matchedAlbums.length > 0) {
        const totalSales = matchedAlbums.reduce((sum, d) => sum + d.first_week_sales, 0);
        const topAlbum = matchedAlbums.sort((a, b) => b.first_week_sales - a.first_week_sales)[0];
        const score = Math.round(Math.sqrt(totalSales / 10) * 10);
        await upsertV3Score(adminClient, wikiEntryId, {
          album_sales_score: score,
          album_sales_data: {
            total_first_week_sales: totalSales, top_album: topAlbum?.album,
            top_album_sales: topAlbum?.first_week_sales, album_count: matchedAlbums.length,
            albums: matchedAlbums.slice(0, 5),
          },
          album_sales_updated_at: new Date().toISOString(),
        });
        for (const entry of matchedAlbums) {
          await adminClient.from("ktrenz_data_snapshots").insert({
            wiki_entry_id: wikiEntryId, platform: "hanteo",
            metrics: { album: entry.album, artist: entry.artist, first_week_sales: entry.first_week_sales, chart_type: "initial_sales" },
          });
        }
        results.hanteo = { albums: matchedAlbums.length, score, totalSales };
        console.log(`[DataCollector] Hanteo: ${artistTitle} → score=${score}, albums=${matchedAlbums.length}`);
      } else {
        results.hanteo = { albums: 0, message: "No matching albums found on chart" };
        console.log(`[DataCollector] Hanteo: ${artistTitle} → no matching albums`);
      }
    } catch (e) {
      results.hanteo = { error: e.message };
      console.error(`[DataCollector] Hanteo error for ${artistTitle}:`, e);
    }
  }

  return results;
}

// ══════════════════════════════════════
// 메인 핸들러
// ══════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const LASTFM_API_KEY = Deno.env.get("LASTFM_API_KEY");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { source = "all", wikiEntryId } = body;

    const keys = { youtube: YOUTUBE_API_KEY, firecrawl: FIRECRAWL_API_KEY, lastfm: LASTFM_API_KEY };

    // ── 개별 아티스트 모드 ──
    if (wikiEntryId) {
      const { data: artist } = await adminClient
        .from("wiki_entries").select("id, title, metadata")
        .eq("id", wikiEntryId).single();

      if (!artist) {
        return new Response(JSON.stringify({ error: "Artist not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[DataCollector] Single artist mode: ${artist.title}`);
      const results = await collectForSingleArtist(adminClient, artist.id, artist.title, keys, artist.metadata);

      return new Response(JSON.stringify({ success: true, artist: artist.title, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 배치 모드 ──
    const collectSources = source === "all" ? ["youtube", "hanteo", "music", "buzz"] : [source];

    // 상위 아티스트 목록 (v3_scores total_score 기준)
    const { data: topScored } = await adminClient
      .from("v3_scores").select("wiki_entry_id")
      .order("total_score", { ascending: false }).limit(100);
    const topIds = new Set((topScored || []).map((s: any) => s.wiki_entry_id).filter(Boolean));

    const { data: allArtists } = await adminClient
      .from("wiki_entries").select("id, title, metadata")
      .eq("schema_type", "artist");

    const artists = topIds.size > 0
      ? (allArtists || []).filter((a: any) => topIds.has(a.id))
      : (allArtists || []).slice(0, 100);

    const actualTotal = artists.length;

    await adminClient.from("system_jobs").upsert({
      id: "daily-data-crawl", status: "running", started_at: new Date().toISOString(),
      metadata: { processed: 0, total: actualTotal, sources: collectSources },
    }, { onConflict: "id" });

    const results: Record<string, any> = {};
    let totalProcessed = 0;


    // ── YouTube 배치 ──
    if (collectSources.includes("youtube") && YOUTUBE_API_KEY) {
      console.log("[DataCollector] Collecting YouTube data...");
      let ytUpdated = 0, ytErrors = 0;
      for (const artist of artists) {
        try {
          const ytData = await fetchYouTubeData(artist.title, YOUTUBE_API_KEY);
          if (ytData) {
            const ytScore = calculateYouTubeScore(ytData);
            await upsertV3Score(adminClient, artist.id, { youtube_score: ytScore, raw_data: ytData });
            await adminClient.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: artist.id, platform: "youtube",
              metrics: { subscriberCount: ytData.subscriberCount, totalViewCount: ytData.totalViewCount, recentTotalViews: ytData.recentTotalViews },
            });
            ytUpdated++;
          }
          // YouTube API quota 보호 (4 calls/artist)
          await new Promise(r => setTimeout(r, 500));
        } catch (e) { ytErrors++; }
      }
      results.youtube = { updated: ytUpdated, errors: ytErrors };
      console.log(`[DataCollector] YouTube: updated=${ytUpdated}, errors=${ytErrors}`);
    } else if (collectSources.includes("youtube")) {
      results.youtube = { error: "YOUTUBE_API_KEY not configured" };
    }

    // ── 한터차트 초동 ──
    if (collectSources.includes("hanteo")) {
      if (!FIRECRAWL_API_KEY) {
        results.hanteo = { error: "FIRECRAWL_API_KEY not configured" };
      } else {
        console.log("[DataCollector] Scraping Hanteo Chart...");
        try {
          const hanteoData = await scrapeWithFirecrawl("https://www.hanteochart.com/honors/initial", FIRECRAWL_API_KEY);
          const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
          const parsed = parseHanteoInitial(md);

          let saved = 0, matched = 0;
          const artistAlbums: Record<string, { wikiEntryId: string | null; albums: any[] }> = {};

          for (const entry of parsed) {
            const entryWikiId = await matchArtistToWikiEntry(adminClient, entry.artist);
            if (!artistAlbums[entry.artist]) artistAlbums[entry.artist] = { wikiEntryId: entryWikiId, albums: [] };
            artistAlbums[entry.artist].albums.push(entry);
            await adminClient.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: entryWikiId, platform: "hanteo",
              metrics: { album: entry.album, artist: entry.artist, first_week_sales: entry.first_week_sales, chart_type: "initial_sales" },
              raw_response: entryWikiId ? undefined : { unmatched_artist: entry.artist },
            });
            saved++;
            if (entryWikiId) matched++;
          }

          let scoresUpdated = 0;
          for (const [, data] of Object.entries(artistAlbums)) {
            if (data.wikiEntryId) {
              const totalSales = data.albums.reduce((sum: number, d: any) => sum + d.first_week_sales, 0);
              const topAlbum = data.albums.sort((a: any, b: any) => b.first_week_sales - a.first_week_sales)[0];
              const score = Math.round(Math.sqrt(totalSales / 10) * 10);
              await upsertV3Score(adminClient, data.wikiEntryId, {
                album_sales_score: score,
                album_sales_data: {
                  total_first_week_sales: totalSales, top_album: topAlbum?.album,
                  top_album_sales: topAlbum?.first_week_sales, album_count: data.albums.length,
                  albums: data.albums.slice(0, 5),
                },
                album_sales_updated_at: new Date().toISOString(),
              });
              scoresUpdated++;
            }
          }

          await adminClient.from("ktrenz_collection_log").insert({
            platform: "hanteo", status: parsed.length > 0 ? "success" : "partial", records_collected: saved,
          });
          results.hanteo = { parsed: parsed.length, saved, matched, scoresUpdated };
        } catch (e) {
          console.error("[DataCollector] Hanteo error:", e);
          await adminClient.from("ktrenz_collection_log").insert({ platform: "hanteo", status: "error", error_message: e.message, records_collected: 0 });
          results.hanteo = { error: e.message };
        }
      }
    }

    // ── Music (Last.fm + Deezer) 배치 ──
    if (collectSources.includes("music")) {
      console.log("[DataCollector] Collecting music data...");
      let musicUpdated = 0, musicErrors = 0;
      for (const artist of artists) {
        try {
          const lastfm = LASTFM_API_KEY ? await fetchLastfmArtist(artist.title, LASTFM_API_KEY) : null;
          const deezer = await fetchDeezerArtist(artist.title);
          if (!lastfm && !deezer) continue;

          const musicScore = calculateMusicScore(lastfm, deezer);
          await upsertV3Score(adminClient, artist.id, {
            music_score: musicScore,
            music_data: {
              lastfm: lastfm ? { playcount: lastfm.playcount, listeners: lastfm.listeners, top_tracks: lastfm.topTracks?.slice(0, 5) } : null,
              deezer: deezer ? { fans: deezer.fans, nb_album: deezer.nbAlbum, top_tracks: deezer.topTracks?.slice(0, 5) } : null,
            },
            music_updated_at: new Date().toISOString(),
          });
          if (lastfm) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: artist.id, platform: "lastfm", metrics: { playcount: lastfm.playcount, listeners: lastfm.listeners } });
          if (deezer) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: artist.id, platform: "deezer", metrics: { fans: deezer.fans, nb_album: deezer.nbAlbum } });
          musicUpdated++;
        } catch (e) { musicErrors++; }
      }
      await adminClient.from("ktrenz_collection_log").insert({ platform: "music", status: musicUpdated > 0 ? "success" : "partial", records_collected: musicUpdated });
      results.music = { total: artists.length, updated: musicUpdated, errors: musicErrors };
    }

    // ── Buzz 배치 (buzz-cron 호출) ──
    if (collectSources.includes("buzz")) {
      console.log("[DataCollector] Triggering buzz collection...");
      try {
        const buzzResp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/buzz-cron`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
          body: JSON.stringify({ time: new Date().toISOString() }),
        });
        results.buzz = await buzzResp.json();
      } catch (e) {
        results.buzz = { error: e.message };
      }
    }

    // 완료 기록
    await adminClient.from("system_jobs").update({
      status: "completed", completed_at: new Date().toISOString(),
      metadata: { ...results, processed: totalProcessed, total: actualTotal },
    }).eq("id", "daily-data-crawl");

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[DataCollector] Fatal error:", e);
    try {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await adminClient.from("system_jobs").update({ status: "error", completed_at: new Date().toISOString(), metadata: { error: e.message } }).eq("id", "daily-data-crawl");
    } catch (_) {}
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
