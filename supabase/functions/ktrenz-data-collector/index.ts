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

/** deltaScore 이상치 방지: 최소 0, 최대 baseScore * 5 (최소 보장 500) */
function clampDelta(delta: number, base: number): number {
  const cap = Math.max(base * 5, 500);
  return Math.max(0, Math.min(delta, cap));
}

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

async function fetchYouTubeData(
  artistName: string,
  apiKey: string,
  fixedChannelId?: string | null,
  allowSearch = false,
): Promise<{
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
  musicVideoViews: number;
  musicVideoCount: number;
} | null> {
  try {
    let channelId = fixedChannelId || null;

    if (!channelId) {
      if (!allowSearch) {
        console.warn(`[DataCollector] YouTube: Skip search for "${artistName}" (missing fixed channel ID)`);
        return null;
      }
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(artistName + " official")}&key=${apiKey}&maxResults=1`;
      const searchResp = await fetch(searchUrl);
      if (!searchResp.ok) {
        const errText = await searchResp.text();
        console.error(`[DataCollector] YouTube search API failed for ${artistName}: ${searchResp.status} - ${errText}`);
        return null;
      }
      const searchData = await searchResp.json();
      channelId = searchData?.items?.[0]?.id?.channelId;
    } else {
      console.log(`[DataCollector] YouTube: Using fixed channel ID ${channelId} for ${artistName}`);
    }

    if (!channelId) {
      console.warn(`[DataCollector] YouTube: No channel found for "${artistName}"`);
      return null;
    }

    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`;
    const channelResp = await fetch(channelUrl);
    if (!channelResp.ok) {
      const errText = await channelResp.text();
      console.error(`[DataCollector] YouTube channels API failed for ${artistName}: ${channelResp.status} - ${errText}`);
      return null;
    }
    const channelData = await channelResp.json();
    const channel = channelData?.items?.[0];
    if (!channel) {
      console.warn(`[DataCollector] YouTube channels API returned no items for ${artistName} (channelId: ${channelId})`);
      return null;
    }

    const stats = channel.statistics;
    const subscriberCount = parseInt(stats.subscriberCount) || 0;
    const totalViewCount = parseInt(stats.viewCount) || 0;
    const totalVideoCount = parseInt(stats.videoCount) || 0;

    const uploadsPlaylistId = "UU" + channelId.slice(2);
    const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&key=${apiKey}`;
    const playlistResp = await fetch(playlistUrl);
    if (!playlistResp.ok) {
      const errText = await playlistResp.text();
      console.error(`[DataCollector] YouTube playlistItems API failed for ${artistName}: ${playlistResp.status} - ${errText}`);
    }
    const playlistData = playlistResp.ok ? await playlistResp.json() : { items: [] };
    const videoIds = (playlistData?.items || []).map((v: any) => v.contentDetails?.videoId).filter(Boolean);

    let recentTotalViews = 0, recentTotalLikes = 0, recentTotalComments = 0;
    let musicVideoViews = 0, musicVideoCount = 0;
    const topVideos: any[] = [];

    if (videoIds.length > 0) {
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${apiKey}`;
      const statsResp = await fetch(statsUrl);
      const statsData = await statsResp.json();
      for (const v of statsData?.items || []) {
        const views = parseInt(v.statistics?.viewCount) || 0;
        const likes = parseInt(v.statistics?.likeCount) || 0;
        const comments = parseInt(v.statistics?.commentCount) || 0;
        const categoryId = v.snippet?.categoryId;
        recentTotalViews += views;
        recentTotalLikes += likes;
        recentTotalComments += comments;
        // categoryId "10" = Music
        if (categoryId === "10") {
          musicVideoViews += views;
          musicVideoCount++;
        }
        topVideos.push({
          videoId: v.id,
          title: v.snippet?.title,
          viewCount: views,
          likeCount: likes,
          categoryId,
        });
      }
      topVideos.sort((a, b) => b.viewCount - a.viewCount);
    }

    // latestVideo = 가장 최근 업로드 (playlistItems 순서 기준 첫 번째)
    const videoTitleMap = new Map(topVideos.map((v: any) => [v.videoId, v.title]));
    const latestVideoId = videoIds[0] || null;
    const latestVideo = latestVideoId ? { videoId: latestVideoId, title: videoTitleMap.get(latestVideoId) || "" } : null;

    return {
      channelId,
      channelTitle: channel.snippet?.title || artistName,
      subscriberCount, totalViewCount, totalVideoCount,
      recentVideoCount: videoIds.length,
      recentTotalViews, recentTotalLikes, recentTotalComments,
      topVideos: topVideos.slice(0, 5),
      musicVideoViews, musicVideoCount,
      latestVideo,
    };
  } catch (e) {
    console.error(`[DataCollector] YouTube error for ${artistName}:`, e);
    return null;
  }
}

