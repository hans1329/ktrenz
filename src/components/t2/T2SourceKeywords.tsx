import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Youtube, Instagram, Music2, Clock } from "lucide-react";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain } from "@/components/t2/T2TrendTreemap";

const SOURCE_SECTIONS = [
  { key: "youtube", label: "YouTube", sources: ["youtube", "youtube_search"], icon: Youtube, color: "#ef4444" },
  { key: "tiktok", label: "TikTok", sources: ["tiktok", "tiktok_snapshot"], icon: Music2, color: "hsl(var(--foreground))" },
  { key: "instagram", label: "Instagram", sources: ["instagram"], icon: Instagram, color: "#ec4899" },
] as const;

const VISIBLE_STATUSES = ["active", "pending"] as const;
const SOURCE_CARD_LIMIT = 15;

type SourceSectionKey = (typeof SOURCE_SECTIONS)[number]["key"];
type SourceTrigger = {
  id: string;
  keyword: string;
  keyword_ko?: string | null;
  keyword_en?: string | null;
  keyword_category?: string | null;
  artist_name?: string | null;
  trigger_source: string;
  detected_at: string;
  source_url?: string | null;
  source_image_url?: string | null;
  context?: string | null;
};

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

  const { data: sectionTriggers } = useQuery<Record<SourceSectionKey, SourceTrigger[]>>({
    queryKey: ["t2-source-keywords"],
    queryFn: async () => {
      const results = await Promise.all(
        SOURCE_SECTIONS.map(async ({ key, sources }) => {
          const { data } = await supabase
            .from("ktrenz_trend_triggers" as any)
            .select("id, keyword, keyword_ko, keyword_en, keyword_category, artist_name, trigger_source, detected_at, source_url, source_image_url, context")
            .in("status", [...VISIBLE_STATUSES])
            .in("trigger_source", [...sources])
            .order("detected_at", { ascending: false })
            .limit(SOURCE_CARD_LIMIT);

          return [key, (data ?? []) as SourceTrigger[]] as const;
        }),
      );

      return Object.fromEntries(results) as Record<SourceSectionKey, SourceTrigger[]>;
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
      {SOURCE_SECTIONS.map(({ key, label, icon: Icon, color }) => {
        const items = sectionTriggers?.[key] ?? [];
        if (items.length === 0) return null;

        return (
          <section key={key} className="px-4 py-5">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-black text-foreground">
              <Icon className="h-5 w-5" style={{ color }} />
              {label}
              <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
            </h2>

            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {items.map((t) => {
                const displayKeyword = language === "ko"
                  ? (t.keyword_ko || t.keyword)
                  : language === "en"
                    ? (t.keyword_en || t.keyword)
                    : t.keyword;
                const config = CATEGORY_CONFIG[t.keyword_category as keyof typeof CATEGORY_CONFIG];
                const rawImg = t.source_image_url ? sanitizeImageUrl(t.source_image_url) : null;
                const safeImg = rawImg && !isBlockedImageDomain(rawImg) ? rawImg : null;

                return (
                  <div
                    key={t.id}
                    onClick={() => openDetail(t.id)}
                    className="flex-shrink-0 w-[200px] cursor-pointer overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-transform active:scale-[0.98]"
                  >
                    <div className="relative h-28 overflow-hidden">
                      {safeImg ? (
                        <img
                          src={safeImg}
                          alt={displayKeyword}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="h-full w-full"
                          style={{
                            background: `linear-gradient(135deg, ${config?.color || color}, hsl(var(--background)))`,
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                      <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                        <Clock className="h-2.5 w-2.5" />
                        {formatAge(t.detected_at)}
                      </div>

                      <div className="absolute bottom-2 left-2 right-2">
                        <span className="line-clamp-1 text-sm font-bold text-white drop-shadow-md">{displayKeyword}</span>
                      </div>
                    </div>

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

                    {t.context && (
                      <div className="px-3 py-2">
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{t.context}</p>
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
