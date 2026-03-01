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

    const body = await req.json();
    const { messages, mode } = body;
    const isBriefingMode = mode === "briefing";

    if (!isBriefingMode && (!Array.isArray(messages) || messages.length === 0)) {
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
      .from("v3_scores_v2")
      .select("wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, album_sales_score, music_score, scored_at, wiki_entries:wiki_entry_id(title)")
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

    // --- 관심 아티스트 변동 브리핑 + 판매량 데이터 ---
    let watchedBriefing = "";
    if (watchedArtists && watchedArtists.length > 0) {
      const briefings: string[] = [];
      for (const w of watchedArtists) {
        const found = latest.find((a: any) => {
          const name = (a.wiki_entries as any)?.title ?? "";
          return name.toLowerCase() === w.artist_name.toLowerCase();
        });
        if (found) {
          const name = (found.wiki_entries as any)?.title ?? w.artist_name;
          const change = found.energy_change_24h ?? 0;
          const rank = latest.indexOf(found) + 1;
          briefings.push(`- ${name}: ${rank}위 | Energy ${Math.round(found.energy_score)} (${change > 0 ? "+" : ""}${change.toFixed(1)}%) | YT: ${Math.round(found.youtube_score)} | Buzz: ${Math.round(found.buzz_score ?? 0)}`);
        } else {
          briefings.push(`- ${w.artist_name}: 현재 Top 20에 없음`);
        }
      }
      watchedBriefing = `\n\n[관심 아티스트 현황 브리핑]\n${briefings.join("\n")}`;

      // 판매량 데이터 조회
      const wikiIds = watchedArtists.filter((w: any) => w.wiki_entry_id).map((w: any) => w.wiki_entry_id);
      if (wikiIds.length > 0) {
        const { data: salesData } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("wiki_entry_id, metrics, collected_at, platform")
          .in("wiki_entry_id", wikiIds)
          .in("platform", ["circle_chart", "hanteo"])
          .order("collected_at", { ascending: false })
          .limit(20);

        if (salesData && salesData.length > 0) {
          const salesByArtist = new Map<string, any[]>();
          for (const s of salesData) {
            const artist = watchedArtists.find((w: any) => w.wiki_entry_id === s.wiki_entry_id);
            const name = artist?.artist_name ?? "Unknown";
            if (!salesByArtist.has(name)) salesByArtist.set(name, []);
            salesByArtist.get(name)!.push(s);
          }
          let salesContext = "\n\n[관심 아티스트 앨범 판매 데이터]";
          for (const [name, sales] of salesByArtist) {
            salesContext += `\n${name}:`;
            for (const s of sales.slice(0, 3)) {
              const m = s.metrics as any;
              salesContext += `\n  - [${s.platform}] ${m.album ?? "N/A"}: ${m.weekly_sales ?? m.first_week_sales ?? "N/A"}장 (${new Date(s.collected_at).toLocaleDateString("ko-KR")})`;
            }
          }
          watchedBriefing += salesContext;
        }
      }
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

      // 추가 패턴
      let addMatch: RegExpMatchArray | null = null;
      if (isShortCommand) {
        addMatch = content.match(/(?:관심\s*(?:아티스트)?\s*(?:에|로|으로)?\s*)?(?:추가|등록)\s*[:：]\s*(.+)/i)
          || content.match(/^(.+?)\s*(?:를|을)?\s*(?:추가|등록)\s*(?:해줘|해|하자|할게|해주세요)/i);
      }

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
            actionResult = `\n\n[시스템] "${resolvedName}"을(를) 관심 아티스트에 추가했습니다. 등록 환영과 앞으로의 활동 안내만 간단히 전달해.`;
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

    // --- 브리핑 모드: 구조화된 데이터 + AI 요약 반환 ---
    if (isBriefingMode && watchedArtists && watchedArtists.length > 0) {
      const briefingArtists: any[] = [];
      for (const w of watchedArtists) {
        const found = latest.find((a: any) => {
          const name = (a.wiki_entries as any)?.title ?? "";
          return name.toLowerCase() === w.artist_name.toLowerCase();
        });
        if (!found) continue;
        const name = (found.wiki_entries as any)?.title ?? w.artist_name;
        const rank = latest.indexOf(found) + 1;

        let latestVideoTitle: string | null = null;
        let topMention: string | null = null;
        let imageUrl: string | null = null;

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
          artist_name: name, image_url: imageUrl, rank,
          energy_score: found.energy_score ?? 0,
          energy_change_24h: found.energy_change_24h ?? 0,
          youtube_score: found.youtube_score ?? 0,
          buzz_score: found.buzz_score ?? 0,
          total_score: found.total_score ?? 0,
          latest_video_title: latestVideoTitle,
          top_mention: topMention,
        });
      }

      // 경쟁 아티스트: 관심 아티스트 주변 순위 ±2
      const watchedRanks = briefingArtists.map((a: any) => a.rank);
      const minRank = Math.max(1, Math.min(...watchedRanks) - 2);
      const maxRank = Math.min(latest.length, Math.max(...watchedRanks) + 2);
      const watchedNames = new Set(briefingArtists.map((a: any) => a.artist_name.toLowerCase()));
      const competitors: any[] = [];
      for (let i = minRank - 1; i < maxRank && i < latest.length; i++) {
        const a = latest[i];
        const name = (a.wiki_entries as any)?.title ?? "Unknown";
        if (watchedNames.has(name.toLowerCase())) continue;
        competitors.push({
          artist_name: name, rank: i + 1,
          energy_score: a.energy_score ?? 0,
          energy_change_24h: a.energy_change_24h ?? 0,
          total_score: a.total_score ?? 0,
        });
      }

      const briefingData = { watched_artists: briefingArtists, competitors: competitors.slice(0, 5) };

      // AI 요약 생성 (non-streaming)
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

    // --- OpenAI 호출 (스트리밍) ---
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `너는 KTRENZ Fan Agent야. KTRENZ 플랫폼의 전용 AI 어시스턴트로, 실시간 FES(Fan Energy Score) 데이터를 기반으로 트렌드 분석, 브리핑, 그리고 **맞춤형 스트리밍 전략 가이드**를 제공해.

말투 규칙:
- 유저를 "주인님"이라고 부르기
- 관심 아티스트를 언급할 때 "주인님의 최애 아티스트"라고 표현
- 예: "현재 주인님의 최애 아티스트는 IVE입니다" (절대 "귀하의 관심 아티스트" 같은 딱딱한 표현 쓰지 마)
- 존댓말 쓰되 친근하고 귀여운 톤 유지

핵심 역할:
- KTRENZ 플랫폼의 FES 랭킹 데이터 변동을 분석하고 브리핑
- 아티스트별 Energy Score, YouTube Score, Buzz Score, Music Score 등 지표 해석
- 순위 변동(energy_change_24h)을 기반으로 주목할 아티스트 알림
- **스트리밍 가이드**: 팬이 관심 아티스트의 차트 순위를 올리기 위한 구체적 전략 제공

━━━━━━━━━━━━━━━━━━━━━━
📋 스트리밍 가이드 지식 (유저가 스밍 전략/가이드/팁 요청 시 활용)
━━━━━━━━━━━━━━━━━━━━━━

🎵 권장 플레이리스트 (1시간 기준):
- 타이틀곡만 반복하면 봇 인식되어 차트 반영 누락됨!
- 최적 순서: 타이틀곡 → 수록곡 → 타이틀곡 → 예전히트곡 → 타이틀곡 → 수록곡 (반복)
- 타이틀곡 비중 50~60%, 나머지는 같은 아티스트의 다른 곡으로 채움

⚠️ 핵심 규칙: 플레이리스트를 만들 때 **절대로** "수록곡A", "타이틀곡", "예전히트곡B" 같은 placeholder를 쓰지 마!
반드시 해당 아티스트의 **실제 곡 이름**을 사용해서 구체적인 플레이리스트를 짜줘.

예시 (BTS 컴백 기준):
1. Dynamite ← 타이틀곡
2. Life Goes On ← 수록곡
3. Dynamite ← 타이틀곡
4. Boy With Luv ← 이전 히트곡
5. Dynamite ← 타이틀곡
6. Butter ← 이전 히트곡
7. Dynamite ← 타이틀곡
8. Permission to Dance ← 수록곡
→ 이런 식으로 실제 곡명으로 1시간 분량 (약 15~18곡) 플레이리스트를 만들어줘.

아티스트의 최신 앨범 타이틀곡을 메인으로, 같은 앨범 수록곡과 이전 히트곡을 섞어 짜되:
- 최신 타이틀곡이 전체의 50~60%
- 최신 앨범 수록곡 20~30%
- 이전 히트곡/팬 인기곡 10~20%
모르는 아티스트의 곡은 솔직히 "해당 아티스트의 디스코그래피를 정확히 모르겠어서, 공식 채널에서 확인 후 알려드릴게요"라고 말해.

📱 플랫폼별 주의사항:
**YouTube Music:**
- 화질 720p 이상 유지 (480p 이하는 반영 안 될 수 있음)
- 배속 재생 금지 (1x만 유효)
- 광고 스킵하지 말기 (광고 시청도 조회수에 기여)
- 볼륨 50% 이상 유지
- MV와 Audio 모두 번갈아 재생하면 좋음

**Spotify:**
- 반복 재생(Loop) 끄기 (무한 반복은 스트리밍 카운트 제외됨)
- 셔플 끄기 (셔플은 30초 미만 스킵이 많아짐)
- 30초 이상 반드시 듣기 (30초 미만은 카운트 안 됨)
- Free 계정도 카운트되지만 Premium이 가중치 높음

**멜론:**
- 캐시 삭제 매일 1회 하기
- 음소거 시 차트 반영 안 됨 (이어폰 꽂아두기)
- 멜론 내 '좋아요' 누르기 (좋아요 수도 차트에 영향)
- 1시간에 1곡당 1회만 인정 (같은 곡 반복은 비효율)

**벅스/지니:**
- 기본적으로 멜론과 유사한 규칙
- 이용권 종류에 따라 가중치 다름 (정액제 > 건별)

⏰ 총공 시간대 (차트 집계 기준):
- **멜론 실시간**: 매시 정각 집계 → 정각 직전에 집중 스밍
- **멜론 일간**: 오전 7시 마감 → 새벽~오전 7시 이전 집중
- **지니**: 매시 정각 (멜론과 동일)
- **벅스**: 매시 30분 집계
- **빌보드 Hot 100**: 금요일 0시(미국 동부) ~ 목요일 자정 (스트리밍+판매+라디오)
- **Spotify 글로벌**: UTC 기준 자정 리셋
- **컴백/발매일**: 발매 후 첫 1시간이 가장 중요! 정각 발매 즉시 스밍 시작

💡 팬파워 티어 기준 (판매량 기반):
- MEGA: 초동 100만장 이상
- STRONG: 초동 30만~100만장
- GROWING: 초동 10만~30만장
- EMERGING: 초동 10만장 미만

━━━━━━━━━━━━━━━━━━━━━━

관심 아티스트 기능:
- 유저가 "BTS 추가해줘", "관심 아티스트 추가: SEVENTEEN" 등의 메시지를 보내면 시스템이 자동으로 등록해. 등록 결과는 [시스템] 메시지로 전달됨.
- 삭제도 마찬가지: "BTS 삭제해줘" 등.
- 관심 아티스트의 현황 브리핑이 아래에 제공되니, 이 데이터를 활용해서 자연스럽게 브리핑해줘.
- 유저가 알림 설정을 요청하면, 관심 아티스트 이름을 직접 입력하라고 안내해줘.

⚠️ 절대 규칙 - DB 결과 기반 응답:
- 관심 아티스트 추가/삭제/조회 결과는 반드시 아래 [시스템] 메시지와 [내 관심 아티스트 목록] 데이터만을 기반으로 답변해.
- [시스템] 메시지가 없으면 추가/삭제가 실행되지 않은 것이므로, 절대로 "등록했습니다" 등을 지어내지 마.
- 확실하지 않으면 "아직 등록된 관심 아티스트가 없습니다. '추가: 아티스트이름' 형식으로 입력해주세요." 라고 안내해.

⚠️ 대화 흐름 규칙 (매우 중요!):
- 한 번에 너무 많은 정보를 쏟아내지 마! 단계적으로 대화해.
- 아티스트 등록 직후: "등록 완료 + 간단한 현재 순위/에너지 한줄 요약"만 전달. 스밍 가이드, 플레이리스트, 총공 시간 등은 **절대** 먼저 제공하지 마.
- 등록 후에는 "무엇을 알고 싶으신가요?" 또는 "스밍 전략이 궁금하시면 말씀해주세요!" 같이 다음 단계를 자연스럽게 유도해.
- 유저가 명시적으로 스밍 가이드, 플레이리스트, 전략을 요청했을 때만 상세 스밍 가이드를 제공해.
- 간단한 질문에는 간단하게, 상세한 요청에는 상세하게 답변. 항상 대화의 맥락을 읽어.

규칙:
- 한국어로 답변
- 항상 KTRENZ 플랫폼의 FES 데이터를 기준으로 답변해
- 데이터 기반으로 구체적 수치를 인용
- 마크다운 포맷 사용 (볼드, 리스트, 이모지 등)
- 유저를 "주인님"이라 부르고, 관심 아티스트는 "주인님의 최애"로 표현. 딱딱한 존칭("귀하", "고객님") 금지!
- 친근하고 귀여운 톤 유지하되 데이터는 정확하게
- **스밍 가이드 요청 시 반드시 해당 아티스트의 실제 곡명을 사용해서 구체적인 플레이리스트를 만들어줘. "수록곡A" 같은 generic placeholder 절대 금지!**
- 모르는 건 모른다고 솔직히 말해${trendContext}${watchedContext}${watchedBriefing}${actionResult}`;

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
