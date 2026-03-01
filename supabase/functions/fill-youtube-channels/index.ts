// YouTube Channel ID 자동 매칭: OpenAI로 채널명 추천 → YouTube API로 검증
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChannelResult {
  id: string;
  display_name: string;
  channelId: string | null;
  matchedUrl: string | null;
  error?: string;
}

// OpenAI로 아티스트의 공식 YouTube 채널 핸들/이름 추천
async function suggestYoutubeChannel(
  openaiKey: string,
  artistName: string
): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a K-Pop expert. Given a K-Pop artist or group name, return their official YouTube channel handle(s) or channel name(s). Return ONLY a JSON array of strings, no explanation. Include @handle format if known. Example: [\"@BLACKPINK\", \"BLACKPINK\"]",
        },
        {
          role: "user",
          content: `Artist: "${artistName}". Return their official YouTube channel handle(s).`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [content];
  } catch {
    return [content];
  }
}

// YouTube API로 핸들/채널명 → Channel ID 검증
async function resolveToChannelId(
  ytApiKey: string,
  query: string
): Promise<string | null> {
  // @handle 형식이면 forHandle API 사용
  if (query.startsWith("@")) {
    const handle = query.slice(1);
    const url = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(handle)}&part=id,snippet&key=${ytApiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const item = data.items?.[0];
      if (item?.id) {
        // Topic 채널이면 스킵
        const title = item.snippet?.title || "";
        if (title.includes("- Topic") || title.includes("– Topic")) {
          console.log(`  ⚠ Handle "${query}" resolved to Topic channel "${title}", skipping`);
          return null;
        }
        return item.id;
      }
    }
  }

  // 검색 API로 채널 찾기
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(query)}&type=channel&part=id,snippet&maxResults=5&key=${ytApiKey}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;

  const searchData = await searchRes.json();
  const items = searchData.items || [];

  // Topic 채널을 제외한 첫 번째 채널 결과 반환
  for (const item of items) {
    const title = item.snippet?.title || "";
    if (title.includes("- Topic") || title.includes("– Topic")) {
      console.log(`  ⚠ Skipping Topic channel: "${title}"`);
      continue;
    }
    return item.id?.channelId || item.snippet?.channelId || null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 핸들 → Channel ID 변환 모드 (기존 유지)
    if (body.resolveHandle) {
      const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");
      if (!ytApiKey) {
        return new Response(
          JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const channelId = await resolveToChannelId(ytApiKey, `@${body.resolveHandle}`);
      return new Response(
        JSON.stringify({ handle: body.resolveHandle, channelId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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
    const limitCount = body.limit || 10;

    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_channel_id, wiki_entries!inner(title)")
      .is("youtube_channel_id", null)
      .order("tier", { ascending: true })
      .limit(limitCount);

    if (tierFilter) {
      query = query.eq("tier", tierFilter);
    }

    const { data: artists, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!artists?.length) {
      return new Response(
        JSON.stringify({ message: "No artists without YouTube channel ID", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[fill-youtube-channels] Processing ${artists.length} artists via OpenAI+YouTube API (dryRun=${dryRun})`);

    const results: ChannelResult[] = [];
    let updated = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, channelId: null, matchedUrl: null, error: "No name" });
        continue;
      }

      try {
        // Step 1: OpenAI로 채널 핸들/이름 추천
        const suggestions = await suggestYoutubeChannel(openaiKey, name);
        console.log(`  ${name} → OpenAI suggestions: ${JSON.stringify(suggestions)}`);

        // Step 2: YouTube API로 각 추천을 검증
        let foundId: string | null = null;
        let matchedQuery = "";

        for (const suggestion of suggestions) {
          foundId = await resolveToChannelId(ytApiKey, suggestion);
          if (foundId) {
            matchedQuery = suggestion;
            break;
          }
        }

        if (foundId) {
          results.push({
            id: artist.id,
            display_name: name,
            channelId: foundId,
            matchedUrl: matchedQuery,
          });

          if (!dryRun) {
            await sb
              .from("v3_artist_tiers")
              .update({ youtube_channel_id: foundId } as any)
              .eq("id", artist.id);
            updated++;
          }

          console.log(`  ✓ ${name} → ${foundId} (via "${matchedQuery}")`);
        } else {
          results.push({ id: artist.id, display_name: name, channelId: null, matchedUrl: null, error: "No channel found" });
          console.log(`  ✗ ${name} → not found`);
        }
      } catch (e) {
        results.push({ id: artist.id, display_name: name, channelId: null, matchedUrl: null, error: e.message });
        console.error(`  ✗ ${name} → error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ dryRun, totalProcessed: artists.length, updated, results }),
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
