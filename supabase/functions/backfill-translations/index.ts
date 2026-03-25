import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const AI_URL = "https://api.openai.com/v1/chat/completions";

// Detect if text is primarily Korean
function isKorean(text: string): boolean {
  const koreanChars = text.match(/[\uAC00-\uD7A3]/g);
  return !!koreanChars && koreanChars.length > text.length * 0.15;
}

async function translateFromKorean(keyword: string, context: string): Promise<{ ja: string; zh: string } | null> {
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a K-pop trend translator. Return only JSON with ja and zh keys. Translate the Korean editorial narrative tone faithfully — keep the punchy, specific, phenomenon-describing style with concrete details. Do NOT flatten into dry factual summaries. Keep translations concise for mobile UI." },
          { role: "user", content: `Translate this Korean K-pop trend context into Japanese and Chinese (Simplified). Preserve the editorial tone.\n\nKeyword: ${keyword}\nContext (Korean): ${context}\n\nReturn JSON: {"ja":"...","zh":"..."}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) { console.error("AI error:", res.status, await res.text()); return null; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed.ja && parsed.zh) return parsed;
    return null;
  } catch (e) { console.error("Translation error:", e); return null; }
}

async function translateFromEnglish(keyword: string, context: string): Promise<{ ko: string; ja: string; zh: string } | null> {
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a K-pop trend translator. Return only JSON with ko, ja, zh keys. Translate the editorial narrative tone faithfully — keep the punchy, specific, phenomenon-describing style with concrete details. Do NOT flatten into dry factual summaries. Keep translations concise for mobile UI." },
          { role: "user", content: `Translate this English K-pop trend context into Korean, Japanese, and Chinese (Simplified). Preserve the editorial tone.\n\nKeyword: ${keyword}\nContext (English): ${context}\n\nReturn JSON: {"ko":"...","ja":"...","zh":"..."}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) { console.error("AI error:", res.status, await res.text()); return null; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (parsed.ko && parsed.ja && parsed.zh) return parsed;
    return null;
  } catch (e) { console.error("Translation error:", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch rows missing any translation (ko, ja, or zh)
    const { data: rows, error } = await sb
      .from("ktrenz_trend_triggers")
      .select("id, keyword, context, context_ko, context_ja, context_zh")
      .eq("status", "active")
      .not("context", "is", null)
      .or("context_ko.is.null,context_ja.is.null,context_zh.is.null")
      .order("influence_index", { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!rows?.length) {
      return new Response(JSON.stringify({ success: true, message: "No rows to translate", filled: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Translating ${rows.length} contexts`);
    let filled = 0;

    for (const row of rows) {
      const contextText = row.context as string;
      const contextIsKorean = isKorean(contextText);
      const update: Record<string, string> = {};

      if (contextIsKorean) {
        // Context is already Korean → copy to context_ko, translate ja/zh
        if (!row.context_ko) update.context_ko = contextText;

        if (!row.context_ja || !row.context_zh) {
          const result = await translateFromKorean(row.keyword, contextText);
          if (result) {
            if (!row.context_ja) update.context_ja = result.ja;
            if (!row.context_zh) update.context_zh = result.zh;
          }
        }
      } else {
        // Legacy English context → translate to ko, ja, zh
        const result = await translateFromEnglish(row.keyword, contextText);
        if (result) {
          if (!row.context_ko) update.context_ko = result.ko;
          if (!row.context_ja) update.context_ja = result.ja;
          if (!row.context_zh) update.context_zh = result.zh;
        }
      }

      if (Object.keys(update).length > 0) {
        const { error: updateErr } = await sb
          .from("ktrenz_trend_triggers")
          .update(update)
          .eq("id", row.id);
        if (!updateErr) {
          filled++;
          console.log(`✓ ${row.keyword}: ${Object.keys(update).join(",")}`);
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
