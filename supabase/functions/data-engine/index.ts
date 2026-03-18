// data-engine: 데이터 수집 오케스트레이터
// 모듈: youtube, music, hanteo, buzz, energy + buzz 개별 소스(buzz_x, buzz_reddit, buzz_naver, buzz_tiktok) + naver_news
// 모드: 개별 모듈 또는 "all" (체이닝 + 타임시프트)
// 수집 대상: ktrenz_stars 테이블 (wiki_entry_id가 연결된 active 스타만)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPELINE = ["youtube", "yt_sentiment", "external_videos", "korean_charts", "spotify_listeners", "music", "hanteo", "apple_music_charts", "billboard_charts", "social", "buzz", "buzz_enhancer", "energy", "detect_geo_changes", "fes_analyst", "fes_predictor"] as const;
type PipelineModule = typeof PIPELINE[number];

// buzz 개별 소스 모듈
const BUZZ_SOURCES = ["buzz_x", "buzz_reddit", "buzz_naver", "buzz_tiktok"] as const;
type BuzzSourceModule = typeof BUZZ_SOURCES[number];

type Module = PipelineModule | BuzzSourceModule;

// 모듈 완료 후 다음 모듈 시작까지 대기 시간 (초)
const DELAY_AFTER: Partial<Record<Module, number>> = {
  youtube: 10,
  yt_sentiment: 10,
  external_videos: 10,
  korean_charts: 5,
  spotify_listeners: 5,
  music: 45,
  hanteo: 30,
  apple_music_charts: 5,
  billboard_charts: 5,
  social: 30,
  buzz: 120,
  buzz_enhancer: 60,
  energy: 5,
  detect_geo_changes: 5,
  fes_analyst: 5,
  fes_predictor: 0,
};

// ── 유틸: fire-and-forget ──

function fireAndForget(promise: Promise<any>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
}

function launchCollector(supabaseUrl: string, serviceKey: string, source: string) {
  const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ source }),
  }).catch((e) => console.warn(`[data-engine] ${source} fire error:`, e.message));
  fireAndForget(p);
}

// ── 유틸: ktrenz_stars에서 wiki_entry_id가 연결된 active 스타 목록 ──
interface StarInfo {
  wiki_entry_id: string;
  display_name: string;
  name_ko: string | null;
}

async function getActiveStarWikiIds(sb: any): Promise<string[]> {
  const { data: starRows } = await sb
    .from("ktrenz_stars")
    .select("wiki_entry_id")
    .eq("is_active", true)
    .not("wiki_entry_id", "is", null);
  const ids = [...new Set((starRows || []).map((r: any) => r.wiki_entry_id).filter(Boolean))];
  console.log(`[data-engine] ktrenz_stars active wiki_entry_ids: ${ids.length}`);
  return ids;
}

async function getActiveStars(sb: any): Promise<StarInfo[]> {
  const { data: starRows } = await sb
    .from("ktrenz_stars")
    .select("wiki_entry_id, display_name, name_ko")
    .eq("is_active", true)
    .not("wiki_entry_id", "is", null)
    .order("wiki_entry_id", { ascending: true });
  return (starRows || []).filter((r: any) => r.wiki_entry_id) as StarInfo[];
}

// ── 모듈 실행기: 기본 파이프라인 ──

async function runCollectorModule(
  supabaseUrl: string,
  serviceKey: string,
  source: "youtube" | "music" | "hanteo",
  waitForCompletion: boolean = false,
): Promise<any> {
  if (!waitForCompletion) {
    console.log(`[data-engine] Launching ${source} (fire-and-forget)...`);
    launchCollector(supabaseUrl, serviceKey, source);
    return { status: "launched", module: source };
  }

  console.log(`[data-engine] Running ${source} and waiting for completion...`);
  const resp = await fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ source }),
  });

  const text = await resp.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 300) }; }
  if (!resp.ok) throw new Error(`[${source}] ${text.slice(0, 500)}`);

  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : { raw: text.slice(0, 300) };

  return { status: "completed", module: source, ...payload };
}

