// FES Predictor Agent: 패턴 학습 및 예측
// ktrenz-fes-analyst 실행 후 호출되어 트렌드 데이터를 기반으로 예측 생성
// v3: Fan/Agency 듀얼 페르소나 + 크로스 아티스트 벤치마킹
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

    const { wiki_entry_ids, mode } = await req.json().catch(() => ({ wiki_entry_ids: null, mode: "predict" }));

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
    // 최근 7일간 다른 아티스트들의 카테고리별 변동 트렌드
    const { data: allTrends } = await sb
      .from("ktrenz_category_trends")
      .select("wiki_entry_id, category, trend_direction, momentum, change_7d, avg_7d, calculated_at")
      .gte("calculated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("calculated_at", { ascending: false })
      .limit(500);

    // 아티스트별 최신 트렌드 매핑
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

    // 최근 급등 사례 수집 (벤치마크용)
    const benchmarkInsights: string[] = [];
    for (const [aid, trends] of artistTrendMap) {
      if (targetIds.includes(aid)) continue; // 자기 자신 제외
      const spikes = trends.filter((t: any) => t.trend_direction === "spike" || (t.momentum && t.momentum > 0.5));
      for (const s of spikes.slice(0, 2)) {
        benchmarkInsights.push(
          `${nameMap.get(aid) || "Unknown"}: ${s.category} ${s.trend_direction} (momentum: ${s.momentum}, change_7d: ${s.change_7d})`
        );
      }
    }

    // 최근 외부 영상 출연 성과 (벤치마크용)
    const { data: recentExtVideos } = await sb
      .from("ktrenz_external_videos")
      .select("wiki_entry_id, channel_name, title, view_count, fetched_at")
      .gte("fetched_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("view_count", { ascending: false })
      .limit(20);

    const extVideoInsights = (recentExtVideos || []).map((v: any) =>
      `${nameMap.get(v.wiki_entry_id) || "Unknown"} appeared on "${v.channel_name}" (${v.title}) — ${(v.view_count / 1000000).toFixed(1)}M views`
    ).slice(0, 10);

    const results: any[] = [];

    for (const entryId of targetIds.slice(0, 10)) {
      const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
        })),
        time_series: {
          youtube: contributions.map((c: any) => Number(c.youtube_z) || 0),
          buzz: contributions.map((c: any) => Number(c.buzz_z) || 0),
          album: contributions.map((c: any) => Number(c.album_z) || 0),
          music: contributions.map((c: any) => Number(c.music_z) || 0),
          social: contributions.map((c: any) => Number(c.social_z) || 0),
        },
        // 크로스 아티스트 벤치마크 컨텍스트
        benchmark_context: {
          other_artists_spikes: benchmarkInsights.slice(0, 8),
          recent_successful_appearances: extVideoInsights.slice(0, 5),
        },
      };

      // ── OpenAI 예측 요청 (듀얼 페르소나) ──
      const systemPrompt = `You are a K-pop trend analyst AI with TWO output personas for "${artistName}".

## PERSONA 1: FAN SUNBAE (친한 팬 선배)
You are a friendly, experienced fan senior (선배/sunbae) who talks casually to a fellow fan.
Generate THREE separate pieces:

### 1. hot_summary — "지금 뭐가 뜨는지" 한줄 요약
- One punchy sentence about what's currently hot or notable
- Include the specific category that's moving (YouTube, Buzz, etc.) 
- Use casual tone with emoji: "YouTube 요즘 터지고 있어! 🔥" or "앨범 쪽은 좀 조용한데 버즈가 살아나는 중 👀"
- NO numbers, NO percentages, NO technical terms

### 2. fan_action — 팬이 할 수 있는 액션 추천
- One specific, actionable thing fans can do RIGHT NOW
- Be practical: "뮤비 스밍 지금 밀면 타이밍 좋을듯!" or "SNS에 해시태그 달아서 버즈 올리자!"
- Make it feel like a friend suggesting something, not an instruction
- Include an emoji

### 3. position_note — 다른 아티스트 대비 위치
- Compare to the general competitive landscape WITHOUT naming specific other artists
- Use relative terms: "상위권에서 잘 버티고 있어" or "지금 치고 올라가는 중이야"
- Reference benchmark_context data but describe it naturally, NEVER mention data sources
- One sentence, encouraging tone

IMPORTANT: Write in the target language naturally. Korean should use 반말 (informal speech). English should be casual. Japanese should use タメ口. All should feel like a friend texting.

## PERSONA 2: AGENCY ACTION ITEMS
- Write as a senior strategy consultant for a K-pop entertainment agency
- Be extremely data-driven and specific
- Reference competitive benchmarks from OTHER artists (provided in benchmark_context) WITHOUT naming the data source
- Suggest 2-3 specific, actionable strategies with clear rationale
- Each action item should have: title, specific action, expected impact, priority (high/medium/low)

## DATA RULES
- FES uses z-score normalized category changes (youtube, buzz, album, music, social)
- Focus on which category will lead next movement
- Be honest if data is insufficient
- Provide ALL text fields in 4 languages (EN, KO, JA, ZH)`;

      const userPrompt = `Analyze this FES data and generate dual-persona output:

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
              description: "Submit structured prediction with fan and agency personas",
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
                  // Fan sunbae — hot summary (one-liner)
                  hot_summary: { type: "string", description: "One punchy sentence about what's hot in English" },
                  hot_summary_ko: { type: "string", description: "Korean 반말" },
                  hot_summary_ja: { type: "string", description: "Japanese タメ口" },
                  hot_summary_zh: { type: "string", description: "Chinese casual" },
                  // Fan sunbae — fan action recommendation
                  fan_action: { type: "string", description: "Recommended fan action in English" },
                  fan_action_ko: { type: "string", description: "Korean 반말" },
                  fan_action_ja: { type: "string", description: "Japanese タメ口" },
                  fan_action_zh: { type: "string", description: "Chinese casual" },
                  // Fan sunbae — positioning vs others
                  position_note: { type: "string", description: "Competitive position note in English" },
                  position_note_ko: { type: "string", description: "Korean 반말" },
                  position_note_ja: { type: "string", description: "Japanese タメ口" },
                  position_note_zh: { type: "string", description: "Chinese casual" },
                  // Legacy fan_briefing (kept for backward compat, now derived from above 3)
                  fan_briefing: { type: "string", description: "Combined fan briefing in English (concatenate hot_summary + fan_action + position_note)" },
                  fan_briefing_ko: { type: "string", description: "Combined fan briefing in Korean" },
                  fan_briefing_ja: { type: "string", description: "Combined fan briefing in Japanese" },
                  fan_briefing_zh: { type: "string", description: "Combined fan briefing in Chinese" },
                  // Agency action items (data-driven, strategic)
                  agency_actions: {
                    type: "array",
                    description: "2-3 strategic action items for the agency",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Action title in Korean" },
                        action: { type: "string", description: "Specific actionable recommendation in Korean" },
                        rationale: { type: "string", description: "Data-driven rationale in Korean" },
                        expected_impact: { type: "string", description: "Expected outcome in Korean" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        category: { type: "string", enum: ["youtube", "buzz", "album", "music", "social"] },
                      },
                      required: ["title", "action", "rationale", "priority", "category"],
                    },
                  },
                  // Technical reasoning
                  reasoning: { type: "string", description: "Brief technical reasoning in English" },
                  reasoning_ko: { type: "string", description: "Brief technical reasoning in Korean" },
                  reasoning_ja: { type: "string", description: "Brief technical reasoning in Japanese" },
                  reasoning_zh: { type: "string", description: "Brief technical reasoning in Chinese" },
                },
                required: ["fes_direction", "confidence", "leading_category_next", "category_predictions",
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
        model_version: "v3-dual-persona",
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

    console.log(`[ktrenz-fes-predictor] Done: ${results.length} predictions (v3-dual-persona)`);

    return new Response(JSON.stringify({ ok: true, predictions: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ktrenz-fes-predictor] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
