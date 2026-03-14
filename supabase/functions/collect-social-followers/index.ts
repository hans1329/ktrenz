// Social Followers Collector v5: kpop-radar Full Scrape (4 platforms)
// All platforms (Instagram, Twitter/X, TikTok, Spotify) from kpop-radar.com
// Stores in ktrenz_data_snapshots (platform: "social_followers") + updates v3_scores_v2.social_score
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PlatformEntry { rank: number; artistName: string; growth: number; total: number; }
interface SocialMetrics { instagram_followers: number | null; tiktok_followers: number | null; spotify_followers: number | null; twitter_followers: number | null; }

const SCRAPE_PLATFORMS = [
  { key: "instagram", url: "https://www.kpop-radar.com/instagram" },
  { key: "twitter", url: "https://www.kpop-radar.com/twitter" },
  { key: "tiktok", url: "https://www.kpop-radar.com/tiktok" },
  { key: "spotify", url: "https://www.kpop-radar.com/spotify" },
] as const;

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
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    console.log(`[Social] Starting kpop-radar full scrape (4 platforms)...`);

    // Step 1: Scrape all 4 platforms sequentially (avoid rate limit)
    const platformData: Record<string, PlatformEntry[]> = {};
    for (const platform of SCRAPE_PLATFORMS) {
      try { platformData[platform.key] = await scrapePlatform(FIRECRAWL_API_KEY, platform.url); }
      catch (e) { console.error(`[Social] Scrape ${platform.key} failed:`, e.message); platformData[platform.key] = []; }
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[Social] Scraped totals: ${Object.entries(platformData).map(([k, v]) => `${k}=${v.length}`).join(", ")}`);

    // Step 2: Get tier-1 artists
    const { data: artists } = await sb.from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, name_ko")
      .eq("tier", 1);
    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Build scrape lookup maps
    const platformLookups: Record<string, Map<string, PlatformEntry>> = {};
    for (const [key, entries] of Object.entries(platformData)) {
      const lookup = new Map<string, PlatformEntry>();
      for (const entry of entries) {
        for (const variant of normalizeName(entry.artistName).split("|").filter(Boolean))
          if (variant) lookup.set(variant, entry);
      }
      platformLookups[key] = lookup;
    }

    // Step 4: Process each artist
    let processed = 0, matched = 0;

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
      const spMatch = findMatch(platformLookups.spotify || new Map());

      const metrics: SocialMetrics = {
        instagram_followers: igMatch?.total ?? null,
        tiktok_followers: tkMatch?.total ?? null,
        spotify_followers: spMatch?.total ?? null,
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
          instagram_growth: igMatch?.growth ?? null,
          tiktok_growth: tkMatch?.growth ?? null,
          twitter_growth: twMatch?.growth ?? null,
          spotify_growth: spMatch?.growth ?? null,
          source: "kpop_radar_v5",
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

    console.log(`[Social] Done: ${processed} processed, ${matched} matched`);

    return new Response(JSON.stringify({
      success: true, processed, matched,
      platformCounts: Object.fromEntries(Object.entries(platformData).map(([k, v]) => [k, v.length])),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[Social] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
