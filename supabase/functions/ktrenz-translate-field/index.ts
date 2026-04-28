import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_LANGS = ["en", "ja", "zh", "ko"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

// Maps table + field prefix to the source (Korean) column and target columns
const FIELD_MAP: Record<string, { source: string; targets: Record<string, string> }> = {
  "ktrenz_keywords.keyword": {
    source: "keyword_ko",
    targets: { en: "keyword_en", ja: "keyword_ja", zh: "keyword_zh" },
  },
  "ktrenz_keywords.context": {
    source: "context_ko",
    targets: { en: "context", ja: "context_ja", zh: "context_zh" },
  },
  "ktrenz_trend_triggers.keyword": {
    source: "keyword_ko",
    targets: { en: "keyword_en", ja: "keyword_ja", zh: "keyword_zh" },
  },
  "ktrenz_trend_triggers.context": {
    source: "context_ko",
    targets: { en: "context", ja: "context_ja", zh: "context_zh" },
  },
  "ktrenz_b2_items.title": {
    source: "title",
    targets: { en: "title_en", ja: "title_ja", zh: "title_zh", ko: "title_ko" },
  },
  "ktrenz_b2_items.description": {
    source: "description",
    targets: { en: "description_en", ja: "description_ja", zh: "description_zh", ko: "description_ko" },
  },
};

// Descriptions are much longer than titles — guard against translating
// scraped JS/CSS leaks (which would waste OpenAI tokens) and trim length.
const DESCRIPTION_MAX_CHARS = 600;
const CODE_LEAK_PATTERNS: RegExp[] = [
  /^\s*[.#][\w-]+\s*\{/,
  /\{\{[\w#/]/,
  /[\w.#-]+\s*\{[^}]*:[^}]*\}/,
  /\$\(\s*(?:window|document|this|['"`])/,
  /\bfunction\s*\([^)]*\)\s*\{/,
  /^\s*\/\/\s/,
];
function looksLikeCodeLeak(text: string): boolean {
  for (const re of CODE_LEAK_PATTERNS) if (re.test(text)) return true;
  return (text.match(/\bvar\s+\w+\s*=/g) ?? []).length >= 2;
}

const langLabel: Record<Lang, string> = {
  en: "English",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  ko: "Korean",
};

// Detect if text contains Japanese-specific characters (Hiragana, Katakana)
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { table, field, ids, language } = await req.json() as {
      table: string;
      field: string;
      ids: string[];
      language: string;
    };

    const lang = language as Lang;
    if (!SUPPORTED_LANGS.includes(lang)) {
      return new Response(JSON.stringify({ error: "Unsupported language" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = `${table}.${field}`;
    const mapping = FIELD_MAP[key];
    if (!mapping) {
      return new Response(JSON.stringify({ error: `Unknown field: ${key}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetCol = mapping.targets[lang];
    if (!targetCol) {
      return new Response(JSON.stringify({ error: `No target column for ${lang}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ids || ids.length === 0 || ids.length > 20) {
      return new Response(JSON.stringify({ error: "ids must be 1-20 items" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch rows where source exists, then filter rows that still need translation
    const { data: rows, error: fetchErr } = await supabase
      .from(table)
      .select(`id, ${mapping.source}, ${targetCol}`)
      .in("id", ids)
      .not(mapping.source, "is", null);

    if (fetchErr) throw fetchErr;

    const rowsToTranslate = (rows ?? []).filter((row: any) => {
      const sourceValue = row[mapping.source];
      const targetValue = row[targetCol];

      // Description-specific guard: skip rows whose source looks like a
      // code/CSS leak — translating it just wastes OpenAI tokens. The
      // frontend sanitizer hides them anyway.
      if (
        field === "description" &&
        typeof sourceValue === "string" &&
        looksLikeCodeLeak(sourceValue)
      ) {
        return false;
      }

      const isEnglishContextStale =
        field === "context" &&
        lang === "en" &&
        typeof sourceValue === "string" &&
        typeof targetValue === "string" &&
        targetValue.trim() === sourceValue.trim();

      // For ko target: only translate if source contains Japanese
      if (lang === "ko") {
        return !targetValue && typeof sourceValue === "string" && containsJapanese(sourceValue);
      }

      return !targetValue || isEnglishContextStale;
    });

    if (rowsToTranslate.length === 0) {
      return new Response(JSON.stringify({ translated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch translate via AI. Trim long descriptions to keep token cost bounded.
    const textsToTranslate = rowsToTranslate.map((r: any) => {
      const raw = r[mapping.source] as string;
      if (field === "description" && raw.length > DESCRIPTION_MAX_CHARS) {
        return raw.slice(0, DESCRIPTION_MAX_CHARS);
      }
      return raw;
    });
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    // Fetch artist/group names from DB to prevent translation of proper names
    const { data: starNames } = await supabase
      .from("ktrenz_stars")
      .select("display_name, name_ko")
      .eq("is_active", true);

    const nameList = (starNames ?? [])
      .flatMap((s: any) => [s.display_name, s.name_ko].filter(Boolean))
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);

    const nameInstruction = nameList.length > 0
      ? `\n\nIMPORTANT: The following are artist/group names. Do NOT translate them. Use them exactly as listed here:\n${nameList.join(", ")}`
      : "";

    // Detect source language for the prompt
    const hasJapanese = textsToTranslate.some(t => containsJapanese(t));
    const sourceLabel = hasJapanese ? "Japanese" : "Korean";

    const prompt = `Translate the following ${sourceLabel} texts to ${langLabel[lang]}. Return ONLY a JSON array of translated strings in the same order. Keep translations concise and natural. Remove hashtags from the output.${nameInstruction}

Input:
${JSON.stringify(textsToTranslate)}`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional translator. Artist names, group names, and member names must be kept exactly as provided in the name list — never translate, romanize differently, or localize them. Output only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI error:", aiResp.status, errText);
      throw new Error(`Translation API error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";

    // Extract JSON array from response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Could not parse translation response");

    const translated: string[] = JSON.parse(jsonMatch[0]);
    if (translated.length !== rowsToTranslate.length) {
      console.warn(`Translation count mismatch: got ${translated.length}, expected ${rowsToTranslate.length}`);
    }

    // Update DB
    const results: Record<string, string> = {};
    for (let i = 0; i < Math.min(translated.length, rowsToTranslate.length); i++) {
      const row = rowsToTranslate[i] as any;
      const translation = translated[i];
      if (!translation) continue;

      await supabase
        .from(table)
        .update({ [targetCol]: translation })
        .eq("id", row.id);

      results[row.id] = translation;
    }

    return new Response(JSON.stringify({ translated: Object.keys(results).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ktrenz-translate-field error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
