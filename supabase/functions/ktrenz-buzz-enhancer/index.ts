// ktrenz-buzz-enhancer: 버즈 데이터 보강 레이어
// 1) 네이버 뉴스 관련성 필터링 (AI Gateway - Gemini Flash)
// 2) Perplexity 글로벌 버즈 보강 (빈약한 아티스트 대상)
// buzz-cron 파이프라인 후단에서 호출됨
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── AI 관련성 필터링 ──
interface NewsItem {
  title: string;
  description: string;
  url?: string;
  source?: string;
  image?: string;
}

async function filterNewsRelevance(
  artistName: string,
  koreanName: string | null,
  newsItems: NewsItem[],
  lovableApiKey: string,
): Promise<{ relevant: NewsItem[]; filtered: number; total: number }> {
  if (!newsItems.length) return { relevant: [], filtered: 0, total: 0 };

  // 최대 20개만 AI 판별 (비용/속도 최적화)
  const batch = newsItems.slice(0, 20);

  const prompt = `You are a K-pop news relevance judge. For each news article below, determine if it is ACTUALLY about the K-pop artist "${artistName}"${koreanName ? ` (Korean name: ${koreanName})` : ""}.

Rules:
- RELEVANT: The article is specifically about this artist (comeback, performance, interview, chart, scandal, etc.)
- IRRELEVANT: The article mentions the artist name coincidentally, is about a different person/thing with the same name, or is generic entertainment news that barely mentions them.
- Be strict: if the artist is only mentioned in passing or as part of a list without meaningful content, mark as IRRELEVANT.

Articles:
${batch.map((item, i) => `[${i}] Title: ${item.title}\nDesc: ${item.description}`).join("\n\n")}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a precise content classifier. Return only the tool call result." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_news",
            description: "Classify each news article as relevant or irrelevant to the artist",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number", description: "Article index (0-based)" },
                      relevant: { type: "boolean", description: "true if article is about the artist" },
                      reason: { type: "string", description: "Brief reason (max 10 words)" },
                    },
                    required: ["index", "relevant"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["results"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_news" } },
      }),
    });

    if (!response.ok) {
      console.warn(`[buzz-enhancer] AI relevance filter failed: ${response.status}`);
      return { relevant: newsItems, filtered: 0, total: newsItems.length };
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.warn("[buzz-enhancer] No tool call in AI response");
      return { relevant: newsItems, filtered: 0, total: newsItems.length };
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const relevantIndices = new Set(
      (parsed.results || []).filter((r: any) => r.relevant).map((r: any) => r.index)
    );

    // AI가 판별한 것 중 relevant만 유지 + AI 판별 안 된 나머지(20개 이후)는 유지
    const relevant = [
      ...batch.filter((_, i) => relevantIndices.has(i)),
      ...newsItems.slice(20), // 20개 이후는 그대로 유지
    ];

    const filteredCount = batch.length - relevantIndices.size;
    console.log(`[buzz-enhancer] ${artistName}: AI filtered ${filteredCount}/${batch.length} irrelevant news`);

    return { relevant, filtered: filteredCount, total: newsItems.length };
  } catch (e) {
    console.warn(`[buzz-enhancer] AI filter error: ${(e as Error).message}`);
    return { relevant: newsItems, filtered: 0, total: newsItems.length };
  }
}

// ── Perplexity 글로벌 버즈 검색 ──
interface PerplexityBuzz {
  globalMentions: number;
  summary: string;
  sentiment: string;
  topTopics: string[];
  citations: string[];
}

async function searchPerplexityBuzz(
  artistName: string,
  koreanName: string | null,
  perplexityKey: string,
): Promise<PerplexityBuzz | null> {
  try {
    const query = koreanName
      ? `What are the latest news and buzz about K-pop artist "${artistName}" (${koreanName}) in the last 24 hours? Include social media trends, news, fan reactions.`
      : `What are the latest news and buzz about K-pop artist "${artistName}" in the last 24 hours? Include social media trends, news, fan reactions.`;

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `You are a K-pop industry analyst. Analyze the latest buzz about the given artist. Focus on: news articles, social media trending, fan community activity, chart performance mentions, upcoming events. Be factual and cite sources.`,
          },
          { role: "user", content: query },
        ],
        search_recency_filter: "day",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[buzz-enhancer] Perplexity failed: ${response.status} ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    // 내용 길이로 대략적인 멘션 레벨 추정
    // 긴 응답 = 많은 화제, 짧은 응답 = 적은 화제
    const contentLength = content.length;
    let globalMentions = 0;
    if (contentLength > 2000) globalMentions = 15; // 높은 화제성
    else if (contentLength > 1000) globalMentions = 10;
    else if (contentLength > 500) globalMentions = 5;
    else if (contentLength > 200) globalMentions = 2;
    else globalMentions = 0;

    // citations 수로 보강
    globalMentions += Math.min(citations.length * 2, 10);

    // 간단한 감성 판단
    const lowerContent = content.toLowerCase();
    const posWords = ["comeback", "success", "chart", "trending", "viral", "record", "award", "milestone", "sold out"];
    const negWords = ["controversy", "scandal", "decline", "criticized", "lawsuit", "disband"];
    const posCount = posWords.filter(w => lowerContent.includes(w)).length;
    const negCount = negWords.filter(w => lowerContent.includes(w)).length;
    const sentiment = posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

    // 주요 토픽 추출 (간단 키워드)
    const topicPatterns = [
      /comeback/i, /album/i, /tour|concert/i, /chart/i, /award/i,
      /collaboration/i, /variety show/i, /mv|music video/i, /fan meet/i,
      /scandal|controversy/i, /drama/i, /ost/i,
    ];
    const topTopics = topicPatterns
      .filter(p => p.test(content))
      .map(p => p.source.replace(/\\/g, "").replace(/\|/g, "/").replace(/i$/, ""));

    return {
      globalMentions,
      summary: content.slice(0, 500),
      sentiment,
      topTopics: topTopics.slice(0, 5),
      citations,
    };
  } catch (e) {
    console.warn(`[buzz-enhancer] Perplexity error: ${(e as Error).message}`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { wiki_entry_id, artistName, koreanName, mode } = body;
    // mode: "single" (단일 아티스트) or "batch" (배치 — data-engine에서 호출)
    // batch 모드: wiki_entry_ids 배열

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 배치 모드 ──
    if (mode === "batch") {
      const batchIds: string[] = body.wiki_entry_ids || [];
      const batchSize = Math.min(Number(body.batchSize) || 10, 20);
      const batchOffset = Math.max(0, Number(body.batchOffset) || 0);

      let targetIds = batchIds;
      if (!targetIds.length) {
        const { data: tiers } = await sb
          .from("v3_artist_tiers")
          .select("wiki_entry_id")
          .eq("tier", 1)
          .order("wiki_entry_id", { ascending: true });
        targetIds = (tiers || []).map((t: any) => t.wiki_entry_id);
      }

      const batch = targetIds.slice(batchOffset, batchOffset + batchSize);
      if (!batch.length) {
        return new Response(JSON.stringify({ ok: true, message: "No targets in batch" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 아티스트 정보 조회
      const { data: artists } = await sb
        .from("wiki_entries")
        .select("id, title")
        .in("id", batch);
      const { data: tiers } = await sb
        .from("v3_artist_tiers")
        .select("wiki_entry_id, name_ko")
        .in("wiki_entry_id", batch);

      const koMap = new Map((tiers || []).map((t: any) => [t.wiki_entry_id, t.name_ko]));
      const artistMap = new Map((artists || []).map((a: any) => [a.id, a.title]));

      let enhancedCount = 0;
      let filteredTotal = 0;
      let perplexityBoostCount = 0;

      for (const id of batch) {
        const name = artistMap.get(id);
        if (!name) continue;
        const koName = koMap.get(id) || null;

        try {
          // 1) 네이버 뉴스 관련성 필터링
          const { data: naverSnap } = await sb
            .from("ktrenz_data_snapshots")
            .select("id, metrics, raw_response")
            .eq("wiki_entry_id", id)
            .eq("platform", "naver_news")
            .order("collected_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (naverSnap?.raw_response?.top_items?.length) {
            const { relevant, filtered } = await filterNewsRelevance(
              name, koName, naverSnap.raw_response.top_items, lovableApiKey,
            );
            filteredTotal += filtered;

            if (filtered > 0) {
              // 관련 뉴스만으로 mention_count 재계산
              const originalCount = naverSnap.metrics?.mention_count || 0;
              const adjustedCount = Math.max(0, Math.round(
                originalCount * (relevant.length / naverSnap.raw_response.top_items.length)
              ));

              // 스냅샷 업데이트 (원본 보존 + 필터 결과 추가)
              await sb.from("ktrenz_data_snapshots").update({
                metrics: {
                  ...naverSnap.metrics,
                  mention_count_raw: originalCount,
                  mention_count: adjustedCount,
                  weighted_count: Math.round(adjustedCount * 1.3),
                  ai_filtered: filtered,
                  ai_relevant: relevant.length,
                },
                raw_response: {
                  ...naverSnap.raw_response,
                  top_items: relevant.slice(0, 5),
                  top_items_unfiltered: naverSnap.raw_response.top_items,
                },
              }).eq("id", naverSnap.id);
            }
          }

          // 2) 버즈 빈약 체크 → Perplexity 보강
          if (perplexityKey) {
            const { data: buzzSnap } = await sb
              .from("ktrenz_data_snapshots")
              .select("id, metrics")
              .eq("wiki_entry_id", id)
              .eq("platform", "buzz_multi")
              .order("collected_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const buzzScore = buzzSnap?.metrics?.buzz_score || 0;
            const totalMentions = buzzSnap?.metrics?.total_mentions || 0;

            // 버즈가 빈약한 경우 (점수 500 미만 또는 멘션 5개 미만)
            if (buzzScore < 500 || totalMentions < 5) {
              const pxResult = await searchPerplexityBuzz(name, koName, perplexityKey);

              if (pxResult && pxResult.globalMentions > 0) {
                perplexityBoostCount++;

                // Perplexity 보강 데이터 스냅샷 저장
                await sb.from("ktrenz_data_snapshots").insert({
                  wiki_entry_id: id,
                  platform: "perplexity_buzz",
                  metrics: {
                    global_mentions: pxResult.globalMentions,
                    sentiment: pxResult.sentiment,
                    top_topics: pxResult.topTopics,
                    citation_count: pxResult.citations.length,
                  },
                  raw_response: {
                    summary: pxResult.summary,
                    citations: pxResult.citations.slice(0, 10),
                  },
                });

                // buzz_multi 스냅샷에 perplexity 보강 반영
                if (buzzSnap) {
                  const existingBreakdown = buzzSnap.metrics?.source_breakdown || [];
                  const pxWeighted = pxResult.globalMentions * 1.4; // Perplexity 가중치

                  await sb.from("ktrenz_data_snapshots").update({
                    metrics: {
                      ...buzzSnap.metrics,
                      buzz_score: buzzScore + Math.round(Math.sqrt(pxWeighted) * 80),
                      total_mentions: totalMentions + pxResult.globalMentions,
                      perplexity_boost: {
                        mentions: pxResult.globalMentions,
                        sentiment: pxResult.sentiment,
                        topics: pxResult.topTopics,
                      },
                      source_breakdown: [
                        ...existingBreakdown,
                        {
                          source: "perplexity_global",
                          mentions: pxResult.globalMentions,
                          relevance: pxResult.globalMentions,
                          weight: 1.4,
                          weighted: Math.round(pxResult.globalMentions * 1.4),
                        },
                      ],
                    },
                  }).eq("id", buzzSnap.id);

                  // v3_scores_v2도 업데이트
                  const newBuzzScore = buzzScore + Math.round(Math.sqrt(pxWeighted) * 80);
                  await sb.from("v3_scores_v2").update({
                    buzz_score: newBuzzScore,
                    scored_at: new Date().toISOString(),
                  }).eq("wiki_entry_id", id);
                }
              }
            }
          }

          enhancedCount++;

          // Perplexity rate limit 방지
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.warn(`[buzz-enhancer] Error for ${name}: ${(e as Error).message}`);
        }
      }

      // 수집 로그
      await sb.from("ktrenz_collection_log").insert({
        platform: "buzz_enhancer",
        status: "success",
        records_collected: enhancedCount,
        error_message: filteredTotal > 0 || perplexityBoostCount > 0
          ? `AI filtered ${filteredTotal} irrelevant news, Perplexity boosted ${perplexityBoostCount} artists`
          : null,
      });

      const result = {
        ok: true,
        batchOffset,
        batchSize,
        processed: batch.length,
        enhanced: enhancedCount,
        newsFiltered: filteredTotal,
        perplexityBoosted: perplexityBoostCount,
        totalCandidates: targetIds.length,
      };

      console.log("[buzz-enhancer] Batch done:", JSON.stringify(result));
      return new Response(JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 단일 아티스트 모드 ──
    if (!wiki_entry_id || !artistName) {
      return new Response(JSON.stringify({ error: "wiki_entry_id and artistName required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) 네이버 뉴스 필터링
    const { data: naverSnap } = await sb
      .from("ktrenz_data_snapshots")
      .select("id, metrics, raw_response")
      .eq("wiki_entry_id", wiki_entry_id)
      .eq("platform", "naver_news")
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let newsFilterResult = null;
    if (naverSnap?.raw_response?.top_items?.length) {
      newsFilterResult = await filterNewsRelevance(
        artistName, koreanName || null, naverSnap.raw_response.top_items, lovableApiKey,
      );
    }

    // 2) Perplexity 보강
    let perplexityResult = null;
    if (perplexityKey) {
      perplexityResult = await searchPerplexityBuzz(artistName, koreanName || null, perplexityKey);
    }

    return new Response(JSON.stringify({
      ok: true,
      wiki_entry_id,
      artistName,
      newsFilter: newsFilterResult,
      perplexityBuzz: perplexityResult,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[buzz-enhancer] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
