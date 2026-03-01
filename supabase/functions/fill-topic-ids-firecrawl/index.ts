// Firecrawl Search로 YouTube Topic Channel ID 자동 수집
// YouTube Music 아티스트의 Topic 채널 URL을 검색하여 채널 ID 추출
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TopicResult {
  id: string;
  display_name: string;
  topicChannelId: string | null;
  topicTitle?: string;
  method?: string;
  error?: string;
}

// Firecrawl Search로 Topic 채널 찾기
async function findTopicViaSearch(
  firecrawlKey: string,
  artistName: string,
): Promise<{ channelId: string; url: string } | null> {
  const query = `site:youtube.com "${artistName} - Topic" channel`;
  console.log(`  [Search] Query: ${query}`);

  const resp = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 5,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`  [Search] API error: ${resp.status} - ${errText}`);
    return null;
  }

  const data = await resp.json();
  const results = data?.data || [];

  for (const result of results) {
    const url = result.url || "";
    const title = result.title || "";
    // YouTube 채널 URL에서 ID 추출
    const channelMatch = url.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (channelMatch && (title.includes("- Topic") || title.includes("– Topic"))) {
      // 타이틀에서 아티스트명 매칭 확인 (오매칭 방지)
      const titleArtist = title.replace(/\s*-\s*Topic.*$/i, "").trim().toLowerCase();
      const inputName = artistName.toLowerCase();
      // 느슨한 매칭: 공백/특수문자 제거 후 비교
      const normalize = (s: string) => s.replace(/[^a-z0-9가-힣]/gi, "").toLowerCase();
      if (normalize(titleArtist).includes(normalize(inputName)) || normalize(inputName).includes(normalize(titleArtist))) {
        console.log(`  [Search] Matched: ${url} (title: ${title})`);
        return { channelId: channelMatch[1], url, title };
      } else {
        console.log(`  [Search] Skipped (name mismatch): "${titleArtist}" vs "${inputName}" — ${url}`);
      }
    }
  }

  return null;
}

// YouTube API로 채널이 실제 Topic 채널인지 검증
async function verifyTopicChannel(
  ytApiKey: string,
  channelId: string,
  artistName: string,
): Promise<{ isValid: boolean; title: string; subscribers: number; views: number }> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${ytApiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    console.warn(`  [Verify] API error for ${channelId}: ${resp.status}`);
    return { isValid: false, title: "", subscribers: 0, views: 0 };
  }
  const data = await resp.json();
  const ch = data?.items?.[0];
  if (!ch) return { isValid: false, title: "", subscribers: 0, views: 0 };

  const title = ch.snippet?.title || "";
  const subscribers = parseInt(ch.statistics?.subscriberCount || "0", 10);
  const views = parseInt(ch.statistics?.viewCount || "0", 10);
  const isTopic = title.includes("- Topic") || title.includes("– Topic");

  return { isValid: isTopic, title, subscribers, views };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const ytApiKey = Deno.env.get("YOUTUBE_API_KEY");

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier;
    const limitCount = body.limit || 10;

    // Topic Channel ID가 없는 아티스트 조회
    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_topic_channel_id, wiki_entry_id")
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
        JSON.stringify({ message: "All artists have Topic Channel IDs", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[fill-topic-firecrawl] Processing ${artists.length} artists (dryRun=${dryRun})`);

    const results: TopicResult[] = [];
    let updated = 0;

    for (const artist of artists) {
      const name = artist.display_name || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, topicChannelId: null, error: "No name" });
        continue;
      }

      try {
        const found = await findTopicViaSearch(firecrawlKey, name);

        if (!found) {
          results.push({ id: artist.id, display_name: name, topicChannelId: null, error: "Not found in search" });
          console.log(`  ✗ ${name} → not found`);
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        // Firecrawl Search 결과의 title에 이미 "- Topic" 확인됨 → YouTube API 검증 불필요
        console.log(`  ✓ ${name} → ${found.channelId} ("${found.title}")`);

        results.push({
          id: artist.id,
          display_name: name,
          topicChannelId: found.channelId,
          topicTitle: found.title,
          method: "search_title_match",
        });

        if (!dryRun) {
          await sb
            .from("v3_artist_tiers")
            .update({ youtube_topic_channel_id: found.channelId } as any)
            .eq("id", artist.id);
          updated++;
        }

        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        results.push({ id: artist.id, display_name: name, topicChannelId: null, error: e.message });
        console.error(`  ✗ ${name} → error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        totalProcessed: artists.length,
        found: results.filter((r) => r.topicChannelId).length,
        updated,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[fill-topic-firecrawl] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
