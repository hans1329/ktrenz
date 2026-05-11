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
// 1 item per artist per day — highest-scoring representative wins. Avoids
// "두 카드 모두 세븐틴" 케이스. Diversity > coverage for daily snap-drop.
const PER_ARTIST_CAP = 1;
const LOOKBACK_HOURS = 72;       // PRD §7: last 72h
const FETCH_POOL_SIZE = 200;     // headroom for dedupe + cap filter
const RESOLUTION_DAYS = 7;       // resolve_at = drop_date + 7d
// Cross-day dedup horizon. Items used in any drop within this many days
// (regardless of resolution status) are excluded from today's curation so
// users don't see the same 24 cards every morning. 7d covers a full
// resolution cycle — once a round resolves, the item is fair game again.
const CROSS_DAY_DEDUP_DAYS = 7;

type Item = {
  id: string;
  source: string;
  star_id: string;
  title: string;
  engagement_score: number | null;
  published_at: string | null;
  thumbnail: string | null;
  has_thumbnail: boolean;
};

// Token-set fingerprint for cross-source duplicate detection. Strips
// punctuation, lowercases (cheap proxy for Korean), keeps tokens with ≥2
// characters. Two items reporting the same event from Naver News + YouTube +
// Naver Blog typically share most named entities (artist, event name).
function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const DUP_THRESHOLD = 0.3;     // ≥30% Jaccard within same artist = duplicate

// Naver/CDN often deliver the same photo from different URL paths. Strip the
// query string + the file extension hash so /image/abc123_v2.jpg?w=400 and
// /image/abc123.jpg?w=200 collapse to the same fingerprint.
function thumbprint(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.host + u.pathname).toLowerCase();
  } catch {
    return url.split("?")[0].toLowerCase();
  }
}

// Looser fingerprint: just the last path segment (filename) — matches the
// same image hosted under different CDN hosts/paths. Naver/Daum/news outlets
// frequently mirror the same press image with different prefixes but
// identical filenames.
function filenameFingerprint(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    return last.length >= 6 ? last.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Same star_id + same published date = same event in 99%+ of K-pop coverage
// (artists rarely have two distinct news cycles within a single day). Compare
// dates in UTC for cross-source consistency.
function publishedDay(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10); // YYYY-MM-DD
}

// Deny-list of hashtags that strongly signal non-K-pop content. The scraper
// occasionally misassociates a TikTok/IG post to a star_id (often via fuzzy
// name matches) — these tags are the most common tell-tales. Defensive filter:
// if any of these tags appear in the title, drop the item.
const OFF_TOPIC_TAGS = new Set([
  // cars / motorsport
  "jdm", "drift", "drifting", "drifter", "cars", "carlife", "carmods",
  "carmod", "automotive", "racing", "motorsport", "ebisu", "track",
  "supra", "honda", "nissan", "toyota", "bmw", "mustang", "tuning",
  // gaming / dev
  "gaming", "gamedev", "esports", "valorant", "fortnite", "pubg", "lol",
  "leagueoflegends", "dota", "csgo", "fps",
  // adult / unrelated commercial
  "casino", "bet", "crypto", "nft", "forex", "stocks",
  // sports leagues
  "nba", "nfl", "mlb", "ncaa", "uefa", "premierleague",
]);

function hasOffTopicTag(title: string): boolean {
  if (!title) return false;
  const tags = title.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return tags.some((tag) => OFF_TOPIC_TAGS.has(tag.slice(1).toLowerCase()));
}

function freshnessFactor(publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return 0;
  const hoursAgo = (Date.now() - t) / 3_600_000;
  return Math.max(0, 1 - hoursAgo / LOOKBACK_HOURS);
}

