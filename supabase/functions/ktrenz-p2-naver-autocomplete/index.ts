// P2 Pipeline Test: Naver Autocomplete trending keywords
// Uses Naver Search API (already have NAVER_CLIENT_ID/SECRET)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Seed prefixes to extract autocomplete suggestions
const SEED_PREFIXES = [
  "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
  "요즘", "인기", "트렌드", "핫한", "유행", "추천",
  "kpop", "korean", "viral",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[p2-naver-ac] Starting Naver autocomplete test...");

    const allSuggestions = new Map<string, number>(); // keyword → frequency count

    for (const prefix of SEED_PREFIXES) {
      try {
        // Naver autocomplete (public endpoint, no API key needed)
        const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(prefix)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8`;

        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[p2-naver-ac] "${prefix}" failed ${res.status}`);
          continue;
        }

        const data = await res.json();
        // Naver autocomplete response: { items: [["keyword1", ...], ["keyword2", ...]] }
        const items = data?.items || [];

        for (const group of items) {
          if (Array.isArray(group)) {
            for (const item of group) {
              if (typeof item === "string" && item.length >= 2) {
                allSuggestions.set(item, (allSuggestions.get(item) || 0) + 1);
              } else if (Array.isArray(item)) {
                // Some formats nest deeper
                for (const sub of item) {
                  if (typeof sub === "string" && sub.length >= 2) {
                    allSuggestions.set(sub, (allSuggestions.get(sub) || 0) + 1);
                  }
                }
              }
            }
          }
        }

        // Log first response structure
        if (prefix === "ㄱ") {
          console.log(`[p2-naver-ac] Response keys: ${JSON.stringify(Object.keys(data))}`);
          console.log(`[p2-naver-ac] Preview: ${JSON.stringify(data).substring(0, 500)}`);
        }
      } catch (err) {
        console.warn(`[p2-naver-ac] Error for "${prefix}":`, err);
      }
    }

    const sorted = Array.from(allSuggestions.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log(`[p2-naver-ac] Done: ${sorted.length} unique suggestions`);

    return new Response(JSON.stringify({
      success: true,
      source: "naver_autocomplete",
      total_seeds: SEED_PREFIXES.length,
      unique_keywords: sorted.length,
      sample: sorted.slice(0, 50).map(([kw, freq], idx) => ({
        rank: idx + 1,
        keyword: kw,
        frequency: freq,
      })),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[p2-naver-ac] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
