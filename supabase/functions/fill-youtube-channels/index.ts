// 일회성 유틸리티: YouTube Data API로 아티스트명 검색 → 공식 채널 ID 자동 매칭
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
  channelTitle: string | null;
  subscriberCount: string | null;
  error?: string;
}

async function searchYouTubeChannel(
  apiKey: string,
  artistName: string
): Promise<{ channelId: string; title: string; subscriberCount: string } | null> {
  // 1) Search for the channel
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
    artistName + " official"
  )}&maxResults=5&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(`YouTube search failed: ${err}`);
  }
  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (items.length === 0) return null;

  // 2) Get channel details for all candidates to pick the best one
  const candidateIds = items.map((i: any) => i.snippet.channelId).join(",");
  const detailUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${candidateIds}&key=${apiKey}`;
  const detailRes = await fetch(detailUrl);
  if (!detailRes.ok) return { channelId: items[0].snippet.channelId, title: items[0].snippet.title, subscriberCount: "?" };

  const detailData = await detailRes.json();
  const channels = detailData.items || [];

  // Pick the channel with highest subscriber count (most likely official)
  let best = channels[0];
  let bestSubs = parseInt(best?.statistics?.subscriberCount || "0");
  for (const ch of channels) {
    const subs = parseInt(ch.statistics?.subscriberCount || "0");
    if (subs > bestSubs) {
      best = ch;
      bestSubs = subs;
    }
  }

  return {
    channelId: best.id,
    title: best.snippet.title,
    subscriberCount: best.statistics?.subscriberCount || "0",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Parse options
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun ?? true; // default: dry run (don't update DB)
    const tierFilter = body.tier; // optional: only process specific tier

    // Get artists without youtube_channel_id
    let query = sb
      .from("v3_artist_tiers")
      .select("id, display_name, youtube_channel_id, wiki_entry_id, wiki_entries!inner(title)")
      .is("youtube_channel_id", null);

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

    console.log(`[fill-youtube-channels] Processing ${artists.length} artists (dryRun=${dryRun})`);

    const results: ChannelResult[] = [];
    let updated = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null, subscriberCount: null, error: "No name" });
        continue;
      }

      try {
        // Rate limit: small delay between requests
        await new Promise((r) => setTimeout(r, 200));

        const result = await searchYouTubeChannel(apiKey, name);
        if (result) {
          results.push({
            id: artist.id,
            display_name: name,
            channelId: result.channelId,
            channelTitle: result.title,
            subscriberCount: result.subscriberCount,
          });

          if (!dryRun) {
            await sb
              .from("v3_artist_tiers")
              .update({ youtube_channel_id: result.channelId } as any)
              .eq("id", artist.id);
            updated++;
          }

          console.log(`  ✓ ${name} → ${result.channelId} (${result.title}, ${Number(result.subscriberCount).toLocaleString()} subs)`);
        } else {
          results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null, subscriberCount: null, error: "No channel found" });
          console.log(`  ✗ ${name} → not found`);
        }
      } catch (e) {
        results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null, subscriberCount: null, error: e.message });
        console.error(`  ✗ ${name} → error: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        totalProcessed: artists.length,
        updated,
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
