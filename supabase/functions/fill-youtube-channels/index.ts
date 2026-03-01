// YouTube Channel ID 자동 매칭: YouTube Search API로 공식채널 + Topic채널 동시 검색
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChannelResult {
  id: string;
  display_name: string;
  officialChannelId: string | null;
  topicChannelId: string | null;
  error?: string;
}

// YouTube Search API로 공식 채널 찾기 (Topic 제외)
async function findOfficialChannel(
  ytApiKey: string,
  artistName: string,
): Promise<string | null> {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(artistName)}&type=channel&part=id,snippet&maxResults=10&key=${ytApiKey}`;
  const res = await fetch(searchUrl);
  if (!res.ok) return null;

  const data = await res.json();
  for (const item of data.items || []) {
    const title: string = item.snippet?.title || "";
    // Topic 채널 제외
    if (title.includes("- Topic") || title.includes("– Topic")) continue;
    return item.id?.channelId || item.snippet?.channelId || null;
  }
  return null;
}

// YouTube Search API로 Topic 채널 찾기
async function findTopicChannel(
  ytApiKey: string,
  artistName: string,
): Promise<string | null> {
  const queries = [`${artistName} - Topic`, `${artistName} – Topic`];

  for (const query of queries) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5&key=${ytApiKey}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();

    for (const item of data.items || []) {
      const title: string = item.snippet?.title || "";
      if (title.includes("- Topic") || title.includes("– Topic")) {
        const channelId = item.id?.channelId || item.snippet?.channelId;
        if (channelId) return channelId;
      }
    }
  }
  return null;
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

  // Topic 채널이면 무시
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

    // 핸들 → Channel ID 변환 모드 (인라인 수정 다이얼로그용)
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
    // target: "official" | "topic" | "both" (default: "both")
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

    // target에 따라 필터링
    if (target === "official") {
      query = query.is("youtube_channel_id", null);
    } else if (target === "topic") {
      query = query.is("youtube_topic_channel_id", null);
    } else {
      // both: 어느 하나라도 누락
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
        results.push({ id: artist.id, display_name: name, officialChannelId: null, topicChannelId: null, error: "No name" });
        continue;
      }

      try {
        let officialId: string | null = artist.youtube_channel_id || null;
        let topicId: string | null = artist.youtube_topic_channel_id || null;

        // 공식 채널 검색 (누락 시)
        if (!officialId && (target === "official" || target === "both")) {
          officialId = await findOfficialChannel(ytApiKey, name);
          if (officialId) {
            console.log(`  ✓ ${name} → official: ${officialId}`);
          } else {
            console.log(`  ✗ ${name} → official not found`);
          }
          // API 쿼터 보호
          await new Promise(r => setTimeout(r, 200));
        }

        // Topic 채널 검색 (누락 시)
        if (!topicId && (target === "topic" || target === "both")) {
          topicId = await findTopicChannel(ytApiKey, name);
          if (topicId) {
            console.log(`  ✓ ${name} → topic: ${topicId}`);
          } else {
            console.log(`  ✗ ${name} → topic not found`);
          }
          // API 쿼터 보호
          await new Promise(r => setTimeout(r, 200));
        }

        results.push({
          id: artist.id,
          display_name: name,
          officialChannelId: officialId,
          topicChannelId: topicId,
        });

        if (!dryRun) {
          const updatePayload: Record<string, string | null> = {};
          if (!artist.youtube_channel_id && officialId) {
            updatePayload.youtube_channel_id = officialId;
            updatedOfficial++;
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
      } catch (e) {
        results.push({ id: artist.id, display_name: name, officialChannelId: null, topicChannelId: null, error: e.message });
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
