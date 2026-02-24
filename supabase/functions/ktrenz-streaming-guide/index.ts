import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 인증
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 관심 아티스트 조회
    const { data: watchedArtists } = await adminClient
      .from("ktrenz_watched_artists")
      .select("artist_name, wiki_entry_id")
      .eq("user_id", user.id);

    if (!watchedArtists || watchedArtists.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          guides: [],
          message: "관심 아티스트를 먼저 등록해주세요.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 캐시 확인 (6시간 이내 가이드)
    const { data: cachedGuides } = await adminClient
      .from("ktrenz_streaming_guides")
      .select("*")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("generated_at", { ascending: false });

    const cachedMap = new Map(
      (cachedGuides ?? []).map((g: any) => [g.wiki_entry_id, g])
    );

    const guides: any[] = [];

    for (const wa of watchedArtists) {
      // 캐시 히트
      if (wa.wiki_entry_id && cachedMap.has(wa.wiki_entry_id)) {
        guides.push(cachedMap.get(wa.wiki_entry_id));
        continue;
      }

      // --- 데이터 수집: FES + 판매량 ---
      let fesData: any = null;
      let salesData: any[] = [];
      let youtubeData: any = null;

      if (wa.wiki_entry_id) {
        // FES 점수 + 음악 데이터
        const { data: fes } = await adminClient
          .from("v3_scores")
          .select("total_score, energy_score, energy_change_24h, youtube_score, buzz_score, spotify_score, energy_rank, music_score, music_data, album_sales_score, album_sales_data")
          .eq("wiki_entry_id", wa.wiki_entry_id)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        fesData = fes;

        // 판매량 데이터
        const { data: sales } = await adminClient
          .from("ktrenz_data_snapshots")
          .select("metrics, collected_at, platform")
          .eq("wiki_entry_id", wa.wiki_entry_id)
          .in("platform", ["circle_chart", "hanteo"])
          .order("collected_at", { ascending: false })
          .limit(5);
        salesData = sales ?? [];

        // YouTube raw_data
        const { data: ytRaw } = await adminClient
          .from("v3_scores")
          .select("raw_data")
          .eq("wiki_entry_id", wa.wiki_entry_id)
          .not("raw_data", "is", null)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        youtubeData = ytRaw?.raw_data;
      }

      // --- 전체 랭킹 컨텍스트 ---
      const { data: topArtists } = await adminClient
        .from("v3_scores")
        .select("wiki_entry_id, energy_score, energy_rank, wiki_entries:wiki_entry_id(title)")
        .order("scored_at", { ascending: false })
        .limit(100);

      const latestMap = new Map<string, any>();
      for (const row of topArtists ?? []) {
        if (!latestMap.has(row.wiki_entry_id)) {
          latestMap.set(row.wiki_entry_id, row);
        }
      }
      const rankings = [...latestMap.values()]
        .sort((a, b) => (b.energy_score ?? 0) - (a.energy_score ?? 0))
        .slice(0, 10);

      // --- AI 분석 ---
      // 인기곡 목록 추출
      const musicData = fesData?.music_data as any;
      const lastfmTracks = musicData?.lastfm?.top_tracks ?? [];
      const deezerTracks = musicData?.deezer?.top_tracks ?? [];
      const allTracks = [
        ...lastfmTracks.map((t: any) => t.name),
        ...deezerTracks.map((t: any) => t.title),
      ];
      const uniqueTracks = [...new Set(allTracks)].slice(0, 10);

      const albumSalesData = fesData?.album_sales_data as any;

      const contextParts = [
        `아티스트: ${wa.artist_name}`,
        fesData
          ? `FES 데이터: Energy ${Math.round(fesData.energy_score)} (24h변동: ${fesData.energy_change_24h?.toFixed(1)}%), 순위 ${fesData.energy_rank ?? "N/A"}, Total ${Math.round(fesData.total_score)}, YouTube ${Math.round(fesData.youtube_score)}, Buzz ${Math.round(fesData.buzz_score ?? 0)}, Spotify ${Math.round(fesData.spotify_score ?? 0)}, Music ${Math.round(fesData.music_score ?? 0)}, AlbumSales ${Math.round(fesData.album_sales_score ?? 0)}`
          : "FES 데이터: 없음",
        musicData
          ? `음악 플랫폼 데이터: Last.fm 재생수 ${musicData.lastfm?.playcount?.toLocaleString() ?? "N/A"}, 리스너 ${musicData.lastfm?.listeners?.toLocaleString() ?? "N/A"}, Deezer 팬 ${musicData.deezer?.fans?.toLocaleString() ?? "N/A"}`
          : "",
        uniqueTracks.length > 0
          ? `인기곡 TOP ${uniqueTracks.length} (실제 곡명):\n${uniqueTracks.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
          : "",
        albumSalesData
          ? `초동 판매량: ${albumSalesData.top_album} ${albumSalesData.top_album_sales?.toLocaleString()}장, 총 ${albumSalesData.total_first_week_sales?.toLocaleString()}장 (${albumSalesData.album_count}개 앨범)`
          : "",
        salesData.length > 0
          ? `판매량 상세:\n${salesData.map((s: any) => `- [${s.platform}] ${s.metrics.album}: ${s.metrics.weekly_sales ?? s.metrics.first_week_sales ?? "N/A"}장 (${new Date(s.collected_at).toLocaleDateString()})`).join("\n")}`
          : "",
        youtubeData
          ? `YouTube: 구독자 ${youtubeData.subscriberCount?.toLocaleString()}, 총조회수 ${youtubeData.totalViewCount?.toLocaleString()}, 최근 영상 조회수 ${youtubeData.recentTotalViews?.toLocaleString()}`
          : "",
        `현재 FES Top 10:\n${rankings.map((r: any, i: number) => `${i + 1}. ${(r.wiki_entries as any)?.title ?? "Unknown"} (Energy: ${Math.round(r.energy_score)})`).join("\n")}`,
      ].filter(Boolean);

      const systemPrompt = `너는 KTRENZ 스트리밍 전략 분석 AI야. 아래 데이터를 분석해서 팬이 이 아티스트를 위해 실행할 수 있는 구체적인 스트리밍/차트 전략을 JSON으로 제공해.

중요: 인기곡 데이터가 제공된 경우, 반드시 실제 곡명을 사용하여 플레이리스트를 생성해. 봇 인식을 회피하기 위해 타이틀곡 → 수록곡 → 타이틀곡 패턴을 사용해.

반드시 아래 JSON 구조로만 응답해 (다른 텍스트 없이):
{
  "artist_name": "아티스트명",
  "current_rank": 현재순위(숫자),
  "momentum": "rising" | "stable" | "declining",
  "momentum_detail": "모멘텀 설명 (1-2문장)",
  "platform_focus": [
    {"platform": "youtube" | "spotify" | "melon" | "bugs" | "genie", "priority": "high" | "medium" | "low", "reason": "이유", "action": "구체적 행동 지침"}
  ],
  "sales_analysis": {
    "latest_album": "앨범명",
    "first_week_sales": 초동수치,
    "assessment": "초동 평가 (1-2문장)",
    "fan_power_tier": "mega" | "strong" | "growing" | "emerging"
  },
  "gap_analysis": {
    "target_rank": 목표순위,
    "energy_gap": 에너지점수차이,
    "key_deficit": "부족한 핵심 지표 설명"
  },
  "streaming_playlist": {
    "description": "이 플레이리스트 전략의 설명 (1문장)",
    "hourly_pattern": [
      {"time_slot": "00-10분", "tracks": ["실제곡명1", "실제곡명2"]},
      {"time_slot": "10-20분", "tracks": ["실제곡명3", "실제곡명4"]},
      {"time_slot": "20-30분", "tracks": ["실제곡명5"]},
      {"time_slot": "30-40분", "tracks": ["실제곡명6", "실제곡명7"]},
      {"time_slot": "40-50분", "tracks": ["실제곡명8"]},
      {"time_slot": "50-60분", "tracks": ["실제곡명9", "실제곡명10"]}
    ],
    "total_public_time": "최적 총공 시간대 (예: 오전 7-9시, 오후 6-8시)",
    "platform_tips": [
      {"platform": "YouTube", "tip": "720p 이상, 30% 이상 시청"},
      {"platform": "Spotify", "tip": "반복/셔플 해제, 30초 이상 재생"},
      {"platform": "Melon", "tip": "캐시 삭제 후 재생, 이어폰 연결"}
    ]
  },
  "action_items": [
    "구체적 행동 1",
    "구체적 행동 2",
    "구체적 행동 3"
  ],
  "timing_tip": "지금 시점에서의 타이밍 조언"
}`;

      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contextParts.join("\n\n") },
          ],
          max_tokens: 1024,
          temperature: 0.3,
        }),
      });

      if (!aiResp.ok) {
        console.error("OpenAI error:", await aiResp.text());
        continue;
      }

      const aiData = await aiResp.json();
      const rawContent = aiData.choices?.[0]?.message?.content ?? "";

      let guideData: any;
      try {
        // JSON 블록 추출
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        guideData = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "parse_failed", raw: rawContent };
      } catch {
        guideData = { error: "parse_failed", raw: rawContent };
      }

      // 저장
      const guideRow = {
        user_id: user.id,
        wiki_entry_id: wa.wiki_entry_id,
        artist_name: wa.artist_name,
        guide_data: guideData,
      };

      const { data: inserted } = await adminClient
        .from("ktrenz_streaming_guides")
        .insert(guideRow)
        .select()
        .single();

      guides.push(inserted ?? guideRow);
    }

    return new Response(
      JSON.stringify({ success: true, guides }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[StreamingGuide] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
