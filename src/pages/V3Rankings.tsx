import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronUp, ChevronDown, Flame, ArrowLeft, Crown, Medal, Zap, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import V3Header from "@/components/v3/V3Header";
import { useIsMobile } from "@/hooks/use-mobile";

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

const V3Rankings = () => {
  const { t } = useLanguage();
  const isMobile = useIsMobile();

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

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
        .select(`wiki_entry_id, youtube_score, total_score, energy_score, energy_change_24h, buzz_score, scored_at,
          wiki_entries:wiki_entry_id (id, title, slug, image_url, metadata, schema_type)`)
        .order("scored_at", { ascending: false });

      if (error) throw error;
      if (!allScores?.length) return [];

      const typedScores = (allScores as any[]).filter(s => tier1Ids.has(s.wiki_entry_id));
      const latestMap = new Map<string, any>();
      for (const s of typedScores) {
        if (!latestMap.has(s.wiki_entry_id)) latestMap.set(s.wiki_entry_id, s);
      }

      const ranked = Array.from(latestMap.values()).map((item) => ({
        ...item,
        changePercent: item.energy_change_24h || 0,
      }));

      // 에너지 맵과 동일한 변동성 기반 정렬: energy_change_24h 기준
      ranked.sort((a, b) => (b.energy_change_24h || 0) - (a.energy_change_24h || 0));
      const top5 = ranked.slice(0, 5);
      const bottom5 = ranked.slice(-5).reverse();
      const selectedIds = new Set([...top5, ...bottom5].map(r => r.wiki_entry_id));
      const middle = ranked
        .filter(r => !selectedIds.has(r.wiki_entry_id))
        .sort((a, b) => Math.abs(a.energy_change_24h || 0) - Math.abs(b.energy_change_24h || 0));
      return [...top5, ...middle, ...bottom5];
    },
    staleTime: 30_000,
  });

  const maxScore = rankings?.[0]?.total_score || 1;

  return (
    <>
      <SEO title="K-Pop Trend Rankings – KTrenZ" description="Full K-Pop artist trend rankings" path="/rankings" />
      {isMobile ? <V3Header /> : <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />}
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

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {rankings?.map((item, idx) => {
              const entry = item.wiki_entries as any;
              if (!entry) return null;
              const rank = idx + 1;
              const scorePercent = ((item.total_score || 0) / maxScore) * 100;

              return (
                <Link key={item.wiki_entry_id} to={`/artist/${entry.slug}`}>
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors active:scale-[0.98]",
                    rank <= 3 ? "bg-card border border-border/50" : "bg-card/50 hover:bg-card"
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
                      <p className={cn("font-bold text-foreground", rank <= 3 ? "text-base" : "text-sm")}>{Math.round(item.total_score || 0)}</p>
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