// YouTube Music Topic 채널 데이터 수집
async function fetchYouTubeTopicData(
  artistName: string,
  apiKey: string,
  fixedTopicChannelId?: string | null,
  allowSearch = false,
): Promise<{
  topicChannelId: string;
  topicTotalViews: number;
  topicSubscribers: number;
  topMusicTracks: any[];
} | null> {
  try {
    let topicChannelId = fixedTopicChannelId || null;

    // Topic 채널 ID가 없으면 스킵(유닛 보호). 필요 시 allowSearch=true로만 검색 허용
    if (!topicChannelId) {
      if (!allowSearch) {
        console.log(`[DataCollector] YouTube Topic: Skip search for "${artistName}" (missing fixed topic ID)`);
        return null;
      }
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(artistName + " - Topic")}&key=${apiKey}&maxResults=3`;
      const searchResp = await fetch(searchUrl);
      if (!searchResp.ok) return null;
      const searchData = await searchResp.json();
      const topicItem = (searchData?.items || []).find((item: any) =>
        item.snippet?.title?.includes("- Topic") || item.snippet?.title?.includes("– Topic")
      );
      topicChannelId = topicItem?.id?.channelId;
      if (!topicChannelId) {
        console.log(`[DataCollector] YouTube Topic: No topic channel found for "${artistName}"`);
        return null;
      }
      console.log(`[DataCollector] YouTube Topic: Found topic channel ${topicChannelId} for ${artistName}`);
    } else {
      console.log(`[DataCollector] YouTube Topic: Using fixed topic ID ${topicChannelId} for ${artistName}`);
    }

    // 채널 통계 (1 unit)
    const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${topicChannelId}&key=${apiKey}`;
    const chResp = await fetch(chUrl);
    if (!chResp.ok) {
      const errText = await chResp.text();
      console.error(`[DataCollector] YouTube Topic channels API failed for ${artistName}: ${chResp.status} - ${errText}`);
      return null;
    }
    const chData = await chResp.json();
    const ch = chData?.items?.[0];
    if (!ch) {
      console.warn(`[DataCollector] YouTube Topic: No channel data returned for ${artistName} (topicId: ${topicChannelId}), response: ${JSON.stringify(chData)}`);
      return null;
    }

    const topicTotalViews = parseInt(ch.statistics?.viewCount) || 0;
    const topicSubscribers = parseInt(ch.statistics?.subscriberCount) || 0;

    // 최근 음원 (2 units: playlistItems + videos)
    const uploadsId = "UU" + topicChannelId.slice(2);
    const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=20&key=${apiKey}`;
    const plResp = await fetch(plUrl);
    const plData = await plResp.json();
    const vIds = (plData?.items || []).map((v: any) => v.contentDetails?.videoId).filter(Boolean);

    const topMusicTracks: any[] = [];
    if (vIds.length > 0) {
      const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${vIds.join(",")}&key=${apiKey}`;
      const vResp = await fetch(vUrl);
      const vData = await vResp.json();
      for (const v of vData?.items || []) {
        topMusicTracks.push({ title: v.snippet?.title, viewCount: parseInt(v.statistics?.viewCount) || 0 });
      }
      // 같은 제목의 중복 트랙 제거 (조회수 높은 쪽 유지)
      const deduped = new Map<string, { title: string; viewCount: number }>();
      for (const t of topMusicTracks) {
        const key = (t.title || "").toLowerCase().trim();
        const existing = deduped.get(key);
        if (!existing || t.viewCount > existing.viewCount) {
          deduped.set(key, t);
        }
      }
      topMusicTracks.length = 0;
      topMusicTracks.push(...Array.from(deduped.values()));
      topMusicTracks.sort((a, b) => b.viewCount - a.viewCount);
    }

    return { topicChannelId, topicTotalViews, topicSubscribers, topMusicTracks: topMusicTracks.slice(0, 5) };
  } catch (e) {
    console.error(`[DataCollector] YouTube Topic error for ${artistName}:`, e);
    return null;
  }
}