async function runYouTube(supabaseUrl: string, serviceKey: string, _waitForCompletion: boolean = false): Promise<any> {
  console.log(`[data-engine] Running YouTube module (ktrenz_stars based)...`);

  const sb = createClient(supabaseUrl, serviceKey);
  const wikiIds = await getActiveStarWikiIds(sb);
  if (wikiIds.length === 0) {
    console.warn(`[data-engine] YouTube: No active stars found`);
    return { status: "no_artists", launched: 0 };
  }

  // wiki_entries에서 youtube_channel_id가 있는 아티스트만 필터 (v3_artist_tiers 대체)
  // youtube_channel_id는 wiki_entries.metadata 또는 v3_artist_tiers에서 가져올 수 있음
  // ktrenz_data_collector가 내부적으로 wiki_entry_id 기반으로 채널 ID를 조회하므로 여기서는 ID 목록만 전달
  const tierSnapshotAt = new Date().toISOString();

  // 여전히 v3_artist_tiers에서 youtube_channel_id를 참조해야 함 (채널 ID 저장소)
  const { data: tier1Entries } = await sb
    .from("v3_artist_tiers")
    .select("wiki_entry_id, youtube_channel_id")
    .in("wiki_entry_id", wikiIds)
    .order("wiki_entry_id", { ascending: true });

  const validIds = [...new Set((tier1Entries || [])
    .filter((t: any) => t.youtube_channel_id)
    .map((t: any) => t.wiki_entry_id)
    .filter(Boolean))];
  const tier1Count = validIds.length;

  if (tier1Count === 0) {
    console.warn(`[data-engine] YouTube: No stars with youtube_channel_id found`);
    return { status: "no_artists", launched: 0, tierSnapshotAt };
  }

  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(tier1Count / BATCH_SIZE);
  const MAX_LAUNCH_TIME_MS = 25_000;
  const delayMs = totalBatches > 1 ? Math.min(3000, Math.floor(MAX_LAUNCH_TIME_MS / (totalBatches - 1))) : 0;

  console.log(`[data-engine] YouTube: ${tier1Count} artists → ${totalBatches} batches of ~${BATCH_SIZE}, delay=${delayMs}ms`);

  let launched = 0;
  for (let i = 0; i < totalBatches; i++) {
    const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ source: "youtube", batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE, tierSnapshotAt }),
    }).catch((e) => console.warn(`[data-engine] YouTube batch ${i} fire error:`, e.message));
    fireAndForget(p);
    launched++;
    if (i < totalBatches - 1) await new Promise(r => setTimeout(r, delayMs));
  }

  console.log(`[data-engine] YouTube: launched ${launched} batches for ${tier1Count} artists`);
  return { status: "launched", launched, batchSize: BATCH_SIZE, totalBatches, tier1Count, tierSnapshotAt };
}

async function runMusic(supabaseUrl: string, serviceKey: string, _waitForCompletion: boolean = false): Promise<any> {
  console.log(`[data-engine] Running Music module (ktrenz_stars based)...`);

  const sb = createClient(supabaseUrl, serviceKey);
  const wikiIds = await getActiveStarWikiIds(sb);
  if (wikiIds.length === 0) return { status: "no_artists", launched: 0 };

  const tierSnapshotAt = new Date().toISOString();
  const tier1Count = wikiIds.length;

  const BATCH_SIZE = 15;
  const totalBatches = Math.ceil(tier1Count / BATCH_SIZE);
  const MAX_LAUNCH_TIME_MS = 25_000;
  const delayMs = totalBatches > 1 ? Math.min(3000, Math.floor(MAX_LAUNCH_TIME_MS / (totalBatches - 1))) : 0;

  console.log(`[data-engine] Music: ${tier1Count} artists → ${totalBatches} batches of ~${BATCH_SIZE}, delay=${delayMs}ms`);

  let launched = 0;
  for (let i = 0; i < totalBatches; i++) {
    const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ source: "music", batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE, tierSnapshotAt }),
    }).catch((e) => console.warn(`[data-engine] Music batch ${i} fire error:`, e.message));
    fireAndForget(p);
    launched++;
    if (i < totalBatches - 1) await new Promise(r => setTimeout(r, delayMs));
  }

  console.log(`[data-engine] Music: launched ${launched} batches for ${tier1Count} artists`);
  return { status: "launched", launched, batchSize: BATCH_SIZE, totalBatches, tier1Count, tierSnapshotAt };
}

async function runHanteo(supabaseUrl: string, serviceKey: string, waitForCompletion: boolean = false): Promise<any> {
  return runCollectorModule(supabaseUrl, serviceKey, "hanteo", waitForCompletion);
}

