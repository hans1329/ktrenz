import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Youtube, Newspaper, MessageCircle, Music, Check, Zap, PartyPopper } from "lucide-react";
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
  newsItems: Array<{ title: string; url: string; og_image?: string | null }>,
  musicCharts: any,
  t: (key: string) => string,
): Mission[] {
  const missions: Mission[] = [];

  // YouTube missions — 최신 영상 시청만, 최대 4개
  videos.slice(0, 4).forEach((video, i) => {
    missions.push({
      key: `yt_${i}_watch`,
      category: "youtube",
      title: video.title.slice(0, 40),
      description: "",
      url: `https://www.youtube.com/watch?v=${video.id}`,
      points: 10,
      icon: CATEGORY_CONFIG.youtube.icon,
      thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
    });
  });

  // News missions — each with different article + thumbnail
  newsItems.slice(0, 4).forEach((item, i) => {
    missions.push({
      key: `news_${i}`,
      category: "news",
      title: item.title.slice(0, 50),
      description: "",
      url: item.url,
      points: 8,
      icon: CATEGORY_CONFIG.news.icon,
      thumbnail: item.og_image || null,
    });
  });

  // Buzz missions
  missions.push({
    key: "buzz_x_search",
    category: "buzz",
    title: t("mission.searchOnX"),
    description: `${artistName} ${t("mission.latestNews")}`,
    url: `https://x.com/search?q=${encodedName}&src=typed_query&f=live`,
    points: 8,
    icon: CATEGORY_CONFIG.buzz.icon,
  });
  missions.push({
    key: "buzz_x_post",
    category: "buzz",
    title: t("mission.postOnX"),
    description: `#${artistName.replace(/\s/g, "")} ${t("mission.hashtag")}`,
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
      title: t("mission.spotifyStream"),
      description: `${song1.title} ${t("mission.listenTo")}`,
      url: `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${song1.title}`)}`,
      points: 10,
      icon: CATEGORY_CONFIG.music.icon,
    });
    if (allSongs.length > 1) {
      const song2 = allSongs[1];
      missions.push({
        key: "music_melon",
        category: "music",
        title: t("mission.melonStream"),
        description: `${song2.title} ${t("mission.listenTo")}`,
        url: `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(`${artistName} ${song2.title}`)}`,
        points: 8,
        icon: CATEGORY_CONFIG.music.icon,
      });
    }
  } else {
    missions.push({
      key: "music_spotify",
      category: "music",
      title: t("mission.spotifyStream"),
      description: t("mission.listenLatest"),
      url: `https://open.spotify.com/search/${encodedName}`,
      points: 10,
      icon: CATEGORY_CONFIG.music.icon,
    });
    missions.push({
      key: "music_melon",
      category: "music",
      title: t("mission.melonSearch"),
      description: `${artistName} ${t("mission.enjoyMusic")}`,
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
  const { t } = useLanguage();
  const track = useTrackEvent();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ title: string; points: number; category: keyof typeof CATEGORY_CONFIG; closing?: boolean } | null>(null);
  const pendingMissionRef = useRef<Mission | null>(null);
  const encodedName = encodeURIComponent(artistName);
  const today = new Date().toISOString().slice(0, 10);

  // 탭 복귀 감지 → 축하 모달
  const showCelebration = useCallback((mission: Mission) => {
    setCelebration({ title: mission.title, points: mission.points, category: mission.category });
    setTimeout(() => {
      setCelebration(prev => prev ? { ...prev, closing: true } : null);
      setTimeout(() => setCelebration(null), 1500);
    }, 4000);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible" && pendingMissionRef.current) {
        const mission = pendingMissionRef.current;
        pendingMissionRef.current = null;
        showCelebration(mission);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [showCelebration]);

  const ytVideos: YTVideo[] = (() => {
    const topVideos = metadata?.youtube_stats?.youtube_top_videos || [];
    const vids: YTVideo[] = topVideos
      .filter((v: any) => v.videoId || v.video_id)
      .map((v: any) => ({
        id: v.videoId || v.video_id,
        title: v.title || t("mission.video"),
      }))
      .slice(0, 5);
    // Fallback to the single prop videoId if metadata has nothing
    if (vids.length === 0 && videoId) {
      vids.push({ id: videoId, title: videoTitle || t("mission.latestVideo") });
    }
    return vids;
  })();

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
        .filter((item: any) => {
          // 일본어(히라가나/가타카나) 기사 필터링
          const jpChars = (item.title || "").match(/[\u3040-\u309F\u30A0-\u30FF]/g);
          return (jpChars?.length || 0) < 3;
        })
        .map((item: any) => ({ title: item.title, url: item.url, og_image: item.image || item.og_image || null }));
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
  const missions = generateMissions(artistName, encodedName, ytVideos, channelId, newsItems, musicCharts, t);
  const completedSet = new Set(completedMissions);
  const completedCount = missions.filter(m => completedSet.has(m.key)).length;
  const totalPoints = missions.filter(m => completedSet.has(m.key)).reduce((s, m) => s + m.points, 0);
  const allDone = missions.length > 0 && completedCount === missions.length;

  const handleMission = async (mission: Mission) => {
    // 로그인 유저 + 미완료 미션이면 pendingRef 세팅 (탭 복귀 시 축하 모달용)
    const { data: authData } = await supabase.auth.getUser();
    const isLoggedIn = !!authData.user;
    const alreadyDone = completedSet.has(mission.key);

    if (isLoggedIn && !alreadyDone) {
      pendingMissionRef.current = mission;
    }

    // Open link
    window.open(mission.url, "_blank", "noopener,noreferrer");

    if (!isLoggedIn) {
      toast.info(t("mission.loginForReward"));
      return;
    }
    if (alreadyDone) return;

    setCompleting(mission.key);
    try {
      // Record mission completion
      const userId = authData.user!.id;
      const { error: missionError } = await supabase.from("ktrenz_daily_missions" as any).insert({
        user_id: userId,
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
        _user_id: userId,
        _wiki_entry_id: wikiEntryId,
        _platform: CATEGORY_CONFIG[mission.category].platform,
      });

      // Award K-Points
      await supabase.from("ktrenz_point_transactions" as any).insert({
        user_id: userId,
        amount: mission.points,
        description: `${t("mission.completed")}${mission.title} (${artistName})`,
      });

      queryClient.invalidateQueries({ queryKey: ["daily-missions", wikiEntryId, today] });
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
          <Zap className="w-5 h-5 text-amber-400" />
          <p className="text-sm font-bold text-foreground uppercase tracking-wider">{t("mission.todaysMission")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-bold text-primary text-base">{completedCount}/{missions.length}</span>
          <span>·</span>
          <span className="font-extrabold text-amber-500 text-base">+{totalPoints}P</span>
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
      <div className="flex flex-col gap-2 relative">
        {(() => {
          const midIndex = Math.floor(missions.length / 2);
          return missions.map((mission, index) => {
            const completed = completedSet.has(mission.key);
            const isCompleting = completing === mission.key;
            const cfg = CATEGORY_CONFIG[mission.category];
            const categoryLabel = t(`mission.category.${mission.category}`);

            return (
              <React.Fragment key={mission.key}>
                {/* All-done banner at midpoint */}
                {allDone && index === midIndex && (
                  <div className="flex flex-col items-center gap-2 py-6 px-4 my-1 rounded-2xl bg-primary/5 border border-primary/10">
                    <span className="text-3xl">🏆</span>
                    <p className="text-sm font-extrabold text-foreground text-center">{t("mission.allDoneTitle")}</p>
                    <p className="text-xs text-muted-foreground text-center">{t("mission.allDoneDesc")}</p>
                  </div>
                )}
                <button
                  onClick={() => handleMission(mission)}
                  disabled={isCompleting}
                  className={cn(
                    "relative flex flex-col gap-2 p-3 rounded-xl border text-left transition-all duration-200 w-full",
                    completed
                      ? "bg-muted/30 border-border opacity-60"
                      : `${cfg.bg} ${cfg.border} hover:scale-[1.01] active:scale-[0.99]`,
                    isCompleting && "animate-pulse"
                  )}
                >
                  {/* Top row: number, source, points */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                        completed ? "bg-green-500/20 text-green-500" : `${cfg.bg} ${cfg.color}`
                      )}>
                        {completed ? <Check className="w-3.5 h-3.5" /> : index + 1}
                      </span>
                      <span className={cn(cfg.color, "shrink-0")}>{mission.icon}</span>
                      <span className={cn("text-xs font-semibold", cfg.color)}>{categoryLabel}</span>
                    </div>
                    {completed ? (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <span className="text-xs font-bold text-amber-500">+{mission.points}P</span>
                    )}
                  </div>

                  {/* Content row: thumbnail + title */}
                  <div className="flex items-start gap-2.5 w-full">
                    {mission.thumbnail && (
                      <img
                        src={mission.thumbnail}
                        alt=""
                        className="shrink-0 w-20 h-11 rounded-md object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className="text-sm font-bold text-foreground line-clamp-2 flex-1">{mission.title}</span>
                  </div>

                  {mission.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{mission.description}</p>
                  )}

                  {completed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-xl" />
                  )}
                </button>
              </React.Fragment>
            );
          });
        })()}
      </div>

      {/* 축하 모달 */}
      {celebration && (() => {
        const cfg = CATEGORY_CONFIG[celebration.category];
        const categoryLabel = t(`mission.category.${celebration.category}`);
        return (
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-500",
            celebration.closing ? "opacity-0" : "animate-in fade-in duration-300"
          )}
            style={{ transitionDelay: celebration.closing ? "0.8s" : "0s" }}
          >
            <div className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 py-10 transition-all duration-500",
              "bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-xl",
              celebration.closing
                ? "animate-celebration-burst"
                : "animate-in zoom-in-95 duration-300"
            )}
              style={{
                maskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 50%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, black 50%, transparent 100%)",
              }}
            >
              {/* 카테고리 뱃지 */}
              <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold", cfg.bg, cfg.color)}>
                {cfg.icon}
                <span>{categoryLabel} {t("mission.categoryMission")}</span>
              </div>

              {/* 아이콘 */}
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-amber-500" />
              </div>

              <p className="text-lg font-extrabold text-foreground text-center">{t("mission.complete")}</p>
              <p className="text-sm text-muted-foreground text-center line-clamp-2 max-w-[280px]">{celebration.title}</p>
              <span className="text-3xl font-black text-amber-500">+{celebration.points}P</span>

              {/* 타이머 바 */}
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden mt-1">
                <div className="h-full bg-amber-500 rounded-full animate-shrink-bar" />
              </div>
            </div>

            {/* 터지는 파티클 + 스파크 + 링 */}
            {celebration.closing && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* 화면 전체 플래시 */}
                <div className="absolute inset-0 bg-amber-500/30 animate-burst-flash" />

                {/* 확산 링 */}
                {[...Array(4)].map((_, i) => (
                  <div
                    key={`ring-${i}`}
                    className="absolute left-1/2 top-1/2 rounded-full border-amber-500/60 animate-burst-ring"
                    style={{
                      width: `${140 + i * 100}px`,
                      height: `${140 + i * 100}px`,
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
                {/* 메인 파티클 (큰 원) */}
                {[...Array(20)].map((_, i) => (
                  <div
                    key={`p-${i}`}
                    className="absolute left-1/2 top-1/2 rounded-full animate-burst-particle"
                    style={{
                      width: `${10 + Math.random() * 10}px`,
                      height: `${10 + Math.random() * 10}px`,
                      background: ["#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#3b82f6", "#ec4899", "#f97316", "#06b6d4"][i % 8],
                      "--burst-angle": `${i * 18}deg`,
                      "--burst-distance": `${140 + Math.random() * 140}px`,
                      animationDelay: `${Math.random() * 0.2}s`,
                    } as React.CSSProperties}
                  />
                ))}
                {/* 스파크 (가느다란 선) */}
                {[...Array(16)].map((_, i) => (
                  <div
                    key={`s-${i}`}
                    className="absolute left-1/2 top-1/2 rounded-full animate-burst-spark"
                    style={{
                      background: ["#fbbf24", "#fde68a", "#ffffff"][i % 3],
                      "--spark-angle": `${i * 22.5}deg`,
                      "--spark-distance": `${100 + Math.random() * 80}px`,
                      animationDelay: `${Math.random() * 0.15}s`,
                    } as React.CSSProperties}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
