// ktrenz-h1-curate-drop — Today's Drop curation for Discover (h1).
//
// Selects ~N=24 candidate contents from ktrenz_b2_items, applies the
// blended score + per-artist cap from PRD §7, and writes rows to
// ktrenz_h1_daily_drop for the current date / region.
//
// Idempotent: re-runs leave existing rows alone via the (drop_date, region,
// item_id) unique constraint, only filling gaps.
//
// Caller: daily cron (Supabase Scheduled Function) or manual trigger.
// Auth: requires service-role key — never callable from public clients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DROP_SIZE = 24;            // matches client DROP_SIZE — keep in sync
const PER_ARTIST_CAP = 2;        // PRD §7
const LOOKBACK_HOURS = 72;       // PRD §7: last 72h
const FETCH_POOL_SIZE = 200;     // headroom for dedupe + cap filter
const RESOLUTION_DAYS = 7;       // resolve_at = drop_date + 7d

type Item = {
  id: string;
  source: string;
  star_id: string;
  engagement_score: number | null;
  published_at: string | null;
  thumbnail: string | null;
  has_thumbnail: boolean;
};

function freshnessFactor(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return 0;
  const hoursAgo = (Date.now() - t) / 3_600_000;
  return Math.max(0, 1 - hoursAgo / LOOKBACK_HOURS);
}

function todayDateUTC(): string {
  // YYYY-MM-DD in UTC. Drop schedule is currently UTC-based; switch to
  // region-local when we add regional staggering (PRD §7 open question).
  return new Date().toISOString().slice(0, 10);
}

async function curateForRegion(
  client: ReturnType<typeof createClient>,
  region: string,
  dropDate: string,
) {
  // 1. Pull candidate pool — recent, has thumbnail, exclude blog sources.
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data: pool, error: poolErr } = await client
    .from("ktrenz_b2_items")
    .select("id, source, star_id, engagement_score, published_at, thumbnail, has_thumbnail")
    .eq("has_thumbnail", true)
    .neq("source", "naver_blog")
    .not("thumbnail", "is", null)
    .gte("created_at", sinceIso)
    .order("engagement_score", { ascending: false, nullsFirst: false })
    .limit(FETCH_POOL_SIZE);

  if (poolErr) throw poolErr;
  if (!pool || pool.length === 0) {
    return { region, dropDate, inserted: 0, skipped: 0, total: 0, reason: "empty pool" };
  }

  const items = pool as unknown as Item[];

  // 2. Blended score: engagement (normalized) + freshness.
  // PRD §7 also wants 0.3× velocity_24h, but that column doesn't exist yet —
  // engagement_score is itself updated by collectors and acts as a proxy
  // (close to integral of velocity over the lookback window).
  const maxEng = Math.max(1, ...items.map((i) => i.engagement_score ?? 0));
  type Scored = Item & { score: number };
  const scored: Scored[] = items.map((i) => ({
    ...i,
    score:
      0.7 * ((i.engagement_score ?? 0) / maxEng) +
      0.3 * freshnessFactor(i.published_at),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 3. Per-artist cap — preserve variety.
  const perArtist = new Map<string, number>();
  const seenItems = new Set<string>();
  const picks: Scored[] = [];
  for (const s of scored) {
    if (seenItems.has(s.id)) continue;
    const count = perArtist.get(s.star_id) ?? 0;
    if (count >= PER_ARTIST_CAP) continue;
    perArtist.set(s.star_id, count + 1);
    seenItems.add(s.id);
    picks.push(s);
    if (picks.length >= DROP_SIZE) break;
  }

  if (picks.length === 0) {
    return { region, dropDate, inserted: 0, skipped: 0, total: 0, reason: "no picks" };
  }

  // 4. Determine starting cohort_rank — append after any pre-existing drops
  // (lazy-created via record_vouch, or a partial earlier curation run).
  const { data: existing, error: existErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("cohort_rank, item_id")
    .eq("drop_date", dropDate)
    .eq("region", region);
  if (existErr) throw existErr;

  const existingItemIds = new Set((existing ?? []).map((r: any) => r.item_id as string));
  const startRank = (existing ?? []).reduce((m: number, r: any) => Math.max(m, r.cohort_rank ?? 0), 0) + 1;

  const resolutionAt = new Date(`${dropDate}T00:00:00Z`);
  resolutionAt.setUTCDate(resolutionAt.getUTCDate() + RESOLUTION_DAYS);

  const rows = picks
    .filter((p) => !existingItemIds.has(p.id))
    .map((p, idx) => ({
      drop_date: dropDate,
      region,
      item_id: p.id,
      cohort_rank: startRank + idx,
      resolution_at: resolutionAt.toISOString(),
    }));

  if (rows.length === 0) {
    return { region, dropDate, inserted: 0, skipped: picks.length, total: existingItemIds.size };
  }

  const { error: insErr, data: inserted } = await client
    .from("ktrenz_h1_daily_drop")
    .insert(rows)
    .select("id");
  if (insErr) throw insErr;

  return {
    region,
    dropDate,
    inserted: inserted?.length ?? 0,
    skipped: picks.length - rows.length,
    total: existingItemIds.size + (inserted?.length ?? 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !serviceKey) throw new Error("Missing Supabase env");

    const client = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Optional override from request body (manual triggers). Default = today/global.
    let dropDate = todayDateUTC();
    let regions = ["global"];
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body.drop_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.drop_date)) {
          dropDate = body.drop_date;
        }
        if (Array.isArray(body.regions) && body.regions.length > 0) {
          regions = body.regions.filter((r: unknown) => typeof r === "string");
        }
      } catch { /* no body — use defaults */ }
    }

    const results = [];
    for (const region of regions) {
      results.push(await curateForRegion(client, region, dropDate));
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[h1-curate-drop] failed:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
