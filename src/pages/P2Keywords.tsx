import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import V3Header from "@/components/v3/V3Header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, Search, RefreshCw, Loader2, Flame, ShoppingBag } from "lucide-react";
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

type Tab = "google" | "naver";

const P2Keywords = () => {
  const [activeTab, setActiveTab] = useState<Tab>("google");

  const { data: googleKw, isLoading: gLoading, refetch: gRefetch, isFetching: gFetching } = useQuery({
    queryKey: ["p2-google"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ktrenz_p2_keywords")
        .select("*")
        .eq("status", "active")
        .eq("discover_source", "google_trends_kr")
        .order("discovered_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: naverKw, isLoading: nLoading, refetch: nRefetch, isFetching: nFetching } = useQuery({
    queryKey: ["p2-naver"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ktrenz_p2_keywords")
        .select("*")
        .eq("status", "active")
        .eq("discover_source", "naver_shopping")
        .order("discovered_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const keywords = activeTab === "google" ? googleKw : naverKw;
  const isLoading = activeTab === "google" ? gLoading : nLoading;
  const isFetching = activeTab === "google" ? gFetching : nFetching;
  const refetch = activeTab === "google" ? gRefetch : nRefetch;

  // Group naver keywords by category
  const naverByCategory = new Map<string, any[]>();
  if (naverKw) {
    for (const kw of naverKw) {
      const cat = kw.category || "기타";
      if (!naverByCategory.has(cat)) naverByCategory.set(cat, []);
      naverByCategory.get(cat)!.push(kw);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Trending Now — Korea" description="Real-time trending keywords from Korea" />
      <V3Header />

      <main className="max-w-2xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="pt-6 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Trending Now
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time rising keywords · Korea
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} className="rounded-full">
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl mb-4">
          <button
            onClick={() => setActiveTab("google")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "google"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Google Trends
            {googleKw && <span className="text-[10px] opacity-60">({googleKw.length})</span>}
          </button>
          <button
            onClick={() => setActiveTab("naver")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "naver"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Naver Shopping
            {naverKw && <span className="text-[10px] opacity-60">({naverKw.length})</span>}
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        )}

        {/* Google Trends Tab */}
        {!isLoading && activeTab === "google" && (
          <div className="space-y-1.5">
            {(!keywords || keywords.length === 0) ? (
              <EmptyState />
            ) : (
              keywords.map((kw: any, idx: number) => (
                <GoogleTrendRow key={kw.id} kw={kw} idx={idx} />
              ))
            )}
          </div>
        )}

        {/* Naver Shopping Tab */}
        {!isLoading && activeTab === "naver" && (
          <div className="space-y-5">
            {naverByCategory.size === 0 ? (
              <EmptyState />
            ) : (
              Array.from(naverByCategory.entries()).map(([cat, kws]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                    <h3 className="text-xs font-bold text-foreground">{cat}</h3>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{kws.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {kws.map((kw: any, idx: number) => (
                      <div
                        key={kw.id}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                          idx < 3
                            ? "bg-primary/5 border-primary/20 text-foreground"
                            : "bg-card border-border/40 text-foreground/80 hover:border-border"
                        )}
                      >
                        <span className="text-[10px] text-muted-foreground mr-1">{idx + 1}</span>
                        {kw.keyword}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        {!isLoading && keywords && keywords.length > 0 && (
          <div className="mt-6 p-3 rounded-xl bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">
              {keywords.length} keywords · Updated {timeAgo(keywords[0]?.discovered_at || "")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

/* ── Google Trends Row ── */
const GoogleTrendRow = ({ kw, idx }: { kw: any; idx: number }) => {
  const volume = kw.raw_context?.search_volume;
  const articleTitles: string[] = kw.raw_context?.article_titles || [];
  const isTop3 = idx < 3;

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
      isTop3 ? "bg-primary/5 border border-primary/10" : "bg-card border border-border/40 hover:border-border"
    )}>
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
        isTop3 ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {isTop3 ? <Flame className="w-3.5 h-3.5" /> : <span className="text-[11px] font-bold text-muted-foreground">{idx + 1}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className={cn("text-sm truncate", isTop3 ? "font-bold text-foreground" : "font-medium text-foreground")}>
          {kw.keyword}
        </h3>
        {articleTitles.length > 0 && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{articleTitles[0]}</p>
        )}
      </div>
      {volume && (
        <div className="shrink-0 text-right">
          <span className={cn("text-xs font-semibold", isTop3 ? "text-primary" : "text-muted-foreground")}>
            {formatVolume(volume)}
          </span>
          <p className="text-[9px] text-muted-foreground">searches</p>
        </div>
      )}
    </div>
  );
};

/* ── Empty State ── */
const EmptyState = () => (
  <div className="text-center py-12 text-muted-foreground">
    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
    <p className="text-sm">No trending keywords found</p>
  </div>
);

export default P2Keywords;
