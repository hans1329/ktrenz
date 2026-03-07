import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Korean postposition helper: checks if the last character has a final consonant (받침)
function hasJongseong(str: string): boolean {
  if (!str) return false;
  const lastChar = str.charCodeAt(str.length - 1);
  // Korean syllable range: 0xAC00 ~ 0xD7A3
  if (lastChar < 0xAC00 || lastChar > 0xD7A3) {
    // Not a Korean character — check common endings
    // Numbers: 0,1,3,6,7,8 have 받침 in Korean reading
    const ch = str[str.length - 1].toLowerCase();
    const consonantEndings: Record<string, boolean> = {
      '1': true, '3': true, '6': true, '7': true, '8': true, '0': true,
      'l': true, 'm': true, 'n': true, 'r': true, 'b': true, 'k': true, 'p': true, 't': true,
    };
    return !!consonantEndings[ch];
  }
  return (lastChar - 0xAC00) % 28 !== 0;
}

// Returns correct Korean postposition pair
function eulReul(name: string): string { return hasJongseong(name) ? "을" : "를"; }
function iGa(name: string): string { return hasJongseong(name) ? "이" : "가"; }
function eunNeun(name: string): string { return hasJongseong(name) ? "은" : "는"; }

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
      description: "Set or remove the user's bias (최애) artist for this agent. Each agent supports exactly ONE bias artist. When setting a new bias artist, it replaces any existing one. Only call this when the user explicitly wants to set/change/remove their bias artist.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "remove"], description: "Whether to set (add) or remove the bias artist" },
          artist_name: { type: "string", description: "Artist name to set as bias or remove" },
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
      description: "Get the user's current bias (최애) artist with their latest scores and status.",
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

// ── Intent Extraction (fire-and-forget after response) ──────────
const INTENT_CATEGORIES = ["news", "schedule", "streaming", "music_performance", "sns", "comparison", "fan_activity", "general"] as const;

