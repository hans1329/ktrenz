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
    const { table, match, action } = await req.json();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Full pipeline reset: truncate all trend tables + reset stars
    if (action === "reset_pipeline") {
      const truncateTables = [
        "trend_vs_votes",
        "ktrenz_trend_tracking",
        "ktrenz_keyword_sources",
        "ktrenz_trend_triggers",
        "ktrenz_keywords",
        "ktrenz_data_snapshots",
        "ktrenz_pipeline_state",
      ];
      const results: Record<string, string> = {};
      for (const t of truncateTables) {
        const { error } = await sb.rpc("exec_sql" as any, {
          query: `TRUNCATE ${t} CASCADE`,
        });
        if (error) {
          // Fallback: delete all rows
          const { error: delErr } = await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
          results[t] = delErr ? `error: ${delErr.message}` : "deleted_all";
        } else {
          results[t] = "truncated";
        }
      }
      // Reset stars detection state
      const { error: resetErr } = await sb
        .from("ktrenz_stars")
        .update({ last_detected_at: null, last_detect_result: null })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      results["ktrenz_stars_reset"] = resetErr ? `error: ${resetErr.message}` : "reset";

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!table || !match) {
      return new Response(JSON.stringify({ error: "table, match required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // sb already created above for reset_pipeline path; reuse it here

    // Delete all FK-referencing rows before deleting from ktrenz_stars
    if (table === "ktrenz_stars" && match.id) {
      const starId = match.id;
      const fkTables = [
        "ktrenz_trend_triggers",
        "ktrenz_social_snapshots",
        "ktrenz_trend_artist_grades",
        "ktrenz_schedule_predictions",
        "ktrenz_schedules",
        "ktrenz_watched_artists",
        "ktrenz_data_snapshots",
        "ktrenz_shopping_tracking",
        "ktrenz_keyword_sources",
        "ktrenz_b2b_tracked_stars",
        "ktrenz_b2b_ai_insights",
      ];
      for (const t of fkTables) {
        await sb.from(t).delete().eq("star_id", starId);
      }
      // Also clear members referencing this star as group
      await sb.from("ktrenz_stars").update({ group_star_id: null }).eq("group_star_id", starId);
    }

    let query = sb.from(table).delete();
    for (const [k, v] of Object.entries(match)) {
      query = query.eq(k, v as string);
    }
    const { data, error } = await query.select();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, deleted: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
