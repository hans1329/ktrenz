// YouTube 댓글 감성 분석 + 언어 기반 국가 분류 엣지 함수
// 배치 모드: 여러 아티스트를 한 번에 처리 (wikiEntryIds 배열)
// 단건 모드: 단일 아티스트 처리 (wikiEntryId)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Sentiment keywords ──
const POSITIVE = [
  "love", "amazing", "best", "beautiful", "legendary", "iconic", "fire",
  "slay", "masterpiece", "talented", "perfect", "incredible", "obsessed",
  "goat", "king", "queen", "flawless", "stunning", "excellent", "wow",
  "comeback", "excited", "congratulations", "congrats", "win", "sold out",
  "record", "milestone", "chart", "trending", "viral", "stream",
  "컴백", "대박", "축하", "최고", "사랑", "레전드", "미쳤", "역대급",
  "갓", "완벽", "소름", "감동", "응원", "자랑", "멋지", "예쁘",
  "좋아", "행복", "기대", "화이팅", "짱", "존잘", "존예",
  "❤️", "🔥", "😍", "💜", "💖", "👏", "🥰", "💕", "✨", "💪",
];

const NEGATIVE = [
  "hate", "terrible", "worst", "boring", "disappointing", "flop",
  "overrated", "cringe", "trash", "awful", "bad", "ugly", "annoying",
  "scandal", "controversy", "cancel", "disband", "lawsuit", "plagiarism",
  "decline", "drop", "fail",
  "논란", "실망", "최악", "해체", "표절", "하락", "별로", "싫",
  "망", "구리", "안좋", "실패",
  "👎", "😡", "🤮", "💩",
];

// ── Language → Country mapping ──
const LANG_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  ko: { code: "KR", name: "South Korea" },
  ja: { code: "JP", name: "Japan" },
  th: { code: "TH", name: "Thailand" },
  id: { code: "ID", name: "Indonesia" },
  vi: { code: "VN", name: "Vietnam" },
  tl: { code: "PH", name: "Philippines" },
  ms: { code: "MY", name: "Malaysia" },
  tr: { code: "TR", name: "Turkey" },
  pl: { code: "PL", name: "Poland" },
  ar: { code: "SA", name: "Saudi Arabia" },
  de: { code: "DE", name: "Germany" },
  fr: { code: "FR", name: "France" },
  it: { code: "IT", name: "Italy" },
  pt: { code: "BR", name: "Brazil" },
  es: { code: "ES", name: "Spain" },
};

function detectLanguage(text: string): string {
  const clean = text.replace(/[\s\d\p{Emoji_Presentation}\p{Extended_Pictographic}.,!?@#$%^&*()_+\-=\[\]{};':"\\|<>\/~`]/gu, "");
  if (!clean) return "unknown";
  let ko = 0, ja = 0, th = 0, ar = 0, latin = 0, total = 0;
  for (const ch of clean) {
    const cp = ch.codePointAt(0)!;
    total++;
    if (cp >= 0xAC00 && cp <= 0xD7AF) ko++;
    else if (cp >= 0x3131 && cp <= 0x318E) ko++;
    else if (cp >= 0x3040 && cp <= 0x309F) ja++;
    else if (cp >= 0x30A0 && cp <= 0x30FF) ja++;
    else if (cp >= 0x4E00 && cp <= 0x9FFF) ja++;
    else if (cp >= 0x0E01 && cp <= 0x0E5B) th++;
    else if (cp >= 0x0600 && cp <= 0x06FF) ar++;
    else if (cp >= 0x0041 && cp <= 0x024F) latin++;
  }
  if (total === 0) return "unknown";
  if (ko / total > 0.3) return "ko";
  if (ja / total > 0.3) return "ja";
  if (th / total > 0.3) return "th";
  if (ar / total > 0.3) return "ar";
  if (latin / total > 0.5) {
    const lower = text.toLowerCase();
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(lower)) return "vi";
    if (/\b(ang|mga|naman|talaga|sobrang|grabe|sana|niya|ko|po|opo)\b/.test(lower)) return "tl";
    if (/\b(yang|dan|ini|itu|sangat|banget|keren|gak|tidak|sudah|bisa|sama|juga)\b/.test(lower)) return "id";
    if (/[çğıöşü]/.test(lower) && /\b(bir|ve|bu|çok|için|ile)\b/.test(lower)) return "tr";
    if (/[ąćęłńóśźż]/.test(lower)) return "pl";
    if (/[ãõç]/.test(lower) && /\b(que|não|muito|para|com|uma)\b/.test(lower)) return "pt";
    if (/[ñ¿¡]/.test(lower) || /\b(que|los|las|una|por|pero|muy|como|esta)\b/.test(lower)) return "es";
    if (/[àâæçéèêëïîôœùûüÿ]/.test(lower) && /\b(les|des|une|que|est|dans|pour)\b/.test(lower)) return "fr";
    if (/[äöüß]/.test(lower) && /\b(und|der|die|das|ist|ein|nicht)\b/.test(lower)) return "de";
    if (/\b(che|della|sono|questo|quella|molto|anche|perché)\b/.test(lower)) return "it";
    return "en";
  }
  return "unknown";
}

interface CommentSentiment {
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  likeCount: number;
  publishedAt: string;
  lang: string;
}

function analyzeComment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE) if (lower.includes(w.toLowerCase())) pos++;
  for (const w of NEGATIVE) if (lower.includes(w.toLowerCase())) neg++;
  const total = pos + neg;
  if (total === 0) return { sentiment: "neutral", score: 50 };
  const ratio = pos / total;
  if (ratio >= 0.6) return { sentiment: "positive", score: Math.round(50 + ratio * 50) };
  if (ratio <= 0.4) return { sentiment: "negative", score: Math.round(ratio * 50) };
  return { sentiment: "neutral", score: 50 };
}

