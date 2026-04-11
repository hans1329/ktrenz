// ktrenz-discover-extract: 배틀 콘텐츠 제목에서 커머셜 키워드 추출
// 배틀 수집 완료 후 1회 호출 — ktrenz_b2_items 제목을 GPT로 분석
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractedKeyword {
  keyword: string;
  keyword_en: string;
  category: "brand" | "product" | "program" | "place" | "collaboration";
  star_ids: string[];
  mention_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const sb = createClient(supabaseUrl, serviceKey);

  if (!openaiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchId = body.batch_id || null;
    const scoreDate = body.score_date || new Date().toISOString().slice(0, 10);

    // ── 1. 배틀 콘텐츠 제목 + star_id 수집 ──
    let query = sb
      .from("ktrenz_b2_items")
      .select("title, star_id, source")
      .not("title", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (batchId) {
      // run_id를 통해 batch_id 필터링은 복잡하므로, 최근 24시간 데이터 사용
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", since);
    } else {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", since);
    }

    const { data: items, error: itemsErr } = await query;
    if (itemsErr) throw new Error(`Items query failed: ${itemsErr.message}`);
    if (!items?.length) {
      return respond({ success: true, extracted: 0, message: "No items to process" });
    }

    // ── 2. 스타 이름 조회 (노이즈 필터용) ──
    const starIds = [...new Set(items.map((i: any) => i.star_id))];
    const { data: stars } = await sb
      .from("ktrenz_stars")
      .select("id, name_ko, name_en, group_name, members")
      .in("id", starIds);

    const starMap = new Map((stars || []).map((s: any) => [s.id, s]));

    // 스타별로 제목 그룹화
    const starTitles: Record<string, { titles: string[]; starId: string }> = {};
    for (const item of items) {
      const key = item.star_id;
      if (!starTitles[key]) {
        starTitles[key] = { titles: [], starId: item.star_id };
      }
      // 중복 제목 제거, 최대 30개
      if (starTitles[key].titles.length < 30 && !starTitles[key].titles.includes(item.title)) {
        starTitles[key].titles.push(item.title);
      }
    }

    // ── 3. GPT 배치 호출 (스타별 제목 묶음) ──
    const allKeywords: ExtractedKeyword[] = [];
    const starEntries = Object.entries(starTitles);
    let apiCalls = 0;
    const MAX_API_CALLS = 20; // 과금 안전장치

    for (const [starId, { titles }] of starEntries) {
      if (apiCalls >= MAX_API_CALLS) {
        console.warn(`[discover-extract] API call limit reached (${MAX_API_CALLS})`);
        break;
      }
      if (titles.length < 3) continue; // 제목이 너무 적으면 스킵

      const star = starMap.get(starId);
      const artistNames = buildArtistNames(star);

      const prompt = buildPrompt(titles, artistNames);

      try {
        const keywords = await callOpenAI(openaiKey, prompt);
        apiCalls++;

        for (const kw of keywords) {
          const existing = allKeywords.find(
            (k) => k.keyword === kw.keyword
          );
          if (existing) {
            if (!existing.star_ids.includes(starId)) {
              existing.star_ids.push(starId);
            }
            existing.mention_count += kw.mention_count;
          } else {
            allKeywords.push({
              keyword: kw.keyword,
              keyword_en: kw.keyword_en || "",
              category: kw.category,
              star_ids: [starId],
              mention_count: kw.mention_count,
            });
          }
        }
      } catch (err) {
        console.error(`[discover-extract] OpenAI error for star ${starId}:`, err);
      }

      // 429 방지 딜레이
      if (apiCalls < starEntries.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ── 4. DB Upsert ──
    let upserted = 0;
    for (const kw of allKeywords) {
      const { error: upsertErr } = await sb
        .from("ktrenz_discover_keywords")
        .upsert(
          {
            keyword: kw.keyword,
            keyword_en: kw.keyword_en,
            category: kw.category,
            star_ids: kw.star_ids,
            mention_count: kw.mention_count,
            batch_id: batchId || scoreDate.replace(/-/g, ""),
            score_date: scoreDate,
            metadata: {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: "keyword,score_date" }
        );

      if (upsertErr) {
        console.error(`[discover-extract] Upsert error for "${kw.keyword}":`, upsertErr);
      } else {
        upserted++;
      }
    }

    return respond({
      success: true,
      items_processed: items.length,
      stars_processed: apiCalls,
      extracted: allKeywords.length,
      upserted,
      keywords: allKeywords.map((k) => ({
        keyword: k.keyword,
        category: k.category,
        stars: k.star_ids.length,
        mentions: k.mention_count,
      })),
    });
  } catch (err) {
    console.error("[discover-extract] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helper Functions ──

function buildArtistNames(star: any): string[] {
  if (!star) return [];
  const names: string[] = [];
  if (star.name_ko) names.push(star.name_ko);
  if (star.name_en) names.push(star.name_en);
  if (star.group_name) names.push(star.group_name);
  if (star.members) {
    try {
      const members = typeof star.members === "string" ? JSON.parse(star.members) : star.members;
      if (Array.isArray(members)) {
        for (const m of members) {
          if (typeof m === "string") names.push(m);
          else if (m?.name_ko) names.push(m.name_ko);
          if (m?.name_en) names.push(m.name_en);
        }
      }
    } catch {}
  }
  return names.filter(Boolean);
}

function buildPrompt(titles: string[], artistNames: string[]): string {
  const artistList = artistNames.length > 0
    ? `\nArtist/member names to EXCLUDE: ${artistNames.join(", ")}`
    : "";

  return `You are a K-pop commercial trend analyst. Extract ONLY commercial/lifestyle keywords from these content titles.
${artistList}

RULES:
- EXTRACT: Brand names, product names, TV programs, variety shows, magazines, locations, collaboration partners, fashion items, beauty products, food brands
- EXCLUDE: Artist names, member names, fan terms, music terms (comeback, album, MV, teaser, concert, tour), chart names, generic nouns, hashtags, emotions
- Each keyword should appear in at least 2 titles to be considered significant (exception: clear brand/product names can appear once)
- Return Korean keyword as-is, provide English translation

Content titles:
${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Return a JSON array (no markdown):
[{"keyword":"에버랜드","keyword_en":"Everland","category":"place","mention_count":3}]

Categories: brand, product, program, place, collaboration
Return empty array [] if no commercial keywords found.`;
}

async function callOpenAI(
  apiKey: string,
  prompt: string
): Promise<Array<{ keyword: string; keyword_en: string; category: string; mention_count: number }>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You extract commercial keywords from K-pop content titles. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";

  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[discover-extract] Failed to parse OpenAI response:", content);
    return [];
  }
}

function respond(body: any) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
