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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1군(tier=1) 아티스트만 대상 — 직접 티어 테이블에서 가져옴
    const { data: tier1Entries } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1);
    const allTier1Ids = (tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean);

    // 중복 제거
    const uniqueIds = [...new Set(allTier1Ids)];

    const batch = uniqueIds.slice(batchOffset, batchOffset + batchSize);
    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in this batch", batchOffset, batchSize }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entryIds = batch;
    const { data: artists } = await sb
      .from("wiki_entries")
      .select("id, title, metadata")
      .in("id", entryIds)
      .eq("schema_type", "artist");

    // name_ko 매핑
    const { data: tierKoData } = await sb.from("v3_artist_tiers").select("wiki_entry_id, name_ko").in("wiki_entry_id", entryIds);
    const koNameMap = new Map<string, string>();
    for (const t of tierKoData || []) {
      if (t.name_ko) koNameMap.set(t.wiki_entry_id, t.name_ko);
    }

    if (!artists?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No matching artists", batchOffset, batchSize }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[buzz-cron] Batch offset=${batchOffset} size=${batchSize}, processing ${artists.length} artists`);

    let successCount = 0;
    let errors = 0;

    for (const artist of artists) {
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