const COMMENTS_PER_VIDEO = 30;

async function fetchVideoComments(
  apiKey: string,
  videoId: string,
): Promise<CommentSentiment[]> {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${COMMENTS_PER_VIDEO}&order=relevance&textFormat=plainText&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn(`[yt-sentiment] Comments fetch failed for ${videoId}: ${resp.status}`);
    return [];
  }
  const data = await resp.json();
  return (data.items || []).map((item: any) => {
    const snippet = item.snippet?.topLevelComment?.snippet;
    const text = snippet?.textDisplay || "";
    const { sentiment, score } = analyzeComment(text);
    return {
      text: text.slice(0, 200),
      sentiment,
      score,
      likeCount: snippet?.likeCount || 0,
      publishedAt: snippet?.publishedAt || "",
      lang: detectLanguage(text),
    };
  });
}

async function getRecentVideoIds(
  apiKey: string,
  channelId: string,
  maxVideos = 3,
): Promise<{ videoId: string; title: string }[]> {
  const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const chResp = await fetch(chUrl);
  if (!chResp.ok) return [];
  const chData = await chResp.json();
  const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) return [];
  const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=${maxVideos}&key=${apiKey}`;
  const plResp = await fetch(plUrl);
  if (!plResp.ok) return [];
  const plData = await plResp.json();
  return (plData.items || []).map((item: any) => ({
    videoId: item.snippet?.resourceId?.videoId,
    title: item.snippet?.title || "",
  }));
}

// ── 단일 아티스트 처리 로직 ──
async function processArtist(
  sb: any,
  ytApiKey: string,
  wikiEntryId: string,
  displayName: string,
  channelId: string,
): Promise<{ success: boolean; artistName: string; overallScore?: number; error?: string }> {
  try {
    const videos = await getRecentVideoIds(ytApiKey, channelId, 3);
    if (videos.length === 0) {
      return { success: false, artistName: displayName, error: "No recent videos" };
    }

    const allCommentsRaw: CommentSentiment[] = [];
    const videoResults = await Promise.all(
      videos.map(async (v) => {
        const comments = await fetchVideoComments(ytApiKey, v.videoId);
        allCommentsRaw.push(...comments);
        const pos = comments.filter((c) => c.sentiment === "positive").length;
        const neg = comments.filter((c) => c.sentiment === "negative").length;
        const neu = comments.filter((c) => c.sentiment === "neutral").length;
        const avgScore = comments.length > 0
          ? Math.round(comments.reduce((s, c) => s + c.score, 0) / comments.length)
          : 50;
        return {
          videoId: v.videoId, title: v.title, commentCount: comments.length,
          sentiment: { positive: pos, negative: neg, neutral: neu }, avgScore,
          topComments: comments.sort((a, b) => b.likeCount - a.likeCount).slice(0, 5),
          recentComments: comments.slice(0, 10),
        };
      }),
    );

    const allComments = videoResults.flatMap((v) => v.recentComments);
    const totalPos = videoResults.reduce((s, v) => s + v.sentiment.positive, 0);
    const totalNeg = videoResults.reduce((s, v) => s + v.sentiment.negative, 0);
    const totalNeu = videoResults.reduce((s, v) => s + v.sentiment.neutral, 0);
    const totalComments = totalPos + totalNeg + totalNeu;
    const overallScore = totalComments > 0
      ? Math.round(allComments.reduce((s, c) => s + c.score, 0) / allComments.length)
      : 50;
    const overallLabel = overallScore >= 65 ? "positive" : overallScore <= 35 ? "negative" : "neutral";

    // Language distribution
    const langCounts: Record<string, number> = {};
    for (const c of allCommentsRaw) {
      if (c.lang && c.lang !== "unknown" && c.lang !== "en") {
        langCounts[c.lang] = (langCounts[c.lang] || 0) + 1;
      }
    }
    const totalNonEnglish = Object.values(langCounts).reduce((s, n) => s + n, 0);
    const langDistribution: Record<string, number> = {};
    for (const [lang, count] of Object.entries(langCounts)) {
      langDistribution[lang] = Math.round((count / Math.max(totalNonEnglish, 1)) * 100);
    }

    // Save geo data
    const now = new Date().toISOString();
    const geoRows = Object.entries(langCounts)
      .filter(([lang]) => LANG_TO_COUNTRY[lang])
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count], idx) => ({
        wiki_entry_id: wikiEntryId,
        country_code: LANG_TO_COUNTRY[lang].code,
        country_name: LANG_TO_COUNTRY[lang].name,
        source: "youtube_comments",
        rank_position: idx + 1,
        listeners: count,
        interest_score: Math.round((count / Math.max(allCommentsRaw.length, 1)) * 100),
        collected_at: now,
      }));

    if (geoRows.length > 0) {
      const { error: geoErr } = await sb.from("ktrenz_geo_fan_data").insert(geoRows);
      if (geoErr) console.error(`[yt-sentiment] Geo insert error for ${displayName}:`, geoErr);
    }

    // Save sentiment snapshot
    await sb.from("ktrenz_data_snapshots").insert({
      wiki_entry_id: wikiEntryId,
      platform: "yt_sentiment",
      metrics: {
        overall_score: overallScore,
        overall_label: overallLabel,
        total_comments_analyzed: totalComments,
        positive: totalPos, negative: totalNeg, neutral: totalNeu,
        videos_analyzed: videos.length,
        language_distribution: langDistribution,
        non_english_comments: totalNonEnglish,
      },
      raw_response: {
        videos: videoResults.map((v) => ({
          videoId: v.videoId, title: v.title, sentiment: v.sentiment,
        })),
      },
    });

    console.log(`[yt-sentiment] ${displayName}: score=${overallScore} (${overallLabel}), comments=${totalComments}, langs=${JSON.stringify(langDistribution)}`);
    return { success: true, artistName: displayName, overallScore };
  } catch (err) {
    console.error(`[yt-sentiment] Error for ${displayName}:`, err);
    return { success: false, artistName: displayName, error: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // 배치 모드: wikiEntryIds 배열, 단건 모드: wikiEntryId
    const wikiEntryIds: string[] = body.wikiEntryIds || (body.wikiEntryId ? [body.wikiEntryId] : []);

    if (wikiEntryIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "wikiEntryIds or wikiEntryId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!ytApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 아티스트 정보 일괄 조회
    const { data: tiers } = await sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id, display_name, youtube_channel_id")
      .in("wiki_entry_id", wikiEntryIds);

    const validArtists = (tiers || []).filter((t: any) => t.youtube_channel_id);

    if (validArtists.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No artists with YouTube channel ID found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[yt-sentiment] Processing ${validArtists.length} artists in batch`);

    // 순차 처리 (YouTube API rate limit 고려, 아티스트 간 간격 없이 순차 실행)
    const results = [];
    for (const artist of validArtists) {
      const result = await processArtist(
        sb, ytApiKey,
        artist.wiki_entry_id,
        artist.display_name,
        artist.youtube_channel_id,
      );
      results.push(result);
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[yt-sentiment] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${validArtists.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: validArtists.length,
        succeeded,
        failed,
        results,
        analyzedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[yt-sentiment] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
