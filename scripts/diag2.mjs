#!/usr/bin/env node
// scripts/diag2.mjs — 추가 분석: 정산 완료 라운드 + Reddit/per-item 신호.

import fs from "node:fs";
import path from "node:path";

const envText = fs.readFileSync(path.join(import.meta.dirname, "..", ".env"), "utf-8");
const env = Object.fromEntries(envText.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => {
  const eq = l.indexOf("=");
  if (eq < 0) return null;
  const k = l.slice(0, eq).trim();
  let v = l.slice(eq + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return [k, v];
}).filter(Boolean));

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function q(p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// 1) 5월 8일 정산 결과
console.log("=== 1) 2026-05-08 정산 결과 ===");
const resolvedDrops = await q("ktrenz_h1_daily_drop?drop_date=eq.2026-05-08&region=eq.global&resolved=eq.true&select=id,cohort_rank,item_id,views_at_drop");
const resolutions = await q(`ktrenz_h1_resolution?drop_id=in.(${resolvedDrops.map((d) => d.id).join(",")})&select=*`);
const resById = new Map(resolutions.map((r) => [r.drop_id, r]));
const itemIds = resolvedDrops.map((d) => d.item_id);
const items = await q(`ktrenz_b2_items?id=in.(${itemIds.join(",")})&select=id,title,source,star_id,engagement_score`);
const itemMap = new Map(items.map((i) => [i.id, i]));
const starIds = [...new Set(items.map((i) => i.star_id).filter(Boolean))];
const stars = starIds.length ? await q(`ktrenz_stars?id=in.(${starIds.join(",")})&select=id,display_name`) : [];
const starMap = new Map(stars.map((s) => [s.id, s]));

console.log(`  rank artist               source     at_drop      now    delta  viral`);
for (const d of resolvedDrops.sort((a, b) => a.cohort_rank - b.cohort_rank)) {
  const it = itemMap.get(d.item_id);
  const star = it && starMap.get(it.star_id);
  const res = resById.get(d.id);
  const viral = res?.is_viral ? "✅ HIT" : "❌";
  console.log(`  #${String(d.cohort_rank).padStart(2)}  ${(star?.display_name || "?").padEnd(20)} ${(it?.source || "").padEnd(10)} ${String(d.views_at_drop || 0).padStart(8)} ${String(it?.engagement_score || 0).padStart(8)} ${String((it?.engagement_score || 0) - (d.views_at_drop || 0)).padStart(8)}  ${viral}`);
}

// 2) Hit률 + viral 분포
const hits = resolutions.filter((r) => r.is_viral).length;
console.log(`\n  → ${hits}/${resolutions.length} viral (target: 30% = ${Math.ceil(resolutions.length * 0.3)})`);

// 3) 5월 8일 vouch 결과 (적중/미스)
console.log("\n=== 2) 2026-05-08 vouch 결과 ===");
const vouches = await q(`ktrenz_h1_vouches?drop_id=in.(${resolvedDrops.map((d) => d.id).join(",")})&select=id,user_id,drop_id,confidence,hit,k_cash,final_score&resolved=eq.true`);
const userCount = new Set(vouches.map((v) => v.user_id)).size;
const hitVouches = vouches.filter((v) => v.hit).length;
const totalKCash = vouches.reduce((a, v) => a + (v.k_cash || 0), 0);
console.log(`  total vouches: ${vouches.length}, users: ${userCount}, hits: ${hitVouches} (${Math.round(hitVouches / Math.max(vouches.length, 1) * 100)}%)`);
console.log(`  total K-Cash issued: ${totalKCash > 0 ? "+" : ""}${totalKCash}`);

// 4) Reddit 아이템에 새 ups 들어왔는지 (지난 24h)
console.log("\n=== 3) Reddit per-item 신호 (최근 24h 수집) ===");
const since24h = new Date(Date.now() - 24 * 3_600_000).toISOString();
const reddit = await q(`ktrenz_b2_items?source=eq.reddit&created_at=gte.${since24h}&select=id,title,metadata,engagement_score&limit=20`);
const withUps = reddit.filter((r) => r.metadata?.ups != null).length;
console.log(`  Reddit 아이템 ${reddit.length}개 중 ${withUps}개에 ups 메타데이터 있음`);
if (reddit.length > 0) {
  console.log(`  --- 샘플 ---`);
  for (const r of reddit.slice(0, 5)) {
    console.log(`    ups=${r.metadata?.ups ?? "-"} comments=${r.metadata?.comments ?? "-"} score=${r.engagement_score} | ${r.title.slice(0, 60)}`);
  }
}

// 5) 오늘 / 어제 active 픽 수 + 최근 vouch users
console.log("\n=== 4) 최근 활성 vouch (지난 3일) ===");
const recentVouches = await q(`ktrenz_h1_vouches?vouched_at=gte.${new Date(Date.now() - 3 * 86400000).toISOString()}&select=user_id,confidence,vouched_at,drop_id&order=vouched_at.desc`);
const byUser = new Map();
for (const v of recentVouches) {
  const arr = byUser.get(v.user_id) || [];
  arr.push(v);
  byUser.set(v.user_id, arr);
}
console.log(`  총 vouch 수: ${recentVouches.length}, 유저 수: ${byUser.size}`);
for (const [uid, arr] of byUser) {
  console.log(`    ${uid.slice(0, 8)}... → ${arr.length} vouches (last: ${arr[0].vouched_at.slice(0, 16)})`);
}
