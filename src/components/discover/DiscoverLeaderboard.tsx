import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import SmartImage from "@/components/SmartImage";

interface TrendEntry {
  keyword: string;
  keyword_en: string | null;
  category: string;
  mention_count: number;
  star_ids: string[];
  stars: Array<{ id: string; display_name: string; image_url: string | null }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-400",
  product: "bg-emerald-500/10 text-emerald-400",
  program: "bg-purple-500/10 text-purple-400",
  place: "bg-amber-500/10 text-amber-400",
  collaboration: "bg-pink-500/10 text-pink-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  brand: "Brand",
  product: "Product",
  program: "Program",
  place: "Place",
  collaboration: "Collab",
};

const MEDALS = ["🥇", "🥈", "🥉"];

const DiscoverLeaderboard = () => {
  const { data: trends = [], isLoading } = useQuery({
    queryKey: ["discover-trend-leaderboard"],
    queryFn: async () => {
      // 최근 7일 키워드를 가져와서 mention_count 합산 랭킹
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("ktrenz_discover_keywords")
        .select("keyword, keyword_en, category, mention_count, star_ids, score_date")
        .gte("score_date", since)
        .order("mention_count", { ascending: false })
        .limit(50);

      if (error || !data?.length) return [];

      // 키워드별 합산 (여러 날에 걸쳐 등장 가능)
      const kwMap = new Map<string, TrendEntry>();
      for (const row of data) {
        const existing = kwMap.get(row.keyword);
        if (existing) {
          existing.mention_count += row.mention_count;
          for (const sid of (row.star_ids || [])) {
            if (!existing.star_ids.includes(sid)) existing.star_ids.push(sid);
          }
        } else {
          kwMap.set(row.keyword, {
            keyword: row.keyword,
            keyword_en: row.keyword_en,
            category: row.category,
            mention_count: row.mention_count,
            star_ids: [...(row.star_ids || [])],
            stars: [],
          });
        }
      }

      // 스타 정보 조회
      const allStarIds = [...new Set(Array.from(kwMap.values()).flatMap((k) => k.star_ids))];
      if (allStarIds.length > 0) {
        const { data: stars } = await supabase
          .from("ktrenz_stars")
          .select("id, display_name, image_url")
          .in("id", allStarIds);

        const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
        for (const entry of kwMap.values()) {
          entry.stars = entry.star_ids
            .map((sid) => starMap.get(sid))
            .filter(Boolean) as TrendEntry["stars"];
        }
      }

      return Array.from(kwMap.values())
        .sort((a, b) => b.mention_count - a.mention_count)
        .slice(0, 10);
    },
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="px-3 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">Trend Leaderboard</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">Last 7 days</span>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-6 h-6 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : trends.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No trend keywords yet. Data will appear after the next battle cycle.
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {trends.map((entry, idx) => {
              const rank = idx + 1;
              const isTop3 = rank <= 3;
              const catColor = CATEGORY_COLORS[entry.category] || "bg-muted/50 text-muted-foreground";
              const catLabel = CATEGORY_LABELS[entry.category] || entry.category;

              return (
                <div
                  key={entry.keyword}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2.5 transition-colors",
                    isTop3 && "bg-primary/[0.02]"
                  )}
                >
                  <div className="w-6 text-center shrink-0">
                    {isTop3 ? (
                      <span className="text-base">{MEDALS[rank - 1]}</span>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">{rank}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn(
                        "text-[13px] font-semibold truncate",
                        isTop3 ? "text-foreground" : "text-foreground/80"
                      )}>
                        {entry.keyword}
                      </p>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", catColor)}>
                        {catLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.keyword_en && (
                        <span className="text-[10px] text-muted-foreground">{entry.keyword_en}</span>
                      )}
                      {entry.stars.length > 0 && (
                        <div className="flex items-center -space-x-1.5 ml-1">
                          {entry.stars.slice(0, 3).map((star) => (
                            <div
                              key={star.id}
                              className="w-4 h-4 rounded-full overflow-hidden border border-background shrink-0"
                              title={star.display_name}
                            >
                              {star.image_url ? (
                                <SmartImage src={star.image_url} alt={star.display_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center text-[7px] font-bold text-muted-foreground">
                                  {star.display_name.charAt(0)}
                                </div>
                              )}
                            </div>
                          ))}
                          {entry.stars.length > 3 && (
                            <span className="text-[9px] text-muted-foreground ml-1.5">+{entry.stars.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-bold text-primary shrink-0">
                    <TrendingUp className="w-3 h-3" />
                    {entry.mention_count}
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
