import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ChevronUp, ChevronDown, ChevronRight, Flame, LayoutGrid, List, Zap, Activity, Crown, Medal, Youtube, Twitter, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import ArtistListingRequestDialog from "@/components/v3/ArtistListingRequestDialog";
import V3Treemap from "@/components/v3/V3Treemap";
import { useIsMobile } from "@/hooks/use-mobile";

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

const MiniComponentBars = ({ velocity, intensity }: { velocity: number; intensity: number }) => {
  const maxVal = Math.max(velocity, intensity, 200);
  return (
    <div className="space-y-1.5 w-full">
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
            <Zap className="w-2.5 h-2.5 text-amber-500" /> Velocity
          </span>
          <span className="text-[10px] font-bold text-foreground">{velocity}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700"
            style={{ width: `${Math.min((velocity / maxVal) * 100, 100)}%` }} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
            <Activity className="w-2.5 h-2.5 text-teal-400" /> Intensity
          </span>
          <span className="text-[10px] font-bold text-foreground">{intensity}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-500 transition-all duration-700"
            style={{ width: `${Math.min((intensity / maxVal) * 100, 100)}%` }} />
        </div>
      </div>
    </div>
  );
};

const PodiumCard = ({ item, rank, maxScore, energyData }: { item: any; rank: number; maxScore: number; energyData?: { velocity: number; intensity: number } }) => {
  const entry = item.wiki_entries as any;
  if (!entry) return null;

  const rankStyles = {
    1: { icon: <Crown className="w-5 h-5 text-yellow-400" />, border: "border-yellow-400/30", glow: "shadow-[0_0_20px_hsl(45_100%_50%/0.15)]", gradient: "from-yellow-400/10 via-transparent to-transparent", size: "w-16 h-16", label: "1ST", labelColor: "text-yellow-400" },
    2: { icon: <Medal className="w-4 h-4 text-slate-300" />, border: "border-slate-300/20", glow: "shadow-[0_0_15px_hsl(210_10%_70%/0.1)]", gradient: "from-slate-300/8 via-transparent to-transparent", size: "w-14 h-14", label: "2ND", labelColor: "text-slate-300" },
    3: { icon: <Medal className="w-4 h-4 text-amber-600" />, border: "border-amber-600/20", glow: "shadow-[0_0_15px_hsl(30_80%_40%/0.1)]", gradient: "from-amber-600/8 via-transparent to-transparent", size: "w-14 h-14", label: "3RD", labelColor: "text-amber-600" },
  }[rank] || { icon: null, border: "", glow: "", gradient: "", size: "w-12 h-12", label: "", labelColor: "" };

  const hasEnergy = item.energy_score > 0;
  const velocity = energyData?.velocity ?? 100;
  const intensity = energyData?.intensity ?? 100;

  return (
    <Link to={`/artist/${entry.slug}`} className="block">
      <div className={cn("relative rounded-2xl p-4 transition-all active:scale-[0.97]", "bg-gradient-to-br", rankStyles.gradient, rankStyles.glow, "bg-card hover:shadow-card-hover")}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {rankStyles.icon}
            <span className={cn("text-xs font-black tracking-wider", rankStyles.labelColor)}>{rankStyles.label}</span>
          </div>
          <ChangeIndicator change={item.changePercent ?? 0} />
        </div>
        <div className="flex items-center gap-3">
          <Avatar className={cn(rankStyles.size, "ring-2 ring-offset-2 ring-offset-card",
            rank === 1 ? "ring-yellow-400/50" : rank === 2 ? "ring-slate-300/30" : "ring-amber-600/30")}>
            <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} />
            <AvatarFallback className="bg-muted text-lg font-bold">{entry.title?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{entry.title}</p>
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
            <p className="text-lg font-black text-primary">{Math.round(item.total_score || 0)}</p>
            <div className="mt-1 w-16 h-1.5 rounded-full bg-muted overflow-hidden ml-auto">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-orange-400 transition-all"
                style={{ width: `${maxScore > 0 ? ((item.total_score || 0) / maxScore) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
        {hasEnergy && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-start gap-4">
              <MiniEnergyGauge score={Math.round(item.energy_score)} />
              <div className="flex-1 pt-1">
                <MiniComponentBars velocity={Math.round(velocity)} intensity={Math.round(intensity)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

const RankingRow = ({ item, rank, maxScore }: { item: any; rank: number; maxScore: number }) => {
  const entry = item.wiki_entries as any;
  if (!entry) return null;
  const scorePercent = ((item.total_score || 0) / maxScore) * 100;

  return (
    <Link to={`/artist/${entry.slug}`}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/50 hover:bg-card transition-colors active:scale-[0.98]">
        <span className="w-6 text-center text-sm font-bold text-muted-foreground">{rank}</span>
        <Avatar className="w-10 h-10 shrink-0">
          <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} />
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
          <p className="text-sm font-bold text-foreground">{Math.round(item.total_score || 0)}</p>
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
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<Period>("1D");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "treemap">("treemap");
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

  const { data: rankings, isLoading } = useQuery({
    queryKey: ["v3-trend-rankings", period],
    queryFn: async () => {
      const days = periodDays[period];
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // 1군 아티스트 ID 목록
      const { data: tier1Entries } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id));

      const { data: allScores, error } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, youtube_score, total_score, energy_score, energy_change_24h, buzz_score, album_sales_score, music_score, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata, schema_type)`)
        .order("scored_at", { ascending: false });

      if (error) throw error;
      if (!allScores?.length) return [];
      // tier 1 필터
      const typedScores = (allScores as any[]).filter(s => tier1Ids.has(s.wiki_entry_id));

      const latestMap = new Map<string, any>();
      for (const s of typedScores) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      const oldScoreMap = new Map<string, number>();
      for (const s of typedScores) {
        if (s.scored_at <= since && !oldScoreMap.has(s.wiki_entry_id)) oldScoreMap.set(s.wiki_entry_id, s.total_score ?? 0);
      }
      for (const s of [...typedScores].reverse()) {
        if (!oldScoreMap.has(s.wiki_entry_id) && s.scored_at >= since) oldScoreMap.set(s.wiki_entry_id, s.total_score ?? 0);
      }

      const ranked = Array.from(latestMap.values()).map((item) => {
        const oldScore = oldScoreMap.get(item.wiki_entry_id);
        let changePercent = 0;
        const currentScore = item.total_score ?? 0;
        if (oldScore != null && oldScore > 0 && currentScore !== oldScore) {
          changePercent = ((currentScore - oldScore) / oldScore) * 100;
        } else if (item.energy_change_24h != null && item.energy_change_24h !== 0) {
          // Fallback: use energy_change_24h when no historical total_score comparison available
          changePercent = item.energy_change_24h;
        }
        return { ...item, changePercent };
      });

      ranked.sort((a, b) => {
        const diff = b.changePercent - a.changePercent;
        if (Math.abs(diff) > 0.01) return diff;
        return (b.total_score || 0) - (a.total_score || 0);
      });
      return ranked;
    },
    staleTime: 30_000,
  });

  const top3Ids = (rankings || []).slice(0, 3).map((r) => r.wiki_entry_id).filter(Boolean);
  const { data: energySnapshots } = useQuery({
    queryKey: ["v3-top3-energy", top3Ids],
    enabled: top3Ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        top3Ids.map((id) =>
          supabase.from("v3_energy_snapshots_v2" as any).select("wiki_entry_id, velocity_score, intensity_score")
            .eq("wiki_entry_id", id).order("snapshot_at", { ascending: false }).limit(1).single()
        )
      );
      const map = new Map<string, { velocity: number; intensity: number }>();
      results.forEach((r: any) => {
        if (r.data) map.set(r.data.wiki_entry_id, { velocity: Number(r.data.velocity_score) || 100, intensity: Number(r.data.intensity_score) || 100 });
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

  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  const maxScore = rankings[0]?.total_score || 1;

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
            </div>
            <div className="relative" ref={periodRef}>
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
        </div>

        <div className="flex gap-6 px-4 items-start">
          <div className="w-[60%] shrink-0">
            <V3Treemap />
          </div>
          <div className="w-[40%] min-w-0 space-y-3">
            <div className="pt-4 pb-3">
              <h2 className="text-xl font-black text-muted-foreground">{t("rankings.live")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 pl-7">실시간 트렌드 순위 · {t("rankings.subtitle")}</p>
            </div>
            {top3.map((item, idx) => (
              <PodiumCard key={item.wiki_entry_id} item={item} rank={idx + 1} maxScore={maxScore} energyData={energySnapshots?.get(item.wiki_entry_id)} />
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
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full bg-muted p-0.5">
              <button onClick={() => setViewMode("list")}
                className={cn("p-1.5 rounded-full transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <List className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode("treemap")}
                className={cn("p-1.5 rounded-full transition-colors", viewMode === "treemap" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
            {viewMode === "list" && (
              <div className="relative" ref={periodRef}>
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
            )}
          </div>
        </div>
      </div>

      {viewMode === "treemap" ? (
        <>
          <V3Treemap />
          <ArtistListingRequestDialog />
        </>
      ) : (
        <>
          <div className="px-4 pt-2 pb-3">
            <h2 className="text-lg font-black text-muted-foreground">{t("rankings.live")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 pl-7">{t("rankings.subtitle")}</p>
          </div>
          <div className="px-4 space-y-3 mb-4">
            {top3.map((item, idx) => (
              <PodiumCard key={item.wiki_entry_id} item={item} rank={idx + 1} maxScore={maxScore} energyData={energySnapshots?.get(item.wiki_entry_id)} />
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
                {rest.map((item, idx) => <RankingRow key={item.wiki_entry_id} item={item} rank={idx + 4} maxScore={maxScore} />)}
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
