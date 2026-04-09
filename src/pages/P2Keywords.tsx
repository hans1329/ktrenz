import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import V3Header from "@/components/v3/V3Header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Flame, Sparkles, ShoppingBag, MapPin, Calendar, Tv, Music,
  MessageCircle, Tag, TrendingUp, Search, RefreshCw, Loader2,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";

const CATEGORY_CONFIG: Record<string, { icon: typeof Flame; label: string; color: string }> = {
  brand: { icon: ShoppingBag, label: "Brand", color: "bg-blue-500/10 text-blue-600" },
  product: { icon: Tag, label: "Product", color: "bg-emerald-500/10 text-emerald-600" },
  fashion: { icon: Sparkles, label: "Fashion", color: "bg-pink-500/10 text-pink-600" },
  beauty: { icon: Sparkles, label: "Beauty", color: "bg-purple-500/10 text-purple-600" },
  event: { icon: Calendar, label: "Event", color: "bg-amber-500/10 text-amber-600" },
  place: { icon: MapPin, label: "Place", color: "bg-teal-500/10 text-teal-600" },
  media: { icon: Tv, label: "Media", color: "bg-red-500/10 text-red-600" },
  music: { icon: Music, label: "Music", color: "bg-indigo-500/10 text-indigo-600" },
  food: { icon: Flame, label: "Food", color: "bg-orange-500/10 text-orange-600" },
  social: { icon: MessageCircle, label: "Social", color: "bg-cyan-500/10 text-cyan-600" },
};

const TABS = ["all", "brand", "product", "fashion", "beauty", "event", "media"] as const;
type Tab = typeof TABS[number];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const P2Keywords = () => {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const { data: keywords, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["p2-keywords"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ktrenz_p2_keywords")
        .select("*, matched_star:ktrenz_stars!ktrenz_p2_keywords_matched_star_id_fkey(display_name, image_url)")
        .eq("status", "active")
        .order("relevance_score", { ascending: false })
        .order("discovered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  const filtered = keywords?.filter((kw: any) =>
    activeTab === "all" ? true : kw.category === activeTab
  ) || [];

  const getDisplayKeyword = (kw: any) => {
    if (lang === "ko") return kw.keyword_ko || kw.keyword;
    if (lang === "en") return kw.keyword_en || kw.keyword;
    return kw.keyword;
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="P2 Trending Keywords" description="Discover trending K-pop keywords from external sources" />
      <V3Header />

      <main className="max-w-2xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Trending Keywords
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Discovered from external sources · Updated daily
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-full"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {tab === "all" ? "All" : CATEGORY_CONFIG[tab]?.label || tab}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        )}

        {/* Keywords List */}
        {!isLoading && (
          <div className="space-y-2 mt-2">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No keywords found</p>
              </div>
            )}

            {filtered.map((kw: any, idx: number) => {
              const cat = CATEGORY_CONFIG[kw.category] || CATEGORY_CONFIG.brand;
              const CatIcon = cat.icon;
              const context = kw.raw_context?.context || "";
              const star = kw.matched_star;

              return (
                <div
                  key={kw.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-border transition-colors"
                >
                  {/* Rank */}
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground truncate">
                        {getDisplayKeyword(kw)}
                      </h3>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", cat.color)}>
                        <CatIcon className="w-2.5 h-2.5 mr-0.5" />
                        {cat.label}
                      </Badge>
                    </div>

                    {context && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{context}</p>
                    )}

                    <div className="flex items-center gap-3 mt-1.5">
                      {/* Relevance */}
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(kw.relevance_score || 0) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{Math.round((kw.relevance_score || 0) * 100)}%</span>
                      </div>

                      {/* Star match */}
                      {star && (
                        <span className="text-[10px] text-primary flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5" />
                          {star.display_name}
                        </span>
                      )}

                      {/* Time */}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {timeAgo(kw.discovered_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        {!isLoading && keywords?.length > 0 && (
          <div className="mt-6 p-3 rounded-xl bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">
              {keywords.length} keywords discovered · {keywords.filter((k: any) => k.matched_star_id).length} matched to artists
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default P2Keywords;
