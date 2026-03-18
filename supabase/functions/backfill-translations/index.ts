import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function translateContext(keyword: string, context: string): Promise<{ ko: string; ja: string; zh: string } | null> {
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a K-pop trend translator. Return only JSON with ko, ja, zh keys. Keep translations concise and natural for mobile UI." },
          { role: "user", content: `Translate this K-pop trend context into Korean, Japanese, and Chinese (Simplified).\n\nKeyword: ${keyword}\nContext: ${context}\n\nReturn JSON: {"ko":"...","ja":"...","zh":"..."}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      console.error("AI error:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed.ko && parsed.ja && parsed.zh) return parsed;
    return null;
  } catch (e) {
    console.error("Translation error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch rows missing translations
    const { data: rows, error } = await sb
      .from("ktrenz_trend_triggers")
      .select("id, keyword, context")
      .eq("status", "active")
      .not("context", "is", null)
      .is("context_ko", null)
      .order("influence_index", { ascending: false })
      .limit(15);

    if (error) throw error;
    if (!rows?.length) {
      return new Response(JSON.stringify({ success: true, message: "No rows to translate", filled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Translating ${rows.length} contexts`);
    let filled = 0;

    for (const row of rows) {
      const result = await translateContext(row.keyword, row.context);
      if (result) {
        const { error: updateErr } = await sb
          .from("ktrenz_trend_triggers")
          .update({ context_ko: result.ko, context_ja: result.ja, context_zh: result.zh })
          .eq("id", row.id);
        if (!updateErr) {
          filled++;
          console.log(`✓ ${row.keyword}: ${result.ko}`);
        } else {
          console.error(`Update failed for ${row.id}:`, updateErr.message);
        }
      }
    }

    console.log(`Done: ${filled}/${rows.length}`);
    return new Response(JSON.stringify({ success: true, total: rows.length, filled }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Backfill error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
