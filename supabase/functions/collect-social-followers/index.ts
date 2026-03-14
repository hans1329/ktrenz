// Social Followers Collector v4: Spotify Batch API + kpop-radar Hybrid
// - Spotify followers: Official Spotify Web API Batch endpoint (2 API calls for all artists)
// - Instagram, Twitter/X, TikTok: kpop-radar.com scrape (Firecrawl, 3 credits)
// Stores in ktrenz_data_snapshots (platform: "social_followers") + updates v3_scores_v2.social_score
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PlatformEntry { rank: number; artistName: string; growth: number; total: number; }
interface SocialMetrics { instagram_followers: number | null; tiktok_followers: number | null; spotify_followers: number | null; twitter_followers: number | null; }
interface SpotifyArtistData { followers: number; popularity: number; name: string; }

const SCRAPE_PLATFORMS = [
  { key: "instagram", url: "https://www.kpop-radar.com/instagram" },
  { key: "twitter", url: "https://www.kpop-radar.com/twitter" },
  { key: "tiktok", url: "https://www.kpop-radar.com/tiktok" },
] as const;

// ─── Spotify API ───

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not configured");

  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`Spotify token error ${resp.status}: ${t}`); }
  const data = await resp.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken!;
}

/** Batch fetch artists (max 50 per call) — only 2 calls for 66 artists */
async function getSpotifyArtistsBatch(artistIds: string[]): Promise<Map<string, SpotifyArtistData>> {
  const result = new Map<string, SpotifyArtistData>();
  if (!artistIds.length) return result;
  try {
    const token = await getSpotifyToken();
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const resp = await fetch(`https://api.spotify.com/v1/artists?ids=${batch.join(",")}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`[Social/Spotify] Batch ${i / 50} failed: ${resp.status} ${errText}`);
        continue;
      }
      const data = await resp.json();
      for (const a of (data.artists || [])) {
        if (a) result.set(a.id, { followers: a.followers?.total ?? 0, popularity: a.popularity ?? 0, name: a.name ?? "" });
      }
      if (i + 50 < artistIds.length) await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[Social/Spotify] Batch fetched ${result.size} artists`);
  } catch (e) {
    console.warn(`[Social/Spotify] Batch error:`, e.message);
  }
  return result;
}

/** Search Spotify for artist by name — returns ID only */
async function searchSpotifyArtist(name: string): Promise<string | null> {
  try {
    const token = await getSpotifyToken();
    const resp = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) { await resp.text(); return null; }
    const data = await resp.json();
    const artists = data?.artists?.items;
    if (!artists?.length) return null;

    const nameLower = name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    const exact = artists.find((a: any) => a.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "") === nameLower);
    return (exact || artists[0]).id;
  } catch (e) {
    console.warn(`[Social/Spotify] Search error for ${name}:`, e.message);
    return null;
  }
}

// ─── kpop-radar scrape ───

function parseRankingPage(markdown: string): PlatformEntry[] {
  const entries: PlatformEntry[] = [];
  const lines = markdown.split("\n");
  let currentRank = 0, currentName = "", numbers: number[] = [];
  for (const line of lines) {
    const l = line.trim();
    const rankMatch = l.match(/^-\s+(\d+)$/);
    if (rankMatch) {
      if (currentRank > 0 && currentName && numbers.length >= 2)
        entries.push({ rank: currentRank, artistName: currentName, growth: numbers[0], total: numbers[1] });
      currentRank = parseInt(rankMatch[1], 10); currentName = ""; numbers = [];
      continue;
    }
    const nameMatch = l.match(/\*\*(.+?)\*\*/);
    if (nameMatch && currentRank > 0 && !currentName) { currentName = nameMatch[1]; continue; }
    if (currentRank > 0 && currentName) {
      const numMatch = l.match(/^[\s]*([0-9,]+)[\s]*$/);
      if (numMatch) { const n = parseInt(numMatch[1].replace(/,/g, ""), 10); if (!isNaN(n) && numbers.length < 2) numbers.push(n); }
    }
  }
  if (currentRank > 0 && currentName && numbers.length >= 2)
    entries.push({ rank: currentRank, artistName: currentName, growth: numbers[0], total: numbers[1] });
  return entries;
}

