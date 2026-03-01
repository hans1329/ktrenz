// Multi-source buzz 크롤링: X, 뉴스, Reddit, YouTube, 네이버, TikTok
// Firecrawl search API로 6개 소스에서 멘션을 수집하여 버즈 스코어 계산
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Source definitions ──
interface SourceConfig {
  name: string;
  weight: number;
  buildQuery: (artistName: string, hashtags?: string[]) => string;
  tbs: string;
  limit: number;
}

const SOURCES: SourceConfig[] = [
  {
    name: "x_twitter",
    weight: 1.5,
    buildQuery: (name, hashtags) => {
      const parts = [`"${name}" site:x.com OR site:twitter.com`];
      if (hashtags?.length) parts.push(hashtags.map(h => `#${h}`).join(" OR "));
      return parts.join(" OR ");
    },
    tbs: "qdr:d",
    limit: 100,
  },
  {
    name: "news",
    weight: 2.0,
    buildQuery: (name) => `"${name}" kpop -site:x.com -site:twitter.com -site:reddit.com -site:tiktok.com`,
    tbs: "qdr:d",
    limit: 100,
  },
  {
    name: "reddit",
    weight: 1.2,
    buildQuery: (name) => `"${name}" site:reddit.com kpop`,
    tbs: "qdr:d",
    limit: 100,
  },
  // YouTube 소스 제거됨 — YouTube는 독립 데이터 소스(40%)로 이미 수집 중
  {
    name: "naver",
    weight: 1.3,
    buildQuery: (name) => `"${name}" site:naver.com OR site:theqoo.net OR site:instiz.net OR site:pann.nate.com`,
    tbs: "qdr:d",
    limit: 100,
  },
  {
    name: "tiktok",
    weight: 1.4,
    buildQuery: (name, hashtags) => {
      const parts = [`"${name}" site:tiktok.com`];
      if (hashtags?.length) parts.push(hashtags.map(h => `#${h}`).join(" OR "));
      return parts.join(" OR ");
    },
    tbs: "qdr:d",
    limit: 100,
  },
];

// ── Sentiment analysis ──
const POSITIVE_WORDS = [
  "comeback", "love", "amazing", "best", "excited", "beautiful", "legendary",
  "iconic", "congratulations", "congrats", "win", "sold out", "record",
  "milestone", "chart", "debut", "trending", "viral", "fire", "slay",
  "masterpiece", "goat", "talented", "stream", "views", "breaking",
  "컴백", "대박", "축하", "최고", "사랑", "레전드", "기대", "대상", "1위",
  "역대급", "음원강자", "올킬", "차트인", "신기록",
];
const NEGATIVE_WORDS = [
  "scandal", "controversy", "disappointing", "flop", "worst", "hate",
  "cancel", "disband", "lawsuit", "plagiarism", "decline", "drop",
  "논란", "실망", "최악", "해체", "표절", "하락",
];

function analyzeSentiment(texts: string[]): { score: number; label: string } {
  let posCount = 0;
  let negCount = 0;
  const allText = texts.join(" ").toLowerCase();
  for (const w of POSITIVE_WORDS) if (allText.includes(w.toLowerCase())) posCount++;
  for (const w of NEGATIVE_WORDS) if (allText.includes(w.toLowerCase())) negCount++;
  const total = posCount + negCount;
  if (total === 0) return { score: 50, label: "neutral" };
  const ratio = posCount / total;
  if (ratio >= 0.65) return { score: Math.round(50 + ratio * 50), label: "positive" };
  if (ratio <= 0.35) return { score: Math.round(ratio * 50), label: "negative" };
  return { score: 50, label: "neutral" };
}

