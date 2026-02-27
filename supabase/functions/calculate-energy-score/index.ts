// Fan Energy Score (FES) v4 — 변동률 직접 반영 엔진
// 어제 대비 변동률이 클수록 에너지 점수가 높아지도록 설계
// energy_change_24h와 energy_score의 일관성 확보
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SCORE = 250;

/**
 * Percentile-based score: 순위 기반으로 20~250 점수 부여
 */
function percentileScore(rank: number, total: number): number {
  if (total <= 1) return 100;
  const pct = 1 - (rank - 1) / (total - 1);
  return Math.round(20 + pct * (MAX_SCORE - 20));
}

/** ktrenz_data_snapshots에서 최신 데이터를 가져오는 헬퍼 */
async function getLatestSnapshots(sb: any, entryId: string) {
  const [buzzRes, ytRes] = await Promise.all([
    sb.from("ktrenz_data_snapshots")
      .select("metrics")
      .eq("wiki_entry_id", entryId)
      .eq("platform", "buzz_multi")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("ktrenz_data_snapshots")
      .select("metrics")
      .eq("wiki_entry_id", entryId)
      .eq("platform", "youtube")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const buzzMetrics = (buzzRes.data?.metrics as any) || {};
  const ytMetrics = (ytRes.data?.metrics as any) || {};

  return {
    totalMentions: buzzMetrics.total_mentions || 0,
    sentimentScore: buzzMetrics.sentiment_score || 50,
    buzzScore: buzzMetrics.buzz_score || 0,
    recentTotalViews: ytMetrics.recentTotalViews || 0,
  };
}

interface ArtistData {
  entryId: string;
  totalMentions: number;
  sentimentScore: number;
  buzzScore: number;
  recentTotalViews: number;
  qualityMentions: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const resetBaselines = body.resetBaselines === true;

    // ── 베이스라인 리셋 모드 ──
    if (resetBaselines) {
      const { data: allBaselines } = await sb
        .from("v3_energy_baselines_v2")
        .select("wiki_entry_id");
      
      const eids = (allBaselines || []).map((r: any) => r.wiki_entry_id);
      console.log(`[FES-v4] Resetting ${eids.length} baselines...`);

      const snapResults = await Promise.all(
        eids.map((eid: string) => getLatestSnapshots(sb, eid).then(snap => ({ eid, snap })))
      );

      await Promise.all(
        snapResults.map(({ eid, snap }) => {
          const sentMul = 0.7 + (snap.sentimentScore / 100) * 0.6;
          const qualityMentions = snap.totalMentions * sentMul;
          return sb.from("v3_energy_baselines_v2").update({
            avg_velocity_7d: Math.max(snap.totalMentions, 1),
            avg_velocity_30d: Math.max(snap.recentTotalViews, 1),
            avg_intensity_7d: Math.max(snap.buzzScore, 1),
            avg_intensity_30d: Math.max(qualityMentions, 1),
            avg_energy_7d: 100,
            avg_energy_30d: 100,
            updated_at: new Date().toISOString(),
          }).eq("wiki_entry_id", eid);
        })
      );

      console.log(`[FES-v4] Reset ${eids.length} baselines`);
      return new Response(JSON.stringify({ success: true, message: `Reset ${eids.length} baselines` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 1) 1군(tier=1) 아티스트만 에너지 스코어 계산 ──
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean));

    const { data: v2Scores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score")
      .order("total_score", { ascending: false })
      .limit(100);

    let entryIds: string[] = [];
    if (v2Scores?.length) {
      const seen = new Set<string>();
      for (const s of v2Scores) {
        if (!seen.has(s.wiki_entry_id) && tier1Ids.has(s.wiki_entry_id)) {
          seen.add(s.wiki_entry_id);
          entryIds.push(s.wiki_entry_id);
        }
      }
    }

    if (!entryIds.length) {
      return new Response(JSON.stringify({ success: true, message: "No entries to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2) 모든 아티스트 데이터 병렬 수집 ──
    console.log(`[FES-v4] Fetching data for ${entryIds.length} artists...`);
    const snapResults = await Promise.all(
      entryIds.map(entryId => getLatestSnapshots(sb, entryId).then(snap => ({ entryId, snap })))
    );
    const allArtists: ArtistData[] = snapResults.map(({ entryId, snap }) => {
      const sentMul = 0.7 + (snap.sentimentScore / 100) * 0.6;
      return {
        entryId,
        totalMentions: snap.totalMentions,
        sentimentScore: snap.sentimentScore,
        buzzScore: snap.buzzScore,
        recentTotalViews: snap.recentTotalViews,
        qualityMentions: snap.totalMentions * sentMul,
      };
    });

    const total = allArtists.length;
    console.log(`[FES-v4] Data collected for ${total} artists`);

    // ── 3) 절대 지표 랭킹 (Velocity + Intensity) ──
    function rankBy(arr: ArtistData[], key: keyof ArtistData): Map<string, number> {
      const sorted = [...arr].sort((a, b) => (b[key] as number) - (a[key] as number));
      const rankMap = new Map<string, number>();
      sorted.forEach((item, idx) => rankMap.set(item.entryId, idx + 1));
      return rankMap;
    }

    const mentionsRank = rankBy(allArtists, "totalMentions");
    const viewsRank = rankBy(allArtists, "recentTotalViews");
    const buzzScoreRank = rankBy(allArtists, "buzzScore");
    const qualityMentionsRank = rankBy(allArtists, "qualityMentions");

    // 각 아티스트의 absolute_score 계산 (순수 지표 순위 기반)
    const absoluteScores = new Map<string, number>();
    for (const artist of allArtists) {
      const mentionPct = percentileScore(mentionsRank.get(artist.entryId)!, total);
      const viewPct = percentileScore(viewsRank.get(artist.entryId)!, total);
      const velocity = Math.round(mentionPct * 0.6 + viewPct * 0.4);

      const buzzPct = percentileScore(buzzScoreRank.get(artist.entryId)!, total);
      const qualPct = percentileScore(qualityMentionsRank.get(artist.entryId)!, total);
      const intensity = Math.round(buzzPct * 0.5 + qualPct * 0.5);

      const absScore = Math.round(velocity * 0.5 + intensity * 0.5);
      absoluteScores.set(artist.entryId, absScore);
    }

    // ── 4) 어제 스냅샷 대비 변동률 계산 (momentum) ──
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const prevSnapshotResults = await Promise.all(
      allArtists.map(artist =>
        sb.from("v3_energy_snapshots_v2")
          .select("energy_score")
          .eq("wiki_entry_id", artist.entryId)
          .lt("snapshot_at", todayStart.toISOString())
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: any) => ({ entryId: artist.entryId, data: r.data }))
      )
    );
    const prevSnapshotMap = new Map<string, number>();
    for (const r of prevSnapshotResults) {
      if (r.data?.energy_score) prevSnapshotMap.set(r.entryId, Number(r.data.energy_score));
    }

    // 변동률 = (absolute_score - yesterday_energy_score) / yesterday_energy_score
    // 어제 스냅샷이 없는 경우: momentum을 median(중앙값)으로 설정하여 중립 처리
    const momentumValues: { entryId: string; momentum: number; hasPrev: boolean }[] = [];
    for (const artist of allArtists) {
      const absScore = absoluteScores.get(artist.entryId)!;
      const prevScore = prevSnapshotMap.get(artist.entryId);
      if (prevScore && prevScore > 0) {
        const momentum = ((absScore - prevScore) / prevScore) * 100;
        momentumValues.push({ entryId: artist.entryId, momentum, hasPrev: true });
      } else {
        // 어제 데이터 없음 — 나중에 중앙값으로 채움
        momentumValues.push({ entryId: artist.entryId, momentum: 0, hasPrev: false });
      }
    }

    // 어제 스냅샷이 있는 아티스트들의 중앙값 계산
    const withPrev = momentumValues.filter(v => v.hasPrev).map(v => v.momentum).sort((a, b) => a - b);
    const medianMomentum = withPrev.length > 0 
      ? withPrev[Math.floor(withPrev.length / 2)] 
      : 0;
    // 스냅샷 없는 아티스트에 중앙값 할당
    for (const v of momentumValues) {
      if (!v.hasPrev) v.momentum = medianMomentum;
    }

    // 변동률 percentile 랭킹 (높을수록 1등)
    const sortedMomentum = [...momentumValues].sort((a, b) => b.momentum - a.momentum);
    const momentumRankMap = new Map<string, number>();
    sortedMomentum.forEach((item, idx) => momentumRankMap.set(item.entryId, idx + 1));

    // ── 5) 최종 energy_score = absolute * 0.1 + momentum_percentile * 0.9 ──
    // 기존 v2 scores 일괄 조회
    const existingScoreResults = await Promise.all(
      allArtists.map(artist =>
        sb.from("v3_scores_v2")
          .select("id, youtube_score, buzz_score, total_score")
          .eq("wiki_entry_id", artist.entryId)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r: any) => ({ entryId: artist.entryId, data: r.data }))
      )
    );
    const existingScoreMap = new Map<string, any>();
    for (const r of existingScoreResults) existingScoreMap.set(r.entryId, r.data);

    // 베이스라인 일괄 조회
    const { data: allBaselines } = await sb
      .from("v3_energy_baselines_v2")
      .select("*")
      .in("wiki_entry_id", entryIds);
    const baselineMap = new Map<string, any>();
    for (const b of (allBaselines || [])) baselineMap.set(b.wiki_entry_id, b);

    console.log(`[FES-v4] Computing final scores...`);
    const results: any[] = [];

    for (const artist of allArtists) {
      try {
        const absScore = absoluteScores.get(artist.entryId)!;
        const momRank = momentumRankMap.get(artist.entryId)!;
        const momPctScore = percentileScore(momRank, total);

        // 최종 점수: 절대값 10% + 모멘텀 90%
        let energyScore = Math.round(absScore * 0.1 + momPctScore * 0.9);
        energyScore = Math.max(10, Math.min(MAX_SCORE, energyScore));

        // velocity와 intensity는 기존 방식 유지 (스냅샷 저장용)
        const mentionPct = percentileScore(mentionsRank.get(artist.entryId)!, total);
        const viewPct = percentileScore(viewsRank.get(artist.entryId)!, total);
        const velocity = Math.round(mentionPct * 0.6 + viewPct * 0.4);

        const buzzPct = percentileScore(buzzScoreRank.get(artist.entryId)!, total);
        const qualPct = percentileScore(qualityMentionsRank.get(artist.entryId)!, total);
        const intensity = Math.round(buzzPct * 0.5 + qualPct * 0.5);

        // energy_change_24h = 모멘텀 계산에 사용된 동일한 변동률 사용 (일관성 확보)
        const momEntry = momentumValues.find(v => v.entryId === artist.entryId);
        const change24h = momEntry ? momEntry.momentum : 0;

        results.push({
          wikiEntryId: artist.entryId,
          velocity, intensity, energyScore,
          momentumScore: momPctScore,
          absoluteScore: absScore,
          change24h: Math.round(change24h * 10) / 10,
          existingScore: existingScoreMap.get(artist.entryId),
          baseline: baselineMap.get(artist.entryId),
        });
      } catch (e) {
        console.error(`[FES-v4] Error calculating ${artist.entryId}:`, e);
      }
    }

    // ── 6) 모든 DB 쓰기를 병렬로 실행 ──
    console.log(`[FES-v4] Writing ${results.length} results...`);
    const writeOps: Promise<any>[] = [];
    for (const r of results) {
      // 스냅샷 저장
      writeOps.push(sb.from("v3_energy_snapshots_v2").insert({
        wiki_entry_id: r.wikiEntryId,
        velocity_score: r.velocity,
        intensity_score: r.intensity,
        energy_score: r.energyScore,
      }));

      // v2 scores upsert — 기존 데이터 보존하면서 에너지만 업데이트
      if (r.existingScore) {
        writeOps.push(sb.from("v3_scores_v2").update({
          energy_score: r.energyScore,
          energy_change_24h: r.change24h,
          scored_at: new Date().toISOString(),
        }).eq("id", r.existingScore.id));
      } else {
        writeOps.push(sb.from("v3_scores_v2").upsert({
          wiki_entry_id: r.wikiEntryId,
          energy_score: r.energyScore,
          energy_change_24h: r.change24h,
          youtube_score: 0, buzz_score: 0, total_score: 0,
        }, { onConflict: "wiki_entry_id", ignoreDuplicates: false }));
      }

      // 베이스라인 EMA 갱신
      if (r.baseline) {
        const a7 = 0.15, a30 = 0.05;
        writeOps.push(sb.from("v3_energy_baselines_v2").update({
          avg_velocity_7d: Math.round(((r.baseline.avg_velocity_7d || 1) * (1 - a7) + allArtists.find(a => a.entryId === r.wikiEntryId)!.totalMentions * a7) * 100) / 100,
          avg_velocity_30d: Math.round(((r.baseline.avg_velocity_30d || 1) * (1 - a30) + allArtists.find(a => a.entryId === r.wikiEntryId)!.recentTotalViews * a30) * 100) / 100,
          avg_intensity_7d: Math.round(((r.baseline.avg_intensity_7d || 1) * (1 - a7) + allArtists.find(a => a.entryId === r.wikiEntryId)!.buzzScore * a7) * 100) / 100,
          avg_intensity_30d: Math.round(((r.baseline.avg_intensity_30d || 1) * (1 - a30) + allArtists.find(a => a.entryId === r.wikiEntryId)!.qualityMentions * a30) * 100) / 100,
          avg_energy_7d: Math.round(((r.baseline.avg_energy_7d || 100) * (1 - a7) + r.energyScore * a7) * 100) / 100,
          avg_energy_30d: Math.round(((r.baseline.avg_energy_30d || 100) * (1 - a30) + r.energyScore * a30) * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq("wiki_entry_id", r.wikiEntryId));
      }
    }
    await Promise.all(writeOps);
    console.log(`[FES-v4] All writes completed`);

    // ── 7) energy_rank 일괄 업데이트 ──
    const { data: allV2Scores } = await sb
      .from("v3_scores_v2")
      .select("id, wiki_entry_id, energy_score, total_score, buzz_score")
      .order("energy_score", { ascending: false });

    if (allV2Scores) {
      const updates = allV2Scores.map((s: any, i: number) => 
        sb.from("v3_scores_v2").update({ energy_rank: i + 1 }).eq("id", s.id)
      );
      await Promise.all(updates);
    }

    // ── 8) 마일스톤 자동 감지 ──
    try {
      const totalScoreRanked = [...(allV2Scores || [])]
        .filter((s: any) => tier1Ids.has(s.wiki_entry_id))
        .sort((a: any, b: any) => (b.total_score || 0) - (a.total_score || 0));
      
      const today = new Date().toISOString().slice(0, 10);
      const milestoneInserts: any[] = [];

      for (let i = 0; i < totalScoreRanked.length; i++) {
        const s = totalScoreRanked[i];
        const rank = i + 1;
        if (rank === 1) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top1_ranking",
            milestone_date: today,
            value: s.total_score || 0,
            metadata: { rank: 1 },
          });
        }
        if (rank <= 3) {
          milestoneInserts.push({
            wiki_entry_id: s.wiki_entry_id,
            milestone_type: "top3_ranking",
            milestone_date: today,
            value: rank,
            metadata: { total_score: s.total_score || 0 },
          });
        }
      }

      // Tier 1 진입 감지
      const { data: yesterdayTiers } = await sb
        .from("v3_artist_milestones")
        .select("wiki_entry_id")
        .eq("milestone_type", "tier1_entry")
        .gte("milestone_date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
      const recentTier1Set = new Set((yesterdayTiers || []).map((t: any) => t.wiki_entry_id));

      for (const eid of tier1Ids) {
        if (!recentTier1Set.has(eid)) {
          const { data: anyPrev } = await sb
            .from("v3_artist_milestones")
            .select("id")
            .eq("wiki_entry_id", eid)
            .eq("milestone_type", "tier1_entry")
            .limit(1)
            .maybeSingle();
          if (!anyPrev) {
            milestoneInserts.push({
              wiki_entry_id: eid,
              milestone_type: "tier1_entry",
              milestone_date: today,
              value: null,
            });
          }
        }
      }

      // 최고 에너지 / 최고 버즈 감지
      for (const s of (allV2Scores || []).filter((x: any) => tier1Ids.has(x.wiki_entry_id))) {
        if (s.energy_score > 0) {
          const { data: prevMax } = await sb
            .from("v3_artist_milestones")
            .select("value")
            .eq("wiki_entry_id", s.wiki_entry_id)
            .eq("milestone_type", "highest_energy")
            .order("value", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!prevMax || s.energy_score > Number(prevMax.value)) {
            milestoneInserts.push({
              wiki_entry_id: s.wiki_entry_id,
              milestone_type: "highest_energy",
              milestone_date: today,
              value: s.energy_score,
            });
          }
        }
        if (s.buzz_score > 0) {
          const { data: prevMaxBuzz } = await sb
            .from("v3_artist_milestones")
            .select("value")
            .eq("wiki_entry_id", s.wiki_entry_id)
            .eq("milestone_type", "highest_buzz")
            .order("value", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!prevMaxBuzz || s.buzz_score > Number(prevMaxBuzz.value)) {
            milestoneInserts.push({
              wiki_entry_id: s.wiki_entry_id,
              milestone_type: "highest_buzz",
              milestone_date: today,
              value: s.buzz_score,
            });
          }
        }
      }

      if (milestoneInserts.length > 0) {
        const { error: msErr } = await sb
          .from("v3_artist_milestones")
          .upsert(milestoneInserts, { onConflict: "wiki_entry_id,milestone_type,milestone_date" });
        if (msErr) console.warn("[FES-v4] Milestone insert warning:", msErr.message);
        else console.log(`[FES-v4] Recorded ${milestoneInserts.length} milestones`);
      }
    } catch (msError) {
      console.warn("[FES-v4] Milestone detection error (non-fatal):", msError);
    }

    console.log(`[FES-v4] Processed ${results.length} entries`);

    return new Response(JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[FES-v4] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
