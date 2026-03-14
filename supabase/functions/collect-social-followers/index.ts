// Social Followers Collector v3: Spotify API + kpop-radar Hybrid
// - Spotify followers: Official Spotify Web API (Client Credentials)
// - Instagram, Twitter/X, TikTok: kpop-radar.com scrape (Firecrawl)
// Stores in ktrenz_data_snapshots (platform: "social_followers") + updates v3_scores_v2.social_score
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PlatformEntry {
  rank: number;
  artistName: string;
  growth: number;
  total: number;
}

interface SocialMetrics {
  instagram_followers: number | null;
  tiktok_followers: number | null;
  spotify_followers: number | null;
  twitter_followers: number | null;
}

// kpop-radar platforms (Spotify removed — now via official API)
const SCRAPE_PLATFORMS = [
  { key: "instagram", url: "https://www.kpop-radar.com/instagram" },
  { key: "twitter", url: "https://www.kpop-radar.com/twitter" },
  { key: "tiktok", url: "https://www.kpop-radar.com/tiktok" },
] as const;

// ─── Spotify API helpers ───

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

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Spotify token error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken!;
}

interface SpotifyArtistData {
  followers: number;
  popularity: number;
  name: string;
}

async function getSpotifyArtist(artistId: string): Promise<SpotifyArtistData | null> {
  try {
    const token = await getSpotifyToken();
    const resp = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[Social/Spotify] Failed for ${artistId}: ${resp.status} ${errText}`);
      return null;
    }
    const data = await resp.json();
    return {
      followers: data.followers?.total ?? 0,
      popularity: data.popularity ?? 0,
      name: data.name ?? "",
    };
  } catch (e) {
    console.warn(`[Social/Spotify] Error for ${artistId}:`, e.message);
    return null;
  }
}

/** Search Spotify for an artist by name, return best match ID */
async function searchSpotifyArtist(name: string): Promise<{ id: string; followers: number; popularity: number } | null> {
  try {
    const token = await getSpotifyToken();
    const q = encodeURIComponent(name);
    const resp = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=artist&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      await resp.text();
      return null;
    }
    const data = await resp.json();
    const artists = data?.artists?.items;
    if (!artists?.length) return null;

    // Pick the best match: prefer exact name match, then highest followers
    const nameLower = name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    const exact = artists.find((a: any) =>
      a.name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "") === nameLower
    );
    const best = exact || artists[0];

    // Search API returns incomplete follower data — fetch full artist details
    const fullData = await getSpotifyArtist(best.id);
    return {
      id: best.id,
      followers: fullData?.followers ?? best.followers?.total ?? 0,
      popularity: fullData?.popularity ?? best.popularity ?? 0,
    };
  } catch (e) {
    console.warn(`[Social/Spotify] Search error for ${name}:`, e.message);
    return null;
  }
}

// ─── kpop-radar scrape helpers ───

function parseRankingPage(markdown: string): PlatformEntry[] {
  const entries: PlatformEntry[] = [];
  const lines = markdown.split("\n");
  let currentRank = 0;
  let currentName = "";
  let numbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const rankMatch = line.match(/^-\s+(\d+)$/);
    if (rankMatch) {
      if (currentRank > 0 && currentName && numbers.length >= 2) {
        entries.push({ rank: currentRank, artistName: currentName, growth: numbers[0], total: numbers[1] });
      }
      currentRank = parseInt(rankMatch[1], 10);
      currentName = "";
      numbers = [];
      continue;
    }
    const nameMatch = line.match(/\*\*(.+?)\*\*/);
    if (nameMatch && currentRank > 0 && !currentName) {
      currentName = nameMatch[1];
      continue;
    }
    if (currentRank > 0 && currentName) {
      const numMatch = line.match(/^[\s]*([0-9,]+)[\s]*$/);
      if (numMatch) {
        const num = parseInt(numMatch[1].replace(/,/g, ""), 10);
        if (!isNaN(num) && numbers.length < 2) numbers.push(num);
      }
    }
  }
  if (currentRank > 0 && currentName && numbers.length >= 2) {
    entries.push({ rank: currentRank, artistName: currentName, growth: numbers[0], total: numbers[1] });
  }
  return entries;
}

async function scrapePlatform(firecrawlKey: string, platformUrl: string): Promise<PlatformEntry[]> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: platformUrl, formats: ["markdown"], onlyMainContent: true, waitFor: 3000 }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Firecrawl error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  const markdown = data?.data?.markdown || data?.markdown || "";
  if (!markdown) return [];
  const entries = parseRankingPage(markdown);
  console.log(`[Social] Parsed ${entries.length} entries from ${platformUrl}`);
  return entries;
}

function normalizeName(name: string): string {
  const parenMatch = name.match(/\(([^)]+)\)/);
  const mainName = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const parenName = parenMatch?.[1]?.trim() || "";
  return `${mainName}|${parenName}`.toLowerCase().replace(/[^a-z0-9가-힣|]/g, "");
}

// ─── Scoring ───

function calculateSocialScore(current: SocialMetrics, previous: SocialMetrics | null): number {
  const platforms = [
    { current: current.instagram_followers, prev: previous?.instagram_followers, weight: 1.2 },
    { current: current.tiktok_followers, prev: previous?.tiktok_followers, weight: 1.3 },
    { current: current.spotify_followers, prev: previous?.spotify_followers, weight: 1.5 },
    { current: current.twitter_followers, prev: previous?.twitter_followers, weight: 1.0 },
  ];

  let totalScore = 0;
  let activeCount = 0;

  for (const p of platforms) {
    if (p.current == null || p.current <= 0) continue;
    activeCount++;
    const baseScore = Math.log10(p.current) * 100;
    let deltaScore = 0;
    if (p.prev != null && p.prev > 0) {
      const growth = p.current - p.prev;
      if (growth > 0) deltaScore = Math.round((growth / p.prev) * 1000);
    }
    const platformScore = (baseScore * 0.3 + Math.max(deltaScore, baseScore * 0.1) * 0.7) * p.weight;
    totalScore += platformScore;
  }

  return activeCount > 0 ? Math.round(totalScore / activeCount) : 0;
}

// ─── Main handler ───

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

    console.log(`[Social] Starting hybrid collection (Spotify API: ${hasSpotify}, Scrape: ${!!FIRECRAWL_API_KEY})...`);

    // Step 1: Scrape kpop-radar for IG/Twitter/TikTok (3 credits)
    const platformData: Record<string, PlatformEntry[]> = {};
    if (FIRECRAWL_API_KEY) {
      for (const platform of SCRAPE_PLATFORMS) {
        try {
          platformData[platform.key] = await scrapePlatform(FIRECRAWL_API_KEY, platform.url);
        } catch (e) {
          console.error(`[Social] Failed to scrape ${platform.key}:`, e.message);
          platformData[platform.key] = [];
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const totalScraped = Object.values(platformData).reduce((s, v) => s + v.length, 0);
    console.log(`[Social] Scraped entries: ${totalScraped}`);

    // Step 2: Get all tier-1 artists
    const { data: artists } = await sb.from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko, spotify_artist_id")
      .eq("tier", 1);

    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Build lookup maps for scraped platforms
    const platformLookups: Record<string, Map<string, PlatformEntry>> = {};
    for (const [key, entries] of Object.entries(platformData)) {
      const lookup = new Map<string, PlatformEntry>();
      for (const entry of entries) {
        const normalized = normalizeName(entry.artistName);
        for (const variant of normalized.split("|").filter(Boolean)) {
          if (variant) lookup.set(variant, entry);
        }
      }
      platformLookups[key] = lookup;
    }

    // Step 4: Process each artist
    let processed = 0, matched = 0, spotifyHits = 0, spotifyDiscovered = 0;

    for (const artist of artists) {
      const name = artist.display_name || "";
      const nameKo = (artist as any).name_ko || "";
      if (!name && !nameKo) continue;

      // Build name variants for kpop-radar matching
      const allVariants: string[] = [];
      if (name) allVariants.push(...normalizeName(name).split("|").filter(Boolean));
      if (nameKo) allVariants.push(...normalizeName(nameKo).split("|").filter(Boolean));

      const findMatch = (lookup: Map<string, PlatformEntry>): PlatformEntry | null => {
        for (const variant of allVariants) {
          const match = lookup.get(variant);
          if (match) return match;
        }
        for (const [key, entry] of lookup.entries()) {
          for (const variant of allVariants) {
            if (variant && key && (key.includes(variant) || variant.includes(key)) && variant.length >= 2) {
              return entry;
            }
          }
        }
        return null;
      };

      const igMatch = findMatch(platformLookups.instagram || new Map());
      const twMatch = findMatch(platformLookups.twitter || new Map());
      const tkMatch = findMatch(platformLookups.tiktok || new Map());

      // ── Spotify: Official API ──
      let spotifyFollowers: number | null = null;
      let spotifyPopularity: number | null = null;
      let resolvedSpotifyId = (artist as any).spotify_artist_id || null;

      if (hasSpotify) {
        if (resolvedSpotifyId) {
          // Direct lookup by stored ID
          const spData = await getSpotifyArtist(resolvedSpotifyId);
          if (spData) {
            spotifyFollowers = spData.followers;
            spotifyPopularity = spData.popularity;
            spotifyHits++;
          }
        } else {
          // Search by name and auto-fill ID
          const searchResult = await searchSpotifyArtist(name || nameKo);
          if (searchResult) {
            spotifyFollowers = searchResult.followers;
            resolvedSpotifyId = searchResult.id;
            spotifyHits++;
            spotifyDiscovered++;

            // Save discovered Spotify ID for future direct lookups
            await sb.from("v3_artist_tiers")
              .update({ spotify_artist_id: searchResult.id })
              .eq("wiki_entry_id", artist.wiki_entry_id);

            console.log(`[Social/Spotify] Discovered: ${name} → ${searchResult.id} (${searchResult.followers} followers)`);
          }
        }
      }

      const metrics: SocialMetrics = {
        instagram_followers: igMatch?.total ?? null,
        tiktok_followers: tkMatch?.total ?? null,
        spotify_followers: spotifyFollowers,
        twitter_followers: twMatch?.total ?? null,
      };

      const hasAnyData = Object.values(metrics).some(v => v != null);
      if (!hasAnyData) { processed++; continue; }
      matched++;

      // Get previous snapshot for delta
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
          spotify_popularity: spotifyPopularity,
          spotify_source: resolvedSpotifyId ? "api" : "none",
          instagram_growth: igMatch?.growth ?? null,
          tiktok_growth: tkMatch?.growth ?? null,
          twitter_growth: twMatch?.growth ?? null,
          source: "hybrid_v3",
        },
      });

      // Update v3_scores_v2
      const { data: existing } = await sb.from("v3_scores_v2")
        .select("id")
        .eq("wiki_entry_id", artist.wiki_entry_id)
        .maybeSingle();

      if (existing) {
        await sb.from("v3_scores_v2")
          .update({ social_score: socialScore })
          .eq("id", existing.id);
      }

      processed++;
    }

    console.log(`[Social] Done: ${processed} processed, ${matched} matched, Spotify API hits: ${spotifyHits}, discovered: ${spotifyDiscovered}`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      matched,
      spotify: { apiHits: spotifyHits, newlyDiscovered: spotifyDiscovered },
      scrapePlatformCounts: Object.fromEntries(
        Object.entries(platformData).map(([k, v]) => [k, v.length])
      ),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Social] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
