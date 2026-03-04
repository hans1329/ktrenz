import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ChevronUp, ChevronDown, ChevronRight, Flame, LayoutGrid, List, Crown, Medal, Youtube, Twitter, Music, Disc3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import ArtistListingRequestDialog from "@/components/v3/ArtistListingRequestDialog";
import V3Treemap, { type EnergyCategory } from "@/components/v3/V3Treemap";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { toast } from "sonner";

// 크론잡 실행 상태 확인 훅
const useCrawlStatus = () => {
  return useQuery({
    queryKey: ["crawl-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_jobs")
        .select("status, metadata, started_at")
        .eq("id", "daily-data-crawl")
        .single();
      if (!data) return data;
      // If status is "running" but started_at is more than 10 minutes ago, treat as stale/completed
      if (data.status === "running" && data.started_at) {
        const startedAt = new Date(data.started_at).getTime();
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        if (startedAt < tenMinutesAgo) {
          return { ...data, status: "completed" };
        }
      }
      return data;
    },
    refetchInterval: 10000,
  });
};

const PlatformIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case "spotify": return <Music className="w-3 h-3 text-green-500" />;
    case "youtube": return <Youtube className="w-3 h-3 text-red-500" />;
    case "twitter": return <Twitter className="w-3 h-3 text-blue-400" />;
    default: return null;
  }
};

const ChangeIndicator = ({ change }: { change: number }) => {
  if (change > 0) return (
    <span className="flex items-center gap-0.5 text-green-500 text-xs font-bold">
      <ChevronUp className="w-3 h-3" />+{change.toFixed(1)}%
    </span>
  );
  if (change < 0) return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-bold">
      <ChevronDown className="w-3 h-3" />{change.toFixed(1)}%
    </span>
  );
  return <span className="text-xs text-muted-foreground font-medium">—</span>;
};

const getEnergyLevel = (score: number, t?: (k: string) => string) => {
  const tr = t || ((k: string) => k);
  if (score >= 300) return { icon: "🔥", label: tr("energy.explosive"), color: "text-red-500", bg: "bg-red-500/10" };
  if (score >= 150) return { icon: "⚡", label: tr("energy.active"), color: "text-amber-500", bg: "bg-amber-500/10" };
  if (score >= 100) return { icon: "💫", label: tr("energy.normal"), color: "text-blue-400", bg: "bg-blue-400/10" };
  return { icon: "💤", label: tr("energy.low"), color: "text-muted-foreground", bg: "bg-muted" };
};

const MiniEnergyGauge = ({ score, maxScore = 500 }: { score: number; maxScore?: number }) => {
  const pct = Math.min(score / maxScore, 1);
  const angle = pct * 180;
  const level = getEnergyLevel(score);
  const gradId = `miniGauge_${score}_${Math.random().toString(36).slice(2, 6)}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-12 overflow-hidden">
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
          <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke={`url(#${gradId})`} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={`${angle * Math.PI * 90 / 180} 999`} />
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c13400" />
              <stop offset="50%" stopColor="#e04a1a" />
              <stop offset="100%" stopColor="#ff6b3d" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-0">
          <span className="text-lg font-black text-foreground leading-none">{score}</span>
        </div>
      </div>
      <div className={cn("flex items-center gap-0.5 mt-0.5 px-2 py-0.5 rounded-full", level.bg)}>
        <span className="text-[10px]">{level.icon}</span>
        <span className={cn("text-[9px] font-bold", level.color)}>{level.label}</span>
      </div>
    </div>
  );
};

