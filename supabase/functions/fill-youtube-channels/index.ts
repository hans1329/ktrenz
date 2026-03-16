// fill-youtube-channels: YouTube 채널 ID 자동 매칭
// 전략: Search API 최소화 (100 units/call) + 배치 제한 + 정확도 향상
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChannelResult {
  id: string;
  display_name: string;
  officialChannelId: string | null;
  officialChannelTitle: string | null;
  topicChannelId: string | null;
  topicChannelTitle: string | null;
  confidence: number;
  searchQueries: number;
  error?: string;
}

// ── YouTube API helpers ──

async function ytSearch(
  apiKey: string,
  query: string,
  maxResults = 5,
): Promise<Array<{ channelId: string; title: string }>> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=${maxResults}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  [yt-search] API error ${res.status}: ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    channelId: item.snippet?.channelId || item.id?.channelId || "",
    title: item.snippet?.title || "",
  }));
}

async function ytChannelInfo(
  apiKey: string,
  channelId: string,
): Promise<{ exists: boolean; title: string; isTopic: boolean; subscriberCount: number; customUrl: string }> {
  if (!channelId) return { exists: false, title: "", isTopic: false, subscriberCount: 0, customUrl: "" };
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return { exists: false, title: "", isTopic: false, subscriberCount: 0, customUrl: "" };
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { exists: false, title: "", isTopic: false, subscriberCount: 0, customUrl: "" };
  const title = item.snippet?.title || "";
  const isTopic = /[-–]\s*Topic$/i.test(title);
  const subscriberCount = parseInt(item.statistics?.subscriberCount || "0", 10);
  const customUrl = item.snippet?.customUrl || "";
  return { exists: true, title, isTopic, subscriberCount, customUrl };
}

async function resolveHandle(apiKey: string, handle: string): Promise<string | null> {
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
  const url = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(cleanHandle)}&part=id,snippet&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item?.id) return null;
  const title = item.snippet?.title || "";
  if (/[-–]\s*Topic$/i.test(title)) {
    console.log(`  ⚠ Handle "@${cleanHandle}" → Topic channel, skipping`);
    return null;
  }
  return item.id;
}

// ── 이름 정규화 ──

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function nameMatchScore(channelTitle: string, searchTerms: string[]): number {
  const normTitle = normalize(channelTitle);
  let bestScore = 0;
  for (const term of searchTerms) {
    const normTerm = normalize(term);
    if (!normTerm) continue;
    if (normTitle === normTerm) return 100; // 완전 일치
    if (normTitle.startsWith(normTerm) || normTitle.endsWith(normTerm)) {
      bestScore = Math.max(bestScore, 80);
    } else if (normTitle.includes(normTerm)) {
      bestScore = Math.max(bestScore, 60);
    }
    // 역방향: 채널명이 검색어에 포함
    if (normTerm.includes(normTitle) && normTitle.length >= 3) {
      bestScore = Math.max(bestScore, 50);
    }
  }
  return bestScore;
}

// ── 공식 채널 찾기 (Search 1회만) ──

async function findOfficialChannel(
  apiKey: string,
  searchTerms: string[],
): Promise<{ channelId: string | null; title: string | null; confidence: number; queries: number }> {
  // 가장 좋은 검색어 선택: 영문명 우선 (YouTube 검색 정확도 높음)
  const primaryTerm = searchTerms.find(t => /^[A-Za-z0-9\s\-()]+$/.test(t)) || searchTerms[0];
  const query = `${primaryTerm} official`;

  const results = await ytSearch(apiKey, query, 5);
  if (!results.length) return { channelId: null, title: null, confidence: 0, queries: 1 };

  // 후보 평가: Topic 제외 + 이름 매칭 점수 + 구독자 수
  type Candidate = { channelId: string; title: string; matchScore: number; subscribers: number };
  const candidates: Candidate[] = [];

  for (const r of results) {
    if (/[-–]\s*Topic$/i.test(r.title)) continue;
    const matchScore = nameMatchScore(r.title, searchTerms);
    if (matchScore < 50) continue; // 최소 부분 매칭 필요

    const info = await ytChannelInfo(apiKey, r.channelId);
    if (!info.exists || info.isTopic) continue;
    if (info.subscriberCount < 1000) continue; // 소규모 채널 제외

    candidates.push({
      channelId: r.channelId,
      title: info.title,
      matchScore,
      subscribers: info.subscriberCount,
    });
  }

  if (!candidates.length) return { channelId: null, title: null, confidence: 0, queries: 1 };

  // 매칭 점수 우선, 동점이면 구독자 수
  candidates.sort((a, b) => b.matchScore - a.matchScore || b.subscribers - a.subscribers);
  const best = candidates[0];

  // 신뢰도 계산: 매칭 점수 + 구독자 기반 보너스
  let confidence = best.matchScore;
  if (best.subscribers >= 1_000_000) confidence = Math.min(100, confidence + 10);
  if (best.subscribers >= 100_000) confidence = Math.min(100, confidence + 5);

  return { channelId: best.channelId, title: best.title, confidence, queries: 1 };
}

