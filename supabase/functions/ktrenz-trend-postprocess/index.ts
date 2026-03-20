// T2 Trend Post-Processing: 멤버 우선 중복제거 + 복합 키워드 병합
// 수집 후 호출하여 데이터 품질을 개선하는 후처리 함수
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── 1. 멤버 우선 중복제거 ──
// 같은 키워드가 그룹과 멤버 양쪽에 존재하면 멤버 것만 유지
async function memberPriorityDedup(sb: any): Promise<{ expired: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 활성 트리거 가져오기
  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, star_id")
    .eq("status", "active")
    .gte("detected_at", threeDaysAgo);

  if (!active?.length) return { expired: 0, details: [] };

  // 관련 스타 정보 가져오기
  const starIds = [...new Set(active.map((a: any) => a.star_id).filter(Boolean))];
  if (!starIds.length) return { expired: 0, details: [] };

  const { data: stars } = await sb
    .from("ktrenz_stars")
    .select("id, star_type, group_star_id, display_name")
    .in("id", starIds);

  const starMap = new Map<string, { star_type: string; group_star_id: string | null; display_name: string }>();
  for (const s of (stars || [])) {
    starMap.set(s.id, { star_type: s.star_type, group_star_id: s.group_star_id, display_name: s.display_name });
  }

  // 키워드별로 그룹화
  const byKeyword = new Map<string, any[]>();
  for (const entry of active) {
    const kw = entry.keyword.toLowerCase();
    const list = byKeyword.get(kw) || [];
    list.push(entry);
    byKeyword.set(kw, list);
  }

  const expireIds: string[] = [];
  const details: string[] = [];

  for (const [kw, entries] of byKeyword) {
    if (entries.length <= 1) continue;

    // 그룹 엔트리와 멤버 엔트리 분류
    const groupEntries: any[] = [];
    const memberEntries: any[] = [];

    for (const e of entries) {
      const info = starMap.get(e.star_id);
      if (!info) continue;
      if (info.star_type === "group") groupEntries.push({ ...e, starInfo: info });
      if (info.star_type === "member") memberEntries.push({ ...e, starInfo: info });
    }

    // 멤버가 존재하면 해당 그룹 엔트리 만료
    for (const ge of groupEntries) {
      for (const me of memberEntries) {
        if (me.starInfo.group_star_id === ge.star_id) {
          expireIds.push(ge.id);
          details.push(`"${kw}": ${ge.starInfo.display_name}(그룹) → ${me.starInfo.display_name}(멤버) 우선`);
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

// ── 2. 복합 키워드 병합 ──
// 같은 아티스트 + 같은 출처 + 같은 카테고리의 키워드가 출처 제목에서 인접하면 병합
async function mergeCompoundKeywords(sb: any): Promise<{ merged: number; details: string[] }> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: active } = await sb
    .from("ktrenz_trend_triggers")
    .select("id, keyword, keyword_ko, keyword_en, keyword_ja, keyword_zh, source_url, source_title, star_id, keyword_category, confidence, context, context_ko, context_ja, context_zh, artist_name")
    .eq("status", "active")
    .gte("detected_at", threeDaysAgo)
    .not("source_url", "is", null);

  if (!active?.length) return { merged: 0, details: [] };

  // star_id + source_url + category 로 그룹화
  const groups = new Map<string, any[]>();
  for (const entry of active) {
    if (!entry.source_url || !entry.star_id) continue;
    const key = `${entry.star_id}||${entry.source_url}||${entry.keyword_category}`;
    const list = groups.get(key) || [];
    list.push(entry);
    groups.set(key, list);
  }

  let mergeCount = 0;
  const details: string[] = [];

  for (const [_key, entries] of groups) {
    if (entries.length <= 1) continue;

    const title = (entries[0].source_title || "").toLowerCase();
    if (!title) continue;

    // 제목에서 키워드 위치 찾기
    const withPos = entries.map((e: any) => ({
      ...e,
      kwLower: e.keyword.toLowerCase(),
      pos: title.indexOf(e.keyword.toLowerCase()),
    })).filter((e: any) => e.pos >= 0).sort((a: any, b: any) => a.pos - b.pos);

    if (withPos.length < 2) continue;

    // 인접한 키워드 찾기 (5자 이내 간격)
    const compound: any[] = [withPos[0]];
    for (let i = 1; i < withPos.length; i++) {
      const prevEnd = withPos[i - 1].pos + withPos[i - 1].kwLower.length;
      const gap = withPos[i].pos - prevEnd;
      if (gap >= 0 && gap <= 5) {
        compound.push(withPos[i]);
      }
    }

    if (compound.length < 2) continue;

    // 병합: 제목에서의 순서대로 키워드 합치기
    compound.sort((a: any, b: any) => b.confidence - a.confidence);
    const primary = compound[0];
    const others = compound.slice(1);

    // 제목 순서대로 키워드 합치기
    const orderedCompound = [...compound].sort((a: any, b: any) => a.pos - b.pos);
    const mergedKeyword = orderedCompound.map((e: any) => e.keyword).join(" ");
    const mergedKo = orderedCompound.map((e: any) => e.keyword_ko).filter(Boolean).join(" ") || null;
    const mergedEn = orderedCompound.map((e: any) => e.keyword_en).filter(Boolean).join(" ") || null;
    const mergedJa = orderedCompound.map((e: any) => e.keyword_ja).filter(Boolean).join(" ") || null;
    const mergedZh = orderedCompound.map((e: any) => e.keyword_zh).filter(Boolean).join(" ") || null;

    // Primary 업데이트
    await sb.from("ktrenz_trend_triggers").update({
      keyword: mergedKeyword,
      keyword_ko: mergedKo,
      keyword_en: mergedEn,
      keyword_ja: mergedJa,
      keyword_zh: mergedZh,
    }).eq("id", primary.id);

    // 나머지 만료
    const otherIds = others.map((e: any) => e.id);
    if (otherIds.length > 0) {
      await sb.from("ktrenz_trend_triggers")
        .update({ status: "merged", expired_at: new Date().toISOString() })
        .in("id", otherIds);
    }

    mergeCount += others.length;
    details.push(`"${mergedKeyword}" (${compound.length}개 → 1, ${primary.artist_name})`);
    console.log(`[postprocess] Merged: "${mergedKeyword}" for ${primary.artist_name}`);
  }

  return { merged: mergeCount, details };
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

    // 1단계: 멤버 우선 중복제거
    const dedupResult = await memberPriorityDedup(sb);
    console.log(`[postprocess] Member priority dedup: expired ${dedupResult.expired} group entries`);

    // 2단계: 복합 키워드 병합
    const mergeResult = await mergeCompoundKeywords(sb);
    console.log(`[postprocess] Compound merge: merged ${mergeResult.merged} entries`);

    return new Response(
      JSON.stringify({
        success: true,
        memberPriority: dedupResult,
        compoundMerge: mergeResult,
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
