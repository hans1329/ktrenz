// collect-korean-charts: 멜론 TOP100 + 지니 TOP200 스크래핑
// Music score에 Korean Streaming Chart Bonus 제공
// 두 차트에서 최고 순위(best rank)만 사용 (중복 제거)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChartEntry {
  rank: number;
  title: string;
  artist: string;
  source: "melon" | "genie";
}

/** 멜론 TOP100 마크다운 파싱 */
function parseMelonChart(markdown: string): ChartEntry[] {
  const entries: ChartEntry[] = [];
  // 멜론 차트 패턴: | | {rank}위 | ... | {songTitle}<br>[{artistName}](...) |
  const lines = markdown.split("\n");
  
  for (const line of lines) {
    if (!line.includes("위") || !line.includes("곡정보")) continue;
    
    // 순위 추출: "{N}위"
    const rankMatch = line.match(/(\d+)위/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1]);
    if (isNaN(rank) || rank < 1 || rank > 100) continue;
    
    // 아티스트 추출: [아티스트명](melon artist link)
    // 곡정보 뒤의 첫 번째 <br> 다음 [아티스트명] 패턴
    const artistMatches = line.match(/곡정보[^|]*?\|[^|]*?<br>\[([^\]]+)\]/);
    if (!artistMatches) continue;
    
    // 곡 제목 추출: "곡정보") | {title}<br>
    const titleMatch = line.match(/곡정보[^|]*?\|[^|]*?([^|<]+)<br>/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    let artistName = artistMatches[1].trim();
    // 괄호 안 한국어 이름도 포함: "IVE (아이브)" → 그대로 유지
    
    entries.push({ rank, title, artist: artistName, source: "melon" });
  }
  
  return entries;
}

/** 지니 TOP200 마크다운 파싱 */
function parseGenieChart(markdown: string): ChartEntry[] {
  const entries: ChartEntry[] = [];
  const lines = markdown.split("\n");
  
  for (const line of lines) {
    // 지니 패턴은 테이블 또는 리스트 형식일 수 있음
    // 일반적인 패턴: 순위 | 곡명 | 아티스트
    const rankMatch = line.match(/^\|?\s*(\d+)\s*\|/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1]);
    if (isNaN(rank) || rank < 1 || rank > 200) continue;
    
    // 아티스트 링크 패턴
    const artistMatch = line.match(/\[([^\]]+)\]\(https?:\/\/www\.genie\.co\.kr\/detail\/artistInfo/);
    if (!artistMatch) continue;
    
    const titleMatch = line.match(/\[([^\]]+)\]\(https?:\/\/www\.genie\.co\.kr\/detail\/songInfo/);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    entries.push({ rank, title, artist: artistMatch[1].trim(), source: "genie" });
  }
  
  return entries;
}

