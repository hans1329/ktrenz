// YouTube Channel ID 자동 매칭: Firecrawl search로 YouTube 채널 URL에서 ID 추출
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

// YouTube channel URL에서 channel ID 추출
function extractChannelId(url: string): string | null {
  // /channel/UCxxxxxx 패턴
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) return channelMatch[1];
  return null;
}

async function findChannelViaFirecrawl(
  apiKey: string,
  artistName: string
): Promise<{ channelId: string; url: string } | null> {
  const query = `"${artistName}" official youtube channel site:youtube.com/channel`;

  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: 10, scrapeOptions: { formats: ["markdown"] } }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Firecrawl search failed: ${err}`);
  }

  const data = await response.json();
  const results = data.data || [];

  // YouTube channel URL에서 UC... ID 추출
  for (const r of results) {
    const url = r.url || "";
    const channelId = extractChannelId(url);
    if (channelId) {
      return { channelId, url };
    }
  }

  // URL에서 못 찾으면 결과 텍스트에서 시도
  for (const r of results) {
    const text = (r.markdown || r.description || "") + " " + (r.url || "");
    const match = text.match(/UC[\w-]{20,}/);
    if (match) {
      return { channelId: match[0], url: r.url || "" };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun ?? true;
    const tierFilter = body.tier;
    const limitCount = body.limit || 10; // Firecrawl rate limit 고려

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

    console.log(`[fill-youtube-channels] Processing ${artists.length} artists via Firecrawl (dryRun=${dryRun})`);

    const results: ChannelResult[] = [];
    let updated = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, channelId: null, matchedUrl: null, error: "No name" });
        continue;
      }

      try {
        await new Promise((r) => setTimeout(r, 100)); // rate limit

        const result = await findChannelViaFirecrawl(firecrawlKey, name);
        if (result) {
          results.push({
            id: artist.id,
            display_name: name,
            channelId: result.channelId,
            matchedUrl: result.url,
          });

          if (!dryRun) {
            await sb
              .from("v3_artist_tiers")
              .update({ youtube_channel_id: result.channelId } as any)
              .eq("id", artist.id);
            updated++;
          }

          console.log(`  ✓ ${name} → ${result.channelId} (${result.url})`);
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
