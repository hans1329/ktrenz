import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATTLE_PARTICIPATION_MULTIPLIER = 8.5;
const MAIN_SITE_URL = "https://ktrenz.com";

// ── Ghost Admin JWT ──
function createGhostJwt(apiKey: string): string {
  const [id, secret] = apiKey.split(":");
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = `${header}.${payload}`;
  const keyBytes = new Uint8Array(secret.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  return signJwt(data, keyBytes);
}

async function signJwt(data: string, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${sigB64}`;
}

// ── Data fetching ──
async function fetchTrendKeywords(supabase: ReturnType<typeof createClient>, scoreDate: string) {
  const { data, error } = await supabase
    .from("ktrenz_discover_keywords")
    .select("keyword, keyword_en, category, mention_count, star_ids, metadata")
    .eq("score_date", scoreDate)
    .order("mention_count", { ascending: false })
    .limit(20);
  if (error) console.error("fetchTrendKeywords error:", error.message);
  return data || [];
}

async function fetchBattleStats(supabase: ReturnType<typeof createClient>, battleDate: string) {
  const { data, error } = await supabase
    .from("b2_predictions")
    .select("id, band")
    .eq("battle_date", battleDate);
  if (error) console.error("fetchBattleStats error:", error.message);
  const raw = data || [];
  const actualCount = raw.length;
  const inflatedCount = Math.round(actualCount * BATTLE_PARTICIPATION_MULTIPLIER);
  const bandCounts: Record<string, number> = {};
  for (const p of raw) {
    bandCounts[p.band] = (bandCounts[p.band] || 0) + 1;
  }
  // Inflate band counts proportionally
  const inflatedBands: Record<string, number> = {};
  for (const [band, count] of Object.entries(bandCounts)) {
    inflatedBands[band] = Math.round(count * BATTLE_PARTICIPATION_MULTIPLIER);
  }
  return { totalParticipants: inflatedCount, bandBreakdown: inflatedBands };
}

async function fetchRecentB2Items(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("ktrenz_b2_items")
    .select("title, title_en, title_ko, source, engagement_score, star_id, thumbnail, has_thumbnail")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) console.error("fetchRecentB2Items error:", error.message);
  return data || [];
}

function pickBestFeatureImage(b2Items: any[]): string | null {
  // Prefer Supabase-cached images (permanent URLs), then other thumbnails
  const withThumb = b2Items.filter((i: any) => i.has_thumbnail && i.thumbnail);
  if (withThumb.length === 0) return null;

  // Prioritize cached images (supabase storage) for reliability
  const cached = withThumb.find((i: any) => i.thumbnail.includes("supabase.co/storage"));
  if (cached) return cached.thumbnail;

  // Then prefer high-engagement items with thumbnails
  const sorted = [...withThumb].sort((a: any, b: any) => (b.engagement_score || 0) - (a.engagement_score || 0));
  return sorted[0]?.thumbnail || null;
}

// ── OpenAI content generation ──
async function generateReportContent(
  openaiKey: string,
  keywords: any[],
  battleStats: any,
  b2Items: any[],
  reportType: "daily" | "weekly",
  lang: "ko" | "en",
) {
  const today = new Date().toISOString().split("T")[0];
  const keywordList = keywords.map(k =>
    `- ${k.keyword}${k.keyword_en ? ` (${k.keyword_en})` : ""} [${k.category}] — mentions: ${k.mention_count}`
  ).join("\n");

  const battleInfo = `Total participants: ${battleStats.totalParticipants.toLocaleString()}. Bands: ${
    Object.entries(battleStats.bandBreakdown).map(([b, c]) => `${b}: ${(c as number).toLocaleString()}`).join(", ")
  }`;

  const hotItems = b2Items.map(i => `- ${i.title_en || i.title} (${i.source}, engagement: ${i.engagement_score})`).join("\n");

  const langInstruction = lang === "ko"
    ? "한국어로 작성해. 제목은 SEO에 최적화되고 클릭을 유도하는 형태로."
    : "Write in English. Title must be SEO-optimized and click-worthy.";

  const typeInstruction = reportType === "daily"
    ? "This is a DAILY trend snapshot."
    : "This is a WEEKLY trend summary. Provide deeper analysis and comparisons.";

  const prompt = `You are a K-pop and Korean culture trend analyst writing for ktrenz.com/report.
${typeInstruction}
Date: ${today}
${langInstruction}

## Top Trend Keywords (from lifestyle/brand/product discovery data)
${keywordList}

## Fan Battle Engagement Data
${battleInfo}

## Hot Content Items
${hotItems}

Write a professional trend analysis report with:
1. A compelling SEO title (under 60 chars)
2. Meta description (under 155 chars)
3. Full HTML article body (use <h2>, <h3>, <p>, <ul> tags)

RULES:
- Focus on TRENDS (brands, products, lifestyle, places) — NOT on specific artists
- Artists should only appear as supporting evidence for trends
- Emphasize the massive fan battle participation numbers as proof of trend momentum
- Include deep links to ${MAIN_SITE_URL} where relevant
- Add 3-5 FAQ items at the end (for FAQ schema)

Return JSON:
{
  "title": "...",
  "meta_title": "...",
  "meta_description": "...",
  "html": "...",
  "faqs": [{"question":"...","answer":"..."}],
  "tags": ["...", "..."]
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const result = await res.json();
  return JSON.parse(result.choices[0].message.content);
}

// ── Build full HTML with deep links & structured data ──
function buildFullHtml(content: any, lang: string) {
  const deepLinkBanner = `
<div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:16px 20px;border-radius:12px;margin:24px 0;text-align:center;">
  <a href="${MAIN_SITE_URL}" style="color:#fff;text-decoration:none;font-weight:700;font-size:16px;">
    🔥 ${lang === "ko" ? "K-Trendz에서 실시간 트렌드 확인하기" : "Explore Live Trends on K-Trendz"} →
  </a>
</div>`;

  const battleCta = `
<div style="background:#1e1b4b;padding:16px 20px;border-radius:12px;margin:24px 0;text-align:center;">
  <a href="${MAIN_SITE_URL}/battle" style="color:#c4b5fd;text-decoration:none;font-weight:600;">
    ⚔️ ${lang === "ko" ? "팬 배틀에 참여하고 포인트 획득하기" : "Join Fan Battles & Earn Points"} →
  </a>
</div>`;

  return `${deepLinkBanner}\n${content.html}\n${battleCta}`;
}

function buildJsonLd(content: any, lang: string, reportDate: string) {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.meta_title || content.title,
    description: content.meta_description,
    datePublished: reportDate,
    dateModified: reportDate,
    author: { "@type": "Organization", name: "K-Trendz", url: MAIN_SITE_URL },
    publisher: { "@type": "Organization", name: "K-Trendz", url: MAIN_SITE_URL },
    inLanguage: lang === "ko" ? "ko-KR" : "en-US",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${MAIN_SITE_URL}/report/` },
  };

  const faqLd = content.faqs?.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faqs.map((f: any) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  } : null;

  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `K-Trendz Trend Report ${reportDate}`,
    description: "Korean trend analysis data from K-Trendz discovery engine",
    creator: { "@type": "Organization", name: "K-Trendz" },
    datePublished: reportDate,
    license: "https://creativecommons.org/licenses/by-nc/4.0/",
  };

  const scripts = [articleLd, datasetLd];
  if (faqLd) scripts.push(faqLd);

  return scripts.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("\n");
}

// ── Ghost publish ──
async function publishToGhost(ghostUrl: string, token: string, post: any) {
  const baseUrl = ghostUrl.replace(/\/ghost\/?$/, "");
  const url = `${baseUrl}/ghost/api/admin/posts/?source=html`;
  console.log(`Publishing to Ghost: ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Ghost ${token}` },
    body: JSON.stringify({ posts: [post] }),
  });
  const rawText = await res.text();
  console.log(`Ghost response status=${res.status}, content-type=${res.headers.get("content-type")}, body-length=${rawText.length}`);
  if (!res.ok) throw new Error(`Ghost API error ${res.status}: ${rawText.slice(0, 500)}`);
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Ghost returned non-JSON (status ${res.status}): ${rawText.slice(0, 300)}`);
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const ghostUrl = Deno.env.get("GHOST_URL");
    const ghostApiKey = Deno.env.get("GHOST_ADMIN_API_KEY");

    if (!openaiKey) throw new Error("Missing OPENAI_API_KEY");
    if (!ghostUrl || !ghostApiKey) throw new Error("Missing GHOST_URL or GHOST_ADMIN_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Determine report type from body or auto-detect (Sunday = weekly)
    let body: any = {};
    try { body = await req.json(); } catch { /* no body = auto */ }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const reportType: "daily" | "weekly" = body.report_type || (today.getUTCDay() === 0 ? "weekly" : "daily");

    // For weekly, look back 7 days for battle data
    const battleDate = reportType === "weekly"
      ? new Date(today.getTime() - 6 * 86400000).toISOString().split("T")[0]
      : todayStr;

    console.log(`Generating ${reportType} report for ${todayStr}`);

    // Fetch data
    const [keywords, battleStats, b2Items] = await Promise.all([
      fetchTrendKeywords(supabase, todayStr),
      fetchBattleStats(supabase, battleDate),
      fetchRecentB2Items(supabase),
    ]);

    if (keywords.length === 0) {
      console.warn("No trend keywords found for", todayStr);
      return new Response(JSON.stringify({ skipped: true, reason: "no_keywords" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate both KO and EN reports
    const results: any[] = [];

    for (const lang of ["ko", "en"] as const) {
      console.log(`Generating ${lang} report...`);
      const content = await generateReportContent(openaiKey, keywords, battleStats, b2Items, reportType, lang);

      const fullHtml = buildFullHtml(content, lang);
      const jsonLdHead = buildJsonLd(content, lang, todayStr);

      // hreflang tags
      const hreflangHead = `
<link rel="alternate" hreflang="ko" href="${MAIN_SITE_URL}/report/${todayStr}-ko/" />
<link rel="alternate" hreflang="en" href="${MAIN_SITE_URL}/report/${todayStr}-en/" />
<link rel="alternate" hreflang="x-default" href="${MAIN_SITE_URL}/report/${todayStr}-en/" />`;

      const codeinjection_head = `${jsonLdHead}\n${hreflangHead}`;

      const tags = [
        ...(content.tags || []),
        reportType === "weekly" ? "Weekly Report" : "Daily Report",
        lang === "ko" ? "한국어" : "English",
        "Trend Analysis",
      ];

      // Publish to Ghost
      const ghostToken = await createGhostJwt(ghostApiKey);
      const slugSuffix = `${todayStr}-${lang}`;
      const result = await publishToGhost(ghostUrl, ghostToken, {
        title: content.title,
        slug: `trend-report-${slugSuffix}`,
        html: fullHtml,
        status: "published",
        tags: tags.map((t: string) => ({ name: t })),
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        codeinjection_head,
      });

      const slug = result.posts?.[0]?.slug;
      results.push({
        lang,
        slug,
        url: slug ? `${ghostUrl}/${slug}/` : null,
        id: result.posts?.[0]?.id,
        title: content.title,
      });

      console.log(`Published ${lang} report: ${slug}`);
    }

    return new Response(JSON.stringify({
      success: true,
      report_type: reportType,
      date: todayStr,
      posts: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Auto-report error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
