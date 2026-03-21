// T2 Trend Track v2: 네이버 뉴스/블로그 건수 기반 buzz score 추적
// SerpAPI(Google Trends) 의존 제거 → 네이버 API(무료) 단독
// buzz_score = log정규화(뉴스건수)*0.5 + log정규화(블로그건수)*0.3 + 글로벌점수*0.2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Buzz Score 정규화: log10(count+1)/log10(cap)*100 ───
function normalizeBuzzScore(newsTotal: number, blogTotal: number, globalScore: number = 0): number {
  const newsCap = 1000;
  const blogCap = 10000;
  const newsNorm = newsTotal > 0 ? (Math.log10(newsTotal + 1) / Math.log10(newsCap)) * 100 : 0;
  const blogNorm = blogTotal > 0 ? (Math.log10(blogTotal + 1) / Math.log10(blogCap)) * 100 : 0;
  const buzzScore = Math.round(Math.min(newsNorm * 0.5 + blogNorm * 0.3 + globalScore * 0.2, 100));
  return buzzScore;
}

// ─── 네이버 검색 건수 조회 ───
async function searchNaverCount(
  clientId: string,
  clientSecret: string,
  endpoint: "news" | "blog",
  query: string,
): Promise<number> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", "1");
    url.searchParams.set("sort", "date");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!response.ok) return 0;
    const data = await response.json();
    return data.total || 0;
  } catch {
    return 0;
  }
}

