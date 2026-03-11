// 국적 변동률 감지 엣지 함수
// ktrenz_geo_fan_data의 현재 vs 이전 스냅샷을 소스별로 비교하여 변동률과 스파이크 감지
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPIKE_THRESHOLD = 30; // ±30% 이상이면 spike
const WINDOW_HOURS = 24;
const SOURCES = ["google_trends", "lastfm", "youtube_comments"] as const;

interface GeoRow {
  wiki_entry_id: string;
  country_code: string;
  country_name: string;
  source: string;
  interest_score: number | null;
  listeners: number | null;
  rank_position: number | null;
  collected_at: string;
}

// 소스별 대표 값 추출
function getValue(row: GeoRow): number {
  if (row.source === "lastfm") return row.listeners ?? 0;
  return row.interest_score ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetWikiEntryId: string | undefined = body.wiki_entry_id;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 대상 아티스트 목록
    let artistIds: string[] = [];
    if (targetWikiEntryId) {
      artistIds = [targetWikiEntryId];
    } else {
      const { data: tiers } = await sb
        .from("v3_artist_tiers")
        .select("wiki_entry_id")
        .in("tier", [1, 2, 3]);
      artistIds = (tiers ?? []).map((t: any) => t.wiki_entry_id);
    }

    if (artistIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No artists found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[detect-geo-changes] Processing ${artistIds.length} artist(s)`);

    const now = new Date();
    const windowAgo = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
    const prevWindowStart = new Date(windowAgo.getTime() - WINDOW_HOURS * 60 * 60 * 1000);

    const allSignals: any[] = [];
    const summaryByArtist: Record<string, { spikes: number; countries: number }> = {};

    for (const artistId of artistIds) {
      // 소스별로 현재 시점(최근 windowAgo~now)과 이전 시점(prevWindowStart~windowAgo) 데이터 가져오기
      const { data: currentData } = await sb
        .from("ktrenz_geo_fan_data")
        .select("*")
        .eq("wiki_entry_id", artistId)
        .gte("collected_at", windowAgo.toISOString())
        .in("source", [...SOURCES]);

      const { data: previousData } = await sb
        .from("ktrenz_geo_fan_data")
        .select("*")
        .eq("wiki_entry_id", artistId)
        .gte("collected_at", prevWindowStart.toISOString())
        .lt("collected_at", windowAgo.toISOString())
        .in("source", [...SOURCES]);

      if (!currentData?.length) {
        console.log(`[detect-geo-changes] No current data for ${artistId}`);
        continue;
      }

      // 이전 데이터를 source+country_code 키로 맵핑
      const prevMap = new Map<string, GeoRow>();
      for (const row of (previousData ?? []) as GeoRow[]) {
        const key = `${row.source}::${row.country_code}`;
        const existing = prevMap.get(key);
        // 같은 키에 여러 행이 있으면 가장 최근 것 사용
        if (!existing || row.collected_at > existing.collected_at) {
          prevMap.set(key, row);
        }
      }

      // 현재 데이터를 source+country_code 키로 최신 값만 추출
      const currMap = new Map<string, GeoRow>();
      for (const row of currentData as GeoRow[]) {
        const key = `${row.source}::${row.country_code}`;
        const existing = currMap.get(key);
        if (!existing || row.collected_at > existing.collected_at) {
          currMap.set(key, row);
        }
      }

      let spikeCount = 0;

      for (const [key, curr] of currMap) {
        const prev = prevMap.get(key);
        const currentVal = getValue(curr);
        const previousVal = prev ? getValue(prev) : null;

        let changeRate: number | null = null;
        if (previousVal !== null && previousVal > 0) {
          changeRate = ((currentVal - previousVal) / previousVal) * 100;
        } else if (previousVal === 0 && currentVal > 0) {
          changeRate = 100; // new appearance
        }

        const isSpike = changeRate !== null && Math.abs(changeRate) >= SPIKE_THRESHOLD;
        const spikeDirection = isSpike
          ? (changeRate! > 0 ? "surge" : "drop")
          : null;

        const rankChange = (prev?.rank_position && curr.rank_position)
          ? (prev.rank_position - curr.rank_position) // positive = improved
          : null;

        if (isSpike) spikeCount++;

        allSignals.push({
          wiki_entry_id: artistId,
          country_code: curr.country_code,
          country_name: curr.country_name,
          source: curr.source,
          current_value: currentVal,
          previous_value: previousVal,
          change_rate: changeRate !== null ? Math.round(changeRate * 10) / 10 : null,
          is_spike: isSpike,
          spike_direction: spikeDirection,
          current_rank: curr.rank_position,
          previous_rank: prev?.rank_position ?? null,
          rank_change: rankChange,
          window_hours: WINDOW_HOURS,
        });
      }

      // 이전엔 있었지만 현재 사라진 국가 → drop 감지
      for (const [key, prev] of prevMap) {
        if (!currMap.has(key)) {
          const previousVal = getValue(prev);
          if (previousVal > 0) {
            allSignals.push({
              wiki_entry_id: artistId,
              country_code: prev.country_code,
              country_name: prev.country_name,
              source: prev.source,
              current_value: 0,
              previous_value: previousVal,
              change_rate: -100,
              is_spike: true,
              spike_direction: "drop",
              current_rank: null,
              previous_rank: prev.rank_position,
              rank_change: null,
              window_hours: WINDOW_HOURS,
            });
            spikeCount++;
          }
        }
      }

      summaryByArtist[artistId] = {
        spikes: spikeCount,
        countries: currMap.size,
      };
    }

    // Batch insert signals
    if (allSignals.length > 0) {
      // 100개씩 배치 삽입
      for (let i = 0; i < allSignals.length; i += 100) {
        const batch = allSignals.slice(i, i + 100);
        const { error } = await sb.from("ktrenz_geo_change_signals").insert(batch);
        if (error) {
          console.error(`[detect-geo-changes] Insert error (batch ${i}):`, error);
        }
      }
    }

    const totalSpikes = allSignals.filter((s) => s.is_spike).length;
    const surges = allSignals.filter((s) => s.spike_direction === "surge");
    const drops = allSignals.filter((s) => s.spike_direction === "drop");

    console.log(
      `[detect-geo-changes] Done: ${allSignals.length} signals, ${totalSpikes} spikes (${surges.length} surges, ${drops.length} drops)`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        total_signals: allSignals.length,
        total_spikes: totalSpikes,
        surges: surges.length,
        drops: drops.length,
        window_hours: WINDOW_HOURS,
        spike_threshold: SPIKE_THRESHOLD,
        artists: summaryByArtist,
        top_surges: surges
          .sort((a, b) => (b.change_rate ?? 0) - (a.change_rate ?? 0))
          .slice(0, 10)
          .map((s) => ({
            country: s.country_name,
            source: s.source,
            change: `+${s.change_rate}%`,
            current: s.current_value,
            previous: s.previous_value,
          })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[detect-geo-changes] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
