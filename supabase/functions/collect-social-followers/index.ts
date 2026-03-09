// Social Followers Collector: Instagram, TikTok, Spotify
// Uses Firecrawl Search API to extract follower counts from search snippets
// Stores in ktrenz_data_snapshots (platform: "social_followers") + updates v3_scores_v2.social_score
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SocialMetrics {
  instagram_followers: number | null;
  tiktok_followers: number | null;
  spotify_followers: number | null;
}

/** Parse follower count from text like "12.5M followers", "3,456,789", "1.2K" */
function parseFollowerCount(text: string): number | null {
  // Match patterns like "12.5M", "3.4K", "1,234,567"
  const patterns = [
    /(\d+\.?\d*)\s*[Mm](?:illion)?/,
    /(\d+\.?\d*)\s*[Kk]/,
    /(\d{1,3}(?:,\d{3})+)/,
    /(\d+\.?\d*)\s*만/,
    /followers?\s*[:\-]?\s*(\d+\.?\d*)\s*[MmKk]?/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      let num = parseFloat(match[1].replace(/,/g, ""));
      if (/[Mm]/.test(match[0]) || /million/i.test(match[0])) num *= 1_000_000;
      else if (/[Kk]/.test(match[0])) num *= 1_000;
      else if (/만/.test(match[0])) num *= 10_000;
      if (num > 100) return Math.round(num); // Must be > 100 to be credible
    }
  }
  return null;
}

/** Search Firecrawl for follower count on a platform */
async function searchFollowers(
  artistName: string,
  platform: "instagram" | "tiktok" | "spotify",
  firecrawlKey: string,
): Promise<number | null> {
  const queries: Record<string, string> = {
    instagram: `"${artistName}" instagram followers 2026`,
    tiktok: `"${artistName}" tiktok followers 2026`,
    spotify: `"${artistName}" spotify monthly listeners OR followers 2026`,
  };

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: queries[platform],
        limit: 5,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[Social] Firecrawl search failed for ${artistName} ${platform}: ${resp.status} ${errText}`);
      return null;
    }

    const data = await resp.json();
    const results = data?.data || data?.results || [];

    // Extract follower counts from all result snippets
    const candidates: number[] = [];
    for (const result of results) {
      const text = `${result.title || ""} ${result.description || ""} ${result.markdown || ""}`;
      const count = parseFollowerCount(text);
      if (count) candidates.push(count);
    }

    if (candidates.length === 0) return null;

    // Return the median to avoid outliers
    candidates.sort((a, b) => a - b);
    return candidates[Math.floor(candidates.length / 2)];
  } catch (e) {
    console.error(`[Social] Search error for ${artistName} ${platform}:`, e);
    return null;
  }
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
        deltaScore = Math.round((growth / p.prev) * 1000); // growth rate scaled
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

    const body = await req.json().catch(() => ({}));
    const { wikiEntryId, artistName } = body;

    // Single artist mode
    if (wikiEntryId && artistName) {
      return await collectSingle(sb, wikiEntryId, artistName, FIRECRAWL_API_KEY);
    }

    // Batch mode: all tier-1 artists
    const { data: tier1 } = await sb.from("v3_artist_tiers").select("wiki_entry_id").eq("tier", 1);
    const tier1Ids = (tier1 || []).map((t: any) => t.wiki_entry_id).filter(Boolean);
    if (!tier1Ids.length) {
      return new Response(JSON.stringify({ success: true, message: "No tier 1 artists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: artists } = await sb.from("wiki_entries").select("id, title").in("id", tier1Ids);
    if (!artists?.length) {
      return new Response(JSON.stringify({ success: true, message: "No artists found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0, errors = 0;
    for (const artist of artists) {
      try {
        await collectSingleInternal(sb, artist.id, artist.title, FIRECRAWL_API_KEY);
        processed++;
        // Firecrawl rate limiting: 3 searches per artist, pause between artists
        if (processed % 2 === 0) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        errors++;
        console.error(`[Social] Error for ${artist.title}:`, e);
      }
    }

    return new Response(JSON.stringify({ success: true, processed, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Social] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function collectSingle(sb: any, wikiEntryId: string, artistName: string, firecrawlKey: string) {
  const result = await collectSingleInternal(sb, wikiEntryId, artistName, firecrawlKey);
  return new Response(JSON.stringify({ success: true, ...result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function collectSingleInternal(sb: any, wikiEntryId: string, artistName: string, firecrawlKey: string) {
  console.log(`[Social] Collecting for ${artistName}...`);

  // Fetch all 3 platforms in parallel
  const [instagram, tiktok, spotify] = await Promise.all([
    searchFollowers(artistName, "instagram", firecrawlKey),
    searchFollowers(artistName, "tiktok", firecrawlKey),
    searchFollowers(artistName, "spotify", firecrawlKey),
  ]);

  const metrics: SocialMetrics = {
    instagram_followers: instagram,
    tiktok_followers: tiktok,
    spotify_followers: spotify,
  };

  console.log(`[Social] ${artistName}: IG=${instagram?.toLocaleString() ?? "N/A"}, TikTok=${tiktok?.toLocaleString() ?? "N/A"}, Spotify=${spotify?.toLocaleString() ?? "N/A"}`);

  // Get previous snapshot for delta calculation
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: prevSnap } = await sb.from("ktrenz_data_snapshots")
    .select("metrics")
    .eq("wiki_entry_id", wikiEntryId)
    .eq("platform", "social_followers")
    .lte("collected_at", oneDayAgo)
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevMetrics: SocialMetrics | null = prevSnap?.metrics ? {
    instagram_followers: prevSnap.metrics.instagram_followers ?? null,
    tiktok_followers: prevSnap.metrics.tiktok_followers ?? null,
    spotify_followers: prevSnap.metrics.spotify_followers ?? null,
  } : null;

  const socialScore = calculateSocialScore(metrics, prevMetrics);

  // Store snapshot
  await sb.from("ktrenz_data_snapshots").insert({
    wiki_entry_id: wikiEntryId,
    platform: "social_followers",
    metrics,
  });

  // Update v3_scores_v2
  const { data: existing } = await sb.from("v3_scores_v2")
    .select("id")
    .eq("wiki_entry_id", wikiEntryId)
    .maybeSingle();

  if (existing) {
    await sb.from("v3_scores_v2")
      .update({ social_score: socialScore })
      .eq("id", existing.id);
  }

  console.log(`[Social] ${artistName} → score=${socialScore}`);

  return { artistName, metrics, socialScore };
}
