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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- 실시간 트렌드 데이터 조회 ---
    const { data: trendData } = await adminClient
      .from("v3_scores")
      .select("wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, spotify_score, buzz_score, twitter_score, scored_at, wiki_entries:wiki_entry_id(title)")
      .order("scored_at", { ascending: false });

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

    // --- 관심 아티스트 조회 ---
    const { data: watchedArtists } = await adminClient
      .from("ktrenz_watched_artists")
      .select("artist_name, wiki_entry_id")
      .eq("user_id", userId);

    const watchedContext = (watchedArtists && watchedArtists.length > 0)
      ? `\n\n[내 관심 아티스트 목록]\n${watchedArtists.map((w: any) => `- ${w.artist_name}`).join("\n")}`
      : "\n\n[내 관심 아티스트 목록]\n등록된 관심 아티스트가 없습니다.";

    // --- 관심 아티스트 변동 브리핑 ---
    let watchedBriefing = "";
    let streamingGuideContext = "";
    if (watchedArtists && watchedArtists.length > 0) {
      const briefings: string[] = [];
      const guideBlocks: string[] = [];

      for (const w of watchedArtists) {
        const found = latest.find((a: any) => {
          const name = (a.wiki_entries as any)?.title ?? "";
          return name.toLowerCase() === w.artist_name.toLowerCase();
        });
        if (found) {
          const name = (found.wiki_entries as any)?.title ?? w.artist_name;
          const change = found.energy_change_24h ?? 0;
          const rank = latest.indexOf(found) + 1;
          briefings.push(`- ${name}: ${rank}위 | Energy ${Math.round(found.energy_score)} (${change > 0 ? "+" : ""}${change.toFixed(1)}%)`);

          // --- 스트리밍 가이드 엔진: 좌표 계산 ---
          const currentEnergy = Number(found.energy_score) || 0;
          const currentTotal = Number(found.total_score) || 0;
          const currentYT = Number(found.youtube_score) || 0;
          const currentBuzz = Number(found.buzz_score) || 0;
          const currentSpotify = Number(found.spotify_score) || 0;

          // 바로 위 순위 아티스트와의 갭 분석
          const higherRankArtists = latest
            .filter((a: any) => (Number(a.energy_score) || 0) > currentEnergy)
            .sort((a: any, b: any) => (Number(a.energy_score) || 0) - (Number(b.energy_score) || 0));
          
          const nextTarget = higherRankArtists[0];
          const top3Target = latest[Math.min(2, latest.length - 1)];

          let gapAnalysis = "";
          if (nextTarget) {
            const nextName = (nextTarget.wiki_entries as any)?.title ?? "Unknown";
            const nextEnergy = Number(nextTarget.energy_score) || 0;
            const energyGap = nextEnergy - currentEnergy;
            const totalGap = (Number(nextTarget.total_score) || 0) - currentTotal;
            const ytGap = (Number(nextTarget.youtube_score) || 0) - currentYT;
            const buzzGap = (Number(nextTarget.buzz_score) || 0) - currentBuzz;
            gapAnalysis += `  → 바로 위 ${nextName}(${latest.indexOf(nextTarget) + 1}위)까지: Energy +${Math.round(energyGap)} | Total +${Math.round(totalGap)} | YT +${Math.round(ytGap)} | Buzz +${Math.round(buzzGap)}`;
          }

          let top3Analysis = "";
          if (top3Target && rank > 3) {
            const t3Name = (top3Target.wiki_entries as any)?.title ?? "Unknown";
            const t3Energy = Number(top3Target.energy_score) || 0;
            const t3Total = Number(top3Target.total_score) || 0;
            top3Analysis = `  → Top 3(${t3Name}) 진입까지: Energy +${Math.round(t3Energy - currentEnergy)} | Total +${Math.round(t3Total - currentTotal)}`;
          }

          // 플랫폼별 점수 비중 분석
          const totalNonZero = currentTotal || 1;
          const ytPct = ((currentYT / totalNonZero) * 100).toFixed(1);
          const buzzPct = ((currentBuzz / totalNonZero) * 100).toFixed(1);
          const spotifyPct = ((currentSpotify / totalNonZero) * 100).toFixed(1);

          // 에너지 추세 기반 타이밍 추천
          let timingAdvice = "";
          if (change > 20) timingAdvice = "🔥 급상승 중! 지금이 스트리밍 집중 적기입니다";
          else if (change > 5) timingAdvice = "📈 상승세. 꾸준히 유지하며 스트리밍하세요";
          else if (change > 0) timingAdvice = "➡️ 소폭 상승. 추가 스트리밍으로 모멘텀을 만드세요";
          else if (change === 0) timingAdvice = "⏸️ 변동 없음. 새 콘텐츠 공유와 함께 스트리밍하세요";
          else if (change > -10) timingAdvice = "📉 소폭 하락. 팬 결집 스트리밍이 필요합니다";
          else timingAdvice = "🚨 급락 중! 긴급 스트리밍 랠리가 필요합니다";

          // 약점 플랫폼 식별
          const weakPlatforms: string[] = [];
          if (currentSpotify === 0) weakPlatforms.push("Spotify(점수 0 → 최우선 개선)");
          if (currentBuzz < 400) weakPlatforms.push(`Buzz(${currentBuzz} → SNS 활동 강화)`);

          guideBlocks.push(
            `📊 [${name} 스트리밍 가이드]\n` +
            `  현재: ${rank}위 | Energy ${Math.round(currentEnergy)} (${change > 0 ? "+" : ""}${change.toFixed(1)}%)\n` +
            `  플랫폼 비중: YT ${ytPct}% | Buzz ${buzzPct}% | Spotify ${spotifyPct}%\n` +
            `  타이밍: ${timingAdvice}\n` +
            (gapAnalysis ? `${gapAnalysis}\n` : "") +
            (top3Analysis ? `${top3Analysis}\n` : "") +
            (weakPlatforms.length > 0 ? `  약점 플랫폼: ${weakPlatforms.join(", ")}\n` : "")
          );
        } else {
          briefings.push(`- ${w.artist_name}: 현재 Top 20에 없음`);
          guideBlocks.push(
            `📊 [${w.artist_name} 스트리밍 가이드]\n` +
            `  현재 Top 20 밖 → 모든 플랫폼에서 집중 스트리밍 필요\n` +
            `  YouTube MV 조회수, SNS 언급, Spotify 재생을 동시에 올리세요`
          );
        }
      }
      watchedBriefing = `\n\n[관심 아티스트 현황 브리핑]\n${briefings.join("\n")}`;
      streamingGuideContext = `\n\n[스트리밍 가이드 엔진 데이터]\n${guideBlocks.join("\n\n")}`;
    }

    // --- 관심 아티스트 추가/삭제 명령 감지 ---
    const lastUserMsg = messages[messages.length - 1];
    let actionResult = "";

    if (lastUserMsg?.role === "user") {
      const content = lastUserMsg.content.trim();
      console.log("[FanAgent] User message:", content, "length:", content.length);

      // 너무 긴 메시지(50자 초과)는 명령이 아닌 일반 대화로 간주
      const isShortCommand = content.length <= 50;

      // 이전 assistant 메시지가 알림/추가를 안내했는지 확인
      const prevAssistantMsg = [...messages].reverse().find((m: any) => m.role === "assistant");
      const prevContent = prevAssistantMsg?.content ?? "";
      const wasAskingForArtist = /아티스트\s*(이름|명)?\s*(을|를)?\s*(입력|알려|말씀|추가)/.test(prevContent)
        || /관심\s*아티스트\s*추가/.test(prevContent)
        || /알림.*설정/.test(prevContent);

      // 추가 패턴: "BTS 추가해줘" / "관심 아티스트 추가: BTS" / "BTS를 추가해줘" 등
      let addMatch: RegExpMatchArray | null = null;
      if (isShortCommand) {
        addMatch = content.match(/(?:관심\s*(?:아티스트)?\s*(?:에|로|으로)?\s*)?(?:추가|등록)\s*[:：]\s*(.+)/i)
          || content.match(/^(.+?)\s*(?:를|을)?\s*(?:추가|등록)\s*(?:해줘|해|하자|할게|해주세요)/i);
      }

      // 이전 메시지가 아티스트 입력을 요청했고, 짧은 텍스트(20자 이하)면 아티스트 이름으로 간주
      // 단, 질문/명령어 패턴은 제외
      const isQuestion = /누구|뭐|무엇|어떤|몇|목록|확인|알려|보여|있어|없어|설정|해제|\?|？/.test(content);
      if (!addMatch && wasAskingForArtist && content.length <= 20 && !isQuestion && !/삭제|제거|해제|취소|아니/.test(content)) {
        addMatch = [content, content] as unknown as RegExpMatchArray;
        console.log("[FanAgent] Context-based artist add detected:", content);
      }

      console.log("[FanAgent] addMatch:", addMatch ? addMatch[1] : "none");

      // 삭제 패턴
      let removeMatch: RegExpMatchArray | null = null;
      if (isShortCommand) {
        removeMatch = content.match(/(?:관심\s*(?:아티스트)?\s*(?:에서)?\s*)?(?:삭제|제거|해제)\s*[:：]\s*(.+)/i)
          || content.match(/^(.+?)\s*(?:를|을)?\s*(?:삭제|제거|해제)\s*(?:해줘|해|하자|할게|해주세요)/i);
      }

      if (addMatch) {
        const artistName = addMatch[1].trim().replace(/[.!?]$/, "").trim();
        if (artistName && artistName.length <= 100) {
          // wiki_entries에서 매칭 시도
          const { data: wikiMatch } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", artistName)
            .limit(1);

          const wikiId = wikiMatch?.[0]?.id ?? null;
          const resolvedName = wikiMatch?.[0]?.title ?? artistName;

          const { error: insertErr } = await adminClient
            .from("ktrenz_watched_artists")
            .insert({ user_id: userId, artist_name: resolvedName, wiki_entry_id: wikiId });

          if (insertErr) {
            if (insertErr.code === "23505") {
              actionResult = `\n\n[시스템] "${resolvedName}"은(는) 이미 관심 아티스트에 등록되어 있습니다.`;
            } else {
              console.error("Watch insert error:", insertErr);
              actionResult = `\n\n[시스템] 관심 아티스트 추가 실패: ${insertErr.message}`;
            }
          } else {
            actionResult = `\n\n[시스템] "${resolvedName}"을(를) 관심 아티스트에 추가했습니다.`;
          }
        }
      } else if (removeMatch) {
        const artistName = removeMatch[1].trim().replace(/[.!?]$/, "").trim();
        if (artistName && artistName.length <= 100) {
          const { error: delErr, count } = await adminClient
            .from("ktrenz_watched_artists")
            .delete({ count: "exact" })
            .eq("user_id", userId)
            .ilike("artist_name", artistName);

          if (delErr) {
            actionResult = `\n\n[시스템] 관심 아티스트 삭제 실패: ${delErr.message}`;
          } else if (count === 0) {
            actionResult = `\n\n[시스템] "${artistName}"은(는) 관심 아티스트 목록에 없습니다.`;
          } else {
            actionResult = `\n\n[시스템] "${artistName}"을(를) 관심 아티스트에서 삭제했습니다.`;
          }
        }
      }

      // 유저 메시지 저장
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

🎯 스트리밍 가이드 엔진 (핵심 기능):
유저가 스트리밍 전략, 가이드, 팁, 좌표 등을 요청하면 아래 [스트리밍 가이드 엔진 데이터]를 활용해서 맞춤형 가이드를 제공해:
1. **순위 목표 좌표**: 바로 위 순위, Top 3 진입에 필요한 수치 갭을 구체적으로 안내
2. **플랫폼별 전략**: 비중이 낮은 플랫폼(특히 Spotify 0점, Buzz 400 미만)을 최우선으로 올려야 한다고 구체적으로 안내
3. **스트리밍 타이밍**: energy_change_24h 추세에 따라 지금이 집중할 때인지, 유지할 때인지 안내
4. **액션 플랜**: "YouTube MV를 N회 이상 재생", "X(트위터)에서 아티스트 이름 언급 및 해시태그", "Spotify 플레이리스트 추가" 등 구체적 행동을 수치와 함께 제안
5. **종합 대시보드**: 위 정보를 보기 좋게 정리한 브리핑 형태로 제공

관심 아티스트가 없으면 먼저 등록하라고 안내해. 스트리밍 가이드는 관심 아티스트가 있어야 의미가 있어.

관심 아티스트 기능:
- 유저가 "BTS 추가해줘", "관심 아티스트 추가: SEVENTEEN" 등의 메시지를 보내면 시스템이 자동으로 등록해. 등록 결과는 [시스템] 메시지로 전달됨.
- 삭제도 마찬가지: "BTS 삭제해줘" 등.
- 관심 아티스트의 현황 브리핑이 아래에 제공되니, 이 데이터를 활용해서 자연스럽게 브리핑해줘.
- 유저가 알림 설정을 요청하면, 관심 아티스트 이름을 직접 입력하라고 안내해줘. "추가: 아티스트이름" 또는 "아티스트이름 추가해줘" 형식으로 입력하라고 안내해.

⚠️ 절대 규칙 - DB 결과 기반 응답:
- 관심 아티스트 추가/삭제/조회 결과는 반드시 아래 [시스템] 메시지와 [내 관심 아티스트 목록] 데이터만을 기반으로 답변해.
- [시스템] 메시지가 없으면 추가/삭제가 실행되지 않은 것이므로, 절대로 "등록했습니다", "이미 등록되어 있습니다" 등을 지어내지 마.
- [내 관심 아티스트 목록]에 "등록된 관심 아티스트가 없습니다"라고 되어있으면, 어떤 아티스트도 등록되어 있지 않은 것이야. 절대 등록되어 있다고 거짓말하지 마.
- 확실하지 않으면 "아직 등록된 관심 아티스트가 없습니다. 추가하시려면 '추가: 아티스트이름' 형식으로 입력해주세요." 라고 안내해.

규칙:
- 한국어로 답변
- 항상 우리 KTRENZ 플랫폼의 FES 데이터를 기준으로 답변해. 외부 소셜미디어 팔로우/구독 등을 안내하지 마
- 데이터 기반으로 구체적 수치를 인용
- 마크다운 포맷 사용 (볼드, 리스트 등)
- 친근하지만 전문적인 톤
- 모르는 건 모른다고 솔직히 말해${trendContext}${watchedContext}${watchedBriefing}${streamingGuideContext}${actionResult}`;

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