// ── Topic 채널 찾기 (Search 1회만) ──

async function findTopicChannel(
  apiKey: string,
  searchTerms: string[],
): Promise<{ channelId: string | null; title: string | null; queries: number }> {
  const primaryTerm = searchTerms.find(t => /^[A-Za-z0-9\s\-()]+$/.test(t)) || searchTerms[0];
  const results = await ytSearch(apiKey, `${primaryTerm} - Topic`, 5);

  for (const r of results) {
    if (!/[-–]\s*Topic$/i.test(r.title)) continue;
    // Topic 채널 이름에서 아티스트명 부분 추출하여 매칭 확인
    const topicName = r.title.replace(/\s*[-–]\s*Topic$/i, "").trim();
    const score = nameMatchScore(topicName, searchTerms);
    if (score < 60) continue;

    const info = await ytChannelInfo(apiKey, r.channelId);
    if (info.exists && info.isTopic) {
      return { channelId: r.channelId, title: info.title, queries: 1 };
    }
  }
  return { channelId: null, title: null, queries: 1 };
}

// ── 아티스트에서 검색 키워드 추출 ──

function getSearchTerms(artist: any): string[] {
  const terms: string[] = [];
  const name = artist.display_name || artist.wiki_entries?.title || "";
  if (name) terms.push(name);

  // wiki_entries에서 한글/영문/별칭 추출
  const wiki = artist.wiki_entries;
  if (wiki?.title && wiki.title !== name) terms.push(wiki.title);

  const meta = wiki?.metadata as any;
  if (meta?.english_name) terms.push(meta.english_name);
  if (meta?.korean_name) terms.push(meta.korean_name);
  if (Array.isArray(meta?.aliases)) terms.push(...meta.aliases);

  return [...new Set(terms.filter(Boolean))];
}

