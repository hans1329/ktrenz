// buzz-cron: 아티스트별로 crawl-x-mentions를 순차 호출하는 오케스트레이터
// batchSize / batchOffset 파라미터로 분할 처리 지원
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(50, Math.max(1, Number(body.batchSize) || 5));
    const batchOffset = Math.max(0, Number(body.batchOffset) || 0);
    const tierSnapshotAt = typeof body.tierSnapshotAt === "string" && !Number.isNaN(Date.parse(body.tierSnapshotAt))
      ? body.tierSnapshotAt
      : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Tier 1 대상 스냅샷 고정 (run 도중 tier 변경에 따른 offset 누락 방지)
    let tierQuery = sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, name_ko")
      .eq("tier", 1)
      .order("wiki_entry_id", { ascending: true });

    if (tierSnapshotAt) {
      tierQuery = tierQuery.lte("updated_at", tierSnapshotAt);
    }

    const { data: tier1Entries } = await tierQuery;

    const uniqueIds = [...new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean))];

    const koNameMap = new Map<string, string>();
    for (const t of tier1Entries || []) {
      if (t?.wiki_entry_id && t?.name_ko) koNameMap.set(t.wiki_entry_id, t.name_ko);
    }

    const batch = uniqueIds.slice(batchOffset, batchOffset + batchSize);
    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in this batch", batchOffset, batchSize, tierSnapshotAt, totalCandidates: uniqueIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entryIds = batch;
    const { data: artists } = await sb
      .from("wiki_entries")
      .select("id, title, metadata")
      .in("id", entryIds)
      .in("schema_type", ["artist", "member"]);

    const artistMap = new Map<string, any>((artists || []).map((a: any) => [a.id, a]));
    const orderedArtists = entryIds.map((id: string) => artistMap.get(id)).filter(Boolean) as any[];

    if (!orderedArtists.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No matching artists", batchOffset, batchSize, tierSnapshotAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[buzz-cron] Batch offset=${batchOffset} size=${batchSize}, processing ${orderedArtists.length} artists (tierCandidates=${uniqueIds.length}${tierSnapshotAt ? `, snapshotAt=${tierSnapshotAt}` : ""})`);

    let successCount = 0;
    let errors = 0;

    for (const artist of orderedArtists) {
      try {
        const meta = artist.metadata as any;
        const hashtags = meta?.hashtags || [];

        // Naver API를 먼저 호출해 최신 naver_news snapshot을 생성
        const naverResp = await fetch(`${supabaseUrl}/functions/v1/crawl-naver-news`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            artistName: artist.title,
            koreanName: koNameMap.get(artist.id) || null,
            wikiEntryId: artist.id,
          }),
        });

        if (!naverResp.ok) {
          const naverErr = await naverResp.text();
          console.warn(`[buzz-cron] Naver pre-collect failed for ${artist.title}: ${naverErr.slice(0, 200)}`);
        }

        const resp = await fetch(`${supabaseUrl}/functions/v1/crawl-x-mentions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            artistName: artist.title,
            wikiEntryId: artist.id,
            hashtags,
          }),
        });

        if (resp.ok) {
          successCount++;
          console.log(`[buzz-cron] ✓ ${artist.title}`);
        } else {
          const errText = await resp.text();
          console.warn(`[buzz-cron] ✗ ${artist.title}: ${errText.slice(0, 200)}`);
          errors++;
        }

        // Firecrawl rate limit 방지
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[buzz-cron] Error for ${artist.title}:`, e);
        errors++;
      }
    }

    // 수집 로그
    await sb.from("ktrenz_collection_log").insert({
      platform: "buzz_multi",
      status: successCount > 0 ? "success" : "error",
      records_collected: successCount,
      error_message: errors > 0 ? `${errors} artists failed (batch ${batchOffset}-${batchOffset + batchSize})` : null,
    });

    console.log(`[buzz-cron] Done: batch=${batchOffset}-${batchOffset + batchSize}, success=${successCount}, errors=${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        batchOffset,
        batchSize,
        processed: artists.length,
        successCount,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[buzz-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