async function runBuzz(supabaseUrl: string, serviceKey: string, _waitForCompletion: boolean = false): Promise<any> {
  console.log(`[data-engine] Running Buzz module (ktrenz_stars based)...`);

  const sb = createClient(supabaseUrl, serviceKey);
  const wikiIds = await getActiveStarWikiIds(sb);
  if (wikiIds.length === 0) return { status: "no_artists", launched: 0 };

  const tierSnapshotAt = new Date().toISOString();
  const tier1Count = wikiIds.length;

  const BATCH_SIZE = 5;
  const totalBatches = Math.ceil(tier1Count / BATCH_SIZE);
  const MAX_LAUNCH_TIME_MS = 25_000;
  const delayMs = totalBatches > 1 ? Math.min(2000, Math.floor(MAX_LAUNCH_TIME_MS / (totalBatches - 1))) : 0;

  console.log(`[data-engine] Buzz: ${totalBatches} batches, delay=${delayMs}ms`);

  let launched = 0;
  for (let i = 0; i < totalBatches; i++) {
    const p = fetch(`${supabaseUrl}/functions/v1/buzz-cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE, tierSnapshotAt }),
    }).catch((e) => console.warn(`[data-engine] Buzz batch ${i} fire error:`, e.message));
    fireAndForget(p);
    launched++;
    if (i < totalBatches - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  console.log(`[data-engine] Buzz: launched ${launched} batches for ${tier1Count} artists (snapshotAt=${tierSnapshotAt})`);
  return { status: "launched", launched, batchSize: BATCH_SIZE, totalBatches, tier1Count, tierSnapshotAt };
}

async function runExternalVideos(supabaseUrl: string, serviceKey: string, waitForCompletion: boolean = false): Promise<any> {
  if (!waitForCompletion) {
    console.log(`[data-engine] Launching external_videos (fire-and-forget)...`);
    const p = fetch(`${supabaseUrl}/functions/v1/scan-external-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({}),
    }).catch((e) => console.warn(`[data-engine] external_videos fire error:`, e.message));
    fireAndForget(p);
    return { status: "launched", module: "external_videos" };
  }

  console.log(`[data-engine] Running external_videos and waiting for completion...`);
  const resp = await fetch(`${supabaseUrl}/functions/v1/scan-external-videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({}),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text.slice(0, 300) }; }
  if (!resp.ok) throw new Error(`[external_videos] ${text.slice(0, 500)}`);
  return { status: "completed", module: "external_videos", ...parsed };
}

async function runEnergy(supabaseUrl: string, serviceKey: string, isBaseline: boolean = false): Promise<any> {
  console.log(`[data-engine] Running Energy module... (isBaseline=${isBaseline})`);
  const resp = await fetch(`${supabaseUrl}/functions/v1/calculate-energy-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ isBaseline }),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

// ── 모듈 실행기: Buzz 개별 소스 ──
const BUZZ_SOURCE_MAP: Record<BuzzSourceModule, string> = {
  buzz_x: "x_twitter",
  buzz_reddit: "reddit",
  buzz_naver: "naver",
  buzz_tiktok: "tiktok",
};

