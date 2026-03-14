import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronUp, ChevronDown, Flame, ArrowLeft, Crown, Medal, Youtube, Twitter, Music, Disc3, TrendingUp, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import V3DesktopHero from "@/components/v3/V3DesktopHero";
import V3Header from "@/components/v3/V3Header";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import type { EnergyCategory } from "@/components/v3/V3Treemap";

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

const RankIcon = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
  return <span className="w-6 text-center text-sm font-bold text-muted-foreground">{rank}</span>;
};

const CATEGORY_CHIPS: { key: EnergyCategory; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <Flame className="w-3 h-3" /> },
  { key: "youtube", label: "YouTube", icon: <Youtube className="w-3 h-3" /> },
  { key: "buzz", label: "Buzz", icon: <Twitter className="w-3 h-3" /> },
  { key: "album", label: "Album", icon: <Disc3 className="w-3 h-3" /> },
  { key: "music", label: "Music", icon: <Music className="w-3 h-3" /> },
  { key: "social", label: "Social", icon: <Star className="w-3 h-3" /> },
  { key: "fan", label: "Fan Activity", icon: <TrendingUp className="w-3 h-3" /> },
];

const V3Rankings = () => {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [category, setCategory] = useState<EnergyCategory>("all");

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  // Fetch user's agent slots
  const { data: agentSlots } = useQuery({
    queryKey: ["my-agent-slots-rankings", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_agent_slots" as any)
        .select("wiki_entry_id, artist_name, avatar_url, updated_at")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null)
        .order("updated_at", { ascending: false });
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const { data: rankings, isLoading } = useQuery({
    queryKey: ["v3-full-rankings"],
    queryFn: async () => {
      const { data: tier1Entries } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tier1Ids = new Set((tier1Entries || []).map((t: any) => t.wiki_entry_id));

      const { data: allScores, error } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, youtube_score, total_score, energy_score, energy_change_24h, buzz_score, album_sales_score, music_score, social_score,
          youtube_change_24h, buzz_change_24h, album_change_24h, music_change_24h, social_change_24h, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata, schema_type, created_at)`)
        .order("scored_at", { ascending: false });

      if (error) throw error;
      if (!allScores?.length) return [];

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const typedScores = (allScores as any[]).filter(s => tier1Ids.has(s.wiki_entry_id));
      const latestMap = new Map<string, any>();
      for (const s of typedScores) {
        // Skip entries created within 3 days to prevent ranking artifacts from incomplete data
        const entryCreatedAt = s.wiki_entries?.created_at;
        if (entryCreatedAt && entryCreatedAt > threeDaysAgo) continue;
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      return Array.from(latestMap.values()).map((item) => ({
        ...item,
        changePercent: item.energy_change_24h || 0,
      }));
    },
    staleTime: 30_000,
  });

  const getCatChange = (item: any, cat: EnergyCategory) => {
    switch (cat) {
      case "youtube": return item.youtube_change_24h ?? 0;
      case "buzz": return item.buzz_change_24h ?? 0;
      case "album": return item.album_change_24h ?? 0;
      case "music": return item.music_change_24h ?? 0;
      case "social": return item.social_change_24h ?? 0;
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
      case "social": return Number(item.social_score ?? 0);
      case "fan": return Number(item.fan_score ?? 0);
      default: return Number(item.total_score ?? 0);
    }
  };

  const sortedRankings = useMemo(() => {
    if (!rankings?.length) return [];

    const base = category === "all"
      ? rankings.filter((item: any) => Number(item.youtube_score ?? 0) > 0)
      : rankings;

    const sorted = [...base]
      .map(item => ({
        ...item,
        changePercent: getCatChange(item, category),
        displayScore: getCatScore(item, category),
      }))
      .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
    const top5 = sorted.slice(0, 5);
    const bottom5 = sorted.slice(-5).reverse();
    const selectedIds = new Set([...top5, ...bottom5].map(r => r.wiki_entry_id));
    const middle = sorted
      .filter(r => !selectedIds.has(r.wiki_entry_id))
      .sort((a, b) => Math.abs(a.changePercent || 0) - Math.abs(b.changePercent || 0));
    return [...top5, ...middle, ...bottom5];
  }, [rankings, category]);

  // Pinned agent artists
  const agentWikiIds = useMemo(() => new Set((agentSlots || []).map((s: any) => s.wiki_entry_id).filter(Boolean)), [agentSlots]);
  const pinnedAgentItems = useMemo(() => {
    if (!agentWikiIds.size || !sortedRankings?.length) return [];
    return sortedRankings
      .filter(item => agentWikiIds.has(item.wiki_entry_id))
      .map(item => {
        const globalRank = sortedRankings.indexOf(item) + 1;
        return { ...item, globalRank };
      });
  }, [sortedRankings, agentWikiIds]);

  const maxScore = Math.max(...sortedRankings.map((item: any) => Number(item.displayScore ?? 0)), 1);

  return (
    <>
      <SEO title="K-Pop Trend Rankings – KTrenZ" titleKo="K-Pop 트렌드 순위 – KTrenZ" description="Full K-Pop artist trend rankings by energy score, YouTube, buzz, and music data." descriptionKo="에너지 점수 기반 K-Pop 아티스트 전체 트렌드 순위." path="/rankings" />
      {isMobile ? <V3Header /> : <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />}
      {!isMobile && <V3DesktopHero />}
      <main className={cn("max-w-3xl mx-auto px-4 pb-20", isMobile ? "pt-16" : "pt-4")}>
        <div className="flex items-center gap-3 py-4">
          <Link to="/" className="p-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-foreground">🏆 Trend Rankings</h1>
            <p className="text-xs text-muted-foreground">{t("rankings.subtitle")}</p>
          </div>
        </div>

        <div className="flex gap-1.5 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORY_CHIPS.map(chip => (
            <button key={chip.key} onClick={() => setCategory(chip.key)}
              className={cn("flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                category === chip.key ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted")}>
              {chip.icon}{chip.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Pinned My Agent section */}
             {pinnedAgentItems.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {pinnedAgentItems.map((item) => {
                  const entry = item.wiki_entries as any;
                  if (!entry) return null;
                  const displayScore = Number(item.displayScore ?? item.total_score ?? 0);
                  const scorePercent = maxScore > 0 ? (displayScore / maxScore) * 100 : 0;
                  return (
                    <Link key={`pinned-${item.wiki_entry_id}`} to={`/artist/${entry.slug}`}>
                      <div className="rounded-xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-all active:scale-[0.98] overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                          <Star className="w-3 h-3 text-primary fill-primary" />
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{t("ranking.myBias")}</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 pb-3">
                          <div className="w-7 flex justify-center shrink-0">
                            <span className="text-sm font-bold text-primary">#{item.globalRank}</span>
                          </div>
                          <Avatar className="w-12 h-12 ring-2 ring-primary/30 ring-offset-1 ring-offset-background">
                            <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} className="object-cover" />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{entry.title?.[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-base font-bold text-foreground truncate">{entry.title}</p>
                              {item.energy_score >= 300 && <span className="text-[10px] shrink-0">🔥</span>}
                              {item.energy_score >= 150 && item.energy_score < 300 && <span className="text-[10px] shrink-0">⚡</span>}
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-primary/10 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${scorePercent}%` }} />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold text-foreground">{Math.round(displayScore)}</p>
                            <ChangeIndicator change={item.changePercent ?? 0} />
                            {item.energy_score > 0 && (
                              <span className="text-[10px] text-primary flex items-center gap-0.5 justify-end mt-0.5">
                                <Zap className="w-2.5 h-2.5" />{Math.round(item.energy_score)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {sortedRankings?.map((item, idx) => {
              const entry = item.wiki_entries as any;
              if (!entry) return null;
              const rank = idx + 1;
              const scorePercent = maxScore > 0 ? (Number(item.displayScore ?? 0) / maxScore) * 100 : 0;

              return (
                <Link key={item.wiki_entry_id} to={`/artist/${entry.slug}`}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-[0.98] will-change-transform",
                    rank <= 3 ? "bg-card border border-border/50 hover:bg-card" : "bg-card/50 hover:bg-card/80"
                  )}>
                    <div className="w-7 flex justify-center shrink-0">
                      <RankIcon rank={rank} />
                    </div>
                    <Avatar className={cn("shrink-0", rank <= 3 ? "w-12 h-12" : "w-10 h-10")}>
                      <AvatarImage src={entry.image_url || (entry.metadata as any)?.profile_image} />
                      <AvatarFallback className="bg-muted text-sm font-medium">{entry.title?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={cn("font-semibold text-foreground truncate", rank <= 3 ? "text-base" : "text-sm")}>{entry.title}</p>
                        {item.energy_score >= 300 && <span className="text-[10px] shrink-0">🔥</span>}
                        {item.energy_score >= 150 && item.energy_score < 300 && <span className="text-[10px] shrink-0">⚡</span>}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary/30 transition-all" style={{ width: `${scorePercent}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("font-bold text-foreground", rank <= 3 ? "text-base" : "text-sm")}>{Math.round(Number(item.displayScore ?? 0))}</p>
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
            })}
          </div>
        )}
      </main>
    </>
  );
};

export default V3Rankings;