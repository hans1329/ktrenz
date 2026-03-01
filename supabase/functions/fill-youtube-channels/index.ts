// YouTube Channel ID 자동 매칭: OpenAI로 공식채널 + Topic 채널 ID 질의 → YouTube API로 검증
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
  officialChannelTitle: string | null;
  topicChannelId: string | null;
  topicChannelTitle: string | null;
  error?: string;
}

// OpenAI에 아티스트의 공식 YouTube 채널 ID와 Topic 채널 ID를 질의
async function askOpenAIForChannels(
  openaiKey: string,
  artistName: string,
): Promise<{ officialId: string | null; topicId: string | null }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a K-Pop YouTube channel expert. Given a K-Pop artist name, return their YouTube channel IDs.

Rules:
- "official_channel_id": The UC... channel ID of their OFFICIAL YouTube channel (where they upload MVs, content). NOT the auto-generated Topic channel.
- "topic_channel_id": The UC... channel ID of their auto-generated "Artist Name - Topic" channel on YouTube Music. Topic channels always have "- Topic" in their name.
- If unsure, return null for that field.
- Channel IDs always start with "UC" and are 24 characters long.

Return ONLY valid JSON: {"official_channel_id": "UC...", "topic_channel_id": "UC..."}`
        },
        {
          role: "user",
          content: `K-Pop artist: "${artistName}". Return their official YouTube channel ID and Topic channel ID.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      officialId: parsed.official_channel_id || null,
      topicId: parsed.topic_channel_id || null,
    };
  } catch {
    return { officialId: null, topicId: null };
  }
}

// YouTube Channels API로 채널 ID 검증 → 존재 여부 및 채널명 반환
async function verifyChannel(
  ytApiKey: string,
  channelId: string,
): Promise<{ exists: boolean; title: string; isTopic: boolean }> {
  if (!channelId || !channelId.startsWith("UC") || channelId.length !== 24) {
    return { exists: false, title: "", isTopic: false };
  }
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${ytApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return { exists: false, title: "", isTopic: false };
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return { exists: false, title: "", isTopic: false };
  const title = item.snippet?.title || "";
  const isTopic = title.includes("- Topic") || title.includes("– Topic");
  return { exists: true, title, isTopic };
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
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

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

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier;
    const limitCount = body.limit || 50;
    // target: "official" | "topic" | "both"
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
        // Step 1: OpenAI에 공식채널 + Topic 채널 ID 질의
        const aiResult = await askOpenAIForChannels(openaiKey, name);
        console.log(`  ${name} → OpenAI: official=${aiResult.officialId}, topic=${aiResult.topicId}`);

        let verifiedOfficial: string | null = artist.youtube_channel_id || null;
        let verifiedOfficialTitle: string | null = null;
        let verifiedTopic: string | null = artist.youtube_topic_channel_id || null;
        let verifiedTopicTitle: string | null = null;

        // Step 2: 공식 채널 검증 (누락 시)
        if (!verifiedOfficial && aiResult.officialId && (target === "official" || target === "both")) {
          const check = await verifyChannel(ytApiKey, aiResult.officialId);
          if (check.exists && !check.isTopic) {
            verifiedOfficial = aiResult.officialId;
            verifiedOfficialTitle = check.title;
            console.log(`  ✓ ${name} → official: ${aiResult.officialId} ("${check.title}")`);
          } else if (check.exists && check.isTopic) {
            // OpenAI가 Topic을 공식으로 준 경우 → Topic으로 사용하되 공식은 null
            console.log(`  ⚠ ${name} → OpenAI gave Topic channel as official: ${aiResult.officialId} ("${check.title}")`);
            if (!verifiedTopic) {
              verifiedTopic = aiResult.officialId;
              verifiedTopicTitle = check.title;
            }
          } else {
            console.log(`  ✗ ${name} → official ${aiResult.officialId} not verified`);
          }
        }

        // Step 3: Topic 채널 검증 (누락 시)
        if (!verifiedTopic && aiResult.topicId && (target === "topic" || target === "both")) {
          const check = await verifyChannel(ytApiKey, aiResult.topicId);
          if (check.exists) {
            verifiedTopic = aiResult.topicId;
            verifiedTopicTitle = check.title;
            console.log(`  ✓ ${name} → topic: ${aiResult.topicId} ("${check.title}")`);
          } else {
            console.log(`  ✗ ${name} → topic ${aiResult.topicId} not verified`);
          }
        }

        // 교차 검증: 공식 채널에 Topic이 들어간 경우 swap
        if (verifiedOfficial && !verifiedTopic) {
          const recheck = await verifyChannel(ytApiKey, verifiedOfficial);
          if (recheck.isTopic) {
            console.log(`  ⚠ ${name} → swapping: official was actually Topic`);
            verifiedTopic = verifiedOfficial;
            verifiedTopicTitle = recheck.title;
            verifiedOfficial = null;
            verifiedOfficialTitle = null;
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

        // 쿼터 보호
        await new Promise(r => setTimeout(r, 100));
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