// ── Buzz score calculation ──
function calculateBuzzScore(
  sourceResults: { name: string; weight: number; count: number; texts: string[] }[],
  overallSentiment: { score: number; label: string }
): number {
  let weightedMentions = 0;
  for (const src of sourceResults) {
    weightedMentions += src.count * src.weight;
  }

  const baseScore = Math.round(Math.sqrt(weightedMentions) * 100);
  const sentimentBonus = Math.round((overallSentiment.score - 50) * 6);

  const activeSources = sourceResults.filter(s => s.count > 0).length;
  const diversityBonus = activeSources >= 4 ? 250 : activeSources >= 3 ? 200 : activeSources >= 2 ? 100 : activeSources >= 1 ? 50 : 0;

  return Math.max(0, baseScore + sentimentBonus + diversityBonus);
}

// ── Firecrawl search ──
async function firecrawlSearch(
  apiKey: string,
  query: string,
  limit: number,
  tbs: string
): Promise<any[]> {
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, tbs, scrapeOptions: { formats: ["markdown"] } }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[crawl-x-mentions] Firecrawl search failed for query "${query.slice(0, 60)}": ${err}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (e) {
    console.warn(`[crawl-x-mentions] Firecrawl error: ${e.message}`);
    return [];
  }
}

// 일반 단어와 겹치는 그룹명에 컨텍스트 키워드를 추가하여 노이즈 방지
const AMBIGUOUS_NAMES: Record<string, string> = {
  "H.O.T": "kpop idol group",
  "H.O.T.": "kpop idol group",
  "HOT": "kpop idol group SM",
  "Winner": "kpop YG",
  "WINNER": "kpop YG",
  "Treasure": "kpop YG",
  "TREASURE": "kpop YG",
  "Red Velvet": "kpop SM",
  "Day6": "kpop JYP band",
  "DAY6": "kpop JYP band",
  "KISS OF LIFE": "kpop girl group",
  "VIVIZ": "kpop girl group",
  "CLASS:y": "kpop girl group",
};

