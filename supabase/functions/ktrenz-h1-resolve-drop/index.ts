// ktrenz-h1-resolve-drop — Resolves Discover (h1) drops past their 7-day
// window: marks each item as viral / not viral by cohort percentile, scores
// every vouch, and aggregates daily leaderboard rows.
//
// Caller: hourly cron (or manual trigger). Idempotent — only touches drops
// where resolution_at <= now() AND resolved = false.
//
// Scoring formulas (revised 2026-05-11 — payout multiplier doubled):
//   confidence_weight: low 0.5 · mid 1.0 · high 2.0
//   outcome_mult: hit +1.0 · miss -0.5  (weight-scaled — high stakes both ways)
//   final_score = confidence_weight × outcome_mult
//   k_cash      = floor(final_score × 20)            -- doubled from ×10. Tier
//                                                       hits now pay 10/20/40 💎
//                                                       (was 5/10/20). Misses
//                                                       cost 5/10/20 (was 2/5/10).
//
// Why no time_decay: trend prediction is snap-judgment, not observation
// over time. The early-bird ×3 / late ×0.3 multiplier didn't match the
// game's mental model. Users now edit picks daily (record_vouch unlocked
// across all open rounds) without any timing penalty.
//
// Wallet integration (decided 2026-05-09):
//   Each resolved vouch writes a row to ktrenz_point_transactions
//   (reason='h1_hit' | 'h1_miss'). The trg_ktrenz_credit_points trigger sums
//   amounts into ktrenz_user_points.points. Misses are clamped so the user
//   never goes negative (max loss = current balance).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIRAL_PERCENTILE = 0.3;     // top 30% of cohort = viral
const HIT_MULT = 1.0;
const MISS_MULT = -0.5;

const CONFIDENCE_WEIGHT: Record<string, number> = { low: 0.5, mid: 1.0, high: 2.0 };

type Drop = {
  id: string;
  drop_date: string;
  region: string;
  item_id: string;
  cohort_rank: number;
};

type Vouch = {
  id: string;
  user_id: string;
  drop_id: string;
  confidence: string;
  vouched_at: string;
};

