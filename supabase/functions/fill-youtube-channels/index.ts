// YouTube Channel ID 자동 매칭: YouTube Search API로 직접 검색
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
  error?: string;
}

// YouTube Search API로 채널 검색
async function searchChannel(
  ytApiKey: string,
  query: string,
  maxResults = 5,
): Promise<Array<{ channelId: string; title: string }>> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=${maxResults}&key=${ytApiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.warn(`  YouTube Search API error: ${text}`);
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    channelId: item.snippet?.channelId || item.id?.channelId || "",
    title: item.snippet?.title || "",
  }));
}

// YouTube Channels API로 채널 정보 확인
async function getChannelInfo(
  ytApiKey: string,
  channelId: string,
): Promise<{ exists: boolean; title: string; isTopic: boolean; subscriberCount: number }> {
  if (!channelId) return { exists: false, title: "", isTopic: false, subscriberCount: 0 };
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${ytApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return { exists: false, title: "", isTopic: false, subscriberCount: 0 };
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { exists: false, title: "", isTopic: false, subscriberCount: 0 };
  const title = item.snippet?.title || "";
  const isTopic = title.includes("- Topic") || title.includes("– Topic");
  const subscriberCount = parseInt(item.statistics?.subscriberCount || "0", 10);
  return { exists: true, title, isTopic, subscriberCount };
}

// 공식 채널 찾기: "{artist name}" 검색 → Topic이 아닌 가장 관련성 높은 채널
async function findOfficialChannel(
  ytApiKey: string,
  artistName: string,
): Promise<{ channelId: string | null; title: string | null }> {
  // 여러 검색어로 시도
  const queries = [
    `${artistName} official channel`,
    `${artistName} K-pop`,
    artistName,
  ];

  for (const query of queries) {
    const results = await searchChannel(ytApiKey, query, 5);
    // Topic 채널 제외, 이름이 아티스트와 관련 있는 것 선택
    const nameLower = artistName.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    for (const r of results) {
      if (r.title.includes("- Topic") || r.title.includes("– Topic")) continue;
      
      const titleLower = r.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      // 아티스트 이름이 채널명에 포함되어야 함
      if (titleLower.includes(nameLower) || nameLower.includes(titleLower)) {
        // 채널 정보로 최종 확인
        const info = await getChannelInfo(ytApiKey, r.channelId);
        if (info.exists && !info.isTopic) {
          return { channelId: r.channelId, title: info.title };
        }
      }
    }

    // 이름 매칭이 안 되면 첫 번째 비-Topic 결과 사용 (구독자 1000 이상만)
    for (const r of results) {
      if (r.title.includes("- Topic") || r.title.includes("– Topic")) continue;
      const info = await getChannelInfo(ytApiKey, r.channelId);
      if (info.exists && !info.isTopic && info.subscriberCount >= 1000) {
        return { channelId: r.channelId, title: info.title };
      }
    }
  }
  return { channelId: null, title: null };
}

// Topic 채널 찾기: "{artist name} - Topic" 검색
async function findTopicChannel(
  ytApiKey: string,
  artistName: string,
): Promise<{ channelId: string | null; title: string | null }> {
  const results = await searchChannel(ytApiKey, `${artistName} - Topic`, 5);
  
  for (const r of results) {
    if (r.title.includes("- Topic") || r.title.includes("– Topic")) {
      const info = await getChannelInfo(ytApiKey, r.channelId);
      if (info.exists && info.isTopic) {
        return { channelId: r.channelId, title: info.title };
      }
    }
  }
  return { channelId: null, title: null };
}

// @handle → Channel ID 변환
async function resolveHandle(
  ytApiKey: string,
  handle: string,
): Promise<string | null> {
  const cleanHandle = handle.startsWith("@") ? handle.slice(1) : handle;
  const url = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(cleanHandle)}&part=id,snippet&key=${ytApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item?.id) return null;
  const title = item.snippet?.title || "";
  if (title.includes("- Topic") || title.includes("– Topic")) {
    console.log(`  ⚠ Handle "@${cleanHandle}" resolved to Topic channel, skipping`);
    return null;
  }
  return item.id;
}

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
      const handle = body.resolveHandle;
      const channelId = await resolveHandle(ytApiKey, handle);
      return new Response(
        JSON.stringify({ handle, channelId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier;
    const limitCount = body.limit || 50;
    const target: string = body.target || "both";

    // 누락된 아티스트 조회
    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_channel_id, youtube_topic_channel_id, wiki_entries!inner(title)")
      .order("tier", { ascending: true })
      .limit(limitCount);

    if (tierFilter) {
      query = query.eq("tier", tierFilter);
    }

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
        JSON.stringify({ message: "No artists to process", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fill-youtube-channels] Processing ${artists.length} artists, target=${target}, dryRun=${dryRun}`);

    const results: ChannelResult[] = [];
    let updatedOfficial = 0;
    let updatedTopic = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, officialChannelId: null, officialChannelTitle: null, topicChannelId: null, topicChannelTitle: null, error: "No name" });
        continue;
      }

      try {
        let verifiedOfficial: string | null = artist.youtube_channel_id || null;
        let verifiedOfficialTitle: string | null = null;
        let verifiedTopic: string | null = artist.youtube_topic_channel_id || null;
        let verifiedTopicTitle: string | null = null;

        // 공식 채널 검색 (누락 시)
        if (!verifiedOfficial && (target === "official" || target === "both")) {
          const found = await findOfficialChannel(ytApiKey, name);
          if (found.channelId) {
            verifiedOfficial = found.channelId;
            verifiedOfficialTitle = found.title;
            console.log(`  ✓ ${name} → official: ${found.channelId} ("${found.title}")`);
          } else {
            console.log(`  ✗ ${name} → official not found`);
          }
        }

        // Topic 채널 검색 (누락 시)
        if (!verifiedTopic && (target === "topic" || target === "both")) {
          const found = await findTopicChannel(ytApiKey, name);
          if (found.channelId) {
            verifiedTopic = found.channelId;
            verifiedTopicTitle = found.title;
            console.log(`  ✓ ${name} → topic: ${found.channelId} ("${found.title}")`);
          } else {
            console.log(`  ✗ ${name} → topic not found`);
          }
        }

        results.push({
          id: artist.id,
          display_name: name,
          officialChannelId: verifiedOfficial,
          officialChannelTitle: verifiedOfficialTitle,
          topicChannelId: verifiedTopic,
          topicChannelTitle: verifiedTopicTitle,
        });

        if (!dryRun) {
          const updatePayload: Record<string, string | null> = {};
          if (!artist.youtube_channel_id && verifiedOfficial) {
            updatePayload.youtube_channel_id = verifiedOfficial;
            updatedOfficial++;
          }
          if (!artist.youtube_topic_channel_id && verifiedTopic) {
            updatePayload.youtube_topic_channel_id = verifiedTopic;
            updatedTopic++;
          }
          if (Object.keys(updatePayload).length > 0) {
            await sb
              .from("v3_artist_tiers")
              .update(updatePayload as any)
              .eq("id", artist.id);
          }
        }

        // 쿼터 보호: Search API는 100 units/call이므로 넉넉히 대기
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        results.push({ id: artist.id, display_name: name, officialChannelId: null, officialChannelTitle: null, topicChannelId: null, topicChannelTitle: null, error: e.message });
        console.error(`  ✗ ${name} → error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        target,
        totalProcessed: artists.length,
        updatedOfficial,
        updatedTopic,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fill-youtube-channels] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