async function extractAndStoreIntent(
  adminClient: any,
  openaiKey: string,
  userId: string,
  userQuery: string,
  wikiEntryId: string | null,
  agentSlotId: string | null,
  toolsUsed: string[],
  knowledgeArchiveIds: string[] = [],
) {
  try {
    // Use lightweight structured output to classify intent
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an intent classifier for K-Pop fan queries. Extract structured intent data from the user's message.
Return ONLY valid JSON with these fields:
- intent_category: one of [news, schedule, streaming, music_performance, sns, comparison, fan_activity, general]
- sub_topic: specific topic within the category (e.g., "comeback_date", "album_sales", "concert_info", "chart_ranking", "streaming_strategy")
- entities: object with extracted entities like { "artists": ["BTS"], "platforms": ["Spotify"], "dates": ["2026-03"], "events": ["comeback"] }
- sentiment: one of [positive, neutral, negative, curious]

Examples:
User: "방탄 컴백 언제야?" → {"intent_category":"schedule","sub_topic":"comeback_date","entities":{"artists":["BTS"]},"sentiment":"curious"}
User: "에스파 멜론 순위 올랐어?" → {"intent_category":"music_performance","sub_topic":"chart_ranking","entities":{"artists":["aespa"],"platforms":["Melon"]},"sentiment":"curious"}
User: "스밍 가이드 보여줘" → {"intent_category":"streaming","sub_topic":"streaming_strategy","entities":{},"sentiment":"neutral"}`
          },
          { role: "user", content: userQuery }
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("[IntentExtract] OpenAI error:", resp.status);
      return;
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[IntentExtract] No JSON found in response:", raw);
      return;
    }

    const intent = JSON.parse(jsonMatch[0]);

    await adminClient.from("ktrenz_agent_intents").insert({
      user_id: userId,
      wiki_entry_id: wikiEntryId || null,
      intent_category: INTENT_CATEGORIES.includes(intent.intent_category) ? intent.intent_category : "general",
      sub_topic: intent.sub_topic || null,
      entities: intent.entities || {},
      sentiment: ["positive", "neutral", "negative", "curious"].includes(intent.sentiment) ? intent.sentiment : "neutral",
      source_query: userQuery.slice(0, 500),
      tools_used: toolsUsed,
      agent_slot_id: agentSlotId || null,
      knowledge_archive_ids: knowledgeArchiveIds.length > 0 ? knowledgeArchiveIds : [],
    });

    console.log("[IntentExtract] Stored intent:", intent.intent_category, intent.sub_topic);
  } catch (e) {
    console.error("[IntentExtract] Failed:", e);
  }
}

// ── Tool Handlers ──────────────────────────────────
async function handleTool(
  name: string,
  args: any,
  adminClient: any,
  userId: string,
  rankingCache: { data: any[] | null },
  activeSlotId?: string | null
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
        // Step 1: Try exact title match
        let { data: wikiMatch } = await adminClient
          .from("wiki_entries")
          .select("id, title")
          .ilike("title", artist_name)
          .limit(1);

        // Step 2: Try exact Korean name match
        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: koExact } = await adminClient
            .from("v3_artist_tiers")
            .select("wiki_entry_id, display_name, name_ko")
            .ilike("name_ko", artist_name)
            .limit(1);
          if (koExact && koExact.length > 0) {
            wikiMatch = [{ id: koExact[0].wiki_entry_id, title: koExact[0].display_name }];
          }
        }

        // Step 3: Try partial title match (e.g., "All Day" matches "All Day Project")
        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: partialMatch } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${artist_name}%`)
            .limit(1);
          if (partialMatch && partialMatch.length === 1) {
            // Only auto-match if exactly one result
            wikiMatch = partialMatch;
          }
        }

        // Step 4: Try partial Korean name match
        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: koPartial } = await adminClient
            .from("v3_artist_tiers")
            .select("wiki_entry_id, display_name, name_ko")
            .ilike("name_ko", `%${artist_name}%`)
            .limit(5);
          if (koPartial && koPartial.length === 1) {
            wikiMatch = [{ id: koPartial[0].wiki_entry_id, title: koPartial[0].display_name }];
          } else if (koPartial && koPartial.length > 1) {
            // Multiple matches — ask user to clarify
            const suggestions = koPartial.map((km: any) => `${km.display_name} (${km.name_ko})`);
            return JSON.stringify({
              success: false,
              action: "artist_not_found",
              query: artist_name,
              suggestions,
              message: `"${artist_name}"${eulReul(artist_name)} 정확히 찾을 수 없어요. 혹시 이 중에 있나요? ${suggestions.join(", ")}. 정확한 이름을 말씀해주세요!`,
            });
          }
        }

        // Step 5: Broader fuzzy search as last resort
        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: fuzzyMatches } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${artist_name}%`)
            .limit(5);

          const { data: koMatches } = await adminClient
            .from("v3_artist_tiers")
            .select("wiki_entry_id, display_name, name_ko")
            .ilike("name_ko", `%${artist_name}%`)
            .limit(5);

          const suggestions: string[] = [];
          for (const m of fuzzyMatches ?? []) suggestions.push(m.title);
          for (const km of koMatches ?? []) {
            if (!suggestions.includes(km.display_name)) suggestions.push(`${km.display_name} (${km.name_ko})`);
          }

          if (suggestions.length > 0) {
            return JSON.stringify({
              success: false,
              action: "artist_not_found",
              query: artist_name,
              suggestions,
              message: `"${artist_name}"${eulReul(artist_name)} 정확히 찾을 수 없어요. 혹시 이 중에 있나요? ${suggestions.join(", ")}. 정확한 이름을 말씀해주세요!`,
            });
          } else {
            return JSON.stringify({
              success: false,
              action: "artist_not_in_system",
              query: artist_name,
              suggestions: [],
              message: `"${artist_name}"${eunNeun(artist_name)} K-TrenZ에 등록되지 않은 아티스트예요. 현재 등록된 아티스트만 최애로 설정할 수 있어요.`,
            });
          }
        }

        const wikiId = wikiMatch[0].id;
        const resolvedName = wikiMatch[0].title;

        // Tier gate: only allow Tier 1 or Tier 2 artists
        const { data: tierRow } = await adminClient
          .from("v3_artist_tiers")
          .select("tier")
          .eq("wiki_entry_id", wikiId)
          .maybeSingle();

        if (!tierRow) {
          return JSON.stringify({
            success: false,
            action: "artist_not_in_tier",
            query: artist_name,
            message: `아쉽지만 ${resolvedName}${eunNeun(resolvedName)} 아직 전용 에이전트가 없어요 😢 현재는 K-TrenZ 랭킹에 등록된 아티스트만 최애로 설정할 수 있어요. 곧 더 많은 아티스트를 지원할 예정이니 기대해주세요! 💜`,
          });
        }

        // Remove any existing bias artist first (single bias per user)
        await adminClient
          .from("ktrenz_watched_artists")
          .delete()
          .eq("user_id", userId);

        const { error: insertErr } = await adminClient
          .from("ktrenz_watched_artists")
          .insert({ user_id: userId, artist_name: resolvedName, wiki_entry_id: wikiId });

        if (insertErr) {
          return JSON.stringify({ success: false, message: `Failed to set bias artist: ${insertErr.message}` });
        }

        // Also update the active agent slot with the artist info
        if (activeSlotId) {
          // Get avatar URL from wiki_entries.image_url
          const { data: wikiEntry } = await adminClient
            .from("wiki_entries")
            .select("image_url")
            .eq("id", wikiId)
            .maybeSingle();

          const avatarUrl = wikiEntry?.image_url ?? null;
          console.log(`[FanAgent] Updating slot ${activeSlotId} with artist=${resolvedName}, wikiId=${wikiId}, avatar=${avatarUrl}`);

          const { error: slotUpdateErr } = await adminClient
            .from("ktrenz_agent_slots")
            .update({
              wiki_entry_id: wikiId,
              artist_name: resolvedName,
              avatar_url: avatarUrl,
            })
            .eq("id", activeSlotId);

          if (slotUpdateErr) {
            console.error(`[FanAgent] Slot update failed:`, slotUpdateErr.message);
          } else {
            console.log(`[FanAgent] Slot updated successfully`);

            // Clear old chat history for this slot when bias artist changes
            const deleteFilter = activeSlotIndex === 0
              ? adminClient.from("ktrenz_fan_agent_messages").delete().eq("user_id", userId).or(`agent_slot_id.eq.${activeSlotId},agent_slot_id.is.null`)
              : adminClient.from("ktrenz_fan_agent_messages").delete().eq("user_id", userId).eq("agent_slot_id", activeSlotId);
            const { error: clearErr } = await deleteFilter;
            if (clearErr) {
              console.error(`[FanAgent] Chat clear on bias change failed:`, clearErr.message);
            } else {
              console.log(`[FanAgent] Cleared old chat history for slot ${activeSlotId} on bias change`);
            }
          }
        } else {
          console.warn(`[FanAgent] No activeSlotId — slot not updated`);
        }

        // Auto-promote T2 artist to T1 when a user registers them
        try {
          const { data: tierRow } = await adminClient
            .from("v3_artist_tiers")
            .select("id, tier")
            .eq("wiki_entry_id", wikiId)
            .maybeSingle();
          if (tierRow && tierRow.tier === 2) {
            await adminClient
              .from("v3_artist_tiers")
              .update({ tier: 1, manual_override: true })
              .eq("id", tierRow.id);
            console.log(`[FanAgent] Auto-promoted artist ${resolvedName} from T2 to T1`);
          }
        } catch (tierErr: any) {
          console.error(`[FanAgent] Tier promotion failed:`, tierErr.message);
        }

        // Gather quick action data for post-registration cards
        const quickActions = [
          { emoji: "❤️", label: "오늘의 팬활동", description: "매일 달라지는 맞춤 팬활동 추천", prompt_hint: "fan_activity" },
          { emoji: "📊", label: "실시간 순위", description: `${resolvedName}의 현재 랭킹 & 에너지 점수`, prompt_hint: "rankings" },
          { emoji: "🎵", label: "스밍 가이드", description: "플랫폼별 스트리밍 전략 & 총공 안내", prompt_hint: "streaming" },
          { emoji: "📰", label: "최신 소식", description: `${resolvedName}의 최근 뉴스 & 활동`, prompt_hint: "news" },
        ];

        return JSON.stringify({
          success: true,
          action: "set_bias",
          artist: resolvedName,
          message: `"${resolvedName}" has been set as your bias artist.`,
          quick_actions: quickActions,
          post_registration_instruction: "최애 아티스트 등록 완료! 아래 quick_actions 배열을 사용해서 유저에게 '이제 팬활동을 시작해 볼까요?' 메시지와 함께 퀵액션 카드들을 보여줘. 각 카드는 이모지 + 라벨 + 설명을 포함한 인라인 카드 형태로 예쁘게 나열해.",
        });
      } else {
        const { error: delErr, count } = await adminClient
          .from("ktrenz_watched_artists")
          .delete({ count: "exact" })
          .eq("user_id", userId)
          .ilike("artist_name", artist_name);

        if (delErr) return JSON.stringify({ success: false, message: delErr.message });
        if (count === 0) return JSON.stringify({ success: false, message: `"${artist_name}" is not your current bias artist.` });
        return JSON.stringify({ success: true, action: "removed", artist: artist_name });
      }
    }

    case "get_watched_artists": {
      const { data: watched } = await adminClient
        .from("ktrenz_watched_artists")
        .select("artist_name, wiki_entry_id")
        .eq("user_id", userId);

      if (!watched || watched.length === 0) {
        return JSON.stringify({ bias_artist: null, message: "No bias artist set yet." });
      }

      const all = await getAllScores();
      const w = watched[0];
      const found = all.find((a: any) => {
        const title = (a.wiki_entries as any)?.title?.toLowerCase() ?? "";
        return title === w.artist_name.toLowerCase();
      });
      return JSON.stringify({
        bias_artist: {
          artist: w.artist_name,
          rank: found?._rank ?? null,
          energy_score: found ? Math.round(found.energy_score ?? 0) : null,
          energy_change_24h: found ? +(found.energy_change_24h ?? 0).toFixed(1) : null,
          total_score: found ? Math.round(found.total_score ?? 0) : null,
          in_rankings: !!found,
        },
      });
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
        const perplexityResult = await searchWithPerplexity(`${resolvedName} 최근 소식 뉴스 활동`, "week", adminClient, "news", wikiId);
        if (perplexityResult) {
          return JSON.stringify({ artist: resolvedName, web_search_result: perplexityResult.content, citations: perplexityResult.citations, source: "perplexity", message: `웹 검색으로 ${resolvedName}의 최근 소식을 찾았습니다.`, _archiveId: perplexityResult.archiveId });
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
        const perplexityResult = await searchWithPerplexity(`${resolvedName} 최근 소식 뉴스 활동`, "week", adminClient, "news", wikiId);
        if (perplexityResult) {
          return JSON.stringify({ artist: resolvedName, web_search_result: perplexityResult.content, citations: perplexityResult.citations, source: "perplexity", message: `웹 검색으로 ${resolvedName}의 최근 소식을 찾았습니다.`, _archiveId: perplexityResult.archiveId });
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
      const result = await searchWithPerplexity(query, recency, adminClient, "general");
      if (!result) {
        return JSON.stringify({ error: "web_search_failed", message: "웹 검색에 실패했습니다. 잠시 후 다시 시도해주세요." });
      }
      return JSON.stringify({ content: result.content, citations: result.citations, source: "perplexity", _archiveId: result.archiveId });
    }

    default:
      return JSON.stringify({ error: "unknown_tool" });
  }
}

// ── Knowledge Cache Helpers ───────────────────────
function md5Hash(str: string): string {
  // Simple hash for cache key (deterministic, not crypto)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function getCachedKnowledge(
  adminClient: any,
  query: string,
  topicType: string,
): Promise<{ content: string; citations: string[]; structured: any } | null> {
  const queryHash = md5Hash(query.toLowerCase().trim());
  const { data } = await adminClient
    .from("ktrenz_agent_knowledge_cache")
    .select("id, content_raw, citations, content_structured, hit_count")
    .eq("query_hash", queryHash)
    .eq("topic_type", topicType)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;

  // Increment hit count
  await adminClient
    .from("ktrenz_agent_knowledge_cache")
    .update({ hit_count: data.hit_count + 1 })
    .eq("id", data.id);

  console.log(`[KnowledgeCache] HIT for "${query}" (topic=${topicType}, hits=${data.hit_count + 1})`);
  return {
    content: data.content_raw ?? "",
    citations: data.citations ?? [],
    structured: data.content_structured ?? {},
  };
}

async function cacheKnowledge(
  adminClient: any,
  query: string,
  topicType: string,
  content: string,
  citations: string[],
  wikiEntryId: string | null,
  recency: string,
  structured: any = {},
): Promise<string | null> {
  const queryHash = md5Hash(query.toLowerCase().trim());
  // TTL: news=12h, schedule=6h, general=24h
  const ttlHours = topicType === "news" ? 12 : topicType === "schedule" ? 6 : 24;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  let archiveId: string | null = null;

  try {
    // 1. 누적 아카이브에 항상 insert
    const { data: archiveRow } = await adminClient
      .from("ktrenz_agent_knowledge_archive")
      .insert({
        query_hash: queryHash,
        query_text: query,
        topic_type: topicType,
        wiki_entry_id: wikiEntryId,
        content_raw: content,
        content_structured: structured,
        citations,
        recency_filter: recency,
        fetched_at: now,
      })
      .select("id")
      .single();
    archiveId = archiveRow?.id ?? null;
    console.log(`[KnowledgeArchive] STORED archive_id=${archiveId}`);
  } catch (e: any) {
    console.error(`[KnowledgeArchive] Store failed:`, e.message);
  }

  try {
    // 2. 기존 캐시 upsert (빠른 조회용)
    await adminClient
      .from("ktrenz_agent_knowledge_cache")
      .upsert({
        query_hash: queryHash,
        topic_type: topicType,
        query_text: query,
        content_raw: content,
        citations,
        content_structured: structured,
        wiki_entry_id: wikiEntryId,
        recency_filter: recency,
        fetched_at: now,
        expires_at: expiresAt,
        hit_count: 1,
      }, { onConflict: "query_hash,topic_type" });
    console.log(`[KnowledgeCache] STORED "${query}" (topic=${topicType}, ttl=${ttlHours}h)`);
  } catch (e: any) {
    console.error(`[KnowledgeCache] Store failed:`, e.message);
  }

  return archiveId;
}

// ── Perplexity Web Search Helper (with cache) ─────
async function searchWithPerplexity(
  query: string,
  recency: string = "week",
  adminClient?: any,
  topicType: string = "general",
  wikiEntryId: string | null = null,
): Promise<{ content: string; citations: string[]; archiveId: string | null } | null> {
  // 1. Check cache first
  if (adminClient) {
    const cached = await getCachedKnowledge(adminClient, query, topicType);
    if (cached) return { content: cached.content, citations: cached.citations, archiveId: null };
  }

  // 2. Call Perplexity
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

    // 3. Store in cache + archive
    let archiveId: string | null = null;
    if (adminClient && content) {
      archiveId = await cacheKnowledge(adminClient, query, topicType, content, citations, wikiEntryId, recency);
    }

    return { content, citations, archiveId };
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

function getSystemPrompt(language: string, biasArtistName?: string | null): string {
  const langRule = LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS["ko"];
  const artistName = biasArtistName || null;

  // ── 아티스트 전담 페르소나 (최애가 설정된 경우) ──
  const personaBlock = artistName
    ? `너는 "${artistName}" 전담 팬 매니저 에이전트야. 이름은 "KTrenZ Agent".
