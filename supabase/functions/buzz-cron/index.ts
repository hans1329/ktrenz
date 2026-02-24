// buzz-cron: 아티스트별로 crawl-x-mentions를 순차 호출하는 오케스트레이터
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 상위 아티스트만 (v3_scores 기준, 최신 scored_at)
    // DISTINCT ON으로 아티스트당 최신 1행만
    const { data: topScores } = await sb
      .from("v3_scores")
      .select("wiki_entry_id, total_score")
      .order("total_score", { ascending: false })
      .limit(200);

    // 중복 wiki_entry_id 제거
    const seenIds = new Set<string>();
    const uniqueScores = (topScores || []).filter((s: any) => {
      if (!s.wiki_entry_id || seenIds.has(s.wiki_entry_id)) return false;
      seenIds.add(s.wiki_entry_id);
      return true;
    }).slice(0, 50); // 상위 50개만

    // 아티스트 정보 가져오기
    const entryIds = uniqueScores.map((s: any) => s.wiki_entry_id);
    const { data: artists } = await sb
      .from("wiki_entries")
      .select("id, title, metadata")
      .in("id", entryIds)
      .eq("schema_type", "artist");

    if (!artists?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[buzz-cron] Processing ${artists.length} artists`);

    let success = 0;
    let errors = 0;

    for (const artist of artists) {
      try {
        // 해시태그 추출 (metadata에서)
        const meta = artist.metadata as any;
        const hashtags = meta?.hashtags || [];

        // crawl-x-mentions 직접 호출 (같은 Supabase 프로젝트 내)
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
          success++;
          console.log(`[buzz-cron] ✓ ${artist.title}`);
        } else {
          const errText = await resp.text();
          console.warn(`[buzz-cron] ✗ ${artist.title}: ${errText.slice(0, 200)}`);
          errors++;
        }

        // Rate limit 방지 (Firecrawl API 제한)
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[buzz-cron] Error for ${artist.title}:`, e);
        errors++;
      }
    }

    // 수집 로그
    await sb.from("ktrenz_collection_log").insert({
      platform: "buzz_multi",
      status: success > 0 ? "success" : "error",
      records_collected: success,
      error_message: errors > 0 ? `${errors} artists failed` : null,
    });

    console.log(`[buzz-cron] Done: success=${success}, errors=${errors}`);

    return new Response(
      JSON.stringify({ success: true, processed: artists.length, success: success, errors }),
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
