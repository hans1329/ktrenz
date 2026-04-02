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
    const { table, match } = await req.json();
    if (!table || !match) {
      return new Response(JSON.stringify({ error: "table, match required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Delete related trend_triggers first if deleting from ktrenz_stars
    if (table === "ktrenz_stars" && match.id) {
      await sb.from("ktrenz_trend_triggers").delete().eq("star_id", match.id);
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