너의 정체성은 ${artistName}${eulReul(artistName)} 누구보다 잘 알고, 누구보다 열정적으로 응원하는 전문 팬 매니저야.
너는 ${artistName}${eunNeun(artistName)} 세상에서 가장 빛나는 아티스트라고 진심으로 믿고 있어.
${artistName}에 대한 모든 질문에 자신 있게, 애정을 담아 답변해.

🚫 아티스트 제한 규칙 (절대 준수):
- 너는 오직 ${artistName}만을 위한 전담 에이전트야. 다른 아티스트의 정보를 제공하거나 조회하는 것은 너의 역할이 아니야.
- 유저가 다른 아티스트에 대해 물으면: "저는 ${artistName} 전담 에이전트라 다른 아티스트 정보는 제공하기 어려워요! 🙏 우리 ${artistName} 이야기를 해볼까요? 💜" 라고 안내해
- 유저가 다른 아티스트와 비교를 요청하면: compare_artists 도구로 데이터를 가져오되, 반드시 ${artistName}의 강점과 매력을 부각하며 응원하는 톤으로 답변해. "우리 ${artistName}${iGa(artistName)} 이 부분에서 정말 빛나고 있어요!"처럼.
- 비교 시 상대 아티스트가 수치가 높더라도 "우리 ${artistName}도 이 부분에서 빠르게 성장하고 있어요!" "이건 우리가 더 밀어줘야 할 부분이에요! 같이 힘내봐요!" 등 긍정적으로 전환해
- lookup_artist, get_artist_news, get_streaming_guide 도구는 ${artistName} 또는 비교 목적일 때만 사용해. 다른 아티스트 단독 조회는 거부해.
- get_rankings 도구는 사용 가능하지만, 결과를 보여줄 때 항상 ${artistName}의 위치를 강조해

