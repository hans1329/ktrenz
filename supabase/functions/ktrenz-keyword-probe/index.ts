// ktrenz-keyword-probe: 키워드 실시간 프로브 + 기존 트렌드 매칭 + 캠페인 감지
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Naver Search API ───
async function searchNaver(
  clientId: string, clientSecret: string,
  endpoint: "news" | "blog" | "shop",
  query: string,
  display = 20,
): Promise<{ items: any[]; total: number }> {
  try {
    const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(display, 100)));
    url.searchParams.set("sort", "date");

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!res.ok) return { items: [], total: 0 };
    const data = await res.json();
    return { items: data.items || [], total: data.total || 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

// ─── 캠페인 시그널 감지 ───
interface CampaignSignal {
  detected: boolean;
  confidence: number; // 0-1
  type: "sponsorship" | "ad" | "collaboration" | "organic";
  brand?: string;
  artist?: string;
  indicators: string[];
}

function detectCampaignSignals(
  newsItems: any[],
  blogItems: any[],
  shopItems: any[],
  existingTrend: any | null,
): CampaignSignal {
  const indicators: string[] = [];
  let confidence = 0;
  let detectedType: CampaignSignal["type"] = "organic";

  // 1. 기존 트렌드에서 commercial_intent 확인
  if (existingTrend) {
    const ci = existingTrend.commercial_intent?.toLowerCase();
    if (ci === "sponsorship" || ci === "ad" || ci === "collaboration") {
      indicators.push(`Existing trend: commercial_intent=${ci}`);
      confidence += 0.4;
      detectedType = ci as CampaignSignal["type"];
    }
    if (existingTrend.purchase_stage && existingTrend.purchase_stage !== "awareness") {
      indicators.push(`Purchase stage: ${existingTrend.purchase_stage}`);
      confidence += 0.1;
    }
    if (existingTrend.keyword_category === "brand" || existingTrend.keyword_category === "product") {
      indicators.push(`Category: ${existingTrend.keyword_category}`);
      confidence += 0.2;
    }
  }

  // 2. 뉴스 제목에서 광고/협찬 키워드 탐지
  const adKeywords = ["광고", "협찬", "모델", "앰배서더", "ambassador", "brand", "브랜드", "뮤즈", "muse", "프로모션", "promotion", "콜라보", "collaboration", "화보"];
  const allTitles = [
    ...newsItems.map(i => (i.title || "").replace(/<[^>]*>/g, "")),
    ...blogItems.map(i => (i.title || "").replace(/<[^>]*>/g, "")),
  ].join(" ").toLowerCase();

  for (const kw of adKeywords) {
    if (allTitles.includes(kw)) {
      indicators.push(`Ad keyword found: "${kw}"`);
      confidence += 0.15;
      if (["광고", "협찬", "프로모션", "promotion"].includes(kw)) detectedType = "sponsorship";
      else if (["앰배서더", "ambassador", "뮤즈", "muse"].includes(kw)) detectedType = "collaboration";
    }
  }

  // 3. 쇼핑 결과 존재 → 상업적 의도
  if (shopItems.length > 0) {
    indicators.push(`Shopping results: ${shopItems.length} items`);
    confidence += 0.2;
    if (detectedType === "organic") detectedType = "ad";
  }

  // 4. 브랜드명 추출 (쇼핑 결과의 mallName 또는 뉴스에서)
  let brand: string | undefined;
  if (shopItems.length > 0) {
    const mallNames = shopItems.map((i: any) => i.mallName).filter(Boolean);
    const freq: Record<string, number> = {};
    for (const m of mallNames) { freq[m] = (freq[m] || 0) + 1; }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) brand = sorted[0][0];
  }

  confidence = Math.min(confidence, 1);

  return {
    detected: confidence >= 0.3,
    confidence: Math.round(confidence * 100) / 100,
    type: detectedType,
    brand,
    artist: existingTrend?.artist_name,
    indicators,
  };
}

