// ktrenz-h1-refresh-stats — Refresh engagement_score for items in active
// (unresolved) drops so growth tracking actually has a signal.
//
// Why this exists: content-search inserts a new b2_items row per scrape run,
// but YouTube search results are keyword + date-sorted, so a given video URL
// is rarely re-scraped after its first appearance. That means the row's
// engagement_score is frozen from day-1 and `growth_ratio = (now - drop) /
// drop` collapses to 0 at resolve time → viral picks are random.
//
// This function fetches live stats for active drop items and updates
// engagement_score on the original row:
//   - YouTube: videos.list (1 quota per 50 videos)
//   - TikTok / IG: not yet — RapidAPI cost prohibitive at refresh scale
//   - Naver: skipped (resolve-drop already computes growth from article count)
//
// Triggered daily by cron + on-demand at resolve start.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(shorts|embed|v)\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[2];
    return null;
  } catch { return null; }
}

async function refreshYouTube(
  client: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<{ checked: number; updated: number }> {
  // Pull unique YT items from unresolved drops.
  const { data: drops, error: dErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("item_id, ktrenz_b2_items!inner(id, url, source, engagement_score)")
    .eq("resolved", false);
  if (dErr) throw dErr;
  const items = ((drops ?? []) as any[])
    .map((d) => d.ktrenz_b2_items)
    .filter((i: any) => i?.source === "youtube" && i?.url);
  const uniqueById = new Map<string, any>();
  for (const i of items) uniqueById.set(i.id, i);
  const list = [...uniqueById.values()];
  if (list.length === 0) return { checked: 0, updated: 0 };

  // Build videoId → item rows map (multiple rows may share same videoId
  // across runs — we'll bump them all to the new score).
  const idToItems = new Map<string, any[]>();
  for (const it of list) {
    const vid = extractYouTubeId(it.url);
    if (!vid) continue;
    const arr = idToItems.get(vid) ?? [];
    arr.push(it);
    idToItems.set(vid, arr);
  }
  const videoIds = [...idToItems.keys()];
  if (videoIds.length === 0) return { checked: 0, updated: 0 };

  let updated = 0;
  // videos.list takes up to 50 ids per call.
  for (let off = 0; off < videoIds.length; off += 50) {
    const batch = videoIds.slice(off, off + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`[refresh-stats] YT videos.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    for (const v of (data.items ?? []) as any[]) {
      const vid = v.id as string;
      const views = Number(v.statistics?.viewCount ?? 0);
      const likes = Number(v.statistics?.likeCount ?? 0);
      const comments = Number(v.statistics?.commentCount ?? 0);
      const score = Math.max(views, 0);
      const rows = idToItems.get(vid) ?? [];
      for (const it of rows) {
        if (it.engagement_score === score) continue;
        const { error: uErr } = await client
          .from("ktrenz_b2_items")
          .update({
            engagement_score: score,
            metadata: { views, likes, comments, refreshed_at: new Date().toISOString() },
          })
          .eq("id", it.id);
        if (!uErr) updated += 1;
      }
    }
  }
  return { checked: list.length, updated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ytKey = Deno.env.get("YOUTUBE_API_KEY") || Deno.env.get("YT_KEY");
    if (!ytKey) throw new Error("YOUTUBE_API_KEY not configured");
    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const yt = await refreshYouTube(client, ytKey);
    return new Response(
      JSON.stringify({ ok: true, youtube: yt }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refresh-stats]", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
