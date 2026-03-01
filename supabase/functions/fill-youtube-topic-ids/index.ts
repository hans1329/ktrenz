// YouTube Topic Channel ID 자동 매칭
// 아티스트명 + "- Topic" 패턴으로 YouTube API 검색 → Channel ID 검증/저장
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TopicResult {
  id: string;
  display_name: string;
  topicChannelId: string | null;
  error?: string;
}

// YouTube API로 Topic 채널 검색
async function findTopicChannel(
  ytApiKey: string,
  artistName: string,
): Promise<{ channelId: string; title: string } | null> {
  // 방법 1: "{artist} - Topic" 검색
  const queries = [
    `${artistName} - Topic`,
    `${artistName} – Topic`,
  ];

  for (const query of queries) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5&key=${ytApiKey}`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    
    for (const item of data.items || []) {
      const title = item.snippet?.title || "";
      // Topic 채널은 보통 "아티스트명 - Topic" 형태
      if (title.includes("- Topic") || title.includes("– Topic")) {
        const channelId = item.id?.channelId || item.snippet?.channelId;
        if (channelId) {
          // 검증: 채널 통계를 실제로 가져올 수 있는지 확인
          const verifyUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${ytApiKey}`;
          const verifyRes = await fetch(verifyUrl);
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.items?.[0]) {
              return { channelId, title };
            }
          }
        }
      }
    }
  }

  return null;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier;
    const limitCount = body.limit || 50;

    // youtube_topic_channel_id가 없는 아티스트 조회
    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_channel_id, youtube_topic_channel_id, wiki_entries!inner(title)")
      .is("youtube_topic_channel_id", null)
      .order("tier", { ascending: true })
      .limit(limitCount);

    if (tierFilter) {
      query = query.eq("tier", tierFilter);
    }

    const { data: artists, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!artists?.length) {
      return new Response(
        JSON.stringify({ message: "No artists without Topic Channel ID", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fill-youtube-topic-ids] Processing ${artists.length} artists (dryRun=${dryRun})`);

    const results: TopicResult[] = [];
    let updated = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, topicChannelId: null, error: "No name" });
        continue;
      }

      try {
        const found = await findTopicChannel(ytApiKey, name);

        if (found) {
          results.push({
            id: artist.id,
            display_name: name,
            topicChannelId: found.channelId,
          });

          if (!dryRun) {
            await sb
              .from("v3_artist_tiers")
              .update({ youtube_topic_channel_id: found.channelId } as any)
              .eq("id", artist.id);
            updated++;
          }

          console.log(`  ✓ ${name} → ${found.channelId} ("${found.title}")`);
        } else {
          results.push({ id: artist.id, display_name: name, topicChannelId: null, error: "No topic channel found" });
          console.log(`  ✗ ${name} → not found`);
        }

        // YouTube API 쿼터 보호: 요청 간 300ms 대기
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        results.push({ id: artist.id, display_name: name, topicChannelId: null, error: e.message });
        console.error(`  ✗ ${name} → error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ dryRun, totalProcessed: artists.length, updated, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fill-youtube-topic-ids] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