async function scrapePlatform(firecrawlKey: string, url: string): Promise<PlatformEntry[]> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 3000 }),
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error(`Firecrawl error ${resp.status}: ${t}`); }
  const data = await resp.json();
  const md = data?.data?.markdown || data?.markdown || "";
  if (!md) return [];
  const entries = parseRankingPage(md);
  console.log(`[Social] Parsed ${entries.length} entries from ${url}`);
  return entries;
}

function normalizeName(name: string): string {
  const parenMatch = name.match(/\(([^)]+)\)/);
  const mainName = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const parenName = parenMatch?.[1]?.trim() || "";
  return `${mainName}|${parenName}`.toLowerCase().replace(/[^a-z0-9가-힣|]/g, "");
}

function calculateSocialScore(current: SocialMetrics, previous: SocialMetrics | null): number {
  const platforms = [
    { current: current.instagram_followers, prev: previous?.instagram_followers, weight: 1.2 },
    { current: current.tiktok_followers, prev: previous?.tiktok_followers, weight: 1.3 },
    { current: current.spotify_followers, prev: previous?.spotify_followers, weight: 1.5 },
    { current: current.twitter_followers, prev: previous?.twitter_followers, weight: 1.0 },
  ];
  let totalScore = 0, activeCount = 0;
  for (const p of platforms) {
    if (p.current == null || p.current <= 0) continue;
    activeCount++;
    const baseScore = Math.log10(p.current) * 100;
    let deltaScore = 0;
    if (p.prev != null && p.prev > 0) {
      const growth = p.current - p.prev;
      if (growth > 0) deltaScore = Math.round((growth / p.prev) * 1000);
    }
    totalScore += (baseScore * 0.3 + Math.max(deltaScore, baseScore * 0.1) * 0.7) * p.weight;
  }
  return activeCount > 0 ? Math.round(totalScore / activeCount) : 0;
}

