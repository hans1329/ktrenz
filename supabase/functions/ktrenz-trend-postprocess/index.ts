// T2 Trend Post-Processing: 멤버 우선 중복제거 + 국내 우선 소스 중복제거 + 복합 키워드 병합
// 수집 후 호출하여 데이터 품질을 개선하는 후처리 함수
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[()\[\]{}'"`“”‘’·,\-_\s]+/g, "");
}

function collectNameVariants(...inputs: Array<string | null | undefined>): Set<string> {
  const variants = new Set<string>();

  for (const input of inputs) {
    if (!input) continue;
    const trimmed = input.trim();
    if (!trimmed) continue;

    variants.add(trimmed.toLowerCase());

    const normalized = normalizeForCompare(trimmed);
    if (normalized) variants.add(normalized);

    const withoutParen = trimmed.replace(/\([^)]*\)/g, " ").trim();
    if (withoutParen && withoutParen !== trimmed) {
      variants.add(withoutParen.toLowerCase());
      const normalizedWithoutParen = normalizeForCompare(withoutParen);
      if (normalizedWithoutParen) variants.add(normalizedWithoutParen);
    }

    for (const match of trimmed.matchAll(/\(([^)]+)\)/g)) {
      const inner = match[1]?.trim();
      if (!inner) continue;
      variants.add(inner.toLowerCase());
      const normalizedInner = normalizeForCompare(inner);
      if (normalizedInner) variants.add(normalizedInner);
    }
  }

  return variants;
}

function matchesBlockedNameKeyword(
  keyword: string | null | undefined,
  keywordKo: string | null | undefined,
  keywordEn: string | null | undefined,
  blockedNames: Set<string>,
): boolean {
  for (const value of [keyword, keywordKo, keywordEn]) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (blockedNames.has(trimmed.toLowerCase()) || blockedNames.has(normalizeForCompare(trimmed))) {
      return true;
    }
  }

  return false;
}

// ── 1. 멤버 우선 중복제거 ──
// 같은 키워드 또는 같은 source_url이 그룹과 멤버 양쪽에 존재하면 멤버 것만 유지
async function memberPriorityDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 활성 트리거 가져오기 (멤버 참조용으로 expired도 포함)
  const { data: allRecent } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, star_id, source_url, status")
    .in("status", ["active", "pending", "expired", "merged"])
    .gte("detected_at", threeDaysAgo);

  if (!allRecent?.length) return { expired: 0, details: [] };

  const active = allRecent.filter((e: any) => e.status === "active" || e.status === "pending");
  if (!active.length) return { expired: 0, details: [] };

  // 관련 스타 정보 가져오기 (allRecent 전체 대상)
  const starIds = [...new Set(allRecent.map((a: any) => a.star_id).filter(Boolean))];
  if (!starIds.length) return { expired: 0, details: [] };

  const { data: stars } = await sb
    .from("ktrenz_stars")
    .select("id, star_type, group_star_id, display_name")
    .in("id", starIds);

  const starMap = new Map<string, { star_type: string; group_star_id: string | null; display_name: string }>();
  for (const s of (stars || [])) {
    starMap.set(s.id, { star_type: s.star_type, group_star_id: s.group_star_id, display_name: s.display_name });
  }

  const expireIds = new Set<string>();
  const details: string[] = [];

  // 1a. 같은 키워드 기반 멤버 우선 (allRecent에서 멤버 참조, active 그룹만 만료 대상)
  const byKeyword = new Map<string, any[]>();
  for (const entry of allRecent) {
    const kw = entry.keyword.toLowerCase();
    const list = byKeyword.get(kw) || [];
    list.push(entry);
    byKeyword.set(kw, list);
  }

  for (const [kw, entries] of byKeyword) {
    if (entries.length <= 1) continue;

    const groupEntries: any[] = [];
    const memberEntries: any[] = [];

    for (const e of entries) {
      const info = starMap.get(e.star_id);
      if (!info) continue;
      // 그룹은 active인 것만 만료 대상
      if (info.star_type === "group" && e.status === "active") groupEntries.push({ ...e, starInfo: info });
      // 멤버는 모든 상태 참조 (expired라도 존재하면 그룹 만료 근거)
      if (info.star_type === "member") memberEntries.push({ ...e, starInfo: info });
    }

    for (const ge of groupEntries) {
      for (const me of memberEntries) {
        if (me.starInfo.group_star_id === ge.star_id) {
          expireIds.add(ge.id);
          details.push(`[keyword] "${kw}": ${ge.starInfo.display_name}(그룹) → ${me.starInfo.display_name}(멤버) 우선`);
          break;
        }
      }
    }
  }

  // 1b. 같은 source_url 기반 멤버 우선 (allRecent에서 멤버 참조)
  const byUrl = new Map<string, any[]>();
  for (const entry of allRecent) {
    if (!entry.source_url) continue;
    const list = byUrl.get(entry.source_url) || [];
    list.push(entry);
    byUrl.set(entry.source_url, list);
  }

  for (const [url, entries] of byUrl) {
    if (entries.length <= 1) continue;

    const groupEntries: any[] = [];
    const memberEntries: any[] = [];

    for (const e of entries) {
      const info = starMap.get(e.star_id);
      if (!info) continue;
      if (info.star_type === "group" && e.status === "active") groupEntries.push({ ...e, starInfo: info });
      if (info.star_type === "member") memberEntries.push({ ...e, starInfo: info });
    }

    for (const ge of groupEntries) {
      for (const me of memberEntries) {
        if (me.starInfo.group_star_id === ge.star_id && !expireIds.has(ge.id)) {
          expireIds.add(ge.id);
          details.push(`[source_url] "${ge.keyword}": ${ge.starInfo.display_name}(그룹) → ${me.starInfo.display_name}(멤버) 우선 (같은 기사)`);
          break;
        }
      }
    }
  }

  const expireArr = [...expireIds];
  if (expireArr.length > 0) {
    await sb.from("ktrenz_trend_triggers")
      .update({ status: "expired", expired_at: new Date().toISOString() })
      .in("id", expireArr);
  }

  return { expired: expireArr.length, details };
}

