import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("ktrenz_discover_keywords")
        .select("keyword, keyword_en, category, mention_count, star_ids, score_date")
        .gte("score_date", since)
        .order("mention_count", { ascending: false })
        .limit(50);

      if (error || !data?.length) return [];

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
        <h2 className="text-base font-semibold text-foreground tracking-tight">Trend Leaderboard</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">7d</span>
      </div>

      <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-5 h-5 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ) : trends.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[13px]">
            No trend keywords yet
          </div>
        ) : (
          <div className="divide-y divide-border/15">
            {trends.map((entry, idx) => {
              const rank = idx + 1;
              const isTop3 = rank <= 3;

              return (
                <div
                  key={entry.keyword}
                  className="flex items-center gap-2.5 px-3.5 py-2.5"
                >
                  <div className="w-5 text-center shrink-0">
                    {isTop3 ? (
                      <span className="text-sm">{MEDALS[rank - 1]}</span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">{rank}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn(
                        "text-[13px] font-medium truncate",
                        isTop3 ? "text-foreground" : "text-foreground/70"
                      )}>
                        {entry.keyword}
                      </p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium shrink-0">
                        {CATEGORY_LABELS[entry.category] || entry.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {entry.keyword_en && (
                        <span className="text-[10px] text-muted-foreground/60">{entry.keyword_en}</span>
                      )}
                      {entry.stars.length > 0 && (
                        <div className="flex items-center -space-x-1 ml-0.5">
                          {entry.stars.slice(0, 3).map((star) => (
                            <div
                              key={star.id}
                              className="w-3.5 h-3.5 rounded-full overflow-hidden border border-card shrink-0"
                              title={star.display_name}
                            >
                              {star.image_url ? (
                                <SmartImage src={star.image_url} alt={star.display_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center text-[6px] text-muted-foreground">
                                  {star.display_name.charAt(0)}
                                </div>
                              )}
                            </div>
                          ))}
                          {entry.stars.length > 3 && (
                            <span className="text-[8px] text-muted-foreground/50 ml-1">+{entry.stars.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
                    {entry.mention_count}
                  </span>
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