// ─── Main ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const hasSpotify = !!(Deno.env.get("SPOTIFY_CLIENT_ID") && Deno.env.get("SPOTIFY_CLIENT_SECRET"));

    if (!FIRECRAWL_API_KEY && !hasSpotify) {
      return new Response(JSON.stringify({ error: "No data sources configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    console.log(`[Social] Starting hybrid collection (Spotify: ${hasSpotify}, Scrape: ${!!FIRECRAWL_API_KEY})...`);

    // Step 1: Scrape kpop-radar (3 platforms in parallel)
    const platformData: Record<string, PlatformEntry[]> = {};
    if (FIRECRAWL_API_KEY) {
      for (const platform of SCRAPE_PLATFORMS) {
        try { platformData[platform.key] = await scrapePlatform(FIRECRAWL_API_KEY, platform.url); }
        catch (e) { console.error(`[Social] Scrape ${platform.key} failed:`, e.message); platformData[platform.key] = []; }
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log(`[Social] Scraped: ${Object.values(platformData).reduce((s, v) => s + v.length, 0)} entries`);

    // Step 2: Get tier-1 artists
    const { data: artists } = await sb.from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko, spotify_artist_id")
      .eq("tier", 1);
    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Spotify — resolve missing IDs via search, then batch fetch ALL
    let spotifyDiscovered = 0;
    if (hasSpotify) {
      const needSearch = artists.filter(a => !(a as any).spotify_artist_id && a.display_name);
      if (needSearch.length > 0) {
        console.log(`[Social/Spotify] Searching ${needSearch.length} artists without Spotify ID...`);
        for (const artist of needSearch) {
          const foundId = await searchSpotifyArtist(artist.display_name || "");
          if (foundId) {
            (artist as any).spotify_artist_id = foundId;
            spotifyDiscovered++;
            await sb.from("v3_artist_tiers")
              .update({ spotify_artist_id: foundId })
              .eq("wiki_entry_id", artist.wiki_entry_id);
          }
          await new Promise(r => setTimeout(r, 100));
        }
        console.log(`[Social/Spotify] Discovered ${spotifyDiscovered} new IDs`);
      }
    }

    // Batch fetch all Spotify data in 2 API calls (max 50 per call)
    const allSpotifyIds = artists.map(a => (a as any).spotify_artist_id).filter(Boolean) as string[];
    const spotifyDataMap = hasSpotify ? await getSpotifyArtistsBatch(allSpotifyIds) : new Map<string, SpotifyArtistData>();

    // Step 4: Build scrape lookup maps
    const platformLookups: Record<string, Map<string, PlatformEntry>> = {};
    for (const [key, entries] of Object.entries(platformData)) {
      const lookup = new Map<string, PlatformEntry>();
      for (const entry of entries) {
        for (const variant of normalizeName(entry.artistName).split("|").filter(Boolean))
          if (variant) lookup.set(variant, entry);
      }
      platformLookups[key] = lookup;
    }

    // Step 5: Process each artist
    let processed = 0, matched = 0, spotifyHits = 0;

    for (const artist of artists) {
      const name = artist.display_name || "";
      const nameKo = (artist as any).name_ko || "";
      if (!name && !nameKo) continue;

      const allVariants: string[] = [];
      if (name) allVariants.push(...normalizeName(name).split("|").filter(Boolean));
      if (nameKo) allVariants.push(...normalizeName(nameKo).split("|").filter(Boolean));

      const findMatch = (lookup: Map<string, PlatformEntry>): PlatformEntry | null => {
        for (const v of allVariants) { const m = lookup.get(v); if (m) return m; }
        for (const [k, e] of lookup.entries()) {
          for (const v of allVariants) {
            if (v && k && (k.includes(v) || v.includes(k)) && v.length >= 2) return e;
          }
        }
        return null;
      };

      const igMatch = findMatch(platformLookups.instagram || new Map());
      const twMatch = findMatch(platformLookups.twitter || new Map());
      const tkMatch = findMatch(platformLookups.tiktok || new Map());

      // Spotify from batch data
      const spId = (artist as any).spotify_artist_id;
      const spData = spId ? spotifyDataMap.get(spId) : null;
      if (spData) spotifyHits++;

      const metrics: SocialMetrics = {
        instagram_followers: igMatch?.total ?? null,
        tiktok_followers: tkMatch?.total ?? null,
        spotify_followers: spData?.followers ?? null,
        twitter_followers: twMatch?.total ?? null,
      };

      const hasAnyData = Object.values(metrics).some(v => v != null);
      if (!hasAnyData) { processed++; continue; }
      matched++;

      // Previous snapshot for delta
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: prevSnap } = await sb.from("ktrenz_data_snapshots")
        .select("metrics")
        .eq("wiki_entry_id", artist.wiki_entry_id)
        .eq("platform", "social_followers")
        .lte("collected_at", oneDayAgo)
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevMetrics: SocialMetrics | null = prevSnap?.metrics ? {
        instagram_followers: prevSnap.metrics.instagram_followers ?? null,
        tiktok_followers: prevSnap.metrics.tiktok_followers ?? null,
        spotify_followers: prevSnap.metrics.spotify_followers ?? null,
        twitter_followers: prevSnap.metrics.twitter_followers ?? null,
      } : null;

      const socialScore = calculateSocialScore(metrics, prevMetrics);

      // Store snapshot
      await sb.from("ktrenz_data_snapshots").insert({
        wiki_entry_id: artist.wiki_entry_id,
        platform: "social_followers",
        metrics: {
          ...metrics,
          spotify_popularity: spData?.popularity ?? null,
          spotify_source: spId ? "api" : "none",
          instagram_growth: igMatch?.growth ?? null,
          tiktok_growth: tkMatch?.growth ?? null,
          twitter_growth: twMatch?.growth ?? null,
          source: "hybrid_v4",
        },
      });

      // Update score
      const { data: existing } = await sb.from("v3_scores_v2")
        .select("id").eq("wiki_entry_id", artist.wiki_entry_id).maybeSingle();
      if (existing) {
        await sb.from("v3_scores_v2").update({ social_score: socialScore }).eq("id", existing.id);
      }

      processed++;
    }

    console.log(`[Social] Done: ${processed} processed, ${matched} matched, Spotify: ${spotifyHits} hits, ${spotifyDiscovered} discovered`);

    return new Response(JSON.stringify({
      success: true, processed, matched,
      spotify: { apiHits: spotifyHits, newlyDiscovered: spotifyDiscovered, batchSize: allSpotifyIds.length },
      scrapePlatformCounts: Object.fromEntries(Object.entries(platformData).map(([k, v]) => [k, v.length])),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[Social] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
