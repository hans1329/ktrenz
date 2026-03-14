// Pipeline Guard: 수집 데이터 이상치 검증
// 각 모듈 완료 후 호출되어 최신 스냅샷을 이전 데이터와 비교
// action: warn (저장 + 플래그) / block (저장 + 플래그 + 다운스트림 제외)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Guard 규칙 정의 ──

interface GuardRule {
  id: string;
  platform: string;       // ktrenz_data_snapshots.platform
  metricKey: string;       // metrics 내 키 (dot notation: "totalViewCount")
  type: "drop_pct" | "spike_pct" | "zero_check" | "null_check";
  threshold: number;       // drop_pct: -50 = 50% 이상 하락, spike_pct: 1000 = 10배 급등
  action: "warn" | "block";
  description: string;
}

const GUARD_RULES: GuardRule[] = [
  // YouTube
  { id: "yt_view_drop", platform: "youtube", metricKey: "totalViewCount", type: "drop_pct", threshold: -50, action: "warn", description: "YouTube 총 조회수 50%+ 하락" },
  { id: "yt_sub_drop", platform: "youtube", metricKey: "subscriberCount", type: "drop_pct", threshold: -20, action: "block", description: "YouTube 구독자 20%+ 하락 (API 오류 가능성)" },
  { id: "yt_view_zero", platform: "youtube", metricKey: "totalViewCount", type: "zero_check", threshold: 0, action: "block", description: "YouTube 총 조회수 0 반환" },

  // Music
  { id: "music_score_zero", platform: "music", metricKey: "music_score", type: "zero_check", threshold: 0, action: "block", description: "Music 점수 0 반환" },
  { id: "music_lastfm_zero", platform: "lastfm", metricKey: "listeners", type: "zero_check", threshold: 0, action: "warn", description: "Last.fm 리스너 0 반환" },

  // Buzz
  { id: "buzz_spike", platform: "buzz", metricKey: "buzz_score", type: "spike_pct", threshold: 1000, action: "warn", description: "Buzz 점수 10배+ 급등" },
  { id: "buzz_zero", platform: "buzz", metricKey: "buzz_score", type: "zero_check", threshold: 0, action: "block", description: "Buzz 점수 0 반환" },

  // Social
  { id: "social_ig_drop", platform: "social", metricKey: "instagram_followers", type: "drop_pct", threshold: -30, action: "block", description: "Instagram 팔로워 30%+ 하락" },
  { id: "social_x_drop", platform: "social", metricKey: "x_followers", type: "drop_pct", threshold: -30, action: "block", description: "X 팔로워 30%+ 하락" },

  // Hanteo
  { id: "hanteo_negative", platform: "hanteo", metricKey: "daily_sales", type: "drop_pct", threshold: -100, action: "block", description: "Hanteo 판매량 음수/비정상" },
];

// 모듈 → 관련 플랫폼 매핑
const MODULE_PLATFORMS: Record<string, string[]> = {
  youtube: ["youtube"],
  music: ["music", "lastfm", "deezer"],
  hanteo: ["hanteo"],
  buzz: ["buzz"],
  social: ["social"],
  energy: [],  // energy는 v3_scores_v2에서 별도 검증
};

// ── 유틸리티 ──

function getNestedValue(obj: any, path: string): number | null {
  const parts = path.split(".");
  let val = obj;
  for (const p of parts) {
    if (val == null || typeof val !== "object") return null;
    val = val[p];
  }
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return Number(val);
}

function calcDeltaPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { module, engine_run_id, wiki_entry_ids } = await req.json().catch(() => ({
      module: null, engine_run_id: null, wiki_entry_ids: null,
    }));

    if (!module) {
      return new Response(JSON.stringify({ error: "module is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const platforms = MODULE_PLATFORMS[module];
    if (!platforms || platforms.length === 0) {
      console.log(`[pipeline-guard] No guard rules for module: ${module}, skipping`);
      return new Response(JSON.stringify({ ok: true, module, checked: 0, warnings: 0, blocks: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 해당 플랫폼의 규칙만 필터
    const applicableRules = GUARD_RULES.filter(r => platforms.includes(r.platform));
    if (applicableRules.length === 0) {
      return new Response(JSON.stringify({ ok: true, module, checked: 0, warnings: 0, blocks: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 대상 아티스트 결정
    let targetIds: string[] = wiki_entry_ids || [];
    if (!targetIds.length) {
      const { data: tiers } = await sb.from("v3_artist_tiers").select("wiki_entry_id").in("tier", [1, 2]);
      targetIds = (tiers || []).map((t: any) => t.wiki_entry_id);
    }

    let totalChecked = 0;
    let totalWarnings = 0;
    let totalBlocks = 0;
    const issues: any[] = [];

    // 플랫폼별 최신 2개 스냅샷 조회 및 검증
    for (const platform of platforms) {
      const platformRules = applicableRules.filter(r => r.platform === platform);
      if (!platformRules.length) continue;

      for (const entryId of targetIds) {
        const { data: snapshots } = await sb
          .from("ktrenz_data_snapshots")
          .select("id, metrics, collected_at, guard_flagged")
          .eq("wiki_entry_id", entryId)
          .eq("platform", platform)
          .eq("guard_flagged", false) // 이미 플래그된 것은 비교 기준에서 제외
          .order("collected_at", { ascending: false })
          .limit(2);

        if (!snapshots || snapshots.length === 0) continue;

        const latest = snapshots[0];
        const previous = snapshots.length > 1 ? snapshots[1] : null;
        const currentMetrics = latest.metrics as any;
        const previousMetrics = previous ? (previous.metrics as any) : null;

        for (const rule of platformRules) {
          totalChecked++;
          const currentVal = getNestedValue(currentMetrics, rule.metricKey);

          // null/NaN 체크
          if (currentVal === null) {
            if (rule.type === "null_check" || rule.type === "zero_check") {
              const log = {
                module,
                wiki_entry_id: entryId,
                guard_rule: rule.id,
                action: "block" as const,
                current_value: { [rule.metricKey]: null },
                previous_value: previousMetrics ? { [rule.metricKey]: getNestedValue(previousMetrics, rule.metricKey) } : {},
                delta_pct: null,
                engine_run_id: engine_run_id || null,
                snapshot_id: latest.id,
              };
              issues.push(log);
              totalBlocks++;
            }
            continue;
          }

          // Zero 체크
          if (rule.type === "zero_check" && currentVal === 0) {
            // 이전 값도 0이면 정상 (아직 데이터가 없는 아티스트)
            const prevVal = previousMetrics ? getNestedValue(previousMetrics, rule.metricKey) : null;
            if (prevVal !== null && prevVal > 0) {
              issues.push({
                module,
                wiki_entry_id: entryId,
                guard_rule: rule.id,
                action: rule.action,
                current_value: { [rule.metricKey]: currentVal },
                previous_value: { [rule.metricKey]: prevVal },
                delta_pct: -100,
                engine_run_id: engine_run_id || null,
                snapshot_id: latest.id,
              });
              if (rule.action === "block") totalBlocks++; else totalWarnings++;
            }
            continue;
          }

          // 비교 기반 체크 (drop / spike)
          if ((rule.type === "drop_pct" || rule.type === "spike_pct") && previousMetrics) {
            const prevVal = getNestedValue(previousMetrics, rule.metricKey);
            if (prevVal === null || prevVal === 0) continue;

            const delta = calcDeltaPct(currentVal, prevVal);

            let triggered = false;
            if (rule.type === "drop_pct" && delta <= rule.threshold) triggered = true;
            if (rule.type === "spike_pct" && delta >= rule.threshold) triggered = true;

            if (triggered) {
              issues.push({
                module,
                wiki_entry_id: entryId,
                guard_rule: rule.id,
                action: rule.action,
                current_value: { [rule.metricKey]: currentVal },
                previous_value: { [rule.metricKey]: prevVal },
                delta_pct: Math.round(delta * 100) / 100,
                engine_run_id: engine_run_id || null,
                snapshot_id: latest.id,
              });
              if (rule.action === "block") totalBlocks++; else totalWarnings++;
            }
          }
        }
      }
    }

    // ── 이슈 저장 + 스냅샷 플래그 ──
    if (issues.length > 0) {
      const { data: inserted } = await sb.from("ktrenz_guard_logs").insert(issues).select("id, snapshot_id, action");

      // 플래그 처리: warn과 block 모두 스냅샷에 플래그
      const snapshotUpdates = (inserted || [])
        .filter((i: any) => i.snapshot_id)
        .map((i: any) => ({ id: i.snapshot_id, guard_flagged: true, guard_log_id: i.id }));

      for (const upd of snapshotUpdates) {
        await sb.from("ktrenz_data_snapshots")
          .update({ guard_flagged: true, guard_log_id: upd.guard_log_id })
          .eq("id", upd.id);
      }

      console.log(`[pipeline-guard] ${module}: ${issues.length} issues found (${totalWarnings} warn, ${totalBlocks} block)`);
    } else {
      console.log(`[pipeline-guard] ${module}: All clear ✅ (${totalChecked} checks)`);
    }

    return new Response(JSON.stringify({
      ok: true,
      module,
      checked: totalChecked,
      warnings: totalWarnings,
      blocks: totalBlocks,
      issues: issues.map(i => ({ rule: i.guard_rule, action: i.action, delta: i.delta_pct, artist: i.wiki_entry_id })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[pipeline-guard] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