async function runBuzzSource(supabaseUrl: string, serviceKey: string, buzzModule: BuzzSourceModule): Promise<any> {
  const sourceName = BUZZ_SOURCE_MAP[buzzModule];
  console.log(`[data-engine] Launching Buzz source: ${sourceName} (ktrenz_stars based)...`);

  const sb = createClient(supabaseUrl, serviceKey);
  const wikiIds = await getActiveStarWikiIds(sb);
  if (wikiIds.length === 0) return { status: "no_artists" };

  const { data: artists } = await sb.from("wiki_entries").select("id, title, metadata").in("schema_type", ["artist", "member"]).in("id", wikiIds);
  if (!artists?.length) return { status: "no_artists" };

  let launched = 0;
  for (const artist of artists) {
    const meta = artist.metadata as any;
    const hashtags = meta?.hashtags || [];

    const p = sourceName === "naver"
      ? fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ artistName: artist.title, wikiEntryId: artist.id }),
        }).catch((e) => console.warn(`[data-engine] Naver News for ${artist.title} error:`, e.message))
      : fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            artistName: artist.title,
            wikiEntryId: artist.id,
            hashtags,
            sources: [sourceName],
          }),
        }).catch((e) => console.warn(`[data-engine] Buzz ${sourceName} for ${artist.title} error:`, e.message));

    fireAndForget(p);
    launched++;
    if (launched % 3 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[data-engine] Buzz ${sourceName}: launched ${launched} artists`);
  return { status: "launched", source: sourceName, artists: launched };
}

// ── 네이버 뉴스 전용 모듈 ──
async function runNaverNews(supabaseUrl: string, serviceKey: string): Promise<any> {
  console.log("[data-engine] Launching Naver News (ktrenz_stars based)...");
  const sb = createClient(supabaseUrl, serviceKey);
  const stars = await getActiveStars(sb);
  if (stars.length === 0) return { status: "no_artists" };

  // name_ko 매핑 (ktrenz_stars에서 직접)
  const koNameMap = new Map<string, string>();
  for (const s of stars) {
    if (s.name_ko) koNameMap.set(s.wiki_entry_id, s.name_ko);
  }

  const wikiIds = stars.map(s => s.wiki_entry_id);
  const { data: artists } = await sb.from("wiki_entries").select("id, title").in("schema_type", ["artist", "member"]).in("id", wikiIds);
  if (!artists?.length) return { status: "no_artists" };

  const totalCount = artists.length;
  const groupSize = Math.max(5, Math.ceil(totalCount / 10));
  const totalGroups = Math.ceil(totalCount / groupSize);
  const delayMs = totalGroups > 1 ? Math.min(500, Math.floor(15_000 / (totalGroups - 1))) : 0;

  let launched = 0;
  for (const artist of artists) {
    const p = fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ artistName: artist.title, koreanName: koNameMap.get(artist.id) || null, wikiEntryId: artist.id }),
    }).catch((e) => console.warn(`[data-engine] Naver News for ${artist.title} error:`, e.message));
    fireAndForget(p);
    launched++;
    if (launched % groupSize === 0 && launched < totalCount) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.log(`[data-engine] Naver News: launched ${launched} artists`);
  return { status: "launched", artists: launched };
}

// ── 통합 모듈 러너 맵 ──
const MODULE_RUNNERS: Record<string, (url: string, key: string) => Promise<any>> = {
  youtube: runYouTube,
  yt_sentiment: async (url, key) => {
    console.log("[data-engine] Running yt_sentiment batch (ktrenz_stars based)...");
    const sb = createClient(url, key);
    const wikiIds = await getActiveStarWikiIds(sb);
    if (wikiIds.length === 0) return { status: "no_artists" };

    // youtube_channel_id가 필요하므로 v3_artist_tiers에서 조회 (데이터 저장소 역할)
    const { data: tiers } = await sb.from("v3_artist_tiers").select("wiki_entry_id, youtube_channel_id").in("wiki_entry_id", wikiIds);
    const targets = (tiers || []).filter((t: any) => t.youtube_channel_id);
    const totalCount = targets.length;

    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < totalCount; i += BATCH_SIZE) {
      batches.push(targets.slice(i, i + BATCH_SIZE).map((t: any) => t.wiki_entry_id));
    }

    console.log(`[data-engine] yt_sentiment: ${totalCount} artists → ${batches.length} batches of ~${BATCH_SIZE}`);

    let launched = 0;
    for (let i = 0; i < batches.length; i++) {
      const p = fetch(`${url}/functions/v1/ktrenz-yt-sentiment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ wikiEntryIds: batches[i] }),
      }).catch((e) => console.warn(`[data-engine] yt_sentiment batch ${i} fire error:`, e.message));
      fireAndForget(p);
      launched += batches[i].length;
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    console.log(`[data-engine] yt_sentiment: launched ${launched}/${totalCount} artists in ${batches.length} batches`);
    return { status: "launched", launched, total: totalCount, batches: batches.length };
  },
  external_videos: (url, key) => runExternalVideos(url, key, false),
  music: runMusic,
  hanteo: runHanteo,
  social: (url, key) => {
    console.log("[data-engine] Launching social followers (fire-and-forget)...");
    const p = fetch(`${url}/functions/v1/collect-social-followers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    }).catch((e) => console.warn("[data-engine] social fire error:", e.message));
    fireAndForget(p);
    return Promise.resolve({ status: "launched", module: "social" });
  },
  buzz: runBuzz,
  energy: (url, key) => runEnergy(url, key, false),
  detect_geo_changes: async (url, key) => {
    console.log("[data-engine] Running detect-geo-changes (post-pipeline)...");
    const resp = await fetch(`${url}/functions/v1/detect-geo-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] detect-geo-changes: ${parsed?.total_spikes ?? 0} spikes detected`);
    return { status: resp.ok ? "completed" : "error", module: "detect_geo_changes", ...parsed };
  },
  naver_news: runNaverNews,
  apple_music_charts: async (url, key) => {
    console.log("[data-engine] Running Apple Music Charts...");
    const resp = await fetch(`${url}/functions/v1/collect-apple-music-charts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] Apple Music Charts: matched=${parsed?.matched ?? 0}, artists=${parsed?.uniqueArtists ?? 0}`);
    return { status: resp.ok ? "completed" : "error", module: "apple_music_charts", ...parsed };
  },
  korean_charts: async (url, key) => {
    console.log("[data-engine] Running Korean Charts (Melon/Genie)...");
    const resp = await fetch(`${url}/functions/v1/collect-korean-charts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] Korean Charts: matched=${parsed?.matched ?? 0}, melon=${parsed?.melonParsed ?? 0}, genie=${parsed?.genieParsed ?? 0}`);
    return { status: resp.ok ? "completed" : "error", module: "korean_charts", ...parsed };
  },
  spotify_listeners: async (url, key) => {
    console.log("[data-engine] Running Spotify Listeners (kworb.net)...");
    const resp = await fetch(`${url}/functions/v1/collect-spotify-listeners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] Spotify Listeners: matched=${parsed?.matched ?? 0}, totalParsed=${parsed?.totalParsed ?? 0}`);
    return { status: resp.ok ? "completed" : "error", module: "spotify_listeners", ...parsed };
  },
  billboard_charts: async (url, key) => {
    console.log("[data-engine] Running Billboard Charts...");
    const resp = await fetch(`${url}/functions/v1/collect-billboard-charts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] Billboard Charts: matched=${parsed?.matched ?? 0}, artists=${parsed?.uniqueArtists ?? 0}`);
    return { status: resp.ok ? "completed" : "error", module: "billboard_charts", ...parsed };
  },
  fes_analyst: async (url, key) => {
    console.log("[data-engine] Running FES Analyst...");
    const resp = await fetch(`${url}/functions/v1/ktrenz-fes-analyst`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] FES Analyst: ${parsed?.contributions_saved ?? 0} contributions, ${parsed?.trends_saved ?? 0} trends`);
    return { status: resp.ok ? "completed" : "error", module: "fes_analyst", ...parsed };
  },
  fes_predictor: async (url, key) => {
    console.log("[data-engine] Running FES Predictor...");
    const resp = await fetch(`${url}/functions/v1/ktrenz-fes-predictor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    const text = await resp.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    console.log(`[data-engine] FES Predictor: ${parsed?.predictions?.length ?? 0} predictions`);
    return { status: resp.ok ? "completed" : "error", module: "fes_predictor", ...parsed };
  },
  buzz_enhancer: async (url, key) => {
    console.log("[data-engine] Running Buzz Enhancer (ktrenz_stars based)...");
    const sb = createClient(url, key);
    const wikiIds = await getActiveStarWikiIds(sb);
    if (wikiIds.length === 0) return { status: "no_artists" };

    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(wikiIds.length / BATCH_SIZE);

    let launched = 0;
    for (let i = 0; i < totalBatches; i++) {
      const p = fetch(`${url}/functions/v1/ktrenz-buzz-enhancer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ mode: "batch", batchSize: BATCH_SIZE, batchOffset: i * BATCH_SIZE }),
      }).catch((e) => console.warn(`[data-engine] buzz_enhancer batch ${i} error:`, e.message));
      fireAndForget(p);
      launched++;
      if (i < totalBatches - 1) await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`[data-engine] Buzz Enhancer: launched ${launched} batches for ${wikiIds.length} artists`);
    return { status: "launched", launched, totalBatches, totalArtists: wikiIds.length };
  },
  // buzz 개별 소스
  ...Object.fromEntries(
    BUZZ_SOURCES.map(mod => [mod, (url: string, key: string) => runBuzzSource(url, key, mod)])
  ),
};

