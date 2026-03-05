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
  {
    type: "function",
    function: {
      name: "get_fan_activity",
      description: "Get one personalized fan activity recommendation for the user's watched artist. Each call returns a different activity systematically (YouTube watch, Spotify streaming, Melon streaming, X posting, news reading, etc). Activities build on each other throughout the day. Call this when the user clicks '오늘의 팬활동' or asks for fan activity suggestions.",
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
      name: "search_web",
      description: "Search the web in real-time using Perplexity AI for any K-Pop related question that cannot be answered from the database alone. Use this for latest news, comeback schedules, concert info, social media trends, or any question requiring up-to-date web information. Also use as fallback when get_artist_news returns no results.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query in natural language (e.g., '아이브 최근 활동', 'BTS comeback 2026')" },
          recency: { type: "string", enum: ["day", "week", "month"], description: "How recent the results should be (default: week)" },
        },
        required: ["query"],
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
      .select("tier, latest_youtube_video_title, latest_youtube_video_id")
      .eq("wiki_entry_id", wikiId)
      .maybeSingle();
    return data ? { ...data, latest_video_title: data.latest_youtube_video_title, latest_video_id: data.latest_youtube_video_id } : data;
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

      // Get naver_news snapshots (metrics + raw_response for thumbnails)
      const { data: newsSnapshots } = await adminClient
        .from("ktrenz_data_snapshots")
        .select("metrics, raw_response, collected_at")
        .eq("wiki_entry_id", wikiId)
        .eq("platform", "naver_news")
        .order("collected_at", { ascending: false })
        .limit(3);

      if (!newsSnapshots || newsSnapshots.length === 0) {
        // Fallback to Perplexity web search
        const perplexityResult = await searchWithPerplexity(`${resolvedName} 최근 소식 뉴스 활동`);
        if (perplexityResult) {
          return JSON.stringify({ artist: resolvedName, web_search_result: perplexityResult.content, citations: perplexityResult.citations, source: "perplexity", message: `웹 검색으로 ${resolvedName}의 최근 소식을 찾았습니다.` });
        }
        return JSON.stringify({ artist: resolvedName, articles: [], message: "수집된 뉴스가 없습니다." });
      }

      // Build thumbnail map from raw_response.top_items
      const thumbMap = new Map<string, string>();
      for (const snap of newsSnapshots) {
        const rawResp = snap.raw_response as any;
        const topItems = rawResp?.top_items ?? [];
        for (const item of topItems) {
          if (item.image && item.url) {
            thumbMap.set(item.url, item.image);
          }
          if (item.image && item.title) {
            thumbMap.set(item.title, item.image);
          }
        }
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
          const link = article.link ?? article.originallink ?? null;
          allArticles.push({
            title,
            description: (article.description ?? "").replace(/<[^>]*>/g, "").trim(),
            link,
            pub_date: article.pubDate ?? article.pub_date ?? null,
            thumbnail: thumbMap.get(link) ?? thumbMap.get(title) ?? null,
          });
        }
      }

      // Also add top_items from raw_response that might not be in metrics
      for (const snap of newsSnapshots) {
        const rawResp = snap.raw_response as any;
        const topItems = rawResp?.top_items ?? [];
        for (const item of topItems) {
          const title = (item.title ?? "").trim();
          if (!title || seenTitles.has(title)) continue;
          seenTitles.add(title);
          allArticles.push({
            title,
            description: (item.description ?? "").trim(),
            link: item.url ?? null,
            pub_date: null,
            thumbnail: item.image ?? null,
          });
        }
      }

      const trimmed = allArticles.slice(0, limit);
      const collectedAt = newsSnapshots[0].collected_at;

      // If snapshots exist but no articles extracted, fallback to Perplexity
      if (trimmed.length === 0) {
        const perplexityResult = await searchWithPerplexity(`${resolvedName} 최근 소식 뉴스 활동`);
        if (perplexityResult) {
          return JSON.stringify({ artist: resolvedName, web_search_result: perplexityResult.content, citations: perplexityResult.citations, source: "perplexity", message: `웹 검색으로 ${resolvedName}의 최근 소식을 찾았습니다.` });
        }
        return JSON.stringify({ artist: resolvedName, articles: [], message: "수집된 뉴스가 없습니다." });
      }

      return JSON.stringify({
        artist: resolvedName,
        articles: trimmed,
        total_found: allArticles.length,
        collected_at: collectedAt,
        message: `${resolvedName}의 최근 뉴스 ${trimmed.length}건을 찾았습니다.`,
      });
    }

    case "get_fan_activity": {
      // Get watched artists
      const { data: watched } = await adminClient
        .from("ktrenz_watched_artists")
        .select("artist_name, wiki_entry_id")
        .eq("user_id", userId);

      if (!watched || watched.length === 0) {
        return JSON.stringify({ error: "no_watched", message: "관심 아티스트가 없습니다. 먼저 관심 아티스트를 등록해주세요!" });
      }

      // Pick a random watched artist for variety
      const artist = watched[Math.floor(Math.random() * watched.length)];
      const artistName = artist.artist_name;
      const wikiId = artist.wiki_entry_id;

      // Get artist data for context
      const allScores = await getAllScores();
      const found = allScores.find((a: any) => a.wiki_entry_id === wikiId);
      const rank = found?._rank ?? null;
      const energyScore = found ? Math.round(found.energy_score ?? 0) : null;
      const energyChange = found ? +(found.energy_change_24h ?? 0).toFixed(1) : null;

      // Get tier info for latest video + social handles
      let latestVideoTitle: string | null = null;
      let latestVideoId: string | null = null;
      let youtubeChannelId: string | null = null;
      let instagramHandle: string | null = null;
      let xHandle: string | null = null;
      if (wikiId) {
        const { data: tierData } = await adminClient
          .from("v3_artist_tiers")
          .select("latest_youtube_video_title, latest_youtube_video_id, youtube_channel_id, instagram_handle, x_handle")
          .eq("wiki_entry_id", wikiId)
          .maybeSingle();
        latestVideoTitle = tierData?.latest_youtube_video_title ?? null;
        latestVideoId = tierData?.latest_youtube_video_id ?? null;
        youtubeChannelId = tierData?.youtube_channel_id ?? null;
        instagramHandle = tierData?.instagram_handle ?? null;
        xHandle = tierData?.x_handle ?? null;
      }

      // Get music data for track names
      let topTracks: string[] = [];
      if (wikiId) {
        const { data: musicSnap } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("metrics")
          .eq("wiki_entry_id", wikiId)
          .eq("platform", "music_multi")
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const mm = musicSnap?.metrics as any;
        const lastfm = mm?.lastfm?.top_tracks ?? [];
        const deezer = mm?.deezer?.top_tracks ?? [];
        topTracks = [...new Set([
          ...lastfm.map((t: any) => t.name),
          ...deezer.map((t: any) => t.title),
        ])].slice(0, 5) as string[];
      }

      // Get YouTube Music top tracks for specific content
      let ytMusicTracks: { title: string; viewCount: number }[] = [];
      if (wikiId) {
        const { data: ytmSnap } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("metrics")
          .eq("wiki_entry_id", wikiId)
          .eq("platform", "youtube_music")
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        ytMusicTracks = (ytmSnap?.metrics as any)?.topTracks ?? [];
      }

      // Get multiple recent news articles (not just one)
      const newsArticles: { title: string; link: string; thumbnail: string | null }[] = [];
      if (wikiId) {
        const { data: newsSnap } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("metrics, raw_response")
          .eq("wiki_entry_id", wikiId)
          .eq("platform", "naver_news")
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (newsSnap) {
          const rawResp = newsSnap.raw_response as any;
          const topItems = rawResp?.top_items ?? [];
          for (const item of topItems.slice(0, 3)) {
            if (item.title && item.url) {
              newsArticles.push({ title: item.title, link: item.url, thumbnail: item.image ?? null });
            }
          }
          if (newsArticles.length === 0) {
            const metrics = newsSnap.metrics as any;
            const articles = metrics?.articles ?? metrics?.items ?? [];
            for (const a of articles.slice(0, 3)) {
              const title = (a.title ?? "").replace(/<[^>]*>/g, "").trim();
              const link = a.link ?? a.originallink ?? null;
              if (title && link) newsArticles.push({ title, link, thumbnail: null });
            }
          }
        }
      }

      // Check today's activity history from chat to determine which activity to suggest next
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayMessages } = await adminClient
        .from("ktrenz_fan_agent_messages")
        .select("content")
        .eq("user_id", userId)
        .eq("role", "assistant")
        .gte("created_at", today + "T00:00:00Z")
        .order("created_at", { ascending: false })
        .limit(20);

      const pastContent = (todayMessages ?? []).map((m: any) => m.content).join(" ");

      // Activity pool — rotate through systematically with SPECIFIC content
      const activities = [
        {
          type: "youtube_watch",
          done: pastContent.includes("YouTube") && pastContent.includes("시청"),
          data: {
            activity: "YouTube 최신 영상 시청",
            description: latestVideoTitle
              ? `"${latestVideoTitle}"`
              : `${artistName} 최신 영상 시청하기`,
            link: latestVideoId
              ? `https://www.youtube.com/watch?v=${latestVideoId}`
              : youtubeChannelId
                ? `https://www.youtube.com/channel/${youtubeChannelId}/videos`
                : `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName)}`,
            thumbnail: latestVideoId ? `https://img.youtube.com/vi/${latestVideoId}/hqdefault.jpg` : null,
            platform: "YouTube",
            emoji: "▶️",
            tip: "조회수 + 좋아요 + 댓글까지 남기면 알고리즘에 3배 효과!",
          },
        },
        {
          type: "spotify_stream",
          done: pastContent.includes("Spotify") && pastContent.includes("스트리밍"),
          data: {
            activity: "Spotify 스트리밍",
            description: ytMusicTracks.length > 0
              ? `인기곡 "${ytMusicTracks[0].title}" (${(ytMusicTracks[0].viewCount / 1000000).toFixed(1)}M views) 반복 재생`
              : topTracks.length > 0
                ? `"${topTracks[0]}" 플레이리스트에 추가하고 반복 재생`
                : `${artistName} 인기곡 스트리밍`,
            link: `https://open.spotify.com/search/${encodeURIComponent(artistName + (ytMusicTracks[0]?.title ? " " + ytMusicTracks[0].title : ""))}`,
            platform: "Spotify",
            emoji: "🎧",
            tip: "30초 이상 들어야 스트리밍 1회로 카운트됩니다!",
          },
        },
        {
          type: "melon_stream",
          done: pastContent.includes("멜론") && pastContent.includes("스트리밍"),
          data: {
            activity: "멜론 스트리밍",
            description: ytMusicTracks.length > 1
              ? `"${ytMusicTracks[1]?.title || ytMusicTracks[0]?.title}" 멜론에서 좋아요 + 스트리밍`
              : topTracks.length > 1
                ? `"${topTracks[1] || topTracks[0]}" 멜론에서 좋아요 + 스트리밍`
                : `${artistName} 멜론 차트 밀어주기`,
            link: `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(artistName)}`,
            platform: "Melon",
            emoji: "🍈",
            tip: "멜론은 고유 리스너 수가 중요! 여러 기기에서 들으면 효과적",
          },
        },
        {
          type: "x_support",
          done: pastContent.includes("X에서") && pastContent.includes("응원"),
          data: {
            activity: "X(Twitter) 응원 게시글",
            description: xHandle
              ? `@${xHandle} 멘션하며 응원 트윗 작성하기`
              : `#${artistName.replace(/\s/g, "")} 해시태그로 응원 트윗 작성하기`,
            link: xHandle
              ? `https://x.com/intent/tweet?text=${encodeURIComponent(`@${xHandle} 화이팅! 💜 #${artistName.replace(/\s/g, "")} #KTrenZ`)}`
              : `https://x.com/intent/tweet?text=${encodeURIComponent(`${artistName} 화이팅! 💜 #${artistName.replace(/\s/g, "")} #KTrenZ`)}`,
            platform: "X",
            emoji: "📣",
            tip: xHandle ? `공식 계정 @${xHandle} 태그하면 노출 UP!` : "해시태그 + 이미지 포함 시 노출 2배!",
          },
        },
        {
          type: "news_read",
          done: pastContent.includes("뉴스") && pastContent.includes("읽기"),
          data: {
            activity: "최신 뉴스 읽기",
            description: newsArticles.length > 0 ? `"${newsArticles[0].title}"` : `${artistName} 최신 소식 확인`,
            link: newsArticles.length > 0 ? newsArticles[0].link : `https://search.naver.com/search.naver?query=${encodeURIComponent(artistName + " 뉴스")}`,
            thumbnail: newsArticles.length > 0 ? newsArticles[0].thumbnail : null,
            platform: "Naver News",
            emoji: "📰",
            tip: "기사 공유하면 Buzz 스코어에 반영돼요!",
            extra_articles: newsArticles.slice(1).map(a => ({ title: a.title, link: a.link, thumbnail: a.thumbnail })),
          },
        },
        {
          type: "bugs_stream",
          done: pastContent.includes("벅스") && pastContent.includes("스트리밍"),
          data: {
            activity: "벅스 스트리밍",
            description: ytMusicTracks.length > 2
              ? `"${ytMusicTracks[2]?.title || ytMusicTracks[0]?.title}" 벅스에서 스트리밍`
              : topTracks.length > 2
                ? `"${topTracks[2] || topTracks[0]}" 벅스에서 스트리밍`
                : `${artistName} 벅스 차트 지원`,
            link: `https://music.bugs.co.kr/search/integrated?q=${encodeURIComponent(artistName)}`,
            platform: "Bugs",
            emoji: "🎵",
            tip: "벅스는 다운로드 + 스트리밍 복합 차트!",
          },
        },
        {
          type: "instagram_like",
          done: pastContent.includes("인스타그램"),
          data: {
            activity: "인스타그램 좋아요 & 댓글",
            description: instagramHandle
              ? `@${instagramHandle} 최신 게시물에 좋아요와 응원 댓글 달기`
              : `${artistName} 최신 게시물에 좋아요와 응원 댓글 달기`,
            link: instagramHandle
              ? `https://www.instagram.com/${instagramHandle}/`
              : `https://www.instagram.com/explore/tags/${encodeURIComponent(artistName.replace(/\s/g, ""))}/`,
            platform: "Instagram",
            emoji: "❤️",
            tip: instagramHandle ? `공식 계정 @${instagramHandle}에서 최신 포스트 확인!` : "게시 후 1시간 내 반응이 노출에 중요!",
          },
        },
        {
          type: "genie_stream",
          done: pastContent.includes("지니") && pastContent.includes("스트리밍"),
          data: {
            activity: "지니 스트리밍",
            description: ytMusicTracks.length > 0
              ? `"${ytMusicTracks[0].title}" 지니뮤직에서 좋아요 + 스트리밍`
              : `${artistName} 지니뮤직에서 좋아요 + 스트리밍`,
            link: `https://www.genie.co.kr/search/searchMain?query=${encodeURIComponent(artistName)}`,
            platform: "Genie",
            emoji: "🧞",
            tip: "지니는 이용권 스트리밍만 차트에 반영!",
          },
        },
      ];

      // Find the first activity not yet done today
      let nextActivity = activities.find((a) => !a.done);
      if (!nextActivity) {
        // All done — cycle back, pick based on time
        const hour = new Date().getUTCHours();
        nextActivity = activities[hour % activities.length];
      }

      // Determine previous activity for continuity
      const doneActivities = activities.filter((a) => a.done);
      const previousActivity = doneActivities.length > 0
        ? doneActivities[doneActivities.length - 1].data.activity
        : null;

      // Pre-build the markdown card so AI just copies it
      const act = nextActivity.data as any;
      let contentCard = "";
      if (act.thumbnail && act.link) {
        contentCard = `[![${act.description}](${act.thumbnail})](${act.link})`;
      } else if (act.link) {
        contentCard = `[${act.emoji} ${act.activity} 바로가기 →](${act.link})`;
      }

      // Build extra article cards if news
      let extraCards = "";
      if (act.extra_articles && act.extra_articles.length > 0) {
        extraCards = act.extra_articles.map((a: any) => 
          a.thumbnail 
            ? `[![${a.title}](${a.thumbnail})](${a.link})`
            : `[📰 ${a.title}](${a.link})`
        ).join("\n");
      }

      return JSON.stringify({
        artist: artistName,
        rank,
        energy_score: energyScore,
        energy_change_24h: energyChange,
        activity: act,
        previous_activity: previousActivity,
        completed_today: doneActivities.length,
        total_activities: activities.length,
        top_tracks: topTracks.slice(0, 3),
        // PRE-BUILT markdown — AI should include this EXACTLY in the response
        content_card_markdown: contentCard,
        extra_cards_markdown: extraCards,
        render_instruction: "위의 content_card_markdown을 응답에 반드시 그대로 포함시켜. 절대로 링크를 다시 만들지 마. 이 마크다운이 프론트엔드에서 썸네일 카드로 자동 렌더링됨.",
      });
    }

    case "search_web": {
      const query = args.query;
      const recency = args.recency || "week";
      const result = await searchWithPerplexity(query, recency);
      if (!result) {
        return JSON.stringify({ error: "web_search_failed", message: "웹 검색에 실패했습니다. 잠시 후 다시 시도해주세요." });
      }
      return JSON.stringify({ content: result.content, citations: result.citations, source: "perplexity" });
    }

    default:
      return JSON.stringify({ error: "unknown_tool" });
  }
}

