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
  
  // 테이블 행 패턴: <tr><td>rank</td><td><a href="...artist/ID_songs.html">Name</a></td><td>listeners</td><td>daily</td><td>peak</td><td>peakListeners</td></tr>
  const rowRegex = /<tr><td>(\d+)<\/td><td><a href="[^"]*?artist\/([^_"]+)_songs\.html">([^<]+)<\/a><\/td><td>([\d,]+)<\/td><td>([+-]?[\d,]+)<\/td><td>(\d+)<\/td><td>([\d,]+)<\/td><\/tr>/g;
  
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rank = parseInt(match[1]);
    const spotifyId = match[2];
    const artist = match[3].trim();
    const listeners = parseInt(match[4].replace(/,/g, ""));
    const dailyChange = parseInt(match[5].replace(/,/g, ""));
    const peak = parseInt(match[6]);
    const peakListeners = parseInt(match[7].replace(/,/g, ""));
    
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
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 아티스트 매칭 */
function matchArtist(artistName: string, nameLookup: Map<string, string>): string | null {
  const lower = artistName.toLowerCase().trim();
  if (nameLookup.has(lower)) return nameLookup.get(lower)!;
  
  const normalized = normalizeArtistName(artistName);
  if (nameLookup.has(normalized)) return nameLookup.get(normalized)!;
  
  // 부분 매칭
  for (const [key, id] of nameLookup) {
    if (key.includes(normalized) || normalized.includes(key)) {
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

    // 2) kworb.net 두 페이지 동시 fetch (1~2500, 2501~5000)
    const [page1Resp, page2Resp] = await Promise.all([
      fetch("https://kworb.net/spotify/listeners.html", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KTrenz/1.0)" },
      }),
      fetch("https://kworb.net/spotify/listeners2.html", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; KTrenz/1.0)" },
      }),
    ]);

    const page1Html = page1Resp.ok ? await page1Resp.text() : "";
    const page2Html = page2Resp.ok ? await page2Resp.text() : "";
    
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