// 인과관계 지표 업데이트: baseline 설정 + peak/influence 갱신
async function updateCausalMetrics(
  sb: any,
  triggerId: string,
  buzzScore: number
) {
  const { data: trigger } = await sb
    .from("ktrenz_trend_triggers")
    .select("baseline_score, peak_score")
    .eq("id", triggerId)
    .single();

  if (!trigger) return;

  const updates: any = {};
  const hasBaseline = trigger.baseline_score != null && trigger.baseline_score > 0;

  if (!hasBaseline && buzzScore > 0) {
    // 1회차: baseline이 감지 시 설정 안 됐으면 여기서 설정
    updates.baseline_score = buzzScore;
    updates.peak_score = buzzScore;
  } else if (hasBaseline) {
    if (buzzScore > (trigger.peak_score || 0)) {
      updates.peak_score = buzzScore;
      updates.peak_at = new Date().toISOString();
    }

    const baseline = trigger.baseline_score;
    const currentPeak = updates.peak_score ?? trigger.peak_score ?? buzzScore;
    if (baseline > 0 && currentPeak > baseline) {
      updates.influence_index = Math.round(((currentPeak - baseline) / baseline) * 10000) / 100;
    } else if (baseline > 0 && buzzScore < baseline) {
      updates.influence_index = Math.round(((buzzScore - baseline) / baseline) * 10000) / 100;
    }
  }

  if (Object.keys(updates).length > 0) {
    await sb
      .from("ktrenz_trend_triggers")
      .update(updates)
      .eq("id", triggerId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const COLLECTION_PAUSED = false;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      triggerId,
      batchSize = 5,
      batchOffset = 0,
      shopOnly = false,
    } = body;

    if (COLLECTION_PAUSED) {
      return new Response(
        JSON.stringify({
          success: true, paused: true, triggerId: triggerId ?? null,
          batchOffset, batchSize, message: "T2 trend tracking is temporarily paused",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const naverClientId = Deno.env.get("NAVER_CLIENT_ID") || "";
    const naverClientSecret = Deno.env.get("NAVER_CLIENT_SECRET") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!naverClientId || !naverClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "NAVER_CLIENT_ID/SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let triggers: any[];
    let totalTriggers = 0;

    if (triggerId) {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("id", triggerId)
        .single();
      triggers = data ? [data] : [];
      totalTriggers = triggers.length;
    } else {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let countQuery = sb
        .from("ktrenz_trend_triggers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("detected_at", weekAgo);

      let dataQuery = sb
        .from("ktrenz_trend_triggers")
        .select("*")
        .eq("status", "active")
        .gte("detected_at", weekAgo)
        .order("detected_at", { ascending: false });

      if (shopOnly) {
        countQuery = countQuery.eq("trigger_source", "naver_shop");
        dataQuery = dataQuery.eq("trigger_source", "naver_shop");
      } else {
        countQuery = countQuery.neq("trigger_source", "naver_shop");
        dataQuery = dataQuery.neq("trigger_source", "naver_shop");
      }

      const { count: exactCount } = await countQuery;
      totalTriggers = exactCount ?? 0;

      const { data } = await dataQuery.range(batchOffset, batchOffset + batchSize - 1);
      triggers = data || [];
    }

    if (!triggers.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active triggers to track", tracked: 0, totalTriggers }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 중복 제거: artist_name + keyword 조합 기준 ───
    const seen = new Map<string, string>();
    const dedupTriggers: any[] = [];
    const dupMap = new Map<string, string[]>();

    for (const t of triggers) {
      const key = `${t.artist_name}|${t.keyword}`;
      if (!seen.has(key)) {
        seen.set(key, t.id);
        dedupTriggers.push(t);
        dupMap.set(t.id, []);
      } else {
        const primaryId = seen.get(key)!;
        dupMap.get(primaryId)!.push(t.id);
      }
    }

    const skippedDups = triggers.length - dedupTriggers.length;
    console.log(`[trend-track] v2 Naver-based: ${dedupTriggers.length} unique (${skippedDups} dups skipped, offset=${batchOffset}, total=${totalTriggers})`);

    let trackedCount = 0;
    const results: any[] = [];

    for (const trigger of dedupTriggers) {
      try {
        // 키워드별 네이버 뉴스/블로그 건수 조회
        const kwQuery = trigger.keyword_ko || trigger.keyword;
        const artistLabel = trigger.artist_name;
        const searchQuery = `"${artistLabel}" "${kwQuery}"`;

        const [newsTotal, blogTotal] = await Promise.all([
          searchNaverCount(naverClientId, naverClientSecret, "news", searchQuery),
          searchNaverCount(naverClientId, naverClientSecret, "blog", searchQuery),
        ]);

        // 글로벌 소스의 경우 기존 baseline의 글로벌 점수를 재사용
        const isGlobal = trigger.trigger_source === "global_news";
        const globalScore = isGlobal ? (trigger.baseline_score || 0) : 0;

        const buzzScore = normalizeBuzzScore(newsTotal, blogTotal, globalScore);

        // 이전 추적 기록과 delta 계산
        const { data: prevTracking } = await sb
          .from("ktrenz_trend_tracking")
          .select("interest_score")
          .eq("trigger_id", trigger.id)
          .order("tracked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const prevScore = prevTracking?.interest_score || trigger.baseline_score || 0;
        const deltaPct = prevScore > 0
          ? ((buzzScore - prevScore) / prevScore) * 100
          : buzzScore > 0 ? 100 : 0;

        // tracking 레코드 저장
        await sb.from("ktrenz_trend_tracking").insert({
          trigger_id: trigger.id,
          wiki_entry_id: trigger.wiki_entry_id,
          keyword: trigger.keyword,
          interest_score: buzzScore,
          region: "naver",
          delta_pct: Math.round(deltaPct * 100) / 100,
          raw_response: {
            news_total: newsTotal,
            blog_total: blogTotal,
            global_score: globalScore,
            search_query: searchQuery,
          },
        });

        // 중복 트리거에도 동일 tracking 복사
        const dupIds = dupMap.get(trigger.id) || [];
        for (const dupId of dupIds) {
          const dupTrigger = triggers.find((t: any) => t.id === dupId);
          if (dupTrigger) {
            await sb.from("ktrenz_trend_tracking").insert({
              trigger_id: dupId,
              wiki_entry_id: dupTrigger.wiki_entry_id,
              keyword: dupTrigger.keyword,
              interest_score: buzzScore,
              region: "naver",
              delta_pct: Math.round(deltaPct * 100) / 100,
              raw_response: { news_total: newsTotal, blog_total: blogTotal },
            });
            await updateCausalMetrics(sb, dupId, buzzScore);
          }
        }

        // 인과관계 지표 업데이트
        await updateCausalMetrics(sb, trigger.id, buzzScore);

        trackedCount++;
        results.push({
          keyword: trigger.keyword,
          artist: trigger.artist_name,
          news_total: newsTotal,
          blog_total: blogTotal,
          buzz_score: buzzScore,
          delta_pct: Math.round(deltaPct * 100) / 100,
        });

        console.log(`[trend-track] ✓ "${trigger.artist_name}/${trigger.keyword}" → news=${newsTotal} blog=${blogTotal} buzz=${buzzScore} Δ=${Math.round(deltaPct)}%`);

        // 네이버 API 속도 제한 준수 (초당 10회 제한)
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn(`[trend-track] Error tracking ${trigger.keyword}: ${(e as Error).message}`);
      }

      // ─── 스마트 만료 ───
      const triggerAgeMs = Date.now() - new Date(trigger.detected_at).getTime();
      const triggerAgeDays = triggerAgeMs / (24 * 60 * 60 * 1000);
      const currentInfluence = trigger.influence_index ?? 0;

      let shouldExpire = false;
      let expireReason = "";

      // 1) 조기 만료: 3일+ & influence ≤ 5 & 최근 3회 연속 낮은 점수
      if (triggerAgeDays >= 3 && currentInfluence <= 5) {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentScores } = await sb
          .from("ktrenz_trend_tracking")
          .select("interest_score")
          .eq("trigger_id", trigger.id)
          .gte("tracked_at", threeDaysAgo)
          .order("tracked_at", { ascending: false })
          .limit(10);

        const scores = (recentScores ?? []).map((r: any) => r.interest_score);
        if (scores.length >= 3 && scores.every((s: number) => s <= (trigger.baseline_score ?? 10))) {
          shouldExpire = true;
          expireReason = "early_decay";
        }
      }

      // 2) 14일 초과: influence > 20이면 연장
      if (!shouldExpire && triggerAgeDays > 14) {
        if (currentInfluence > 20) {
          console.log(`[trend-track] Extended: ${trigger.keyword} (${trigger.artist_name}) — influence=${currentInfluence}`);
        } else {
          shouldExpire = true;
          expireReason = "lifecycle_end";
        }
      }

      // 3) 30일 하드캡
      if (!shouldExpire && triggerAgeDays > 30) {
        shouldExpire = true;
        expireReason = "hard_cap_30d";
      }

      if (shouldExpire) {
        const now = new Date();
        const lifetimeHours = Math.round((now.getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10;
        const peakDelayHours = trigger.peak_at
          ? Math.round((new Date(trigger.peak_at).getTime() - new Date(trigger.detected_at).getTime()) / 3600000 * 10) / 10
          : 0;

        await sb
          .from("ktrenz_trend_triggers")
          .update({
            status: "expired",
            expired_at: now.toISOString(),
            lifetime_hours: lifetimeHours,
            peak_delay_hours: peakDelayHours,
          })
          .eq("id", trigger.id);
        console.log(`[trend-track] Expired (${expireReason}): ${trigger.keyword} — lifetime=${lifetimeHours}h`);
      }
    }

    console.log(`[trend-track] Done: tracked ${trackedCount} keywords via Naver`);

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        totalCandidates: totalTriggers,
        totalTriggers,
        triggersProcessed: triggers.length,
        uniqueTracked: dedupTriggers.length,
        duplicatesSkipped: skippedDups,
        tracked: trackedCount,
        throttled: false,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[trend-track] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