// ── 2. 동일 아티스트 내 동일 키워드 중복제거 ──
// 같은 star_id + 같은 keyword가 여러 건 있으면 가장 높은 baseline_score 것만 유지
async function sameArtistKeywordDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, star_id, artist_name, baseline_score, detected_at")
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo);

  if (!active?.length) return { expired: 0, details: [] };

  // star_id + keyword(lowercase) 기준 그룹화
  const byKey = new Map<string, any[]>();
  for (const e of active) {
    const key = `${e.star_id}::${(e.keyword || "").toLowerCase()}`;
    const list = byKey.get(key) || [];
    list.push(e);
    byKey.set(key, list);
  }

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const [_key, entries] of byKey) {
    if (entries.length <= 1) continue;

    // baseline_score가 가장 높은 것을 유지, 동점이면 최신 것 유지
    entries.sort((a: any, b: any) => {
      const scoreDiff = (b.baseline_score || 0) - (a.baseline_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

    // 첫 번째(최고 점수) 외 나머지 만료
    for (let i = 1; i < entries.length; i++) {
      expireIds.push(entries[i].id);
    }
    details.push(`"${entries[0].keyword}" (${entries[0].artist_name}): ${entries.length - 1}건 중복 제거`);
  }

  if (expireIds.length > 0) {
    // 배치로 처리 (Supabase 기본 한도 고려)
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .in("id", batch);
    }
  }

  return { expired: expireIds.length, details };
}

// ── 3. 국내 우선 소스 중복제거 ──
// 같은 아티스트 + 같은/유사 키워드가 국내(naver_news)와 해외(global_news)에서 모두 감지되면 국내만 유지
async function domesticPriorityDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_en, keyword_ko, star_id, trigger_source, artist_name")
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo);

  if (!active?.length) return { expired: 0, details: [] };

  // star_id 별로 그룹화
  const byStar = new Map<string, any[]>();
  for (const e of active) {
    if (!e.star_id) continue;
    const list = byStar.get(e.star_id) || [];
    list.push(e);
    byStar.set(e.star_id, list);
  }

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const [_starId, entries] of byStar) {
    const domestic = entries.filter((e: any) => e.trigger_source === "naver_news");
    const global = entries.filter((e: any) => e.trigger_source === "global_news" || e.trigger_source === "youtube_trend");

    if (!domestic.length || !global.length) continue;

    for (const ge of global) {
      const geKw = (ge.keyword || "").toLowerCase();
      const geEn = (ge.keyword_en || "").toLowerCase();
      const geKo = (ge.keyword_ko || "").toLowerCase();

      for (const de of domestic) {
        const deKw = (de.keyword || "").toLowerCase();
        const deEn = (de.keyword_en || "").toLowerCase();
        const deKo = (de.keyword_ko || "").toLowerCase();

        // 매칭: keyword, keyword_en, keyword_ko 중 하나라도 일치
        const match =
          (geKw && (geKw === deKw || geKw === deEn || geKw === deKo)) ||
          (geEn && (geEn === deKw || geEn === deEn || geEn === deKo)) ||
          (geKo && (geKo === deKw || geKo === deEn || geKo === deKo));

        if (match) {
          expireIds.push(ge.id);
          details.push(`"${ge.keyword}" (${ge.trigger_source}) → "${de.keyword}" (국내) 우선, ${ge.artist_name}`);
          break;
        }
      }
    }
  }

  if (expireIds.length > 0) {
    await sb.from("ktrenz_trend_triggers")
      .update({ status: "expired", expired_at: new Date().toISOString() })
      .in("id", expireIds);
  }

  return { expired: expireIds.length, details };
}

