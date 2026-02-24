import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- 실시간 트렌드 데이터 조회 ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: trendData } = await adminClient
      .from("v3_scores")
      .select("wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, spotify_score, buzz_score, twitter_score, scored_at, wiki_entries:wiki_entry_id(title)")
      .order("scored_at", { ascending: false });

    // 최신 scored_at 기준으로 wiki_entry_id별 최신 1건만 추출
    const latestMap = new Map<string, any>();
    for (const row of trendData ?? []) {
      if (!latestMap.has(row.wiki_entry_id)) {
        latestMap.set(row.wiki_entry_id, row);
      }
    }
    const latest = [...latestMap.values()]
      .sort((a, b) => (b.energy_score ?? 0) - (a.energy_score ?? 0))
      .slice(0, 20);

    const trendContext = latest.length
      ? `\n\n[실시간 FES 랭킹 Top 20 - ${new Date().toISOString().slice(0, 16)}]\n${latest
          .map((a: any, i: number) => {
            const name = (a.wiki_entries as any)?.title ?? "Unknown";
            const change = a.energy_change_24h ?? 0;
            return `${i + 1}. ${name} | Energy: ${Math.round(a.energy_score)} (${change > 0 ? "+" : ""}${change.toFixed(1)}%) | Total: ${Math.round(a.total_score)} | YT: ${Math.round(a.youtube_score)} | Buzz: ${Math.round(a.buzz_score ?? 0)}`;
          })
          .join("\n")}`
      : "";

    // --- 유저 메시지 저장 ---
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      await adminClient.from("ktrenz_fan_agent_messages").insert({
        user_id: userId,
        role: "user",
        content: lastUserMsg.content,
      });
    }

    // --- OpenAI 호출 (스트리밍) ---
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `너는 KTRENZ Fan Agent야. KTRENZ 플랫폼의 전용 AI 어시스턴트로, 우리 플랫폼의 실시간 FES(Fan Energy Score) 데이터를 기반으로 트렌드 분석과 브리핑을 제공해.

핵심 역할:
- KTRENZ 플랫폼의 FES 랭킹 데이터 변동을 분석하고 브리핑
- 아티스트별 Energy Score, YouTube Score, Spotify Score, Buzz Score 등 우리 플랫폼 지표 해석
- 순위 변동(energy_change_24h)을 기반으로 주목할 아티스트 알림
- 팬이 관심 아티스트를 직접 입력하면 해당 아티스트의 KTRENZ 데이터를 안내

규칙:
- 한국어로 답변
- 항상 우리 KTRENZ 플랫폼의 FES 데이터를 기준으로 답변해. 외부 소셜미디어 팔로우/구독 등을 안내하지 마
- 데이터 기반으로 구체적 수치를 인용
- 마크다운 포맷 사용 (볼드, 리스트 등)
- 친근하지만 전문적인 톤
- 알림 설정 관련 질문 시, 관심 아티스트 이름을 직접 입력하라고 안내하고, 해당 아티스트의 현재 FES 데이터를 브리핑해줘
- 모르는 건 모른다고 솔직히 말해${trendContext}`;

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-10),
    ];

    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: openaiMessages,
          stream: true,
          max_tokens: 1024,
        }),
      }
    );

    if (!openaiResp.ok) {
      const errBody = await openaiResp.text();
      console.error("OpenAI error:", openaiResp.status, errBody);
      if (openaiResp.status === 429) {
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

    // --- 스트리밍 응답 + assistant 메시지 저장 ---
    let fullContent = "";
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiResp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              if (fullContent) {
                await adminClient
                  .from("ktrenz_fan_agent_messages")
                  .insert({
                    user_id: userId,
                    role: "assistant",
                    content: fullContent,
                  });
              }
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullContent += delta;
              controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`));
            } catch {
              /* partial chunk */
            }
          }
        }
        // flush remaining
        if (fullContent) {
          await adminClient.from("ktrenz_fan_agent_messages").insert({
            user_id: userId,
            role: "assistant",
            content: fullContent,
          });
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
