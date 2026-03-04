import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { cn } from "@/lib/utils";
import { Youtube, Newspaper, MessageCircle, Music, Check, Zap } from "lucide-react";
import { toast } from "sonner";

interface Mission {
  key: string;
  category: "youtube" | "news" | "buzz" | "music";
  title: string;
  description: string;
  url: string;
  points: number;
  icon: React.ReactNode;
  thumbnail?: string | null;
}

const CATEGORY_CONFIG = {
  youtube: { icon: <Youtube className="w-3.5 h-3.5" />, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", platform: "youtube" },
  news: { icon: <Newspaper className="w-3.5 h-3.5" />, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", platform: "naver" },
  buzz: { icon: <MessageCircle className="w-3.5 h-3.5" />, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", platform: "twitter" },
  music: { icon: <Music className="w-3.5 h-3.5" />, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", platform: "spotify" },
};

interface YTVideo {
  id: string;
  title: string;
}

function generateMissions(
  artistName: string,
  encodedName: string,
  videos: YTVideo[],
  channelId: string | null,
  newsItems: Array<{ title: string; url: string }>,
  musicCharts: any,
): Mission[] {
  const missions: Mission[] = [];

  // YouTube missions — each video gets its own unique mission
  videos.slice(0, 3).forEach((video, i) => {
    const actions = [
      { key: `yt_${i}_watch`, title: "영상 시청", desc: video.title.slice(0, 40), points: 10 },
      { key: `yt_${i}_like`, title: "좋아요 누르기", desc: video.title.slice(0, 30) + " 좋아요", points: 5 },
    ];
    // Only add comment mission for the first video
    if (i === 0) {
      actions.push({ key: `yt_${i}_comment`, title: "댓글 달기", desc: "응원 댓글 남기기", points: 15 });
    }
    actions.forEach(a => {
      missions.push({
        key: a.key,
        category: "youtube",
        title: a.title,
        description: a.desc,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        points: a.points,
        icon: CATEGORY_CONFIG.youtube.icon,
        thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      });
    });
  });

  if (channelId) {
    missions.push({
      key: "yt_subscribe",
      category: "youtube",
      title: "채널 구독하기",
      description: "공식 채널 구독",
      url: `https://www.youtube.com/channel/${channelId}?sub_confirmation=1`,
      points: 10,
      icon: CATEGORY_CONFIG.youtube.icon,
    });
  }

  // News missions — each with different article
  newsItems.slice(0, 4).forEach((item, i) => {
    missions.push({
      key: `news_${i}`,
      category: "news",
      title: `뉴스 ${i + 1}`,
      description: item.title.slice(0, 50),
      url: item.url,
      points: 8,
      icon: CATEGORY_CONFIG.news.icon,
    });
  });

  // Buzz missions
  missions.push({
    key: "buzz_x_search",
    category: "buzz",
    title: "X에서 검색하기",
    description: `${artistName} 최신 소식 확인`,
    url: `https://x.com/search?q=${encodedName}&src=typed_query&f=live`,
    points: 8,
    icon: CATEGORY_CONFIG.buzz.icon,
  });
  missions.push({
    key: "buzz_x_post",
    category: "buzz",
    title: "X에 응원 게시글 작성",
    description: `#${artistName.replace(/\s/g, "")} 해시태그`,
    url: `https://x.com/intent/post?text=${encodeURIComponent(`${artistName} 💖 #${artistName.replace(/\s/g, "")} #KPop`)}`,
    points: 15,
    icon: CATEGORY_CONFIG.buzz.icon,
  });

  // Music missions — different songs
  const spotifySongs = musicCharts?.spotify?.top_songs || [];
  const melonSongs = musicCharts?.melon?.top_songs || [];
  const allSongs = [...spotifySongs, ...melonSongs];

  if (allSongs.length > 0) {
    const song1 = allSongs[0];
    missions.push({
      key: "music_spotify",
      category: "music",
      title: "Spotify 스트리밍",
      description: `${song1.title} 듣기`,
      url: `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${song1.title}`)}`,
      points: 10,
      icon: CATEGORY_CONFIG.music.icon,
    });
    if (allSongs.length > 1) {
      const song2 = allSongs[1];
      missions.push({
        key: "music_melon",
        category: "music",
        title: "멜론 스트리밍",
        description: `${song2.title} 듣기`,
        url: `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(`${artistName} ${song2.title}`)}`,
        points: 8,
        icon: CATEGORY_CONFIG.music.icon,
      });
    }
  } else {
    missions.push({
      key: "music_spotify",
      category: "music",
      title: "Spotify 스트리밍",
      description: "최신곡 듣기",
      url: `https://open.spotify.com/search/${encodedName}`,
      points: 10,
      icon: CATEGORY_CONFIG.music.icon,
    });
    missions.push({
      key: "music_melon",
      category: "music",
      title: "멜론에서 검색",
      description: `${artistName} 음악 감상`,
      url: `https://www.melon.com/search/total/index.htm?q=${encodedName}`,
      points: 8,
      icon: CATEGORY_CONFIG.music.icon,
    });
  }

  return missions.slice(0, 12);
}

export default function V3MissionCards({
  wikiEntryId,
  artistName,
  videoId,
  videoTitle,
  channelId,
  metadata,
}: {
  wikiEntryId: string;
  artistName: string;
  videoId: string | null;
  videoTitle: string | null;
  channelId: string | null;
  metadata: any;
}) {
  const track = useTrackEvent();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState<string | null>(null);
  const encodedName = encodeURIComponent(artistName);
  const today = new Date().toISOString().slice(0, 10);

  // Fetch recent YouTube videos for this artist
  const { data: ytVideos = [] } = useQuery({
    queryKey: ["mission-yt-videos", wikiEntryId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_data_snapshots")
        .select("raw_response")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "youtube")
        .not("raw_response", "is", null)
        .order("collected_at", { ascending: false })
        .limit(1);
      if (!data?.[0]) return videoId && videoTitle ? [{ id: videoId, title: videoTitle }] : [];
      const raw = data[0].raw_response;
      const items = raw?.recent_videos || raw?.items || [];
      const vids: YTVideo[] = items
        .filter((v: any) => v.video_id || v.videoId || v.id)
        .map((v: any) => ({
          id: v.video_id || v.videoId || v.id,
          title: v.title || "영상",
        }))
        .slice(0, 5);
      // Fallback to the prop videoId if snapshot has nothing
      if (vids.length === 0 && videoId) {
        vids.push({ id: videoId, title: videoTitle || "최신 영상" });
      }
      return vids;
    },
    staleTime: 1000 * 60 * 30,
  });

  // Fetch naver news items for this artist
  const { data: newsItems = [] } = useQuery({
    queryKey: ["mission-news", wikiEntryId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_data_snapshots")
        .select("raw_response")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "naver_news")
        .not("raw_response", "is", null)
        .order("collected_at", { ascending: false })
        .limit(1);
      if (!data?.[0]) return [];
      const raw = data[0].raw_response;
      return (raw?.top_items || [])
        .filter((item: any) => item.url && item.title)
        .map((item: any) => ({ title: item.title, url: item.url }));
    },
    staleTime: 1000 * 60 * 30,
  });

  // Fetch today's completed missions
  const { data: completedMissions = [] } = useQuery({
    queryKey: ["daily-missions", wikiEntryId, today],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return [];
      const { data } = await supabase
        .from("ktrenz_daily_missions" as any)
        .select("mission_key")
        .eq("user_id", authData.user.id)
        .eq("wiki_entry_id", wikiEntryId)
        .eq("mission_date", today);
      return (data || []).map((d: any) => d.mission_key);
    },
    staleTime: 1000 * 60,
  });

  const musicCharts = metadata?.music_charts;
  const missions = generateMissions(artistName, encodedName, ytVideos, channelId, newsItems, musicCharts);
  const completedSet = new Set(completedMissions);
  const completedCount = missions.filter(m => completedSet.has(m.key)).length;
  const totalPoints = missions.filter(m => completedSet.has(m.key)).reduce((s, m) => s + m.points, 0);

  const handleMission = async (mission: Mission) => {
    // Open link
    window.open(mission.url, "_blank", "noopener,noreferrer");

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      toast.info("로그인하면 미션 보상을 받을 수 있어요!");
      return;
    }
    if (completedSet.has(mission.key)) return;

    setCompleting(mission.key);
    try {
      // Record mission completion
      const { error: missionError } = await supabase.from("ktrenz_daily_missions" as any).insert({
        user_id: authData.user.id,
        wiki_entry_id: wikiEntryId,
        mission_key: mission.key,
        points_awarded: mission.points,
      });
      if (missionError) {
        if (missionError.code === "23505") return; // duplicate
        throw missionError;
      }

      // Track event
      track("external_link_click", {
        artist_name: artistName,
        url: mission.url,
        platform: CATEGORY_CONFIG[mission.category].platform,
        mission_key: mission.key,
      });

      // Record contribution
      await supabase.rpc("ktrenz_record_contribution" as any, {
        _user_id: authData.user.id,
        _wiki_entry_id: wikiEntryId,
        _platform: CATEGORY_CONFIG[mission.category].platform,
      });

      // Award K-Points
      await supabase.from("ktrenz_point_transactions" as any).insert({
        user_id: authData.user.id,
        amount: mission.points,
        description: `미션 완료: ${mission.title} (${artistName})`,
      });

      queryClient.invalidateQueries({ queryKey: ["daily-missions", wikiEntryId, today] });
      toast.success(`+${mission.points} K-Points!`, { duration: 2000 });
    } catch (e) {
      console.error("Mission complete error:", e);
    } finally {
      setCompleting(null);
    }
  };

  if (missions.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-xs font-bold text-foreground uppercase tracking-wider">Today's Mission</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-bold text-primary">{completedCount}/{missions.length}</span>
          <span>·</span>
          <span className="font-bold text-amber-500">+{totalPoints}P</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full transition-all duration-500"
          style={{ width: `${missions.length > 0 ? (completedCount / missions.length) * 100 : 0}%` }}
        />
      </div>

      {/* Mission cards — single column, numbered */}
      <div className="flex flex-col gap-2">
        {missions.map((mission, index) => {
          const completed = completedSet.has(mission.key);
          const isCompleting = completing === mission.key;
          const cfg = CATEGORY_CONFIG[mission.category];

          return (
            <button
              key={mission.key}
              onClick={() => handleMission(mission)}
              disabled={isCompleting}
              className={cn(
                "relative flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all duration-200 w-full",
                completed
                  ? "bg-muted/30 border-border opacity-60"
                  : `${cfg.bg} ${cfg.border} hover:scale-[1.01] active:scale-[0.99]`,
                isCompleting && "animate-pulse"
              )}
            >
              {/* Number badge */}
              <span className={cn(
                "shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                completed ? "bg-green-500/20 text-green-500" : `${cfg.bg} ${cfg.color}`
              )}>
                {completed ? <Check className="w-3 h-3" /> : index + 1}
              </span>

              {/* Thumbnail (YouTube) */}
              {mission.thumbnail && (
                <img
                  src={mission.thumbnail}
                  alt=""
                  className="shrink-0 w-16 h-9 rounded-md object-cover"
                  loading="lazy"
                />
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn(cfg.color, "shrink-0")}>{mission.icon}</span>
                  <span className="text-[10px] font-bold text-foreground truncate">{mission.title}</span>
                </div>
                <p className="text-[9px] text-muted-foreground line-clamp-1 mt-0.5">{mission.description}</p>
              </div>

              {/* Points / check */}
              {completed ? (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <span className="text-[9px] font-bold text-amber-500 shrink-0 whitespace-nowrap">+{mission.points}P</span>
              )}

              {completed && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-xl" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
