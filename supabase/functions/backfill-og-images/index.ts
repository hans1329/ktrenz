import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const ogMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    const twitterMatch =
      html.match(/<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i);
    if (twitterMatch?.[1]) return twitterMatch[1];

    const imgMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
    for (const match of imgMatches) {
      const src = match[1];
      if (/\.(gif|svg|ico)(\?|$)/i.test(src)) continue;
      if (/ads|tracker|pixel|spacer|blank|logo|icon|button|banner/i.test(src)) continue;
      if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("//")) {
        return src.startsWith("//") ? `https:${src}` : src;
      }
    }

    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // source_url이 있는데 source_image_url이 null인 active 트리거 조회
    const { data: rows, error } = await sb
      .from("ktrenz_trend_triggers")
      .select("id, source_url")
      .eq("status", "active")
      .not("source_url", "is", null)
      .is("source_image_url", null)
      .limit(10);

    if (error) throw error;
    if (!rows?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No rows to backfill", filled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Backfilling OG images for ${rows.length} triggers`);

    let filled = 0;
    const results: { id: string; url: string; image: string | null }[] = [];

    for (const row of rows) {
      const img = await fetchOgImage(row.source_url);
      results.push({ id: row.id, url: row.source_url, image: img });

      if (img) {
        const { error: updateErr } = await sb
          .from("ktrenz_trend_triggers")
          .update({ source_image_url: img })
          .eq("id", row.id);

        if (!updateErr) filled++;
        else console.error(`Update failed for ${row.id}:`, updateErr.message);
      }
    }

    console.log(`Backfill complete: ${filled}/${rows.length} filled`);

    return new Response(
      JSON.stringify({ success: true, total: rows.length, filled, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Backfill error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