// ── 3a. 동일 아티스트 + 동일 source_url 중복제거 ──
// 같은 아티스트의 서로 다른 키워드가 동일 기사를 참조하면 baseline_score가 높은 것만 유지
async function sameSourceUrlDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, star_id, artist_name, source_url, baseline_score, detected_at")
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo)
    .not("source_url", "is", null);

  if (!active?.length) return { expired: 0, details: [] };

  // star_id + source_url 기준 그룹화
  const byKey = new Map<string, any[]>();
  for (const e of active) {
    if (!e.source_url) continue;
    const key = `${e.star_id}::${e.source_url}`;
    const list = byKey.get(key) || [];
    list.push(e);
    byKey.set(key, list);
  }

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const [_key, entries] of byKey) {
    if (entries.length <= 1) continue;

    // baseline_score가 가장 높은 것을 유지, 동점이면 최신 것 유지
    entries.sort((a: any, b: any) => {
      const scoreDiff = (b.baseline_score || 0) - (a.baseline_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

    for (let i = 1; i < entries.length; i++) {
      expireIds.push(entries[i].id);
    }
    const kept = entries[0];
    const removed = entries.slice(1).map((e: any) => e.keyword_ko || e.keyword).join(", ");
    details.push(`"${kept.keyword_ko || kept.keyword}" 유지, "${removed}" 제거 (${kept.artist_name}, 동일 기사)`);
  }

  if (expireIds.length > 0) {
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .in("id", batch);
    }
  }

  return { expired: expireIds.length, details };
}

// ── 3b. 크로스 아티스트 동일 source_url 중복제거 ──
// 서로 다른 아티스트가 같은 기사에서 키워드를 추출한 경우 baseline_score가 높은 것만 유지
async function crossArtistSourceUrlDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, star_id, artist_name, source_url, baseline_score, detected_at")
    .in("status", ["active", "pending"])
    .gte("detected_at", threeDaysAgo)
    .not("source_url", "is", null);

  if (!active?.length) return { expired: 0, details: [] };

  // source_url 기준 그룹화 (star_id 무관)
  const byUrl = new Map<string, any[]>();
  for (const e of active) {
    if (!e.source_url) continue;
    const list = byUrl.get(e.source_url) || [];
    list.push(e);
    byUrl.set(e.source_url, list);
  }

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const [url, entries] of byUrl) {
    // 서로 다른 star_id가 2개 이상인 경우만 처리
    const uniqueStars = new Set(entries.map((e: any) => e.star_id));
    if (uniqueStars.size <= 1) continue;

    // baseline_score가 가장 높은 것을 유지
    entries.sort((a: any, b: any) => {
      const scoreDiff = (b.baseline_score || 0) - (a.baseline_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

    for (let i = 1; i < entries.length; i++) {
      expireIds.push(entries[i].id);
    }
    const kept = entries[0];
    const removed = entries.slice(1).map((e: any) => `${e.artist_name}/${e.keyword_ko || e.keyword}`).join(", ");
    details.push(`"${kept.artist_name}/${kept.keyword_ko || kept.keyword}" 유지, "${removed}" 제거 (크로스 아티스트 동일 기사)`);
  }

  if (expireIds.length > 0) {
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .in("id", batch);
    }
  }

  return { expired: expireIds.length, details };
}


// pending 키워드 중 그룹/멤버 귀속이 모호한 것들을 AI로 판단
async function aiClassification(sb: any): Promise<{ reclassified: number; details: string[] }> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.warn("[postprocess] No OPENAI_API_KEY, skipping AI classification");
    return { reclassified: 0, details: [] };
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // pending 상태인 것만 대상
  const { data: pending } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_en, artist_name, star_id, context, context_ko, source_title, keyword_category, trigger_source")
    .eq("status", "pending")
    .gte("detected_at", threeDaysAgo);

  if (!pending?.length) {
    console.log(`[postprocess] No pending entries for AI classification`);
    return { reclassified: 0, details: [] };
  }

  console.log(`[postprocess] AI classification: ${pending.length} pending entries to analyze`);

  // 스타 정보
  const starIds = [...new Set(pending.map((p: any) => p.star_id).filter(Boolean))];
  const { data: stars } = await sb
    .from("ktrenz_stars")
    .select("id, display_name, name_ko, star_type, group_star_id")
    .in("id", starIds);

  const starMap = new Map<string, any>();
  for (const s of (stars || [])) starMap.set(s.id, s);

  // 그룹 star_id 목록을 모아서 멤버를 별도 조회
  const groupStarIds = (stars || []).filter((s: any) => s.star_type === "group").map((s: any) => s.id);
  const groupMembers = new Map<string, any[]>();

  if (groupStarIds.length > 0) {
    const { data: members } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_type, group_star_id")
      .eq("star_type", "member")
      .in("group_star_id", groupStarIds);

    for (const m of (members || [])) {
      const list = groupMembers.get(m.group_star_id) || [];
      list.push(m);
      groupMembers.set(m.group_star_id, list);
    }
    console.log(`[postprocess] Found members for ${groupMembers.size} groups: ${[...groupMembers.entries()].map(([gid, ms]) => `${starMap.get(gid)?.display_name}(${ms.length})`).join(", ")}`);
  }

  // 같은 아티스트의 pending 키워드들을 묶어서 AI에 보냄 (배치 효율)
  const byStarId = new Map<string, any[]>();
  for (const p of pending) {
    const list = byStarId.get(p.star_id) || [];
    list.push(p);
    byStarId.set(p.star_id, list);
  }

  let reclassified = 0;
  const details: string[] = [];

  for (const [starId, entries] of byStarId) {
    const star = starMap.get(starId);
    if (!star) continue;

    // 그룹 엔트리만 AI 분류 대상 (멤버/솔로는 이미 정확)
    if (star.star_type !== "group") continue;

    const memberList = groupMembers.get(starId) || [];
    const memberNames = memberList.map((m: any) => m.display_name);
    if (!memberNames.length) {
      console.log(`[postprocess] No members found for group ${star.display_name}, skipping`);
      continue;
    }

    const blockedNameSet = collectNameVariants(
      star.display_name,
      star.name_ko,
      ...memberList.flatMap((m: any) => [m.display_name, m.name_ko]),
    );

    const keywordList = entries.map((e: any) => ({
      id: e.id,
      keyword: e.keyword,
      keyword_ko: e.keyword_ko,
      context: (e.context_ko || e.context || "").slice(0, 200),
      source_title: (e.source_title || "").slice(0, 100),
      category: e.keyword_category,
    }));

    const prompt = `Analyze the following trend keywords detected for K-pop group "${star.display_name}" (${star.name_ko}).
The group has these members: ${memberNames.join(", ")}.

For each keyword, determine:
1. "attribution": Is this keyword about the GROUP's collective activity or a specific MEMBER's individual activity?
   - "group" = group comeback, group schedule, group endorsement
   - "member" = individual endorsement, solo activity, personal news  
   - If it mentions a specific member by name in context, it's likely "member"
2. "attributed_member": If attribution is "member", which member? Use exact name from the list. null if "group".
3. "should_split": Does this keyword contain multiple unrelated commercial entities that should be separate keywords?
   - true if keyword like "Chanel shoes Prada jacket" (two brands)
   - false if keyword like "Chanel two-tone shoes" (one brand+product)
4. "split_keywords": If should_split is true, array of individual keywords. Otherwise null.

Keywords to analyze:
${JSON.stringify(keywordList, null, 2)}

Return ONLY a JSON array matching each keyword by "id".
Example: [{"id":"abc","attribution":"member","attributed_member":"Rosé","should_split":false,"split_keywords":null}]`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a K-pop trend analyst. Return ONLY valid JSON arrays." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        console.warn(`[postprocess] AI classification failed for ${star.display_name}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;

      const results = JSON.parse(jsonMatch[0]) as any[];

      for (const r of results) {
        if (!r.id) continue;
        const entry = entries.find((e: any) => e.id === r.id);
        if (!entry) continue;

        if (matchesBlockedNameKeyword(entry.keyword, entry.keyword_ko, entry.keyword_en, blockedNameSet)) {
          await sb.from("ktrenz_trend_triggers").update({
            status: "expired",
            expired_at: new Date().toISOString(),
          }).eq("id", r.id);
          reclassified++;
          details.push(`"${entry.keyword}" 제거: 그룹/멤버 이름 키워드`);
          continue;
        }

        // 멤버 귀속 처리
        if (r.attribution === "member" && r.attributed_member) {
          // 해당 멤버의 star_id 찾기 (memberList에서 검색)
          const memberStar = memberList.find((m: any) =>
            m.display_name === r.attributed_member || m.name_ko === r.attributed_member
          );
          if (memberStar) {
            await sb.from("ktrenz_trend_triggers").update({
              star_id: memberStar.id,
              artist_name: memberStar.display_name,
            }).eq("id", r.id);
            reclassified++;
            details.push(`"${entry.keyword}": ${star.display_name} → ${memberStar.display_name} (AI 귀속)`);
          }
        }

        // 복합 키워드 분리
        if (r.should_split && r.split_keywords?.length > 1) {
          const cleanedSplitKeywords = r.split_keywords
            .map((value: string) => value?.trim())
            .filter((value: string | undefined): value is string => Boolean(value))
            .filter((value: string, index: number, arr: string[]) =>
              arr.findIndex((candidate: string) => normalizeForCompare(candidate) === normalizeForCompare(value)) === index
            )
            .filter((value: string) => !matchesBlockedNameKeyword(value, value, value, blockedNameSet));

          if (!cleanedSplitKeywords.length) {
            await sb.from("ktrenz_trend_triggers").update({
              status: "expired",
              expired_at: new Date().toISOString(),
            }).eq("id", r.id);
            reclassified++;
            details.push(`"${entry.keyword}" 제거: 분리 후 이름 키워드만 남음`);
            continue;
          }

          await sb.from("ktrenz_trend_triggers").update({
            keyword: cleanedSplitKeywords[0],
            keyword_ko: cleanedSplitKeywords[0],
            keyword_en: cleanedSplitKeywords[0],
          }).eq("id", r.id);

          for (let i = 1; i < cleanedSplitKeywords.length; i++) {
            await sb.from("ktrenz_trend_triggers").insert({
              ...entry,
              id: undefined,
              keyword: cleanedSplitKeywords[i],
              keyword_ko: cleanedSplitKeywords[i],
              keyword_en: cleanedSplitKeywords[i],
              status: "pending",
            });
          }
          reclassified++;
          details.push(`"${entry.keyword}" → 분리: ${cleanedSplitKeywords.join(", ")}`);
        }
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.warn(`[postprocess] AI classification error for ${star.display_name}: ${(e as Error).message}`);
    }
  }

  return { reclassified, details };
}