// ══════════════════════════════════════
// Main handler
// ══════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");

    if (!ytApiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 핸들 → Channel ID 변환 모드
    if (body.resolveHandle) {
      const channelId = await resolveHandle(ytApiKey, body.resolveHandle);
      return new Response(
        JSON.stringify({ handle: body.resolveHandle, channelId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier ?? 1; // 기본값: Tier 1만
    const target: string = body.target || "both";
    // 60초 타임아웃 보호: 아티스트당 ~4초 (Search 1회 + Channel 확인) → 최대 10명
    const MAX_PER_INVOCATION = 10;
    const limitCount = Math.min(body.limit || MAX_PER_INVOCATION, MAX_PER_INVOCATION);
    const offset = body.offset || 0;

    // 누락된 아티스트 조회 (metadata 포함)
    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_channel_id, youtube_topic_channel_id, wiki_entry_id, wiki_entries!inner(title, metadata)")
      .eq("tier", tierFilter)
      .order("wiki_entry_id", { ascending: true })
      .range(offset, offset + limitCount - 1);

    if (target === "official") {
      query = query.is("youtube_channel_id", null);
    } else if (target === "topic") {
      query = query.is("youtube_topic_channel_id", null);
    } else {
      query = query.or("youtube_channel_id.is.null,youtube_topic_channel_id.is.null");
    }

    const { data: artists, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!artists?.length) {
      return new Response(
        JSON.stringify({ message: "No artists to process", offset, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 전체 미매칭 수 조회 (remaining 계산용)
    let countQuery = sb
      .from("v3_artist_tiers")
      .select("id", { count: "exact", head: true })
      .eq("tier", tierFilter);
    if (target === "official") {
      countQuery = countQuery.is("youtube_channel_id", null);
    } else if (target === "topic") {
      countQuery = countQuery.is("youtube_topic_channel_id", null);
    } else {
      countQuery = countQuery.or("youtube_channel_id.is.null,youtube_topic_channel_id.is.null");
    }
    const { count: totalRemaining } = await countQuery;

    console.log(`[fill-youtube-channels] Processing ${artists.length}/${totalRemaining} artists (offset=${offset}, target=${target}, dryRun=${dryRun})`);

    const results: ChannelResult[] = [];
    let updatedOfficial = 0;
    let updatedTopic = 0;
    let totalSearchQueries = 0;

    for (const artist of artists as any[]) {
      const searchTerms = getSearchTerms(artist);
      const name = searchTerms[0] || "";
      if (!name) {
        results.push({ id: artist.id, display_name: "", officialChannelId: null, officialChannelTitle: null, topicChannelId: null, topicChannelTitle: null, confidence: 0, searchQueries: 0, error: "No name" });
        continue;
      }

      try {
        let officialId: string | null = artist.youtube_channel_id || null;
        let officialTitle: string | null = null;
        let topicId: string | null = artist.youtube_topic_channel_id || null;
        let topicTitle: string | null = null;
        let confidence = 0;
        let queries = 0;

        // 공식 채널 검색 (누락 시, Search API 1회)
        if (!officialId && (target === "official" || target === "both")) {
          const found = await findOfficialChannel(ytApiKey, searchTerms);
          queries += found.queries;
          if (found.channelId) {
            officialId = found.channelId;
            officialTitle = found.title;
            confidence = found.confidence;
            console.log(`  ✓ ${name} → official: ${found.channelId} ("${found.title}") confidence=${found.confidence}`);
          } else {
            console.log(`  ✗ ${name} → official not found (terms: ${searchTerms.join(", ")})`);
          }
        }

        // Topic 채널 검색 (누락 시, Search API 1회)
        if (!topicId && (target === "topic" || target === "both")) {
          const found = await findTopicChannel(ytApiKey, searchTerms);
          queries += found.queries;
          if (found.channelId) {
            topicId = found.channelId;
            topicTitle = found.title;
            console.log(`  ✓ ${name} → topic: ${found.channelId} ("${found.title}")`);
          } else {
            console.log(`  ✗ ${name} → topic not found`);
          }
        }

        totalSearchQueries += queries;

        results.push({
          id: artist.id,
          display_name: name,
          officialChannelId: officialId,
          officialChannelTitle: officialTitle,
          topicChannelId: topicId,
          topicChannelTitle: topicTitle,
          confidence,
          searchQueries: queries,
        });

        // 실제 업데이트 (dryRun=false + confidence >= 70)
        if (!dryRun) {
          const updatePayload: Record<string, string | null> = {};
          if (!artist.youtube_channel_id && officialId && confidence >= 70) {
            updatePayload.youtube_channel_id = officialId;
            updatedOfficial++;
          } else if (!artist.youtube_channel_id && officialId && confidence < 70) {
            console.log(`  ⚠ ${name}: official found but low confidence (${confidence}), skipping update`);
          }
          if (!artist.youtube_topic_channel_id && topicId) {
            updatePayload.youtube_topic_channel_id = topicId;
            updatedTopic++;
          }
          if (Object.keys(updatePayload).length > 0) {
            await sb
              .from("v3_artist_tiers")
              .update(updatePayload as any)
              .eq("id", artist.id);
          }
        }

        // Search API 쿼터 보호 (100 units/call → 아티스트 간 500ms 대기)
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        results.push({ id: artist.id, display_name: name, officialChannelId: null, officialChannelTitle: null, topicChannelId: null, topicChannelTitle: null, confidence: 0, searchQueries: 0, error: (e as Error).message });
        console.error(`  ✗ ${name} → error: ${(e as Error).message}`);
      }
    }

    const hasMore = (totalRemaining || 0) > offset + artists.length;

    console.log(`[fill-youtube-channels] Done: ${artists.length} processed, ${updatedOfficial} official + ${updatedTopic} topic updated, ${totalSearchQueries} search API calls, hasMore=${hasMore}`);

    return new Response(
      JSON.stringify({
        dryRun,
        target,
        tier: tierFilter,
        offset,
        processed: artists.length,
        totalRemaining: totalRemaining || 0,
        hasMore,
        nextOffset: hasMore ? offset + artists.length : null,
        updatedOfficial,
        updatedTopic,
        totalSearchQueries,
        // 쿼터 소모 추정: Search=100, Channels=1 per call
        estimatedQuotaUsed: totalSearchQueries * 100 + totalSearchQueries * 3,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fill-youtube-channels] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