function getSearchName(artistName: string): { searchName: string; contextKeyword: string } {
  const ctx = AMBIGUOUS_NAMES[artistName];
  if (ctx) {
    return { searchName: artistName, contextKeyword: ctx };
  }
  return { searchName: artistName, contextKeyword: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { artistName, wikiEntryId, hashtags, sources: requestedSources } = body;
    if (!artistName) {
      return new Response(
        JSON.stringify({ success: false, error: "artistName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // requestedSources가 지정되면 해당 소스만, 아니면 전체
    const activeSources = requestedSources?.length
      ? SOURCES.filter(s => requestedSources.includes(s.name))
      : SOURCES;

    const { contextKeyword } = getSearchName(artistName);
    console.log(`[crawl-x-mentions] Multi-source crawl for: ${artistName} (sources: ${activeSources.map(s=>s.name).join(",")})${contextKeyword ? ` (context: ${contextKeyword})` : ""}`);

    // 선택된 소스 병렬 검색
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

    const sourcePromises = activeSources.map(async (src) => {
      let query = src.buildQuery(artistName, hashtags);
      if (contextKeyword) query = `${query} ${contextKeyword}`;
      const rawResults = await firecrawlSearch(apiKey, query, src.limit, src.tbs);

      // 24시간 이내 게시물만 필터링 — 날짜 없으면 제외 (엄격 모드)
      const filtered = rawResults.filter((r: any) => {
        const dateStr = r.publishedDate || r.metadata?.publishedDate || r.metadata?.date;
        if (!dateStr) return false; // 날짜 정보 없으면 제외
        const pubTime = new Date(dateStr).getTime();
        return !isNaN(pubTime) && pubTime >= cutoff24h;
      });

      const texts = filtered.map((r: any) => (r.markdown || r.description || r.title || "")).filter(Boolean);
      return {
        name: src.name,
        weight: src.weight,
        count: filtered.length,
        totalFetched: rawResults.length,
        texts,
        topMentions: filtered.slice(0, 3).map((r: any) => ({
          title: r.title || "",
          url: r.url || "",
          description: r.description || "",
          source: src.name,
        })),
      };
    });

    const sourceResults = await Promise.all(sourcePromises);

    // YouTube 댓글 데이터를 Buzz 소스로 추가
    if (wikiEntryId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      const { data: ytSnap } = await sb
        .from("ktrenz_data_snapshots")
        .select("metrics")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "youtube")
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle() as { data: any };

      const ytComments = ytSnap?.metrics?.recentTotalComments || 0;
      if (ytComments > 0) {
        // 댓글 수를 가상 소스로 추가 (100개 단위로 정규화, 가중치 1.5)
        const normalizedComments = Math.min(100, Math.round(ytComments / 100));
        sourceResults.push({
          name: "yt_comments",
          weight: 1.5,
          count: normalizedComments,
          totalFetched: ytComments,
          texts: [],
          topMentions: [],
        });
      }
    }

    // 전체 텍스트 감성 분석
    const allTexts = sourceResults.flatMap(s => s.texts);
    const sentiment = analyzeSentiment(allTexts);
    const totalMentions = sourceResults.reduce((s, r) => s + r.count, 0);
    const buzzScore = calculateBuzzScore(sourceResults, sentiment);

    // TikTok 멘션 수 추출
    const tiktokResult = sourceResults.find(s => s.name === "tiktok");
    const tiktokMentions = tiktokResult?.count ?? 0;

    const sourceLog = sourceResults.map(s => `${s.name}=${s.count}/${s.totalFetched}`).join(", ");
    console.log(`[crawl-x-mentions] ${artistName}: total=${totalMentions} (${sourceLog}), sentiment=${sentiment.label}(${sentiment.score}), buzzScore=${buzzScore}`);

    const allTopMentions = sourceResults
      .flatMap(s => s.topMentions)
      .slice(0, 10);

    const sourceBreakdown = sourceResults.map(s => ({
      source: s.name,
      mentions: s.count,
      weight: s.weight,
      weighted: Math.round(s.count * s.weight),
    }));

    // DB 업데이트
    if (wikiEntryId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);

      // 1) ktrenz_data_snapshots에 스냅샷 저장
      await sb.from("ktrenz_data_snapshots").insert({
        wiki_entry_id: wikiEntryId,
        platform: "buzz_multi",
        metrics: {
          buzz_score: buzzScore,
          total_mentions: totalMentions,
          tiktok_mentions: tiktokMentions,
          sentiment_score: sentiment.score,
          sentiment_label: sentiment.label,
          source_breakdown: sourceBreakdown,
        },
        raw_response: { sources: sourceResults.map(s => ({ name: s.name, count: s.count })) },
      });

      // 2) v3_scores_v2 업데이트 (v2 테이블 사용)
      await sb
        .from("v3_scores_v2")
        .update({
          buzz_score: buzzScore,
          scored_at: new Date().toISOString(),
        })
        .eq("wiki_entry_id", wikiEntryId);

      // 3) wiki_entries metadata 캐시
      const { data: entry } = await sb
        .from("wiki_entries")
        .select("metadata")
        .eq("id", wikiEntryId)
        .single();

      if (entry) {
        const metadata = (entry.metadata as any) || {};
        metadata.buzz_stats = {
          mention_count: totalMentions,
          tiktok_mentions: tiktokMentions,
          sentiment_score: sentiment.score,
          sentiment_label: sentiment.label,
          buzz_score: buzzScore,
          source_breakdown: sourceBreakdown,
          top_mentions: allTopMentions,
          updated_at: new Date().toISOString(),
        };
        await sb.from("wiki_entries").update({ metadata }).eq("id", wikiEntryId);
      }

      // NOTE: total_score는 GENERATED 컬럼 — buzz_score 업데이트 시 자동으로 재계산됨
    }

    return new Response(
      JSON.stringify({
        success: true,
        artistName,
        buzzScore,
        mentionCount: totalMentions,
        tiktokMentions,
        sentiment,
        sourceBreakdown,
        topMentions: allTopMentions,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[crawl-x-mentions] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
