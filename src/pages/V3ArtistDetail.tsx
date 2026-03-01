import { useState, useEffect, useLayoutEffect } from "react";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Home, Youtube, Eye, ThumbsUp, MessageSquare, Film, Users, TrendingUp, ExternalLink, Play, Hash, Smile, Zap, Music, Disc3, Headphones, Newspaper } from "lucide-react";
import V3EnergyChart from "@/components/v3/V3EnergyChart";
import V3ArtistMilestones from "@/components/v3/V3ArtistMilestones";
import AdminDataSourcePanel from "@/components/v3/AdminDataSourcePanel";
import DataRunDialog from "@/components/v3/DataRunDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const RainbowProgress = ({ isComplete }: { isComplete: boolean }) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (isComplete) { setProgress(100); const t = setTimeout(() => setVisible(false), 800); return () => clearTimeout(t); }
    const timer = setInterval(() => { setProgress(prev => prev >= 95 ? 95 : prev + Math.random() * 8); }, 300);
    return () => clearInterval(timer);
  }, [isComplete]);
  if (!visible) return null;
  return (
    <div className={cn("w-full space-y-2 py-3 transition-opacity duration-500", isComplete && "opacity-0")}>
      <div className="relative h-2 rounded-full overflow-hidden bg-muted">
        <div className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0088ff, #8800ff, #ff00ff)', backgroundSize: '200% 100%', animation: 'rainbow-slide 1.5s linear infinite' }} />
      </div>
      <p className="text-xs text-muted-foreground text-center animate-pulse">{isComplete ? 'Done!' : 'Fetching social data...'}</p>
      <style>{`@keyframes rainbow-slide { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }`}</style>
    </div>
  );
};

const formatNumber = (n: number | undefined | null) => {
  if (n == null) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
};

const MetricCard = ({ icon: Icon, label, value, subValue, color }: { icon: any; label: string; value: string; subValue?: string; color: string }) => (
  <Card className="p-3 bg-card border-border/50">
    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0 mb-1", color)}>
      <Icon className="w-3 h-3 text-white" />
    </div>
    <span className="text-[10px] text-muted-foreground font-medium leading-tight block mb-1">{label}</span>
    <p className="text-lg font-black text-foreground truncate">{value}</p>
    {subValue && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subValue}</p>}
  </Card>
);

const VideoRow = ({ video, rank, onExternalClick }: { video: any; rank: number; onExternalClick?: (url: string) => void }) => (
  <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer"
    onClick={() => onExternalClick?.(`https://www.youtube.com/watch?v=${video.videoId}`)}
    className="flex items-center gap-2 p-2.5 rounded-xl bg-card/50 hover:bg-card transition-colors">
    <span className="w-4 text-center text-[10px] font-bold text-muted-foreground shrink-0">{rank}</span>
    <div className="w-16 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
      <img src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight">{video.title}</p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground whitespace-nowrap"><Eye className="w-3 h-3" />{formatNumber(video.viewCount)}</span>
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground whitespace-nowrap"><ThumbsUp className="w-3 h-3" />{formatNumber(video.likeCount)}</span>
      </div>
    </div>
    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
  </a>
);

