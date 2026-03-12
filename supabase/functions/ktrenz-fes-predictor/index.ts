// FES Predictor Agent: 패턴 학습 및 예측
// ktrenz-fes-analyst 실행 후 호출되어 트렌드 데이터를 기반으로 예측 생성
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORIES = ["youtube", "buzz", "album", "music", "social"] as const;

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

    const results: any[] = [];

    for (const entryId of targetIds.slice(0, 10)) { // 배치 제한
      // 최근 기여도 데이터 (30일)
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

      if (contributions.length < 2) continue; // 최소 데이터 2건 (수집 사이클 초기에도 예측 가능)

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
        // 시계열 패턴: 카테고리별 z-score 이동
        time_series: {
          youtube: contributions.map((c: any) => Number(c.youtube_z) || 0),
          buzz: contributions.map((c: any) => Number(c.buzz_z) || 0),
          album: contributions.map((c: any) => Number(c.album_z) || 0),
          music: contributions.map((c: any) => Number(c.music_z) || 0),
          social: contributions.map((c: any) => Number(c.social_z) || 0),
        },
      };

      // ── OpenAI 예측 요청 ──
      const systemPrompt = `You are a K-pop trend analyst AI. Analyze the provided FES (Fan Energy Score) data for "${artistName}" and generate predictions.

Rules:
- FES uses z-score normalized category changes (youtube, buzz, album, music, social)
- Focus on identifying: 1) which category will lead next movement, 2) whether FES will rise/fall/stay flat in next 24-48h, 3) any cross-category patterns (e.g., buzz spike preceding album spike)
- Be data-driven and specific with numbers
- If data is insufficient, say so honestly
- IMPORTANT: Provide reasoning in 4 languages (English, Korean, Japanese, Chinese) as separate fields`;

      const userPrompt = `Analyze this FES data and predict next 24-48h movement:

${JSON.stringify(features, null, 2)}

Provide your analysis with reasoning in all 4 languages.`;

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
              description: "Submit structured prediction for artist FES movement",
              parameters: {
                type: "object",
                properties: {
                  fes_direction: {
                    type: "string",
                    enum: ["rising", "falling", "flat", "spike_up", "spike_down"],
                    description: "Predicted FES direction in next 24-48h",
                  },
                  confidence: {
                    type: "number",
                    description: "Confidence 0-1",
                  },
                  leading_category_next: {
                    type: "string",
                    enum: ["youtube", "buzz", "album", "music", "social"],
                    description: "Which category will lead the next movement",
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
                  cross_category_pattern: {
                    type: "string",
                    description: "Detected cross-category pattern if any",
                  },
                  reasoning: {
                    type: "string",
                    description: "Brief explanation in English",
                  },
                  reasoning_ko: {
                    type: "string",
                    description: "Brief explanation in Korean (한국어)",
                  },
                  reasoning_ja: {
                    type: "string",
                    description: "Brief explanation in Japanese (日本語)",
                  },
                  reasoning_zh: {
                    type: "string",
                    description: "Brief explanation in Chinese (中文)",
                  },
                },
                required: ["fes_direction", "confidence", "leading_category_next", "category_predictions", "reasoning"],
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
        model_version: "v2-gpt4o-mini-i18n",
      });

      results.push({ artist: artistName, prediction });
    }

    // ── 과거 예측 검증 (24h 전 예측 vs 실제) ──
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
        // 예측 시점 이후의 최신 기여도 데이터 확인
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

        // 정확도: 방향 일치 여부 (단순)
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

    console.log(`[ktrenz-fes-predictor] Done: ${results.length} predictions`);

    return new Response(JSON.stringify({ ok: true, predictions: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ktrenz-fes-predictor] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
