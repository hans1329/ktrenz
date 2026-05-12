#!/usr/bin/env node
// scripts/diag.mjs — H1 Discover 상태 진단.
//
// Service role 키로 PostgREST API 직접 호출. RLS 우회.
// .env의 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 필요.

import fs from "node:fs";
import path from "node:path";

const envPath = path.join(import.meta.dirname, "..", ".env");
const envText = fs.readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envText.split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      if (eq < 0) return null;
      const k = l.slice(0, eq).trim();
      let v = l.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [k, v];
    })
    .filter(Boolean),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "count=exact",
};

async function query(pathAndQs) {
  const url = `${SUPABASE_URL}/rest/v1/${pathAndQs}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function kstToday() {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return kst.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const kst = new Date(Date.now() + 9 * 3_600_000 - n * 24 * 3_600_000);
  return kst.toISOString().slice(0, 10);
}

const HANS_USER_ID = "5a66ab0f-0ede-4c84-8b1f-8aa2fd9a1929";

async function checkTodayDrop() {
  const today = kstToday();
  const sevenDaysAgo = daysAgo(7);
  console.log(`\n=== 1) 오늘 드롭 (drop_date=${today}) ===`);
  const drops = await query(
    `ktrenz_h1_daily_drop?drop_date=eq.${today}&region=eq.global&select=id,cohort_rank,views_at_drop,resolved,item_id`,
  );
  if (drops.length === 0) {
    console.log("  ⚠️  오늘 드롭 없음");
    return;
  }
  const itemIds = drops.map((d) => d.item_id);
  const items = await query(
    `ktrenz_b2_items?id=in.(${itemIds.join(",")})&select=id,star_id,title,source,engagement_score,published_at,thumbnail`,
  );
  const itemById = new Map(items.map((i) => [i.id, i]));
  const starIds = [...new Set(items.map((i) => i.star_id).filter(Boolean))];
  const stars = starIds.length > 0
    ? await query(`ktrenz_stars?id=in.(${starIds.join(",")})&select=id,display_name`)
    : [];
  const starById = new Map(stars.map((s) => [s.id, s]));
  void sevenDaysAgo;

  const missingSnapshot = drops.filter((d) => d.views_at_drop == null).length;
  const uniqueArtists = new Set(items.map((i) => i.star_id).filter(Boolean)).size;
  const now = Date.now();
  const published = items.map((i) => i.published_at ? new Date(i.published_at).getTime() : null).filter(Boolean);
  const oldestHours = published.length ? Math.round((now - Math.min(...published)) / 3_600_000) : 0;
  const newestHours = published.length ? Math.round((now - Math.max(...published)) / 3_600_000) : 0;
  const over72hOld = items.filter((i) => i.published_at && (now - new Date(i.published_at).getTime()) > 72 * 3_600_000).length;
  const snapshots = drops.map((d) => d.views_at_drop || 0);
  const minSnap = snapshots.length ? Math.min(...snapshots) : 0;
  const maxSnap = snapshots.length ? Math.max(...snapshots) : 0;
  const avgSnap = snapshots.length ? Math.round(snapshots.reduce((a, b) => a + b, 0) / snapshots.length) : 0;

  console.log(`  total_cards         : ${drops.length}`);
  console.log(`  unique_artists      : ${uniqueArtists}`);
  console.log(`  missing_drop_snapshot: ${missingSnapshot}`);
  console.log(`  published_oldest_h  : ${oldestHours}h ago`);
  console.log(`  published_newest_h  : ${newestHours}h ago`);
  console.log(`  over_72h_old        : ${over72hOld}`);
  console.log(`  snapshot min/max/avg: ${minSnap} / ${maxSnap} / ${avgSnap}`);

  if (drops.length < 24) console.log(`  ⚠️  드롭 ${drops.length}장 < 24 — 풀 부족 가능성`);
  if (missingSnapshot > 0) console.log(`  ⚠️  ${missingSnapshot}개 snapshot 누락 — 새 cron 안 돌았거나 마이그레이션 적용 안 됨`);
  if (over72hOld > 0) console.log(`  ⚠️  ${over72hOld}개 카드가 72h 초과 게시물 — published_at 필터 미적용`);

  console.log(`\n  --- 카드 상세 (cohort_rank 순) ---`);
  for (const d of drops.sort((a, b) => a.cohort_rank - b.cohort_rank)) {
    const it = itemById.get(d.item_id);
    const star = it && starById.get(it.star_id);
    const pubHours = it?.published_at ? Math.round((now - new Date(it.published_at).getTime()) / 3_600_000) : "?";
    console.log(`  #${d.cohort_rank.toString().padStart(2)} ${(star?.display_name || "?").padEnd(20)} ${(it?.source || "").padEnd(10)} pub:${String(pubHours).padStart(4)}h drop_buzz:${String(d.views_at_drop || 0).padStart(8)} now:${String(it?.engagement_score || 0).padStart(8)} | ${(it?.title || "").slice(0, 50)}`);
  }
}

