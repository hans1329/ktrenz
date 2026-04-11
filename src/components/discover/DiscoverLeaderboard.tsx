import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import SmartImage from "@/components/SmartImage";

interface LeaderEntry {
  star_id: string;
  display_name: string;
  image_url: string | null;
  pre_score: number;
  news_count: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

const DiscoverLeaderboard = () => {
  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ["discover-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_b2_prescores")
        .select("star_id, pre_score, news_count, batch_id")
        .order("pre_score", { ascending: false })
        .limit(10);
      if (error || !data?.length) return [];

      const starIds = [...new Set(data.map((d: any) => d.star_id))];
      const { data: stars } = await supabase
        .from("ktrenz_stars")
        .select("id, display_name, image_url")
        .in("id", starIds);

      const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
      return data.map((d: any) => {
        const star = starMap.get(d.star_id);
        return {
          star_id: d.star_id,
          display_name: star?.display_name || "Unknown",
          image_url: star?.image_url || null,
          pre_score: d.pre_score,
          news_count: d.news_count,
        };
      }) as LeaderEntry[];
    },
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="px-3 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Trophy className="w-4 h-4 text-amber-400" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">Battle Leaderboard</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">Based on media exposure</span>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-6 h-6 rounded" />
                <Skeleton className="w-9 h-9 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {leaders.map((entry, idx) => {
              const rank = idx + 1;
              const isTop3 = rank <= 3;
              return (
                <div
                  key={entry.star_id}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2.5 transition-colors",
                    isTop3 && "bg-amber-500/[0.03]"
                  )}
                >
                  <div className="w-6 text-center shrink-0">
                    {isTop3 ? (
                      <span className="text-base">{MEDALS[rank - 1]}</span>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">{rank}</span>
                    )}
                  </div>

                  <div className={cn(
                    "w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold",
                    isTop3
                      ? "ring-1 ring-amber-400/30 bg-gradient-to-br from-amber-500/20 to-primary/10 text-amber-400"
                      : "bg-muted/50 text-muted-foreground"
                  )}>
                    {entry.image_url ? (
                      <SmartImage src={entry.image_url} alt={entry.display_name} className="w-full h-full object-cover" />
                    ) : (
                      entry.display_name.charAt(0)
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-[13px] font-semibold truncate",
                      isTop3 ? "text-foreground" : "text-foreground/80"
                    )}>
                      {entry.display_name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>📰 {entry.news_count.toLocaleString()} articles</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0">
                    <TrendingUp className="w-3 h-3" />
                    {entry.pre_score.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default DiscoverLeaderboard;