// ── 4.8. 글로벌 스타명 필터 ──
// 모든 pending/active 키워드를 ktrenz_stars 전체 이름과 대조, 아티스트/그룹명이 키워드인 것 차단
async function globalStarNameFilter(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 모든 활성 스타의 이름 변형 수집
  const { data: allStars } = await sb
    .from("ktrenz_stars")
    .select("id, display_name, name_ko, star_type")
    .eq("is_active", true);

  if (!allStars?.length) return { expired: 0, details: [] };

  // 글로벌 이름 블랙리스트 구축
  const globalNameSet = new Set<string>();
  for (const s of allStars) {
    for (const n of [s.display_name, s.name_ko]) {
      if (!n) continue;
      globalNameSet.add(n.toLowerCase().trim());
      const normalized = normalizeForCompare(n);
      if (normalized && normalized.length >= 2) globalNameSet.add(normalized);
    }
  }

  // pending + active 키워드 조회
  const { data: triggers } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_en, star_id, artist_name")
    .in("status", ["pending", "active"])
    .gte("detected_at", threeDaysAgo);

  if (!triggers?.length) return { expired: 0, details: [] };

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const t of triggers) {
    // 자기 자신의 이름은 이미 detect에서 걸러지므로, 여기서는 "다른 아티스트 이름이 키워드인 경우" 차단
    const kwValues = [t.keyword, t.keyword_ko, t.keyword_en].filter(Boolean);
    for (const kw of kwValues) {
      const kwLower = kw.toLowerCase().trim();
      const kwNorm = normalizeForCompare(kw);
      if (globalNameSet.has(kwLower) || (kwNorm && globalNameSet.has(kwNorm))) {
        expireIds.push(t.id);
        details.push(`"${t.keyword}" (${t.artist_name}): 다른 아티스트/그룹 이름 → 제거`);
        break;
      }
    }
  }

  if (expireIds.length > 0) {
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .in("id", batch);
    }
  }

  return { expired: expireIds.length, details };
}

