import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Crown, Star, TrendingUp, Zap, Music } from "lucide-react";
import { cn } from "@/lib/utils";

const MILESTONE_CONFIG: Record<string, { icon: typeof Trophy; label: string; color: string; emoji: string }> = {
  top1_ranking: { icon: Crown, label: "🥇 #1 Ranking", color: "text-yellow-400", emoji: "👑" },
  top3_ranking: { icon: Trophy, label: "🏆 Top 3 Ranking", color: "text-amber-500", emoji: "🏆" },
  tier1_entry: { icon: Star, label: "⭐ Tier 1 Entry", color: "text-primary", emoji: "⭐" },
  highest_score: { icon: TrendingUp, label: "📈 Highest Score", color: "text-green-500", emoji: "📈" },
  highest_energy: { icon: Zap, label: "⚡ Peak Energy", color: "text-amber-400", emoji: "⚡" },
  highest_buzz: { icon: Music, label: "🔥 Highest Buzz", color: "text-red-500", emoji: "🔥" },
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
};

const V3ArtistMilestones = ({ wikiEntryId }: { wikiEntryId: string }) => {
  const { data: milestones, isLoading } = useQuery({
    queryKey: ["v3-milestones", wikiEntryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v3_artist_milestones" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .order("milestone_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!wikiEntryId,
    staleTime: 60_000,
  });

  if (isLoading || !milestones?.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mt-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest flex items-center gap-1">
          <Trophy className="w-3 h-3 text-amber-500" /> Records
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-1.5">
        {milestones.map((m: any) => {
          const config = MILESTONE_CONFIG[m.milestone_type] || {
            icon: Star, label: m.milestone_type, color: "text-muted-foreground", emoji: "📌",
          };
          const Icon = config.icon;
          const meta = m.metadata as any;

          return (
            <div
              key={m.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card/50 border border-border/30"
            >
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted/50")}>
                <Icon className={cn("w-4 h-4", config.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{config.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(m.milestone_date)}
                  {m.value != null && ` · ${m.milestone_type.includes("rank") ? `#${m.value}` : Math.round(m.value).toLocaleString()}`}
                  {meta?.rank && !m.milestone_type.includes("rank") && ` (Rank #${meta.rank})`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3ArtistMilestones;