const V3ArtistDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { isAdmin } = useAdminAuth();
  const [dataRunDialogOpen, setDataRunDialogOpen] = useState(false);

  // 크론잡 실행 상태 확인
  const { data: crawlStatus } = useQuery({
    queryKey: ["crawl-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_jobs")
        .select("status, metadata")
        .eq("id", "daily-data-crawl")
        .single();
      return data;
    },
    refetchInterval: 10000,
  });
  const isCrawling = crawlStatus?.status === "running";

  const track = useTrackEvent();
  useEffect(() => { document.documentElement.classList.add("v3-theme"); return () => { document.documentElement.classList.remove("v3-theme"); }; }, []);


  const { data: entry, isLoading: entryLoading } = useQuery({
    queryKey: ["v3-artist", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("wiki_entries").select("id, title, slug, image_url, metadata, schema_type").eq("slug", slug!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  // 상세 페이지 진입 추적
  useEffect(() => {
    if (entry?.title && slug) {
      track("artist_detail_view", { artist_slug: slug, artist_name: entry.title });
    }
  }, [entry?.title, slug, track]);

  const detectPlatform = (url: string): string => {
    if (!url) return "other";
    const u = url.toLowerCase();
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
    if (u.includes("twitter.com") || u.includes("x.com")) return "X";
    if (u.includes("reddit.com")) return "Reddit";
    if (u.includes("tiktok.com")) return "TikTok";
    if (u.includes("instagram.com")) return "Instagram";
    if (u.includes("spotify.com")) return "Spotify";
    if (u.includes("melon.com")) return "Melon";
    if (u.includes("naver.com")) return "Naver";
    return "other";
  };

  const trackExternalClick = async (url: string) => {
    if (entry?.title && slug) {
      const platform = detectPlatform(url);
      track("external_link_click", { artist_slug: slug, artist_name: entry.title, url, platform });

      // 기여도 기록 (로그인 유저만)
      const { data: authData } = await supabase.auth.getUser();
      const authUser = user ?? authData.user;

      if (authUser?.id && entry?.id) {
        const dbPlatform: Record<string, string> = {
          YouTube: "youtube", X: "twitter", Reddit: "reddit", TikTok: "tiktok",
          Instagram: "instagram", Spotify: "spotify", Melon: "melon", Naver: "naver",
        };

        const { error } = await supabase.rpc("ktrenz_record_contribution" as any, {
          _user_id: authUser.id,
          _wiki_entry_id: entry.id,
          _platform: dbPlatform[platform] || "other",
        });

        if (error) {
          console.error("Failed to record fan contribution:", error);
        }
      }
    }
  };

  const cachedYt = (entry?.metadata as any)?.youtube_stats;
  const cachedBuzz = (entry?.metadata as any)?.buzz_stats;

  const refreshMutation = useMutation({
    mutationFn: async (module: string = "all") => {
      if (!entry) throw new Error("No entry");

      const runYoutube = module === "all" || module === "youtube";
      const runBuzz = module === "all" || module === "buzz";
      const runMusic = module === "all" || module === "music";
      const runAlbum = module === "all" || module === "album";

      const promises: Promise<any>[] = [];
      if (runYoutube) promises.push(supabase.functions.invoke('ktrenz-data-collector', { body: { source: 'youtube', wikiEntryId: entry.id } }));
      if (runBuzz) promises.push(supabase.functions.invoke('crawl-x-mentions', { body: { artistName: entry.title, wikiEntryId: entry.id, hashtags: [(entry.metadata as any)?.hashtag].filter(Boolean) } }));
      if (runMusic) promises.push(supabase.functions.invoke('ktrenz-data-collector', { body: { source: 'music', wikiEntryId: entry.id } }));
      if (runAlbum) promises.push(supabase.functions.invoke('ktrenz-data-collector', { body: { source: 'hanteo', wikiEntryId: entry.id } }));

      const results = await Promise.allSettled(promises);

      // Parse results based on what was requested
      let ytData = null, buzzData = null, musicData = null, albumData = null;
      let ytQuotaExceeded = false;
      let idx = 0;
      if (runYoutube) {
        const r = results[idx++];
        const raw = r?.status === 'fulfilled' ? r.value?.data : null;
        if (raw?.success) { ytData = raw; }
        else if (raw?.error?.includes?.('quota') || raw?.error?.includes?.('Quota') || raw?.quotaExceeded) {
          ytQuotaExceeded = true;
        }
      }
      if (runBuzz) {
        const r = results[idx++];
        buzzData = r?.status === 'fulfilled' && r.value?.data?.success ? r.value.data : null;
        // Buzz 수집 성공 시 네이버 뉴스(og:image 포함) 스냅샷도 자동 갱신
        if (buzzData) {
          supabase.functions.invoke('crawl-naver-news', { body: { artistName: entry.title, wikiEntryId: entry.id } })
            .then(() => queryClient.invalidateQueries({ queryKey: ["naver-news-snapshot", entry.id] }))
            .catch(() => {});
        }
      }
      if (runMusic) { const r = results[idx++]; musicData = r?.status === 'fulfilled' && r.value?.data?.success ? r.value.data : null; }
      if (runAlbum) { const r = results[idx++]; albumData = r?.status === 'fulfilled' && r.value?.data?.success ? r.value.data : null; }

      const warnings: string[] = [];
      if (ytQuotaExceeded) warnings.push('YouTube 쿼터 소진');
      else if (runYoutube && !ytData) warnings.push('YouTube');
      if (runBuzz && !buzzData) warnings.push('Buzz');
      if (runMusic && !musicData) warnings.push('Music');
      if (runAlbum && !albumData) warnings.push('Album');

      // Energy score calculation only on full run
      let fesData = null;
      let latestDbFes: { energy_score?: number | null } | null = null;
      if (module === "all") {
        try {
          const { data } = await supabase.functions.invoke('calculate-energy-score', { body: { wikiEntryId: entry.id } });
          fesData = data;
        } catch {}
        const { data: latestScore } = await supabase
          .from("v3_scores_v2" as any)
          .select("energy_score")
          .eq("wiki_entry_id", entry.id)
          .order("scored_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        latestDbFes = latestScore as any;
      }

      const youtubeMusic = ytData?.results?.youtube_music || null;
      const ytMvInfo = ytData?.results?.youtube || null;
      return { youtube: ytData, youtubeMusic, ytMvInfo, buzz: buzzData, music: musicData, album: albumData, fes: latestDbFes, fallbackFes: fesData, warnings, module, ytQuotaExceeded };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["v3-artist", slug] });
      queryClient.invalidateQueries({ queryKey: ["v3-trend-rankings"] });
      queryClient.invalidateQueries({ queryKey: ["v3-energy"] });
      const parts: string[] = [];
      if (data.youtube?.youtubeScore != null) parts.push(`YouTube: ${data.youtube.youtubeScore}`);
      if (data.buzz?.buzzScore != null) parts.push(`Buzz: ${data.buzz.buzzScore}`);
      if (data.music?.musicScore != null) parts.push(`Music: ${data.music.musicScore}`);
      if (data.album) parts.push('Album ✓');
      const notificationFes = data.fes?.energy_score ?? data.fallbackFes?.results?.[0]?.energyScore;
      if (notificationFes != null) parts.push(`FES: ${Math.round(notificationFes)}`);
      const desc = parts.join(' · ') || 'Using cached data';
      if (data.ytQuotaExceeded) {
        toast({ title: "YouTube 할당량 소진", description: "일일 할당량이 소진되었습니다. 내일 자동으로 리셋됩니다.", variant: "destructive" });
      }
      if (data.warnings?.length) {
        toast({ title: "일부 수집 실패", description: `${desc}\n⚠️ ${data.warnings.join(', ')}` });
      } else if (!data.ytQuotaExceeded) {
        toast({ title: "수집 완료", description: desc });
      }
      setDataRunDialogOpen(false);
    },
    onError: (err: any) => { toast({ title: "Error", description: err.message, variant: "destructive" }); },
  });

  const handleRunModule = (module: string) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshMutation.mutate(module);
  };

  const liveData = refreshMutation.data;
  const liveYt = liveData?.youtube;
  const liveYtMusic = liveData?.youtubeMusic; // Topic channel data
  const liveYtMv = liveData?.ytMvInfo; // MV category data
  const ytData = liveYt ? {
    channel: { ...(liveYt.channel || {}), videoCount: liveYt.channel?.totalVideoCount ?? liveYt.channel?.videoCount ?? 0 },
    summary: liveYt.recentVideos ? { totalRecentViews: liveYt.recentVideos.totalViews || 0, totalRecentLikes: liveYt.recentVideos.totalLikes || 0, totalRecentComments: liveYt.recentVideos.totalComments || 0, engagementRate: liveYt.recentVideos.engagementRate || null, avgViewsPerVideo: liveYt.recentVideos.avgViewsPerVideo || 0 } : null,
    topEngagement: liveYt.topEngagement || [], recentVideos: liveYt.recentVideos, fetchedAt: liveYt.fetchedAt, youtubeScore: liveYt.youtubeScore || 0,
    musicVideoViews: liveYtMv?.musicVideoViews || 0, musicVideoCount: liveYtMv?.musicVideoCount || 0,
  } : (cachedYt ? {
    channel: { channelId: cachedYt.youtube_channel_id, channelTitle: entry?.title, channelThumbnail: null, subscriberCount: cachedYt.youtube_subscriber_count || 0, totalViewCount: cachedYt.youtube_total_views || 0, videoCount: cachedYt.youtube_total_videos || 0 },
    youtubeScore: cachedYt.youtube_score || 0,
    summary: cachedYt.youtube_recent_stats ? { totalRecentViews: cachedYt.youtube_recent_stats.total_views || 0, totalRecentLikes: cachedYt.youtube_recent_stats.total_likes || 0, totalRecentComments: cachedYt.youtube_recent_stats.total_comments || 0, engagementRate: cachedYt.youtube_recent_stats.engagement_rate || null, avgViewsPerVideo: cachedYt.youtube_recent_stats.avg_views_per_video || 0 } : null,
    topEngagement: cachedYt.youtube_top_videos || [], recentVideos: null as any, fetchedAt: cachedYt.youtube_updated_at,
  } : null);

  // YouTube Music Topic channel data
  const ytMusicData = liveYtMusic ? {
    topicTotalViews: liveYtMusic.topicTotalViews || 0,
    topicSubscribers: liveYtMusic.topicSubscribers || 0,
    tracksCount: liveYtMusic.tracksCount || 0,
  } : null;

  const liveBuzz = liveData?.buzz;
  const buzzData = liveBuzz?.success ? liveBuzz : (cachedBuzz ? { buzzScore: cachedBuzz.buzz_score || 0, mentionCount: cachedBuzz.mention_count || 0, sentiment: { score: cachedBuzz.sentiment_score || 50, label: cachedBuzz.sentiment_label || 'neutral' }, topMentions: cachedBuzz.top_mentions || [], fetchedAt: cachedBuzz.updated_at } : null);

  const cachedMusic = (entry?.metadata as any)?.music_stats;
  const liveMusic = liveData?.music;
  const musicData = liveMusic?.success ? liveMusic : (cachedMusic ? { musicScore: cachedMusic.music_score || 0, lastfm: cachedMusic.lastfm, musicbrainz: cachedMusic.musicbrainz, deezer: cachedMusic.deezer, fetchedAt: cachedMusic.music_updated_at } : null);

  // v3_scores_v2에서 최신 music_score 가져오기
  const { data: v2MusicScore } = useQuery({
    queryKey: ["v2-music-score", entry?.id],
    queryFn: async () => {
      const { data } = await supabase.from("v3_scores_v2" as any).select("music_score").eq("wiki_entry_id", entry!.id).order("scored_at", { ascending: false }).limit(1).maybeSingle();
      return (data as any)?.music_score ?? null;
    },
    enabled: !!entry?.id,
    staleTime: 60_000,
  });
  // v3_scores_v2 값이 있으면 우선 사용
  const effectiveMusicScore = v2MusicScore != null ? v2MusicScore : (musicData?.musicScore || 0);

  // 네이버 뉴스 스냅샷
  const { data: naverNews } = useQuery({
    queryKey: ["naver-news-snapshot", entry?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_data_snapshots")
        .select("raw_response, collected_at")
        .eq("wiki_entry_id", entry!.id)
        .eq("platform", "naver_news")
        .not("raw_response", "is", null)
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.raw_response) return null;
      const items = (data.raw_response as any)?.top_items || [];
      return { items: items.slice(0, 5), collectedAt: data.collected_at };
    },
    enabled: !!entry?.id,
    staleTime: 60_000,
  });

  const pageTitle = entry?.title || "Artist";

  const MobileHeader = () => (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center h-14 px-2 max-w-screen-lg mx-auto">
        <div className="flex items-center gap-1 w-20">
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" asChild><Link to="/"><Home className="w-4 h-4" /></Link></Button>
        </div>
        <h1 className="flex-1 text-center text-sm font-bold text-foreground truncate">{pageTitle}</h1>
        <div className="flex items-center justify-end w-20">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );

  const PageContent = () => {
    if (entryLoading) return <div className="max-w-2xl mx-auto px-4 py-6 space-y-4"><Skeleton className="h-32 w-full rounded-2xl" /><div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div></div>;
    if (!entry) return <div className="max-w-2xl mx-auto px-4 py-16 text-center"><p className="text-muted-foreground">아티스트를 찾을 수 없습니다</p><Link to="/" className="text-primary mt-2 inline-block">← 랭킹으로 돌아가기</Link></div>;

    const ytScore = ytData?.youtubeScore || 0; const bzScore = buzzData?.buzzScore || 0; const msScore = effectiveMusicScore;
    let ytWeight = 0.6, bzWeight = 0.2, msWeight = 0.2;
    if (bzScore > 0 && ytScore > 0) { const ratio = bzScore / ytScore; if (ratio > 0.5) { bzWeight = Math.min(0.35, 0.2 + ratio * 0.15); ytWeight = 1 - bzWeight - msWeight; } }
    const totalTrendScore = Math.round(ytScore * ytWeight + bzScore * bzWeight + msScore * msWeight);

    return (
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 pb-24 space-y-3 overflow-x-hidden">
        <div className="flex items-center gap-3">
          <Avatar className="w-14 h-14">
            <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} />
            <AvatarFallback className="bg-muted text-lg font-bold">{entry.title?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-foreground truncate">{entry.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{entry.schema_type === 'member' ? '솔로 아티스트' : '그룹'}</p>
          </div>
        </div>

        {(ytData || buzzData) && (
          <Card className="p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground font-medium">트렌드 스코어</p><p className="text-2xl font-black text-foreground">{(totalTrendScore || 0).toLocaleString()}</p></div>
              </div>
              <div className="text-right space-y-1">
                {ytData && <div className="flex items-center gap-1.5 justify-end"><Youtube className="w-3 h-3 text-destructive" /><span className="text-xs font-semibold text-foreground">{(ytData.youtubeScore || 0).toLocaleString()}</span></div>}
                {buzzData && <div className="flex items-center gap-1.5 justify-end"><MessageSquare className="w-3 h-3 text-amber-500" /><span className="text-xs font-semibold text-foreground">{(buzzData.buzzScore || 0).toLocaleString()}</span></div>}
                {(effectiveMusicScore > 0 || musicData) && <div className="flex items-center gap-1.5 justify-end"><Music className="w-3 h-3 text-primary" /><span className="text-xs font-semibold text-foreground">{effectiveMusicScore.toLocaleString()}</span></div>}
              </div>
            </div>
          </Card>
        )}

        {(refreshMutation.isPending || refreshMutation.isSuccess) && <RainbowProgress isComplete={!refreshMutation.isPending} />}

        {/* Admin: 소스별 데이터 패널 */}
        {isAdmin && entry?.id && <AdminDataSourcePanel wikiEntryId={entry.id} artistTitle={entry.title} />}

        {/* 데이터 수집 버튼 */}
        <Button
          variant="outline"
          className="w-full h-10 rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => setDataRunDialogOpen(true)}
          disabled={refreshMutation.isPending || isCrawling}
        >
          <Play className={cn("w-4 h-4", refreshMutation.isPending && "animate-pulse")} />
          <span className="text-sm font-semibold">{isCrawling ? "수집중..." : "데이터 수집"}</span>
        </Button>

        {entry?.id && <V3EnergyChart wikiEntryId={entry.id} />}

        {!ytData && !buzzData && !refreshMutation.isPending && (
          <Card className="p-8 text-center border-dashed">
            <Youtube className="w-12 h-12 text-destructive/30 mx-auto mb-3" />
            <h3 className="font-bold text-foreground mb-1">데이터 없음</h3>
            <p className="text-sm text-muted-foreground">위의 '데이터 수집' 버튼을 눌러 {entry?.title || '이 아티스트'}의 데이터를 가져오세요</p>
          </Card>
        )}

        {ytData && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard icon={Users} label="구독자" value={formatNumber(ytData.channel?.subscriberCount || 0)} color="bg-destructive" />
              <MetricCard icon={Eye} label="총 조회수" value={formatNumber(ytData.channel?.totalViewCount || 0)} color="bg-blue-500" />
              <MetricCard icon={Film} label="영상 수" value={formatNumber(ytData.channel?.videoCount || 0)} color="bg-purple-500" />
            </div>
            {ytData.summary && (
              <>
                <div className="flex items-center gap-2 mt-2"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">최근 영상 요약</span><div className="h-px flex-1 bg-border" /></div>
                <div className="grid grid-cols-3 gap-2">
                  <MetricCard icon={Eye} label="최근 조회" value={formatNumber(ytData.summary.totalRecentViews || 0)} color="bg-green-500" />
                  <MetricCard icon={ThumbsUp} label="좋아요" value={formatNumber(ytData.summary.totalRecentLikes || 0)} color="bg-pink-500" />
                  <MetricCard icon={MessageSquare} label="댓글" value={formatNumber(ytData.summary.totalRecentComments || 0)} color="bg-amber-500" />
                </div>
              </>
            )}
            {(ytData.topEngagement?.length > 0 || ytData.recentVideos?.length > 0) && (
              <>
                <div className="flex items-center gap-2 mt-2"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">인기 영상</span><div className="h-px flex-1 bg-border" /></div>
                <div className="space-y-1.5">
                  {(ytData.topEngagement || ytData.recentVideos || []).slice(0, 10).map((video: any, idx: number) => <VideoRow key={video.videoId} video={video} rank={idx + 1} onExternalClick={trackExternalClick} />)}
                </div>
              </>
            )}
            {/* MV Category Metrics */}
            {(ytData.musicVideoViews > 0 || ytData.musicVideoCount > 0) && (
              <>
                <div className="flex items-center gap-2 mt-2"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest flex items-center gap-1"><Music className="w-3 h-3 text-primary" /> 뮤직비디오</span><div className="h-px flex-1 bg-border" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard icon={Play} label="MV 조회수" value={formatNumber(ytData.musicVideoViews)} subValue={`${ytData.musicVideoCount}개 뮤직비디오`} color="bg-primary" />
                  <MetricCard icon={Film} label="MV 수" value={String(ytData.musicVideoCount)} subValue="카테고리: 음악" color="bg-primary" />
                </div>
              </>
            )}
          </>
        )}

        {/* YouTube Music Topic Channel */}
        {ytMusicData && ytMusicData.topicTotalViews > 0 && (
          <>
            <div className="flex items-center gap-2 mt-4"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-primary font-semibold uppercase tracking-widest flex items-center gap-1"><Headphones className="w-3 h-3" /> YouTube Music</span><div className="h-px flex-1 bg-border" /></div>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard icon={Headphones} label="스트림" value={formatNumber(ytMusicData.topicTotalViews)} subValue="토픽 채널" color="bg-destructive" />
              <MetricCard icon={Users} label="구독자" value={formatNumber(ytMusicData.topicSubscribers)} subValue="토픽 채널" color="bg-destructive" />
              <MetricCard icon={Disc3} label="트랙" value={String(ytMusicData.tracksCount)} subValue="최근" color="bg-destructive" />
            </div>
          </>
        )}

        {/* 네이버 뉴스 */}
        {naverNews && naverNews.items.length > 0 && (
          <>
            <div className="flex items-center gap-2 mt-4"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest flex items-center gap-1"><Newspaper className="w-3 h-3 text-emerald-500" /> 네이버 뉴스</span><div className="h-px flex-1 bg-border" /></div>
            <div className="space-y-1.5">
              {naverNews.items.map((item: any, idx: number) => (
                <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => trackExternalClick(item.url)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card/50 hover:bg-card transition-colors">
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground">{idx + 1}</span>
                  {item.image && (
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                      <img src={item.image} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground line-clamp-2">{(item.title || '').replace(/\[사진\]|\[포토\]|\[화보\]|\[영상\]/g, '').trim()}</p>
                    {item.description && <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{(item.description || '').replace(/\[사진\]|\[포토\]|\[화보\]|\[영상\]/g, '').trim()}</p>}
                    {item.source && <span className="text-[9px] text-muted-foreground/60">{item.source}</span>}
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </>
        )}

        {buzzData && (
          <>
            <div className="flex items-center gap-2 mt-4"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> X 버즈</span><div className="h-px flex-1 bg-border" /></div>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard icon={Zap} label="버즈 스코어" value={String(buzzData.buzzScore || 0)} color="bg-amber-500" />
              <MetricCard icon={Hash} label="멘션" value={String(buzzData.mentionCount || 0)} subValue="24시간" color="bg-sky-500" />
              <MetricCard icon={Smile} label="감성" value={buzzData.sentiment?.label === 'positive' ? '긍정' : buzzData.sentiment?.label === 'negative' ? '부정' : '중립'} subValue={`${buzzData.sentiment?.score || 50}`} color={buzzData.sentiment?.label === 'positive' ? 'bg-emerald-500' : buzzData.sentiment?.label === 'negative' ? 'bg-rose-500' : 'bg-slate-500'} />
            </div>
            {buzzData.topMentions?.length > 0 && (
              <div className="space-y-1.5">
                {buzzData.topMentions.map((mention: any, idx: number) => (
                  <a key={idx} href={mention.url} target="_blank" rel="noopener noreferrer" onClick={() => trackExternalClick(mention.url)} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 hover:bg-card transition-colors">
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground">{idx + 1}</span>
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-foreground line-clamp-2">{mention.title || mention.description || ''}</p></div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        {musicData && (
          <>
            <div className="flex items-center gap-2 mt-4"><div className="h-px flex-1 bg-border" /><span className="text-[10px] text-primary font-semibold uppercase tracking-widest flex items-center gap-1"><Music className="w-3 h-3" /> 음악 데이터</span><div className="h-px flex-1 bg-border" /></div>
            <div className="grid grid-cols-3 gap-2">
              {musicData.lastfm && (<><MetricCard icon={Headphones} label="리스너" value={formatNumber(musicData.lastfm.listeners)} subValue="Last.fm" color="bg-red-600" /><MetricCard icon={Music} label="재생수" value={formatNumber(musicData.lastfm.playcount)} subValue="Last.fm" color="bg-red-600" /></>)}
              {musicData.deezer && <MetricCard icon={Users} label="팬" value={formatNumber(musicData.deezer.fans)} subValue="Deezer" color="bg-purple-600" />}
            </div>
            {musicData.musicbrainz && (
              <div className="grid grid-cols-3 gap-2">
                <MetricCard icon={Disc3} label="앨범" value={String(musicData.musicbrainz.albums || 0)} subValue="MusicBrainz" color="bg-amber-600" />
                <MetricCard icon={Music} label="싱글" value={String(musicData.musicbrainz.singles || 0)} color="bg-amber-600" />
                <MetricCard icon={Disc3} label="EP" value={String(musicData.musicbrainz.eps || 0)} color="bg-amber-600" />
              </div>
            )}
          </>
        )}

        {entry?.id && <V3ArtistMilestones wikiEntryId={entry.id} />}
      </div>
    );
  };

  const dataRunDialog = entry?.id ? (
    <DataRunDialog
      open={dataRunDialogOpen}
      onOpenChange={setDataRunDialogOpen}
      wikiEntryId={entry.id}
      artistTitle={entry.title}
      onRunModule={handleRunModule}
      isRunning={refreshMutation.isPending}
      isCrawling={isCrawling}
    />
  ) : null;

  if (isMobile) {
    return (<><SEO title={`${pageTitle} – KTrenZ`} description={`${pageTitle} real-time trend score, YouTube stats, buzz mentions & energy chart on KTrenZ.`} path={`/artist/${slug}`} ogImage={entry?.image_url ?? undefined} jsonLd={{ "@context": "https://schema.org", "@type": "Person", name: pageTitle, url: `https://ktrenz.lovable.app/artist/${slug}`, image: entry?.image_url }} /><MobileHeader /><div className="pt-14 overflow-x-hidden"><PageContent /></div>{dataRunDialog}</>);
  }

  return (
    <><SEO title={`${pageTitle} – KTrenZ`} description={`${pageTitle} real-time trend score, YouTube stats, buzz mentions & energy chart on KTrenZ.`} path={`/artist/${slug}`} ogImage={entry?.image_url ?? undefined} jsonLd={{ "@context": "https://schema.org", "@type": "Person", name: pageTitle, url: `https://ktrenz.lovable.app/artist/${slug}`, image: entry?.image_url }} />
      <div className="h-[100dvh] flex flex-col bg-background">
        <header className="sticky top-0 z-50 flex items-center gap-3 h-14 px-4 border-b border-border bg-background/80 backdrop-blur-md shrink-0">
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" asChild><Link to="/"><Home className="w-4 h-4" /></Link></Button>
          <h1 className="flex-1 text-center font-bold text-base text-foreground truncate">{pageTitle}</h1>
          <div className="flex items-center justify-end w-20">
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-auto"><PageContent /></main>
      </div>
      {dataRunDialog}
    </>
  );
};

export default V3ArtistDetail;