function calculateYouTubeScore(data: {
  subscriberCount: number;
  totalViewCount: number;
  recentTotalViews: number;
  recentTotalLikes: number;
  recentTotalComments?: number;
  videoCount?: number;
  previousRecentTotalViews?: number;
  previousRecentTotalLikes?: number;
  previousRecentTotalComments?: number;
  previousTotalViewCount?: number;
}): number {
  // ── Base Score (30%): 절대 규모 — log scale로 압축 ──
  const subBase = data.subscriberCount > 0 ? Math.log10(data.subscriberCount) * 50 : 0; // 100M → 400
  const viewBase = data.totalViewCount > 0 ? Math.log10(data.totalViewCount) * 30 : 0;  // 41B → 318
  const baseScore = subBase + viewBase; // ~718 max for top artists

  // ── Delta Score (70%): 24h 변동분 기반 ──
  let deltaScore = 0;

  // 최근 영상 조회수 변동
  if (data.previousRecentTotalViews && data.previousRecentTotalViews > 0) {
    const viewDelta = data.recentTotalViews - data.previousRecentTotalViews;
    // 양수/음수 모두 반영 — 100만 조회 증가 = 1000점
    deltaScore += Math.round((viewDelta / 100_000) * 100);
    console.log(`[DataCollector] YouTube Delta Views: ${viewDelta > 0 ? '+' : ''}${viewDelta.toLocaleString()} → ${Math.round((viewDelta / 100_000) * 100)}pts`);
  } else {
    // 이전 데이터 없으면 현재 recentViews 기반 fallback
    deltaScore += Math.round((data.recentTotalViews / 1_000_000) * 30);
  }

  // 좋아요 변동
  if (data.previousRecentTotalLikes && data.previousRecentTotalLikes > 0) {
    const likeDelta = data.recentTotalLikes - data.previousRecentTotalLikes;
    deltaScore += Math.round((likeDelta / 10_000) * 50);
  } else {
    deltaScore += Math.round((data.recentTotalLikes / 100_000) * 20);
  }

  // 총 조회수 변동 (채널 전체)
  if (data.previousTotalViewCount && data.previousTotalViewCount > 0) {
    const totalViewDelta = data.totalViewCount - data.previousTotalViewCount;
    deltaScore += Math.round((totalViewDelta / 1_000_000) * 50);
  }

  // deltaScore: 최소 0, 최대 baseScore * 5 (이상치 방지)
  deltaScore = clampDelta(deltaScore, baseScore);

  const finalScore = Math.round(baseScore * 0.3 + deltaScore * 0.7);
  console.log(`[DataCollector] YouTube Score: base=${Math.round(baseScore)} delta=${deltaScore} final=${finalScore}`);
  return finalScore;
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

async function fetchLastfmArtist(artistName: string, apiKey: string, fixedName?: string | null) {
  const searchName = fixedName || artistName;
  if (fixedName) console.log(`[DataCollector] Last.fm: Using fixed name "${fixedName}" for ${artistName}`);
  try {
    const infoResp = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(searchName)}&api_key=${apiKey}&format=json`
    );
    if (!infoResp.ok) return null;
    const infoData = await infoResp.json();
    const stats = infoData?.artist?.stats;
    if (!stats) return null;
    const tracksResp = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(searchName)}&api_key=${apiKey}&format=json&limit=10`
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

async function fetchDeezerArtist(artistName: string, fixedId?: string | null) {
  try {
    let artistId: string | number;

    if (fixedId) {
      artistId = fixedId;
      console.log(`[DataCollector] Deezer: Using fixed ID ${fixedId} for ${artistName}`);
    } else {
      const searchResp = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`);
      if (!searchResp.ok) return null;
      const searchData = await searchResp.json();
      const artist = searchData?.data?.[0];
      if (!artist) return null;
      artistId = artist.id;
    }

    const detailResp = await fetch(`https://api.deezer.com/artist/${artistId}`);
    const detail = await detailResp.json();
    if (detail.error) return null;
    const tracksResp = await fetch(`https://api.deezer.com/artist/${artistId}/top?limit=10`);
    const tracksData = await tracksResp.json();
    const topTracks = (tracksData?.data ?? []).map((t: any) => ({ title: t.title, rank: t.rank || 0 }));
    return { fans: detail?.nb_fan || 0, nbAlbum: detail?.nb_album || 0, topTracks };
  } catch (e) {
    console.error(`[DataCollector] Deezer error for ${artistName}:`, e);
    return null;
  }
}

function calculateMusicScore(
  lastfm: any, deezer: any,
  ytMusic?: { topicTotalViews?: number; topicSubscribers?: number } | null,
  ytMusicVideos?: { musicVideoViews?: number; musicVideoCount?: number } | null,
  prevMetrics?: { lastfm_playcount?: number; deezer_fans?: number; topic_views?: number; mv_views?: number } | null,
): number {
  // ── Base Score (30%): log scale 절대값 ──
  let baseScore = 0;
  if (lastfm?.playcount > 0) baseScore += Math.round(Math.log10(lastfm.playcount) * 10);
  if (lastfm?.listeners > 0) baseScore += Math.round(Math.log10(lastfm.listeners) * 8);
  if (deezer?.fans > 0) baseScore += Math.round(Math.log10(deezer.fans) * 8);
  if (ytMusic?.topicTotalViews && ytMusic.topicTotalViews > 0) baseScore += Math.round(Math.log10(ytMusic.topicTotalViews + 1) * 10);
  if (ytMusic?.topicSubscribers && ytMusic.topicSubscribers > 0) baseScore += Math.round(Math.log10(ytMusic.topicSubscribers + 1) * 8);
  if (ytMusicVideos?.musicVideoViews && ytMusicVideos.musicVideoViews > 0) baseScore += Math.round(Math.log10(ytMusicVideos.musicVideoViews + 1) * 12);

  // ── Delta Score (70%): 24h 변동분 기반 ──
  let deltaScore = 0;
  let hasPrev = false;

  if (prevMetrics) {
    // Last.fm playcount 변동
    if (prevMetrics.lastfm_playcount && prevMetrics.lastfm_playcount > 0 && lastfm?.playcount > 0) {
      const delta = lastfm.playcount - prevMetrics.lastfm_playcount;
      deltaScore += Math.round((delta / 10_000) * 30);
      hasPrev = true;
    }
    // Deezer fans 변동
    if (prevMetrics.deezer_fans && prevMetrics.deezer_fans > 0 && deezer?.fans > 0) {
      const delta = deezer.fans - prevMetrics.deezer_fans;
      deltaScore += Math.round((delta / 1_000) * 20);
      hasPrev = true;
    }
    // YT Music topic views 변동
    if (prevMetrics.topic_views && prevMetrics.topic_views > 0 && ytMusic?.topicTotalViews) {
      const delta = ytMusic.topicTotalViews - prevMetrics.topic_views;
      deltaScore += Math.round((delta / 100_000) * 40);
      hasPrev = true;
    }
    // MV views 변동
    if (prevMetrics.mv_views && prevMetrics.mv_views > 0 && ytMusicVideos?.musicVideoViews) {
      const delta = ytMusicVideos.musicVideoViews - prevMetrics.mv_views;
      deltaScore += Math.round((delta / 100_000) * 50);
      hasPrev = true;
    }
  }

  if (!hasPrev) {
    // 이전 데이터 없으면 기존 방식 fallback
    return baseScore;
  }

  // deltaScore: 최소 0, 최대 baseScore * 5 (Deezer 오매칭 등 이상치 방지)
  deltaScore = clampDelta(deltaScore, baseScore);

  const finalScore = Math.round(baseScore * 0.3 + deltaScore * 0.7);
  console.log(`[DataCollector] Music Score: base=${baseScore} delta=${deltaScore} final=${finalScore}`);
  return finalScore;
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
  
  // 1차: exact match 우선 (title이 정확히 일치하는 엔트리)
  for (const name of unique) {
    const { data } = await adminClient
      .from("wiki_entries").select("id, title")
      .eq("title", name).eq("schema_type", "artist").limit(1);
    if (data?.[0]) return data[0].id;
  }
  
  // 2차: partial match (ILIKE) — 단, 짧은 이름(3자 이하)은 exact match only
  for (const name of unique) {
    if (name.length <= 3) continue; // "BTS" 등 짧은 이름은 partial match 스킵 (오매칭 방지)
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
  // v2 테이블 사용 — 기존 k-trendz.com v3_scores 건드리지 않음
  const { data: existing } = await adminClient
    .from("v3_scores_v2")
    .select("id, youtube_score, buzz_score, music_score, album_sales_score")
    .eq("wiki_entry_id", wikiEntryId)
    .maybeSingle();

  if (existing) {
    const { error } = await adminClient
      .from("v3_scores_v2")
      .update(payload)
      .eq("id", existing.id);
    if (error) console.error(`[DataCollector] v3_scores_v2 update error for ${wikiEntryId}:`, error);
  } else {
    const { error } = await adminClient
      .from("v3_scores_v2")
      .upsert({ wiki_entry_id: wikiEntryId, ...payload }, { onConflict: "wiki_entry_id", ignoreDuplicates: false });
    if (error) console.error(`[DataCollector] v3_scores_v2 upsert error for ${wikiEntryId}:`, error);
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
  artistMeta?: any,
  source?: string, // 특정 소스만 수집 (없으면 전체)
  endpoints?: { youtube_channel_id?: string | null; youtube_topic_channel_id?: string | null; lastfm_artist_name?: string | null; deezer_artist_id?: string | null } | null,
) {
  const results: Record<string, any> = {};

  const collectAll = !source || source === "all";

  // 1) YouTube
  if ((collectAll || source === "youtube") && keys.youtube) {
    try {
      if (!endpoints?.youtube_channel_id) {
        results.youtube = { skipped: true, reason: "youtube_channel_id missing" };
        console.warn(`[DataCollector] YouTube: ${artistTitle} skipped (missing youtube_channel_id)`);
      } else {
        const ytData = await fetchYouTubeData(artistTitle, keys.youtube, endpoints.youtube_channel_id, false);
        if (ytData) {
        // 24시간 전 스냅샷에서 recentTotalViews 가져오기 (일간 모멘텀 계산용)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: prevSnapshot } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("metrics")
          .eq("wiki_entry_id", wikiEntryId)
          .eq("platform", "youtube")
          .lte("collected_at", oneDayAgo)
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const previousRecentTotalViews = prevSnapshot?.metrics?.recentTotalViews ?? 0;
        const previousRecentTotalLikes = prevSnapshot?.metrics?.recentTotalLikes ?? 0;
        const previousRecentTotalComments = prevSnapshot?.metrics?.recentTotalComments ?? 0;
        const previousTotalViewCount = prevSnapshot?.metrics?.totalViewCount ?? 0;

        const ytScore = calculateYouTubeScore({
          ...ytData,
          previousRecentTotalViews,
          previousRecentTotalLikes,
          previousRecentTotalComments,
          previousTotalViewCount,
        });
        await upsertV3Score(adminClient, wikiEntryId, {
          youtube_score: ytScore,
        });
        await adminClient.from("ktrenz_data_snapshots").insert({
          wiki_entry_id: wikiEntryId, platform: "youtube",
          metrics: {
            subscriberCount: ytData.subscriberCount, totalViewCount: ytData.totalViewCount,
            recentTotalViews: ytData.recentTotalViews, recentTotalComments: ytData.recentTotalComments,
            recentTotalLikes: ytData.recentTotalLikes,
            musicVideoViews: ytData.musicVideoViews, musicVideoCount: ytData.musicVideoCount,
          },
        });
        results.youtube = { score: ytScore, usedFixedId: !!endpoints?.youtube_channel_id, musicVideoViews: ytData.musicVideoViews, musicVideoCount: ytData.musicVideoCount };
        console.log(`[DataCollector] YouTube: ${artistTitle} → ${ytScore} (MV: ${ytData.musicVideoCount}개, ${ytData.musicVideoViews.toLocaleString()} views)${endpoints?.youtube_channel_id ? ' (fixed ID)' : ''}`);

        // 최신 영상 ID 저장
        if (ytData.latestVideo?.videoId) {
          await adminClient.from("v3_artist_tiers")
            .update({
              latest_youtube_video_id: ytData.latestVideo.videoId,
              latest_youtube_video_title: ytData.latestVideo.title,
              latest_youtube_updated_at: new Date().toISOString(),
            } as any)
            .eq("wiki_entry_id", wikiEntryId);
        }

        // YouTube Music Topic 채널 데이터 수집 (고정 ID가 있을 때만)
        if (endpoints?.youtube_topic_channel_id) {
          const topicData = await fetchYouTubeTopicData(artistTitle, keys.youtube, endpoints.youtube_topic_channel_id, false);
          if (topicData) {
            await adminClient.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: wikiEntryId, platform: "youtube_music",
              metrics: {
                topicTotalViews: topicData.topicTotalViews,
                topicSubscribers: topicData.topicSubscribers,
                topTracks: topicData.topMusicTracks,
              },
            });
            results.youtube_music = {
              topicTotalViews: topicData.topicTotalViews,
              topicSubscribers: topicData.topicSubscribers,
              tracksCount: topicData.topMusicTracks.length,
              usedFixedTopicId: true,
            };
            console.log(`[DataCollector] YouTube Music: ${artistTitle} → ${topicData.topicTotalViews.toLocaleString()} total views, ${topicData.topicSubscribers.toLocaleString()} subs`);
          }
        } else {
          results.youtube_music = { skipped: true, reason: "youtube_topic_channel_id missing" };
        }
        } else {
          results.youtube = { error: "YouTube API returned no data (check API key quota or channel search)" };
          console.warn(`[DataCollector] YouTube: ${artistTitle} → no data returned`);
        }
      }
    } catch (e) {
      results.youtube = { error: e.message };
      console.error(`[DataCollector] YouTube catch error for ${artistTitle}:`, e.message);
    }
  }

  // 2) Music (Last.fm + Deezer + YouTube Music data)
  if (collectAll || source === "music") {
    try {
      const lastfm = keys.lastfm ? await fetchLastfmArtist(artistTitle, keys.lastfm, endpoints?.lastfm_artist_name) : null;
      const deezer = await fetchDeezerArtist(artistTitle, endpoints?.deezer_artist_id);

      // Music 수집 시에도 YouTube Music Topic 채널 데이터를 직접 수집
      if (endpoints?.youtube_topic_channel_id && keys.youtube && !results.youtube_music) {
        try {
          const topicData = await fetchYouTubeTopicData(artistTitle, keys.youtube, endpoints.youtube_topic_channel_id, false);
          if (topicData) {
            await adminClient.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: wikiEntryId, platform: "youtube_music",
              metrics: {
                topicTotalViews: topicData.topicTotalViews,
                topicSubscribers: topicData.topicSubscribers,
                topTracks: topicData.topMusicTracks,
              },
            });
            results.youtube_music = {
              topicTotalViews: topicData.topicTotalViews,
              topicSubscribers: topicData.topicSubscribers,
              tracksCount: topicData.topMusicTracks.length,
              usedFixedTopicId: true,
            };
            console.log(`[DataCollector] Music→YT Music Topic: ${artistTitle} → ${topicData.topicTotalViews.toLocaleString()} views, ${topicData.topicSubscribers.toLocaleString()} subs`);
          }
        } catch (topicErr) {
          console.warn(`[DataCollector] Music→YT Music Topic error for ${artistTitle}:`, (topicErr as any).message);
        }
      }

      // YouTube Music 데이터: 같은 세션의 results에서 가져오거나, 없으면 DB 최신 스냅샷에서 조회
      let ytMusicData = results.youtube_music ? {
        topicTotalViews: results.youtube_music.topicTotalViews,
        topicSubscribers: results.youtube_music.topicSubscribers,
      } : null;
      let ytMvData = results.youtube ? {
        musicVideoViews: results.youtube.musicVideoViews || 0,
        musicVideoCount: results.youtube.musicVideoCount || 0,
      } : null;
      // 개별 music 수집 시 DB에서 기존 스냅샷 읽기
      if (!ytMusicData) {
        const { data: ytmSnap } = await adminClient.from("ktrenz_data_snapshots")
          .select("metrics").eq("wiki_entry_id", wikiEntryId).eq("platform", "youtube_music")
          .order("collected_at", { ascending: false }).limit(1).maybeSingle();
        if (ytmSnap?.metrics) {
          ytMusicData = { topicTotalViews: ytmSnap.metrics.topicTotalViews || 0, topicSubscribers: ytmSnap.metrics.topicSubscribers || 0 };
        }
      }
      if (!ytMvData) {
        const { data: ytSnap } = await adminClient.from("ktrenz_data_snapshots")
          .select("metrics").eq("wiki_entry_id", wikiEntryId).eq("platform", "youtube")
          .order("collected_at", { ascending: false }).limit(1).maybeSingle();
        if (ytSnap?.metrics) {
          ytMvData = { musicVideoViews: ytSnap.metrics.musicVideoViews || 0, musicVideoCount: ytSnap.metrics.musicVideoCount || 0 };
        }
      }
      if (lastfm || deezer || ytMusicData || ytMvData) {
        // 24h 전 스냅샷에서 이전 메트릭 가져오기
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        let prevMusicMetrics: any = null;

        const [prevLastfmSnap, prevDeezerSnap, prevYtmSnap, prevYtSnap] = await Promise.all([
          adminClient.from("ktrenz_data_snapshots").select("metrics")
            .eq("wiki_entry_id", wikiEntryId).eq("platform", "lastfm")
            .lte("collected_at", oneDayAgo).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
          adminClient.from("ktrenz_data_snapshots").select("metrics")
            .eq("wiki_entry_id", wikiEntryId).eq("platform", "deezer")
            .lte("collected_at", oneDayAgo).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
          adminClient.from("ktrenz_data_snapshots").select("metrics")
            .eq("wiki_entry_id", wikiEntryId).eq("platform", "youtube_music")
            .lte("collected_at", oneDayAgo).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
          adminClient.from("ktrenz_data_snapshots").select("metrics")
            .eq("wiki_entry_id", wikiEntryId).eq("platform", "youtube")
            .lte("collected_at", oneDayAgo).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
        ]);

        prevMusicMetrics = {
          lastfm_playcount: prevLastfmSnap?.data?.metrics?.playcount ?? 0,
          deezer_fans: prevDeezerSnap?.data?.metrics?.fans ?? 0,
          topic_views: prevYtmSnap?.data?.metrics?.topicTotalViews ?? 0,
          mv_views: prevYtSnap?.data?.metrics?.musicVideoViews ?? 0,
        };

        const musicScore = calculateMusicScore(lastfm, deezer, ytMusicData, ytMvData, prevMusicMetrics);
        await upsertV3Score(adminClient, wikiEntryId, {
          music_score: musicScore,
        });
        if (lastfm) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: wikiEntryId, platform: "lastfm", metrics: { playcount: lastfm.playcount, listeners: lastfm.listeners } });
        if (deezer) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: wikiEntryId, platform: "deezer", metrics: { fans: deezer.fans, nb_album: deezer.nbAlbum } });
        results.music = { score: musicScore, includesYtMusic: !!ytMusicData, includesYtMv: !!ytMvData };
        console.log(`[DataCollector] Music: ${artistTitle} → ${musicScore}${ytMusicData ? ' (+YT Music)' : ''}${ytMvData ? ' (+MV)' : ''}`);
      }
    } catch (e) { results.music = { error: (e as any).message }; }
  }

  // 3) Buzz — Naver API 선수집 후 crawl-x-mentions 호출
  if (collectAll || source === "buzz") {
    if (keys.firecrawl) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // (1) Naver News를 먼저 수집해서 최신 snapshot을 만든 뒤
        // (2) crawl-x-mentions가 해당 snapshot을 읽어 buzz source_breakdown에 반영
        console.log(`[DataCollector] Buzz: Calling crawl-naver-news for ${artistTitle}...`);
        const naverResp = await fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ wikiEntryId, artistName: artistTitle }),
        });

        if (!naverResp.ok) {
          const naverErr = await naverResp.text();
          console.warn(`[DataCollector] Naver pre-collect failed for ${artistTitle}: ${naverErr}`);
        } else {
          const naverResult = await naverResp.json();
          console.log(`[DataCollector] Naver pre-collect: ${artistTitle} → mentions=${naverResult?.mentionCount ?? 0}`);
        }

        console.log(`[DataCollector] Buzz: Calling crawl-x-mentions for ${artistTitle}...`);
        const buzzResp = await fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ wikiEntryId, artistName: artistTitle }),
        });
        const buzzResult = await buzzResp.json();
        if (buzzResp.ok && buzzResult?.buzzScore !== undefined) {
          await upsertV3Score(adminClient, wikiEntryId, { buzz_score: buzzResult.buzzScore });
          results.buzz = { score: buzzResult.buzzScore, totalMentions: buzzResult.totalMentions, sentiment: buzzResult.sentiment };
          console.log(`[DataCollector] Buzz: ${artistTitle} → score=${buzzResult.buzzScore}, mentions=${buzzResult.totalMentions}`);
        } else {
          results.buzz = { error: buzzResult?.error || "Unknown error from crawl-x-mentions" };
          console.error(`[DataCollector] Buzz error for ${artistTitle}:`, buzzResult);
        }
      } catch (e) {
        results.buzz = { error: (e as any).message };
        console.error(`[DataCollector] Buzz catch error for ${artistTitle}:`, e);
      }
    } else {
      results.buzz = { skipped: true, reason: "FIRECRAWL_API_KEY missing" };
    }
  }

  // 4) Hanteo Album Sales (한터차트 초동)
  if ((collectAll || source === "hanteo") && keys.firecrawl) {
    try {
      console.log(`[DataCollector] Scraping Hanteo for ${artistTitle}...`);
      // DB에서 설정된 한터 차트 URL 가져오기
      const { data: cfgRow } = await adminClient
        .from("ktrenz_collection_config")
        .select("hanteo_chart_url")
        .eq("id", "default")
        .maybeSingle();
      const hanteoUrlSingle = cfgRow?.hanteo_chart_url || "https://www.hanteochart.com/honors/initial";
      const hanteoData = await scrapeWithFirecrawl(hanteoUrlSingle, keys.firecrawl);
      const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
      const parsed = parseHanteoInitial(md);

      const matchedAlbums: any[] = [];
      for (const entry of parsed) {
        const entryWikiId = await matchArtistToWikiEntry(adminClient, entry.artist);
        if (entryWikiId === wikiEntryId) {
          matchedAlbums.push(entry);
        }
      }

      if (matchedAlbums.length > 0) {
        const totalSales = matchedAlbums.reduce((sum, d) => sum + d.first_week_sales, 0);
        const score = Math.round(Math.sqrt(totalSales / 10) * 10);
        await upsertV3Score(adminClient, wikiEntryId, { album_sales_score: score });
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
      }
    } catch (e) {
      results.hanteo = { error: e.message };
      console.error(`[DataCollector] Hanteo error for ${artistTitle}:`, e);
    }
  }

  // 에너지 재계산: 특정 소스만 수집한 경우(hanteo, music 등)에는 스킵
  const shouldRecalcEnergy = collectAll || source === "youtube";
  const hasYouTubeError = results.youtube?.error;
  if (!shouldRecalcEnergy) {
    results.energy = { skipped: true, reason: `Energy recalc skipped for source=${source}` };
  } else if (hasYouTubeError) {
    results.energy = { skipped: true, reason: "Data collection failed, skipping energy recalculation" };
    console.warn(`[DataCollector] Energy SKIPPED for ${artistTitle} — data collection had errors`);
  } else {
    try {
      console.log(`[DataCollector] Calculating energy score for ${artistTitle}...`);
      const energyResp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/calculate-energy-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({}),
      });
      const energyResult = await energyResp.json();
      results.energy = energyResult?.results?.find((r: any) => r.wikiEntryId === wikiEntryId) || { success: energyResp.ok, processed: energyResult?.processed };
      console.log(`[DataCollector] Energy: ${artistTitle} → ${results.energy.energyScore || "N/A"}`);
    } catch (e) {
      results.energy = { error: e.message };
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
    const { source = "all", wikiEntryId, batchSize: rawBatchSize, batchOffset: rawBatchOffset, batchIndex: rawBatchIndex } = body;
    const batchSize = Math.min(200, Math.max(1, Number(rawBatchSize) || 100));
    // batchIndex(페이지 기반) → batchOffset(절대 오프셋) 자동 변환
    const batchOffset = rawBatchOffset != null
      ? Math.max(0, Number(rawBatchOffset))
      : rawBatchIndex != null
        ? Math.max(0, Number(rawBatchIndex)) * batchSize
        : 0;

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

      // 고정 엔드포인트 가져오기
      const { data: tierData } = await adminClient
        .from("v3_artist_tiers")
        .select("youtube_channel_id, youtube_topic_channel_id, lastfm_artist_name, deezer_artist_id")
        .eq("wiki_entry_id", wikiEntryId)
        .maybeSingle();

      console.log(`[DataCollector] Single artist mode: ${artist.title}, source: ${source}`);
      const results = await collectForSingleArtist(adminClient, artist.id, artist.title, keys, artist.metadata, source, tierData);

      return new Response(JSON.stringify({ success: true, artist: artist.title, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 배치 모드 ──
    const collectSources = source === "all" ? ["youtube", "hanteo", "music", "buzz"] : [source];

    // 1군(tier=1) 아티스트만 수집 대상
    const { data: tier1Entries } = await adminClient
      .from("v3_artist_tiers")
      .select("wiki_entry_id, youtube_channel_id, youtube_topic_channel_id, lastfm_artist_name, deezer_artist_id")
      .eq("tier", 1);
    const tier1Map = new Map<string, { youtube_channel_id?: string | null; youtube_topic_channel_id?: string | null; lastfm_artist_name?: string | null; deezer_artist_id?: string | null }>();
    for (const t of (tier1Entries || [])) {
      if (t.wiki_entry_id) tier1Map.set(t.wiki_entry_id, { youtube_channel_id: t.youtube_channel_id, youtube_topic_channel_id: t.youtube_topic_channel_id, lastfm_artist_name: t.lastfm_artist_name, deezer_artist_id: t.deezer_artist_id });
    }
    const tier1Ids = new Set(tier1Map.keys());

    if (tier1Ids.size === 0) {
      console.log("[DataCollector] No tier 1 artists found, skipping batch.");
      await adminClient.from("system_jobs").upsert({
        id: "daily-data-crawl", status: "completed", completed_at: new Date().toISOString(),
        metadata: { message: "No tier 1 artists" },
      }, { onConflict: "id" });
      return new Response(JSON.stringify({ success: true, message: "No tier 1 artists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allArtists } = await adminClient
      .from("wiki_entries").select("id, title, metadata")
      .eq("schema_type", "artist")
      .in("id", [...tier1Ids]);

    const artists = (allArtists || []).slice(batchOffset, batchOffset + batchSize);

    const actualTotal = artists.length;

    await adminClient.from("system_jobs").upsert({
      id: "daily-data-crawl", status: "running", started_at: new Date().toISOString(),
      metadata: { processed: 0, total: actualTotal, sources: collectSources, batchSize, batchOffset },
    }, { onConflict: "id" });

    const results: Record<string, any> = {};
    let totalProcessed = 0;


    // ── YouTube 배치 ──
    if (collectSources.includes("youtube") && YOUTUBE_API_KEY) {
      console.log("[DataCollector] Collecting YouTube data...");
      let ytUpdated = 0, ytErrors = 0, ytSkippedMissingChannel = 0;
      for (const artist of artists) {
        try {
          const endpoints = tier1Map.get(artist.id);
          if (!endpoints?.youtube_channel_id) {
            ytSkippedMissingChannel++;
            continue;
          }
          const ytData = await fetchYouTubeData(artist.title, YOUTUBE_API_KEY, endpoints.youtube_channel_id, false);
          if (ytData) {
            // 24h 전 스냅샷 조회
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: prevSnap } = await adminClient.from("ktrenz_data_snapshots")
              .select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "youtube")
              .lte("collected_at", oneDayAgo).order("collected_at", { ascending: false }).limit(1).maybeSingle();

            const ytScore = calculateYouTubeScore({
              ...ytData,
              previousRecentTotalViews: prevSnap?.metrics?.recentTotalViews ?? 0,
              previousRecentTotalLikes: prevSnap?.metrics?.recentTotalLikes ?? 0,
              previousTotalViewCount: prevSnap?.metrics?.totalViewCount ?? 0,
            });
            await upsertV3Score(adminClient, artist.id, { youtube_score: ytScore });
            await adminClient.from("ktrenz_data_snapshots").insert({
              wiki_entry_id: artist.id, platform: "youtube",
              metrics: {
                subscriberCount: ytData.subscriberCount, totalViewCount: ytData.totalViewCount,
                recentTotalViews: ytData.recentTotalViews, recentTotalComments: ytData.recentTotalComments || 0,
                recentTotalLikes: ytData.recentTotalLikes || 0,
                musicVideoViews: ytData.musicVideoViews || 0, musicVideoCount: ytData.musicVideoCount || 0,
              },
            });
            // 최신 영상 ID 저장
            if (ytData.latestVideo?.videoId) {
              await adminClient.from("v3_artist_tiers")
                .update({
                  latest_youtube_video_id: ytData.latestVideo.videoId,
                  latest_youtube_video_title: ytData.latestVideo.title,
                  latest_youtube_updated_at: new Date().toISOString(),
                } as any)
                .eq("wiki_entry_id", artist.id);
            }
            ytUpdated++;
          }

          // YouTube Music Topic 채널 데이터 수집 (배치)
          if (endpoints?.youtube_topic_channel_id && YOUTUBE_API_KEY) {
            try {
              const topicData = await fetchYouTubeTopicData(artist.title, YOUTUBE_API_KEY, endpoints.youtube_topic_channel_id, false);
              if (topicData) {
                await adminClient.from("ktrenz_data_snapshots").insert({
                  wiki_entry_id: artist.id, platform: "youtube_music",
                  metrics: {
                    topicTotalViews: topicData.topicTotalViews,
                    topicSubscribers: topicData.topicSubscribers,
                    topTracks: topicData.topMusicTracks || [],
                  },
                });
                console.log(`[DataCollector] YT Music batch: ${artist.title} → subs=${topicData.topicSubscribers}, views=${topicData.topicTotalViews}`);
              }
            } catch (topicErr) {
              console.warn(`[DataCollector] YT Music batch error for ${artist.title}:`, (topicErr as any).message);
            }
          }

          // YouTube API quota 보호 (고정 ID 기준 약 3-6 calls/artist)
          await new Promise(r => setTimeout(r, 500));
        } catch (e) { ytErrors++; }
      }
      results.youtube = { updated: ytUpdated, errors: ytErrors, skippedMissingChannel: ytSkippedMissingChannel };
      console.log(`[DataCollector] YouTube: updated=${ytUpdated}, errors=${ytErrors}, skippedMissingChannel=${ytSkippedMissingChannel}`);
    } else if (collectSources.includes("youtube")) {
      results.youtube = { error: "YOUTUBE_API_KEY not configured" };
    }

   // ── 한터차트 ──
    if (collectSources.includes("hanteo")) {
      if (!FIRECRAWL_API_KEY) {
        results.hanteo = { error: "FIRECRAWL_API_KEY not configured" };
      } else {
        console.log("[DataCollector] Scraping Hanteo Chart...");
        try {
          // DB에서 설정된 한터 차트 URL 가져오기
          const { data: configRow } = await adminClient
            .from("ktrenz_collection_config")
            .select("hanteo_chart_url")
            .eq("id", "default")
            .maybeSingle();
          const hanteoUrl = configRow?.hanteo_chart_url || "https://www.hanteochart.com/honors/initial";
          console.log(`[DataCollector] Hanteo URL: ${hanteoUrl}`);
          const hanteoData = await scrapeWithFirecrawl(hanteoUrl, FIRECRAWL_API_KEY);
          const md = hanteoData?.data?.markdown || hanteoData?.markdown || "";
          if (!md || md.length < 50) {
            throw new Error(`Hanteo 스크랩 실패: 마크다운 비어있음 (URL: ${hanteoUrl}, 응답 길이: ${md.length}). SPA 렌더링이 필요한 페이지일 수 있습니다.`);
          }
          const parsed = parseHanteoInitial(md);
          if (parsed.length === 0) {
            console.warn(`[DataCollector] Hanteo: 파싱된 앨범 0건 (마크다운 길이: ${md.length})`);
            await adminClient.from("ktrenz_collection_log").insert({
              platform: "hanteo", status: "failed",
              error_message: `파싱 결과 0건. URL: ${hanteoUrl}. 페이지 구조가 변경되었거나 SPA 렌더링 실패`,
              records_collected: 0,
            });
            results.hanteo = { error: "파싱 결과 0건", url: hanteoUrl, markdownLength: md.length, parsed: 0 };
          } else {
          let saved = 0, matched = 0;
          const artistAlbums: Record<string, { wikiEntryId: string | null; albums: any[] }> = {};
          const artistWikiCache = new Map<string, string | null>();

          for (const entry of parsed) {
            let entryWikiId: string | null;
            if (artistWikiCache.has(entry.artist)) {
              entryWikiId = artistWikiCache.get(entry.artist) ?? null;
            } else {
              entryWikiId = await matchArtistToWikiEntry(adminClient, entry.artist);
              artistWikiCache.set(entry.artist, entryWikiId);
            }
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
              });
              scoresUpdated++;
            }
          }

          await adminClient.from("ktrenz_collection_log").insert({
            platform: "hanteo", status: parsed.length > 0 ? "success" : "partial", records_collected: saved,
          });
          results.hanteo = { parsed: parsed.length, saved, matched, scoresUpdated, url: hanteoUrl };
          } // end else (parsed.length > 0)
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
          const endpoints = tier1Map.get(artist.id);
          const lastfm = LASTFM_API_KEY ? await fetchLastfmArtist(artist.title, LASTFM_API_KEY, endpoints?.lastfm_artist_name) : null;
          const deezer = await fetchDeezerArtist(artist.title, endpoints?.deezer_artist_id);

          // DB에서 최근 YouTube Music Topic 스냅샷 조회 (1시간 이내)
          let ytMusicData: { topicTotalViews?: number; topicSubscribers?: number } | null = null;
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: ytmSnap } = await adminClient.from("ktrenz_data_snapshots")
            .select("metrics, collected_at").eq("wiki_entry_id", artist.id).eq("platform", "youtube_music")
            .order("collected_at", { ascending: false }).limit(1).maybeSingle();
          if (ytmSnap?.metrics && ytmSnap.collected_at >= oneHourAgo) {
            ytMusicData = { topicTotalViews: (ytmSnap.metrics as any).topicTotalViews || 0, topicSubscribers: (ytmSnap.metrics as any).topicSubscribers || 0 };
          } else if (endpoints?.youtube_topic_channel_id && YOUTUBE_API_KEY) {
            // 최근 스냅샷이 없으면 직접 수집 (YouTube 단계에서 실패했을 수 있음)
            try {
              const topicData = await fetchYouTubeTopicData(artist.title, YOUTUBE_API_KEY, endpoints.youtube_topic_channel_id, false);
              if (topicData) {
                await adminClient.from("ktrenz_data_snapshots").insert({
                  wiki_entry_id: artist.id, platform: "youtube_music",
                  metrics: {
                    topicTotalViews: topicData.topicTotalViews,
                    topicSubscribers: topicData.topicSubscribers,
                    topTracks: topicData.topMusicTracks || [],
                  },
                });
                ytMusicData = { topicTotalViews: topicData.topicTotalViews, topicSubscribers: topicData.topicSubscribers };
                console.log(`[DataCollector] Music batch→YT Music fallback: ${artist.title} → views=${topicData.topicTotalViews}, subs=${topicData.topicSubscribers}`);
              }
            } catch (topicErr) {
              console.warn(`[DataCollector] Music batch→YT Music fallback error for ${artist.title}:`, (topicErr as any).message);
              // Fallback: 오래된 스냅샷이라도 사용
              if (ytmSnap?.metrics) {
                ytMusicData = { topicTotalViews: (ytmSnap.metrics as any).topicTotalViews || 0, topicSubscribers: (ytmSnap.metrics as any).topicSubscribers || 0 };
              }
            }
          } else if (ytmSnap?.metrics) {
            // topic_channel_id 없으면 오래된 스냅샷이라도 사용
            ytMusicData = { topicTotalViews: (ytmSnap.metrics as any).topicTotalViews || 0, topicSubscribers: (ytmSnap.metrics as any).topicSubscribers || 0 };
          }

          // DB에서 YouTube MV 스냅샷 조회
          let ytMvData: { musicVideoViews?: number; musicVideoCount?: number } | null = null;
          const { data: ytSnap } = await adminClient.from("ktrenz_data_snapshots")
            .select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "youtube")
            .order("collected_at", { ascending: false }).limit(1).maybeSingle();
          if (ytSnap?.metrics) {
            ytMvData = { musicVideoViews: (ytSnap.metrics as any).musicVideoViews || 0, musicVideoCount: (ytSnap.metrics as any).musicVideoCount || 0 };
          }

          if (!lastfm && !deezer && !ytMusicData && !ytMvData) continue;

          // 24h 전 이전 메트릭 조회
          const oneDayAgoBatch = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const [prevLfS, prevDzS, prevYtmS2, prevYtS2] = await Promise.all([
            adminClient.from("ktrenz_data_snapshots").select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "lastfm").lte("collected_at", oneDayAgoBatch).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
            adminClient.from("ktrenz_data_snapshots").select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "deezer").lte("collected_at", oneDayAgoBatch).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
            adminClient.from("ktrenz_data_snapshots").select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "youtube_music").lte("collected_at", oneDayAgoBatch).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
            adminClient.from("ktrenz_data_snapshots").select("metrics").eq("wiki_entry_id", artist.id).eq("platform", "youtube").lte("collected_at", oneDayAgoBatch).order("collected_at", { ascending: false }).limit(1).maybeSingle(),
          ]);
          const prevMM = {
            lastfm_playcount: prevLfS?.data?.metrics?.playcount ?? 0,
            deezer_fans: prevDzS?.data?.metrics?.fans ?? 0,
            topic_views: prevYtmS2?.data?.metrics?.topicTotalViews ?? 0,
            mv_views: prevYtS2?.data?.metrics?.musicVideoViews ?? 0,
          };
          const musicScore = calculateMusicScore(lastfm, deezer, ytMusicData, ytMvData, prevMM);
          await upsertV3Score(adminClient, artist.id, {
            music_score: musicScore,
          });
          if (lastfm) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: artist.id, platform: "lastfm", metrics: { playcount: lastfm.playcount, listeners: lastfm.listeners } });
          if (deezer) await adminClient.from("ktrenz_data_snapshots").insert({ wiki_entry_id: artist.id, platform: "deezer", metrics: { fans: deezer.fans, nb_album: deezer.nbAlbum } });
          musicUpdated++;
          console.log(`[DataCollector] Music batch: ${artist.title} → ${musicScore}${ytMusicData ? ' (+YT Music)' : ''}${ytMvData ? ' (+MV)' : ''}`);
        } catch (e) { musicErrors++; }
      }
      await adminClient.from("ktrenz_collection_log").insert({ platform: "music", status: musicUpdated > 0 ? "success" : "partial", records_collected: musicUpdated });
      results.music = { total: artists.length, updated: musicUpdated, errors: musicErrors };
    }

    // ── Buzz 배치 (buzz-cron 호출) ──
    if (collectSources.includes("buzz")) {
      console.log("[DataCollector] Triggering buzz collection...");
      try {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 10000);

        try {
          const buzzResp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/buzz-cron`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
            body: JSON.stringify({ time: new Date().toISOString() }),
            signal: abortController.signal,
          });
          const text = await buzzResp.text();
          results.buzz = text ? JSON.parse(text) : { success: buzzResp.ok };
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (e) {
        results.buzz = { error: e.message };
      }
    }

    // 완료 기록
    await adminClient.from("system_jobs").update({
      status: "completed", completed_at: new Date().toISOString(),
      metadata: { ...results, processed: actualTotal, total: actualTotal },
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