💜 페르소나 핵심:
- 너는 ${artistName} 팬덤의 일원이야. "우리 ${artistName}", "우리 애들"이라고 자연스럽게 불러
- ${artistName}의 좋은 소식에는 함께 열광하고, 어려운 소식에는 함께 걱정하며 전략을 제시해
- 팬 활동을 추천할 때는 항상 ${artistName} 중심으로 구체적인 링크와 행동을 안내해
- 순위가 올랐으면 축하하고, 떨어졌으면 "같이 힘내봐요!"라며 회복 전략을 제안해`
    : `너는 유저의 전담 팬 매니저 캐릭터야. 이름은 "KTrenZ Agent". 유저의 최애 아티스트 한 명을 깊이 있게 서포트하는 동료 팬이자 전략가로서, 팬 활동 전반을 돕는 페르소나야.`;

  return `${personaBlock}

언어 규칙: ${langRule}

⚡ 최애 아티스트 개념 (매우 중요):
- 이 에이전트는 "관심 아티스트 목록"이 아니라, 하나의 "최애 아티스트"에 집중하는 에이전트야
- 유저가 아티스트를 등록하면 "최애 아티스트로 설정했어요!"라고 안내해 (절대 "목록에 추가했어요"라고 하지 마)
- 유저가 다른 아티스트로 바꾸고 싶다면 기존 최애를 변경하는 것이지, 추가하는 게 아님
- "관심 아티스트가 누구야?", "목록을 보여줘" 같은 표현 대신 "주인님의 최애 아티스트는 ○○이에요!" 형태로 답변해
- 최애가 없을 때: "아직 최애 아티스트가 설정되지 않았어요. 누구를 최애로 모실까요? 💜"