/** Firecrawl로 페이지 스크래핑 */
async function scrapeWithFirecrawl(url: string, apiKey: string, waitFor?: number): Promise<string | null> {
  try {
    const body: any = {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    };
    if (waitFor) body.waitFor = waitFor;
    
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[KoreanCharts] Firecrawl error for ${url}: ${resp.status} ${errText.slice(0, 200)}`);
      return null;
    }
    
    const data = await resp.json();
    return data?.data?.markdown || data?.markdown || null;
  } catch (e) {
    console.error(`[KoreanCharts] Firecrawl fetch error for ${url}:`, e);
    return null;
  }
}

/** 아티스트명 정규화: 괄호/구분자 제거, 붙여쓴 형태까지 동일 키로 변환 */
function normalizeArtistName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

/** 아티스트 매칭: chart artist name → wiki_entry_id (melon lookup 우선) */
function matchArtist(
  artistName: string,
  melonNameLookup: Map<string, string>,
  nameLookup: Map<string, string>,
): string | null {
  const lower = artistName.toLowerCase().trim();

  // 1) melon_artist_name 전용 매칭 (최우선)
  if (melonNameLookup.has(lower)) return melonNameLookup.get(lower)!;

  // 2) 기존 name lookup 매칭
  if (nameLookup.has(lower)) return nameLookup.get(lower)!;

  const normalized = normalizeArtistName(artistName);
  if (nameLookup.has(normalized)) return nameLookup.get(normalized)!;

  // 3) 괄호 안/밖 분리 매칭
  const parenMatch = artistName.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const inner = parenMatch[1].toLowerCase().trim();
    if (melonNameLookup.has(inner)) return melonNameLookup.get(inner)!;
    if (nameLookup.has(inner)) return nameLookup.get(inner)!;
    const innerNormalized = normalizeArtistName(inner);
    if (nameLookup.has(innerNormalized)) return nameLookup.get(innerNormalized)!;

    const outer = artistName.replace(/\s*\([^)]*\)/, "").toLowerCase().trim();
    if (melonNameLookup.has(outer)) return melonNameLookup.get(outer)!;
    if (nameLookup.has(outer)) return nameLookup.get(outer)!;
    const outerNormalized = normalizeArtistName(outer);
    if (nameLookup.has(outerNormalized)) return nameLookup.get(outerNormalized)!;
  }

  // 4) 부분 매칭 (4자 이상만)
  for (const [key, id] of nameLookup) {
    if (key.length >= 4 && normalized.length >= 4 && (key.includes(normalized) || normalized.includes(key))) {
      return id;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);
    
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedup: 1시간 내 수집된 경우 스킵
    if (!force) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await sb
        .from("ktrenz_data_snapshots")
        .select("id")
        .in("platform", ["melon_chart", "genie_chart"])
        .gte("collected_at", oneHourAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        return new Response(JSON.stringify({ skipped: true, message: "Collected within last hour" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 1) Tier 1 아티스트 목록 로드 (melon_artist_name 포함)
    const { data: artists } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko, aliases, melon_artist_name")
      .eq("tier", 1);
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ error: "No tier 1 artists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // melon_artist_name 전용 lookup (최우선 매칭)
    const melonNameLookup = new Map<string, string>();
    for (const a of artists) {
      if (a.melon_artist_name) {
        melonNameLookup.set(a.melon_artist_name.toLowerCase().trim(), a.wiki_entry_id);
        // 괄호 안/밖 이름도 별도 등록
        const parenMatch = a.melon_artist_name.match(/^(.+?)\s*\((.+)\)$/);
        if (parenMatch) {
          melonNameLookup.set(parenMatch[1].trim().toLowerCase(), a.wiki_entry_id);
          melonNameLookup.set(parenMatch[2].trim().toLowerCase(), a.wiki_entry_id);
        }
      }
    }

    // name lookup 구축: 원본 키 + 공백 제거 정규화 키를 모두 저장 (fallback)
    const nameLookup = new Map<string, string>();
    const addLookup = (value: string | null | undefined, wikiEntryId: string) => {
      if (!value) return;
      const lower = value.toLowerCase().trim();
      const normalized = normalizeArtistName(value);
      if (lower) nameLookup.set(lower, wikiEntryId);
      if (normalized) nameLookup.set(normalized, wikiEntryId);
    };
    for (const a of artists) {
      addLookup(a.display_name, a.wiki_entry_id);
      addLookup(a.name_ko, a.wiki_entry_id);
      if (a.aliases && Array.isArray(a.aliases)) {
        for (const alias of a.aliases) {
          addLookup(alias, a.wiki_entry_id);
        }
      }
    }
    // wiki_entries title도 추가
    const wikiIds = [...new Set(artists.map(a => a.wiki_entry_id).filter(Boolean))];
    const { data: wikiEntries } = await sb.from("wiki_entries").select("id, title").in("id", wikiIds);
    for (const w of (wikiEntries || [])) {
      addLookup(w.title, w.id);
    }

    console.log(`[KoreanCharts] Loaded ${melonNameLookup.size} melon names + ${nameLookup.size} fallback lookups for ${artists.length} tier 1 artists`);

    // 2) 멜론 + 지니 동시 스크래핑
    const [melonMd, genieMd] = await Promise.all([
      scrapeWithFirecrawl("https://www.melon.com/chart/index.htm", firecrawlKey),
      scrapeWithFirecrawl("https://www.genie.co.kr/chart/top200", firecrawlKey, 3000),
    ]);

    const melonEntries = melonMd ? parseMelonChart(melonMd) : [];
    const genieEntries = genieMd ? parseGenieChart(genieMd) : [];
    
    console.log(`[KoreanCharts] Parsed: Melon=${melonEntries.length}, Genie=${genieEntries.length}`);

    // 3) 아티스트 매칭 + best rank 계산
    // wikiEntryId → { bestRank, source, entries[] }
    const artistBestRank = new Map<string, { bestRank: number; source: string; melonRank: number | null; genieRank: number | null; songTitle: string }>();

    for (const entry of [...melonEntries, ...genieEntries]) {
      const wikiId = matchArtist(entry.artist, melonNameLookup, nameLookup);
      if (!wikiId) continue;

      const existing = artistBestRank.get(wikiId);
      if (!existing) {
        artistBestRank.set(wikiId, {
          bestRank: entry.rank,
          source: entry.source,
          melonRank: entry.source === "melon" ? entry.rank : null,
          genieRank: entry.source === "genie" ? entry.rank : null,
          songTitle: entry.title,
        });
      } else {
        // 같은 아티스트 → best rank 갱신
        if (entry.rank < existing.bestRank) {
          existing.bestRank = entry.rank;
          existing.source = entry.source;
          existing.songTitle = entry.title;
        }
        if (entry.source === "melon" && (existing.melonRank === null || entry.rank < existing.melonRank)) {
          existing.melonRank = entry.rank;
        }
        if (entry.source === "genie" && (existing.genieRank === null || entry.rank < existing.genieRank)) {
          existing.genieRank = entry.rank;
        }
      }
    }

    console.log(`[KoreanCharts] Matched ${artistBestRank.size} tier 1 artists`);

    // 4) 스냅샷 저장
    const snapshotRows: any[] = [];
    for (const [wikiId, data] of artistBestRank) {
      snapshotRows.push({
        wiki_entry_id: wikiId,
        platform: "korean_chart",
        metrics: {
          best_rank: data.bestRank,
          melon_rank: data.melonRank,
          genie_rank: data.genieRank,
          best_source: data.source,
          song_title: data.songTitle,
        },
      });
    }

    if (snapshotRows.length > 0) {
      const { error: insertErr } = await sb.from("ktrenz_data_snapshots").insert(snapshotRows);
      if (insertErr) console.error("[KoreanCharts] Snapshot insert error:", insertErr.message);
    }

    // 요약
    const matched = artistBestRank.size;
    const sample = [...artistBestRank.entries()].slice(0, 5).map(([id, d]) => ({
      wikiId: id, bestRank: d.bestRank, melon: d.melonRank, genie: d.genieRank, song: d.songTitle,
    }));

    console.log(`[KoreanCharts] Done: ${matched} artists matched, ${snapshotRows.length} snapshots saved`);

    return new Response(JSON.stringify({
      success: true,
      matched,
      melonParsed: melonEntries.length,
      genieParsed: genieEntries.length,
      uniqueArtists: matched,
      sample,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[KoreanCharts] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