// ─── 감성 분석 (간단 규칙 기반) ───
function analyzeSentiment(items: any[]): { positive: number; negative: number; neutral: number } {
  const posWords = ["인기", "성공", "화제", "사랑", "호평", "히트", "1위", "기록", "대박", "최고"];
  const negWords = ["논란", "비판", "문제", "사과", "해명", "루머", "갈등", "의혹"];
  let pos = 0, neg = 0, neu = 0;
  
  for (const item of items) {
    const text = ((item.title || "") + " " + (item.description || "")).replace(/<[^>]*>/g, "").toLowerCase();
    const hasPos = posWords.some(w => text.includes(w));
    const hasNeg = negWords.some(w => text.includes(w));
    if (hasPos && !hasNeg) pos++;
    else if (hasNeg && !hasPos) neg++;
    else neu++;
  }
  const total = pos + neg + neu || 1;
  return {
    positive: Math.round((pos / total) * 100),
    negative: Math.round((neg / total) * 100),
    neutral: Math.round((neu / total) * 100),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keyword, artist_name } = await req.json();
    if (!keyword || keyword.trim().length < 2) {
      return new Response(JSON.stringify({ error: "keyword required (min 2 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const NAVER_ID = Deno.env.get("NAVER_CLIENT_ID")!;
    const NAVER_SECRET = Deno.env.get("NAVER_CLIENT_SECRET")!;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const kw = keyword.trim();
    const searchQuery = artist_name ? `"${artist_name}" "${kw}"` : kw;
    const kwOnly = kw;

    // 1. 네이버 뉴스/블로그/쇼핑 동시 조회
    const [newsResult, blogResult, shopResult] = await Promise.all([
      searchNaver(NAVER_ID, NAVER_SECRET, "news", searchQuery, 20),
      searchNaver(NAVER_ID, NAVER_SECRET, "blog", searchQuery, 20),
      searchNaver(NAVER_ID, NAVER_SECRET, "shop", kwOnly, 10),
    ]);

    // 2. 기존 ktrenz_trend_triggers 매칭
    let existingTrend = null;
    {
      const { data } = await sb
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_ko, artist_name, star_id, influence_index, trend_score, trend_grade, purchase_stage, commercial_intent, brand_intent, fan_sentiment, keyword_category, source_image_url, detected_at, baseline_score, peak_score")
        .eq("status", "active")
        .or(`keyword.ilike.%${kw}%,keyword_ko.ilike.%${kw}%,keyword_en.ilike.%${kw}%`)
        .order("influence_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingTrend = data;
    }

    // 3. 버즈 스코어 계산
    const newsTotal = newsResult.total;
    const blogTotal = blogResult.total;
    const buzzRaw = newsTotal * 0.6 + blogTotal * 0.4;
    const buzzScore = Math.round(Math.min(
      (Math.log10(buzzRaw + 1) / Math.log10(10001)) * 100,
      100,
    ));

    // 4. 감성 분석
    const sentiment = analyzeSentiment([...newsResult.items, ...blogResult.items]);

    // 5. 캠페인 감지
    const campaign = detectCampaignSignals(
      newsResult.items, blogResult.items, shopResult.items,
      existingTrend,
    );

    // 6. 최근 뉴스 헤드라인 (상위 5개)
    const headlines = newsResult.items.slice(0, 5).map((item: any) => ({
      title: (item.title || "").replace(/<[^>]*>/g, ""),
      link: item.originallink || item.link,
      pubDate: item.pubDate,
    }));

    // 7. 구매 단계 추정 (기존 데이터 또는 쇼핑 결과 기반)
    let purchaseStage = existingTrend?.purchase_stage || "awareness";
    if (!existingTrend) {
      if (shopResult.total > 50) purchaseStage = "consideration";
      else if (shopResult.total > 10) purchaseStage = "interest";
      else if (shopResult.total > 0) purchaseStage = "awareness";
    }

    const result = {
      keyword: kw,
      artist_name: artist_name || existingTrend?.artist_name || null,

      // 실시간 수치
      realtime: {
        news_total: newsTotal,
        blog_total: blogTotal,
        shop_total: shopResult.total,
        buzz_score: buzzScore,
      },

      // 기존 트렌드 데이터 (매칭된 경우)
      existing_trend: existingTrend ? {
        id: existingTrend.id,
        keyword: existingTrend.keyword,
        artist_name: existingTrend.artist_name,
        influence_index: existingTrend.influence_index,
        trend_score: existingTrend.trend_score,
        trend_grade: existingTrend.trend_grade,
        purchase_stage: existingTrend.purchase_stage,
        commercial_intent: existingTrend.commercial_intent,
        keyword_category: existingTrend.keyword_category,
        source_image_url: existingTrend.source_image_url,
        detected_at: existingTrend.detected_at,
      } : null,

      // 분석 결과
      analysis: {
        sentiment,
        purchase_stage: purchaseStage,
        campaign: campaign,
      },

      // 최근 헤드라인
      headlines,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[keyword-probe] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
