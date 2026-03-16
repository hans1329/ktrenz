// collect-spotify-listeners: kworb.net에서 Spotify monthly listeners 수집
// Firecrawl 불필요 — 직접 fetch + 마크다운 파싱
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SpotifyListenerEntry {
  rank: number;
  artist: string;
  listeners: number;
  dailyChange: number;
  peak: number;
  peakListeners: number;
  spotifyId: string | null;
}

/** kworb.net HTML에서 Spotify listeners 테이블 파싱 */
function parseKworbListeners(html: string): SpotifyListenerEntry[] {
  const entries: SpotifyListenerEntry[] = [];
  
  // 더 유연한 파싱: 각 <tr> 블록을 추출 후 <td> 내용 분리
  const trBlocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  
  for (const tr of trBlocks) {
    // <td> 내용 추출
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim());
    if (tds.length < 6) continue;
    
    const rank = parseInt(tds[0]);
    if (isNaN(rank) || rank < 1) continue;
    
    // 아티스트명 + Spotify ID 추출
    const artistLink = tds[1].match(/<a[^>]*href="[^"]*artist\/([^_"]+)_songs[^"]*"[^>]*>([^<]+)<\/a>/i);
    if (!artistLink) continue;
    
    const spotifyId = artistLink[1];
    const artist = artistLink[2].trim();
    const listeners = parseInt(tds[2].replace(/,/g, "").replace(/<[^>]*>/g, ""));
    const dailyChange = parseInt(tds[3].replace(/,/g, "").replace(/<[^>]*>/g, ""));
    const peak = parseInt(tds[4].replace(/,/g, "").replace(/<[^>]*>/g, ""));
    const peakListeners = parseInt(tds[5].replace(/,/g, "").replace(/<[^>]*>/g, ""));
    
    if (!isNaN(rank) && !isNaN(listeners)) {
      entries.push({ rank, artist, listeners, dailyChange, peak, peakListeners, spotifyId });
    }
  }
  
  return entries;
}

/** 아티스트명 정규화 */
function normalizeArtistName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

/** 아티스트 매칭 */
function matchArtist(artistName: string, nameLookup: Map<string, string>): string | null {
  const lower = artistName.toLowerCase().trim();
  if (nameLookup.has(lower)) return nameLookup.get(lower)!;

  const normalized = normalizeArtistName(artistName);
  if (nameLookup.has(normalized)) return nameLookup.get(normalized)!;

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
    const sb = createClient(supabaseUrl, supabaseKey);

    // Dedup: 6시간 내 수집 스킵
    if (!force) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await sb
        .from("ktrenz_data_snapshots")
        .select("id")
        .eq("platform", "spotify_listeners")
        .gte("collected_at", sixHoursAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        return new Response(JSON.stringify({ skipped: true, message: "Collected within last 6 hours" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 1) Tier 1 아티스트 목록
    const { data: artists } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko")
      .eq("tier", 1);
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ error: "No tier 1 artists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nameLookup = new Map<string, string>();
    for (const a of artists) {
      if (a.display_name) nameLookup.set(a.display_name.toLowerCase(), a.wiki_entry_id);
      if (a.name_ko) nameLookup.set(a.name_ko.toLowerCase(), a.wiki_entry_id);
    }
    const wikiIds = [...new Set(artists.map(a => a.wiki_entry_id).filter(Boolean))];
    const { data: wikiEntries } = await sb.from("wiki_entries").select("id, title").in("id", wikiIds);
    for (const w of (wikiEntries || [])) {
      if (w.title) nameLookup.set(w.title.toLowerCase(), w.id);
    }

    console.log(`[SpotifyListeners] Loaded ${nameLookup.size} name lookups for ${artists.length} tier 1 artists`);

    // 2) kworb.net 두 페이지 동시 fetch
    const fetchOpts = {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    };
    const [page1Resp, page2Resp] = await Promise.all([
      fetch("https://kworb.net/spotify/listeners.html", fetchOpts),
      fetch("https://kworb.net/spotify/listeners2.html", fetchOpts),
    ]);

    console.log(`[SpotifyListeners] Fetch status: page1=${page1Resp.status}, page2=${page2Resp.status}`);
    const page1Html = page1Resp.ok ? await page1Resp.text() : "";
    const page2Html = page2Resp.ok ? await page2Resp.text() : "";
    console.log(`[SpotifyListeners] HTML length: page1=${page1Html.length}, page2=${page2Html.length}`);
    
    // Debug: HTML 샘플 출력
    if (page1Html.length > 0) {
      const trSample = page1Html.match(/<tr[^>]*>.*?<\/tr>/s);
      console.log(`[SpotifyListeners] First TR sample: ${trSample ? trSample[0].slice(0, 300) : 'NO TR FOUND'}`);
      // 테이블 포함 여부 확인
      const tableIdx = page1Html.indexOf('<table');
      console.log(`[SpotifyListeners] Table tag at index: ${tableIdx}`);
    } else {
      console.log(`[SpotifyListeners] page1 empty! Headers: ${JSON.stringify(Object.fromEntries(page1Resp.headers.entries()))}`);
    }
    
    const entries1 = parseKworbListeners(page1Html);
    const entries2 = parseKworbListeners(page2Html);
    const allEntries = [...entries1, ...entries2];
    
    console.log(`[SpotifyListeners] Parsed: page1=${entries1.length}, page2=${entries2.length}, total=${allEntries.length}`);

    // 3) 아티스트 매칭
    const matched: { wikiId: string; entry: SpotifyListenerEntry }[] = [];
    for (const entry of allEntries) {
      const wikiId = matchArtist(entry.artist, nameLookup);
      if (wikiId) {
        // 같은 아티스트 중복 방지 (첫 번째 = 가장 높은 순위)
        if (!matched.some(m => m.wikiId === wikiId)) {
          matched.push({ wikiId, entry });
        }
      }
    }

    console.log(`[SpotifyListeners] Matched ${matched.length} tier 1 artists`);

    // 4) 스냅샷 저장
    if (matched.length > 0) {
      const rows = matched.map(m => ({
        wiki_entry_id: m.wikiId,
        platform: "spotify_listeners",
        metrics: {
          monthly_listeners: m.entry.listeners,
          daily_change: m.entry.dailyChange,
          global_rank: m.entry.rank,
          peak_rank: m.entry.peak,
          peak_listeners: m.entry.peakListeners,
          spotify_id: m.entry.spotifyId,
        },
      }));
      
      const { error: insertErr } = await sb.from("ktrenz_data_snapshots").insert(rows);
      if (insertErr) console.error("[SpotifyListeners] Insert error:", insertErr.message);
    }

    const sample = matched.slice(0, 5).map(m => ({
      wikiId: m.wikiId,
      artist: m.entry.artist,
      listeners: m.entry.listeners,
      dailyChange: m.entry.dailyChange,
      rank: m.entry.rank,
    }));

    console.log(`[SpotifyListeners] Done: ${matched.length} matched`);

    return new Response(JSON.stringify({
      success: true,
      totalParsed: allEntries.length,
      matched: matched.length,
      sample,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[SpotifyListeners] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
