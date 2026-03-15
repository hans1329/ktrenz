// scan-external-videos: 모니터링 대상 채널의 최근 영상을 스캔하여
// 아티스트 출연 매칭 + 조회수/댓글 메트릭 수집
// 결과: ktrenz_external_video_matches + ktrenz_data_snapshots(platform: "external_videos")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");

    if (!youtubeApiKey) {
      return new Response(
        JSON.stringify({ error: "YOUTUBE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const tierSnapshotAt = typeof body?.tierSnapshotAt === "string" && !Number.isNaN(Date.parse(body.tierSnapshotAt))
      ? body.tierSnapshotAt
      : null;

    // 1) 활성화된 watched channels 가져오기
    const { data: channels, error: chErr } = await sb
      .from("ktrenz_watched_channels")
      .select("channel_id, channel_name, category")
      .eq("is_active", true);

    if (chErr) throw chErr;
    if (!channels?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active watched channels" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Tier1 아티스트 + 한글/영문 매핑 가져오기 (snapshot 고정 + 정렬)
    let tierQuery = sb
      .from("v3_artist_tiers")
      .select("wiki_entry_id")
      .eq("tier", 1)
      .order("wiki_entry_id", { ascending: true });

    if (tierSnapshotAt) {
      tierQuery = tierQuery.lte("updated_at", tierSnapshotAt);
    }

    const { data: tier1Entries } = await tierQuery;
    const orderedTier1Ids = [...new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id).filter(Boolean))];

    if (!orderedTier1Ids.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No tier 1 artists", tierSnapshotAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: allArtists } = await sb
      .from("wiki_entries")
      .select("id, title, metadata")
      .in("schema_type", ["artist", "member"])
      .in("id", orderedTier1Ids);

    const artistMap = new Map<string, any>((allArtists || []).map((a: any) => [a.id, a]));
    const artists = orderedTier1Ids.map((id: string) => artistMap.get(id)).filter(Boolean);

    if (!artists?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No artists found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 아티스트 검색 키워드 생성 (한글명 + 영문명 + 별칭)
    const artistSearchTerms: { id: string; terms: string[] }[] = artists.map((a: any) => {
      const terms = [a.title];
      const meta = a.metadata as any;
      if (meta?.english_name) terms.push(meta.english_name);
      if (meta?.korean_name) terms.push(meta.korean_name);
      if (meta?.aliases) terms.push(...meta.aliases);
      if (meta?.hashtags) terms.push(...meta.hashtags);
      return { id: a.id, terms: [...new Set(terms.filter(Boolean))] };
    });

    console.log(`[scan-external] Scanning ${channels.length} channels for ${artists.length} artists${tierSnapshotAt ? ` (snapshotAt=${tierSnapshotAt})` : ""}`);

    let totalMatches = 0;
    let totalVideosScanned = 0;
    const artistMetrics: Record<string, { totalViews: number; totalComments: number; videoCount: number }> = {};

    // 3) 각 채널의 최근 영상 스캔
    for (const channel of channels) {
      try {
        // 최근 업로드 10개 가져오기 (playlistItems API: 1 unit)
        const uploadsPlaylistId = "UU" + channel.channel_id.slice(2);
        const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${youtubeApiKey}`;
        const plResp = await fetch(plUrl);
        
        if (!plResp.ok) {
          console.warn(`[scan-external] PlaylistItems failed for ${channel.channel_name}: ${plResp.status}`);
          continue;
        }

        const plData = await plResp.json();
        const items = plData?.items || [];
        
        if (!items.length) continue;

        // 영상 제목에서 아티스트 매칭
        const videoIds: string[] = [];
        const videoTitles: Record<string, string> = {};
        
        for (const item of items) {
          const videoId = item.contentDetails?.videoId;
          const title = item.snippet?.title || "";
          if (videoId) {
            videoIds.push(videoId);
            videoTitles[videoId] = title;
          }
        }

        if (!videoIds.length) continue;

        // 영상 통계 가져오기 (videos API: 1 unit)
        const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${youtubeApiKey}`;
        const vResp = await fetch(vUrl);
        if (!vResp.ok) continue;
        const vData = await vResp.json();
        
        const videoStats: Record<string, { views: number; comments: number; likes: number }> = {};
        for (const v of vData?.items || []) {
          videoStats[v.id] = {
            views: parseInt(v.statistics?.viewCount) || 0,
            comments: parseInt(v.statistics?.commentCount) || 0,
            likes: parseInt(v.statistics?.likeCount) || 0,
          };
        }

        totalVideosScanned += videoIds.length;

        // 제목에서 아티스트 매칭
        for (const videoId of videoIds) {
          const title = videoTitles[videoId] || "";
          const titleLower = title.toLowerCase();
          const stats = videoStats[videoId];
          if (!stats) continue;

          for (const artist of artistSearchTerms) {
            const matched = artist.terms.some(term => {
              const termLower = term.toLowerCase();
              // 짧은 용어(3자 이하)는 정확 매칭만
              if (term.length <= 3) {
                return titleLower.includes(` ${termLower} `) ||
                       titleLower.startsWith(`${termLower} `) ||
                       titleLower.endsWith(` ${termLower}`) ||
                       titleLower === termLower;
              }
              return titleLower.includes(termLower);
            });

            if (matched) {
              // ktrenz_external_video_matches에 upsert
              await sb.from("ktrenz_external_video_matches").upsert({
                channel_id: channel.channel_id,
                video_id: videoId,
                video_title: title,
                wiki_entry_id: artist.id,
                view_count: stats.views,
                comment_count: stats.comments,
                like_count: stats.likes,
                category: channel.category,
                collected_at: new Date().toISOString(),
              } as any, { onConflict: "channel_id,video_id,wiki_entry_id" } as any);

              // 아티스트별 메트릭 누적
              if (!artistMetrics[artist.id]) {
                artistMetrics[artist.id] = { totalViews: 0, totalComments: 0, videoCount: 0 };
              }
              artistMetrics[artist.id].totalViews += stats.views;
              artistMetrics[artist.id].totalComments += stats.comments;
              artistMetrics[artist.id].videoCount++;
              totalMatches++;

              console.log(`[scan-external] Match: "${title}" → artist=${artist.terms[0]}, views=${stats.views.toLocaleString()}`);
            }
          }
        }

        // YouTube API quota 보호
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn(`[scan-external] Error scanning ${channel.channel_name}:`, (e as Error).message);
      }
    }

    // 4) 아티스트별 external_videos 스냅샷 저장
    for (const [wikiEntryId, metrics] of Object.entries(artistMetrics)) {
      await sb.from("ktrenz_data_snapshots").insert({
        wiki_entry_id: wikiEntryId,
        platform: "external_videos",
        metrics: {
          total_views: metrics.totalViews,
          total_comments: metrics.totalComments,
          video_count: metrics.videoCount,
        },
      });
    }

    console.log(`[scan-external] Done: scanned ${totalVideosScanned} videos from ${channels.length} channels, ${totalMatches} matches, ${Object.keys(artistMetrics).length} artists affected`);

    return new Response(
      JSON.stringify({
        success: true,
        channelsScanned: channels.length,
        videosScanned: totalVideosScanned,
        totalMatches,
        artistsAffected: Object.keys(artistMetrics).length,
        metrics: artistMetrics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scan-external] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