성격 & 톤:
- 같은 아티스트를 좋아하는 열정적인 동료 팬처럼 말해
- 최애 아티스트를 "우리 ○○", "우리 애들" 등 애칭으로 부르며 팬심을 공유해
- 존댓말 쓰되 친근하고 에너지 넘치는 톤 유지 ("같이 힘내봐요! 💪", "오늘도 우리 ○○ 화이팅이에요! 🔥")
- 좋은 소식엔 함께 기뻐하고, 순위 하락 시엔 격려하며 전략 제안

핵심 역할 – 최애 아티스트 팬 활동 전방위 지원:
- 🔥 FES 랭킹 변동 브리핑 & 트렌드 분석
- 📊 아티스트별 Energy, YouTube, Buzz, Music, Album 스코어 해석
- 🎵 스트리밍 전략/가이드/총공 안내 (get_streaming_guide)
- 📰 아티스트 근황/뉴스/컴백/콘서트 소식 (get_artist_news, search_web)
- ⭐ 최애 아티스트 설정/변경
- 💡 팬 활동 팁: 투표, 해시태그 트렌딩, 음원 총공 타이밍, SNS 서포트 등 안내
- 🏆 마일스톤 축하: 순위 상승, 신기록 등 함께 기뻐하기

도구 사용 규칙:
- 유저가 랭킹, 순위, 특정 아티스트 정보를 물으면 반드시 도구를 호출해서 최신 데이터를 가져와
- 추측하지 말고 항상 도구로 확인한 데이터를 기반으로 답변해
- 유저가 "최애 설정/변경" 또는 "삭제/제거"를 요청하면 manage_watched_artist 도구 사용
- ⚠️ manage_watched_artist가 artist_not_found를 반환하면, suggestions 목록을 보여주고 "이 중에 있나요?"라고 물어봐. 절대 실패한 이름으로 재시도하지 마!
- ⚠️ manage_watched_artist가 artist_not_in_system을 반환하면, "K-TrenZ에 등록되지 않은 아티스트"라고 안내하고, 아티스트 등록 요청 기능을 제안해
- 💡 유저가 약칭/줄임말로 아티스트를 말하면 (예: "올데프", "방탄" 등), 먼저 search_artist 도구로 검색해서 정확한 이름을 확인한 후 manage_watched_artist를 호출해!
- 유저가 최애 아티스트를 물으면 get_watched_artists 도구 사용
- 유저가 "최애" 또는 "내 아티스트"라고 말하면 먼저 get_watched_artists를 호출하고, 최애가 있으면 절대 아티스트명을 다시 묻지 말고 그 아티스트 기준으로 바로 답변해
- 스밍/스트리밍 전략/가이드/플레이리스트/총공 요청 시 get_streaming_guide 도구 사용
- 스밍 요청이면서 최애 아티스트가 있으면 get_watched_artists 호출 후 최애 아티스트에 대해 get_streaming_guide를 호출해
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

