import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Youtube, Instagram, Music2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain } from "@/components/t2/T2TrendTreemap";

const SOURCE_SECTIONS = [
  { key: "youtube", label: "YouTube", sources: ["youtube", "youtube_search"], icon: Youtube, color: "#ef4444" },
  { key: "tiktok", label: "TikTok", sources: ["tiktok", "tiktok_snapshot"], icon: Music2, color: "hsl(var(--foreground))" },
  { key: "instagram", label: "Instagram", sources: ["instagram"], icon: Instagram, color: "#ec4899" },
] as const;

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const T2SourceKeywords = () => {
  const { language } = useLanguage();
  const [, setSearchParams] = useSearchParams();

  const { data: triggers } = useQuery({
    queryKey: ["t2-source-keywords"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_en, keyword_category, artist_name, trigger_source, detected_at, source_url, source_image_url, context")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(200);
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const openDetail = (triggerId: string) => {
    setSearchParams((prev) => {
      prev.set("modal", triggerId);
      return prev;
    });
  };

  return (
    <>
      {SOURCE_SECTIONS.map(({ key, label, sources, icon: Icon, color }) => {
        const items = (triggers ?? []).filter((t: any) => (sources as readonly string[]).includes(t.trigger_source));
        if (items.length === 0) return null;

        return (
          <section key={key} className="px-4 py-5">
            <h2 className="text-xl font-black text-foreground mb-3 flex items-center gap-2">
              <Icon className="w-5 h-5" style={{ color }} />
              {label}
              <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
            </h2>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
              {items.slice(0, 15).map((t: any) => {
                const displayKeyword = language === "ko" ? (t.keyword_ko || t.keyword) :
                                       language === "en" ? (t.keyword_en || t.keyword) : t.keyword;
                const config = CATEGORY_CONFIG[t.keyword_category as keyof typeof CATEGORY_CONFIG];
                const rawImg = t.source_image_url ? sanitizeImageUrl(t.source_image_url) : null;
                const safeImg = rawImg && !isBlockedImageDomain(rawImg) ? rawImg : null;

                return (
                  <div
                    key={t.id}
                    onClick={() => openDetail(t.id)}
                    className="flex-shrink-0 w-[200px] rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    {/* Image or gradient header */}
                    <div className="relative h-28 overflow-hidden">
                      {safeImg ? (
                        <img
                          src={safeImg}
                          alt={displayKeyword}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="w-full h-full"
                          style={{
                            background: `linear-gradient(135deg, ${config?.color || color}, hsl(var(--background)))`,
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                      {/* Age badge */}
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" />
                        {formatAge(t.detected_at)}
                      </div>

                      {/* Keyword on image */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <span className="text-sm font-bold text-white drop-shadow-md line-clamp-1">{displayKeyword}</span>
                      </div>
                    </div>

                    {/* Category bar */}
                    <div
                      className="flex items-center justify-between px-3 py-1.5"
                      style={{
                        backgroundColor: `${config?.color || color}22`,
                      }}
                    >
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: config?.color || color }}
                      >
                        {config?.label || t.keyword_category || key}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{t.artist_name}</span>
                    </div>

                    {/* Context */}
                    {t.context && (
                      <div className="px-3 py-2">
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{t.context}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
};

export default T2SourceKeywords;
