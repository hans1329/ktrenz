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

function sanitizeArtistCandidate(value: string): string {
  return (value || "")
    .replace(/["'`“”‘’「」『』《》〈〉]/g, "")
    .replace(/\b(?:my|our)\b/gi, "")
    .replace(/\b(?:bias|artist)\b/gi, "")
    .replace(/(?:최애|아티스트)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?！？]+$/g, "")
    .replace(/(?:으로|로|을|를|은|는|이|가)$/u, "")
    .trim();
}

function isLikelyBareArtistInput(userText: string): boolean {
  const text = (userText || "").trim();
  if (!text || text.length < 2 || text.length > 40) return false;
  if (!/^[A-Za-z0-9가-힣\s().,&-]+$/.test(text)) return false;
  if (/[?!？！]/.test(text)) return false;

  const lower = text.toLowerCase();
  const blockedKeywords = [
    "등록", "설정", "추가", "지정", "변경", "삭제", "제거", "바꿔",
    "추천", "보여", "알려", "랭킹", "순위", "뉴스", "일정", "스밍", "가이드", "팬활동",
    "누구", "어떤", "무엇", "뭐", "도와", "해줘", "해주세요", "맞아", "인지",
    "show", "tell", "what", "who", "how", "please", "help",
  ];
  if (blockedKeywords.some((keyword) => lower.includes(keyword))) return false;

  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 4;
}

function extractForcedBiasArtist(userText: string, options?: { allowBareArtist?: boolean }): string | null {
  const text = (userText || "").trim();
  if (!text) return null;

  const allowBareArtist = !!options?.allowBareArtist;
  const lower = text.toLowerCase();
  const registerHints = ["등록", "설정", "추가", "지정", "변경", "바꿔", "set", "register", "change"];
  const hasRegisterIntent = registerHints.some((keyword) => lower.includes(keyword));

  if (!hasRegisterIntent) {
    if (allowBareArtist && isLikelyBareArtistInput(text)) {
      const candidate = sanitizeArtistCandidate(text);
      if (candidate && candidate.length >= 2) return candidate;
    }
    return null;
  }

  const patterns = [
    /([A-Za-z0-9가-힣][A-Za-z0-9가-힣\s().,&-]{0,40}?)\s*(?:을|를|로|으로)?\s*(?:최애|bias|아티스트|artist)?\s*(?:로)?\s*(?:등록|설정|추가|지정|변경|바꿔|set|register|change)/i,
    /(?:최애|bias)\s*(?:아티스트|artist)?\s*(?:를|을|로)?\s*([A-Za-z0-9가-힣][A-Za-z0-9가-힣\s().,&-]{0,40})/i,
    /(?:set|register|change)\s*(?:my\s*)?(?:bias|artist)?\s*(?:to\s*)?([A-Za-z0-9가-힣][A-Za-z0-9가-힣\s().,&-]{0,40})/i,
  ];

  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (!matched?.[1]) continue;
    const candidate = sanitizeArtistCandidate(matched[1]);
    if (candidate && candidate.length >= 2) return candidate;
  }

  return null;
}

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
      name: "get_artist_schedule",
      description: "Get upcoming schedule/events for a specific artist from the ktrenz_schedules database. Returns events like releases, broadcasts, celebrations, concerts, and purchases. Call this when the user asks about 일정, 스케줄, 컴백, schedule, upcoming events, or what's coming up.",
      parameters: {
        type: "object",
        properties: {
          artist_name: { type: "string", description: "Artist name to get schedule for" },
          limit: { type: "number", description: "Number of events to return (default 10, max 20)" },
        },
        required: ["artist_name"],
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
  {
    type: "function",
    function: {
      name: "get_trend_keywords",
      description: "Get currently detected trend keywords for a specific artist. Returns brand/product keywords extracted from news and YouTube that are associated with the artist, including influence index, keyword category, source context, and tracking data. Call this when the user asks about 트렌드 키워드, 협업 브랜드, 광고, endorsement, trending topics, what brands or products are associated with an artist.",
      parameters: {
        type: "object",
        properties: {
          artist_name: { type: "string", description: "Artist name to get trend keywords for" },
          limit: { type: "number", description: "Number of keywords to return (default 10, max 20)" },
        },
        required: ["artist_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trending_now",
      description: "Get the hottest trend keywords across all artists right now. Returns top keywords sorted by influence index with artist info, keyword categories, and search volume data. Call this when the user asks about 지금 뜨는 트렌드, 핫 키워드, trending now, what's hot, or overall trend landscape.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of trending keywords to return (default 10, max 30)" },
          category: { type: "string", description: "Optional filter by keyword category (e.g., 'brand', 'product', 'media', 'event')" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// ── Intent Extraction (fire-and-forget after response) ──────────
const INTENT_CATEGORIES = ["news", "schedule", "streaming", "music_performance", "sns", "comparison", "fan_activity", "trend", "general"] as const;

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
  activeSlotId?: string | null,
  activeSlotIndex?: number | null
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
  type TierAliasCandidate = {
    wiki_entry_id: string;
    display_name: string | null;
    name_ko: string | null;
  };

  let koNameMap: Map<string, string> | null = null;
  let tierAliasCandidatesCache: TierAliasCandidate[] | null = null;

  async function getTierAliasCandidates(): Promise<TierAliasCandidate[]> {
    if (tierAliasCandidatesCache) return tierAliasCandidatesCache;

    const pageSize = 1000;
    let from = 0;
    const allRows: TierAliasCandidate[] = [];

    while (true) {
      const { data, error } = await adminClient
        .from("v3_artist_tiers")
        .select("wiki_entry_id, display_name, name_ko")
        .not("wiki_entry_id", "is", null)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("[FanAgent] Failed to load tier alias candidates:", error.message);
        break;
      }

      if (!data || data.length === 0) break;

      for (const row of data as TierAliasCandidate[]) {
        if (!row.wiki_entry_id) continue;
        allRows.push({
          wiki_entry_id: row.wiki_entry_id,
          display_name: row.display_name ?? null,
          name_ko: row.name_ko ?? null,
        });
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    tierAliasCandidatesCache = allRows;
    return tierAliasCandidatesCache;
  }

  async function getKoNameMap(): Promise<Map<string, string>> {
    if (koNameMap) return koNameMap;
    const candidates = await getTierAliasCandidates();

    koNameMap = new Map();
    for (const row of candidates) {
      if (row.name_ko) koNameMap.set(row.wiki_entry_id, row.name_ko.toLowerCase());
    }
    return koNameMap;
  }

  // Helper: normalize artist text for typo-tolerant matching
  function normalizeArtistName(input: string): string {
    return (input || "")
      .normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9가-힣]/g, "");
  }

  function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[a.length][b.length];
  }

  async function findClosestTierArtist(query: string): Promise<{ wiki_entry_id: string; display_name: string | null; name_ko: string | null; distance: number } | null> {
    const normalizedQuery = normalizeArtistName(query);
    if (!normalizedQuery) return null;

    const candidates = await getTierAliasCandidates();
    if (!candidates || candidates.length === 0) return null;

    const scored = candidates
      .map((row) => {
        const variants = [row.name_ko, row.display_name]
          .filter(Boolean)
          .map((v: string) => normalizeArtistName(v))
          .filter(Boolean);

        if (variants.length === 0) return null;

        const bestDistance = Math.min(...variants.map((v) => levenshteinDistance(normalizedQuery, v)));
        return {
          wiki_entry_id: row.wiki_entry_id,
          display_name: row.display_name ?? null,
          name_ko: row.name_ko ?? null,
          distance: bestDistance,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distance - b.distance) as { wiki_entry_id: string; display_name: string | null; name_ko: string | null; distance: number }[];

    if (scored.length === 0) return null;

    const best = scored[0];
    const second = scored[1];
    const maxDistance = normalizedQuery.length <= 3 ? 1 : normalizedQuery.length <= 5 ? 2 : 3;
    const hasClearLead = !second || best.distance + 1 <= second.distance;
    const isHighConfidenceTypo = best.distance <= 1;

    if (best.distance <= maxDistance && (hasClearLead || isHighConfidenceTypo)) return best;
    return null;
  }

  async function resolveTierArtistCandidate(query: string): Promise<{ wiki_entry_id: string; display_name: string | null; name_ko: string | null; wiki_title: string | null } | null> {
    const sanitizedQuery = sanitizeArtistCandidate(query);
    const normalizedQuery = normalizeArtistName(sanitizedQuery);
    if (!normalizedQuery) return null;

    const candidates = await getTierAliasCandidates();
    if (!candidates || candidates.length === 0) return null;

    const ranked = candidates
      .map((row) => {
        const variants = [row.name_ko, row.display_name]
          .filter(Boolean)
          .map((v: string) => ({ raw: v, normalized: normalizeArtistName(v) }))
          .filter((v: { raw: string; normalized: string }) => !!v.normalized);

        if (variants.length === 0) return null;

        const hasExact = variants.some((v: { raw: string; normalized: string }) => v.normalized === normalizedQuery);
        const hasContains = variants.some((v: { raw: string; normalized: string }) => v.normalized.includes(normalizedQuery) || normalizedQuery.includes(v.normalized));
        const bestDistance = Math.min(...variants.map((v: { raw: string; normalized: string }) => levenshteinDistance(normalizedQuery, v.normalized)));

        return {
          wiki_entry_id: row.wiki_entry_id,
          display_name: row.display_name ?? null,
          name_ko: row.name_ko ?? null,
          wiki_title: null,
          hasExact,
          hasContains,
          distance: bestDistance,
        };
      })
      .filter(Boolean) as {
        wiki_entry_id: string;
        display_name: string | null;
        name_ko: string | null;
        wiki_title: string | null;
        hasExact: boolean;
        hasContains: boolean;
        distance: number;
      }[];

    if (ranked.length === 0) return null;

    const exact = ranked.find((item) => item.hasExact);
    if (exact) return exact;

    const contains = ranked
      .filter((item) => item.hasContains)
      .sort((a, b) => a.distance - b.distance);
    if (contains.length === 1) return contains[0];

    const sortedByDistance = [...ranked].sort((a, b) => a.distance - b.distance);
    const best = sortedByDistance[0];
    const second = sortedByDistance[1];
    const maxDistance = normalizedQuery.length <= 3 ? 1 : normalizedQuery.length <= 5 ? 2 : 3;
    const hasClearLead = !second || best.distance + 1 <= second.distance;

    if (best.distance <= maxDistance && hasClearLead) return best;
    return null;
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
      return JSON.stringify({ rankings: result, timestamp: new Date().toISOString(), _ui_hint: "RANKING_CARD_RENDERED: 이 랭킹 데이터는 유저 화면에 이미 시각적 카드로 표시되었습니다. 텍스트로 순위를 다시 나열하지 마세요. 1문장 이내로 핵심 코멘트만 하세요." });
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
      const all = await getAllScores();
      const totalArtists = all.length;

      // Calculate category-level ranks
      const ytRank = [...all].sort((a, b) => (b.youtube_score ?? 0) - (a.youtube_score ?? 0)).findIndex(a => a.wiki_entry_id === wikiId) + 1;
      const bzRank = [...all].sort((a, b) => (b.buzz_score ?? 0) - (a.buzz_score ?? 0)).findIndex(a => a.wiki_entry_id === wikiId) + 1;
      const muRank = [...all].sort((a, b) => (b.music_score ?? 0) - (a.music_score ?? 0)).findIndex(a => a.wiki_entry_id === wikiId) + 1;
      const alRank = [...all].sort((a, b) => (b.album_sales_score ?? 0) - (a.album_sales_score ?? 0)).findIndex(a => a.wiki_entry_id === wikiId) + 1;

      // Find #1 scores for gap analysis
      const top1 = all[0];

      return JSON.stringify({
        artist: (found.wiki_entries as any)?.title,
        rank: found._rank,
        total_artists: totalArtists,
        energy_score: Math.round(found.energy_score ?? 0),
        energy_change_24h: +(found.energy_change_24h ?? 0).toFixed(1),
        total_score: Math.round(found.total_score ?? 0),
        youtube: { score: Math.round(found.youtube_score ?? 0), rank: ytRank },
        buzz: { score: Math.round(found.buzz_score ?? 0), rank: bzRank },
        music: { score: Math.round(found.music_score ?? 0), rank: muRank },
        album: { score: Math.round(found.album_sales_score ?? 0), rank: alRank },
        top1_energy: top1 ? { artist: (top1.wiki_entries as any)?.title, score: Math.round(top1.energy_score ?? 0) } : null,
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

      // Search by Korean/English aliases in tier table
      const { data: koMatches } = await adminClient
        .from("v3_artist_tiers")
        .select("wiki_entry_id, display_name, name_ko")
        .or(`name_ko.ilike.%${args.query}%,display_name.ilike.%${args.query}%`)
        .limit(10);

      const titles = new Set((matches ?? []).map((m: any) => m.title));
      for (const km of koMatches ?? []) {
        if (km.name_ko) titles.add(`${km.display_name} (${km.name_ko})`);
        else if (km.display_name) titles.add(km.display_name);
      }

      // Typo-tolerant fallback (e.g., 코르티즈 → 코르티스)
      if (titles.size === 0) {
        const closest = await findClosestTierArtist(args.query);
        if (closest) {
          titles.add(
            closest.name_ko
              ? `${closest.display_name} (${closest.name_ko})`
              : (closest.display_name || args.query)
          );
        }
      }

      return JSON.stringify({ results: [...titles] });
    }

    case "manage_watched_artist": {
      const { action, artist_name } = args;
      const requestedArtistName = sanitizeArtistCandidate(String(artist_name ?? ""));
      const targetArtistName = requestedArtistName || String(artist_name ?? "").trim();

      if (action === "add") {
        if (!targetArtistName) {
          return JSON.stringify({
            success: false,
            action: "artist_not_found",
            query: String(artist_name ?? ""),
            suggestions: [],
            message: "아티스트 이름을 다시 입력해주세요.",
          });
        }

        let wikiMatch: { id: string; title: string | null }[] | null = null;
        let lookupHadError = false;

        // Step 1: Try exact title match first
        const [exactWikiEqRes, exactWikiIlikeRes] = await Promise.all([
          adminClient.from("wiki_entries").select("id, title").eq("title", targetArtistName).limit(1),
          adminClient.from("wiki_entries").select("id, title").ilike("title", targetArtistName).limit(1),
        ]);

        if (exactWikiEqRes.error || exactWikiIlikeRes.error) {
          lookupHadError = true;
          console.error("[FanAgent] Wiki exact match error:", exactWikiEqRes.error?.message || exactWikiIlikeRes.error?.message);
        }

        const exactWiki = exactWikiEqRes.data?.[0] ?? exactWikiIlikeRes.data?.[0] ?? null;
        if (exactWiki) {
          wikiMatch = [{ id: exactWiki.id, title: exactWiki.title }];
        }

        // Step 2: Try exact Korean/alias name match in tier table (no relation join dependency)
        if (!wikiMatch || wikiMatch.length === 0) {
          const [koEqRes, displayEqRes, koIlikeRes, displayIlikeRes] = await Promise.all([
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").eq("name_ko", targetArtistName).limit(1),
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").eq("display_name", targetArtistName).limit(1),
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("name_ko", targetArtistName).limit(1),
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("display_name", targetArtistName).limit(1),
          ]);

          const tierExactError = koEqRes.error || displayEqRes.error || koIlikeRes.error || displayIlikeRes.error;
          if (tierExactError) {
            lookupHadError = true;
            console.error("[FanAgent] Tier exact alias match error:", tierExactError.message);
          }

          const aliasExact =
            koEqRes.data?.[0] ??
            displayEqRes.data?.[0] ??
            koIlikeRes.data?.[0] ??
            displayIlikeRes.data?.[0] ??
            null;

          if (aliasExact?.wiki_entry_id) {
            wikiMatch = [{
              id: aliasExact.wiki_entry_id,
              title: aliasExact.display_name ?? aliasExact.name_ko ?? targetArtistName,
            }];
          }

          // Extra exact-normalized fallback (NFC/공백/특수문자 차이 보정)
          if (!wikiMatch || wikiMatch.length === 0) {
            const normalizedTarget = normalizeArtistName(targetArtistName);
            if (normalizedTarget) {
              const tierCandidates = await getTierAliasCandidates();
              const normalizedExact = tierCandidates.find((row) => {
                const variants = [row.name_ko, row.display_name]
                  .filter(Boolean)
                  .map((v: string) => normalizeArtistName(v));
                return variants.some((v) => v === normalizedTarget);
              });

              if (normalizedExact?.wiki_entry_id) {
                wikiMatch = [{
                  id: normalizedExact.wiki_entry_id,
                  title: normalizedExact.display_name ?? normalizedExact.name_ko ?? targetArtistName,
                }];
              }
            }
          }
        }

        // Step 3: Robust in-memory resolver (exact/contains/fuzzy) from tier candidates
        if (!wikiMatch || wikiMatch.length === 0) {
          const resolvedCandidate = await resolveTierArtistCandidate(targetArtistName);
          if (resolvedCandidate) {
            wikiMatch = [{
              id: resolvedCandidate.wiki_entry_id,
              title: resolvedCandidate.display_name || resolvedCandidate.wiki_title || resolvedCandidate.name_ko || targetArtistName,
            }];
          }
        }

        // Step 4: Try partial title match (e.g., "All Day" matches "All Day Project")
        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: partialMatch, error: partialTitleErr } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${targetArtistName}%`)
            .limit(1);

          if (partialTitleErr) {
            lookupHadError = true;
            console.error("[FanAgent] Wiki partial match error:", partialTitleErr.message);
          }

          if (partialMatch && partialMatch.length === 1) {
            wikiMatch = partialMatch;
          }
        }

        // Step 5: Try partial Korean/alias match (safe queries, no .or parsing)
        if (!wikiMatch || wikiMatch.length === 0) {
          const [koPartialRes, displayPartialRes] = await Promise.all([
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("name_ko", `%${targetArtistName}%`).limit(5),
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("display_name", `%${targetArtistName}%`).limit(5),
          ]);

          if (koPartialRes.error || displayPartialRes.error) {
            lookupHadError = true;
            console.error("[FanAgent] Tier partial alias match error:", koPartialRes.error?.message || displayPartialRes.error?.message);
          }

          const partialMap = new Map<string, { wiki_entry_id: string; display_name: string | null; name_ko: string | null }>();
          for (const row of [...(koPartialRes.data ?? []), ...(displayPartialRes.data ?? [])]) {
            if (!partialMap.has(row.wiki_entry_id)) {
              partialMap.set(row.wiki_entry_id, row);
            }
          }
          const aliasPartial = [...partialMap.values()];

          if (aliasPartial.length === 1) {
            wikiMatch = [{ id: aliasPartial[0].wiki_entry_id, title: aliasPartial[0].display_name }];
          } else if (aliasPartial.length > 1) {
            const suggestions = aliasPartial.map((km: any) => km.name_ko ? `${km.display_name} (${km.name_ko})` : km.display_name);
            return JSON.stringify({
              success: false,
              action: "artist_not_found",
              query: targetArtistName,
              suggestions,
              message: `"${targetArtistName}"${eulReul(targetArtistName)} 정확히 찾을 수 없어요. 혹시 이 중에 있나요? ${suggestions.join(", ")}. 정확한 이름을 말씀해주세요!`,
            });
          }
        }

        // Step 6: Typo-tolerant fallback
        if (!wikiMatch || wikiMatch.length === 0) {
          const closest = await findClosestTierArtist(targetArtistName);
          if (closest) {
            wikiMatch = [{ id: closest.wiki_entry_id, title: closest.display_name || closest.name_ko || targetArtistName }];
          }
        }

        if (!wikiMatch || wikiMatch.length === 0) {
          const { data: fuzzyMatches, error: fuzzyTitleErr } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${targetArtistName}%`)
            .limit(5);

          const [koAliasMatchesRes, displayAliasMatchesRes] = await Promise.all([
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("name_ko", `%${targetArtistName}%`).limit(5),
            adminClient.from("v3_artist_tiers").select("wiki_entry_id, display_name, name_ko").ilike("display_name", `%${targetArtistName}%`).limit(5),
          ]);

          if (fuzzyTitleErr || koAliasMatchesRes.error || displayAliasMatchesRes.error) {
            lookupHadError = true;
            console.error("[FanAgent] Fallback artist lookup error:", fuzzyTitleErr?.message || koAliasMatchesRes.error?.message || displayAliasMatchesRes.error?.message);
          }

          const aliasMap = new Map<string, { wiki_entry_id: string; display_name: string | null; name_ko: string | null }>();
          for (const row of [...(koAliasMatchesRes.data ?? []), ...(displayAliasMatchesRes.data ?? [])]) {
            if (!aliasMap.has(row.wiki_entry_id)) aliasMap.set(row.wiki_entry_id, row);
          }
          const aliasMatches = [...aliasMap.values()];

          const suggestions: string[] = [];
          for (const m of fuzzyMatches ?? []) suggestions.push(m.title);
          for (const km of aliasMatches) {
            const label = km.name_ko ? `${km.display_name} (${km.name_ko})` : km.display_name;
            if (label && !suggestions.includes(label)) suggestions.push(label);
          }

          if (suggestions.length > 0) {
            return JSON.stringify({
              success: false,
              action: "artist_not_found",
              query: targetArtistName,
              suggestions,
              message: `"${targetArtistName}"${eulReul(targetArtistName)} 정확히 찾을 수 없어요. 혹시 이 중에 있나요? ${suggestions.join(", ")}. 정확한 이름을 말씀해주세요!`,
            });
          }

          if (lookupHadError) {
            return JSON.stringify({
              success: false,
              action: "artist_lookup_failed",
              query: targetArtistName,
              suggestions: [],
              message: `"${targetArtistName}" 검색 중 일시적인 조회 오류가 발생했어요. 다시 시도해주세요.`,
            });
          }

          return JSON.stringify({
            success: false,
            action: "artist_not_in_system",
            query: targetArtistName,
            suggestions: [],
            message: `"${targetArtistName}"${eunNeun(targetArtistName)} K-TrenZ에 등록되지 않은 아티스트예요. 현재 등록된 아티스트만 최애로 설정할 수 있어요.`,
          });
        }

        const wikiId = wikiMatch[0].id;
        const resolvedName = wikiMatch[0].title || targetArtistName;

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
            query: targetArtistName,
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
        const perplexityResult = await searchWithPerplexity(`${resolvedName} K-Pop 아이돌 최근 소식 뉴스 활동`, "week", adminClient, "news", wikiId);
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
      let query = args.query;
      const recency = args.recency || "week";
      // Ensure K-Pop context to prevent unrelated results (e.g., "TWICE" → ICE news)
      const kpopKeywords = ["kpop", "k-pop", "케이팝", "아이돌", "idol", "컴백", "comeback", "앨범", "album", "콘서트", "concert"];
      const queryLower = query.toLowerCase();
      const hasKpopContext = kpopKeywords.some(k => queryLower.includes(k));
      if (!hasKpopContext) {
        query = `${query} K-Pop 아이돌`;
      }
      const result = await searchWithPerplexity(query, recency, adminClient, "general");
      if (!result) {
        return JSON.stringify({ error: "web_search_failed", message: "웹 검색에 실패했습니다. 잠시 후 다시 시도해주세요." });
      }
      return JSON.stringify({ content: result.content, citations: result.citations, source: "perplexity", _archiveId: result.archiveId });
    }

    case "get_artist_schedule": {
      const artistName = args.artist_name;
      const limit = Math.min(args.limit || 10, 20);

      // Find wiki_entry_id (try exact, then Korean name, then partial)
      let wikiId: string | null = null;
      let resolvedName = artistName;

      const { data: wikiMatch } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", artistName)
        .limit(1);

      if (wikiMatch && wikiMatch.length > 0) {
        wikiId = wikiMatch[0].id;
        resolvedName = wikiMatch[0].title;
      } else {
        // Try Korean name
        const { data: koMatch } = await adminClient
          .from("v3_artist_tiers")
          .select("wiki_entry_id, display_name")
          .ilike("name_ko", artistName)
          .limit(1);
        if (koMatch && koMatch.length > 0) {
          wikiId = koMatch[0].wiki_entry_id;
          resolvedName = koMatch[0].display_name;
        } else {
          // Partial match
          const { data: partialMatch } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${artistName}%`)
            .limit(1);
          if (partialMatch && partialMatch.length > 0) {
            wikiId = partialMatch[0].id;
            resolvedName = partialMatch[0].title;
          }
        }
      }

      // Query ktrenz_schedules by wiki_entry_id or artist_name
      const today = new Date().toISOString().split("T")[0];
      let scheduleQuery = adminClient
        .from("ktrenz_schedules")
        .select("*")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(limit);

      if (wikiId) {
        scheduleQuery = scheduleQuery.eq("wiki_entry_id", wikiId);
      } else {
        scheduleQuery = scheduleQuery.ilike("artist_name", `%${artistName}%`);
      }

      const { data: schedules } = await scheduleQuery;

      if (!schedules || schedules.length === 0) {
        // Fallback: search web for schedule info
        const perplexityResult = await searchWithPerplexity(
          `${resolvedName} K-Pop 아이돌 다가오는 일정 스케줄 컴백`,
          "week",
          adminClient,
          "schedule",
          wikiId,
        );
        if (perplexityResult) {
          return JSON.stringify({
            artist: resolvedName,
            schedules: [],
            web_search_result: perplexityResult.content,
            citations: perplexityResult.citations,
            source: "perplexity",
            message: `DB에 등록된 일정은 없지만, 웹 검색으로 ${resolvedName}의 일정 정보를 찾았습니다.`,
            _archiveId: perplexityResult.archiveId,
          });
        }
        return JSON.stringify({
          artist: resolvedName,
          schedules: [],
          message: `${resolvedName}의 다가오는 일정이 아직 등록되지 않았어요.`,
        });
      }

      const events = schedules.map((s: any) => ({
        title: s.title,
        date: s.event_date,
        time: s.event_time ?? null,
        category: s.category,
      }));

      // Category emoji map for display
      const catEmoji: Record<string, string> = {
        release: "💿", celebration: "🎉", broadcast: "📡",
        purchase: "🛍️", event: "✨", sns: "💬", others: "📅",
      };

      return JSON.stringify({
        artist: resolvedName,
        schedules: events,
        total: events.length,
        category_emoji: catEmoji,
        message: `${resolvedName}의 다가오는 일정 ${events.length}건을 찾았습니다.`,
      });
    }

    case "get_trend_keywords": {
      const artistName = args.artist_name;
      const limit = Math.min(args.limit || 10, 20);

      // Resolve wiki_entry_id
      let wikiId: string | null = null;
      let resolvedName = artistName;

      const { data: wikiMatch } = await adminClient
        .from("wiki_entries")
        .select("id, title")
        .ilike("title", artistName)
        .limit(1);

      if (wikiMatch && wikiMatch.length > 0) {
        wikiId = wikiMatch[0].id;
        resolvedName = wikiMatch[0].title;
      } else {
        const { data: koMatch } = await adminClient
          .from("v3_artist_tiers")
          .select("wiki_entry_id, display_name")
          .ilike("name_ko", artistName)
          .limit(1);
        if (koMatch && koMatch.length > 0) {
          wikiId = koMatch[0].wiki_entry_id;
          resolvedName = koMatch[0].display_name;
        } else {
          const { data: partialMatch } = await adminClient
            .from("wiki_entries")
            .select("id, title")
            .ilike("title", `%${artistName}%`)
            .limit(1);
          if (partialMatch && partialMatch.length > 0) {
            wikiId = partialMatch[0].id;
            resolvedName = partialMatch[0].title;
          }
        }
      }

      if (!wikiId) {
        return JSON.stringify({ error: "artist_not_found", message: `"${artistName}" 아티스트를 찾을 수 없어요.` });
      }

      // Query active trend triggers for this artist
      const { data: triggers } = await adminClient
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, keyword_category, context, context_ko, influence_index, confidence, source_url, source_title, source_image_url, trigger_source, detected_at, peak_score, baseline_score, status")
        .eq("wiki_entry_id", wikiId)
        .eq("status", "active")
        .order("influence_index", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (!triggers || triggers.length === 0) {
        // Also try by star_id (some triggers use star_id)
        const { data: starTriggers } = await adminClient
          .from("ktrenz_trend_triggers")
          .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, keyword_category, context, context_ko, influence_index, confidence, source_url, source_title, source_image_url, trigger_source, detected_at, peak_score, baseline_score, status, artist_name")
          .eq("status", "active")
          .ilike("artist_name", `%${resolvedName}%`)
          .order("influence_index", { ascending: false, nullsFirst: false })
          .limit(limit);

        if (!starTriggers || starTriggers.length === 0) {
          return JSON.stringify({
            artist: resolvedName,
            keywords: [],
            message: `${resolvedName}에게 현재 감지된 트렌드 키워드가 없어요.`,
          });
        }

        // Get tracking data for these triggers
        const triggerIds = starTriggers.map((t: any) => t.id);
        const { data: trackingData } = await adminClient
          .from("ktrenz_trend_tracking")
          .select("trigger_id, interest_score, search_volume, delta_pct, tracked_at")
          .in("trigger_id", triggerIds)
          .order("tracked_at", { ascending: false });

        const trackingMap = new Map<string, any>();
        for (const t of trackingData ?? []) {
          if (!trackingMap.has(t.trigger_id)) trackingMap.set(t.trigger_id, t);
        }

        const keywords = starTriggers.map((t: any) => {
          const tracking = trackingMap.get(t.id);
          return {
            keyword: t.keyword,
            keyword_ko: t.keyword_ko,
            category: t.keyword_category,
            context: t.context_ko || t.context,
            influence_index: t.influence_index,
            confidence: t.confidence,
            source: t.trigger_source,
            source_title: t.source_title,
            source_url: t.source_url,
            detected_at: t.detected_at,
            search_volume: tracking?.search_volume ?? null,
            interest_score: tracking?.interest_score ?? null,
            delta_pct: tracking?.delta_pct ?? null,
          };
        });

        return JSON.stringify({
          artist: resolvedName,
          keywords,
          total: keywords.length,
          message: `${resolvedName}의 활성 트렌드 키워드 ${keywords.length}건을 찾았습니다.`,
        });
      }

      // Get tracking data for these triggers
      const triggerIds = triggers.map((t: any) => t.id);
      const { data: trackingData } = await adminClient
        .from("ktrenz_trend_tracking")
        .select("trigger_id, interest_score, search_volume, delta_pct, tracked_at")
        .in("trigger_id", triggerIds)
        .order("tracked_at", { ascending: false });

      const trackingMap = new Map<string, any>();
      for (const t of trackingData ?? []) {
        if (!trackingMap.has(t.trigger_id)) trackingMap.set(t.trigger_id, t);
      }

      const keywords = triggers.map((t: any) => {
        const tracking = trackingMap.get(t.id);
        return {
          keyword: t.keyword,
          keyword_ko: t.keyword_ko,
          category: t.keyword_category,
          context: t.context_ko || t.context,
          influence_index: t.influence_index,
          confidence: t.confidence,
          source: t.trigger_source,
          source_title: t.source_title,
          source_url: t.source_url,
          detected_at: t.detected_at,
          search_volume: tracking?.search_volume ?? null,
          interest_score: tracking?.interest_score ?? null,
          delta_pct: tracking?.delta_pct ?? null,
        };
      });

      return JSON.stringify({
        artist: resolvedName,
        keywords,
        total: keywords.length,
        message: `${resolvedName}의 활성 트렌드 키워드 ${keywords.length}건을 찾았습니다.`,
      });
    }

    case "get_trending_now": {
      const limit = Math.min(args.limit || 10, 30);
      const category = args.category || null;

      let query = adminClient
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, keyword_category, artist_name, wiki_entry_id, context, context_ko, influence_index, confidence, source_url, source_title, source_image_url, trigger_source, detected_at, peak_score, baseline_score")
        .eq("status", "active")
        .order("influence_index", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (category) {
        query = query.eq("keyword_category", category);
      }

      const { data: triggers } = await query;

      if (!triggers || triggers.length === 0) {
        return JSON.stringify({
          keywords: [],
          message: "현재 활성화된 트렌드 키워드가 없어요.",
        });
      }

      // Get tracking data
      const triggerIds = triggers.map((t: any) => t.id);
      const { data: trackingData } = await adminClient
        .from("ktrenz_trend_tracking")
        .select("trigger_id, interest_score, search_volume, delta_pct, tracked_at")
        .in("trigger_id", triggerIds)
        .order("tracked_at", { ascending: false });

      const trackingMap = new Map<string, any>();
      for (const t of trackingData ?? []) {
        if (!trackingMap.has(t.trigger_id)) trackingMap.set(t.trigger_id, t);
      }

      const keywords = triggers.map((t: any) => {
        const tracking = trackingMap.get(t.id);
        return {
          keyword: t.keyword,
          keyword_ko: t.keyword_ko,
          category: t.keyword_category,
          artist: t.artist_name,
          context: t.context_ko || t.context,
          influence_index: t.influence_index,
          confidence: t.confidence,
          source: t.trigger_source,
          source_title: t.source_title,
          detected_at: t.detected_at,
          search_volume: tracking?.search_volume ?? null,
          interest_score: tracking?.interest_score ?? null,
          delta_pct: tracking?.delta_pct ?? null,
        };
      });

      // Group by category for summary
      const categoryCounts: Record<string, number> = {};
      for (const k of keywords) {
        categoryCounts[k.category] = (categoryCounts[k.category] || 0) + 1;
      }

      return JSON.stringify({
        keywords,
        total: keywords.length,
        category_breakdown: categoryCounts,
        message: `현재 활성 트렌드 키워드 ${keywords.length}건을 찾았습니다.`,
      });
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
          { role: "system", content: "너는 K-Pop 전문 검색 에이전트야. 오직 K-Pop 아이돌, 한국 음악 산업, 엔터테인먼트 관련 정보만 검색하고 요약해. 동음이의어나 관련 없는 결과(예: 'TWICE'를 검색할 때 미국 ICE 뉴스 등)는 절대 포함하지 마. 항상 K-Pop 아티스트 맥락으로 해석해. 한국어로 간결하게 핵심 사실만 5-8줄 이내로 요약해줘." },
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
- 유저가 다른 아티스트와 비교를 요청하면: compare_artists 도구로 데이터를 가져오되, 철저하게 ${artistName} 편을 들어야 해. 중립적이거나 객관적인 척 하지 마!
- 비교 응답 톤 (편파적 팬 매니저):
  * ${artistName}${iGa(artistName)} 수치가 높은 항목: "역시 우리 ${artistName}! 이 분야에서 압도적이에요! 🔥" 처럼 자랑스럽게
  * ${artistName}${iGa(artistName)} 수치가 낮은 항목: 절대 "뒤처진다", "낮다"라고 말하지 마. 대신 "이건 우리가 더 밀어줘야 할 부분이에요! 팬들이 힘을 모으면 금방 따라잡을 수 있어요! 💪" 또는 "수치로는 아직이지만, 우리 ${artistName}의 진짜 매력은 숫자로 측정할 수 없죠! ✨"
  * 상대가 전체적으로 높더라도: "숫자가 전부가 아니에요! 우리 ${artistName}만의 독보적인 매력과 팬덤의 힘을 믿어요! 같이 끌어올려봐요! 🚀"
  * 절대 상대 아티스트를 칭찬하거나 인정하는 톤을 쓰지 마. 항상 ${artistName} 중심으로 해석해
- lookup_artist, get_artist_news, get_streaming_guide 도구는 ${artistName} 또는 비교 목적일 때만 사용해. 다른 아티스트 단독 조회는 거부해.
- get_rankings 도구는 사용 가능하지만, 랭킹 데이터는 프론트엔드에서 카드로 자동 렌더링됨. 절대 텍스트로 순위 목록을 나열하지 마! ${artistName}의 위치와 한 줄 코멘트만 짧게 해줘

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
- 유저가 랭킹, 순위를 물으면 get_rankings 도구를 호출해. ⚠️ 랭킹 데이터는 프론트엔드에서 자동으로 카드 UI로 렌더링되므로, 절대로 텍스트로 순위 목록/표/번호를 나열하지 마! 아티스트 이름, 순위 번호, 점수를 텍스트로 반복하면 중복이 되어 유저 경험이 나빠짐. 텍스트 응답은 1~2문장의 짧은 코멘트만 해 (예: "현재 1위는 ○○이고, 우리 ○○는 N위에 있어요! 💪"). 절대 5줄 이상 쓰지 마!
- 추측하지 말고 항상 도구로 확인한 데이터를 기반으로 답변해
- ⛔ 다른 아티스트 단독 조회 금지: lookup_artist, get_artist_news, get_streaming_guide는 최애 아티스트 또는 비교 맥락에서만 사용. 유저가 다른 아티스트만 단독으로 물으면 "저는 {최애} 전담이에요!"라고 안내
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
- 모르는 건 모른다고 솔직히

📊 수치 표현 규칙 (매우 중요 — 유저 가독성):
- 원시 점수(예: "Buzz 점수 3110", "Music 632")는 유저에게 와닿지 않아. 절대 원시 점수를 그대로 나열하지 마!
- 대신 아래 방식으로 변환해서 표현해:
  * 순위/등수: "Buzz 전체 **#5위**", "Music 카테고리 **상위 12%**"
  * 상대 비교: "평균 대비 **2.3배** 높은 수준", "1위와 **340점 차이**"
  * 변화율: "어제보다 **+54.4%** 급등!", "지난주 대비 **2배** 성장"
  * 경쟁 비교: "IVE보다 **1.5배** 높은 Buzz!", "Top 3 진입까지 **에너지 120 필요**"
  * 의미 해석: "팬덤 활동이 매우 활발한 상태", "차트 인입 직전 수준"
- 반드시 **숫자에 맥락을 붙여야** 해. "3110"이 아니라 "전체 5위 수준의 높은 Buzz"
- 순위, 퍼센트(%), 배수(x배), 비교(vs) 위주로 수치를 전달해
- 원시 점수를 언급해야 할 때는 반드시 해석을 함께: "Energy **4,230** (전체 #8위, 상위 10%)"
- 카테고리별 점수를 나열하지 말고, 가장 강한 항목과 약한 항목만 하이라이트해:
  ❌ "YouTube 2500, Buzz 3110, Music 632, Album 400"
  ✅ "**Buzz가 가장 강해요** (#5위)! 반면 Album은 아직 성장 여지가 있어요 — 팬들이 앨범 스밍을 밀어주면 금방 올라갈 수 있어요! 💪"
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
    const { messages, mode, language, agent_slot_id, quick_action } = body;
    const userLang = language || "ko";

    const quickActionRaw = typeof quick_action === "string" ? quick_action.trim().toLowerCase() : "";
    const quickActionHintMap: Record<string, "live_rankings" | "trend_analysis" | "streaming_guide" | "fan_activity"> = {
      live_rankings: "live_rankings",
      rankings: "live_rankings",
      liverankings: "live_rankings",
      trend_analysis: "trend_analysis",
      trendanalysis: "trend_analysis",
      streaming_guide: "streaming_guide",
      streamingguide: "streaming_guide",
      fan_activity: "fan_activity",
      fanactivity: "fan_activity",
    };
    const quickActionHint = quickActionRaw ? quickActionHintMap[quickActionRaw] ?? null : null;
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
    const collectedMeta: { guideData?: any[]; rankingData?: any[]; quickActions?: any[]; biasArtist?: string; followUps?: string[]; reportCards?: any[]; knowledgeArchiveIds: string[] } = { knowledgeArchiveIds: [] };

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
        const result = await handleTool("get_rankings", { limit: 50 }, adminClient, userId, rankingCache, activeSlotId, activeSlotIndex);
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
    const normalizedLastUserText = typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content.replace(/\s+/g, " ").trim().toLowerCase()
      : "";
    const isLiveRankingPrompt = [
      "실시간 트렌드 랭킹 top 10 보여줘",
      "실시간 랭킹 top 10 보여줘",
      "show me the live trend rankings top 10",
      "show me the live rankings top 10",
    ].includes(normalizedLastUserText);

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
    let milestoneContext = "";
    if (activeSlotWikiEntryId && activeSlotArtistName) {
      // Slot has an artist — use slot's artist as the bias context
      watchedContext = `\n\n🎯 이 에이전트 슬롯의 최애 아티스트: ${activeSlotArtistName}\n- 모든 답변에서 이 아티스트를 우선으로 언급하고, 이 아티스트의 팬 입장에서 응원·전략·소식을 제공해\n- 아티스트 이름을 다시 물어보지 마. 이미 알고 있으니까.\n- 유저가 특정 아티스트를 지정하지 않으면 최애 아티스트 기준으로 답변해\n- "관심 아티스트 목록"이라는 표현 절대 쓰지 마. 이 에이전트는 하나의 최애만 담당해`;

      // Check for unnotified milestone events (e.g., Billboard first entry)
      const { data: milestones } = await adminClient
        .from("ktrenz_milestone_events")
        .select("id, event_type, event_data, created_at")
        .eq("wiki_entry_id", activeSlotWikiEntryId)
        .eq("notified", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (milestones && milestones.length > 0) {
        const eventDescriptions = milestones.map((m: any) => {
          if (m.event_type === "billboard_first_entry") {
            return `🎉 스페셜 이벤트! ${activeSlotArtistName}${iGa(activeSlotArtistName)} ${m.event_data.chart_name}에 첫 진입했어! #${m.event_data.position} "${m.event_data.song_or_album}"`;
          }
          return `🎉 마일스톤: ${m.event_type}`;
        });
        milestoneContext = `\n\n🏆 축하 이벤트 (반드시 이번 대화에서 축하해줘!):\n${eventDescriptions.join("\n")}\n- 이 소식을 매우 열정적으로, 팬으로서 진심으로 축하해줘!\n- 이모지를 많이 사용하고, 팬들의 노력을 칭찬하며, 앞으로의 전망도 제시해!`;

        // Mark as notified
        const milestoneIds = milestones.map((m: any) => m.id);
        await adminClient
          .from("ktrenz_milestone_events")
          .update({ notified: true })
          .in("id", milestoneIds);
      }
    } else {
      // No artist on this slot — tell AI to ask which artist to set
      watchedContext = `\n\n⚠️ 이 에이전트 슬롯에는 아직 최애 아티스트가 설정되지 않았어.\n- 유저가 최애를 설정하겠다고 하면, 반드시 "어떤 아티스트를 최애로 설정할까요?" 라고 물어봐.\n- 절대 다른 슬롯이나 이전 데이터를 참고해서 임의로 아티스트를 설정하지 마!\n- 유저가 명시적으로 아티스트 이름을 말할 때까지 manage_watched_artist 도구를 호출하지 마.`;
    }

    // Build OpenAI messages
    const openaiMessages: any[] = [
      { role: "system", content: getSystemPrompt(userLang, activeSlotArtistName) + watchedContext + milestoneContext },
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
      get_trend_keywords: { en: "Scanning trend keywords…", ko: "트렌드 키워드를 분석하고 있어요…", ja: "トレンドキーワードを分析中…", zh: "正在分析趋势关键词…" },
      get_trending_now: { en: "Checking what's trending…", ko: "지금 뜨는 트렌드를 확인하고 있어요…", ja: "今のトレンドを確認中…", zh: "正在查看当前趋势…" },
    };
    const thinkingLabels: Record<string, string> = { en: "Analyzing your question…", ko: "질문을 분석하고 있어요…", ja: "質問を分析中…", zh: "正在分析您的问题…" };
    const writingLabels: Record<string, string> = { en: "Writing response…", ko: "답변을 작성하고 있어요…", ja: "回答を作成中…", zh: "正在撰写回答…" };

    function sendStatus(controller: ReadableStreamDefaultController, label: string) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: label })}\n\n`));
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Forced bias artist detection (for direct registration prompts)
          let forcedBiasArtist: string | null = null;
          // Initial "thinking" status
          sendStatus(controller, thinkingLabels[userLang] || thinkingLabels.en);

          // Fast-path for quick action buttons to reduce latency and force distinct card types
          const shouldForceLiveRankings = quickActionHint === "live_rankings" || isLiveRankingPrompt;
          if (shouldForceLiveRankings) {
            const rankingLabel = toolStatusMap.get_rankings?.[userLang] || toolStatusMap.get_rankings?.en || "Checking rankings…";
            sendStatus(controller, rankingLabel);

            const rankingResult = await handleTool("get_rankings", { limit: 10 }, adminClient, userId, rankingCache, activeSlotId, activeSlotIndex);
            let rankingContent = userLang === "ko"
              ? "실시간 Top 10 카드를 가져왔어요!"
              : "I pulled the real-time Top 10 card.";

            try {
              const parsed = JSON.parse(rankingResult);
              if (parsed.rankings) {
                collectedMeta.rankingData = parsed.rankings.slice(0, 10).map((item: any) => ({
                  rank: item.rank,
                  artist_name: item.artist,
                  image_url: null,
                  total_score: item.total_score ?? 0,
                  energy_score: item.energy_score ?? 0,
                  energy_change_24h: item.energy_change_24h ?? 0,
                  youtube_score: item.youtube_score ?? 0,
                  buzz_score: item.buzz_score ?? 0,
                }));

                const biasRank = activeSlotArtistName
                  ? parsed.rankings.find((item: any) =>
                      String(item.artist || "").toLowerCase() === String(activeSlotArtistName).toLowerCase()
                    )
                  : null;

                if (userLang === "ko") {
                  rankingContent = biasRank
                    ? `실시간 Top 10 카드를 준비했어요! 우리 ${activeSlotArtistName}${eunNeun(activeSlotArtistName)} 현재 #${biasRank.rank}예요.`
                    : "실시간 Top 10 카드를 준비했어요!";
                } else if (userLang === "ja") {
                  rankingContent = biasRank
                    ? `リアルタイムTop10カードを用意しました！あなたの推しは現在 #${biasRank.rank} です。`
                    : "リアルタイムTop10カードを用意しました！";
                } else if (userLang === "zh") {
                  rankingContent = biasRank
                    ? `已准备实时 Top10 卡片！你的本命目前是 #${biasRank.rank}。`
                    : "已准备实时 Top10 卡片！";
                } else {
                  rankingContent = biasRank
                    ? `Top 10 card is ready. Your bias is currently #${biasRank.rank}.`
                    : "Top 10 card is ready.";
                }
              }
            } catch {
              // keep fallback content
            }

            const rankingMetaToSave: any = {};
            if (collectedMeta.rankingData) rankingMetaToSave.rankingData = collectedMeta.rankingData;

            await adminClient.from("ktrenz_fan_agent_messages").insert({
              user_id: userId,
              agent_slot_id: activeSlotId,
              role: "assistant",
              content: rankingContent,
              metadata: Object.keys(rankingMetaToSave).length > 0 ? rankingMetaToSave : null,
            });

            sendStatus(controller, writingLabels[userLang] || writingLabels.en);
            for (let i = 0; i < rankingContent.length; i += 20) {
              const chunk = rankingContent.slice(i, i + 20);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
            }

            if (collectedMeta.rankingData) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { rankingData: collectedMeta.rankingData } })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            extractAndStoreIntent(
              adminClient,
              OPENAI_API_KEY,
              userId,
              lastUserMsg?.content || "",
              activeSlotWikiEntryId,
              activeSlotId,
              ["get_rankings"],
              collectedMeta.knowledgeArchiveIds,
            ).catch((e: any) => console.error("[IntentExtract] Error:", e));

            return;
          }

          if (quickActionHint === "trend_analysis") {
            if (!activeSlotArtistName) {
              const emptyTrendContent = userLang === "ko"
                ? "먼저 최애 아티스트를 설정해주시면, 해당 아티스트 기준으로 트렌드 분석 카드를 바로 보여드릴게요."
                : "Set your bias artist first, then I can show a dedicated trend analysis card.";

              await adminClient.from("ktrenz_fan_agent_messages").insert({
                user_id: userId,
                agent_slot_id: activeSlotId,
                role: "assistant",
                content: emptyTrendContent,
                metadata: null,
              });

              sendStatus(controller, writingLabels[userLang] || writingLabels.en);
              for (let i = 0; i < emptyTrendContent.length; i += 20) {
                const chunk = emptyTrendContent.slice(i, i + 20);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const lookupLabel = toolStatusMap.lookup_artist?.[userLang] || toolStatusMap.lookup_artist?.en || "Looking up artist data…";
            sendStatus(controller, lookupLabel);

            const trendResult = await handleTool(
              "lookup_artist",
              { artist_name: activeSlotArtistName },
              adminClient,
              userId,
              rankingCache,
              activeSlotId,
              activeSlotIndex,
            );

            let trendContent = userLang === "ko"
              ? `우리 ${activeSlotArtistName} 상세 트렌드 분석 카드를 준비했어요!`
              : `I prepared a detailed trend analysis card for ${activeSlotArtistName}.`;

            try {
              const parsed = JSON.parse(trendResult);
              if (parsed.artist && !parsed.error) {
                const categories = [
                  { key: "youtube", label: "YouTube", score: parsed.youtube?.score ?? 0, rank: parsed.youtube?.rank ?? 0 },
                  { key: "buzz", label: "Buzz", score: parsed.buzz?.score ?? 0, rank: parsed.buzz?.rank ?? 0 },
                  { key: "music", label: "Music", score: parsed.music?.score ?? 0, rank: parsed.music?.rank ?? 0 },
                  { key: "album", label: "Album", score: parsed.album?.score ?? 0, rank: parsed.album?.rank ?? 0 },
                ];
                const strongest = [...categories].sort((a, b) => a.rank - b.rank)[0];
                const weakest = [...categories].sort((a, b) => b.rank - a.rank)[0];

                collectedMeta.reportCards = [{
                  type: "artist_report",
                  artist: parsed.artist,
                  rank: parsed.rank,
                  totalArtists: parsed.total_artists ?? 50,
                  energy: {
                    score: parsed.energy_score ?? 0,
                    change24h: parsed.energy_change_24h ?? 0,
                  },
                  categories,
                  strongest,
                  weakest,
                  tier: parsed.tier ?? null,
                }];

                if (userLang === "ko") {
                  trendContent = `우리 ${parsed.artist}${eunNeun(parsed.artist)} 현재 #${parsed.rank}예요. 강점은 ${strongest.label}, 보완 포인트는 ${weakest.label}예요.`;
                } else if (userLang === "ja") {
                  trendContent = `${parsed.artist} は現在 #${parsed.rank}。強みは ${strongest.label}、改善ポイントは ${weakest.label} です。`;
                } else if (userLang === "zh") {
                  trendContent = `${parsed.artist} 当前排名 #${parsed.rank}，优势是 ${strongest.label}，补强点是 ${weakest.label}。`;
                } else {
                  trendContent = `${parsed.artist} is now #${parsed.rank}. Strongest is ${strongest.label}, and the main gap is ${weakest.label}.`;
                }
              }
            } catch {
              // keep fallback content
            }

            const trendMetaToSave: any = {};
            if (collectedMeta.reportCards) trendMetaToSave.reportCards = collectedMeta.reportCards;

            await adminClient.from("ktrenz_fan_agent_messages").insert({
              user_id: userId,
              agent_slot_id: activeSlotId,
              role: "assistant",
              content: trendContent,
              metadata: Object.keys(trendMetaToSave).length > 0 ? trendMetaToSave : null,
            });

            sendStatus(controller, writingLabels[userLang] || writingLabels.en);
            for (let i = 0; i < trendContent.length; i += 20) {
              const chunk = trendContent.slice(i, i + 20);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
            }

            if (collectedMeta.reportCards) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { reportCards: collectedMeta.reportCards } })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            extractAndStoreIntent(
              adminClient,
              OPENAI_API_KEY,
              userId,
              lastUserMsg?.content || "",
              activeSlotWikiEntryId,
              activeSlotId,
              ["lookup_artist"],
              collectedMeta.knowledgeArchiveIds,
            ).catch((e: any) => console.error("[IntentExtract] Error:", e));

            return;
          }

          if (quickActionHint === "streaming_guide") {
            if (!activeSlotArtistName) {
              const emptyContent = userLang === "ko"
                ? "먼저 최애 아티스트를 설정해주시면, 맞춤 스트리밍 가이드 카드를 바로 보여드릴게요."
                : "Set your bias artist first, then I can show a streaming guide card.";

              await adminClient.from("ktrenz_fan_agent_messages").insert({
                user_id: userId, agent_slot_id: activeSlotId, role: "assistant", content: emptyContent, metadata: null,
              });

              sendStatus(controller, writingLabels[userLang] || writingLabels.en);
              for (let i = 0; i < emptyContent.length; i += 20) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: emptyContent.slice(i, i + 20) } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const guideLabel = toolStatusMap.get_streaming_guide?.[userLang] || toolStatusMap.get_streaming_guide?.en || "Building streaming guide…";
            sendStatus(controller, guideLabel);

            const guideResult = await handleTool(
              "get_streaming_guide",
              { artist_name: activeSlotArtistName },
              adminClient, userId, rankingCache, activeSlotId, activeSlotIndex,
            );

            let guideContent = userLang === "ko"
              ? `우리 ${activeSlotArtistName} 스트리밍 가이드 카드를 준비했어요! 🎵`
              : `Streaming guide card for ${activeSlotArtistName} is ready! 🎵`;

            try {
              const parsed = JSON.parse(guideResult);
              if (parsed.guide && !parsed.error) {
                collectedMeta.guideData = [{ artist_name: parsed.artist || activeSlotArtistName, guide_data: parsed.guide }];

                const g = parsed.guide;
                if (userLang === "ko") {
                  const momentumLabel = g.momentum === "rising" ? "상승세" : g.momentum === "declining" ? "하락세" : "안정세";
                  guideContent = `우리 ${parsed.artist || activeSlotArtistName} 스밍 가이드예요! 현재 ${momentumLabel}${g.current_rank ? ` (#${g.current_rank})` : ""}이에요. 🎵`;
                } else if (userLang === "ja") {
                  guideContent = `${parsed.artist || activeSlotArtistName} のストリーミングガイドです！${g.current_rank ? `現在 #${g.current_rank}` : ""} 🎵`;
                } else if (userLang === "zh") {
                  guideContent = `${parsed.artist || activeSlotArtistName} 的流媒体指南已就绪！${g.current_rank ? `当前排名 #${g.current_rank}` : ""} 🎵`;
                } else {
                  guideContent = `Streaming guide for ${parsed.artist || activeSlotArtistName} is ready!${g.current_rank ? ` Currently #${g.current_rank}.` : ""} 🎵`;
                }
              }
            } catch {
              // keep fallback
            }

            const guideMetaToSave: any = {};
            if (collectedMeta.guideData) guideMetaToSave.guideData = collectedMeta.guideData;

            await adminClient.from("ktrenz_fan_agent_messages").insert({
              user_id: userId, agent_slot_id: activeSlotId, role: "assistant",
              content: guideContent,
              metadata: Object.keys(guideMetaToSave).length > 0 ? guideMetaToSave : null,
            });

            sendStatus(controller, writingLabels[userLang] || writingLabels.en);
            for (let i = 0; i < guideContent.length; i += 20) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: guideContent.slice(i, i + 20) } }] })}\n\n`));
            }

            if (collectedMeta.guideData) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: { guideData: collectedMeta.guideData } })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            extractAndStoreIntent(
              adminClient, OPENAI_API_KEY, userId, lastUserMsg?.content || "",
              activeSlotWikiEntryId, activeSlotId, ["get_streaming_guide"],
              collectedMeta.knowledgeArchiveIds,
            ).catch((e: any) => console.error("[IntentExtract] Error:", e));

            return;
          }

          if (quickActionHint === "fan_activity") {
            if (!activeSlotArtistName) {
              const emptyContent = userLang === "ko"
                ? "먼저 최애 아티스트를 설정해주시면, 맞춤 팬활동을 추천해드릴게요!"
                : "Set your bias artist first, then I can recommend fan activities!";

              await adminClient.from("ktrenz_fan_agent_messages").insert({
                user_id: userId, agent_slot_id: activeSlotId, role: "assistant", content: emptyContent, metadata: null,
              });

              sendStatus(controller, writingLabels[userLang] || writingLabels.en);
              for (let i = 0; i < emptyContent.length; i += 20) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: emptyContent.slice(i, i + 20) } }] })}\n\n`));
              }
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            const actLabel = toolStatusMap.get_fan_activity?.[userLang] || toolStatusMap.get_fan_activity?.en || "Preparing fan activity…";
            sendStatus(controller, actLabel);

            const actResult = await handleTool(
              "get_fan_activity",
              { artist_name: activeSlotArtistName },
              adminClient, userId, rankingCache, activeSlotId, activeSlotIndex,
            );

            let actContent = "";
            try {
              const parsed = JSON.parse(actResult);
              if (parsed.error) {
                actContent = parsed.message || "팬활동을 불러올 수 없습니다.";
              } else {
                const act = parsed.activity;
                const rankStr = parsed.rank ? ` #${parsed.rank}` : "";
                const energyStr = parsed.energy_score ? ` ⚡${parsed.energy_score}` : "";
                const changeStr = parsed.energy_change_24h != null
                  ? (parsed.energy_change_24h > 0 ? ` (+${parsed.energy_change_24h})` : ` (${parsed.energy_change_24h})`)
                  : "";
                const progress = `${parsed.completed_today || 0}/${parsed.total_activities || 8}`;

                if (userLang === "ko") {
                  actContent = `**${parsed.artist}**${rankStr}${energyStr}${changeStr}\n\n`;
                  actContent += `${act.emoji} **${act.activity}**\n`;
                  actContent += `${act.description}\n\n`;
                  if (parsed.content_card_markdown) {
                    actContent += `${parsed.content_card_markdown}\n\n`;
                  }
                  actContent += `💡 ${act.tip}\n\n`;
                  if (parsed.extra_cards_markdown) {
                    actContent += `${parsed.extra_cards_markdown}\n\n`;
                  }
                  actContent += `📊 오늘 진행: ${progress}`;
                } else {
                  actContent = `**${parsed.artist}**${rankStr}${energyStr}${changeStr}\n\n`;
                  actContent += `${act.emoji} **${act.activity}**\n`;
                  actContent += `${act.description}\n\n`;
                  if (parsed.content_card_markdown) {
                    actContent += `${parsed.content_card_markdown}\n\n`;
                  }
                  actContent += `💡 ${act.tip}\n\n`;
                  if (parsed.extra_cards_markdown) {
                    actContent += `${parsed.extra_cards_markdown}\n\n`;
                  }
                  actContent += `📊 Today's progress: ${progress}`;
                }
              }
            } catch {
              actContent = actResult;
            }

            await adminClient.from("ktrenz_fan_agent_messages").insert({
              user_id: userId, agent_slot_id: activeSlotId, role: "assistant",
              content: actContent, metadata: null,
            });

            sendStatus(controller, writingLabels[userLang] || writingLabels.en);
            for (let i = 0; i < actContent.length; i += 20) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: actContent.slice(i, i + 20) } }] })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            extractAndStoreIntent(
              adminClient, OPENAI_API_KEY, userId, lastUserMsg?.content || "",
              activeSlotWikiEntryId, activeSlotId, ["get_fan_activity"],
              collectedMeta.knowledgeArchiveIds,
            ).catch((e: any) => console.error("[IntentExtract] Error:", e));

            return;
          }


          if (forcedBiasArtist) {
            const updatingLabel = toolStatusMap.manage_watched_artist?.[userLang] || toolStatusMap.manage_watched_artist?.en || "Updating your artist…";
            sendStatus(controller, updatingLabel);

            const forcedResult = await handleTool(
              "manage_watched_artist",
              { action: "add", artist_name: forcedBiasArtist },
              adminClient,
              userId,
              rankingCache,
              activeSlotId,
              activeSlotIndex,
            );

            let forcedContent = "";
            try {
              const parsed = JSON.parse(forcedResult);
              if (parsed.success && parsed.action === "set_bias" && parsed.quick_actions) {
                collectedMeta.quickActions = parsed.quick_actions;
                collectedMeta.biasArtist = parsed.artist;
                if (userLang === "ko") {
                  forcedContent = `✨ **${parsed.artist}**${eulReul(parsed.artist)} 최애 아티스트로 설정했어요!\n\n이제 팬활동을 시작해 볼까요? 💜\n\n아래 카드를 눌러 바로 시작해보세요!`;
                } else if (userLang === "ja") {
                  forcedContent = `✨ **${parsed.artist}** を推しアーティストに設定しました！\n\nファン活動を始めましょうか？💜\n\n下のカードをタップしてすぐ始められます！`;
                } else if (userLang === "zh") {
                  forcedContent = `✨ 已将 **${parsed.artist}** 设为你的本命艺人！\n\n现在开始粉丝活动吧？💜\n\n点击下方卡片即可马上开始！`;
                } else {
                  forcedContent = `✨ **${parsed.artist}** is now set as your bias artist!\n\nReady to start fan activities? 💜\n\nTap the cards below to begin right away!`;
                }
              } else {
                forcedContent = parsed.message || parsed.error || "요청을 처리했어요.";
              }
            } catch {
              forcedContent = forcedResult;
            }

            if (!forcedContent) {
              forcedContent = userLang === "ko" ? "아티스트 설정을 처리했어요." : "Your artist setting has been updated.";
            }

            await adminClient.from("ktrenz_fan_agent_messages").insert({
              user_id: userId,
              agent_slot_id: activeSlotId,
              role: "assistant",
              content: forcedContent,
            });

            sendStatus(controller, writingLabels[userLang] || writingLabels.en);

            const chunkSize = 20;
            for (let i = 0; i < forcedContent.length; i += chunkSize) {
              const chunk = forcedContent.slice(i, i + chunkSize);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`));
            }

            const hasForcedMeta = collectedMeta.quickActions && collectedMeta.quickActions.length > 0;
            if (hasForcedMeta) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: collectedMeta })}\n\n`));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            extractAndStoreIntent(
              adminClient,
              OPENAI_API_KEY,
              userId,
              lastUserMsg?.content || "",
              activeSlotWikiEntryId,
              activeSlotId,
              ["manage_watched_artist"],
              collectedMeta.knowledgeArchiveIds,
            ).catch((e: any) => console.error("[IntentExtract] Error:", e));

            return;
          }

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
                   get_trend_keywords: ["트렌드 키워드 상세 보기", "아티스트 분석 보기", "핫 트렌드 확인"],
                   get_trending_now: ["아티스트별 키워드 보기", "순위 확인하기", "뉴스 확인하기"],
                 };
                const lastTool = [...usedTools].reverse().find((t: string) => fallbackMap[t]);
                collectedMeta.followUps = lastTool
                  ? fallbackMap[lastTool]
                  : ["실시간 랭킹 보기", "오늘의 팬활동", "최신 뉴스 확인"];
              }

              // Save assistant message with card metadata
              if (finalContent) {
                const metaToSave: any = {};
                if (collectedMeta.rankingData) metaToSave.rankingData = collectedMeta.rankingData;
                if (collectedMeta.guideData) metaToSave.guideData = collectedMeta.guideData;
                if (collectedMeta.reportCards) metaToSave.reportCards = collectedMeta.reportCards;
                if (collectedMeta.trendData) metaToSave.trendData = collectedMeta.trendData;
                
                await adminClient.from("ktrenz_fan_agent_messages").insert({
                  user_id: userId,
                  agent_slot_id: activeSlotId,
                  role: "assistant",
                  content: finalContent,
                  metadata: Object.keys(metaToSave).length > 0 ? metaToSave : null,
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
              const hasMeta = collectedMeta.guideData || collectedMeta.rankingData || collectedMeta.quickActions || collectedMeta.followUps || collectedMeta.reportCards || collectedMeta.trendData;
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

              const result = await handleTool(fnName, fnArgs, adminClient, userId, rankingCache, activeSlotId, activeSlotIndex);

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

              // Collect report card data for lookup/compare
              if (fnName === "lookup_artist") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.artist && !parsed.error) {
                    if (!collectedMeta.reportCards) collectedMeta.reportCards = [];
                    collectedMeta.reportCards.push({
                      type: "artist_report",
                      artist: parsed.artist,
                      rank: parsed.rank,
                      totalArtists: parsed.total_artists ?? 50,
                      energy: {
                        score: parsed.energy_score ?? 0,
                        change24h: parsed.energy_change_24h ?? 0,
                      },
                      categories: [
                        { key: "youtube", label: "YouTube", score: parsed.youtube?.score ?? 0, rank: parsed.youtube?.rank ?? 0 },
                        { key: "buzz", label: "Buzz", score: parsed.buzz?.score ?? 0, rank: parsed.buzz?.rank ?? 0 },
                        { key: "music", label: "Music", score: parsed.music?.score ?? 0, rank: parsed.music?.rank ?? 0 },
                        { key: "album", label: "Album", score: parsed.album?.score ?? 0, rank: parsed.album?.rank ?? 0 },
                      ],
                      strongest: (() => {
                        const cats = [
                          { key: "youtube", label: "YouTube", score: parsed.youtube?.score ?? 0, rank: parsed.youtube?.rank ?? 0 },
                          { key: "buzz", label: "Buzz", score: parsed.buzz?.score ?? 0, rank: parsed.buzz?.rank ?? 0 },
                          { key: "music", label: "Music", score: parsed.music?.score ?? 0, rank: parsed.music?.rank ?? 0 },
                          { key: "album", label: "Album", score: parsed.album?.score ?? 0, rank: parsed.album?.rank ?? 0 },
                        ].sort((a, b) => a.rank - b.rank);
                        return cats[0];
                      })(),
                      weakest: (() => {
                        const cats = [
                          { key: "youtube", label: "YouTube", score: parsed.youtube?.score ?? 0, rank: parsed.youtube?.rank ?? 0 },
                          { key: "buzz", label: "Buzz", score: parsed.buzz?.score ?? 0, rank: parsed.buzz?.rank ?? 0 },
                          { key: "music", label: "Music", score: parsed.music?.score ?? 0, rank: parsed.music?.rank ?? 0 },
                          { key: "album", label: "Album", score: parsed.album?.score ?? 0, rank: parsed.album?.rank ?? 0 },
                        ].sort((a, b) => b.rank - a.rank);
                        return cats[0];
                      })(),
                      tier: parsed.tier ?? null,
                    });
                  }
                } catch {}
              }
              if (fnName === "compare_artists") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.comparison) {
                    if (!collectedMeta.statsData) collectedMeta.statsData = [];
                    for (const item of parsed.comparison) {
                      if (!item.error) {
                        collectedMeta.statsData.push({
                          artist: item.artist,
                          rank: item.rank,
                          energy_score: item.energy_score ?? 0,
                          energy_change_24h: item.energy_change_24h ?? 0,
                          youtube_score: item.youtube_score ?? 0,
                          buzz_score: item.buzz_score ?? 0,
                          music_score: item.music_score ?? 0,
                          album_sales_score: item.album_sales_score ?? 0,
                        });
                      }
                    }
                  }
                } catch {}
              }
              if (fnName === "get_rankings") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.rankings) {
                    // Send rankingData for card rendering
                    collectedMeta.rankingData = parsed.rankings.slice(0, 10).map((item: any) => ({
                      rank: item.rank,
                      artist_name: item.artist,
                      image_url: null,
                      total_score: item.total_score ?? 0,
                      energy_score: item.energy_score ?? 0,
                      energy_change_24h: item.energy_change_24h ?? 0,
                      youtube_score: item.youtube_score ?? 0,
                      buzz_score: item.buzz_score ?? 0,
                    }));
                  }
                } catch {}
              }

              // Collect trend keyword data for inline cards
              if (fnName === "get_trend_keywords" || fnName === "get_trending_now") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.keywords && parsed.keywords.length > 0) {
                    if (!collectedMeta.trendData) collectedMeta.trendData = [];
                    for (const kw of parsed.keywords) {
                      collectedMeta.trendData.push({
                        keyword: kw.keyword,
                        keyword_ko: kw.keyword_ko ?? null,
                        category: kw.category,
                        artist: kw.artist ?? parsed.artist ?? null,
                        context: kw.context ?? null,
                        influence_index: kw.influence_index ?? null,
                        confidence: kw.confidence ?? null,
                        source: kw.source ?? null,
                        source_title: kw.source_title ?? null,
                        source_url: kw.source_url ?? null,
                        detected_at: kw.detected_at ?? null,
                        search_volume: kw.search_volume ?? null,
                        interest_score: kw.interest_score ?? null,
                        delta_pct: kw.delta_pct ?? null,
                      });
                    }
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