async function resolveCohort(
  client: ReturnType<typeof createClient>,
  dropDate: string,
  region: string,
): Promise<{ drops: number; vouches: number }> {
  // 1. Pull all unresolved drops in this cohort (drop_date + region).
  const { data: dropsData, error: dropsErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("id, drop_date, region, item_id, cohort_rank")
    .eq("drop_date", dropDate)
    .eq("region", region)
    .eq("resolved", false);
  if (dropsErr) throw dropsErr;
  const drops = (dropsData ?? []) as unknown as Drop[];
  if (drops.length === 0) return { drops: 0, vouches: 0 };

  // 2. Fetch current engagement_score for each item.
  const itemIds = drops.map((d) => d.item_id);
  const { data: items, error: itemsErr } = await client
    .from("ktrenz_b2_items")
    .select("id, engagement_score")
    .in("id", itemIds);
  if (itemsErr) throw itemsErr;
  const scoreMap = new Map<string, number>(
    (items ?? []).map((i: any) => [i.id as string, Number(i.engagement_score ?? 0)]),
  );

  // 3. Rank cohort by current score; lower percentile = better rank.
  const ranked = drops
    .map((d) => ({ ...d, current_score: scoreMap.get(d.item_id) ?? 0 }))
    .sort((a, b) => b.current_score - a.current_score);
  const N = ranked.length;

  const resolutions = ranked.map((d, i) => {
    const percentile = (i + 1) / N;
    return {
      drop_id: d.id,
      views_at_drop: null as number | null, // not snapshotted — see PRD §6 v1 simplification
      views_at_resolve: d.current_score,
      growth_delta: null as number | null,
      cohort_percentile: percentile,
      is_viral: percentile <= VIRAL_PERCENTILE,
    };
  });

  // 4. Upsert resolution rows.
  const { error: resErr } = await client
    .from("ktrenz_h1_resolution")
    .upsert(resolutions, { onConflict: "drop_id" });
  if (resErr) throw resErr;

  const isViralByDrop = new Map(resolutions.map((r) => [r.drop_id, r.is_viral]));

  // 5. Score every vouch on this cohort.
  const dropIds = drops.map((d) => d.id);
  const { data: vouchData, error: vouchErr } = await client
    .from("ktrenz_h1_vouches")
    .select("id, user_id, drop_id, confidence, vouched_at")
    .in("drop_id", dropIds)
    .eq("resolved", false);
  if (vouchErr) throw vouchErr;
  const vouches = (vouchData ?? []) as unknown as Vouch[];

  let vouchUpdates = 0;

  for (const v of vouches) {
    const cw = CONFIDENCE_WEIGHT[v.confidence] ?? 1.0;
    const isViral = isViralByDrop.get(v.drop_id) === true;
    const outcome = isViral ? HIT_MULT : MISS_MULT;
    const final = cw * outcome;
    const kCash = Math.floor(final * 20);   // can be negative; clamped at wallet
    const raw = cw;                         // raw_score retained for analytics

    const { error: upErr } = await client
      .from("ktrenz_h1_vouches")
      .update({
        resolved: true,
        hit: isViral,
        raw_score: raw,
        final_score: final,
        k_cash: kCash,
      })
      .eq("id", v.id);
    if (upErr) {
      console.warn("[h1-resolve] vouch update failed:", v.id, upErr.message);
      continue;
    }
    vouchUpdates += 1;

    // Write to wallet ledger. Floor miss losses against current balance so
    // the user never goes negative (the welcome-bonus 1000 K-Cash buffer
    // already absorbs ~5 worst-case days of all-miss play).
    if (kCash !== 0) {
      let amount = kCash;
      if (amount < 0) {
        const { data: bal } = await client
          .from("ktrenz_user_points")
          .select("points")
          .eq("user_id", v.user_id)
          .maybeSingle();
        const currentBalance = (bal?.points as number | undefined) ?? 0;
        amount = Math.max(amount, -currentBalance); // never below 0
        if (amount === 0) continue; // already broke; nothing to deduct
      }
      const { error: txErr } = await client
        .from("ktrenz_point_transactions")
        .insert({
          user_id: v.user_id,
          amount,
          reason: isViral ? "h1_hit" : "h1_miss",
          metadata: {
            vouch_id: v.id,
            drop_id: v.drop_id,
            confidence: v.confidence,
            raw_score: raw,
            final_score: final,
          },
        });
      if (txErr) {
        console.warn("[h1-resolve] ledger insert failed:", v.id, txErr.message);
      }
    }
  }

  // 6. Mark drops resolved.
  const { error: markErr } = await client
    .from("ktrenz_h1_daily_drop")
    .update({ resolved: true })
    .in("id", dropIds);
  if (markErr) throw markErr;

  // 7. Aggregate leaderboard for this drop_date.
  await rebuildLeaderboard(client, dropDate);

  return { drops: drops.length, vouches: vouchUpdates };
}

async function rebuildLeaderboard(
  client: ReturnType<typeof createClient>,
  dropDate: string,
): Promise<void> {
  // Sum each user's scores from vouches whose drop fell on this date.
  const { data: drops, error: dErr } = await client
    .from("ktrenz_h1_daily_drop")
    .select("id")
    .eq("drop_date", dropDate);
  if (dErr || !drops?.length) return;
  const dropIds = drops.map((d: any) => d.id as string);

  const { data: vouches, error: vErr } = await client
    .from("ktrenz_h1_vouches")
    .select("user_id, hit, final_score")
    .in("drop_id", dropIds)
    .eq("resolved", true);
  if (vErr || !vouches?.length) return;

  const agg = new Map<string, { total: number; hits: number; misses: number }>();
  for (const v of vouches as any[]) {
    const cur = agg.get(v.user_id) ?? { total: 0, hits: 0, misses: 0 };
    cur.total += Number(v.final_score ?? 0);
    if (v.hit) cur.hits += 1;
    else cur.misses += 1;
    agg.set(v.user_id, cur);
  }

  const ordered = [...agg.entries()].sort((a, b) => b[1].total - a[1].total);
  const rows = ordered.map(([userId, s], i) => ({
    drop_date: dropDate,
    user_id: userId,
    total_score: s.total,
    hits: s.hits,
    misses: s.misses,
    rank: i + 1,
  }));

  // Wipe any stale rows for this date and re-insert (cheap; daily cohort is small).
  await client.from("ktrenz_h1_leaderboard_daily").delete().eq("drop_date", dropDate);
  if (rows.length === 0) return;
  const { error: insErr } = await client
    .from("ktrenz_h1_leaderboard_daily")
    .insert(rows);
  if (insErr) console.warn("[h1-resolve] leaderboard insert failed:", insErr.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!url || !serviceKey) throw new Error("Missing Supabase env");
    const client = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Find all (drop_date, region) cohorts whose resolution_at has passed.
    const nowIso = new Date().toISOString();
    const { data: due, error: dueErr } = await client
      .from("ktrenz_h1_daily_drop")
      .select("drop_date, region")
      .eq("resolved", false)
      .lte("resolution_at", nowIso);
    if (dueErr) throw dueErr;

    const cohorts = new Set<string>();
    for (const d of (due ?? []) as any[]) {
      cohorts.add(`${d.drop_date}|${d.region}`);
    }

    const results: Array<Record<string, unknown>> = [];
    for (const key of cohorts) {
      const [dropDate, region] = key.split("|");
      const r = await resolveCohort(client, dropDate, region);
      results.push({ dropDate, region, ...r });
    }

    return new Response(JSON.stringify({ ok: true, cohorts: results.length, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[h1-resolve-drop] failed:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
