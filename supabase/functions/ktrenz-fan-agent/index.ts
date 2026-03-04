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
  {
    type: "function",
    function: {
      name: "get_streaming_guide",
      description: "Generate a detailed streaming strategy guide for a specific artist. Includes platform-specific tips, recommended playlist patterns, optimal streaming times, gap analysis vs competitors, and action items. Call this when the user asks about streaming strategy, 스밍 가이드, 총공, 플레이리스트, or chart strategy.",
      parameters: {
        type: "object",
        properties: {
          artist_name: { type: "string", description: "Artist name to generate streaming guide for" },
        },
        required: ["artist_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_artist_news",
      description: "Get recent news articles about a specific artist collected from Naver News. Returns article titles, descriptions, publication dates, and links. Call this when the user asks about 근황, 최근 소식, 뉴스, what's happening with an artist, or recent activities.",
      parameters: {
        type: "object",
        properties: {
          artist_name: { type: "string", description: "Artist name to get news for" },
          limit: { type: "number", description: "Number of articles to return (default 10, max 20)" },
        },
        required: ["artist_name"],
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

  // Helper: Korean name map (cached)
  let koNameMap: Map<string, string> | null = null;
  async function getKoNameMap(): Promise<Map<string, string>> {
    if (koNameMap) return koNameMap;
    const { data } = await adminClient
      .from("v3_artist_tiers")
      .select("wiki_entry_id, name_ko, display_name")
      .not("name_ko", "is", null);
    koNameMap = new Map();
    for (const row of data ?? []) {
      if (row.name_ko) koNameMap.set(row.wiki_entry_id, row.name_ko.toLowerCase());
    }
    return koNameMap;
  }

  // Helper: find artist by name (fuzzy, supports Korean names)
  async function findArtist(name: string) {
    const all = await getAllScores();
    const lower = name.toLowerCase().trim();
    // Direct title match first
    const directMatch = all.find((a: any) => {
      const title = (a.wiki_entries as any)?.title?.toLowerCase() ?? "";
      return title === lower || title.includes(lower) || lower.includes(title);
    });
    if (directMatch) return directMatch;

    // Korean name match
    const koMap = await getKoNameMap();
    return all.find((a: any) => {
      const ko = koMap.get(a.wiki_entry_id);
      return ko && (ko === lower || ko.includes(lower) || lower.includes(ko));
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
      // Search by English title
      const { data: matches } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", `%${args.query}%`)
        .limit(10);
      // Also search by Korean name
      const { data: koMatches } = await adminClient
        .from("v3_artist_tiers")
        .select("wiki_entry_id, display_name, name_ko")
        .ilike("name_ko", `%${args.query}%`)
        .limit(10);
      const titles = new Set((matches ?? []).map((m: any) => m.title));
      for (const km of koMatches ?? []) {
        titles.add(`${km.display_name} (${km.name_ko})`);
      }
      return JSON.stringify({ results: [...titles] });
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

    case "get_streaming_guide": {
      const artistName = args.artist_name;

      // Find wiki_entry_id
      const { data: wikiMatch } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", artistName)
        .limit(1);

      const wikiId = wikiMatch?.[0]?.id ?? null;
      const resolvedName = wikiMatch?.[0]?.title ?? artistName;

      if (!wikiId) {
        return JSON.stringify({ error: "not_found", message: `"${artistName}" was not found. Cannot generate streaming guide.` });
      }

      // Check cache (6h)
      const { data: cached } = await adminClient
        .from("ktrenz_streaming_guides")
        .select("guide_data")
        .eq("wiki_entry_id", wikiId)
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.guide_data) {
        return JSON.stringify({ artist: resolvedName, guide: cached.guide_data, cached: true });
      }

      // Gather data for AI analysis
      const [fesRes, salesRes, tierRes] = await Promise.all([
        adminClient.from("v3_scores_v2")
          .select("total_score, energy_score, energy_change_24h, youtube_score, buzz_score, music_score, album_sales_score, scored_at")
          .eq("wiki_entry_id", wikiId).order("scored_at", { ascending: false }).limit(1).maybeSingle(),
        adminClient.from("ktrenz_data_snapshots")
          .select("metrics, platform")
          .eq("wiki_entry_id", wikiId).in("platform", ["circle_chart", "hanteo"])
          .order("collected_at", { ascending: false }).limit(5),
        adminClient.from("v3_artist_tiers")
          .select("tier, latest_video_title").eq("wiki_entry_id", wikiId).maybeSingle(),
      ]);

      const fes = fesRes.data;
      const sales = salesRes.data ?? [];
      const tier = tierRes.data;

      // Get rankings for context
      const allScores = await getAllScores();
      const artistRank = allScores.findIndex((a: any) => a.wiki_entry_id === wikiId) + 1;
      const top5 = allScores.slice(0, 5).map((a: any, i: number) => `${i + 1}. ${(a.wiki_entries as any)?.title} (Energy: ${Math.round(a.energy_score)})`);

      // Get music data for track names
      const { data: musicSnap } = await adminClient
        .from("ktrenz_data_snapshots")
        .select("metrics")
        .eq("wiki_entry_id", wikiId)
        .eq("platform", "music_multi")
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const musicMetrics = musicSnap?.metrics as any;
      const lastfmTracks = musicMetrics?.lastfm?.top_tracks ?? [];
      const deezerTracks = musicMetrics?.deezer?.top_tracks ?? [];
      const uniqueTracks = [...new Set([
        ...lastfmTracks.map((t: any) => t.name),
        ...deezerTracks.map((t: any) => t.title),
      ])].slice(0, 10);

      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        return JSON.stringify({ error: "AI not configured" });
      }

      const contextParts = [
        `아티스트: ${resolvedName}`,
        fes ? `FES: Energy ${Math.round(fes.energy_score)} (24h: ${(fes.energy_change_24h ?? 0).toFixed(1)}%), 순위 ${artistRank || "N/A"}, Total ${Math.round(fes.total_score)}, YT ${Math.round(fes.youtube_score)}, Buzz ${Math.round(fes.buzz_score ?? 0)}, Music ${Math.round(fes.music_score ?? 0)}, Album ${Math.round(fes.album_sales_score ?? 0)}` : "FES: 없음",
        tier ? `티어: ${tier.tier}, 최신 영상: ${tier.latest_video_title ?? "N/A"}` : "",
        uniqueTracks.length > 0 ? `인기곡: ${uniqueTracks.join(", ")}` : "",
        sales.length > 0 ? `판매량:\n${sales.map((s: any) => `- [${s.platform}] ${(s.metrics as any).album}: ${(s.metrics as any).weekly_sales ?? (s.metrics as any).first_week_sales ?? "N/A"}장`).join("\n")}` : "",
        `현재 Top 5:\n${top5.join("\n")}`,
      ].filter(Boolean);

      const guidePrompt = `너는 K-Pop 스트리밍 전략 분석 AI야. 아래 데이터를 분석해서 팬이 실행할 수 있는 구체적인 스트리밍/차트 전략을 JSON으로 제공해.

중요: 인기곡 데이터가 있으면 반드시 실제 곡명으로 플레이리스트를 만들어. 봇 인식 회피를 위해 타이틀→수록→타이틀 패턴 사용.

JSON 구조:
{
  "artist_name": "아티스트명",
  "current_rank": 순위,
  "momentum": "rising"|"stable"|"declining",
  "momentum_detail": "1-2문장",
  "platform_focus": [{"platform": "youtube"|"spotify"|"melon", "priority": "high"|"medium"|"low", "reason": "이유", "action": "행동"}],
  "gap_analysis": {"target_rank": 목표, "energy_gap": 차이, "key_deficit": "설명"},
  "streaming_playlist": {
    "description": "전략 설명",
    "hourly_pattern": [{"time_slot": "00-10분", "tracks": ["곡명"]}],
    "total_public_time": "총공 시간대",
    "platform_tips": [{"platform": "YouTube", "tip": "팁"}]
  },
  "action_items": ["행동1", "행동2", "행동3"],
  "timing_tip": "타이밍 조언"
}`;

      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: guidePrompt }, { role: "user", content: contextParts.join("\n\n") }],
          max_tokens: 1024, temperature: 0.3,
        }),
      });

      if (!aiResp.ok) {
        console.error("Streaming guide AI error:", await aiResp.text());
        return JSON.stringify({ error: "AI generation failed" });
      }

      const aiData = await aiResp.json();
      const rawContent = aiData.choices?.[0]?.message?.content ?? "";
      let guideData: any;
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        guideData = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: rawContent };
      } catch { guideData = { raw: rawContent }; }

      // Cache the guide
      await adminClient.from("ktrenz_streaming_guides").insert({
        user_id: userId, wiki_entry_id: wikiId, artist_name: resolvedName, guide_data: guideData,
      });

      return JSON.stringify({ artist: resolvedName, guide: guideData, cached: false });
    }

    case "get_artist_news": {
      const artistName = args.artist_name;
      const limit = Math.min(args.limit || 10, 20);

      // Find wiki_entry_id
      const { data: wikiMatch } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", artistName)
        .limit(1);

      const wikiId = wikiMatch?.[0]?.id ?? null;
      const resolvedName = wikiMatch?.[0]?.title ?? artistName;

      if (!wikiId) {
        return JSON.stringify({ error: "not_found", message: `"${artistName}" was not found in the database.` });
      }

      // Get naver_news snapshots (each snapshot contains articles array in metrics)
      const { data: newsSnapshots } = await adminClient
        .from("ktrenz_data_snapshots")
        .select("metrics, collected_at")
        .eq("wiki_entry_id", wikiId)
        .eq("platform", "naver_news")
        .order("collected_at", { ascending: false })
        .limit(3);

      if (!newsSnapshots || newsSnapshots.length === 0) {
        return JSON.stringify({ artist: resolvedName, articles: [], message: "수집된 뉴스가 없습니다." });
      }

      // Extract articles from snapshots, deduplicate by title
      const seenTitles = new Set<string>();
      const allArticles: any[] = [];
      for (const snap of newsSnapshots) {
        const metrics = snap.metrics as any;
        const articles = metrics?.articles ?? metrics?.items ?? [];
        for (const article of articles) {
          const title = (article.title ?? "").replace(/<[^>]*>/g, "").trim();
          if (!title || seenTitles.has(title)) continue;
          seenTitles.add(title);
          allArticles.push({
            title,
            description: (article.description ?? "").replace(/<[^>]*>/g, "").trim(),
            link: article.link ?? article.originallink ?? null,
            pub_date: article.pubDate ?? article.pub_date ?? null,
          });
        }
      }

      const trimmed = allArticles.slice(0, limit);
      const collectedAt = newsSnapshots[0].collected_at;

      return JSON.stringify({
        artist: resolvedName,
        articles: trimmed,
        total_found: allArticles.length,
        collected_at: collectedAt,
        message: trimmed.length > 0
          ? `${resolvedName}의 최근 뉴스 ${trimmed.length}건을 찾았습니다.`
          : "수집된 뉴스가 없습니다.",
      });
    }

    default:
      return JSON.stringify({ error: "unknown_tool" });
  }
}