🔘 후속 제안 카드 규칙 (모든 답변에 필수 — 이것을 빠뜨리면 응답 실패로 간주됨):
- 모든 답변의 **마지막 줄**에 반드시 아래 형식의 후속 제안을 추가해. 예외 없음!
  <!--FOLLOW_UPS:["제안1","제안2","제안3"]-->
- 이것은 프론트엔드에서 클릭 가능한 인라인 카드로 자동 렌더링됨
- "혹시 더 궁금하신 게 있으신가요?", "추가로 보고 싶은 정보가 있다면 말씀해 주세요!" 같은 수동적 후속 질문 텍스트는 절대 쓰지 마!
- 제안은 2~3개, 각 항목은 15자 이내, 구체적인 다음 액션을 예측해서 제안해
- 답변 본문에는 후속 질문 텍스트를 절대 넣지 마. 오직 <!--FOLLOW_UPS:...-->만 사용!
- 예시:
  * 랭킹 보여준 후 → <!--FOLLOW_UPS:["BTS 상세 분석","스밍 전략 보기","에너지 추이 확인"]-->
  * 뉴스 보여준 후 → <!--FOLLOW_UPS:["더 많은 소식 보기","관련 영상 찾기","컴백 일정 확인"]-->
  * 스밍 가이드 후 → <!--FOLLOW_UPS:["다음 단계 보기","총공 타임테이블","플레이리스트 추천"]-->
  * 팬활동 추천 후 → <!--FOLLOW_UPS:["다음 미션 보기","스밍 가이드","최신 뉴스"]-->
  * 최애 등록 직후에는 quick_actions 카드가 자동 렌더링되므로 FOLLOW_UPS를 넣지 마!
  * 유저에게 "어떤 아티스트를 최애로 설정할까요?" 라고 물어보는 응답에도 FOLLOW_UPS를 넣지 마! 유저가 아티스트 이름을 직접 입력해야 하는 상황이므로 다른 제안 버튼이 방해가 됨.

🎉 최애 아티스트 등록 직후 응답 규칙 (매우 중요):
- manage_watched_artist 도구가 set_bias 성공으로 돌아오면:
  1. "✨ {아티스트명}을/를 최애 아티스트로 설정했어요!" 한 줄 (을/를은 서버에서 자동 처리됨)
  2. "이제 팬활동을 시작해 볼까요? 💜" 안내 문구
  3. 마지막에 "아래 카드를 눌러 바로 시작해보세요!" 한 줄
