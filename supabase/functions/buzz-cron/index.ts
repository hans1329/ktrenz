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

    // 상위 아티스트 (total_score DESC)
    const { data: topScores } = await sb
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score")
      .order("total_score", { ascending: false })
      .limit(200);

    // 중복 제거 후 batchOffset~batchOffset+batchSize 슬라이스
    const seenIds = new Set<string>();
    const uniqueScores = (topScores || []).filter((s: any) => {
      if (!s.wiki_entry_id || seenIds.has(s.wiki_entry_id)) return false;
      seenIds.add(s.wiki_entry_id);
      return true;
    });

    const batch = uniqueScores.slice(batchOffset, batchOffset + batchSize);
    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists in this batch", batchOffset, batchSize }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entryIds = batch.map((s: any) => s.wiki_entry_id);
    const { data: artists } = await sb
      .from("wiki_entries")
      .select("id, title, metadata")
      .in("id", entryIds)
      .eq("schema_type", "artist");

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
