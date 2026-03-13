import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Youtube, Newspaper, MessageCircle, Music, Check, Zap, PartyPopper, Eye, ThumbsUp, MessageSquare } from "lucide-react";
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
  contentId?: string;
  stats?: { viewCount?: number; likeCount?: number; commentCount?: number };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}

function generateMissions(
  artistName: string,
  encodedName: string,
  videos: YTVideo[],
  channelId: string | null,
  newsItems: Array<{ title: string; url: string; og_image?: string | null }>,
  musicCharts: any,
  t: (key: string) => string,
  excludeContentIds: Set<string> = new Set(),
): Mission[] {
  const missions: Mission[] = [];

  // YouTube missions — 최신 영상 시청만, 최대 4개 (exclude recently completed)
  videos.filter(v => !excludeContentIds.has(`yt:${v.id}`)).slice(0, 4).forEach((video, i) => {
    missions.push({
      key: `yt_${i}_watch`,
      category: "youtube",
      title: video.title.slice(0, 60),
      description: `${t("mission.watchAndStream")}`,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      points: 10,
      icon: CATEGORY_CONFIG.youtube.icon,
      thumbnail: `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      contentId: `yt:${video.id}`,
      stats: { viewCount: video.viewCount, likeCount: video.likeCount, commentCount: video.commentCount },
    });
  });

  // News missions — each with different article + thumbnail (exclude recently completed)
  newsItems.filter(item => !excludeContentIds.has(`news:${item.url}`)).slice(0, 4).forEach((item, i) => {
    missions.push({
      key: `news_${i}`,
      category: "news",
      title: item.title.slice(0, 80),
      description: `${t("mission.readArticle")}`,
      url: item.url,
      points: 8,
      icon: CATEGORY_CONFIG.news.icon,
      thumbnail: item.og_image || null,
      contentId: `news:${item.url}`,
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
  const encodedName = encodeURIComponent(artistName);

  // pending mission 저장 (모바일 메모리 해제/리로드 대비)
  const PENDING_KEY = "ktrenz_pending_mission_v1";
  const setPendingMission = (mission: { title: string; points: number; category: keyof typeof CATEGORY_CONFIG; key: string } | null) => {
    if (mission) {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ ...mission, createdAt: Date.now() }));
    } else {
      localStorage.removeItem(PENDING_KEY);
    }
  };
  const getPendingMission = (): { title: string; points: number; category: keyof typeof CATEGORY_CONFIG; key: string } | null => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.createdAt || Date.now() - parsed.createdAt > 1000 * 60 * 30) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
  };
  const today = new Date().toISOString().slice(0, 10);

  // 탭 복귀 감지 → 축하 모달
  const showCelebration = useCallback((mission: Pick<Mission, "title" | "points" | "category">) => {
    setCelebration({ title: mission.title, points: mission.points, category: mission.category });
    setTimeout(() => {
      setCelebration(prev => prev ? { ...prev, closing: true } : null);
      setTimeout(() => setCelebration(null), 400);
    }, 2500);
  }, []);

  const consumePendingMission = useCallback(() => {
    const pending = getPendingMission();
    if (!pending) return;
    setPendingMission(null);
    showCelebration(pending);
  }, [showCelebration]);

  useEffect(() => {
    // 리로드 복귀 케이스 대응
    consumePendingMission();

    const onVisibility = () => {
      if (document.visibilityState === "visible") consumePendingMission();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", consumePendingMission);
    window.addEventListener("pageshow", consumePendingMission);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", consumePendingMission);
      window.removeEventListener("pageshow", consumePendingMission);
    };
  }, [consumePendingMission]);


  const ytVideos: YTVideo[] = (() => {
    const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const topVideos = metadata?.youtube_stats?.youtube_top_videos || [];
    const vids: YTVideo[] = topVideos
      .filter((v: any) => v.videoId || v.video_id)
      .map((v: any) => ({
        id: v.videoId || v.video_id,
        title: v.title || t("mission.video"),
        viewCount: v.viewCount ? Number(v.viewCount) : undefined,
        likeCount: v.likeCount ? Number(v.likeCount) : undefined,
        commentCount: v.commentCount ? Number(v.commentCount) : undefined,
      }))
      .slice(0, 5);

    // Fallback to the single prop videoId — but only if channel has recent activity
    if (vids.length === 0 && videoId) {
      const newestPublished = metadata?.youtube_stats?.youtube_recent_newest_published;
      const isRecent = newestPublished && (now - new Date(newestPublished).getTime()) < SIX_MONTHS_MS;
      if (isRecent) {
        vids.push({ id: videoId, title: videoTitle || t("mission.latestVideo") });
      }
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

  // Fetch recently completed content_ids (last 7 days) to exclude from missions
  const { data: recentContentIds = [] } = useQuery({
    queryKey: ["recent-mission-content", wikiEntryId],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("ktrenz_daily_missions" as any)
        .select("content_id")
        .eq("user_id", authData.user.id)
        .eq("wiki_entry_id", wikiEntryId)
        .gte("mission_date", sevenDaysAgo)
        .not("content_id", "is", null);
      return (data || []).map((d: any) => d.content_id as string);
    },
    staleTime: 1000 * 60 * 5,
  });

  const musicCharts = metadata?.music_charts;
  const excludeSet = new Set(recentContentIds);
  const missions = generateMissions(artistName, encodedName, ytVideos, channelId, newsItems, musicCharts, t, excludeSet);
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
      setPendingMission(mission);
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
        content_id: mission.contentId || null,
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
        reason: "mission_reward",
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
          <p className="text-base font-extrabold text-foreground uppercase tracking-wider">{t("mission.todaysMission")}</p>
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
                  type="button"
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
                      <Check className="w-5 h-5 text-teal-400 shrink-0 relative z-10 drop-shadow-[0_0_4px_rgba(45,212,191,0.6)]" />
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
                         className="shrink-0 w-32 h-20 rounded-lg object-cover bg-muted"
                         loading="lazy"
                         onError={(e) => {
                           (e.currentTarget as HTMLImageElement).style.display = "none";
                         }}
                       />
                     )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-foreground line-clamp-3">{mission.title}</span>
                      {mission.stats && (mission.stats.viewCount || mission.stats.likeCount || mission.stats.commentCount) && (
                        <div className="flex items-center gap-3 mt-1">
                          {mission.stats.viewCount != null && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Eye className="w-3 h-3" />
                              {formatCompact(mission.stats.viewCount)}
                            </span>
                          )}
                          {mission.stats.likeCount != null && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ThumbsUp className="w-3 h-3" />
                              {formatCompact(mission.stats.likeCount)}
                            </span>
                          )}
                          {mission.stats.commentCount != null && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MessageSquare className="w-3 h-3" />
                              {formatCompact(mission.stats.commentCount)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {mission.description && (
                    <p className="text-xs text-teal-400 line-clamp-2 leading-relaxed font-medium">{mission.description}</p>
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
            "fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300",
            celebration.closing ? "opacity-0" : "animate-in fade-in duration-200"
          )}>
            <div className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 py-10 transition-all duration-300",
              "bg-gradient-to-b from-background/95 to-background/80 backdrop-blur-xl",
              celebration.closing
                ? "scale-150 opacity-0"
                : "animate-in zoom-in-95 duration-200"
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
                <div className="h-full bg-amber-500 rounded-full" style={{ animation: "shrink-bar 2.5s linear forwards" }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