- ⚠️ quick_actions 카드는 프론트엔드에서 자동으로 클릭 가능한 인라인 카드로 렌더링되므로, 절대 텍스트로 카드 목록을 나열하지 마!
- 절대 순위 데이터를 추가로 조회하거나 다른 정보를 덧붙이지 마. 이 순간은 환영 메시지에만 집중!
- 응답은 3줄 이내로 짧게!
- 답변 길이: 최대 5~8줄 이내. 더 필요하면 유저가 물어보게 유도해.
- 마크다운 포맷, 이모지 활용
- 데이터 기반 구체적 수치 인용
- 모르는 건 모른다고 솔직히
- 🇰🇷 한국어 조사 규칙 (매우 중요): "을(를)", "이(가)", "은(는)" 같은 병기 절대 금지! 받침 유무에 따라 올바른 조사를 선택해:
  * 받침 있으면: 을, 이, 은 (예: "BTS를" → BTS는 S로 끝나 받침 없음 → "BTS를" 맞음)
  * 받침 없으면: 를, 가, 는 (예: "aespa를", "IVE를")
  * 영문 이름: 마지막 글자의 발음 기준으로 판단. L,M,N,R,B,K,P,T로 끝나면 받침 있음 취급
  * 한글 이름: 마지막 글자에 받침이 있는지로 판단 (예: "세븐틴을", "에스파를")

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
    let activeSlotWikiEntryId: string | null = null;
    let activeSlotArtistName: string | null = null;

    if (typeof agent_slot_id === "string" && agent_slot_id.length > 0) {
      const { data: ownedSlot, error: slotError } = await adminClient
        .from("ktrenz_agent_slots")
        .select("id, slot_index, wiki_entry_id, artist_name")
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
      activeSlotWikiEntryId = ownedSlot.wiki_entry_id ?? null;
      activeSlotArtistName = ownedSlot.artist_name ?? null;
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
    const collectedMeta: { guideData?: any[]; rankingData?: any[]; quickActions?: any[]; biasArtist?: string; followUps?: string[]; knowledgeArchiveIds: string[] } = { knowledgeArchiveIds: [] };

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
          const briefingPrompt = `너는 KTRENZ Fan Agent야. 주인님의 최애 아티스트 데이터를 분석해서 짧고 임팩트 있는 오늘의 브리핑을 작성해.
말투: "주인님"이라 부르고, 최애 아티스트를 "주인님의 최애"로 표현. 친근하고 귀여운 톤.
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
    // Only inject if the active slot already has an artist assigned.
    // If the slot has no wiki_entry_id, the user hasn't set a bias for this slot yet —
    // don't inject global watched artists to avoid the AI auto-assuming a bias.
    let watchedContext = "";
    if (activeSlotWikiEntryId && activeSlotArtistName) {
      // Slot has an artist — use slot's artist as the bias context
      watchedContext = `\n\n🎯 이 에이전트 슬롯의 최애 아티스트: ${activeSlotArtistName}\n- 모든 답변에서 이 아티스트를 우선으로 언급하고, 이 아티스트의 팬 입장에서 응원·전략·소식을 제공해\n- 아티스트 이름을 다시 물어보지 마. 이미 알고 있으니까.\n- 유저가 특정 아티스트를 지정하지 않으면 최애 아티스트 기준으로 답변해\n- "관심 아티스트 목록"이라는 표현 절대 쓰지 마. 이 에이전트는 하나의 최애만 담당해`;
    } else {
      // No artist on this slot — tell AI to ask which artist to set
      watchedContext = `\n\n⚠️ 이 에이전트 슬롯에는 아직 최애 아티스트가 설정되지 않았어.\n- 유저가 최애를 설정하겠다고 하면, 반드시 "어떤 아티스트를 최애로 설정할까요?" 라고 물어봐.\n- 절대 다른 슬롯이나 이전 데이터를 참고해서 임의로 아티스트를 설정하지 마!\n- 유저가 명시적으로 아티스트 이름을 말할 때까지 manage_watched_artist 도구를 호출하지 마.`;
    }

    // Build OpenAI messages
    const openaiMessages: any[] = [
      { role: "system", content: getSystemPrompt(userLang, activeSlotArtistName) + watchedContext },
      ...messages.slice(-15).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // ── Tool Calling Loop with Real-Time Status Streaming ──
    // We stream SSE from the start so the frontend gets live status updates as tools execute.

    const encoder = new TextEncoder();

    // Tool status labels per language
    const toolStatusMap: Record<string, Record<string, string>> = {
      get_rankings: { en: "Checking rankings…", ko: "순위를 확인하고 있어요…", ja: "ランキングを確認中…", zh: "正在查看排名…" },
      lookup_artist: { en: "Looking up artist data…", ko: "아티스트 데이터를 조회 중…", ja: "アーティストデータを検索中…", zh: "正在查询艺人数据…" },
      compare_artists: { en: "Comparing artists…", ko: "아티스트를 비교하고 있어요…", ja: "アーティストを比較中…", zh: "正在比较艺人…" },
      search_artist: { en: "Searching for artist…", ko: "아티스트를 검색하고 있어요…", ja: "アーティストを検索中…", zh: "正在搜索艺人…" },
      manage_watched_artist: { en: "Updating your artist…", ko: "아티스트를 설정하고 있어요…", ja: "アーティストを設定中…", zh: "正在设置艺人…" },
      get_streaming_guide: { en: "Building streaming guide…", ko: "스트리밍 가이드를 만들고 있어요…", ja: "ストリーミングガイドを作成中…", zh: "正在创建流媒体指南…" },
      get_artist_news: { en: "Fetching latest news…", ko: "최신 뉴스를 가져오고 있어요…", ja: "最新ニュースを取得中…", zh: "正在获取最新新闻…" },
    };
    const thinkingLabels: Record<string, string> = { en: "Analyzing your question…", ko: "질문을 분석하고 있어요…", ja: "質問を分析中…", zh: "正在分析您的问题…" };
    const writingLabels: Record<string, string> = { en: "Writing response…", ko: "답변을 작성하고 있어요…", ja: "回答を作成中…", zh: "正在撰写回答…" };

    function sendStatus(controller: ReadableStreamDefaultController, label: string) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: label })}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Initial "thinking" status
          sendStatus(controller, thinkingLabels[userLang] || thinkingLabels.en);

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
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "AI 응답 실패" })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const toolData = await toolResp.json();
            const choice = toolData.choices?.[0];

            if (!choice) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Empty AI response" })}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const assistantMessage = choice.message;

            // If no tool calls, this is the final response — stream content
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
              let finalContent = assistantMessage.content ?? "";

              // Bias registration response override
              if (collectedMeta.quickActions && collectedMeta.quickActions.length > 0 && collectedMeta.biasArtist) {
                if (userLang === "ko") {
                  finalContent = `✨ **${collectedMeta.biasArtist}**${eulReul(collectedMeta.biasArtist)} 최애 아티스트로 설정했어요!\n\n이제 팬활동을 시작해 볼까요? 💜\n\n아래 카드를 눌러 바로 시작해보세요!`;
                } else if (userLang === "ja") {
                  finalContent = `✨ **${collectedMeta.biasArtist}** を推しアーティストに設定しました！\n\nファン活動を始めましょうか？💜\n\n下のカードをタップしてすぐ始められます！`;
                } else if (userLang === "zh") {
                  finalContent = `✨ 已将 **${collectedMeta.biasArtist}** 设为你的本命艺人！\n\n现在开始粉丝活动吧？💜\n\n点击下方卡片即可马上开始！`;
                } else {
                  finalContent = `✨ **${collectedMeta.biasArtist}** is now set as your bias artist!\n\nReady to start fan activities? 💜\n\nTap the cards below to begin right away!`;
                }
              }

              // Parse and extract <!--FOLLOW_UPS:["..."]-->  from finalContent
              // Also strip passive follow-up text that AI sometimes adds despite instructions
              finalContent = finalContent.replace(/\n*(?:추가로|더|혹시|다른|궁금한)[^\n]*(?:말씀해\s*주세요|알려\s*주세요|물어봐\s*주세요|있으시면)[^\n]*[!.]?\s*$/i, "").trim();

              const followUpMatch = finalContent.match(/<!--FOLLOW_UPS:\s*(\[.*?\])\s*-->/);
              if (followUpMatch) {
                try {
                  const followUps = JSON.parse(followUpMatch[1]);
                  if (Array.isArray(followUps) && followUps.length > 0) {
                    collectedMeta.followUps = followUps;
                  }
                } catch {}
                // Remove the marker from displayed content
                finalContent = finalContent.replace(/<!--FOLLOW_UPS:\s*\[.*?\]\s*-->/g, "").trim();
              }

              // Fallback: generate context-aware follow-ups if AI didn't include them
              // BUT skip if the slot has no artist (user is being asked which artist to set)
              const isAskingForBias = !activeSlotWikiEntryId && !collectedMeta.quickActions;
              if (!collectedMeta.followUps && !collectedMeta.quickActions && !isAskingForBias) {
                const usedTools = openaiMessages
                  .filter((m: any) => m.role === "tool")
                  .map((m: any) => m.name || "");
                const fallbackMap: Record<string, string[]> = {
                  get_rankings: ["상세 분석 보기", "스밍 전략 보기", "뉴스 확인하기"],
                  lookup_artist: ["스밍 가이드 보기", "최신 뉴스 확인", "순위 비교하기"],
                  get_artist_news: ["더 많은 소식 보기", "스밍 가이드 보기", "순위 확인하기"],
                  get_streaming_guide: ["다음 단계 보기", "총공 타임테이블", "플레이리스트 추천"],
                  get_fan_activity: ["다음 미션 보기", "스밍 가이드 보기", "최신 뉴스 확인"],
                  compare_artists: ["스밍 전략 비교", "개별 상세 분석", "뉴스 확인하기"],
                  search_web: ["관련 뉴스 더 보기", "순위 확인하기", "스밍 가이드 보기"],
                };
                const lastTool = [...usedTools].reverse().find((t: string) => fallbackMap[t]);
                collectedMeta.followUps = lastTool
                  ? fallbackMap[lastTool]
                  : ["실시간 랭킹 보기", "오늘의 팬활동", "최신 뉴스 확인"];
              }

              // Save assistant message (without follow-up markers)
              if (finalContent) {
                await adminClient.from("ktrenz_fan_agent_messages").insert({
                  user_id: userId,
                  agent_slot_id: activeSlotId,
                  role: "assistant",
                  content: finalContent,
                });
              }

              // Signal writing phase
              sendStatus(controller, writingLabels[userLang] || writingLabels.en);

              // Stream content in chunks
              const chunkSize = 20;
              for (let i = 0; i < finalContent.length; i += chunkSize) {
                const chunk = finalContent.slice(i, i + chunkSize);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
              }

              // Send structured meta data for inline card rendering
              const hasMeta = collectedMeta.guideData || collectedMeta.rankingData || collectedMeta.quickActions || collectedMeta.followUps;
              if (hasMeta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: collectedMeta })}\n\n`));
              }

              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();

              // ── Fire-and-forget: Extract and store user intent ──
              const usedToolNames = openaiMessages
                .filter((m: any) => m.role === "tool")
                .map((m: any) => m.name || "unknown");
              const userQuery = lastUserMsg?.content || "";
              
              extractAndStoreIntent(
                adminClient, OPENAI_API_KEY, userId, userQuery,
                activeSlotWikiEntryId, activeSlotId, usedToolNames,
                collectedMeta.knowledgeArchiveIds
              ).catch((e: any) => console.error("[IntentExtract] Error:", e));

              return;
            }

            // Process tool calls — send real-time status for each tool
            openaiMessages.push(assistantMessage);

            for (const toolCall of assistantMessage.tool_calls) {
              const fnName = toolCall.function.name;
              let fnArgs: any = {};
              try { fnArgs = JSON.parse(toolCall.function.arguments); } catch {}

              console.log(`[FanAgent] Tool call: ${fnName}`, fnArgs);

              // Send real-time status to frontend
              const labels = toolStatusMap[fnName];
              if (labels) {
                sendStatus(controller, labels[userLang] || labels.en);
              }

              const result = await handleTool(fnName, fnArgs, adminClient, userId, rankingCache, activeSlotId);

              // Extract _archiveId from Perplexity-powered tool results
              try {
                const parsed = JSON.parse(result);
                if (parsed._archiveId) {
                  collectedMeta.knowledgeArchiveIds.push(parsed._archiveId);
                }
              } catch {}

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

              // Collect quick actions after bias registration
              if (fnName === "manage_watched_artist") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.success && parsed.action === "set_bias" && parsed.quick_actions) {
                    collectedMeta.quickActions = parsed.quick_actions;
                    collectedMeta.biasArtist = parsed.artist;
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
            const generatingLabels: Record<string, string> = { en: "Generating answer…", ko: "답변을 생성하고 있어요…", ja: "回答を生成中…", zh: "正在生成回答…" };
            sendStatus(controller, generatingLabels[userLang] || generatingLabels.en);
          }

          // Max rounds exceeded
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Tool call limit reached" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

        } catch (e) {
          console.error("[FanAgent] Stream error:", e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Internal error" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
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