// ── 4.9. 패턴 기반 노이즈 필터 ──
// 숫자+단위, 너무 짧은 키워드, 일반 명사 등을 차단
async function noisePatternFilter(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: triggers } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_en, artist_name")
    .in("status", ["pending", "active"])
    .gte("detected_at", threeDaysAgo);

  if (!triggers?.length) return { expired: 0, details: [] };

  // 숫자+단위 패턴 (59kg, 180cm, 100ml 등)
  const MEASUREMENT_PATTERN = /^\d+(\.\d+)?\s*(kg|cm|mm|ml|l|g|oz|lb|lbs|m|km|cc|inch|인치|센치|킬로|그램|미리)s?$/i;
  // 순수 숫자
  const PURE_NUMBER_PATTERN = /^\d+(\.\d+)?$/;
  // 1글자 키워드 (한글/영문 모두)
  const TOO_SHORT = (kw: string) => kw.replace(/\s/g, "").length <= 1;

  const ADDITIONAL_NOISE = new Set([
    "오픈와이와이", "open yy", "openyy",
    "트리플엑스", "triple x", "triplex",
  ]);

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const t of triggers) {
    const kw = (t.keyword || "").trim();
    const kwKo = (t.keyword_ko || "").trim();
    const kwEn = (t.keyword_en || "").trim();
    const kwLower = kw.toLowerCase();
    const kwKoLower = kwKo.toLowerCase();
    const kwEnLower = kwEn.toLowerCase();

    let reason = "";
    if (MEASUREMENT_PATTERN.test(kw) || MEASUREMENT_PATTERN.test(kwKo) || MEASUREMENT_PATTERN.test(kwEn)) {
      reason = "숫자+단위 패턴";
    } else if (PURE_NUMBER_PATTERN.test(kw)) {
      reason = "순수 숫자";
    } else if (TOO_SHORT(kw) && TOO_SHORT(kwKo || kw)) {
      reason = "너무 짧은 키워드";
    } else if (ADDITIONAL_NOISE.has(kwLower) || ADDITIONAL_NOISE.has(kwKoLower) || ADDITIONAL_NOISE.has(kwEnLower)) {
      reason = "알려진 노이즈";
    }

    if (reason) {
      expireIds.push(t.id);
      details.push(`"${kw}" (${t.artist_name}): ${reason} → 제거`);
    }
  }

  if (expireIds.length > 0) {
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .in("id", batch);
    }
  }

  return { expired: expireIds.length, details };
}

