// Fan Energy Score (FES) v5 — 카테고리별 24h 변동률 기반
// YouTube 40%, Buzz 25%, Music 20%, Album 15%
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEIGHTS = { youtube: 0.4, buzz: 0.25, music: 0.2, album: 0.15 };
const MAX_SCORE = 250;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Calculate % change, safe from divide-by-zero */
function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** Normalize a change rate into 20~250 score range (sigmoid-like) */
function changeToScore(change: number): number {
  // Map: -100% → 20, 0% → 135, +100% → 250
  const normalized = change / 100; // -1 to +1 range (can exceed)
  const sigmoid = 1 / (1 + Math.exp(-normalized * 3));
  return Math.round(20 + sigmoid * (MAX_SCORE - 20));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    // ── 1) 1군(tier=1) 아티스트 목록 ──
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean));

    const { data: v2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, youtube_score, buzz_score, album_sales_score, music_score, total_score")
      .order("total_score", { ascending: false })
      .limit(100);

    const scoreMap = new Map<string, any>();
    const entryIds: string[] = [];
    for (const s of (v2Scores || [])) {
      if (!scoreMap.has(s.wiki_entry_id) && tier1Ids.has(s.wiki_entry_id)) {
        scoreMap.set(s.wiki_entry_id, s);
        entryIds.push(s.wiki_entry_id);
      }
    }

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[FES-v5] Processing ${entryIds.length} artists...`);

    // ── 2) 스냅샷 기준값 가져오기 (24h 기본 + 최근 fallback) ──
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cutoff1h = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const prevSnapResults = await Promise.all(
      entryIds.map(async (eid) => {
        const { data } = await sb.from("v3_energy_snapshots_v2")
          .select("youtube_score, buzz_score, album_score, music_score, snapshot_at")
          .eq("wiki_entry_id", eid)
          .lt("snapshot_at", nowIso)
          .order("snapshot_at", { ascending: false })
          .limit(60);
        return { eid, snaps: data || [] };
      })
    );

    const pickPrevSnapshot = (snaps: any[], olderThanIso: string) => {
      const target = snaps.filter(
        (s: any) => new Date(s.snapshot_at).getTime() < new Date(olderThanIso).getTime()
      );
      if (!target.length) return null;

      const pick = (key: string) => {
        const found = target.find((s: any) => Number(s?.[key]) > 0);
        return found ? Number(found[key]) : 0;
      };

      return {
        youtube_score: pick("youtube_score"),
        buzz_score: pick("buzz_score"),
        album_score: pick("album_score"),
        music_score: pick("music_score"),
      };
    };

    const prevMap = new Map<string, any>();
    const recentPrevMap = new Map<string, any>();
    for (const r of prevSnapResults) {
      const prev24 = pickPrevSnapshot(r.snaps, cutoff24h);
      const prevRecent = pickPrevSnapshot(r.snaps, cutoff1h);
      if (prev24) prevMap.set(r.eid, prev24);
      if (prevRecent) recentPrevMap.set(r.eid, prevRecent);
    }

    // ── 3) 베이스라인 일괄 조회 ──
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) baselineMap.set(b.wiki_entry_id, b);

    // ── 4) 퍼센타일 기반 에너지 스코어 계산 ──
    // 4a) 각 카테고리별 raw 값 수집
    const rawData: { eid: string; yt: number; buzz: number; album: number; music: number; prev: any; prevRecent: any; current: any }[] = [];
    for (const eid of entryIds) {
      const current = scoreMap.get(eid)!;
      const prev = prevMap.get(eid);
      const prevRecent = recentPrevMap.get(eid);
      rawData.push({
        eid,
        yt: Number(current.youtube_score) || 0,
        buzz: Number(current.buzz_score) || 0,
        album: Number(current.album_sales_score) || 0,
        music: Number(current.music_score) || 0,
        prev,
        prevRecent,
        current,
      });
    }

    // 4b) 퍼센타일 함수: 정렬 후 각 값의 순위를 0~1로 변환
    function toPercentiles(values: number[]): number[] {
      const sorted = [...values].sort((a, b) => a - b);
      return values.map(v => {
        const rank = sorted.filter(s => s < v).length;
        const ties = sorted.filter(s => s === v).length;
        return (rank + (ties - 1) / 2) / Math.max(sorted.length - 1, 1);
      });
    }

    const ytPcts = toPercentiles(rawData.map(d => d.yt));
    const buzzPcts = toPercentiles(rawData.map(d => d.buzz));
    const albumPcts = toPercentiles(rawData.map(d => d.album));
    const musicPcts = toPercentiles(rawData.map(d => d.music));

    // 4c) 결과 생성
    const results: any[] = [];
    for (let i = 0; i < rawData.length; i++) {
      try {
        const r = rawData[i];
        const prev = r.prev;

        const ytPrev = prev ? Number(prev.youtube_score) || 0 : 0;
        const buzzPrev = prev ? Number(prev.buzz_score) || 0 : 0;
        const albumPrev = prev ? Number(prev.album_score) || 0 : 0;
        const musicPrev = prev ? Number(prev.music_score) || 0 : 0;

        let ytChange = pctChange(r.yt, ytPrev);
        let buzzChange = pctChange(r.buzz, buzzPrev);
        let albumChange = pctChange(r.album, albumPrev);
        let musicChange = pctChange(r.music, musicPrev);

        // 24h 비교가 전부 0이면, 최근(최소 1시간 이전) non-zero 스냅샷으로 fallback
        if (ytChange === 0 && buzzChange === 0 && albumChange === 0 && musicChange === 0 && r.prevRecent) {
          const p = r.prevRecent;
          const ytPrevRecent = Number(p.youtube_score) || 0;
          const buzzPrevRecent = Number(p.buzz_score) || 0;
          const albumPrevRecent = Number(p.album_score) || 0;
          const musicPrevRecent = Number(p.music_score) || 0;

          const hasRecentNonZero = [ytPrevRecent, buzzPrevRecent, albumPrevRecent, musicPrevRecent].some(v => v > 0);
          if (hasRecentNonZero) {
            ytChange = pctChange(r.yt, ytPrevRecent);
            buzzChange = pctChange(r.buzz, buzzPrevRecent);
            albumChange = pctChange(r.album, albumPrevRecent);
            musicChange = pctChange(r.music, musicPrevRecent);
          }
        }

        const overallChange = ytChange * WEIGHTS.youtube + buzzChange * WEIGHTS.buzz +
          musicChange * WEIGHTS.music + albumChange * WEIGHTS.album;

        // 퍼센타일 가중합 → 10~250 범위
        const weightedPct = ytPcts[i] * WEIGHTS.youtube + buzzPcts[i] * WEIGHTS.buzz +
          albumPcts[i] * WEIGHTS.album + musicPcts[i] * WEIGHTS.music;
        const energyScore = clamp(Math.round(10 + weightedPct * (MAX_SCORE - 10)), 10, MAX_SCORE);

        const ytVelocity = changeToScore(ytChange);
        const ytIntensity = clamp(Math.round(ytPcts[i] * MAX_SCORE), 0, MAX_SCORE);
        const buzzVelocity = changeToScore(buzzChange);
        const buzzIntensity = clamp(Math.round(buzzPcts[i] * MAX_SCORE), 0, MAX_SCORE);
        const albumVelocity = changeToScore(albumChange);
        const albumIntensity = clamp(Math.round(albumPcts[i] * MAX_SCORE), 0, MAX_SCORE);
        const musicVelocity = changeToScore(musicChange);
        const musicIntensity = clamp(Math.round(musicPcts[i] * MAX_SCORE), 0, MAX_SCORE);

        results.push({
          eid: r.eid, energyScore,
          ytVelocity, ytIntensity, buzzVelocity, buzzIntensity,
          albumVelocity, albumIntensity, musicVelocity, musicIntensity,
          change24h: Math.round(overallChange * 10) / 10,
          ytChange: Math.round(ytChange * 10) / 10,
          buzzChange: Math.round(buzzChange * 10) / 10,
          albumChange: Math.round(albumChange * 10) / 10,
          musicChange: Math.round(musicChange * 10) / 10,
          ytCurrent: r.yt, buzzCurrent: r.buzz, albumCurrent: r.album, musicCurrent: r.music,
          scoreId: r.current.id,
          baseline: baselineMap.get(r.eid),
        });
      } catch (e) {
        console.error(`[FES-v5] Error for ${rawData[i].eid}:`, e);
      }
    }

    // ── 5) DB writes ──
    console.log(`[FES-v5] Writing ${results.length} results...`);
    const writeOps: Promise<any>[] = [];

    for (const r of results) {
      // Snapshot with per-category scores
      writeOps.push(sb.from("v3_energy_snapshots_v2").insert({
        wiki_entry_id: r.eid,
        energy_score: r.energyScore,
        youtube_score: r.ytCurrent,
        buzz_score: r.buzzCurrent,
        album_score: r.albumCurrent,
        music_score: r.musicCurrent,
        youtube_velocity: r.ytVelocity,
        youtube_intensity: r.ytIntensity,
        buzz_velocity: r.buzzVelocity,
        buzz_intensity: r.buzzIntensity,
        album_velocity: r.albumVelocity,
        album_intensity: r.albumIntensity,
        music_velocity: r.musicVelocity,
        music_intensity: r.musicIntensity,
      }));

      // v3_scores_v2 update
      writeOps.push(sb.from("v3_scores_v2").update({
        energy_score: r.energyScore,
        energy_change_24h: r.change24h,
        youtube_change_24h: r.ytChange,
        buzz_change_24h: r.buzzChange,
        album_change_24h: r.albumChange,
        music_change_24h: r.musicChange,
        scored_at: new Date().toISOString(),
      }).eq("id", r.scoreId));

      // Baseline EMA
      if (r.baseline) {
        const a7 = 0.15, a30 = 0.05;
        writeOps.push(sb.from("v3_energy_baselines_v2").update({
          avg_energy_7d: Math.round(((r.baseline.avg_energy_7d || 100) * (1 - a7) + r.energyScore * a7) * 100) / 100,
          avg_energy_30d: Math.round(((r.baseline.avg_energy_30d || 100) * (1 - a30) + r.energyScore * a30) * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", r.eid));
      }
    }

    await Promise.all(writeOps);
    console.log(`[FES-v5] All writes completed`);

    // ── 6) energy_rank 업데이트 ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      await Promise.all(
        allV2Scores.map((s: any, i: number) =>
          sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id)
        )
      );
    }

    // ── 7) 마일스톤 감지 (간소화) ──
    try {
      const today = new Date().toISOString().slice(0, 10);
      const totalScoreRanked = [...(allV2Scores || [])]
        .filter((s: any) => tier1Ids.has(s.wiki_entry_id))
        .sort((a: any, b: any) => (b.energy_score || 0) - (a.energy_score || 0));

      const milestoneInserts: any[] = [];
      for (let i = 0; i < Math.min(3, totalScoreRanked.length); i++) {
        const s = totalScoreRanked[i];
        if (i === 0) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top1_ranking",
            milestone_date: today,
            value: s.energy_score || 0,
            metadata: { rank: 1 },
          });
        }
        milestoneInserts.push({
          wiki_entry_id: s.wiki_entry_id,
          milestone_type: "top3_ranking",
          milestone_date: today,
          value: i + 1,
          metadata: { energy_score: s.energy_score || 0 },
        });
      }
      if (milestoneInserts.length > 0) {
        await sb.from("v3_artist_milestones").upsert(milestoneInserts, {
          onConflict: "wiki_entry_id,milestone_type,milestone_date",
          ignoreDuplicates: true,
        });
      }
    } catch (e) {
      console.error("[FES-v5] Milestone error:", e);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      sample: results.slice(0, 3).map(r => ({
        eid: r.eid, energy: r.energyScore, change: r.change24h,
        yt: r.ytChange, buzz: r.buzzChange, album: r.albumChange, music: r.musicChange,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[FES-v5] Fatal:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
