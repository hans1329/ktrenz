import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all artists missing deezer_artist_id but having display_name
    const { data: artists, error } = await supabase
      .from("v3_artist_tiers")
      .select("id, display_name")
      .is("deezer_artist_id", null)
      .not("display_name", "is", null);

    if (error) throw error;
    if (!artists || artists.length === 0) {
      return new Response(JSON.stringify({ filled: 0, message: "No artists to fill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filled = 0;
    const errors: string[] = [];

    for (const artist of artists) {
      try {
        const searchName = encodeURIComponent(artist.display_name);
        const res = await fetch(`https://api.deezer.com/search/artist?q=${searchName}&limit=1`);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
          const deezerId = String(data.data[0].id);
          const { error: updateError } = await supabase
            .from("v3_artist_tiers")
            .update({ deezer_artist_id: deezerId })
            .eq("id", artist.id);

          if (!updateError) {
            filled++;
            console.log(`✓ ${artist.display_name} → ${deezerId}`);
          } else {
            errors.push(`${artist.display_name}: update failed`);
          }
        } else {
          errors.push(`${artist.display_name}: not found on Deezer`);
        }

        // Rate limit: 50 req/5s for Deezer
        await new Promise((r) => setTimeout(r, 150));
      } catch (e) {
        errors.push(`${artist.display_name}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ filled, total: artists.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