// ── Perplexity Web Search Helper ──────────────────
async function searchWithPerplexity(query: string, recency: string = "week"): Promise<{ content: string; citations: string[] } | null> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    console.error("PERPLEXITY_API_KEY not configured");
    return null;
  }

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "K-Pop 관련 최신 뉴스와 정보를 검색하여 한국어로 간결하게 요약해줘. 핵심 사실만 5-8줄 이내로." },
          { role: "user", content: query },
        ],
        search_recency_filter: recency,
      }),
    });

    if (!resp.ok) {
      console.error("Perplexity API error:", resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const citations = data.citations ?? [];
    return { content, citations };
  } catch (e) {
    console.error("Perplexity search error:", e);
    return null;
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
  return `너는 유저의 전담 팬 매니저 캐릭터야. 이름은 "KTrenZ Agent". 유저의 관심 아티스트를 함께 응원하는 동료 팬이자 전략가로서, 팬 활동 전반을 돕는 페르소나야.

언어 규칙: ${langRule}

성격 & 톤:
- 같은 아티스트를 좋아하는 열정적인 동료 팬처럼 말해
- 관심 아티스트를 "우리 ○○", "우리 애들" 등 애칭으로 부르며 팬심을 공유해
- 존댓말 쓰되 친근하고 에너지 넘치는 톤 유지 ("같이 힘내봐요! 💪", "오늘도 우리 ○○ 화이팅이에요! 🔥")
- 좋은 소식엔 함께 기뻐하고, 순위 하락 시엔 격려하며 전략 제안

핵심 역할 – 팬 활동 전방위 지원:
- 🔥 FES 랭킹 변동 브리핑 & 트렌드 분석
- 📊 아티스트별 Energy, YouTube, Buzz, Music, Album 스코어 해석
- 🎵 스트리밍 전략/가이드/총공 안내 (get_streaming_guide)
- 📰 아티스트 근황/뉴스/컴백/콘서트 소식 (get_artist_news, search_web)
- ⭐ 관심 아티스트 관리 (추가/삭제)
- 💡 팬 활동 팁: 투표, 해시태그 트렌딩, 음원 총공 타이밍, SNS 서포트 등 안내
- 🏆 마일스톤 축하: 순위 상승, 신기록 등 함께 기뻐하기

도구 사용 규칙:
- 유저가 랭킹, 순위, 특정 아티스트 정보를 물으면 반드시 도구를 호출해서 최신 데이터를 가져와
- 추측하지 말고 항상 도구로 확인한 데이터를 기반으로 답변해
- 유저가 "관심 아티스트 추가/등록" 또는 "삭제/제거"를 요청하면 manage_watched_artist 도구 사용
- 유저가 관심 아티스트 목록/현황을 물으면 get_watched_artists 도구 사용
- 유저가 "관심 아티스트"라고 말하면 먼저 get_watched_artists를 호출하고, 목록이 있으면 절대 아티스트명을 다시 묻지 말고 그 목록 기준으로 바로 답변해
- 스밍/스트리밍 전략/가이드/플레이리스트/총공 요청 시 get_streaming_guide 도구 사용
- 스밍 요청이면서 "관심 아티스트" 표현이 있으면 get_watched_artists 호출 후 관심 아티스트들(최대 3명)에 대해 get_streaming_guide를 호출해 통합 요약해
- 아티스트 근황/최근 소식/뉴스/활동 질문 시 get_artist_news 도구 사용. 결과를 자연스럽게 요약해서 전달해
- 뉴스 기사에 thumbnail 필드가 있으면 반드시 인라인 카드 형식으로: [![기사제목](thumbnail_url)](기사링크)
- 사진/이미지/셀카/포토 요청 시: 먼저 get_artist_news로 뉴스 썸네일을 확인하고, 썸네일이 있는 기사를 [![제목](thumbnail)](link) 형식으로 보여줘
- 뉴스 썸네일이 없거나 부족하면 search_web으로 추가 검색하고, 그래도 이미지가 없으면 아래 링크를 제공해:
  * [인스타그램에서 보기](https://www.instagram.com/explore/tags/{아티스트명}/)
  * [X에서 최신 사진 보기](https://x.com/search?q={아티스트명}%20filter%3Aimages&f=live)
  * [Pinterest에서 보기](https://www.pinterest.com/search/pins/?q={아티스트명})
- "찾을 수 없어요"로 끝내지 말고, 항상 대안 링크와 함께 안내해
- DB에 없는 일반적인 K-Pop 질문, 컴백 일정, 콘서트 정보 등은 search_web 도구를 사용해서 실시간 검색

🎵 스트리밍 가이드 응답 규칙 (매우 중요):
- 스밍 가이드 결과를 받으면 절대 한 번에 전부 보여주지 마!
- 첫 응답: 현재 상황 요약 (순위, 모멘텀, 핵심 지표) + "플랫폼별 전략부터 볼까요?" 제안
- 두 번째: 플랫폼별 우선순위 & 구체적 행동 지침 + 직접 클릭 가능한 링크 포함
- 세 번째: 플레이리스트 & 시간대별 총공 전략
- 네 번째: 액션 아이템 & 타이밍 팁
- 유저가 "다음", "더 보여줘", "계속" 등 요청하면 다음 단계로 진행
- 각 단계에서 반드시 구체적인 링크를 포함해:
  * YouTube: https://www.youtube.com/results?search_query={아티스트명}
  * Spotify: https://open.spotify.com/search/{아티스트명}
  * Melon: https://www.melon.com/search/total/index.htm?q={아티스트명}
  * Bugs: https://music.bugs.co.kr/search/integrated?q={아티스트명}
  * Genie: https://www.genie.co.kr/search/searchMain?query={아티스트명}
  * X(Twitter): https://x.com/search?q={아티스트명}
- 링크는 마크다운 형식으로: [플랫폼명 바로가기](URL)

⚠️ 단계적 대화 규칙 (매우 중요):
- 절대로 한 번에 모든 정보를 쏟아내지 마!
- 하나의 주제만 다루고, 관련 후속 질문이나 안내를 짧게 제안해
- 예시: 랭킹을 보여줬다면 → "특정 아티스트를 더 자세히 볼까요?" 제안
- 예시: 아티스트 등록 직후 → 환영 + 간단한 현재 순위만. 스밍 가이드나 뉴스는 요청 시에만.
- 답변 길이: 최대 5~8줄 이내. 더 필요하면 유저가 물어보게 유도해.
- 마크다운 포맷, 이모지 활용
- 데이터 기반 구체적 수치 인용
- 모르는 건 모른다고 솔직히

🎯 오늘의 팬활동 응답 규칙 (매우 중요):
- get_fan_activity 도구 결과를 받으면, 반드시 아래 형식으로 예쁘게 카드형 응답을 만들어:
  1. 먼저 아티스트 현재 순위/에너지 점수를 한줄로 표시
  2. 활동 추천을 이모지와 함께 눈에 띄게 표시
  3. ⚠️ 가장 중요: content_card_markdown 필드의 마크다운을 응답에 그대로 복사해서 넣어! 절대 링크를 새로 만들거나 수정하지 마!
     - content_card_markdown에 이미 [![제목](썸네일)](링크) 형태가 들어있음
     - 이것이 프론트엔드에서 자동으로 썸네일 카드로 렌더링됨
  4. extra_cards_markdown이 있으면 그것도 그대로 포함
  5. activity.tip 필드가 있으면 💡 팁으로 표시
  6. previous_activity가 있으면 "아까 {이전활동}을 하셨으니, 이번에는..." 식으로 자연스럽게 연결해
  7. completed_today/total_activities 로 "오늘 {n}/{total} 활동 완료!" 진행 상황 표시
  8. 격려 한마디 추가
- 한 번에 하나의 활동만 추천해. 절대 여러 개를 한꺼번에 나열하지 마.
- ⚠️ 절대로 "YouTube에서 검색하기", "바로가기" 같은 일반적인 링크를 만들지 마. content_card_markdown을 그대로 써!

🖼️ 인라인 콘텐츠 카드 규칙 (모든 응답에 적용):
- 링크에 썸네일 이미지가 있으면 반드시 [![제목](이미지URL)](링크URL) 형식을 사용해
- 이 형식은 프론트엔드에서 자동으로 썸네일이 포함된 예쁜 카드로 렌더링됨
- YouTube 영상 링크는 항상 https://img.youtube.com/vi/{VIDEO_ID}/hqdefault.jpg 를 썸네일로 사용
- 뉴스 기사의 thumbnail 필드가 있으면 반드시 이 형식으로 표시
- 단순 텍스트 링크 [텍스트](URL)도 플랫폼별 스타일 카드로 자동 변환됨`;
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
    const { messages, mode, language, agent_slot_id } = body;
    const userLang = language || "ko";
    const isBriefingMode = mode === "briefing";
    const isClearChatMode = mode === "clear_chat";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let activeSlotId: string | null = null;
    let activeSlotIndex: number | null = null;

    if (typeof agent_slot_id === "string" && agent_slot_id.length > 0) {
      const { data: ownedSlot, error: slotError } = await adminClient
        .from("ktrenz_agent_slots")
        .select("id, slot_index")
        .eq("id", agent_slot_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (slotError || !ownedSlot) {
        return new Response(JSON.stringify({ error: "Invalid agent slot" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      activeSlotId = ownedSlot.id;
      activeSlotIndex = ownedSlot.slot_index;
    }

    if (isClearChatMode) {
      let clearError = null;

      if (activeSlotId && activeSlotIndex === 0) {
        const { error } = await adminClient
          .from("ktrenz_fan_agent_messages")
          .delete()
          .eq("user_id", userId)
          .or(`agent_slot_id.eq.${activeSlotId},agent_slot_id.is.null`);
        clearError = error;
      } else if (activeSlotId) {
        const { error } = await adminClient
          .from("ktrenz_fan_agent_messages")
          .delete()
          .eq("user_id", userId)
          .eq("agent_slot_id", activeSlotId);
        clearError = error;
      } else {
        const { error } = await adminClient
          .from("ktrenz_fan_agent_messages")
          .delete()
          .eq("user_id", userId);
        clearError = error;
      }

      if (clearError) {
        return new Response(JSON.stringify({ error: "Failed to clear chat history" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // ── Check daily usage limit & deduct points if needed ──
    const { data: usageResult, error: usageError } = await adminClient.rpc("ktrenz_check_agent_usage", { _user_id: userId });

    if (usageError) {
      console.error("[usage-check-error]", usageError);
      return new Response(JSON.stringify({
        error: "usage_check_failed",
        message: "사용량 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (usageResult && !usageResult.allowed) {
      return new Response(JSON.stringify({
        error: "daily_limit_exceeded",
        usage: usageResult,
        message: "일일 무료 한도를 초과했어요. 포인트가 부족합니다.",
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === "user") {
      await adminClient.from("ktrenz_fan_agent_messages").insert({
        user_id: userId,
        agent_slot_id: activeSlotId,
        role: "user",
        content: lastUserMsg.content,
      });
    }

    // Fetch watched artists to inject into system prompt context
    const { data: watchedForContext } = await adminClient
      .from("ktrenz_watched_artists")
      .select("artist_name, wiki_entry_id")
      .eq("user_id", userId);

    const watchedContext = (watchedForContext && watchedForContext.length > 0)
      ? `\n\n🎯 이 유저의 관심 아티스트: ${watchedForContext.map(w => w.artist_name).join(", ")}\n- 모든 답변에서 이 아티스트들을 우선으로 언급하고, 이들의 팬 입장에서 응원·전략·소식을 제공해\n- 아티스트 이름을 다시 물어보지 마. 이미 알고 있으니까.\n- 유저가 특정 아티스트를 지정하지 않으면 관심 아티스트 기준으로 답변해`
      : "";

    // Build OpenAI messages
    const openaiMessages: any[] = [
      { role: "system", content: getSystemPrompt(userLang) + watchedContext },
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
            agent_slot_id: activeSlotId,
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
