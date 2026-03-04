import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tool Definitions ──────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_rankings",
      description: "Get current FES trend rankings. Returns top N artists with energy scores, total scores, YouTube/Buzz/Music/Album scores, and 24h change percentage.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of top artists to return (default 10, max 50)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_artist",
      description: "Look up detailed score data for a specific artist by name. Returns current rank, energy score, total score, YouTube/Buzz/Music/Album scores, 24h energy change, and tier info.",
      parameters: {
        type: "object",
        properties: {
          artist_name: { type: "string", description: "Artist name to look up (e.g., 'BTS', 'aespa', 'SEVENTEEN')" },
        },
        required: ["artist_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_artists",
      description: "Compare 2-3 artists side by side across all metrics. Returns each artist's scores for direct comparison.",
      parameters: {
        type: "object",
        properties: {
          artist_names: {
            type: "array",
            items: { type: "string" },
            description: "Array of 2-3 artist names to compare",
          },
        },
        required: ["artist_names"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_artist",
      description: "Search for artists by partial name match. Useful when user mentions an artist that might have variations in spelling.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial artist name to search" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_watched_artist",
      description: "Add or remove an artist from the user's watched (favorite) artist list. Only call this when the user explicitly asks to add/remove/register/delete a watched artist.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "remove"], description: "Whether to add or remove the artist" },
          artist_name: { type: "string", description: "Artist name to add or remove" },
        },
        required: ["action", "artist_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_watched_artists",
      description: "Get the user's current watched (favorite) artist list with their latest scores and status.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// ── Tool Handlers ──────────────────────────────────
async function handleTool(
  name: string,
  args: any,
  adminClient: any,
  userId: string,
  rankingCache: { data: any[] | null }
): Promise<string> {
  // Helper: get all latest scores (cached per request)
  async function getAllScores(): Promise<any[]> {
    if (rankingCache.data) return rankingCache.data;

    const { data: scores } = await adminClient
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, album_sales_score, music_score, scored_at, wiki_entries:wiki_entry_id(id, title, image_url)")
      .order("scored_at", { ascending: false });

    // Deduplicate: keep latest per artist
    const seen = new Map<string, any>();
    for (const row of scores ?? []) {
      if (!seen.has(row.wiki_entry_id)) seen.set(row.wiki_entry_id, row);
    }

    // Sort by energy desc, assign rank
    const sorted = [...seen.values()].sort((a, b) => (b.energy_score ?? 0) - (a.energy_score ?? 0));
    sorted.forEach((s, i) => { s._rank = i + 1; });
    rankingCache.data = sorted;
    return sorted;
  }

  // Helper: find artist by name (fuzzy)
  async function findArtist(name: string) {
    const all = await getAllScores();
    const lower = name.toLowerCase().trim();
    return all.find((a: any) => {
      const title = (a.wiki_entries as any)?.title?.toLowerCase() ?? "";
      return title === lower || title.includes(lower) || lower.includes(title);
    });
  }

  // Helper: get tier info
  async function getTierInfo(wikiId: string) {
    const { data } = await adminClient
      .from("v3_artist_tiers")
      .select("tier, latest_video_title, latest_video_id")
      .eq("wiki_entry_id", wikiId)
      .maybeSingle();
    return data;
  }

  switch (name) {
    case "get_rankings": {
      const limit = Math.min(args.limit || 10, 50);
      const all = await getAllScores();
      const top = all.slice(0, limit);
      const result = top.map((a: any) => ({
        rank: a._rank,
        artist: (a.wiki_entries as any)?.title ?? "Unknown",
        energy_score: Math.round(a.energy_score ?? 0),
        energy_change_24h: +(a.energy_change_24h ?? 0).toFixed(1),
        total_score: Math.round(a.total_score ?? 0),
        youtube_score: Math.round(a.youtube_score ?? 0),
        buzz_score: Math.round(a.buzz_score ?? 0),
        music_score: Math.round(a.music_score ?? 0),
        album_sales_score: Math.round(a.album_sales_score ?? 0),
      }));
      return JSON.stringify({ rankings: result, timestamp: new Date().toISOString() });
    }

    case "lookup_artist": {
      const found = await findArtist(args.artist_name);
      if (!found) {
        // Try DB search
        const { data: matches } = await adminClient
          .from("wiki_entries")
          .select("id, title")
          .ilike("title", `%${args.artist_name}%`)
          .limit(5);
        if (matches && matches.length > 0) {
          return JSON.stringify({ error: "not_in_rankings", suggestions: matches.map((m: any) => m.title), message: `"${args.artist_name}" is not currently ranked. Did you mean: ${matches.map((m: any) => m.title).join(", ")}?` });
        }
        return JSON.stringify({ error: "not_found", message: `"${args.artist_name}" was not found in the database.` });
      }

      const wikiId = found.wiki_entry_id;
      const tierInfo = await getTierInfo(wikiId);

      return JSON.stringify({
        artist: (found.wiki_entries as any)?.title,
        rank: found._rank,
        energy_score: Math.round(found.energy_score ?? 0),
        energy_change_24h: +(found.energy_change_24h ?? 0).toFixed(1),
        total_score: Math.round(found.total_score ?? 0),
        youtube_score: Math.round(found.youtube_score ?? 0),
        buzz_score: Math.round(found.buzz_score ?? 0),
        music_score: Math.round(found.music_score ?? 0),
        album_sales_score: Math.round(found.album_sales_score ?? 0),
        tier: tierInfo?.tier ?? null,
        latest_video: tierInfo?.latest_video_title ?? null,
        scored_at: found.scored_at,
      });
    }

    case "compare_artists": {
      const names: string[] = args.artist_names?.slice(0, 3) ?? [];
      const results: any[] = [];
      for (const n of names) {
        const found = await findArtist(n);
        if (found) {
          results.push({
            artist: (found.wiki_entries as any)?.title,
            rank: found._rank,
            energy_score: Math.round(found.energy_score ?? 0),
            energy_change_24h: +(found.energy_change_24h ?? 0).toFixed(1),
            total_score: Math.round(found.total_score ?? 0),
            youtube_score: Math.round(found.youtube_score ?? 0),
            buzz_score: Math.round(found.buzz_score ?? 0),
            music_score: Math.round(found.music_score ?? 0),
            album_sales_score: Math.round(found.album_sales_score ?? 0),
          });
        } else {
          results.push({ artist: n, error: "not_found" });
        }
      }
      return JSON.stringify({ comparison: results });
    }

    case "search_artist": {
      const { data: matches } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", `%${args.query}%`)
        .limit(10);
      return JSON.stringify({ results: (matches ?? []).map((m: any) => m.title) });
    }

    case "manage_watched_artist": {
      const { action, artist_name } = args;
      if (action === "add") {
        const { data: wikiMatch } = await adminClient
          .from("wiki_entries")
          .select("id, title")
          .ilike("title", artist_name)
          .limit(1);

        const wikiId = wikiMatch?.[0]?.id ?? null;
        const resolvedName = wikiMatch?.[0]?.title ?? artist_name;

        const { error: insertErr } = await adminClient
          .from("ktrenz_watched_artists")
          .insert({ user_id: userId, artist_name: resolvedName, wiki_entry_id: wikiId });

        if (insertErr) {
          if (insertErr.code === "23505") {
            return JSON.stringify({ success: false, message: `"${resolvedName}" is already in your watched list.` });
          }
          return JSON.stringify({ success: false, message: `Failed to add: ${insertErr.message}` });
        }
        return JSON.stringify({ success: true, action: "added", artist: resolvedName });
      } else {
        const { error: delErr, count } = await adminClient
          .from("ktrenz_watched_artists")
          .delete({ count: "exact" })
          .eq("user_id", userId)
          .ilike("artist_name", artist_name);

        if (delErr) return JSON.stringify({ success: false, message: delErr.message });
        if (count === 0) return JSON.stringify({ success: false, message: `"${artist_name}" is not in your watched list.` });
        return JSON.stringify({ success: true, action: "removed", artist: artist_name });
      }
    }

    case "get_watched_artists": {
      const { data: watched } = await adminClient
        .from("ktrenz_watched_artists")
        .select("artist_name, wiki_entry_id")
        .eq("user_id", userId);

      if (!watched || watched.length === 0) {
        return JSON.stringify({ watched_artists: [], message: "No watched artists registered." });
      }

      const all = await getAllScores();
      const result = watched.map((w: any) => {
        const found = all.find((a: any) => {
          const title = (a.wiki_entries as any)?.title?.toLowerCase() ?? "";
          return title === w.artist_name.toLowerCase();
        });
        return {
          artist: w.artist_name,
          rank: found?._rank ?? null,
          energy_score: found ? Math.round(found.energy_score ?? 0) : null,
          energy_change_24h: found ? +(found.energy_change_24h ?? 0).toFixed(1) : null,
          total_score: found ? Math.round(found.total_score ?? 0) : null,
          in_rankings: !!found,
        };
      });
      return JSON.stringify({ watched_artists: result });
    }

    default:
      return JSON.stringify({ error: "unknown_tool" });
  }
}

// ── System Prompt ──────────────────────────────────
const SYSTEM_PROMPT = `너는 KTRENZ Fan Agent야. KTRENZ 플랫폼의 전용 AI 어시스턴트로, 실시간 FES(Fan Energy Score) 데이터를 기반으로 트렌드 분석과 맞춤형 스트리밍 전략 가이드를 제공해.

말투 규칙:
- 유저를 "주인님"이라고 부르기
- 관심 아티스트를 언급할 때 "주인님의 최애 아티스트"라고 표현
- 존댓말 쓰되 친근하고 귀여운 톤 유지

핵심 역할:
- FES 랭킹 데이터 변동 분석 및 브리핑 (도구를 사용하여 실시간 조회)
- 아티스트별 Energy, YouTube, Buzz, Music, Album 스코어 해석
- 스트리밍 전략/가이드 제공 (유저가 요청 시)
- 관심 아티스트 관리 (추가/삭제)

도구 사용 규칙:
- 유저가 랭킹, 순위, 특정 아티스트 정보를 물으면 반드시 도구를 호출해서 최신 데이터를 가져와
- 추측하지 말고 항상 도구로 확인한 데이터를 기반으로 답변해
- 유저가 "관심 아티스트 추가/등록" 또는 "삭제/제거"를 요청하면 manage_watched_artist 도구 사용
- 유저가 관심 아티스트 목록/현황을 물으면 get_watched_artists 도구 사용

━━━ 스트리밍 가이드 지식 ━━━

🎵 권장 플레이리스트 (1시간 기준):
- 타이틀곡만 반복하면 봇 인식 → 차트 반영 누락!
- 최적: 타이틀곡 50~60%, 수록곡 20~30%, 이전 히트곡 10~20%
- 반드시 해당 아티스트의 실제 곡명 사용. "수록곡A" 같은 placeholder 절대 금지!
- 모르는 아티스트의 곡은 솔직히 모른다고 말하기

📱 플랫폼별 주의사항:
YouTube Music: 720p+, 1x 속도, 볼륨 50%+
Spotify: 반복재생 OFF, 셔플 OFF, 30초 이상 듣기
멜론: 캐시 삭제, 음소거 X, 1시간 1곡 1회
벅스/지니: 멜론과 유사, 정액제가 가중치 높음

⏰ 총공 시간대:
멜론 실시간: 매시 정각 / 일간: 오전 7시 마감
지니: 매시 정각 / 벅스: 매시 30분
빌보드: 금→목 / Spotify: UTC 자정 리셋
컴백/발매일: 첫 1시간이 가장 중요!

━━━ 대화 규칙 ━━━

- 한 번에 너무 많은 정보 X. 단계적 대화!
- 아티스트 등록 직후: 환영 + 간단 현황만. 스밍 가이드는 요청 시에만.
- 한국어 답변, 마크다운 포맷, 이모지 활용
- 데이터 기반 구체적 수치 인용
- 모르는 건 모른다고 솔직히`;

// ── Main Handler ──────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const body = await req.json();
    const { messages, mode } = body;
    const isBriefingMode = mode === "briefing";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ranking cache shared across tool calls within a single request
    const rankingCache: { data: any[] | null } = { data: null };

    // ── Briefing Mode (unchanged logic) ──
    if (isBriefingMode) {
      const { data: watchedArtists } = await adminClient
        .from("ktrenz_watched_artists")
        .select("artist_name, wiki_entry_id")
        .eq("user_id", userId);

      if (!watchedArtists || watchedArtists.length === 0) {
        return new Response(JSON.stringify({ briefing: null, summary: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get all scores
      const allScores = await (async () => {
        const result = await handleTool("get_rankings", { limit: 50 }, adminClient, userId, rankingCache);
        return JSON.parse(result).rankings ?? [];
      })();

      const briefingArtists: any[] = [];
      for (const w of watchedArtists) {
        const found = allScores.find((a: any) => a.artist.toLowerCase() === w.artist_name.toLowerCase());
        if (!found) continue;

        let latestVideoTitle: string | null = null;
        let imageUrl: string | null = null;
        let topMention: string | null = null;

        if (w.wiki_entry_id) {
          const [tierRes, buzzRes, entryRes] = await Promise.all([
            adminClient.from("v3_artist_tiers").select("latest_video_title").eq("wiki_entry_id", w.wiki_entry_id).maybeSingle(),
            adminClient.from("ktrenz_data_snapshots").select("metrics").eq("wiki_entry_id", w.wiki_entry_id).eq("platform", "buzz_multi").order("collected_at", { ascending: false }).limit(1).maybeSingle(),
            adminClient.from("wiki_entries").select("image_url").eq("id", w.wiki_entry_id).maybeSingle(),
          ]);
          latestVideoTitle = (tierRes.data as any)?.latest_video_title ?? null;
          const buzzMetrics = (buzzRes.data?.metrics as any) || {};
          if (Array.isArray(buzzMetrics.top_mentions) && buzzMetrics.top_mentions.length > 0) {
            topMention = buzzMetrics.top_mentions[0].title || buzzMetrics.top_mentions[0].description || null;
          }
          imageUrl = (entryRes.data as any)?.image_url ?? null;
        }

        briefingArtists.push({
          artist_name: found.artist, image_url: imageUrl, rank: found.rank,
          energy_score: found.energy_score, energy_change_24h: found.energy_change_24h,
          youtube_score: found.youtube_score, buzz_score: found.buzz_score,
          total_score: found.total_score,
          latest_video_title: latestVideoTitle, top_mention: topMention,
        });
      }

      // Competitors
      const watchedRanks = briefingArtists.map((a: any) => a.rank);
      const minRank = Math.max(1, Math.min(...watchedRanks) - 2);
      const maxRank = Math.min(allScores.length, Math.max(...watchedRanks) + 2);
      const watchedNames = new Set(briefingArtists.map((a: any) => a.artist_name.toLowerCase()));
      const competitors = allScores
        .filter((a: any) => a.rank >= minRank && a.rank <= maxRank && !watchedNames.has(a.artist.toLowerCase()))
        .slice(0, 5)
        .map((a: any) => ({
          artist_name: a.artist, rank: a.rank,
          energy_score: a.energy_score, energy_change_24h: a.energy_change_24h,
          total_score: a.total_score,
        }));

      const briefingData = { watched_artists: briefingArtists, competitors };

      // AI summary
      const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
      let summary: string | null = null;
      if (OPENAI_KEY) {
        try {
          const briefingPrompt = `너는 KTRENZ Fan Agent야. 주인님의 관심 아티스트 데이터를 분석해서 짧고 임팩트 있는 오늘의 브리핑을 작성해.
말투: "주인님"이라 부르고, 관심 아티스트를 "주인님의 최애"로 표현. 친근하고 귀여운 톤.
데이터: ${JSON.stringify(briefingData)}
규칙:
- 3~5문장 이내로 핵심만 (카드에 이미 상세 수치가 있으므로 숫자 나열 X)
- 가장 주목할 변화/이슈 1개를 강조
- 경쟁 아티스트와의 비교 인사이트 포함
- 이모지 적극 활용, 마크다운 포맷`;

          const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: briefingPrompt }], max_tokens: 300 }),
          });
          if (aiResp.ok) {
            const aiData = await aiResp.json();
            summary = aiData.choices?.[0]?.message?.content ?? null;
          }
        } catch (e) { console.error("[Briefing] AI error:", e); }
      }

      return new Response(JSON.stringify({ briefing: briefingData, summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Chat Mode with Tool Calling ──

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      await adminClient.from("ktrenz_fan_agent_messages").insert({
        user_id: userId,
        role: "user",
        content: lastUserMsg.content,
      });
    }

    // Build OpenAI messages
    const openaiMessages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.slice(-15).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // ── Tool Calling Loop (non-streaming) ──
    // We do tool calls in a loop until the model produces a final text response.
    // Then we stream the final response.

    let toolCallRound = 0;
    const MAX_TOOL_ROUNDS = 5;

    while (toolCallRound < MAX_TOOL_ROUNDS) {
      toolCallRound++;

      const toolResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: openaiMessages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 1024,
        }),
      });

      if (!toolResp.ok) {
        const errBody = await toolResp.text();
        console.error("OpenAI tool call error:", toolResp.status, errBody);
        if (toolResp.status === 429) {
          return new Response(JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "AI 응답 실패" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const toolData = await toolResp.json();
      const choice = toolData.choices?.[0];

      if (!choice) {
        return new Response(JSON.stringify({ error: "Empty AI response" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const assistantMessage = choice.message;

      // If no tool calls, this is the final response — stream it
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const finalContent = assistantMessage.content ?? "";

        // Save assistant message
        if (finalContent) {
          await adminClient.from("ktrenz_fan_agent_messages").insert({
            user_id: userId,
            role: "assistant",
            content: finalContent,
          });
        }

        // Stream the final response as SSE (for frontend compatibility)
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Send the content in chunks to simulate streaming
            const chunkSize = 20;
            for (let i = 0; i < finalContent.length; i += chunkSize) {
              const chunk = finalContent.slice(i, i + chunkSize);
              const sseData = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Process tool calls
      openaiMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: any = {};
        try { fnArgs = JSON.parse(toolCall.function.arguments); } catch {}

        console.log(`[FanAgent] Tool call: ${fnName}`, fnArgs);

        const result = await handleTool(fnName, fnArgs, adminClient, userId, rankingCache);

        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Loop continues — model will see tool results and decide next action
    }

    // If we exceed max rounds, return what we have
    return new Response(JSON.stringify({ error: "Tool call limit reached" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Fan agent error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