// ── System Prompt ──────────────────────────────────
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ko: "한국어로 답변해. 유저를 '주인님'이라고 불러.",
  en: "Answer in English. Address the user warmly.",
  ja: "日本語で答えて。ユーザーに親しみを込めて話して。",
  zh: "用中文回答。对用户友好亲切。",
};

function getSystemPrompt(language: string): string {
  const langRule = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS["ko"];
  return `너는 KTRENZ Fan Agent야. KTRENZ 플랫폼의 전용 AI 어시스턴트로, 실시간 FES(Fan Energy Score) 데이터를 기반으로 트렌드 분석과 맞춤형 스트리밍 전략을 제공해.

언어 규칙: ${langRule}
- 관심 아티스트를 언급할 때 애칭으로 표현
- 존댓말 쓰되 친근하고 귀여운 톤 유지

핵심 역할:
- FES 랭킹 데이터 변동 분석 및 브리핑 (도구를 사용하여 실시간 조회)
- 아티스트별 Energy, YouTube, Buzz, Music, Album 스코어 해석
- 스트리밍 전략/가이드 제공 (get_streaming_guide 도구 사용)
- 관심 아티스트 관리 (추가/삭제)
- 아티스트 근황/뉴스 제공 (get_artist_news 도구 사용)

도구 사용 규칙:
- 유저가 랭킹, 순위, 특정 아티스트 정보를 물으면 반드시 도구를 호출해서 최신 데이터를 가져와
- 추측하지 말고 항상 도구로 확인한 데이터를 기반으로 답변해
- 유저가 "관심 아티스트 추가/등록" 또는 "삭제/제거"를 요청하면 manage_watched_artist 도구 사용
- 유저가 관심 아티스트 목록/현황을 물으면 get_watched_artists 도구 사용
- 스밍/스트리밍 전략/가이드/플레이리스트/총공 요청 시 get_streaming_guide 도구 사용
- 아티스트 근황/최근 소식/뉴스/활동 질문 시 get_artist_news 도구 사용. 결과를 자연스럽게 요약해서 전달해
- 스트리밍 가이드 결과를 받으면 핵심만 읽기 좋게 요약하고, 상세 데이터를 자연스럽게 전달해

⚠️ 단계적 대화 규칙 (매우 중요):
- 절대로 한 번에 모든 정보를 쏟아내지 마!
- 하나의 주제만 다루고, 관련 후속 질문이나 안내를 짧게 제안해
- 예시: 랭킹을 보여줬다면 → "특정 아티스트를 더 자세히 볼까요?" 제안
- 예시: 스밍 가이드 요청 시 → 먼저 현재 상황을 요약하고 → "세부 전략을 볼까요?" 물어봐
- 예시: 아티스트 등록 직후 → 환영 + 간단한 현재 순위만. 스밍 가이드나 뉴스는 요청 시에만.
- 답변 길이: 최대 5~8줄 이내. 더 필요하면 유저가 물어보게 유도해.
- 마크다운 포맷, 이모지 활용
- 데이터 기반 구체적 수치 인용
- 모르는 건 모른다고 솔직히`;
}

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
    const { messages, mode, language } = body;
    const userLang = language || "ko";
    const isBriefingMode = mode === "briefing";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ranking cache shared across tool calls within a single request
    const rankingCache: { data: any[] | null } = { data: null };
    // Collect structured data from tool calls for inline card rendering
    const collectedMeta: { guideData?: any[]; rankingData?: any[] } = {};

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
      { role: "system", content: getSystemPrompt(userLang) },
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
        const hasMeta = collectedMeta.guideData || collectedMeta.rankingData;
        const stream = new ReadableStream({
          start(controller) {
            // Send the content in chunks to simulate streaming
            const chunkSize = 20;
            for (let i = 0; i < finalContent.length; i += chunkSize) {
              const chunk = finalContent.slice(i, i + chunkSize);
              const sseData = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`));
            }
            // Send structured meta data for inline card rendering
            if (hasMeta) {
              const metaEvent = JSON.stringify({ meta: collectedMeta });
              controller.enqueue(encoder.encode(`data: ${metaEvent}\n\n`));
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

        // Collect structured data for inline cards
        if (fnName === "get_streaming_guide") {
          try {
            const parsed = JSON.parse(result);
            if (parsed.guide && !parsed.error) {
              if (!collectedMeta.guideData) collectedMeta.guideData = [];
              collectedMeta.guideData.push({ artist_name: parsed.artist, guide_data: parsed.guide });
            }
          } catch {}
        }

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
