import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Youtube, Instagram, Music2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const CATEGORY_COLORS: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  product: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  place: "bg-green-500/10 text-green-600 border-green-500/30",
  food: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  fashion: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  beauty: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  media: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  music: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  event: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
};

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const SOURCE_SECTIONS = [
  { key: "youtube", label: "YouTube", sources: ["youtube", "youtube_search"], icon: Youtube, color: "text-red-500" },
  { key: "tiktok", label: "TikTok", sources: ["tiktok", "tiktok_snapshot"], icon: Music2, color: "text-foreground" },
  { key: "instagram", label: "Instagram", sources: ["instagram"], icon: Instagram, color: "text-pink-500" },
] as const;

const T2SourceKeywords = () => {
  const { language } = useLanguage();

  const { data: triggers, isLoading } = useQuery({
    queryKey: ["t2-source-keywords"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_en, keyword_category, artist_name, trigger_source, detected_at, source_url, context")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(200);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="px-4 space-y-6 mt-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 space-y-6 mt-6">
      {SOURCE_SECTIONS.map(({ key, label, sources, icon: Icon, color }) => {
        const items = (triggers ?? []).filter((t: any) => (sources as readonly string[]).includes(t.trigger_source));
        if (items.length === 0) return null;

        return (
          <div key={key}>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2.5">
              <Icon className={cn("w-4 h-4", color)} />
              {label}
              <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
            </h3>
            <div className="space-y-1.5">
              {items.slice(0, 10).map((t: any) => {
                const displayKeyword = language === "ko" ? (t.keyword_ko || t.keyword) :
                                       language === "en" ? (t.keyword_en || t.keyword) : t.keyword;
                return (
                  <Card key={t.id} className="p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-foreground">{displayKeyword}</span>
                          {t.keyword_category && (
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] py-0", CATEGORY_COLORS[t.keyword_category] || "bg-muted")}
                            >
                              {t.keyword_category}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{t.artist_name}</span>
                        </div>
                        {t.context && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{t.context}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatAge(t.detected_at)}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default T2SourceKeywords;