const MiniCategoryBars = ({ data }: { data: Record<string, { velocity: number; intensity: number }> }) => {
  const maxVal = 250;
  const cats = [
    { key: "youtube", label: "YT", color: "from-red-500 to-orange-500" },
    { key: "buzz", label: "BZ", color: "from-purple-500 to-violet-500" },
    { key: "album", label: "AL", color: "from-amber-500 to-yellow-500" },
    { key: "music", label: "MU", color: "from-teal-400 to-cyan-500" },
  ];
  return (
    <div className="space-y-1 w-full">
      {cats.map(cat => {
        const vi = data[cat.key] || { velocity: 0, intensity: 0 };
        if (vi.velocity === 0 && vi.intensity === 0) return null;
        return (
          <div key={cat.key}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[9px] font-bold text-muted-foreground w-5">{cat.label}</span>
              <div className="flex-1 flex gap-1">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden" title={`Velocity: ${Math.round(vi.velocity)}`}>
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", cat.color)} style={{ width: `${Math.min((vi.velocity / maxVal) * 100, 100)}%` }} />
                </div>
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden opacity-60" title={`Intensity: ${Math.round(vi.intensity)}`}>
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", cat.color)} style={{ width: `${Math.min((vi.intensity / maxVal) * 100, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PodiumCard = ({ item, rank, maxScore, energyData, onTrack }: { item: any; rank: number; maxScore: number; energyData?: Record<string, { velocity: number; intensity: number }>; onTrack?: () => void }) => {
  const entry = item.wiki_entries as any;
  if (!entry) return null;

  const rankStyles = {
    1: { icon: <Crown className="w-6 h-6 text-yellow-400" />, border: "border-yellow-400/30", glow: "shadow-[0_0_30px_hsl(45_100%_50%/0.2)]", gradient: "from-yellow-400/10 via-transparent to-transparent", size: "w-20 h-20", label: "1ST", labelColor: "text-yellow-400", isFirst: true },
    2: { icon: <Medal className="w-4 h-4 text-slate-300" />, border: "border-slate-300/20", glow: "shadow-[0_0_15px_hsl(210_10%_70%/0.1)]", gradient: "from-slate-300/8 via-transparent to-transparent", size: "w-14 h-14", label: "2ND", labelColor: "text-slate-300", isFirst: false },
    3: { icon: <Medal className="w-4 h-4 text-amber-600" />, border: "border-amber-600/20", glow: "shadow-[0_0_15px_hsl(30_80%_40%/0.1)]", gradient: "from-amber-600/8 via-transparent to-transparent", size: "w-14 h-14", label: "3RD", labelColor: "text-amber-600", isFirst: false },
  }[rank] || { icon: null, border: "", glow: "", gradient: "", size: "w-12 h-12", label: "", labelColor: "", isFirst: false };

  const hasEnergy = item.energy_score > 0;
  const displayScore = Number(item.displayScore ?? item.total_score ?? 0);

  return (
    <Link to={`/artist/${entry.slug}`} className="block" onClick={onTrack}>
      <div className={cn("relative rounded-2xl transition-all active:scale-[0.97]", "bg-gradient-to-br", rankStyles.gradient, rankStyles.glow, "bg-card hover:shadow-card-hover",
        rankStyles.isFirst ? "p-5 border-2 border-yellow-400/20" : "p-4")}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {rankStyles.icon}
            <span className={cn("font-black tracking-wider", rankStyles.labelColor, rankStyles.isFirst ? "text-sm" : "text-xs")}>{rankStyles.label}</span>
          </div>
          <ChangeIndicator change={item.changePercent ?? 0} />
        </div>
        <div className={cn("flex items-center", rankStyles.isFirst ? "gap-4" : "gap-3")}>
          <Avatar className={cn(rankStyles.size, "ring-2 ring-offset-2 ring-offset-card",
            rank === 1 ? "ring-yellow-400/50" : rank === 2 ? "ring-slate-300/30" : "ring-amber-600/30")}>
            <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} className="object-cover" />
            <AvatarFallback className={cn("bg-muted font-bold", rankStyles.isFirst ? "text-xl" : "text-lg")}>{entry.title?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className={cn("font-bold text-foreground truncate", rankStyles.isFirst ? "text-lg" : "text-sm")}>{entry.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {item.youtube_score > 0 && (
                <div className="flex items-center gap-0.5">
                  <PlatformIcon platform="youtube" />
                  <span className="text-[10px] text-muted-foreground">{Math.round(item.youtube_score)}</span>
                </div>
              )}
              {item.buzz_score > 0 && (
                <div className="flex items-center gap-0.5">
                  <PlatformIcon platform="twitter" />
                  <span className="text-[10px] text-muted-foreground">{Math.round(item.buzz_score)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn("font-black text-primary", rankStyles.isFirst ? "text-2xl" : "text-lg")}>{Math.round(displayScore)}</p>
            <div className="mt-1 w-16 h-1.5 rounded-full bg-muted overflow-hidden ml-auto">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-orange-400 transition-all"
                style={{ width: `${maxScore > 0 ? (displayScore / maxScore) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        {hasEnergy && energyData && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-start gap-4">
              <MiniEnergyGauge score={Math.round(item.energy_score)} />
              <div className="flex-1 pt-1">
                <MiniCategoryBars data={energyData} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

const RankingRow = ({ item, rank, maxScore, onTrack }: { item: any; rank: number; maxScore: number; onTrack?: () => void }) => {
  const entry = item.wiki_entries as any;
  if (!entry) return null;
  const displayScore = Number(item.displayScore ?? item.total_score ?? 0);
  const scorePercent = maxScore > 0 ? (displayScore / maxScore) * 100 : 0;

  return (
    <Link to={`/artist/${entry.slug}`} onClick={onTrack}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/50 hover:bg-card transition-colors active:scale-[0.98]">
        <span className="w-6 text-center text-sm font-bold text-muted-foreground">{rank}</span>
        <Avatar className="w-10 h-10 shrink-0">
          <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} className="object-cover" />
          <AvatarFallback className="bg-muted text-sm font-medium">{entry.title?.[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{entry.title}</p>
            {item.energy_score > 0 && (
              <span className={cn("text-[10px] font-bold shrink-0",
                item.energy_score >= 300 ? "text-red-500" : item.energy_score >= 150 ? "text-amber-500" : "text-muted-foreground")}>
                {item.energy_score >= 300 ? "🔥" : item.energy_score >= 150 ? "⚡" : ""}
              </span>
            )}
          </div>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary/30 transition-all" style={{ width: `${scorePercent}%` }} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-foreground">{Math.round(displayScore)}</p>
          <ChangeIndicator change={item.changePercent ?? 0} />
          {item.energy_score > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end mt-0.5">
              <Flame className="w-2.5 h-2.5" />{Math.round(item.energy_score)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

type Period = "1D" | "1W" | "1M" | "3M";
const periodDays: Record<Period, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90 };

const V3TrendRankings = () => {
  const track = useTrackEvent();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { isAdmin } = useAdminAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("1D");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "treemap">("treemap");
  const [energyCategory, setEnergyCategory] = useState<EnergyCategory>("all");
  const [collectingModule, setCollectingModule] = useState<string | null>(null);
  const { data: crawlStatus } = useCrawlStatus();
  const isCrawling = crawlStatus?.status === "running";
  const periodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 수집 상태 추적
  const [collectionStatus, setCollectionStatus] = useState<Record<string, { status: string; runId?: string; startedAt?: number }>>({});

  const pollCollectionStatus = (source: string, runId: string) => {
    const startedAt = Date.now();
    setCollectionStatus(prev => ({ ...prev, [source]: { status: "running", runId, startedAt } }));
    
    const interval = setInterval(async () => {
      try {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const label = source === "youtube" ? "YouTube" : source === "buzz" ? "Buzz" : source === "album" ? "Album" : "Music";

        // ktrenz_data_snapshots에서 최근 스냅샷 확인 (모든 모듈 공통)
        const snapshotPlatformMap: Record<string, string> = { youtube: "youtube", buzz: "buzz_multi", album: "hanteo", music: "lastfm" };
        const snapshotPlatform = snapshotPlatformMap[source] || source;
        const { data: snapData } = await supabase
          .from("ktrenz_data_snapshots" as any)
          .select("collected_at")
          .eq("platform", snapshotPlatform)
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle() as { data: any };

        if (snapData && new Date(snapData.collected_at).getTime() > startedAt) {
          clearInterval(interval);
          toast.success(`${label} 수집 완료 (${elapsed}초), 스코어 재계산 중...`);
          setCollectionStatus(prev => ({ ...prev, [source]: { status: "scoring", runId, startedAt } }));
          
          // 에너지 스코어 재계산 후 UI 갱신
          try {
            await supabase.functions.invoke("calculate-energy-score", { body: {} });
            toast.success("스코어 반영 완료!");
          } catch (e) {
            console.error("Energy score recalc error:", e);
          }
          
          // 랭킹·트리맵 데이터 즉시 갱신
          queryClient.invalidateQueries({ queryKey: ["v3-trend-rankings"] });
          queryClient.invalidateQueries({ queryKey: ["v3-top3-energy"] });
          
          setCollectionStatus(prev => ({ ...prev, [source]: { status: "done" } }));
          setTimeout(() => setCollectionStatus(prev => { const n = { ...prev }; delete n[source]; return n; }), 5000);
        } else if (elapsed > 300) {
          clearInterval(interval);
          setCollectionStatus(prev => ({ ...prev, [source]: { status: "timeout" } }));
          toast.error(`${label} 수집 타임아웃 (5분 초과)`);
          setTimeout(() => setCollectionStatus(prev => { const n = { ...prev }; delete n[source]; return n; }), 5000);
        } else {
          setCollectionStatus(prev => ({ ...prev, [source]: { status: "running", runId, startedAt } }));
        }
      } catch { /* ignore polling errors */ }
    }, 5000);

    return () => clearInterval(interval);
  };

  const triggerTier1Collection = async (source: string) => {
    if (collectionStatus[source]?.status === "running") return;

    const moduleMap = {
      youtube: "youtube",
      buzz: "buzz",
      album: "hanteo",
      music: "music",
    } as const;

    const labelMap = {
      youtube: "YouTube",
      buzz: "Buzz",
      album: "Album",
      music: "Music",
    } as const;

    const mappedModule = moduleMap[source as keyof typeof moduleMap];
    const label = labelMap[source as keyof typeof labelMap];

    if (!mappedModule || !label) {
      toast.error("알 수 없는 수집 모듈입니다.");
      return;
    }

    setCollectingModule(source);
    try {
      const { data, error } = await supabase.functions.invoke("data-engine", {
        body: { module: mappedModule, triggerSource: "admin-front" },
      });
      if (error) throw error;
      toast(`${label} 수집 시작됨, 진행상황을 추적합니다...`);
      const runId = data?.runId || "unknown";
      pollCollectionStatus(source, runId);
    } catch (err: any) {
      toast.error(`${label} 수집 실패: ${err.message}`);
    } finally {
      setCollectingModule(null);
    }
  };

  const ADMIN_COLLECT_BUTTONS = [
    { key: "youtube", label: "YT", icon: <Youtube className="w-3 h-3" /> },
    { key: "buzz", label: "BZ", icon: <Twitter className="w-3 h-3" /> },
    { key: "album", label: "AL", icon: <Disc3 className="w-3 h-3" /> },
    { key: "music", label: "MU", icon: <Music className="w-3 h-3" /> },
  ];

  const getElapsed = (startedAt?: number) => {
    if (!startedAt) return "";
    return `${Math.round((Date.now() - startedAt) / 1000)}s`;
  };

  const AdminCollectButtons = () => {
    const [, setTick] = useState(0);
    useEffect(() => {
      const hasRunning = Object.values(collectionStatus).some(s => s.status === "running");
      if (!hasRunning) return;
      const t = setInterval(() => setTick(v => v + 1), 1000);
      return () => clearInterval(t);
    }, [collectionStatus]);

    return (
      <div className="flex items-center gap-1 flex-wrap">
        {ADMIN_COLLECT_BUTTONS.map(btn => {
          const cs = collectionStatus[btn.key];
          const isRunning = cs?.status === "running";
          const isDone = cs?.status === "done";
          const isError = cs?.status === "error" || cs?.status === "timeout";
          return (
            <button key={btn.key} onClick={() => triggerTier1Collection(btn.key)}
              disabled={isRunning || collectingModule === btn.key}
              className={cn("flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors",
                isRunning ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse" :
                isDone ? "bg-green-500/20 text-green-400 border-green-500/30" :
                isError ? "bg-red-500/20 text-red-400 border-red-500/30" :
                collectingModule === btn.key ? "bg-primary/20 text-primary border-primary/30" :
                "bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30")}>
              {(isRunning || collectingModule === btn.key) ? <Loader2 className="w-3 h-3 animate-spin" /> : 
               isDone ? <span className="text-[10px]">✓</span> :
               isError ? <span className="text-[10px]">✗</span> : btn.icon}
              {btn.label}
              {isRunning && cs.startedAt && <span className="ml-0.5 text-[9px] opacity-70">{getElapsed(cs.startedAt)}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  const { data: rankings, isLoading } = useQuery({
    queryKey: ["v3-trend-rankings", period],
    queryFn: async () => {
      // Tier 1 아티스트만 필터링
      const { data: tier1Entries } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id));

      const { data: allScores, error } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, youtube_score, total_score, energy_score, energy_change_24h, buzz_score, album_sales_score, music_score,
          youtube_change_24h, buzz_change_24h, album_change_24h, music_change_24h, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata, schema_type)`)
        .order("scored_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!allScores?.length) return [];
      const typedScores = (allScores as any[]).filter(s => tier1Ids.has(s.wiki_entry_id));

      const latestMap = new Map<string, any>();
      for (const s of typedScores) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      return Array.from(latestMap.values()).map((item) => ({
        ...item,
        changePercent: item.energy_change_24h ?? 0,
      }));
    },
    staleTime: 30_000,
  });

  // 선택된 카테고리에 따라 정렬
  const getCatChange = (item: any, cat: EnergyCategory) => {
    switch (cat) {
      case "youtube": return item.youtube_change_24h ?? 0;
      case "buzz": return item.buzz_change_24h ?? 0;
      case "album": return item.album_change_24h ?? 0;
      case "music": return item.music_change_24h ?? 0;
      case "fan": return item.fan_change_24h ?? 0;
      default: return item.energy_change_24h ?? 0;
    }
  };

  const getCatScore = (item: any, cat: EnergyCategory) => {
    switch (cat) {
      case "youtube": return Number(item.youtube_score ?? 0);
      case "buzz": return Number(item.buzz_score ?? 0);
      case "album": return Number(item.album_sales_score ?? 0);
      case "music": return Number(item.music_score ?? 0);
      case "fan": return Number(item.fan_score ?? 0);
      default: return Number(item.total_score ?? 0);
    }
  };

  const sortedRankings = useMemo(() => {
    if (!rankings?.length) return [];
    const base = energyCategory === "all"
      ? rankings.filter((item: any) => Number(item.youtube_score ?? 0) > 0)
      : rankings;

    return [...base]
      .map(item => ({
        ...item,
        changePercent: getCatChange(item, energyCategory),
        displayScore: getCatScore(item, energyCategory),
      }))
      .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
  }, [rankings, energyCategory]);

  const top3Ids = (sortedRankings || []).slice(0, 3).map((r) => r.wiki_entry_id).filter(Boolean);
  const { data: energySnapshots } = useQuery({
    queryKey: ["v3-top3-energy", top3Ids],
    enabled: top3Ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        top3Ids.map((id) =>
          supabase.from("v3_energy_snapshots_v2" as any)
            .select("wiki_entry_id, youtube_velocity, youtube_intensity, buzz_velocity, buzz_intensity, album_velocity, album_intensity, music_velocity, music_intensity")
            .eq("wiki_entry_id", id).order("snapshot_at", { ascending: false }).limit(1).single()
        )
      );
      const map = new Map<string, Record<string, { velocity: number; intensity: number }>>();
      results.forEach((r: any) => {
        if (r.data) {
          const d = r.data;
          map.set(d.wiki_entry_id, {
            youtube: { velocity: Number(d.youtube_velocity) || 0, intensity: Number(d.youtube_intensity) || 0 },
            buzz: { velocity: Number(d.buzz_velocity) || 0, intensity: Number(d.buzz_intensity) || 0 },
            album: { velocity: Number(d.album_velocity) || 0, intensity: Number(d.album_intensity) || 0 },
            music: { velocity: Number(d.music_velocity) || 0, intensity: Number(d.music_intensity) || 0 },
          });
        }
      });
      return map;
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-4">
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>
        {[...Array(5)].map((_, i) => <Skeleton key={i + 3} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!rankings?.length) {
    return (
      <div className="px-4 py-16 text-center">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-orange-400/20 flex items-center justify-center">
          <TrendingUp className="w-10 h-10 text-primary/40" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">{t("rankings.comingSoon")}</h3>
        <p className="text-sm text-muted-foreground max-w-[280px] mx-auto">{t("rankings.comingSoonDesc")}</p>
      </div>
    );
  }

  const top3 = sortedRankings.slice(0, 3);
  const rest = sortedRankings.slice(3);
  const maxScore = Math.max(...sortedRankings.map((item: any) => Number(item.displayScore ?? 0)), 1);

  if (!isMobile) {
    // PC: Treemap + List side by side
    return (
      <div className="pb-4">
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between pt-4 pb-2">
            <div>
              <h2 className="text-xl font-black text-foreground">
                <span className={isCrawling ? "animate-fire-burn" : ""}>🔥</span> {t("rankings.live").replace("🔥 ", "")}
              </h2>
              {isCrawling ? (
                <p className="text-[10px] text-primary font-medium mt-0.5 pl-7 animate-pulse">
                  {t("rankings.updating")} {(crawlStatus?.metadata as any)?.processed || 0}/{(crawlStatus?.metadata as any)?.total || '...'} {t("rankings.artists")}...
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5 pl-7">{t("rankings.subtitle")}</p>
              )}
              {isAdmin && <div className="mt-1.5 pl-7"><AdminCollectButtons /></div>}
            </div>
          </div>
        </div>

        <div className="flex gap-6 px-4 items-start">
          <div className="w-[60%] shrink-0">
            <V3Treemap category={energyCategory} onCategoryChange={setEnergyCategory} />
          </div>
          <div className="w-[40%] min-w-0 space-y-3">
            <div className="pt-4 pb-3">
              <h2 className="text-xl font-black text-muted-foreground">🏆 Trend Rankings</h2>
              <p className="text-xs text-muted-foreground mt-0.5 pl-7">실시간 트렌드 순위 · {t("rankings.subtitle")}</p>
              <div className="flex items-center gap-1 mt-2 pl-7">
                {(["1D", "1W", "1M", "3M"] as Period[]).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={cn("px-3 py-1.5 text-xs font-semibold rounded-full transition-colors",
                      period === p ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {top3.map((item, idx) => (
              <PodiumCard key={item.wiki_entry_id} item={item} rank={idx + 1} maxScore={maxScore} energyData={energySnapshots?.get(item.wiki_entry_id)} onTrack={() => track("list_click", { artist_name: (item.wiki_entries as any)?.title, artist_slug: (item.wiki_entries as any)?.slug })} />
            ))}
            <Link to="/rankings"
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-muted/50 hover:bg-muted text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
              {t("rankings.fullRankings")} <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <ArtistListingRequestDialog />
      </div>
    );
  }

  // Mobile: toggle view mode
  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between pt-4 pb-2 gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-foreground">
              <span className={isCrawling ? "animate-fire-burn" : ""}>🔥</span> {t("rankings.live").replace("🔥 ", "")}
            </h2>
            {isCrawling ? (
              <p className="text-[10px] text-primary font-medium mt-0.5 pl-7 animate-pulse">
                {t("rankings.updating")} {(crawlStatus?.metadata as any)?.processed || 0}/{(crawlStatus?.metadata as any)?.total || '...'} {t("rankings.artists")}...
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 pl-7">{t("rankings.subtitle")}</p>
            )}
            {isAdmin && <div className="mt-1.5 pl-7"><AdminCollectButtons /></div>}
          </div>
          <div className="flex items-center rounded-full bg-muted p-1 shrink-0">
            <button onClick={() => setViewMode("list")}
              className={cn("p-2 rounded-full transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("treemap")}
              className={cn("p-2 rounded-full transition-colors", viewMode === "treemap" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "treemap" ? (
        <>
          <V3Treemap category={energyCategory} onCategoryChange={setEnergyCategory} />
          <ArtistListingRequestDialog />
        </>
      ) : (
        <>
          <div className="px-4 pt-2 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-muted-foreground">🏆 Trend Rankings</h2>
              <p className="text-xs text-muted-foreground mt-0.5 pl-7">{t("rankings.subtitle")}</p>
            </div>
            <div className="relative shrink-0" ref={periodRef}>
              <button onClick={() => setPeriodOpen(!periodOpen)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground shadow-sm">
                {period}
                <ChevronRight className={cn("w-3 h-3 transition-transform", periodOpen && "rotate-90")} />
              </button>
              {periodOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden min-w-[80px]">
                  {(["1D", "1W", "1M", "3M"] as Period[]).map((p) => (
                    <button key={p} onClick={() => { setPeriod(p); setPeriodOpen(false); }}
                      className={cn("block w-full px-4 py-2 text-xs font-semibold text-left transition-colors",
                        period === p ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="px-4 space-y-3 mb-4">
            {top3.map((item, idx) => (
              <PodiumCard key={item.wiki_entry_id} item={item} rank={idx + 1} maxScore={maxScore} energyData={energySnapshots?.get(item.wiki_entry_id)} onTrack={() => track("list_click", { artist_name: (item.wiki_entries as any)?.title, artist_slug: (item.wiki_entries as any)?.slug })} />
            ))}
          </div>
          {rest.length > 0 && (
            <>
              <div className="px-4 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">{t("rankings.fullRankings")}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
              <div className="px-4 space-y-1.5">
                {rest.map((item, idx) => <RankingRow key={item.wiki_entry_id} item={item} rank={idx + 4} maxScore={maxScore} onTrack={() => track("list_click", { artist_name: (item.wiki_entries as any)?.title, artist_slug: (item.wiki_entries as any)?.slug })} />)}
              </div>
            </>
          )}
          <ArtistListingRequestDialog />
        </>
      )}
    </div>
  );
};

export default V3TrendRankings;