// ── 메인 핸들러 ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { module = "all", runId, chain, wikiEntryId, isBaseline, waitBeforeMs } = body as {
      module?: string;
      runId?: string;
      chain?: string[];
      wikiEntryId?: string;
      isBaseline?: boolean;
      waitBeforeMs?: number;
    };

    const currentRunId = runId || crypto.randomUUID();

    // ── 개별 아티스트 + 개별 소스 모드 ──
    if (wikiEntryId && module !== "all") {
      console.log(`[data-engine] Single artist mode: ${wikiEntryId}, module: ${module}`);
      
      if (module === "youtube" || module === "music" || module === "hanteo") {
        const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-data-collector`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ source: module, wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] ${module} single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (module === "yt_sentiment") {
        const p = fetch(`${supabaseUrl}/functions/v1/ktrenz-yt-sentiment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] yt_sentiment single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (module === "buzz" || module.startsWith("buzz_")) {
        const { data: artist } = await sb.from("wiki_entries").select("title, metadata").eq("id", wikiEntryId).single();
        if (!artist) {
          return new Response(JSON.stringify({ success: false, error: "Artist not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const meta = artist.metadata as any;
        const sources = module === "buzz"
          ? undefined
          : [BUZZ_SOURCE_MAP[module as BuzzSourceModule]];

        // buzz 전체 실행 시 Naver API를 먼저 동기 수집해 최신 snapshot 확보
        if (module === "buzz") {
          // ktrenz_stars에서 name_ko 가져오기
          const { data: starInfo } = await sb.from("ktrenz_stars").select("name_ko").eq("wiki_entry_id", wikiEntryId).maybeSingle();
          const naverResp = await fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ artistName: artist.title, koreanName: starInfo?.name_ko || null, wikiEntryId }),
          });
          if (!naverResp.ok) {
            const naverErr = await naverResp.text();
            console.warn(`[data-engine] Buzz single naver pre-collect failed: ${naverErr}`);
          }
        }

        const p = fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            artistName: artist.title,
            wikiEntryId,
            hashtags: meta?.hashtags || [],
            sources,
          }),
        }).catch((e) => console.warn(`[data-engine] Buzz single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // naver_news (개별 아티스트)
      if (module === "naver_news") {
        const { data: artist } = await sb.from("wiki_entries").select("title").eq("id", wikiEntryId).single();
        if (!artist) {
          return new Response(JSON.stringify({ success: false, error: "Artist not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        // ktrenz_stars에서 name_ko 가져오기
        const { data: starInfo } = await sb.from("ktrenz_stars").select("name_ko").eq("wiki_entry_id", wikiEntryId).maybeSingle();
        const p = fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ artistName: artist.title, koreanName: starInfo?.name_ko || null, wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] Naver News single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // energy
      if (module === "energy") {
        const p = fetch(`${supabaseUrl}/functions/v1/calculate-energy-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ wikiEntryId }),
        }).catch((e) => console.warn(`[data-engine] Energy single fire error:`, e.message));
        fireAndForget(p);
        return new Response(
          JSON.stringify({ success: true, module, wikiEntryId, status: "launched", runId: currentRunId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── "all" 모드: 파이프라인 시작 → 첫 모듈로 체이닝 ──
    if (module === "all") {
      await sb.from("ktrenz_engine_runs").insert({
        id: currentRunId,
        status: "running",
        trigger_source: body.triggerSource || "manual",
        modules_requested: [...PIPELINE],
        current_module: PIPELINE[0],
      });

      console.log(`[data-engine] Pipeline started (run: ${currentRunId}): ${PIPELINE.join(" → ")}`);

      const remaining = [...PIPELINE].slice(1);
      const startPromise = fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: PIPELINE[0], runId: currentRunId, chain: remaining }),
      }).catch((e) => console.warn(`[data-engine] Pipeline start fetch failed:`, e.message));
      fireAndForget(startPromise);

      return new Response(
        JSON.stringify({ success: true, runId: currentRunId, message: `Pipeline started: ${PIPELINE.join(" → ")}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 전체 개별 모듈 실행 ──
    const mod = module;
    if (!MODULE_RUNNERS[mod]) {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown module: ${module}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 이전 모듈의 딜레이 대기 (체이닝에서 전달된 경우) ──
    const MAX_SAFE_WAIT_MS = 45_000;
    const waitMs = waitBeforeMs || 0;
    if (waitMs > MAX_SAFE_WAIT_MS) {
      const remainingWait = waitMs - MAX_SAFE_WAIT_MS;
      console.log(`[data-engine] waitBeforeMs=${waitMs}ms exceeds safe limit. Sleeping ${MAX_SAFE_WAIT_MS}ms then relaying with ${remainingWait}ms remaining...`);
      await new Promise(r => setTimeout(r, MAX_SAFE_WAIT_MS));
      const relayPromise = fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: mod, runId: currentRunId, chain, waitBeforeMs: remainingWait }),
      }).catch((e) => console.warn(`[data-engine] Delay relay failed:`, e.message));
      fireAndForget(relayPromise);
      return new Response(
        JSON.stringify({ success: true, module: mod, runId: currentRunId, relayed: true, remainingWaitMs: remainingWait }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (waitMs > 0) {
      console.log(`[data-engine] Waiting ${waitMs}ms before executing ${mod}...`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (runId) {
      await sb.from("ktrenz_engine_runs").update({ current_module: mod }).eq("id", currentRunId);
    }

    console.log(`[data-engine] Executing module: ${mod} (run: ${currentRunId})`);

    // ── 체이닝 준비 ──
    if (chain && chain.length > 0) {
      const nextModule = chain[0];
      const remainingChain = chain.slice(1);
      const delaySec = DELAY_AFTER[mod as Module] || 10;
      const delayMs = delaySec * 1000;

      console.log(`[data-engine] Pre-scheduling chain → ${nextModule} (will wait ${delaySec}s before executing)`);

      const chainPromise = fetch(`${supabaseUrl}/functions/v1/data-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ module: nextModule, runId: currentRunId, chain: remainingChain, waitBeforeMs: delayMs }),
      }).catch((e) => console.warn(`[data-engine] Chain fetch to ${nextModule} failed:`, e.message));
      fireAndForget(chainPromise);
    }

    // ── 모듈 실행 ──
    const GUARD_MODULES = ["youtube", "music", "buzz", "social", "hanteo"];
    let result: any = {};
    try {
      const shouldBaseline = mod === "energy" && isBaseline === true;

      if (mod === "energy" && shouldBaseline) {
        result = await runEnergy(supabaseUrl, serviceKey, true);
      } else if (mod === "energy") {
        result = await runEnergy(supabaseUrl, serviceKey, false);
      } else if (mod === "youtube") {
        result = await runYouTube(supabaseUrl, serviceKey, false);
      } else if (mod === "external_videos") {
        result = await runExternalVideos(supabaseUrl, serviceKey, false);
      } else if (mod === "music") {
        result = await runMusic(supabaseUrl, serviceKey, false);
      } else if (mod === "hanteo") {
        result = await runHanteo(supabaseUrl, serviceKey, false);
      } else if (mod === "buzz") {
        result = await runBuzz(supabaseUrl, serviceKey, false);
      } else {
        result = await MODULE_RUNNERS[mod](supabaseUrl, serviceKey);
      }
      console.log(`[data-engine] Module ${mod} completed:`, JSON.stringify(result).slice(0, 300));

      // ── Pipeline Guard ──
      if (GUARD_MODULES.includes(mod)) {
        const guardPromise = fetch(`${supabaseUrl}/functions/v1/ktrenz-pipeline-guard`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ module: mod, engine_run_id: currentRunId }),
        }).catch((e) => console.warn(`[data-engine] Guard for ${mod} failed:`, e.message));
        fireAndForget(guardPromise);
        console.log(`[data-engine] Guard triggered for ${mod}`);
      }
    } catch (e) {
      console.error(`[data-engine] Module ${mod} failed:`, e);
      result = { error: (e as Error).message };
    }

    // ── 결과 기록 ──
    if (runId) {
      const { data: currentRun } = await sb.from("ktrenz_engine_runs").select("results").eq("id", currentRunId).maybeSingle();
      const updatedResults = { ...(currentRun?.results as any || {}), [mod]: result };
      await sb.from("ktrenz_engine_runs").update({ results: updatedResults }).eq("id", currentRunId);
    }

    // ── 파이프라인 완료 체크 ──
    if (runId && !chain?.length) {
      await sb.from("ktrenz_engine_runs")
        .update({ status: "completed", completed_at: new Date().toISOString(), current_module: null })
        .eq("id", currentRunId);
      console.log(`[data-engine] Pipeline ${currentRunId} completed`);
    }

    return new Response(
      JSON.stringify({ success: true, module: mod, runId: currentRunId, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[data-engine] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
