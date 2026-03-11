// YouTube 댓글 감성 분석 엣지 함수
// 특정 아티스트의 최근 영상 댓글을 수집하고 키워드 기반 감성 분석 수행
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

// ── Language → Country mapping (only high-confidence 1:1 mappings) ──
const LANG_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  ko: { code: "KR", name: "South Korea" },
  ja: { code: "JP", name: "Japan" },
  th: { code: "TH", name: "Thailand" },
  id: { code: "ID", name: "Indonesia" },
  vi: { code: "VN", name: "Vietnam" },
  tl: { code: "PH", name: "Philippines" },  // Tagalog
  ms: { code: "MY", name: "Malaysia" },
  tr: { code: "TR", name: "Turkey" },
  pl: { code: "PL", name: "Poland" },
  ar: { code: "SA", name: "Saudi Arabia" },  // approximate
  de: { code: "DE", name: "Germany" },
  fr: { code: "FR", name: "France" },
  it: { code: "IT", name: "Italy" },
  pt: { code: "BR", name: "Brazil" },  // approximate (could be PT)
  es: { code: "ES", name: "Spain" },   // approximate (could be MX/AR)
};

// Unicode range-based language detection (no API needed)
function detectLanguage(text: string): string {
  const clean = text.replace(/[\s\d\p{Emoji_Presentation}\p{Extended_Pictographic}.,!?@#$%^&*()_+\-=\[\]{};':"\\|<>\/~`]/gu, "");
  if (!clean) return "unknown";

  let ko = 0, ja = 0, th = 0, ar = 0, vi = 0, latin = 0, total = 0;

  for (const ch of clean) {
    const cp = ch.codePointAt(0)!;
    total++;
    if (cp >= 0xAC00 && cp <= 0xD7AF) ko++;           // Hangul syllables
    else if (cp >= 0x3131 && cp <= 0x318E) ko++;       // Hangul Jamo
    else if (cp >= 0x3040 && cp <= 0x309F) ja++;       // Hiragana
    else if (cp >= 0x30A0 && cp <= 0x30FF) ja++;       // Katakana
    else if (cp >= 0x4E00 && cp <= 0x9FFF) ja++;       // CJK (could be zh, but in k-pop context mostly ja)
    else if (cp >= 0x0E01 && cp <= 0x0E5B) th++;       // Thai
    else if (cp >= 0x0600 && cp <= 0x06FF) ar++;       // Arabic
    else if (cp >= 0x0041 && cp <= 0x024F) latin++;    // Latin
  }

  if (total === 0) return "unknown";

  // Check non-Latin scripts first (high confidence)
  if (ko / total > 0.3) return "ko";
  if (ja / total > 0.3) return "ja";
  if (th / total > 0.3) return "th";
  if (ar / total > 0.3) return "ar";

  // For Latin-based text, use keyword/character patterns
  if (latin / total > 0.5) {
    const lower = text.toLowerCase();
    // Vietnamese diacritics
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(lower)) return "vi";
    // Tagalog common patterns
    if (/\b(ang|mga|naman|talaga|sobrang|grabe|sana|niya|ko|po|opo)\b/.test(lower)) return "tl";
    // Indonesian/Malay
    if (/\b(yang|dan|ini|itu|sangat|banget|keren|gak|tidak|sudah|bisa|sama|juga)\b/.test(lower)) return "id";
    // Turkish
    if (/[çğıöşü]/.test(lower) && /\b(bir|ve|bu|çok|için|ile)\b/.test(lower)) return "tr";
    // Polish
    if (/[ąćęłńóśźż]/.test(lower)) return "pl";
    // Portuguese
    if (/[ãõç]/.test(lower) && /\b(que|não|muito|para|com|uma)\b/.test(lower)) return "pt";
    // Spanish
    if (/[ñ¿¡]/.test(lower) || /\b(que|los|las|una|por|pero|muy|como|esta)\b/.test(lower)) return "es";
    // French
    if (/[àâæçéèêëïîôœùûüÿ]/.test(lower) && /\b(les|des|une|que|est|dans|pour)\b/.test(lower)) return "fr";
    // German
    if (/[äöüß]/.test(lower) && /\b(und|der|die|das|ist|ein|nicht)\b/.test(lower)) return "de";
    // Italian
    if (/\b(che|della|sono|questo|quella|molto|anche|perché)\b/.test(lower)) return "it";
    // Default Latin = English (no country mapping)
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

async function fetchVideoComments(
  apiKey: string,
  videoId: string,
  maxResults = 50
): Promise<CommentSentiment[]> {
  const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&textFormat=plainText&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn(`[yt-sentiment] Comments fetch failed for ${videoId}: ${resp.status}`);
    return [];
  }
  const data = await resp.json();
  const items = data.items || [];
  return items.map((item: any) => {
    const snippet = item.snippet?.topLevelComment?.snippet;
    const text = snippet?.textDisplay || "";
    const { sentiment, score } = analyzeComment(text);
    const lang = detectLanguage(text);
    return {
      text: text.slice(0, 200),
      sentiment,
      score,
      likeCount: snippet?.likeCount || 0,
      publishedAt: snippet?.publishedAt || "",
      lang,
    };
  });
}

async function getRecentVideoIds(
  apiKey: string,
  channelId: string,
  maxVideos = 3
): Promise<{ videoId: string; title: string }[]> {
  // Get uploads playlist
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wikiEntryId } = await req.json();
    if (!wikiEntryId) {
      return new Response(
        JSON.stringify({ success: false, error: "wikiEntryId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!ytApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get artist info
    const { data: tier } = await sb
      .from("v3_artist_tiers")
      .select("display_name, youtube_channel_id")
      .eq("wiki_entry_id", wikiEntryId)
      .maybeSingle();

    if (!tier?.youtube_channel_id) {
      return new Response(
        JSON.stringify({ success: false, error: "No YouTube channel ID for this artist" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[yt-sentiment] Analyzing: ${tier.display_name} (${tier.youtube_channel_id})`);

    // Get recent videos
    const videos = await getRecentVideoIds(ytApiKey, tier.youtube_channel_id, 3);
    if (videos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No recent videos found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch comments for each video (50 each, ~3 API units total)
    const videoResults = await Promise.all(
      videos.map(async (v) => {
        const comments = await fetchVideoComments(ytApiKey, v.videoId, 50);
        const pos = comments.filter(c => c.sentiment === "positive").length;
        const neg = comments.filter(c => c.sentiment === "negative").length;
        const neu = comments.filter(c => c.sentiment === "neutral").length;
        const avgScore = comments.length > 0
          ? Math.round(comments.reduce((s, c) => s + c.score, 0) / comments.length)
          : 50;
        return {
          videoId: v.videoId,
          title: v.title,
          commentCount: comments.length,
          sentiment: { positive: pos, negative: neg, neutral: neu },
          avgScore,
          topComments: comments
            .sort((a, b) => b.likeCount - a.likeCount)
            .slice(0, 5),
          recentComments: comments.slice(0, 10),
        };
      })
    );

    // Overall aggregation
    const allComments = videoResults.flatMap(v => v.recentComments);
    const totalPos = videoResults.reduce((s, v) => s + v.sentiment.positive, 0);
    const totalNeg = videoResults.reduce((s, v) => s + v.sentiment.negative, 0);
    const totalNeu = videoResults.reduce((s, v) => s + v.sentiment.neutral, 0);
    const totalComments = totalPos + totalNeg + totalNeu;
    const overallScore = totalComments > 0
      ? Math.round(allComments.reduce((s, c) => s + c.score, 0) / allComments.length)
      : 50;
    const overallLabel = overallScore >= 65 ? "positive" : overallScore <= 35 ? "negative" : "neutral";

    // Save snapshot
    await sb.from("ktrenz_data_snapshots").insert({
      wiki_entry_id: wikiEntryId,
      platform: "yt_sentiment",
      metrics: {
        overall_score: overallScore,
        overall_label: overallLabel,
        total_comments_analyzed: totalComments,
        positive: totalPos,
        negative: totalNeg,
        neutral: totalNeu,
        videos_analyzed: videos.length,
      },
      raw_response: { videos: videoResults.map(v => ({ videoId: v.videoId, title: v.title, sentiment: v.sentiment })) },
    });

    console.log(`[yt-sentiment] ${tier.display_name}: score=${overallScore} (${overallLabel}), comments=${totalComments}, videos=${videos.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        artistName: tier.display_name,
        overallScore,
        overallLabel,
        totalComments,
        breakdown: { positive: totalPos, negative: totalNeg, neutral: totalNeu },
        videos: videoResults,
        analyzedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[yt-sentiment] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
