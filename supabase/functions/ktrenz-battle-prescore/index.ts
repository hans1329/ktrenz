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
    const now = Date.now();
    const twoDaysAgo = now - 48 * 60 * 60 * 1000;
    let totalCount = 0;
    let start = 1;
    const maxStart = 1000; // 네이버 API start 최대값

    while (start <= maxStart) {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", query);
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(start));
      url.searchParams.set("sort", "date");
      const res = await fetchWithTimeout(url.toString(), {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });
      if (!res.ok) break;
      const data = await res.json();
      if (!data.items || data.items.length === 0) break;

      let reachedOld = false;
      for (const item of data.items) {
        const pubTime = new Date(item.pubDate).getTime();
        if (pubTime >= twoDaysAgo) {
          totalCount++;
        } else {
          reachedOld = true;
          break;
        }
      }

      if (reachedOld || data.items.length < 100) break;
      start += 100;
    }

    return totalCount;
  } catch {
    return 0;
  }
}


function buildSearchQuery(
  star: { name_ko: string | null; display_name: string; star_type: string; search_qualifier: string | null },
  groupNameKo: string | null
): string {
  const nameKo = star.name_ko;
  const nameEn = star.display_name;
  const qualifier = star.search_qualifier || "연예인";

  switch (star.star_type) {
    case "member":
      if (groupNameKo) return `${groupNameKo} ${nameKo || nameEn}`;
      return `${nameKo || nameEn} ${qualifier}`;
    case "solo":
      // 네이버 API는 | 를 OR 연산자로 사용
      if (nameKo && nameKo !== nameEn) return `"${nameKo}" | "${nameEn}"`;
      return `${nameKo || nameEn} ${qualifier}`;
    case "group":
      // 그룹은 한글명 | 영문명으로 검색 (예: "방탄소년단" | "BTS")
      if (nameKo && nameKo !== nameEn) return `"${nameKo}" | "${nameEn}"`;
      return `${nameKo || nameEn} ${qualifier}`;
    default:
      return `${nameKo || nameEn} ${qualifier}`;
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

    // === FINAL CHUNK: Return all scores (no tier selection here) ===
    const { data: allPrescores } = await sb
      .from("ktrenz_b2_prescores")
      .select("star_id, news_count, pre_score")
      .eq("batch_id", batchId)
      .order("pre_score", { ascending: false });

    const scoredResults = (allPrescores || []).filter((r: any) => r.news_count > 0);

    return new Response(JSON.stringify({
      success: true,
      phase: "complete",
      batch_id: batchId,
      total_stars: allStars.length,
      scored: scoredResults.length,
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
