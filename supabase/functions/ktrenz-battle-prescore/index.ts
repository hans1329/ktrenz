// ktrenz-battle-prescore: 전체 스타 대상 네이버 뉴스 기사수 기반 가점수 스코어링
// + 티어 분할 + 3일 쿨다운 기반 배틀 20명 자동 선발
// + star_type별 검색어 최적화 (member→그룹+이름, solo→이름+가수, group→그룹명)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const TIMEOUT_MS = 8000;
const BATTLE_PICK_COUNT = 20;
const COOLDOWN_DAYS = 3;

const TIER_CONFIG = [
  { name: "top", count: 6, startPct: 0, endPct: 0.1 },
  { name: "mid", count: 8, startPct: 0.1, endPct: 0.4 },
  { name: "low", count: 6, startPct: 0.4, endPct: 1.0 },
];

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getNaverNewsCount(
  clientId: string, clientSecret: string, query: string
): Promise<number> {
  try {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "1");
    url.searchParams.set("sort", "date");
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total || 0;
  } catch {
    return 0;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// star_category별 수식어 매핑
const CATEGORY_QUALIFIER: Record<string, string> = {
  kpop: "가수",
  actor: "배우",
  youtuber: "유튜버",
  influencer: "인플루언서",
  comedian: "개그맨",
  model: "모델",
  athlete: "선수",
};

// star_type + star_category 기반 검색어 생성
function buildSearchQuery(
  star: { name_ko: string | null; display_name: string; star_type: string; star_category: string },
  groupNameKo: string | null
): string {
  const name = star.name_ko || star.display_name;
  const qualifier = CATEGORY_QUALIFIER[star.star_category] || "연예인";

  switch (star.star_type) {
    case "member":
      // 멤버: "그룹명 멤버명" (예: "세븐틴 준")
      if (groupNameKo) {
        return `${groupNameKo} ${name}`;
      }
      // 그룹 정보 없으면 이름+카테고리 수식어 fallback
      return `${name} ${qualifier}`;

    case "solo":
      // 솔로: "이름 카테고리수식어" (예: "아이유 가수", "마동석 배우")
      return `${name} ${qualifier}`;

    case "group":
      // 그룹: 그룹명 자체가 고유하므로 그대로 사용
      return name;

    default:
      return `${name} ${qualifier}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const naverId = Deno.env.get("NAVER_CLIENT_ID") || "";
    const naverSecret = Deno.env.get("NAVER_CLIENT_SECRET") || "";

    if (!naverId || !naverSecret) {
      return new Response(JSON.stringify({ error: "Naver API keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Get all active stars with group info
    const { data: stars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_category, image_url, star_type, group_star_id")
      .eq("is_active", true)
      .order("display_name");

    if (starsErr) throw starsErr;
    if (!stars || stars.length === 0) {
      return new Response(JSON.stringify({ error: "No active stars found", count: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build group name lookup: group_star_id → name_ko
    const groupStarIds = [...new Set(
      stars.filter((s) => s.star_type === "member" && s.group_star_id)
        .map((s) => s.group_star_id!)
    )];
    const groupNameMap = new Map<string, string>();
    for (const gid of groupStarIds) {
      const group = stars.find((s) => s.id === gid);
      if (group) {
        groupNameMap.set(gid, group.name_ko || group.display_name);
      }
    }
    // If some group stars aren't in the active list, fetch them
    const missingGroupIds = groupStarIds.filter((gid) => !groupNameMap.has(gid));
    if (missingGroupIds.length > 0) {
      const { data: missingGroups } = await sb
        .from("ktrenz_stars")
        .select("id, display_name, name_ko")
        .in("id", missingGroupIds);
      for (const g of missingGroups || []) {
        groupNameMap.set(g.id, g.name_ko || g.display_name);
      }
    }

    const batchId = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const results: any[] = [];

    // Phase 1: Naver news count pre-scoring with optimized search queries
    for (let i = 0; i < stars.length; i += BATCH_SIZE) {
      const batch = stars.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (star) => {
          const groupNameKo = star.group_star_id
            ? groupNameMap.get(star.group_star_id) || null
            : null;
          const searchQuery = buildSearchQuery(star, groupNameKo);
          const newsCount = await getNaverNewsCount(naverId, naverSecret, searchQuery);
          return {
            star_id: star.id,
            news_count: newsCount,
            pre_score: newsCount,
            batch_id: batchId,
          };
        })
      );
      results.push(...batchResults);
      if (i + BATCH_SIZE < stars.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Save all prescores
    await sb.from("ktrenz_b2_prescores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    for (let i = 0; i < results.length; i += 500) {
      const chunk = results.slice(i, i + 500);
      await sb.from("ktrenz_b2_prescores").insert(chunk);
    }

    // Phase 2: Tier-based selection with cooldown
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);
    const { data: recentRuns } = await sb
      .from("ktrenz_b2_runs")
      .select("star_id")
      .gte("created_at", cooldownDate.toISOString());
    const recentStarIds = new Set((recentRuns || []).map((r: any) => r.star_id));

    const scoredResults = results
      .filter((r) => r.news_count > 0)
      .sort((a, b) => b.pre_score - a.pre_score);

    const totalScored = scoredResults.length;
    const selectedStarIds: string[] = [];

    for (const tier of TIER_CONFIG) {
      const startIdx = Math.floor(totalScored * tier.startPct);
      const endIdx = Math.floor(totalScored * tier.endPct);
      const tierPool = scoredResults.slice(startIdx, endIdx);

      const available = tierPool.filter((r) => !recentStarIds.has(r.star_id));
      const cooldownOnly = tierPool.filter((r) => recentStarIds.has(r.star_id));

      const shuffled = shuffle(available);
      const picked = shuffled.slice(0, tier.count);

      if (picked.length < tier.count) {
        const remaining = tier.count - picked.length;
        picked.push(...shuffle(cooldownOnly).slice(0, remaining));
      }

      selectedStarIds.push(...picked.map((r) => r.star_id));
    }

    // Build selection summary with search query info
    const selectedDetails = selectedStarIds.map((sid) => {
      const star = stars.find((s) => s.id === sid);
      const score = results.find((r) => r.star_id === sid);
      const groupNameKo = star?.group_star_id
        ? groupNameMap.get(star.group_star_id) || null
        : null;
      const searchQuery = star ? buildSearchQuery(star, groupNameKo) : "";
      return {
        star_id: sid,
        name: star?.display_name,
        name_ko: star?.name_ko,
        star_type: star?.star_type,
        search_query: searchQuery,
        news_count: score?.news_count || 0,
        is_cooldown: recentStarIds.has(sid),
      };
    });

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      total_stars: results.length,
      scored: scoredResults.length,
      cooldown_excluded: recentStarIds.size,
      selected_count: selectedStarIds.length,
      selected: selectedDetails,
      top_10: scoredResults.slice(0, 10).map((r) => {
        const star = stars.find((s) => s.id === r.star_id);
        const groupNameKo = star?.group_star_id
          ? groupNameMap.get(star.group_star_id) || null
          : null;
        const searchQuery = star ? buildSearchQuery(star, groupNameKo) : "";
        return {
          name: star?.display_name,
          name_ko: star?.name_ko,
          star_type: star?.star_type,
          search_query: searchQuery,
          news_count: r.news_count,
          in_cooldown: recentStarIds.has(r.star_id),
        };
      }),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Prescore error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