// ── 5. pending → active 전환 ──
// ── brand_id 자동 매핑 ──
// brand/product 카테고리 키워드에 brand_id가 없으면 ktrenz_brand_registry에서 매칭
async function mapBrandIds(sb: any): Promise<{ mapped: number; registered: number }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // brand_id가 없는 brand/product 키워드 조회
  const { data: unmapped } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword_en, keyword, keyword_ko, keyword_category, context")
    .in("keyword_category", ["brand", "product"])
    .is("brand_id", null)
    .in("status", ["pending", "active"])
    .gte("detected_at", threeDaysAgo);

  if (!unmapped?.length) return { mapped: 0, registered: 0 };

  // 브랜드 레지스트리 전체 로드
  const { data: brands } = await sb
    .from("ktrenz_brand_registry")
    .select("id, brand_name, brand_name_ko")
    .eq("is_active", true);

  const brandList = brands || [];
  let mapped = 0;
  let registered = 0;

  for (const trigger of unmapped) {
    const kwEn = (trigger.keyword_en || "").toLowerCase().trim();
    const kwKo = (trigger.keyword || "").toLowerCase().trim();
    const kwKoAlt = (trigger.keyword_ko || "").toLowerCase().trim();

    // 1) 정확 매칭
    let match = brandList.find((b: any) =>
      b.brand_name.toLowerCase() === kwEn ||
      (b.brand_name_ko && b.brand_name_ko.toLowerCase() === kwKo) ||
      (b.brand_name_ko && b.brand_name_ko.toLowerCase() === kwKoAlt)
    );

    // 2) 포함 매칭 (brand & product 모두 — 키워드에 브랜드명이 포함되거나 브랜드명에 키워드가 포함)
    if (!match) {
      match = brandList.find((b: any) => {
        const bn = b.brand_name.toLowerCase();
        const bnKo = (b.brand_name_ko || "").toLowerCase();
        // 최소 2글자 이상인 브랜드만 포함 매칭
        if (bn.length < 2 && bnKo.length < 2) return false;
        return (
          (bn.length >= 2 && (kwEn.includes(bn) || kwKo.includes(bn) || kwKoAlt.includes(bn))) ||
          (bnKo.length >= 2 && (kwKo.includes(bnKo) || kwKoAlt.includes(bnKo) || kwEn.includes(bnKo)))
        );
      });
    }

    if (match) {
      await sb.from("ktrenz_trend_triggers").update({ brand_id: match.id }).eq("id", trigger.id);
      mapped++;
    } else if (trigger.keyword_category === "brand") {
      // 3) 자동 등록: brand 카테고리인데 레지스트리에 없으면 새로 등록
      const newBrandName = kwEn || kwKo || kwKoAlt;
      const newBrandNameKo = kwKoAlt || kwKo || kwEn;
      if (newBrandName) {
        const { data: inserted } = await sb
          .from("ktrenz_brand_registry")
          .insert({
            brand_name: trigger.keyword_en || trigger.keyword_ko || trigger.keyword,
            brand_name_ko: trigger.keyword_ko || trigger.keyword,
            category: "etc",
            is_active: true,
          })
          .select("id")
          .single();
        if (inserted) {
          await sb.from("ktrenz_trend_triggers").update({ brand_id: inserted.id }).eq("id", trigger.id);
          brandList.push({ id: inserted.id, brand_name: newBrandName, brand_name_ko: newBrandNameKo });
          mapped++;
          registered++;
          console.log(`[brand-auto-register] New brand: ${trigger.keyword_en || trigger.keyword}`);
        }
      }
    }
  }

  return { mapped, registered };
}

