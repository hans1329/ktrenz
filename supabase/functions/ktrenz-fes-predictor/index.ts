// FES Predictor Agent: 패턴 학습 및 예측
// v4: Signal Radar 통합 (Attention Map + Fandom Pulse + Event Labels)
// Tool Calling으로 구조화된 출력
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const { wiki_entry_ids, mode, batch_offset } = await req.json().catch(() => ({ wiki_entry_ids: null, mode: "predict", batch_offset: 0 }));
    const offset = batch_offset || 0;
    const BATCH_SIZE = 10;

    // 대상 아티스트
    let targetIds: string[] = wiki_entry_ids || [];
    if (!targetIds.length) {
      const { data: tiers } = await sb
        .from("v3_artist_tiers")
        .select("wiki_entry_id")
        .eq("tier", 1);
      targetIds = (tiers || []).map((t: any) => t.wiki_entry_id);
    }

    // ── 크로스 아티스트 벤치마크 데이터 수집 ──
    const { data: allTrends } = await sb
      .from("ktrenz_category_trends")
      .select("wiki_entry_id, category, trend_direction, momentum, change_7d, avg_7d, calculated_at")
      .gte("calculated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("calculated_at", { ascending: false })
      .limit(500);

    const artistTrendMap = new Map<string, any[]>();
    for (const t of allTrends || []) {
      const arr = artistTrendMap.get(t.wiki_entry_id) || [];
      arr.push(t);
      artistTrendMap.set(t.wiki_entry_id, arr);
    }

    // 아티스트 이름 매핑
    const allArtistIds = [...new Set([...targetIds, ...(allTrends || []).map((t: any) => t.wiki_entry_id)])];
    const { data: allArtists } = await sb
      .from("wiki_entries")
      .select("id, title")
      .in("id", allArtistIds.slice(0, 100));
    const nameMap = new Map((allArtists || []).map((a: any) => [a.id, a.title]));

    // 크로스 아티스트 벤치마크 인사이트
    const benchmarkInsights: string[] = [];
    for (const [aid, trends] of artistTrendMap) {
      if (targetIds.includes(aid)) continue;
      const spikes = trends.filter((t: any) => t.trend_direction === "spike" || (t.momentum && t.momentum > 0.5));
      for (const s of spikes.slice(0, 2)) {
        benchmarkInsights.push(
          `${nameMap.get(aid) || "Unknown"}: ${s.category} ${s.trend_direction} (momentum: ${s.momentum}, change_7d: ${s.change_7d})`
        );
      }
    }

    // 외부 영상 출연 성과
    const { data: recentExtVideos } = await sb
      .from("ktrenz_external_videos")
      .select("wiki_entry_id, channel_name, title, view_count, fetched_at")
      .gte("fetched_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("view_count", { ascending: false })
      .limit(20);

    const extVideoInsights = (recentExtVideos || []).map((v: any) =>
      `${nameMap.get(v.wiki_entry_id) || "Unknown"} appeared on "${v.channel_name}" (${v.title}) — ${(v.view_count / 1000000).toFixed(1)}M views`
    ).slice(0, 10);

    // ── Signal Radar 벌크 데이터 수집 (배치 전체) ──
    const batch = wiki_entry_ids ? targetIds : targetIds.slice(offset, offset + BATCH_SIZE);
    const batchIds = batch;

    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel bulk queries for Signal Radar data
    const [attentionRes, fandomRes, eventsRes] = await Promise.all([
      // Signal-C: Attention Map (최근 7일)
      sb.from("ktrenz_attention_signals")
        .select("wiki_entry_id, signal_date, treemap_clicks, detail_views, detail_sections, unique_viewers, ranking_card_clicks, avg_dwell_sections, external_link_clicks")
        .in("wiki_entry_id", batchIds)
        .gte("signal_date", cutoff7d)
        .order("signal_date", { ascending: false }),
      // Signal-B: Fandom Pulse (최근 7일)
      sb.from("ktrenz_fandom_signals")
        .select("wiki_entry_id, signal_date, intent_count, sentiment_avg, intent_distribution, hot_topics, unique_users")
        .in("wiki_entry_id", batchIds)
        .gte("signal_date", cutoff7d)
        .order("signal_date", { ascending: false }),
      // Signal-A: Event Labels (활성 + 최근 완료)
      sb.from("ktrenz_artist_events")
        .select("wiki_entry_id, event_type, event_label, start_date, end_date, impact_window_days, metadata, verified")
        .in("wiki_entry_id", batchIds)
        .gte("end_date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
    ]);

    // Group by wiki_entry_id
    const attentionMap = new Map<string, any[]>();
    for (const a of attentionRes.data || []) {
      const arr = attentionMap.get(a.wiki_entry_id) || [];
      arr.push(a);
      attentionMap.set(a.wiki_entry_id, arr);
    }

    const fandomMap = new Map<string, any[]>();
    for (const f of fandomRes.data || []) {
      const arr = fandomMap.get(f.wiki_entry_id) || [];
      arr.push(f);
      fandomMap.set(f.wiki_entry_id, arr);
    }

    const eventsMap = new Map<string, any[]>();
    for (const e of eventsRes.data || []) {
      const arr = eventsMap.get(e.wiki_entry_id) || [];
      arr.push(e);
      eventsMap.set(e.wiki_entry_id, arr);
    }

    console.log(`[ktrenz-fes-predictor] v4 Batch offset=${offset}, batch=${batch.length}, total=${targetIds.length}, signals: attention=${attentionRes.data?.length || 0}, fandom=${fandomRes.data?.length || 0}, events=${eventsRes.data?.length || 0}`);

    const results: any[] = [];

    for (const entryId of batch) {
      const [contribRes, trendRes, entryRes] = await Promise.all([
        sb.from("ktrenz_fes_contributions")
          .select("*")
          .eq("wiki_entry_id", entryId)
          .gte("snapshot_at", cutoff30d)
          .order("snapshot_at", { ascending: true })
          .limit(120),
        sb.from("ktrenz_category_trends")
          .select("*")
          .eq("wiki_entry_id", entryId)
          .order("calculated_at", { ascending: false })
          .limit(5),
        sb.from("wiki_entries")
          .select("title")
          .eq("id", entryId)
          .maybeSingle(),
      ]);

      const contributions = contribRes.data || [];
      const trends = trendRes.data || [];
      const artistName = entryRes.data?.title || entryId;

      if (contributions.length < 2) continue;

      // ── 피처 구성 ──
      const latestContrib = contributions[contributions.length - 1];
      const latestZScores: Record<string, number> = {
        youtube: Number(latestContrib?.youtube_z) || 0,
        buzz: Number(latestContrib?.buzz_z) || 0,
        album: Number(latestContrib?.album_z) || 0,
        music: Number(latestContrib?.music_z) || 0,
        social: Number(latestContrib?.social_z) || 0,
      };

      // Signal Radar features per artist
      const attentionData = attentionMap.get(entryId) || [];
      const fandomData = fandomMap.get(entryId) || [];
      const eventData = eventsMap.get(entryId) || [];

      const features = {
        artist: artistName,
        data_points: contributions.length,
        latest_contributions: contributions.slice(-5).map((c: any) => ({
          at: c.snapshot_at,
          yt_z: c.youtube_z, bz_z: c.buzz_z, al_z: c.album_z, mu_z: c.music_z, so_z: c.social_z,
          leading: c.leading_category, normalized_fes: c.normalized_fes,
        })),
        category_trends: trends.map((t: any) => ({
          cat: t.category, dir: t.trend_direction, momentum: t.momentum,
          avg_7d: t.avg_7d, avg_30d: t.avg_30d, change_7d: t.change_7d, change_30d: t.change_30d,
          latest_z: latestZScores[t.category] ?? 0,
        })),
        time_series: {
          youtube: contributions.map((c: any) => Number(c.youtube_z) || 0),
          buzz: contributions.map((c: any) => Number(c.buzz_z) || 0),
          album: contributions.map((c: any) => Number(c.album_z) || 0),
          music: contributions.map((c: any) => Number(c.music_z) || 0),
          social: contributions.map((c: any) => Number(c.social_z) || 0),
        },
        // ── Signal Radar v4 ──
        signal_attention: attentionData.length > 0 ? {
          days: attentionData.length,
          latest: attentionData[0] ? {
            date: attentionData[0].signal_date,
            treemap_clicks: attentionData[0].treemap_clicks,
            detail_views: attentionData[0].detail_views,
            unique_viewers: attentionData[0].unique_viewers,
            ranking_card_clicks: attentionData[0].ranking_card_clicks,
            avg_dwell_sections: attentionData[0].avg_dwell_sections,
            external_link_clicks: attentionData[0].external_link_clicks,
            section_distribution: attentionData[0].detail_sections,
          } : null,
          trend_7d: {
            avg_detail_views: attentionData.reduce((s: number, a: any) => s + (a.detail_views || 0), 0) / Math.max(attentionData.length, 1),
            avg_unique_viewers: attentionData.reduce((s: number, a: any) => s + (a.unique_viewers || 0), 0) / Math.max(attentionData.length, 1),
            total_treemap_clicks: attentionData.reduce((s: number, a: any) => s + (a.treemap_clicks || 0), 0),
            total_external_clicks: attentionData.reduce((s: number, a: any) => s + (a.external_link_clicks || 0), 0),
          },
        } : null,
        signal_fandom: fandomData.length > 0 ? {
          days: fandomData.length,
          latest: fandomData[0] ? {
            date: fandomData[0].signal_date,
            intent_count: fandomData[0].intent_count,
            sentiment_avg: fandomData[0].sentiment_avg,
            unique_users: fandomData[0].unique_users,
            intent_distribution: fandomData[0].intent_distribution,
            hot_topics: fandomData[0].hot_topics,
          } : null,
          trend_7d: {
            avg_sentiment: fandomData.reduce((s: number, f: any) => s + (Number(f.sentiment_avg) || 0), 0) / Math.max(fandomData.length, 1),
            total_intents: fandomData.reduce((s: number, f: any) => s + (f.intent_count || 0), 0),
            avg_unique_users: fandomData.reduce((s: number, f: any) => s + (f.unique_users || 0), 0) / Math.max(fandomData.length, 1),
          },
        } : null,
        signal_events: eventData.length > 0 ? eventData.map((e: any) => ({
          type: e.event_type,
          label: e.event_label,
          start: e.start_date,
          end: e.end_date,
          impact_window: e.impact_window_days,
          verified: e.verified,
          metadata: e.metadata,
        })) : null,
        // 크로스 아티스트 벤치마크
        benchmark_context: {
          other_artists_spikes: benchmarkInsights.slice(0, 8),
          recent_successful_appearances: extVideoInsights.slice(0, 5),
        },
      };

      // ── OpenAI 예측 요청 (v4: Signal Radar 통합 듀얼 페르소나) ──
      const systemPrompt = `You are a K-pop trend analyst AI (v4) with TWO output personas for "${artistName}".
You now have access to THREE exclusive Signal Radar data sources IN ADDITION to standard FES metrics:

## SIGNAL RADAR DATA (Exclusive to KTrenZ)
1. **signal_attention** — User behavior within KTrenZ platform (clicks, views, dwell time)
   - High detail_views + low FES → "hidden interest" building before public breakout
   - Rising unique_viewers → growing audience beyond core fans
   - section_distribution shows what fans are investigating (youtube/music/buzz sections)
   - external_link_clicks indicate purchase/streaming intent
2. **signal_fandom** — Fan Agent chat intents and sentiment aggregation
   - sentiment_avg (0-1) captures real-time emotional temperature
   - intent_distribution shows what fans are ASKING about (tour dates, album releases, etc.)
   - hot_topics reveal trending discussion themes
   - Rising intent_count with stable sentiment → anticipation building
3. **signal_events** — Labeled events (comeback, festival, variety show, etc.)
   - Active events provide CONTEXT for current metric movements
   - impact_window_days indicates expected influence duration
   - Use events to distinguish organic growth from event-driven spikes

## PERSONA 1: FAN SUNBAE (친한 팬 선배)
Generate THREE pieces:
### 1. hot_summary — "지금 뭐가 뜨는지" 한줄 요약
- One punchy sentence about what's currently hot
- Include the specific category moving (YouTube, Buzz, etc.)
- When signal_attention shows high activity, mention "관심 급등" naturally
- When signal_fandom shows strong sentiment, weave in fan mood
- Casual tone with emoji. NO numbers, NO percentages, NO technical terms.

### 2. fan_action — 팬이 할 수 있는 액션 추천
- One specific, actionable thing fans can do RIGHT NOW
- If an event is active, reference it naturally: "컴백 직전이니까 스밍 미리 준비하자!"
- If attention is rising, leverage FOMO: "다른 팬들도 슬슬 관심 갖기 시작했어!"
- Practical, friend-like tone with emoji

### 3. position_note — 다른 아티스트 대비 위치
- Compare to competitive landscape WITHOUT naming other artists
- If signal_attention is strong relative to FES, note the "hidden momentum"
- One sentence, encouraging tone

IMPORTANT: Write in the target language naturally. Korean=반말, English=casual, Japanese=タメ口.

## PERSONA 2: AGENCY ACTION ITEMS
- Senior strategy consultant, extremely data-driven
- NOW leverage Signal Radar data for deeper insights:
  - If attention diverges from FES → "hidden demand" opportunity
  - If fandom sentiment is strong but FES low → "untapped conversion potential"
  - If an event is approaching → proactive preparation strategy
- Reference competitive benchmarks from OTHER artists
- Suggest 2-3 specific, actionable strategies with clear rationale
- Each: title, action, expected_impact, priority, category

## DATA RULES
- FES uses z-score normalized category changes (youtube, buzz, album, music, social)
- CRITICAL: "latest_z" = CURRENT absolute level. "dir" = 7-day TREND direction.
  - High latest_z + "falling" dir = "still strong but slightly declining from peak"
  - Low latest_z + "falling" dir = "genuinely weak and declining"
- signal_* fields may be null if no data collected yet — skip those insights gracefully
- Provide ALL text fields in 4 languages (EN, KO, JA, ZH)`;

      const userPrompt = `Analyze this FES + Signal Radar data and generate v4 dual-persona output:

${JSON.stringify(features, null, 2)}

Generate prediction + fan briefing + agency action items.`;

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "submit_prediction",
              description: "Submit structured prediction with fan and agency personas, including Signal Radar insights",
              parameters: {
                type: "object",
                properties: {
                  fes_direction: {
                    type: "string",
                    enum: ["rising", "falling", "flat", "spike_up", "spike_down"],
                  },
                  confidence: { type: "number", description: "0-1" },
                  leading_category_next: {
                    type: "string",
                    enum: ["youtube", "buzz", "album", "music", "social"],
                  },
                  category_predictions: {
                    type: "object",
                    properties: {
                      youtube: { type: "string", enum: ["up", "down", "flat"] },
                      buzz: { type: "string", enum: ["up", "down", "flat"] },
                      album: { type: "string", enum: ["up", "down", "flat"] },
                      music: { type: "string", enum: ["up", "down", "flat"] },
                      social: { type: "string", enum: ["up", "down", "flat"] },
                    },
                    required: ["youtube", "buzz", "album", "music", "social"],
                  },
                  // Signal Radar confidence boost
                  signal_confidence_factors: {
                    type: "object",
                    description: "How each signal source influenced the prediction confidence",
                    properties: {
                      attention_impact: { type: "string", enum: ["strong", "moderate", "weak", "no_data"], description: "How much attention data influenced prediction" },
                      fandom_impact: { type: "string", enum: ["strong", "moderate", "weak", "no_data"], description: "How much fandom data influenced prediction" },
                      event_impact: { type: "string", enum: ["strong", "moderate", "weak", "no_data"], description: "How much event context influenced prediction" },
                    },
                    required: ["attention_impact", "fandom_impact", "event_impact"],
                  },
                  // Fan sunbae
                  hot_summary: { type: "string" },
                  hot_summary_ko: { type: "string" },
                  hot_summary_ja: { type: "string" },
                  hot_summary_zh: { type: "string" },
                  fan_action: { type: "string" },
                  fan_action_ko: { type: "string" },
                  fan_action_ja: { type: "string" },
                  fan_action_zh: { type: "string" },
                  position_note: { type: "string" },
                  position_note_ko: { type: "string" },
                  position_note_ja: { type: "string" },
                  position_note_zh: { type: "string" },
                  // Legacy fan_briefing (backward compat)
                  fan_briefing: { type: "string" },
                  fan_briefing_ko: { type: "string" },
                  fan_briefing_ja: { type: "string" },
                  fan_briefing_zh: { type: "string" },
                  // Agency action items
                  agency_actions: {
                    type: "array",
                    description: "2-3 strategic action items for the agency",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        action: { type: "string" },
                        rationale: { type: "string" },
                        expected_impact: { type: "string" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        category: { type: "string", enum: ["youtube", "buzz", "album", "music", "social"] },
                        signal_source: { type: "string", enum: ["fes_only", "attention", "fandom", "event", "combined"], description: "Which signal primarily drove this recommendation" },
                      },
                      required: ["title", "action", "rationale", "priority", "category", "signal_source"],
                    },
                  },
                  // Technical reasoning
                  reasoning: { type: "string" },
                  reasoning_ko: { type: "string" },
                  reasoning_ja: { type: "string" },
                  reasoning_zh: { type: "string" },
                },
                required: ["fes_direction", "confidence", "leading_category_next", "category_predictions",
                  "signal_confidence_factors",
                  "hot_summary", "hot_summary_ko", "fan_action", "fan_action_ko", "position_note", "position_note_ko",
                  "agency_actions", "reasoning"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "submit_prediction" } },
        }),
      });

      if (!aiResponse.ok) {
        console.error(`[ktrenz-fes-predictor] OpenAI error for ${artistName}:`, await aiResponse.text());
        continue;
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) continue;

      let prediction: any;
      try {
        prediction = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error(`[ktrenz-fes-predictor] Parse error for ${artistName}`);
        continue;
      }

      // ── DB 저장 ──
      await sb.from("ktrenz_prediction_logs").insert({
        wiki_entry_id: entryId,
        prediction_type: "fes_direction",
        prediction,
        reasoning: prediction.reasoning,
        features_used: features,
        model_version: "v4-signal-radar",
      });

      results.push({ artist: artistName, prediction });
    }

    // ── 과거 예측 검증 ──
    if (mode !== "predict_only") {
      const verify24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const verify48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const { data: oldPredictions } = await sb
        .from("ktrenz_prediction_logs")
        .select("id, wiki_entry_id, prediction, predicted_at")
        .gte("predicted_at", verify48h)
        .lte("predicted_at", verify24h)
        .is("verified_at", null)
        .limit(50);

      for (const pred of oldPredictions || []) {
        const { data: latestContrib } = await sb
          .from("ktrenz_fes_contributions")
          .select("normalized_fes, leading_category")
          .eq("wiki_entry_id", pred.wiki_entry_id)
          .gt("snapshot_at", pred.predicted_at)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: predTimeContrib } = await sb
          .from("ktrenz_fes_contributions")
          .select("normalized_fes")
          .eq("wiki_entry_id", pred.wiki_entry_id)
          .lte("snapshot_at", pred.predicted_at)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestContrib || !predTimeContrib) continue;

        const actualDelta = Number(latestContrib.normalized_fes) - Number(predTimeContrib.normalized_fes);
        const predDirection = pred.prediction?.fes_direction;
        let actualDirection = "flat";
        if (actualDelta > 5) actualDirection = actualDelta > 20 ? "spike_up" : "rising";
        else if (actualDelta < -5) actualDirection = actualDelta < -20 ? "spike_down" : "falling";

        const directionMatch = (predDirection === actualDirection) ? 1.0
          : (predDirection?.includes("up") && actualDirection.includes("up")) || (predDirection?.includes("down") && actualDirection.includes("down"))
            ? 0.7 : (predDirection === "flat" && actualDirection === "flat") ? 1.0 : 0.0;

        const leadingMatch = pred.prediction?.leading_category_next === latestContrib.leading_category ? 0.3 : 0;

        await sb.from("ktrenz_prediction_logs").update({
          outcome: { actual_direction: actualDirection, actual_delta: actualDelta, actual_leading: latestContrib.leading_category },
          accuracy_score: Math.min(directionMatch + leadingMatch, 1),
          verified_at: new Date().toISOString(),
        }).eq("id", pred.id);
      }
    }

    // ── 콜백 체이닝: 다음 배치 ──
    const nextOffset = offset + BATCH_SIZE;
    let chainedNext = false;
    if (!wiki_entry_ids && nextOffset < targetIds.length) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      try {
        const chainRes = await fetch(`${SUPABASE_URL}/functions/v1/ktrenz-fes-predictor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ mode, batch_offset: nextOffset }),
        });
        await chainRes.text();
        chainedNext = true;
        console.log(`[ktrenz-fes-predictor] Chained next batch offset=${nextOffset}`);
      } catch (e) {
        console.error(`[ktrenz-fes-predictor] Chain call failed:`, e);
      }
    }

    console.log(`[ktrenz-fes-predictor] v4 Done: ${results.length} predictions (offset=${offset}, chained=${chainedNext})`);

    return new Response(JSON.stringify({ ok: true, version: "v4-signal-radar", predictions: results, offset, chained: chainedNext }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ktrenz-fes-predictor] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
