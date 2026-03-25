// ktrenz-schedule-predict: 네이버 뉴스 기반 AI 일정 추론
// OpenAI tool calling으로 고확률 이벤트만 추출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOOL_DEF = {
  type: "function" as const,
  function: {
    name: "predict_schedule",
    description:
      "Extract high-confidence upcoming schedule predictions from K-pop artist news headlines. Only extract events that are highly likely based on concrete evidence in the news (dates mentioned, official announcements, confirmed schedules). Do NOT guess or speculate. Each prediction must have confidence >= 0.7.",
    parameters: {
      type: "object",
      properties: {
        predictions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              event_title: {
                type: "string",
                description: "Concise event title in Korean (e.g., '일본 투어 오사카 공연', '컴백 앨범 발매', '홍콩 팬미팅')",
              },
              event_date: {
                type: "string",
                description: "ISO date (YYYY-MM-DD) of the event start. If only month is known, use the 1st. If unclear, null.",
              },
              event_date_end: {
                type: "string",
                description: "ISO date (YYYY-MM-DD) of the event end, if it spans multiple days. null if single day.",
              },
              category: {
                type: "string",
                enum: ["release", "broadcast", "event", "travel", "concert", "fanmeeting", "award", "variety"],
                description: "Event category",
              },
              confidence: {
                type: "number",
                description: "Confidence 0.0-1.0. Only include if >= 0.7. 0.9+ = date explicitly mentioned in news. 0.8 = strong implication. 0.7 = reasonable inference.",
              },
              reasoning: {
                type: "string",
                description: "Brief reasoning for the prediction based on specific news headlines (1-2 sentences in Korean)",
              },
            },
            required: ["event_title", "category", "confidence", "reasoning"],
          },
        },
      },
      required: ["predictions"],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { wikiEntryId, artistName, mode } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const sb = createClient(supabaseUrl, supabaseKey);

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // mode=batch: 전체 아티스트 대상 배치 처리
    if (mode === "batch") {
      const { data: stars } = await sb
        .from("ktrenz_stars")
        .select("wiki_entry_id, display_name, name_ko, id")
        .eq("is_active", true)
        .not("wiki_entry_id", "is", null);

      if (!stars?.length) {
        return new Response(
          JSON.stringify({ success: true, processed: 0, message: "No active stars" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let processed = 0;
      let predicted = 0;

      for (const star of stars) {
        try {
          // 최근 72시간 뉴스 스냅샷 가져오기
          const newsData = await getRecentNews(sb, star.wiki_entry_id);
          if (!newsData || newsData.length === 0) continue;

          const predictions = await runAIPrediction(
            openaiKey,
            star.display_name,
            star.name_ko,
            newsData,
          );

          if (predictions.length > 0) {
            await savePredictions(sb, star.wiki_entry_id, star.id, predictions, newsData);
            predicted += predictions.length;
          }
          processed++;

          // Rate limit 방지
          await new Promise((r) => setTimeout(r, 500));
        } catch (e) {
          console.warn(`[schedule-predict] Error for ${star.display_name}:`, (e as Error).message);
        }
      }

      console.log(`[schedule-predict] Batch done: ${processed} artists, ${predicted} predictions`);
      return new Response(
        JSON.stringify({ success: true, processed, predicted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 단일 아티스트 모드
    if (!wikiEntryId) {
      return new Response(
        JSON.stringify({ success: false, error: "wikiEntryId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // star_id 조회
    const { data: starRow } = await sb
      .from("ktrenz_stars")
      .select("id, display_name, name_ko")
      .eq("wiki_entry_id", wikiEntryId)
      .eq("is_active", true)
      .maybeSingle();

    const name = artistName || starRow?.display_name || "Unknown";
    const nameKo = starRow?.name_ko || null;

    const newsData = await getRecentNews(sb, wikiEntryId);
    if (!newsData || newsData.length === 0) {
      return new Response(
        JSON.stringify({ success: true, predictions: [], message: "No recent news" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const predictions = await runAIPrediction(openaiKey, name, nameKo, newsData);
    if (predictions.length > 0) {
      await savePredictions(sb, wikiEntryId, starRow?.id || null, predictions, newsData);
    }

    return new Response(
      JSON.stringify({ success: true, predictions, newsCount: newsData.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[schedule-predict] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── 최근 뉴스 데이터 가져오기 ──
interface NewsItem {
  title: string;
  description: string;
  url: string;
  image: string | null;
}

async function getRecentNews(sb: any, wikiEntryId: string): Promise<NewsItem[]> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: snapshots } = await sb
    .from("ktrenz_data_snapshots")
    .select("raw_response, created_at")
    .eq("wiki_entry_id", wikiEntryId)
    .eq("platform", "naver_news")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!snapshots?.length) return [];

  const allNews: NewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const snap of snapshots) {
    const items = snap.raw_response?.top_items || [];
    for (const item of items) {
      if (item.title && !seenTitles.has(item.title)) {
        seenTitles.add(item.title);
        allNews.push({
          title: item.title,
          description: item.description || "",
          url: item.url || "",
          image: item.image || null,
        });
      }
    }
  }

  return allNews;
}

// ── AI 추론 실행 ──
async function runAIPrediction(
  openaiKey: string,
  artistName: string,
  nameKo: string | null,
  newsData: { title: string; description: string }[],
): Promise<any[]> {
  const today = new Date().toISOString().split("T")[0];
  const headlineText = newsData
    .map((n, i) => `${i + 1}. ${n.title}${n.description ? ` — ${n.description}` : ""}`)
    .join("\n");

  const systemPrompt = `You are a K-pop industry schedule analyst. Your task is to extract ONLY high-confidence upcoming event predictions from news headlines about a specific artist.

Rules:
- Only extract events with concrete evidence (dates, official announcements, confirmed plans)
- Minimum confidence: 0.7 (reject anything below)
- Examples of HIGH confidence: "3월 28일 컴백 확정" → 0.95, "다음주 일본 투어" → 0.85
- Examples of LOW confidence (SKIP): "컴백 가능성", "소문", speculation without dates
- Travel predictions: If news mentions the artist is in a foreign city for X days, predict return date
- If no high-confidence predictions exist, return empty array — this is perfectly fine
- Today's date: ${today}
- Do NOT predict past events`;

  const userPrompt = `Artist: ${artistName}${nameKo ? ` (${nameKo})` : ""}

Recent news headlines:
${headlineText}

Extract schedule predictions (only confidence >= 0.7):`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [TOOL_DEF],
      tool_choice: { type: "function", function: { name: "predict_schedule" } },
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[schedule-predict] OpenAI error:", resp.status, errText);
    return [];
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return [];

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    const predictions = (parsed.predictions || []).filter(
      (p: any) => p.confidence >= 0.7 && p.event_title,
    );
    console.log(`[schedule-predict] ${artistName}: ${predictions.length} predictions from ${newsData.length} headlines`);
    return predictions;
  } catch (e) {
    console.warn("[schedule-predict] Parse error:", (e as Error).message);
    return [];
  }
}

// ── 예측 결과 저장 ──
async function savePredictions(
  sb: any,
  wikiEntryId: string,
  starId: string | null,
  predictions: any[],
  newsData: NewsItem[],
) {
  // 기존 active 예측 만료 처리
  await sb
    .from("ktrenz_schedule_predictions")
    .update({ status: "expired" })
    .eq("wiki_entry_id", wikiEntryId)
    .eq("status", "active");

  const rows = predictions.map((p: any) => ({
    wiki_entry_id: wikiEntryId,
    star_id: starId,
    event_title: p.event_title,
    event_date: p.event_date || null,
    event_date_end: p.event_date_end || null,
    category: p.category || "event",
    confidence: p.confidence,
    reasoning: p.reasoning || null,
    source_headlines: newsData.map((n) => n.title).slice(0, 10),
    source_articles: newsData.slice(0, 10).map((n) => ({
      title: n.title,
      description: n.description,
      url: n.url,
      image: n.image,
    })),
    status: "active",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error } = await sb.from("ktrenz_schedule_predictions").insert(rows);
  if (error) console.error("[schedule-predict] Insert error:", error.message);
}
