// Signal-C: Attention Map Aggregator
// ktrenz_user_events → ktrenz_attention_signals 일별 집계
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// event_type → 집계 카테고리 매핑
const EVENT_MAPPING: Record<string, string> = {
  treemap_click: "treemap_clicks",
  list_click: "ranking_card_clicks",
  modal_category_click: "detail_sections",
  artist_detail_view: "detail_views",
  artist_detail_section: "detail_sections",
  external_link_click: "external_link_clicks",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { target_date } = await req.json().catch(() => ({ target_date: null }));

    const date = target_date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    console.log(`[attention-map] Aggregating for date: ${date}`);

    // 해당 날짜의 모든 유저 이벤트 조회
    const { data: events, error } = await sb
      .from("ktrenz_user_events")
      .select("user_id, event_type, event_data, created_at")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    if (error) throw error;
    if (!events || events.length === 0) {
      console.log(`[attention-map] No events for ${date}`);
      return new Response(JSON.stringify({ ok: true, date, artists: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 아티스트별 집계
    const artistMap = new Map<string, {
      treemap_clicks: number;
      detail_views: number;
      detail_sections: Record<string, number>;
      external_link_clicks: number;
      ranking_card_clicks: number;
      viewers: Set<string>;
      sectionSets: Map<string, Set<string>>; // user → sections viewed
    }>();

    for (const ev of events) {
      const data = ev.event_data as any;
      if (!data) continue;

      // artist_slug로 아티스트 식별 (wiki_entry_id가 없으면 slug로)
      const artistKey = data.artist_slug || data.wiki_entry_id;
      if (!artistKey) continue;

      if (!artistMap.has(artistKey)) {
        artistMap.set(artistKey, {
          treemap_clicks: 0,
          detail_views: 0,
          detail_sections: {},
          external_link_clicks: 0,
          ranking_card_clicks: 0,
          viewers: new Set(),
          sectionSets: new Map(),
        });
      }

      const agg = artistMap.get(artistKey)!;
      if (ev.user_id) agg.viewers.add(ev.user_id);

      switch (ev.event_type) {
        case "treemap_click":
          agg.treemap_clicks++;
          break;
        case "list_click":
          agg.ranking_card_clicks++;
          break;
        case "artist_detail_view":
          agg.detail_views++;
          break;
        case "artist_detail_section": {
          const section = data.section || "unknown";
          agg.detail_sections[section] = (agg.detail_sections[section] || 0) + 1;
          // 유저별 섹션 추적 (dwell 계산용)
          if (ev.user_id) {
            if (!agg.sectionSets.has(ev.user_id)) agg.sectionSets.set(ev.user_id, new Set());
            agg.sectionSets.get(ev.user_id)!.add(section);
          }
          break;
        }
        case "external_link_click":
          agg.external_link_clicks++;
          break;
        case "modal_category_click": {
          const cat = data.category || "unknown";
          agg.detail_sections[cat] = (agg.detail_sections[cat] || 0) + 1;
          break;
        }
      }
    }

    // slug → wiki_entry_id 매핑
    const slugs = [...artistMap.keys()].filter(k => !k.includes("-") || k.length < 36);
    const uuids = [...artistMap.keys()].filter(k => k.length === 36 && k.includes("-"));

    let slugToId = new Map<string, string>();
    if (slugs.length > 0) {
      const { data: entries } = await sb
        .from("wiki_entries")
        .select("id, slug")
        .in("slug", slugs);
      for (const e of entries || []) {
        slugToId.set(e.slug, e.id);
      }
    }

    // Upsert rows
    const rows = [];
    for (const [key, agg] of artistMap) {
      const wikiEntryId = key.length === 36 && key.includes("-") ? key : slugToId.get(key);
      if (!wikiEntryId) continue;

      // Average dwell sections
      let avgDwell = 0;
      if (agg.sectionSets.size > 0) {
        const totalSections = [...agg.sectionSets.values()].reduce((sum, s) => sum + s.size, 0);
        avgDwell = totalSections / agg.sectionSets.size;
      }

      rows.push({
        wiki_entry_id: wikiEntryId,
        signal_date: date,
        treemap_clicks: agg.treemap_clicks,
        detail_views: agg.detail_views,
        detail_sections: agg.detail_sections,
        external_link_clicks: agg.external_link_clicks,
        ranking_card_clicks: agg.ranking_card_clicks,
        unique_viewers: agg.viewers.size,
        avg_dwell_sections: Math.round(avgDwell * 100) / 100,
      });
    }

    const { error: upsertErr } = await sb
      .from("ktrenz_attention_signals")
      .upsert(rows, { onConflict: "wiki_entry_id,signal_date" });

    if (upsertErr) throw upsertErr;

    console.log(`[attention-map] Done: ${rows.length} artists aggregated for ${date}`);

    return new Response(JSON.stringify({ ok: true, date, artists: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[attention-map] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