async function activatePending(sb: any): Promise<number> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await sb
    .from("ktrenz_trend_triggers")
    .update({ status: "active" })
    .eq("status", "pending")
    .gte("detected_at", threeDaysAgo)
    .select("id");

  return data?.length || 0;
}

// ── 메인 핸들러 ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const body = await req.json().catch(() => ({}));
    const triggeredBy = body.triggeredBy || "manual";
    const mode = body.mode || "full"; // "full" = AI 분류 포함, "fast" = rule-based만

    console.log(`[postprocess] Starting post-processing... mode=${mode}, triggeredBy=${triggeredBy}`);

    // 시작 로그 기록 (UI에서 감지 가능)
    await sb.from("ktrenz_collection_log").insert({
      platform: "trend_postprocess",
      status: "running",
      records_collected: 0,
      error_message: `triggered_by=${triggeredBy}, mode=${mode}`,
    });

    // pending 건수 확인
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { count: pendingBefore } = await sb
      .from("ktrenz_trend_triggers")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("detected_at", threeDaysAgo);
    console.log(`[postprocess] Pending entries before: ${pendingBefore}`);

    let aiResult = { reclassified: 0, details: [] as string[] };

    // 1단계: AI 분류 (full 모드에서만, 시간 제한 40초)
    if (mode === "full") {
      const aiStart = Date.now();
      try {
        aiResult = await aiClassification(sb);
      } catch (e) {
        console.warn(`[postprocess] AI classification timed out or failed: ${(e as Error).message}`);
      }
      console.log(`[postprocess] AI classification: reclassified ${aiResult.reclassified} entries (${Date.now() - aiStart}ms)`);
    }

    // 2단계: 멤버 우선 중복제거 (rule-based)
    const dedupResult = await memberPriorityDedup(sb);
    console.log(`[postprocess] Member priority dedup: expired ${dedupResult.expired} group entries`);

    // 3단계: 동일 아티스트 내 키워드 중복제거
    const sameArtistResult = await sameArtistKeywordDedup(sb);
    console.log(`[postprocess] Same-artist keyword dedup: expired ${sameArtistResult.expired} duplicates`);

    // 4단계: 국내 우선 소스 중복제거
    const srcDedupResult = await domesticPriorityDedup(sb);
    console.log(`[postprocess] Domestic priority dedup: expired ${srcDedupResult.expired} global entries`);

    // 4.5단계: 동일 아티스트 + 동일 source_url 중복제거
    const sameUrlResult = await sameSourceUrlDedup(sb);
    console.log(`[postprocess] Same source_url dedup: expired ${sameUrlResult.expired} duplicates`);

    // 4.6단계: 크로스 아티스트 동일 source_url 중복제거
    const crossArtistResult = await crossArtistSourceUrlDedup(sb);
    console.log(`[postprocess] Cross-artist source_url dedup: expired ${crossArtistResult.expired} duplicates`);

    // 4.7단계: brand_id 자동 매핑
    const brandMapped = await mapBrandIds(sb);
    console.log(`[postprocess] Brand ID mapping: mapped ${brandMapped.mapped}, auto-registered ${brandMapped.registered} new brands`);

    // 4.8단계: 글로벌 스타명 필터 (다른 아티스트/그룹 이름이 키워드인 경우 제거)
    const globalNameResult = await globalStarNameFilter(sb);
    console.log(`[postprocess] Global star name filter: expired ${globalNameResult.expired} entries`);
    if (globalNameResult.details.length > 0) {
      console.log(`[postprocess] Global name details: ${globalNameResult.details.join("; ")}`);
    }

    // 4.9단계: 패턴 기반 노이즈 필터 (숫자+단위, 알려진 노이즈 등)
    const noiseResult = await noisePatternFilter(sb);
    console.log(`[postprocess] Noise pattern filter: expired ${noiseResult.expired} entries`);
    if (noiseResult.details.length > 0) {
      console.log(`[postprocess] Noise details: ${noiseResult.details.join("; ")}`);
    }

    // 5단계: pending → active 전환
    const activated = await activatePending(sb);
    console.log(`[postprocess] Activated ${activated} pending entries`);

    // 완료 로그 기록
    await sb.from("ktrenz_collection_log").insert({
      platform: "trend_postprocess",
      status: "success",
      records_collected: activated,
      error_message: `mode=${mode}, ai=${aiResult.reclassified}, member_dedup=${dedupResult.expired}, same_artist_dedup=${sameArtistResult.expired}, domestic_dedup=${srcDedupResult.expired}, same_url_dedup=${sameUrlResult.expired}, cross_artist_dedup=${crossArtistResult.expired}, brand_mapped=${brandMapped.mapped}, brand_registered=${brandMapped.registered}, global_name=${globalNameResult.expired}, noise=${noiseResult.expired}, activated=${activated}, pending_before=${pendingBefore ?? 0}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        aiClassification: aiResult,
        memberPriority: dedupResult,
        sameArtistDedup: sameArtistResult,
        domesticPriority: srcDedupResult,
        sameSourceUrlDedup: sameUrlResult,
        crossArtistDedup: crossArtistResult,
        brandMapped,
        globalStarNameFilter: globalNameResult,
        noisePatternFilter: noiseResult,
        activated,
        pendingBefore: pendingBefore ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[postprocess] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
