// Social Followers Collector v2: kpop-radar.com Scrape
// Scrapes ranking pages from kpop-radar.com for Instagram, Twitter/X, TikTok, Spotify
// Stores in ktrenz_data_snapshots (platform: "social_followers") + updates v3_scores_v2.social_score
// Uses only 4 Firecrawl credits per run (1 per platform page) instead of 150+
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

const PLATFORMS = [
  { key: "instagram", url: "https://www.kpop-radar.com/instagram" },
  { key: "twitter", url: "https://www.kpop-radar.com/twitter" },
  { key: "tiktok", url: "https://www.kpop-radar.com/tiktok" },
  { key: "spotify", url: "https://www.kpop-radar.com/spotify" },
] as const;

/** Parse kpop-radar markdown ranking page into structured entries */
function parseRankingPage(markdown: string): PlatformEntry[] {
  const entries: PlatformEntry[] = [];
  const lines = markdown.split("\n");

  let currentRank = 0;
  let currentName = "";
  let numbers: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect rank line: "- 1", "- 23", etc.
    const rankMatch = line.match(/^-\s+(\d+)$/);
    if (rankMatch) {
      // Save previous entry if valid
      if (currentRank > 0 && currentName && numbers.length >= 2) {
        entries.push({
          rank: currentRank,
          artistName: currentName,
          growth: numbers[0],
          total: numbers[1],
        });
      }
      currentRank = parseInt(rankMatch[1], 10);
      currentName = "";
      numbers = [];
      continue;
    }

    // Detect artist name from image alt or bold text
    // Pattern: **아티스트명** or [**아티스트명**](link)
    const nameMatch = line.match(/\*\*(.+?)\*\*/);
    if (nameMatch && currentRank > 0 && !currentName) {
      currentName = nameMatch[1];
      continue;
    }

    // Detect numeric values (growth and total)
    if (currentRank > 0 && currentName) {
      const numMatch = line.match(/^[\s]*([0-9,]+)[\s]*$/);
      if (numMatch) {
        const num = parseInt(numMatch[1].replace(/,/g, ""), 10);
        if (!isNaN(num) && numbers.length < 2) {
          numbers.push(num);
        }
      }
    }
  }

  // Don't forget the last entry
  if (currentRank > 0 && currentName && numbers.length >= 2) {
    entries.push({
      rank: currentRank,
      artistName: currentName,
      growth: numbers[0],
      total: numbers[1],
    });
  }

  return entries;
}

/** Scrape a kpop-radar platform page using Firecrawl */
async function scrapePlatform(
  firecrawlKey: string,
  platformUrl: string,
): Promise<PlatformEntry[]> {
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: platformUrl,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[Social] Firecrawl scrape failed for ${platformUrl}: ${resp.status} ${errText}`);
    throw new Error(`Firecrawl error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const markdown = data?.data?.markdown || data?.markdown || "";

  if (!markdown) {
    console.warn(`[Social] Empty markdown for ${platformUrl}`);
    return [];
  }

  const entries = parseRankingPage(markdown);
  console.log(`[Social] Parsed ${entries.length} entries from ${platformUrl}`);
  return entries;
}

/** Normalize artist name for matching: lowercase, remove special chars */
function normalizeName(name: string): string {
  // Extract English name from patterns like "필릭스 (Stray Kids)" or "TWICE (트와이스)"
  const parenMatch = name.match(/\(([^)]+)\)/);
  const mainName = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const parenName = parenMatch?.[1]?.trim() || "";

  // Return both normalized forms for matching
  return `${mainName}|${parenName}`.toLowerCase().replace(/[^a-z0-9가-힣|]/g, "");
}

