// Velocity Profiler: 아티스트별 시계열 패턴 프로파일링
// 일간 크론으로 실행 — (A) 이벤트 기반 D-7~D+30 커브, (B) 롤링 7d/30d/90d 통계
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = ["youtube", "buzz", "album", "music", "social"] as const;
const WINDOWS = ["7d", "30d", "90d"] as const;
const WINDOW_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

// Velocity 필드 매핑
const VELOCITY_FIELDS: Record<string, string> = {
  youtube: "youtube_velocity",
  buzz: "buzz_velocity",
  album: "album_velocity",
  music: "music_velocity",
  social: "social_velocity",
};
const INTENSITY_FIELDS: Record<string, string> = {
  youtube: "youtube_intensity",
  buzz: "buzz_intensity",
  album: "album_intensity",
  music: "music_intensity",
  social: "social_intensity",
};

function calcStats(arr: number[]) {
  if (arr.length === 0) return { avg: 0, max: 0, min: 0, stddev: 0 };
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, v) => a + (v - avg) ** 2, 0) / Math.max(arr.length - 1, 1);
  return {
    avg: Math.round(avg * 100) / 100,
    max: Math.max(...arr),
    min: Math.min(...arr),
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const nowIso = now.toISOString();

    // Tier 1 아티스트만 대상
    const { data: tiers } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const targetIds = (tiers || []).map((t: any) => t.wiki_entry_id);

    if (!targetIds.length) {
      return new Response(JSON.stringify({ ok: true, message: "No targets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════
    // (A) 롤링 윈도우 Velocity 통계 (7d/30d/90d)
    // ═══════════════════════════════════════════════════

    // 90일치 스냅샷 벌크 조회
    const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    let allSnaps: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk } = await sb
        .from("v3_energy_snapshots_v2")
        .select("wiki_entry_id, snapshot_at, energy_score, youtube_velocity, buzz_velocity, album_velocity, music_velocity, social_velocity, youtube_intensity, buzz_intensity, album_intensity, music_intensity, social_intensity")
        .in("wiki_entry_id", targetIds)
        .gte("snapshot_at", cutoff90d)
        .order("snapshot_at", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (!chunk || chunk.length === 0) break;
      allSnaps = allSnaps.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    console.log(`[velocity-profiler] Loaded ${allSnaps.length} snapshots for ${targetIds.length} artists`);

    // 아티스트별 그룹핑
    const snapsByArtist = new Map<string, any[]>();
    for (const s of allSnaps) {
      const list = snapsByArtist.get(s.wiki_entry_id) || [];
      list.push(s);
      snapsByArtist.set(s.wiki_entry_id, list);
    }

    const statsRows: any[] = [];

    for (const eid of targetIds) {
      const snaps = snapsByArtist.get(eid);
      if (!snaps || snaps.length < 2) continue;

      for (const win of WINDOWS) {
        const days = WINDOW_DAYS[win];
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const windowSnaps = snaps.filter((s: any) => s.snapshot_at >= cutoff);
        if (windowSnaps.length < 2) continue;

        for (const cat of CATEGORIES) {
          const velField = VELOCITY_FIELDS[cat];
          const intField = INTENSITY_FIELDS[cat];
          const velocities = windowSnaps.map((s: any) => Number(s[velField]) || 0);
          const intensities = windowSnaps.map((s: any) => Number(s[intField]) || 0);

          const stats = calcStats(velocities);
          const intStats = calcStats(intensities);

          // 스파이크/드롭 카운트 (velocity > 100 or < -100)
          const spikeCount = velocities.filter(v => v > 100).length;
          const dropCount = velocities.filter(v => v < -100).length;

          // peak/trough 시점
          let peakIdx = 0, troughIdx = 0;
          for (let i = 0; i < velocities.length; i++) {
            if (velocities[i] > velocities[peakIdx]) peakIdx = i;
            if (velocities[i] < velocities[troughIdx]) troughIdx = i;
          }

          // 트렌드 방향: 후반 1/3 평균 vs 전반 1/3 평균
          const third = Math.max(1, Math.floor(velocities.length / 3));
          const earlyAvg = velocities.slice(0, third).reduce((a, b) => a + b, 0) / third;
          const lateAvg = velocities.slice(-third).reduce((a, b) => a + b, 0) / third;
          const diff = lateAvg - earlyAvg;
          let trend = "flat";
          if (diff > 30) trend = "accelerating";
          else if (diff > 10) trend = "rising";
          else if (diff < -30) trend = "decelerating";
          else if (diff < -10) trend = "falling";

          statsRows.push({
            wiki_entry_id: eid,
            category: cat,
            time_window: win,
            calculated_at: nowIso,
            avg_velocity: stats.avg,
            max_velocity: stats.max,
            min_velocity: stats.min,
            stddev_velocity: stats.stddev,
            avg_intensity: intStats.avg,
            velocity_trend: trend,
            spike_count: spikeCount,
            drop_count: dropCount,
            peak_day: windowSnaps[peakIdx]?.snapshot_at || null,
            trough_day: windowSnaps[troughIdx]?.snapshot_at || null,
            sample_count: velocities.length,
          });
        }
      }
    }

    // Upsert 롤링 통계
    if (statsRows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < statsRows.length; i += batchSize) {
        await sb.from("ktrenz_velocity_stats")
          .upsert(statsRows.slice(i, i + batchSize), {
            onConflict: "wiki_entry_id,category,time_window",
          });
      }
    }
    console.log(`[velocity-profiler] Rolling stats: ${statsRows.length} rows upserted`);

    // ═══════════════════════════════════════════════════
    // (B) 이벤트 기반 Velocity 프로파일 (스케줄 + 마일스톤)
    // ═══════════════════════════════════════════════════

    // 최근 60일 이내 이벤트 조회 (스케줄 + 마일스톤)
    const eventCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: schedules }, { data: milestones }] = await Promise.all([
      sb.from("ktrenz_schedules")
        .select("id, wiki_entry_id, schedule_date, event_type, title")
        .in("wiki_entry_id", targetIds)
        .gte("schedule_date", eventCutoff)
        .order("schedule_date", { ascending: true }),
      sb.from("ktrenz_milestone_events")
        .select("id, wiki_entry_id, event_type, event_data, created_at")
        .in("wiki_entry_id", targetIds)
        .gte("created_at", eventCutoff)
        .order("created_at", { ascending: true }),
    ]);

    // 이벤트 통합
    const events: { id: string; eid: string; type: string; name: string; date: Date }[] = [];

    for (const s of (schedules || [])) {
      events.push({
        id: s.id,
        eid: s.wiki_entry_id,
        type: `schedule_${s.event_type || "event"}`,
        name: s.title || s.event_type || "Event",
        date: new Date(s.schedule_date),
      });
    }
    for (const m of (milestones || [])) {
      events.push({
        id: m.id,
        eid: m.wiki_entry_id,
        type: m.event_type,
        name: (m.event_data as any)?.chart_name || m.event_type,
        date: new Date(m.created_at),
      });
    }

    console.log(`[velocity-profiler] Found ${events.length} events to profile`);

    // 이미 프로파일링된 이벤트 확인 (중복 방지)
    const eventIds = events.map(e => e.id);
    const { data: existingProfiles } = await sb
      .from("ktrenz_velocity_profiles")
      .select("event_id")
      .in("event_id", eventIds.length > 0 ? eventIds : ["__none__"]);
    const profiledEvents = new Set((existingProfiles || []).map((p: any) => p.event_id));

    const profileRows: any[] = [];
    const summaryMap = new Map<string, any>();

    for (const event of events) {
      if (profiledEvents.has(event.id)) continue;

      const snaps = snapsByArtist.get(event.eid);
      if (!snaps || snaps.length < 2) continue;

      const eventDateMs = event.date.getTime();

      for (const cat of CATEGORIES) {
        const velField = VELOCITY_FIELDS[cat];
        const intField = INTENSITY_FIELDS[cat];

        // D-7 ~ D+30 범위의 스냅샷 매핑
        const preVels: number[] = [];
        const postVels: number[] = [];
        let peakVel = 0;
        let peakOffset = 0;

        for (const snap of snaps) {
          const snapMs = new Date(snap.snapshot_at).getTime();
          const dayOffset = Math.round((snapMs - eventDateMs) / (24 * 60 * 60 * 1000));

          if (dayOffset < -7 || dayOffset > 30) continue;

          const vel = Number(snap[velField]) || 0;
          const intensity = Number(snap[intField]) || 0;

          profileRows.push({
            wiki_entry_id: event.eid,
            event_id: event.id,
            event_type: event.type,
            event_name: event.name,
            event_date: event.date.toISOString().split("T")[0],
            day_offset: dayOffset,
            category: cat,
            velocity: vel,
            intensity,
            energy_score: Number(snap.energy_score) || 0,
            raw_score: 0,
            change_pct: 0,
            snapshot_at: snap.snapshot_at,
          });

          if (dayOffset < 0) preVels.push(vel);
          else postVels.push(vel);
          if (Math.abs(vel) > Math.abs(peakVel)) {
            peakVel = vel;
            peakOffset = dayOffset;
          }
        }

        // 요약 집계
        const summaryKey = `${event.eid}:${event.type}:${cat}`;
        const existing = summaryMap.get(summaryKey);
        const preAvg = preVels.length > 0 ? preVels.reduce((a, b) => a + b, 0) / preVels.length : 0;
        const postAvg = postVels.length > 0 ? postVels.reduce((a, b) => a + b, 0) / postVels.length : 0;

        // 회복 기간: peak 이후 velocity가 pre 수준으로 돌아오는 데 걸린 일수
        let recoveryDays: number | null = null;
        if (postVels.length > 2 && peakOffset >= 0) {
          const preLevel = Math.abs(preAvg);
          for (let i = 0; i < postVels.length; i++) {
            if (Math.abs(postVels[i]) <= preLevel * 1.2) {
              recoveryDays = i + 1;
              break;
            }
          }
        }

        if (existing) {
          const n = existing.event_count;
          existing.avg_pre_velocity = Math.round(((existing.avg_pre_velocity * n + preAvg) / (n + 1)) * 100) / 100;
          existing.avg_peak_velocity = Math.round(((existing.avg_peak_velocity * n + peakVel) / (n + 1)) * 100) / 100;
          existing.avg_post_velocity = Math.round(((existing.avg_post_velocity * n + postAvg) / (n + 1)) * 100) / 100;
          existing.avg_peak_day_offset = Math.round((existing.avg_peak_day_offset * n + peakOffset) / (n + 1));
          if (recoveryDays != null) {
            existing.avg_recovery_days = existing.avg_recovery_days != null
              ? Math.round((existing.avg_recovery_days * n + recoveryDays) / (n + 1))
              : recoveryDays;
          }
          existing.event_count = n + 1;
          existing.updated_at = nowIso;
        } else {
          summaryMap.set(summaryKey, {
            wiki_entry_id: event.eid,
            event_type: event.type,
            category: cat,
            avg_pre_velocity: Math.round(preAvg * 100) / 100,
            avg_peak_velocity: peakVel,
            avg_post_velocity: Math.round(postAvg * 100) / 100,
            avg_peak_day_offset: peakOffset,
            avg_recovery_days: recoveryDays,
            event_count: 1,
            updated_at: nowIso,
          });
        }
      }
    }

    // Insert 프로파일 행
    if (profileRows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < profileRows.length; i += batchSize) {
        await sb.from("ktrenz_velocity_profiles").insert(profileRows.slice(i, i + batchSize));
      }
    }

    // Upsert 요약
    const summaryRows = Array.from(summaryMap.values());
    if (summaryRows.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < summaryRows.length; i += batchSize) {
        await sb.from("ktrenz_velocity_profile_summary")
          .upsert(summaryRows.slice(i, i + batchSize), {
            onConflict: "wiki_entry_id,event_type,category",
          });
      }
    }

    console.log(`[velocity-profiler] Event profiles: ${profileRows.length} rows, ${summaryRows.length} summaries`);

    const result = {
      ok: true,
      rolling_stats: statsRows.length,
      event_profiles: profileRows.length,
      event_summaries: summaryRows.length,
      artists: targetIds.length,
    };

    console.log("[velocity-profiler] Done:", JSON.stringify(result));

    return new Response(JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[velocity-profiler] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
