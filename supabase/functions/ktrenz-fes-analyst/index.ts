// FES Analyst Agent: 정규화 조정, 변동 기여도 분석, 독립 트렌드 추적
// 6시간 주기로 data-engine 파이프라인 후단에서 실행
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHTS: Record<string, number> = {
  youtube: 0.37, buzz: 0.23, music: 0.18, album: 0.14, social: 0.05,
};
const CATEGORIES = ["youtube", "buzz", "album", "music", "social"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { wiki_entry_ids } = await req.json().catch(() => ({ wiki_entry_ids: null }));

    // ── 1) 대상 아티스트 조회 (Tier 1만 — 데이터 수집 대상만 정규화) ──
    let targetIds: string[] = wiki_entry_ids || [];
    if (!targetIds.length) {
      const { data: tiers } = await sb
        .from("v3_artist_tiers")
        .select("wiki_entry_id")
        .eq("tier", 1);
      targetIds = (tiers || []).map((t: any) => t.wiki_entry_id);
    }

    if (!targetIds.length) {
      return new Response(JSON.stringify({ ok: true, message: "No targets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2) 현재 스코어 + 24h 전 스냅샷 조회 ──
    const { data: currentScores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score, social_score")
      .in("wiki_entry_id", targetIds);

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 각 아티스트의 24h 전 스냅샷
    const { data: prevSnapshots } = await sb
      .from("v3_energy_snapshots_v2")
      .select("wiki_entry_id, youtube_score, buzz_score, album_score, music_score, social_score, snapshot_at")
      .in("wiki_entry_id", targetIds)
      .lte("snapshot_at", cutoff24h)
      .order("snapshot_at", { ascending: false });

    // 아티스트별 가장 최근 24h전 스냅샷 매핑
    const prevMap = new Map<string, any>();
    for (const snap of prevSnapshots || []) {
      if (!prevMap.has(snap.wiki_entry_id)) {
        prevMap.set(snap.wiki_entry_id, snap);
      }
    }

    // ── 3) 카테고리별 변동률 계산 → 전체 분포 통계 ──
    const changesByCategory: Record<string, number[]> = {
      youtube: [], buzz: [], album: [], music: [], social: [],
    };

    const artistChanges: { id: string; changes: Record<string, number> }[] = [];

    for (const cur of currentScores || []) {
      const prev = prevMap.get(cur.wiki_entry_id);
      const changes: Record<string, number> = {};

      const scoreMap: Record<string, [number, number]> = {
        youtube: [Number(cur.youtube_score) || 0, prev ? Number(prev.youtube_score) || 0 : 0],
        buzz: [Number(cur.buzz_score) || 0, prev ? Number(prev.buzz_score) || 0 : 0],
        album: [Number(cur.album_sales_score) || 0, prev ? Number(prev.album_score) || 0 : 0],
        music: [Number(cur.music_score) || 0, prev ? Number(prev.music_score) || 0 : 0],
        social: [Number(cur.social_score) || 0, prev ? Number(prev.social_score) || 0 : 0],
      };

      for (const cat of CATEGORIES) {
        const [c, p] = scoreMap[cat];
        const change = p > 0 ? ((c - p) / p) * 100 : (c > 0 ? 100 : 0);
        changes[cat] = change;
        changesByCategory[cat].push(change);
      }

      artistChanges.push({ id: cur.wiki_entry_id, changes });
    }

    // ── 4) 정규화 기준 통계 저장 (카테고리별 평균/표준편차) ──
    const normStats: Record<string, { mean: number; stddev: number; median: number; count: number }> = {};
    const now = new Date().toISOString();

    for (const cat of CATEGORIES) {
      const vals = changesByCategory[cat];
      const n = vals.length;
      if (n === 0) {
        normStats[cat] = { mean: 0, stddev: 1, median: 0, count: 0 };
        continue;
      }
      const mean = vals.reduce((a, b) => a + b, 0) / n;
      const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
      const stddev = Math.sqrt(variance) || 1; // 0 방지
      const sorted = [...vals].sort((a, b) => a - b);
      const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
      normStats[cat] = { mean, stddev, median, count: n };
    }

    // 정규화 통계 upsert
    const normRows = CATEGORIES.map(cat => ({
      category: cat,
      calculated_at: now,
      mean_change: Math.round(normStats[cat].mean * 100) / 100,
      stddev_change: Math.round(normStats[cat].stddev * 100) / 100,
      median_change: Math.round(normStats[cat].median * 100) / 100,
      sample_count: normStats[cat].count,
    }));
    await sb.from("ktrenz_normalization_stats").insert(normRows);

    // ── 5) 아티스트별 정규화 z-score 및 기여도 계산 ──
    const contribRows: any[] = [];

    for (const { id, changes } of artistChanges) {
      const zScores: Record<string, number> = {};
      let totalAbsWeightedZ = 0;

      for (const cat of CATEGORIES) {
        const z = (changes[cat] - normStats[cat].mean) / normStats[cat].stddev;
        zScores[cat] = Math.round(z * 100) / 100;
        totalAbsWeightedZ += Math.abs(z * WEIGHTS[cat]);
      }

      // 기여도: 가중 |z| / 전체 가중 |z| 합
      const contribs: Record<string, number> = {};
      for (const cat of CATEGORIES) {
        contribs[cat] = totalAbsWeightedZ > 0
          ? Math.round((Math.abs(zScores[cat] * WEIGHTS[cat]) / totalAbsWeightedZ) * 100)
          : Math.round(WEIGHTS[cat] * 100);
      }

      // 정규화 FES: 가중 z-score → 지수 감쇄 변환 (v6)
      // weightedZ > 0이면 상승 에너지, < 0이면 하락 에너지
      // 기본값 130(중립) + 방향성 보정, 10~250 범위
      const weightedZ = CATEGORIES.reduce((s, c) => s + zScores[c] * WEIGHTS[c], 0);
      const absZ = Math.abs(weightedZ);
      // 지수 감쇄: 0 → 0, 1 → ~86, 2 → ~150, 3 → ~190
      const magnitude = 120 * (1 - Math.exp(-absZ / 1.5));
      const normalizedFes = Math.round(
        Math.min(250, Math.max(10, 130 + Math.sign(weightedZ) * magnitude))
      );

      // 주도 카테고리
      let maxContrib = 0, leading = "youtube";
      for (const cat of CATEGORIES) {
        if (contribs[cat] > maxContrib) {
          maxContrib = contribs[cat];
          leading = cat;
        }
      }

      contribRows.push({
        wiki_entry_id: id,
        snapshot_at: now,
        youtube_z: zScores.youtube,
        buzz_z: zScores.buzz,
        album_z: zScores.album,
        music_z: zScores.music,
        social_z: zScores.social,
        youtube_contrib: contribs.youtube,
        buzz_contrib: contribs.buzz,
        album_contrib: contribs.album,
        music_contrib: contribs.music,
        social_contrib: contribs.social,
        normalized_fes: normalizedFes,
        leading_category: leading,
      });
    }

    // 배치 insert
    if (contribRows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < contribRows.length; i += batchSize) {
        await sb.from("ktrenz_fes_contributions").insert(contribRows.slice(i, i + batchSize));
      }

      // NOTE: energy_score는 calculate-energy-score(v5.5)가 관리.
      // FES Analyst의 normalized_fes는 ktrenz_fes_contributions에만 저장 (분석용).
      console.log(`[ktrenz-fes-analyst] Saved contributions for ${contribRows.length} artists (analysis only, no energy_score overwrite)`);
    }

    // ── 6) 독립 트렌드 계산 (7d/30d rolling) — 벌크 쿼리 최적화 ──
    const trendRows: any[] = [];
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 단일 벌크 쿼리: 전체 아티스트의 30일 기여도 한번에 조회
    // Supabase 1000행 제한 대응: 페이지네이션
    let allHistory: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk } = await sb
        .from("ktrenz_fes_contributions")
        .select("wiki_entry_id, snapshot_at, youtube_z, buzz_z, album_z, music_z, social_z")
        .in("wiki_entry_id", targetIds)
        .gte("snapshot_at", cutoff30d)
        .order("snapshot_at", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (!chunk || chunk.length === 0) break;
      allHistory = allHistory.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 아티스트별로 그룹핑 (in-memory)
    const historyByArtist = new Map<string, any[]>();
    for (const row of allHistory) {
      const list = historyByArtist.get(row.wiki_entry_id) || [];
      list.push(row);
      historyByArtist.set(row.wiki_entry_id, list);
    }

    const calcStats = (arr: number[]) => {
      if (arr.length === 0) return { avg: 0, stddev: 0, change: 0, latest: 0, earliest: 0 };
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, v) => a + (v - avg) ** 2, 0) / Math.max(arr.length - 1, 1);
      const change = arr.length >= 2 ? arr[arr.length - 1] - arr[0] : 0;
      return {
        avg: Math.round(avg * 100) / 100,
        stddev: Math.round(Math.sqrt(variance) * 100) / 100,
        change: Math.round(change * 100) / 100,
        latest: arr[arr.length - 1],
        earliest: arr[0],
      };
    };

    for (const entryId of targetIds) {
      const history = historyByArtist.get(entryId);
      if (!history || history.length < 2) continue;

      for (const cat of CATEGORIES) {
        const key = `${cat}_z`;
        const all30d = history.map((h: any) => Number(h[key]) || 0);
        const recent7d = history.filter((h: any) => h.snapshot_at >= cutoff7d).map((h: any) => Number(h[key]) || 0);

        const s7 = calcStats(recent7d);
        const s30 = calcStats(all30d);

        // Momentum: 7d 평균과 30d 평균의 차이 (절대 비교, 0 나누기 방지)
        // 양수 = 최근 7일이 30일 평균보다 활발, 음수 = 둔화
        const denominator = Math.max(Math.abs(s30.avg), s30.stddev, 0.1);
        const momentum = Math.round(((s7.avg - s30.avg) / denominator) * 100) / 100;

        // Direction: 7d 변동 기반, spike는 방향 구분
        let direction = "flat";
        if (Math.abs(s7.change) > 2) {
          direction = s7.change > 0 ? "spike" : "falling"; // spike는 양수일때만
        } else if (s7.change > 0.3) {
          direction = "rising";
        } else if (s7.change < -0.3) {
          direction = "falling";
        }

        // 추가: momentum이 강하면 direction 보정
        if (momentum > 1.5 && direction === "flat") direction = "rising";
        if (momentum < -1.5 && direction === "flat") direction = "falling";

        trendRows.push({
          wiki_entry_id: entryId,
          category: cat,
          calculated_at: now,
          avg_7d: s7.avg,
          stddev_7d: s7.stddev,
          change_7d: s7.change,
          avg_30d: s30.avg,
          stddev_30d: s30.stddev,
          change_30d: s30.change,
          trend_direction: direction,
          momentum,
        });
      }
    }

    if (trendRows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < trendRows.length; i += batchSize) {
        await sb.from("ktrenz_category_trends").insert(trendRows.slice(i, i + batchSize));
      }
    }

    const result = {
      ok: true,
      artists_processed: artistChanges.length,
      contributions_saved: contribRows.length,
      trends_saved: trendRows.length,
      normalization_stats: Object.fromEntries(CATEGORIES.map(c => [c, normStats[c]])),
    };

    console.log("[ktrenz-fes-analyst] Done:", JSON.stringify(result));

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ktrenz-fes-analyst] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
