// Signal-B: Fandom Pulse Aggregator
// ktrenz_agent_intents → ktrenz_fandom_signals 일별 집계
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SENTIMENT_MAP: Record<string, number> = {
  positive: 1,
  neutral: 0,
  negative: -1,
  curious: 0.3,
  excited: 0.8,
  worried: -0.5,
  frustrated: -0.7,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { target_date } = await req.json().catch(() => ({ target_date: null }));

    // 어제 날짜 기본 (크론은 매일 새벽 실행 → 어제 데이터 집계)
    const date = target_date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;

    console.log(`[fandom-pulse] Aggregating for date: ${date}`);

    // 해당 날짜의 모든 인텐트 조회
    const { data: intents, error } = await sb
      .from("ktrenz_agent_intents")
      .select("wiki_entry_id, user_id, intent_category, sentiment, sub_topic, agent_slot_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    if (error) throw error;
    if (!intents || intents.length === 0) {
      console.log(`[fandom-pulse] No intents for ${date}`);
      return new Response(JSON.stringify({ ok: true, date, artists: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 아티스트별 집계
    const artistMap = new Map<string, {
      queries: number;
      users: Set<string>;
      intents: Record<string, number>;
      sentiments: number[];
      topics: Record<string, number>;
      sessionDepths: number[];
    }>();

    // 세션 깊이 계산을 위해 user+artist별 질의 수 추적
    const sessionMap = new Map<string, number>(); // key: `${user_id}_${wiki_entry_id}`

    for (const intent of intents) {
      if (!intent.wiki_entry_id) continue;

      const aid = intent.wiki_entry_id;
      if (!artistMap.has(aid)) {
        artistMap.set(aid, {
          queries: 0,
          users: new Set(),
          intents: {},
          sentiments: [],
          topics: {},
          sessionDepths: [],
        });
      }

      const agg = artistMap.get(aid)!;
      agg.queries++;
      if (intent.user_id) agg.users.add(intent.user_id);

      // Intent distribution
      const cat = intent.intent_category || "unknown";
      agg.intents[cat] = (agg.intents[cat] || 0) + 1;

      // Sentiment
      const sentVal = SENTIMENT_MAP[intent.sentiment || "neutral"] ?? 0;
      agg.sentiments.push(sentVal);

      // Topics
      if (intent.sub_topic) {
        agg.topics[intent.sub_topic] = (agg.topics[intent.sub_topic] || 0) + 1;
      }

      // Session depth tracking
      const sessionKey = `${intent.user_id}_${aid}`;
      sessionMap.set(sessionKey, (sessionMap.get(sessionKey) || 0) + 1);
    }

    // 세션 깊이 계산
    for (const [key, depth] of sessionMap) {
      const aid = key.split("_").slice(1).join("_");
      const agg = artistMap.get(aid);
      if (agg) agg.sessionDepths.push(depth);
    }

    // Upsert
    const rows = [];
    for (const [aid, agg] of artistMap) {
      const sentAvg = agg.sentiments.length > 0
        ? agg.sentiments.reduce((a, b) => a + b, 0) / agg.sentiments.length
        : 0;

      // Sentiment distribution
      const sentDist: Record<string, number> = {};
      for (const s of agg.sentiments) {
        const label = s > 0.3 ? "positive" : s < -0.3 ? "negative" : "neutral";
        sentDist[label] = (sentDist[label] || 0) + 1;
      }

      // Top topics
      const topTopics = Object.entries(agg.topics)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([t]) => t);

      const avgDepth = agg.sessionDepths.length > 0
        ? agg.sessionDepths.reduce((a, b) => a + b, 0) / agg.sessionDepths.length
        : 0;

      rows.push({
        wiki_entry_id: aid,
        signal_date: date,
        total_queries: agg.queries,
        unique_users: agg.users.size,
        intent_distribution: agg.intents,
        sentiment_avg: Math.round(sentAvg * 1000) / 1000,
        sentiment_distribution: sentDist,
        hot_topics: topTopics,
        avg_session_depth: Math.round(avgDepth * 100) / 100,
      });
    }

    // Upsert (unique on wiki_entry_id + signal_date)
    const { error: upsertErr } = await sb
      .from("ktrenz_fandom_signals")
      .upsert(rows, { onConflict: "wiki_entry_id,signal_date" });

    if (upsertErr) throw upsertErr;

    console.log(`[fandom-pulse] Done: ${rows.length} artists aggregated for ${date}`);

    return new Response(JSON.stringify({ ok: true, date, artists: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[fandom-pulse] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
