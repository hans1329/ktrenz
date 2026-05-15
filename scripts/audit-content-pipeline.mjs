#!/usr/bin/env node
// scripts/audit-content-pipeline.mjs
//
// 컨텐츠 파이프라인 전수 감사: scrape → store → curate → resolve 흐름의
// 각 layer가 의도대로 작동하는지 데이터로 검증.

import fs from "node:fs";
import path from "node:path";

const envText = fs.readFileSync(path.join(import.meta.dirname, "..", ".env"), "utf-8");
const env = Object.fromEntries(
  envText.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => {
    const eq = l.indexOf("=");
    if (eq < 0) return null;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    return [k, v];
  }).filter(Boolean),
);
const SUPABASE_URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function q(p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
const oneDayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
const issues = [];
function flag(severity, area, detail) { issues.push({ severity, area, detail }); }

// ─── A. SCRAPE LAYER ─────────────────────────────────────────────────
console.log("\n=== A. SCRAPE LAYER (최근 24h 수집) ===");
const recent = await q(`ktrenz_b2_items?created_at=gte.${oneDayAgo}&select=id,source,star_id,title,engagement_score,published_at,thumbnail,metadata,url`);
const bySource = {};
for (const i of recent) {
  bySource[i.source] = bySource[i.source] || { count: 0, withThumb: 0, withMetaSignal: 0, hasPubAt: 0, withEng: 0 };
  const s = bySource[i.source];
  s.count++;
  if (i.thumbnail) s.withThumb++;
  if (i.published_at) s.hasPubAt++;
  const m = i.metadata || {};
  if (m.views || m.plays || m.likes || m.ups || m.score) s.withMetaSignal++;
  if ((i.engagement_score || 0) > 100) s.withEng++;
}
console.log(`  source        items thumb pubAt engagement metadata`);
for (const [src, s] of Object.entries(bySource)) {
  console.log(`  ${src.padEnd(12)} ${String(s.count).padStart(4)}  ${String(s.withThumb).padStart(4)}  ${String(s.hasPubAt).padStart(4)}  ${String(s.withEng).padStart(7)}    ${String(s.withMetaSignal).padStart(7)}`);
  if (s.count > 0 && s.withMetaSignal === 0 && (src === "reddit" || src === "youtube")) {
    flag("HIGH", `scrape:${src}`, `${src} ${s.count}개 수집됐으나 per-item metadata 신호 0개`);
  }
  if (s.count > 0 && s.withThumb / s.count < 0.5) {
    flag("MED", `scrape:${src}`, `${src} 썸네일 누락률 ${Math.round((1 - s.withThumb / s.count) * 100)}%`);
  }
}

// ─── B. STAR METADATA HEALTH ─────────────────────────────────────────
console.log("\n=== B. STAR METADATA HEALTH ===");
const stars = await q("ktrenz_stars?select=id,display_name,name_ko,star_type,search_qualifier,group_star_id&limit=1000");
const missingQualifier = stars.filter((s) => !s.search_qualifier);
const ambiguousNames = stars.filter((s) => s.name_ko && ["아이들", "온유", "정국", "지수", "안톤"].includes(s.name_ko));
console.log(`  총 stars: ${stars.length}`);
console.log(`  search_qualifier 없음: ${missingQualifier.length} (${Math.round(missingQualifier.length / stars.length * 100)}%)`);
console.log(`  알려진 동음이의어 name_ko: ${ambiguousNames.length}`);
for (const a of ambiguousNames) {
  console.log(`    - ${a.display_name} (name_ko: ${a.name_ko}, qualifier: ${a.search_qualifier || "❌ 없음"})`);
  if (!a.search_qualifier) flag("HIGH", "star_data", `${a.display_name} 동음이의어인데 search_qualifier 비어있음`);
}
const members = stars.filter((s) => s.star_type === "member");
const memberMissingGroup = members.filter((m) => !m.group_star_id);
console.log(`  멤버 중 group_star_id 없음: ${memberMissingGroup.length}/${members.length}`);
if (memberMissingGroup.length > 0) flag("MED", "star_data", `${memberMissingGroup.length}명의 멤버가 group_star_id 비어있음 → 검색 시 그룹 컨텍스트 없음`);

// ─── C. CURATE LAYER (오늘 드롭) ────────────────────────────────────
console.log("\n=== C. CURATE LAYER (오늘 드롭) ===");
const drops = await q(`ktrenz_h1_daily_drop?drop_date=eq.${today}&region=eq.global&select=id,cohort_rank,views_at_drop,item_id`);
if (drops.length === 0) {
  console.log(`  ⚠️ 오늘 드롭 없음`);
  flag("HIGH", "curate", "오늘 드롭 비어있음");
} else {
  const items = await q(`ktrenz_b2_items?id=in.(${drops.map(d => d.item_id).join(",")})&select=id,star_id,source,title,published_at,engagement_score`);
  const itemMap = new Map(items.map(i => [i.id, i]));
  const now = Date.now();
  const ages = drops.map(d => {
    const it = itemMap.get(d.item_id);
    return it?.published_at ? (now - new Date(it.published_at).getTime()) / 3_600_000 : 0;
  });
  const over72h = ages.filter(a => a > 72).length;
  const sourceCount = {};
  for (const d of drops) {
    const it = itemMap.get(d.item_id);
    sourceCount[it?.source || "?"] = (sourceCount[it?.source || "?"] || 0) + 1;
  }
  console.log(`  카드 수: ${drops.length}/24`);
  console.log(`  소스 분포:`, Object.entries(sourceCount).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log(`  72h 초과 published_at: ${over72h}장 (curate 시점 기준이라 12h+ 초과 가능)`);
  console.log(`  views_at_drop 0인 카드: ${drops.filter(d => !d.views_at_drop).length}`);
  if (drops.length < 20) flag("MED", "curate", `드롭 ${drops.length} < 20 — 풀 부족`);
  if (over72h > 5) flag("LOW", "curate", `${over72h}개 published_at > 72h — curate-now 시간차로 정상이지만 매일 더 늘면 cron 점검`);
  if (sourceCount.naver_news / drops.length > 0.6) flag("MED", "curate", `Naver 비중 ${Math.round(sourceCount.naver_news / drops.length * 100)}% — 영상 신호 부족 → 게임 재미 ↓`);

  // 정치/연예외 컨텐츠 의심 — 타이틀 키워드 검사
  const SUSPECT_KEYWORDS = ["구청장", "후보", "선거", "대통령", "장관", "법안", "검찰", "재판"];
  const suspects = drops.filter(d => {
    const it = itemMap.get(d.item_id);
    if (!it?.title) return false;
    return SUSPECT_KEYWORDS.some(k => it.title.includes(k));
  });
  console.log(`  정치/뉴스 의심 카드: ${suspects.length}`);
  for (const s of suspects.slice(0, 5)) {
    const it = itemMap.get(s.item_id);
    console.log(`    #${s.cohort_rank} [${it?.source}] ${it?.title.slice(0, 60)}`);
    flag("HIGH", "curate:contamination", `[${it?.source}] "${it?.title.slice(0, 50)}" — K-pop 컨텍스트 의심`);
  }
}

// ─── D. RESOLUTION HEALTH ────────────────────────────────────────────
console.log("\n=== D. RESOLUTION HEALTH ===");
const recentResolved = await q(`ktrenz_h1_daily_drop?resolved=eq.true&drop_date=gte.${new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)}&select=id,drop_date,item_id,views_at_drop&order=drop_date.desc`);
const resolvedItemIds = recentResolved.map(d => d.item_id);
const resolvedItems = resolvedItemIds.length > 0
  ? await q(`ktrenz_b2_items?id=in.(${resolvedItemIds.join(",")})&select=id,engagement_score,source`)
  : [];
const resolvedItemMap = new Map(resolvedItems.map(i => [i.id, i]));
let zeroGrowthCount = 0, totalResolved = 0;
const growthBySrc = {};
for (const d of recentResolved) {
  const it = resolvedItemMap.get(d.item_id);
  if (!it) continue;
  totalResolved++;
  const delta = (it.engagement_score || 0) - (d.views_at_drop || 0);
  growthBySrc[it.source] = growthBySrc[it.source] || { total: 0, zeros: 0 };
  growthBySrc[it.source].total++;
  if (delta === 0) {
    growthBySrc[it.source].zeros++;
    zeroGrowthCount++;
  }
}
console.log(`  최근 14일 정산 카드: ${totalResolved}`);
console.log(`  delta=0 (성장 신호 없음): ${zeroGrowthCount} (${Math.round(zeroGrowthCount / Math.max(totalResolved, 1) * 100)}%)`);
console.log(`  소스별 zero-growth율:`);
for (const [s, g] of Object.entries(growthBySrc)) {
  const pct = Math.round(g.zeros / g.total * 100);
  console.log(`    ${s.padEnd(12)} ${g.zeros}/${g.total} (${pct}%)`);
  if (pct > 80 && s !== "naver_news" && s !== "naver_blog") {
    flag("HIGH", `resolve:${s}`, `${s} 정산 카드 ${pct}%가 성장 신호 0 — refresh-stats 안 도는 듯`);
  }
}

// ─── E. SUMMARY ────────────────────────────────────────────────────
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("           감사 요약");
console.log("═══════════════════════════════════════════════════════════");
const sorted = issues.sort((a, b) => ({ HIGH: 0, MED: 1, LOW: 2 }[a.severity] - { HIGH: 0, MED: 1, LOW: 2 }[b.severity]));
if (sorted.length === 0) {
  console.log("  ✅ 발견된 이슈 없음");
} else {
  for (const i of sorted) {
    const emoji = i.severity === "HIGH" ? "🔴" : i.severity === "MED" ? "🟡" : "🔵";
    console.log(`  ${emoji} [${i.severity}] ${i.area}`);
    console.log(`     ${i.detail}`);
  }
}
console.log("");
