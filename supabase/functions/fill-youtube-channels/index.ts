// YouTube Channel ID 자동 매칭: YouTube API로 공식채널 검색 (Topic 채널 자동 필터링)
// Topic 채널은 YouTube Search API로 검색 불가 → 수동 입력 필요
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
  error?: string;
}

// YouTube Channels API로 채널 ID의 실제 제목을 가져와 Topic 여부 확인
async function verifyNotTopic(
  ytApiKey: string,
  channelId: string,
): Promise<{ isValid: boolean; title: string }> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${ytApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return { isValid: false, title: "" };
  const data = await res.json();
  const title: string = data.items?.[0]?.snippet?.title || "";
  const isTopic = title.includes("- Topic") || title.includes("– Topic");
  return { isValid: !isTopic, title };
}

// YouTube Search API로 공식 채널 찾기 (Topic 제외, channels API로 검증)
async function findOfficialChannel(
  ytApiKey: string,
  artistName: string,
): Promise<{ channelId: string; title: string } | null> {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(artistName + " official")}&type=channel&part=id,snippet&maxResults=10&key=${ytApiKey}`;
  const res = await fetch(searchUrl);
  if (!res.ok) return null;

  const data = await res.json();
  for (const item of data.items || []) {
    const snippetTitle: string = item.snippet?.title || "";
    // 검색 결과 snippet에서 1차 필터
    if (snippetTitle.includes("- Topic") || snippetTitle.includes("– Topic")) continue;

    const candidateId = item.id?.channelId || item.snippet?.channelId;
    if (!candidateId) continue;

    // Channels API로 2차 검증 (snippet title과 실제 채널명이 다를 수 있음)
    const verify = await verifyNotTopic(ytApiKey, candidateId);
    if (verify.isValid) {
      return { channelId: candidateId, title: verify.title };
    } else {
      console.log(`  ⚠ Skipping Topic channel: ${candidateId} ("${verify.title}")`);
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

    // youtube_channel_id가 누락된 아티스트 조회
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

    console.log(`[fill-youtube-channels] Processing ${artists.length} artists (dryRun=${dryRun})`);

    const results: ChannelResult[] = [];
    let updated = 0;

    for (const artist of artists as any[]) {
      const name = artist.display_name || artist.wiki_entries?.title || "";
      if (!name) {
        results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null, error: "No name" });
        continue;
      }

      try {
        const found = await findOfficialChannel(ytApiKey, name);

        if (found) {
          results.push({
            id: artist.id,
            display_name: name,
            channelId: found.channelId,
            channelTitle: found.title,
          });

          if (!dryRun) {
            await sb
              .from("v3_artist_tiers")
              .update({ youtube_channel_id: found.channelId } as any)
              .eq("id", artist.id);
            updated++;
          }

          console.log(`  ✓ ${name} → ${found.channelId} ("${found.title}")`);
        } else {
          results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null });
          console.log(`  ✗ ${name} → not found`);
        }

        // API 쿼터 보호: 요청 간 200ms 대기
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        results.push({ id: artist.id, display_name: name, channelId: null, channelTitle: null, error: e.message });
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