/** Calculate social score from follower metrics with delta model */
function calculateSocialScore(
  current: SocialMetrics,
  previous: SocialMetrics | null,
): number {
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

    // Base score: log-scaled absolute followers
    const baseScore = Math.log10(p.current) * 100;

    // Delta score: growth since last snapshot
    let deltaScore = 0;
    if (p.prev != null && p.prev > 0) {
      const growth = p.current - p.prev;
      if (growth > 0) {
        deltaScore = Math.round((growth / p.prev) * 1000);
      }
    }

    const platformScore = (baseScore * 0.3 + Math.max(deltaScore, baseScore * 0.1) * 0.7) * p.weight;
    totalScore += platformScore;
  }

  return activeCount > 0 ? Math.round(totalScore / activeCount) : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    console.log("[Social] Starting kpop-radar scrape collection...");

    // Step 1: Scrape all 4 platform pages (4 Firecrawl credits total)
    const platformData: Record<string, PlatformEntry[]> = {};
    for (const platform of PLATFORMS) {
      try {
        platformData[platform.key] = await scrapePlatform(FIRECRAWL_API_KEY, platform.url);
      } catch (e) {
        console.error(`[Social] Failed to scrape ${platform.key}:`, e.message);
        platformData[platform.key] = [];
      }
      // Small delay between scrapes
      await new Promise(r => setTimeout(r, 500));
    }

    const totalScraped = Object.values(platformData).reduce((s, v) => s + v.length, 0);
    console.log(`[Social] Total scraped entries: ${totalScraped}`);

    // Step 2: Get all tier-1 artists for matching
    const { data: tier1 } = await sb.from("v3_artist_tiers").select("wiki_entry_id").eq("tier", 1);
    const tier1Ids = (tier1 || []).map((t: any) => t.wiki_entry_id).filter(Boolean);
    if (!tier1Ids.length) {
      return new Response(JSON.stringify({ success: true, message: "No tier 1 artists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: artists } = await sb.from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko")
      .eq("tier", 1);

    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Build lookup maps from scraped data (normalized name → entry)
    const platformLookups: Record<string, Map<string, PlatformEntry>> = {};
    for (const [key, entries] of Object.entries(platformData)) {
      const lookup = new Map<string, PlatformEntry>();
      for (const entry of entries) {
        const normalized = normalizeName(entry.artistName);
        // Store under all name variants
        for (const variant of normalized.split("|").filter(Boolean)) {
          if (variant) lookup.set(variant, entry);
        }
      }
      platformLookups[key] = lookup;
    }

    // Step 4: Match and store for each artist
    let processed = 0, matched = 0;
    for (const artist of artists) {
      const name = artist.display_name || "";
      const nameKo = (artist as any).name_ko || "";
      if (!name && !nameKo) continue;

      // Build all name variants for matching (display_name + name_ko)
      const allVariants: string[] = [];
      if (name) {
        const normalized = normalizeName(name);
        allVariants.push(...normalized.split("|").filter(Boolean));
      }
      if (nameKo) {
        const normalizedKo = normalizeName(nameKo);
        allVariants.push(...normalizedKo.split("|").filter(Boolean));
      }

      // Find matches across platforms
      const findMatch = (lookup: Map<string, PlatformEntry>): PlatformEntry | null => {
        for (const variant of variants) {
          const match = lookup.get(variant);
          if (match) return match;
        }
        // Fallback: partial matching
        for (const [key, entry] of lookup.entries()) {
          for (const variant of variants) {
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
      const spMatch = findMatch(platformLookups.spotify || new Map());

      const metrics: SocialMetrics = {
        instagram_followers: igMatch?.total ?? null,
        tiktok_followers: tkMatch?.total ?? null,
        spotify_followers: spMatch?.total ?? null,
        twitter_followers: twMatch?.total ?? null,
      };

      const hasAnyData = Object.values(metrics).some(v => v != null);
      if (!hasAnyData) {
        processed++;
        continue;
      }

      matched++;

      // Get previous snapshot for delta calculation
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

      // Store snapshot (includes growth data from kpop-radar)
      await sb.from("ktrenz_data_snapshots").insert({
        wiki_entry_id: artist.wiki_entry_id,
        platform: "social_followers",
        metrics: {
          ...metrics,
          instagram_growth: igMatch?.growth ?? null,
          tiktok_growth: tkMatch?.growth ?? null,
          spotify_growth: spMatch?.growth ?? null,
          twitter_growth: twMatch?.growth ?? null,
          source: "kpop-radar",
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

    console.log(`[Social] Done: ${processed} processed, ${matched} matched, credits used: ~4`);

    return new Response(JSON.stringify({
      success: true,
      processed,
      matched,
      creditsUsed: Object.keys(platformData).filter(k => platformData[k].length > 0).length,
      platformCounts: Object.fromEntries(
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