async function checkRoundTracking() {
  const sevenAgo = daysAgo(7);
  console.log(`\n=== 2) 최근 7일 라운드 트래킹 (drop_date >= ${sevenAgo}) ===`);
  const drops = await query(
    `ktrenz_h1_daily_drop?drop_date=gte.${sevenAgo}&region=eq.global&select=id,drop_date,resolution_at,resolved,views_at_drop,item_id&order=drop_date.desc`,
  );
  if (drops.length === 0) {
    console.log("  드롭 없음");
    return;
  }
  const dropIds = drops.map((d) => d.id);
  const vouches = await query(
    `ktrenz_h1_vouches?drop_id=in.(${dropIds.join(",")})&select=id,user_id,drop_id,resolved`,
  );
  const itemIds = [...new Set(drops.map((d) => d.item_id))];
  const items = await query(
    `ktrenz_b2_items?id=in.(${itemIds.join(",")})&select=id,engagement_score`,
  );
  const scoreById = new Map(items.map((i) => [i.id, i.engagement_score || 0]));

  const byDate = new Map();
  for (const d of drops) {
    if (!byDate.has(d.drop_date)) byDate.set(d.drop_date, { drops: [], vouches: [] });
    byDate.get(d.drop_date).drops.push(d);
  }
  for (const v of vouches) {
    const drop = drops.find((d) => d.id === v.drop_id);
    if (drop) byDate.get(drop.drop_date).vouches.push(v);
  }

  console.log(`  drop_date     drops vouches users resolved pending resolves_at         avg_growth`);
  for (const [date, agg] of [...byDate.entries()].sort().reverse()) {
    const usrs = new Set(agg.vouches.map((v) => v.user_id)).size;
    const resolved = agg.vouches.filter((v) => v.resolved).length;
    const pending = agg.vouches.length - resolved;
    const resolveAt = agg.drops[0]?.resolution_at?.slice(0, 16) || "?";
    const growths = agg.drops.map((d) => (scoreById.get(d.item_id) || 0) - (d.views_at_drop || 0));
    const avgGrowth = growths.length ? Math.round(growths.reduce((a, b) => a + b, 0) / growths.length) : 0;
    console.log(`  ${date}   ${String(agg.drops.length).padStart(3)}  ${String(agg.vouches.length).padStart(5)}  ${String(usrs).padStart(4)}  ${String(resolved).padStart(7)}  ${String(pending).padStart(6)}  ${resolveAt}    ${avgGrowth > 0 ? "+" : ""}${avgGrowth}`);
  }
}

async function checkMyActivePicks() {
  console.log(`\n=== 3) hans1329 활성 픽 + 성장률 ===`);
  const vouches = await query(
    `ktrenz_h1_vouches?user_id=eq.${HANS_USER_ID}&resolved=eq.false&select=id,confidence,vouched_at,drop_id`,
  );
  if (vouches.length === 0) {
    console.log("  활성 픽 없음");
    return;
  }
  const dropIds = [...new Set(vouches.map((v) => v.drop_id))];
  const drops = await query(
    `ktrenz_h1_daily_drop?id=in.(${dropIds.join(",")})&select=id,drop_date,resolution_at,views_at_drop,item_id`,
  );
  const dropById = new Map(drops.map((d) => [d.id, d]));
  const itemIds = [...new Set(drops.map((d) => d.item_id))];
  const items = await query(
    `ktrenz_b2_items?id=in.(${itemIds.join(",")})&select=id,star_id,title,engagement_score`,
  );
  const itemById = new Map(items.map((i) => [i.id, i]));
  const starIds = [...new Set(items.map((i) => i.star_id).filter(Boolean))];
  const stars = starIds.length > 0
    ? await query(`ktrenz_stars?id=in.(${starIds.join(",")})&select=id,display_name`)
    : [];
  const starById = new Map(stars.map((s) => [s.id, s]));

  console.log(`  drop_date   conf  artist               at_drop      now    delta   growth%  resolves_at`);
  const rows = vouches.map((v) => {
    const d = dropById.get(v.drop_id);
    const it = d && itemById.get(d.item_id);
    const star = it && starById.get(it.star_id);
    const atDrop = d?.views_at_drop || 0;
    const now = it?.engagement_score || 0;
    const delta = now - atDrop;
    const growth = atDrop > 0 ? (delta / Math.max(atDrop, 100)) * 100 : (delta / 100) * 100;
    return { v, d, it, star, atDrop, now, delta, growth };
  }).sort((a, b) => b.growth - a.growth);
  for (const r of rows) {
    console.log(
      `  ${r.d?.drop_date || "?"}  ×${r.v.confidence === "low" ? "1" : r.v.confidence === "mid" ? "2" : "4"}  ${(r.star?.display_name || "?").padEnd(20)} ${String(r.atDrop).padStart(8)} ${String(r.now).padStart(8)} ${(r.delta > 0 ? "+" : "") + r.delta}`.padEnd(70)
      + `  ${r.growth > 0 ? "+" : ""}${r.growth.toFixed(1)}%  ${r.d?.resolution_at?.slice(0, 16) || "?"}`,
    );
    if (r.it?.title) console.log(`        └─ ${r.it.title.slice(0, 80)}`);
  }
}

(async () => {
  try {
    await checkTodayDrop();
    await checkRoundTracking();
    await checkMyActivePicks();
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  }
})();
