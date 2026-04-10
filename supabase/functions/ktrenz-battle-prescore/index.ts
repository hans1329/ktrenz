// ktrenz-battle-prescore: 전체 스타 대상 네이버 뉴스 기사수 기반 가점수 스코어링
// + 티어 분할 + 3일 쿨다운 기반 배틀 20명 자동 선발
// + star_type별 검색어 최적화 (member→그룹+이름, solo→이름+가수, group→그룹명)
// + 청크 처리: 한 호출당 CHUNK_SIZE명 처리 후 self-chain
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;      // 동시 API 호출 수
const TIMEOUT_MS = 8000;
const CHUNK_SIZE = 100;     // 한 호출당 처리할 스타 수
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

function buildSearchQuery(
  star: { name_ko: string | null; display_name: string; star_type: string; search_qualifier: string | null },
  groupNameKo: string | null
): string {
  const name = star.name_ko || star.display_name;
  const qualifier = star.search_qualifier || "연예인";

  switch (star.star_type) {
    case "member":
      if (groupNameKo) return `${groupNameKo} ${name}`;
      return `${name} ${qualifier}`;
    case "solo":
      return `${name} ${qualifier}`;
    case "group":
      return `${name} ${qualifier}`;
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

    const body = await req.json().catch(() => ({}));
    const offset = Number(body.offset) || 0;
    const batchId = body.batch_id || new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const isChainCall = !!body._chain;

    const sb = createClient(supabaseUrl, serviceKey);

    // Get all active stars (for group name lookup and final tier selection)
    const { data: allStars, error: starsErr } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko, star_category, image_url, star_type, group_star_id, search_qualifier")
      .eq("is_active", true)
      .order("display_name");

    if (starsErr) throw starsErr;
    if (!allStars || allStars.length === 0) {
      return new Response(JSON.stringify({ error: "No active stars found", count: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build group name lookup
    const groupStarIds = [...new Set(
      allStars.filter((s) => s.star_type === "member" && s.group_star_id)
        .map((s) => s.group_star_id!)
    )];
    const groupNameMap = new Map<string, string>();
    for (const gid of groupStarIds) {
      const group = allStars.find((s) => s.id === gid);
      if (group) groupNameMap.set(gid, group.name_ko || group.display_name);
    }
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

    // === CHUNK PROCESSING ===
    const chunk = allStars.slice(offset, offset + CHUNK_SIZE);
    const chunkResults: any[] = [];

    if (chunk.length > 0) {
      // First chunk: clear old prescores
      if (offset === 0) {
        await sb.from("ktrenz_b2_prescores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      }

      // Score this chunk
      for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
        const batch = chunk.slice(i, i + BATCH_SIZE);
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
        chunkResults.push(...batchResults);
        if (i + BATCH_SIZE < chunk.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // Save chunk results
      for (let i = 0; i < chunkResults.length; i += 500) {
        const c = chunkResults.slice(i, i + 500);
        await sb.from("ktrenz_b2_prescores").upsert(c, {
          onConflict: "star_id,batch_id",
          ignoreDuplicates: true,
        });
      }
    }

    const nextOffset = offset + CHUNK_SIZE;
    const hasMore = nextOffset < allStars.length;

    // If more stars remain, return progress for client to call next chunk
    if (hasMore) {
      return new Response(JSON.stringify({
        success: true,
        phase: "scoring",
        batch_id: batchId,
        processed: nextOffset,
        total: allStars.length,
        chunk_scored: chunkResults.length,
        has_more: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === FINAL CHUNK: Do tier selection ===
    const { data: allPrescores } = await sb
      .from("ktrenz_b2_prescores")
      .select("star_id, news_count, pre_score")
      .eq("batch_id", batchId)
      .order("pre_score", { ascending: false });

    const scoredResults = (allPrescores || []).filter((r: any) => r.news_count > 0);
    const totalScored = scoredResults.length;

    // Cooldown check
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);
    const { data: recentRuns } = await sb
      .from("ktrenz_b2_runs")
      .select("star_id")
      .gte("created_at", cooldownDate.toISOString());
    const recentStarIds = new Set((recentRuns || []).map((r: any) => r.star_id));

    const selectedStarIds: string[] = [];
    for (const tier of TIER_CONFIG) {
      const startIdx = Math.floor(totalScored * tier.startPct);
      const endIdx = Math.floor(totalScored * tier.endPct);
      const tierPool = scoredResults.slice(startIdx, endIdx);
      const available = tierPool.filter((r: any) => !recentStarIds.has(r.star_id));
      const cooldownOnly = tierPool.filter((r: any) => recentStarIds.has(r.star_id));
      const shuffled = shuffle(available);
      const picked = shuffled.slice(0, tier.count);
      if (picked.length < tier.count) {
        const remaining = tier.count - picked.length;
        picked.push(...shuffle(cooldownOnly).slice(0, remaining));
      }
      selectedStarIds.push(...picked.map((r: any) => r.star_id));
    }

    const selectedDetails = selectedStarIds.map((sid) => {
      const star = allStars.find((s) => s.id === sid);
      const score = scoredResults.find((r: any) => r.star_id === sid);
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
      phase: "complete",
      batch_id: batchId,
      total_stars: allStars.length,
      scored: totalScored,
      cooldown_excluded: recentStarIds.size,
      selected_count: selectedStarIds.length,
      selected: selectedDetails,
      top_10: scoredResults.slice(0, 10).map((r: any) => {
        const star = allStars.find((s) => s.id === r.star_id);
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
