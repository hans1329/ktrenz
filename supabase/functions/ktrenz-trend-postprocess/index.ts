// T2 Trend Post-Processing: 멤버 우선 중복제거 + 국내 우선 소스 중복제거 + 복합 키워드 병합
// 수집 후 호출하여 데이터 품질을 개선하는 후처리 함수
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ── 2. 국내 우선 소스 중복제거 ──
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

// ── 3. (제거됨) 복합 키워드 병합 ──
// 이 로직은 "샤넬 투톤 슈즈"+"프라다 자켓"을 합쳐버리는 역효과가 있어 제거.
// 복합 키워드 분리는 AI 분류(4단계)에서 처리함.

// ── 4. AI 분류 (툴콜링) ──
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
    .select("id, keyword, keyword_ko, artist_name, star_id, context, context_ko, source_title, keyword_category, trigger_source")
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

        // 멤버 귀속 처리
        if (r.attribution === "member" && r.attributed_member) {
          // 해당 멤버의 star_id 찾기
          const memberStar = (stars || []).find((s: any) =>
            s.star_type === "member" &&
            s.group_star_id === starId &&
            (s.display_name === r.attributed_member || s.name_ko === r.attributed_member)
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
          // 원본을 첫 번째 키워드로 업데이트
          await sb.from("ktrenz_trend_triggers").update({
            keyword: r.split_keywords[0],
            keyword_ko: r.split_keywords[0],
          }).eq("id", r.id);

          // 나머지를 새 레코드로 삽입
          for (let i = 1; i < r.split_keywords.length; i++) {
            await sb.from("ktrenz_trend_triggers").insert({
              ...entry,
              id: undefined,
              keyword: r.split_keywords[i],
              keyword_ko: r.split_keywords[i],
              keyword_en: r.split_keywords[i],
              status: "pending",
            });
          }
          reclassified++;
          details.push(`"${entry.keyword}" → 분리: ${r.split_keywords.join(", ")}`);
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

// ── 5. pending → active 전환 ──
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

    console.log("[postprocess] Starting post-processing...");

    // 1단계: 멤버 우선 중복제거 (rule-based)
    const dedupResult = await memberPriorityDedup(sb);
    console.log(`[postprocess] Member priority dedup: expired ${dedupResult.expired} group entries`);

    // 2단계: 국내 우선 소스 중복제거
    const srcDedupResult = await domesticPriorityDedup(sb);
    console.log(`[postprocess] Domestic priority dedup: expired ${srcDedupResult.expired} global entries`);

    // 3단계: 복합 키워드 병합 (rule-based)
    const mergeResult = await mergeCompoundKeywords(sb);
    console.log(`[postprocess] Compound merge: merged ${mergeResult.merged} entries`);

    // 4단계: AI 분류 (그룹→멤버 귀속 + 복합 키워드 분리)
    const aiResult = await aiClassification(sb);
    console.log(`[postprocess] AI classification: reclassified ${aiResult.reclassified} entries`);

    // 5단계: pending → active 전환
    const activated = await activatePending(sb);
    console.log(`[postprocess] Activated ${activated} pending entries`);

    return new Response(
      JSON.stringify({
        success: true,
        memberPriority: dedupResult,
        domesticPriority: srcDedupResult,
        compoundMerge: mergeResult,
        aiClassification: aiResult,
        activated,
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