function todayDateKST(): string {
  // YYYY-MM-DD in KST (UTC+9). Daily reset aligns with the user-facing
  // calendar day for KR audience. When we add regional staggering, swap
  // this for a region→TZ lookup.
  const kstMs = Date.now() + 9 * 3_600_000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

async function curateForRegion(
  client: ReturnType<typeof createClient>,
  region: string,
  dropDate: string,
) {
  // 1. Pull candidate pool — recent CONTENT (published_at), has thumbnail,
  // exclude blog sources. Filter on published_at, not created_at: scrapers
  // can backfill old content (2-month-old IG posts etc.) which would pass
  // a created_at filter but isn't actually a trend signal.
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data: pool, error: poolErr } = await client
    .from("ktrenz_b2_items")
    .select("id, source, star_id, title, engagement_score, published_at, thumbnail, has_thumbnail")
    .eq("has_thumbnail", true)
    .neq("source", "naver_blog")
    .not("thumbnail", "is", null)
    .not("published_at", "is", null)
    .gte("published_at", sinceIso)
    .order("engagement_score", { ascending: false, nullsFirst: false })
    .limit(FETCH_POOL_SIZE);

  if (poolErr) throw poolErr;
  if (!pool || pool.length === 0) {
    return { region, dropDate, inserted: 0, skipped: 0, total: 0, reason: "empty pool" };
  }

  // Pull item_ids used in any drop within the cross-day dedup window so we
  // can exclude them. Otherwise the daily top-by-engagement_score gives
  // near-identical 24 cards across consecutive mornings — users complained
  // that "오늘 컨텐츠가 어제랑 겹친다".
  const dedupSinceDate = new Date(`${dropDate}T00:00:00Z`);
  dedupSinceDate.setUTCDate(dedupSinceDate.getUTCDate() - CROSS_DAY_DEDUP_DAYS);
  const dedupSinceIso = dedupSinceDate.toISOString().slice(0, 10);
  const { data: recentDrops, error: recentErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("item_id")
    .eq("region", region)
    .gte("drop_date", dedupSinceIso)
    .lt("drop_date", dropDate);
  if (recentErr) throw recentErr;
  const recentlyUsedIds = new Set<string>(
    (recentDrops ?? []).map((r: any) => r.item_id as string),
  );

  // Pull EXISTING items already in today's drop (kept from prior runs via
  // vouches). Need to seed the dedup signature sets so a new candidate
  // matching an existing item's image/title/star-date gets skipped — the
  // "Seventeen Dino dup" case where one survives DELETE+regen because of a
  // vouch, and the gap fill brings in a near-identical sibling.
  const { data: existingForDedup, error: existDedupErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("item_id, ktrenz_b2_items!inner(id, star_id, title, published_at, thumbnail)")
    .eq("drop_date", dropDate)
    .eq("region", region);
  if (existDedupErr) throw existDedupErr;
  type ExistingItem = {
    id: string;
    star_id: string;
    title: string | null;
    published_at: string | null;
    thumbnail: string | null;
  };
  const existingItems: ExistingItem[] = (existingForDedup ?? [])
    .map((r: any) => r.ktrenz_b2_items as ExistingItem)
    .filter(Boolean);

  // Pre-filter: off-topic hashtags + already-used-recently.
  const items = (pool as unknown as Item[])
    .filter((i) => !hasOffTopicTag(i.title ?? ""))
    .filter((i) => !recentlyUsedIds.has(i.id));

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

  // 3. Cross-source dedup + per-artist cap. Three orthogonal dup signals
  //    layered defensively (any one matching = drop the lower-scored item):
  //      a) Same thumbnail fingerprint (host+path) — same photo from CDN
  //      b) Same star_id + same published date — same news cycle
  //      c) Title token Jaccard ≥ 0.3 within same star — same event,
  //         different outlets
  //    Walk scored items high→low so the highest-scoring representative
  //    survives. Per-artist cap then limits total picks per star.
  const perArtist = new Map<string, number>();
  const seenItems = new Set<string>();
  const seenThumbs = new Set<string>();
  const seenFilenames = new Set<string>();
  const seenStarDate = new Set<string>();
  const allPickedTokens: Set<string>[] = [];
  const pickedTokensByStar = new Map<string, Set<string>[]>();

  // Seed dedup signatures with EXISTING today's drop items so the new gap
  // fill doesn't insert siblings of items already kept (e.g. via vouch).
  for (const e of existingItems) {
    seenItems.add(e.id);
    const etp = thumbprint(e.thumbnail);
    if (etp) seenThumbs.add(etp);
    const efn = filenameFingerprint(e.thumbnail);
    if (efn) seenFilenames.add(efn);
    const eday = publishedDay(e.published_at);
    if (eday && e.star_id) seenStarDate.add(`${e.star_id}|${eday}`);
    const etokens = titleTokens(e.title ?? "");
    if (etokens.size > 0) {
      allPickedTokens.push(etokens);
      if (e.star_id) {
        const prior = pickedTokensByStar.get(e.star_id) ?? [];
        pickedTokensByStar.set(e.star_id, [...prior, etokens]);
      }
    }
    if (e.star_id) {
      perArtist.set(e.star_id, (perArtist.get(e.star_id) ?? 0) + 1);
    }
  }

  const picks: Scored[] = [];
  for (const s of scored) {
    if (seenItems.has(s.id)) continue;
    const tp = thumbprint(s.thumbnail);
    if (tp && seenThumbs.has(tp)) continue;
    const fn = filenameFingerprint(s.thumbnail);
    if (fn && seenFilenames.has(fn)) continue;
    const day = publishedDay(s.published_at);
    const starDateKey = day ? `${s.star_id}|${day}` : null;
    if (starDateKey && seenStarDate.has(starDateKey)) continue;
    const tokens = titleTokens(s.title ?? "");
    // Cross-artist title Jaccard — catches same-event coverage tagged to
    // different stars. Same threshold as per-star to keep behavior
    // predictable.
    if (allPickedTokens.some((p) => jaccard(tokens, p) >= DUP_THRESHOLD)) continue;
    const priorTokens = pickedTokensByStar.get(s.star_id) ?? [];
    if (priorTokens.some((p) => jaccard(tokens, p) >= DUP_THRESHOLD)) continue;
    const count = perArtist.get(s.star_id) ?? 0;
    if (count >= PER_ARTIST_CAP) continue;
    perArtist.set(s.star_id, count + 1);
    pickedTokensByStar.set(s.star_id, [...priorTokens, tokens]);
    allPickedTokens.push(tokens);
    if (tp) seenThumbs.add(tp);
    if (fn) seenFilenames.add(fn);
    if (starDateKey) seenStarDate.add(starDateKey);
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

  // Cohort is bounded at DROP_SIZE total. lazy-created rows from record_vouch
  // count against this cap, so we only fill the remaining gap. Prevents the
  // drop from inflating past 24 (e.g. 28 if 4 lazy items existed pre-cron).
  const remainingSlots = Math.max(0, DROP_SIZE - existingItemIds.size);
  const rows = picks
    .filter((p) => !existingItemIds.has(p.id))
    .slice(0, remainingSlots)
    .map((p, idx) => ({
      drop_date: dropDate,
      region,
      item_id: p.id,
      cohort_rank: startRank + idx,
      resolution_at: resolutionAt.toISOString(),
      // Snapshot the engagement_score at drop time. resolve-drop computes
      // growth_ratio against this baseline so winners are "biggest climbers"
      // instead of "biggest channels". Without this, well-established artists
      // would deterministically win every round.
      views_at_drop: Math.max(0, Math.floor(p.engagement_score ?? 0)),
    }));

  if (rows.length === 0) {
    return { region, dropDate, inserted: 0, skipped: picks.length, total: existingItemIds.size };
  }

  const { error: insErr, data: inserted } = await client
    .from("ktrenz_h1_daily_drop")
    .insert(rows)
    .select("id");
  if (insErr) throw insErr;

  // ── Pre-warm Instagram media cache ─────────────────────────────────
  // For IG picks, kick off resolver calls in the background so the DB
  // cache is warm by the time users open the drop. Fire-and-forget, with
  // small delay between requests to avoid RapidAPI rate limits.
  const igPicks = picks.filter((p) => p.source === "instagram" && p.url);
  if (igPicks.length > 0) {
    prewarmIgCache(client, igPicks).catch((err) =>
      console.warn(`[curate-drop] IG prewarm failed:`, err.message),
    );
  }

  return {
    region,
    dropDate,
    inserted: inserted?.length ?? 0,
    skipped: picks.length - rows.length,
    ig_prewarm: igPicks.length,
    total: existingItemIds.size + (inserted?.length ?? 0),
  };
}

// Prewarm Instagram media cache in the background. Each call to
// ktrenz-instagram-media writes to ktrenz_h1_ig_media_cache on success.
// Sequential (not parallel) to avoid hammering RapidAPI rate limits.
async function prewarmIgCache(
  client: ReturnType<typeof createClient>,
  igPicks: Array<{ id: string; star_id: string; url: string }>,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let warmed = 0;
  for (const p of igPicks) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/ktrenz-instagram-media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ star_id: p.star_id, item_url: p.url, item_id: p.id }),
      });
      if (res.ok) warmed += 1;
    } catch (err) {
      console.warn(`[curate-drop] IG prewarm item=${p.id} failed:`, (err as Error).message);
    }
    // 250ms gap between calls — keeps under typical RapidAPI rate limits
    await new Promise((r) => setTimeout(r, 250));
  }
  console.info(`[curate-drop] IG prewarm: ${warmed}/${igPicks.length} cached`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !serviceKey) throw new Error("Missing Supabase env");

    const client = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Optional override from request body (manual triggers). Default = today/global.
    let dropDate = todayDateKST();
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
