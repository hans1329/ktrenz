import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import V3Header from "@/components/v3/V3Header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, Search, RefreshCw, Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";

function formatVolume(vol: string | number) {
  const n = typeof vol === "string" ? parseInt(vol, 10) : vol;
  if (!n || isNaN(n)) return "";
  if (n >= 100000) return `${(n / 1000).toFixed(0)}K+`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const P2Keywords = () => {
  const { language: lang } = useLanguage();

  const { data: keywords, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["p2-keywords"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ktrenz_p2_keywords")
        .select("*")
        .eq("status", "active")
        .order("discovered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Trending Now — Korea" description="Real-time trending keywords from Korea" />
      <V3Header />

      <main className="max-w-2xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Trending Now
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Google Trends Korea · Real-time rising searches
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} className="rounded-full">
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        )}

        {/* Keywords List */}
        {!isLoading && (
          <div className="space-y-1.5">
            {(!keywords || keywords.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No trending keywords found</p>
              </div>
            )}

            {keywords?.map((kw: any, idx: number) => {
              const volume = kw.raw_context?.search_volume;
              const articleTitles: string[] = kw.raw_context?.article_titles || [];
              const isTop3 = idx < 3;

              return (
                <div
                  key={kw.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                    isTop3
                      ? "bg-primary/5 border border-primary/10"
                      : "bg-card border border-border/40 hover:border-border"
                  )}
                >
                  {/* Rank */}
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    isTop3 ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    {isTop3 ? (
                      <Flame className="w-3.5 h-3.5" />
                    ) : (
                      <span className="text-[11px] font-bold text-muted-foreground">{idx + 1}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className={cn(
                      "text-sm truncate",
                      isTop3 ? "font-bold text-foreground" : "font-medium text-foreground"
                    )}>
                      {kw.keyword}
                    </h3>
                    {articleTitles.length > 0 && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {articleTitles[0]}
                      </p>
                    )}
                  </div>

                  {/* Volume */}
                  {volume && (
                    <div className="shrink-0 text-right">
                      <span className={cn(
                        "text-xs font-semibold",
                        isTop3 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {formatVolume(volume)}
                      </span>
                      <p className="text-[9px] text-muted-foreground">searches</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!isLoading && keywords && keywords.length > 0 && (
          <div className="mt-6 p-3 rounded-xl bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">
              {keywords.length} trending keywords · Updated {timeAgo(keywords[0]?.discovered_at || "")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default P2Keywords;
