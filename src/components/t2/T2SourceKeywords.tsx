import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Youtube, Instagram, Music2, Clock, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo } from "@/components/t2/T2TrendTreemap";

const SOURCE_SECTIONS = [
  { key: "youtube", label: "YouTube", sources: ["youtube", "youtube_search"], icon: Youtube, color: "#ef4444" },
  { key: "tiktok", label: "TikTok", sources: ["tiktok", "tiktok_snapshot"], icon: Music2, color: "hsl(var(--foreground))" },
  { key: "instagram", label: "Instagram", sources: ["instagram"], icon: Instagram, color: "#ec4899" },
] as const;

const VISIBLE_STATUSES = ["active", "pending"] as const;
const SOURCE_CARD_LIMIT = 20;

type SourceSectionKey = (typeof SOURCE_SECTIONS)[number]["key"];

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const getLocalizedKeyword = (t: any, lang: string): string => {
  if (lang === "ko") return t.keyword_ko || t.keyword;
  if (lang === "en") return t.keyword_en || t.keyword;
  return t.keyword;
};

const T2SourceKeywords = () => {
  const { language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: sectionTriggers } = useQuery({
    queryKey: ["t2-source-keywords"],
    queryFn: async () => {
      const results = await Promise.all(
        SOURCE_SECTIONS.map(async ({ key, sources }) => {
          const { data } = await supabase
            .from("ktrenz_trend_triggers" as any)
            .select("id, keyword, keyword_ko, keyword_en, keyword_category, artist_name, trigger_source, detected_at, source_url, source_image_url, baseline_score")
            .in("status", [...VISIBLE_STATUSES])
            .in("trigger_source", [...sources])
            .order("detected_at", { ascending: false })
            .limit(SOURCE_CARD_LIMIT);

          return [key, ((data ?? []) as unknown as any[])] as const;
        }),
      );

      return Object.fromEntries(results) as Record<SourceSectionKey, any[]>;
    },
    refetchInterval: 60_000,
  });

  // Collect all trigger IDs for sparkline tracking data
  const allIds = useMemo(() => {
    if (!sectionTriggers) return [];
    return Object.values(sectionTriggers).flat().map((i: any) => i.id);
  }, [sectionTriggers]);

  const { data: trackingMap } = useQuery({
    queryKey: ["source-carousel-tracking", allIds.join(",")],
    enabled: allIds.length > 0,
    queryFn: async () => {
      const allData: any[] = [];
      for (let i = 0; i < allIds.length; i += 30) {
        const batch = allIds.slice(i, i + 30);
        const { data } = await supabase
          .from("ktrenz_trend_tracking" as any)
          .select("trigger_id, tracked_at, interest_score")
          .in("trigger_id", batch)
          .order("tracked_at", { ascending: true });
        if (data) allData.push(...(data as any[]));
      }
      const map = new Map<string, any[]>();
      allData.forEach((d: any) => {
        const arr = map.get(d.trigger_id) || [];
        arr.push(d);
        map.set(d.trigger_id, arr);
      });
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleTileClick = (triggerId: string) => {
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
          <div key={key} className="px-[10px]">
            {/* Section header — same as category sections */}
            <div className="flex items-center gap-1.5 mb-3 pl-4">
              <Icon className="h-4 w-4 shrink-0" style={{ color }} />
              <h3 className="text-base font-medium text-foreground">{label}</h3>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>

            {/* Horizontal carousel — identical layout to category carousels */}
            <div
              className="flex items-start gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            >
              <div className="shrink-0 w-4" aria-hidden />
              {items.map((item: any, idx: number) => {
                const displayKeyword = getLocalizedKeyword(item, language);
                const rawSourceImg = sanitizeImageUrl(
                  (item.source_image_url?.startsWith("https://") || item.source_image_url?.startsWith("http://"))
                    ? item.source_image_url
                    : null
                );
                const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;

                // For YouTube, derive thumbnail from video URL when source_image_url is missing
                let ytThumb: string | null = null;
                if (!safeSourceImg && item.source_url) {
                  const ytMatch = item.source_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
                  if (ytMatch) ytThumb = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
                }

                const platformLogo = detectPlatformLogo(item.source_url, item.source_image_url);
                const bgImg = safeSourceImg || ytThumb || platformLogo;
                const catConfig = CATEGORY_CONFIG[item.keyword_category as keyof typeof CATEGORY_CONFIG];
                const catColor = catConfig?.color || color;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleTileClick(item.id)}
                    className={cn(
                      "flex-none snap-start rounded-2xl border overflow-hidden flex flex-col text-left transition-colors",
                      idx === 0 ? "ml-4 md:ml-0 w-[280px] md:w-[320px]" : "w-[260px] md:w-[280px]",
                      "border-border/30 bg-card/60 hover:bg-card/90 hover:border-border/50"
                    )}
                  >
                    {/* Top: artist name + time */}
                    <div className={cn("flex items-center justify-between", idx === 0 ? "p-4 pb-2" : "p-3 pb-2")}>
                      <span className={cn("font-medium text-muted-foreground truncate", idx === 0 ? "text-sm" : "text-xs")}>
                        {item.artist_name || "Unknown"}
                      </span>
                      <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                        {formatAge(item.detected_at)}
                      </span>
                    </div>

                    {/* Image area with keyword centered + sparkline overlay */}
                    <div className={cn("relative w-full bg-muted/30 overflow-hidden min-h-0", idx === 0 ? "h-[300px]" : "h-[280px]")}>
                      {bgImg ? (
                        <>
                          <img
                            src={bgImg}
                            alt={displayKeyword}
                            className="h-full w-full object-cover object-center"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/25" />
                        </>
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center font-black text-white/20"
                          style={{
                            backgroundColor: catConfig?.tileColor || color,
                            fontSize: idx === 0 ? "56px" : "40px",
                          }}
                        >
                          {(item.artist_name || "?").charAt(0)}
                        </div>
                      )}

                      {/* Keyword centered on image */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
                        <div className="flex items-center gap-1.5 max-w-full">
                          <MessageCircle className="w-4 h-4 shrink-0 -scale-x-100 text-white drop-shadow-md" />
                          <h4
                            className={cn(
                              "font-black text-white leading-snug drop-shadow-lg whitespace-normal text-center",
                              displayKeyword.length > 20
                                ? "text-xs break-keep"
                                : displayKeyword.length > 14
                                  ? (idx === 0 ? "text-base" : "text-sm")
                                  : (idx === 0 ? "text-xl" : "text-lg")
                            )}
                          >
                            {displayKeyword}
                          </h4>
                        </div>
                      </div>

                      {/* Source icon badge */}
                      <span className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm p-1.5">
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </span>

                      {/* Sparkline overlay at bottom (same as category cards) */}
                      <div className="absolute inset-x-0 bottom-0">
                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />
                        <div className="relative pb-4 pt-4">
                          <svg viewBox="0 0 100 20" className="w-full h-[20px]" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id={`src-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={catColor} stopOpacity="0.7" />
                                <stop offset="100%" stopColor={catColor} stopOpacity="0.12" />
                              </linearGradient>
                            </defs>
                            {(() => {
                              const history = trackingMap?.get(item.id) ?? [];
                              const nowMs = Date.now();
                              let pts: { t: number; v: number }[] = [];
                              if (history.length >= 2) {
                                pts = history.map((h: any) => ({ t: new Date(h.tracked_at).getTime(), v: Number(h.interest_score ?? 0) }));
                              } else if (history.length === 1) {
                                pts = [
                                  { t: new Date(item.detected_at).getTime(), v: Number(item.baseline_score ?? 0) },
                                  { t: new Date(history[0].tracked_at).getTime(), v: Number(history[0].interest_score ?? 0) },
                                ];
                              } else {
                                const detMs = new Date(item.detected_at).getTime();
                                const bv = Number(item.baseline_score ?? 0);
                                pts = [{ t: detMs, v: bv }, { t: nowMs, v: bv }];
                              }
                              if (pts.length < 2) return null;
                              const lastPt = pts[pts.length - 1];
                              if (lastPt.t < nowMs) {
                                pts = [...pts, { t: nowMs, v: lastPt.v }];
                              } else if (lastPt.t > nowMs) {
                                pts[pts.length - 1] = { ...lastPt, t: nowMs };
                              }
                              const startMs = Math.min(pts[0].t, nowMs);
                              const spanMs = Math.max(nowMs - startMs, 3600000);
                              const vals = pts.map(p => p.v);
                              const minVal = Math.min(...vals);
                              const maxVal = Math.max(...vals, 1);
                              const range = maxVal - minVal;
                              const effectiveMin = range < maxVal * 0.05 ? maxVal * 0.8 : minVal;
                              const effectiveRange = maxVal - effectiveMin || 1;
                              const toX = (t: number, index: number) => {
                                if (index === pts.length - 1) return 100;
                                return Math.max(0, Math.min(((t - startMs) / spanMs) * 100, 100));
                              };
                              const toY = (v: number) => {
                                const normalized = Math.max(0, Math.min((v - effectiveMin) / effectiveRange, 1));
                                return 18 - normalized * 14;
                              };
                              const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t, i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");
                              return (
                                <>
                                  <path d={`${path} L100,20 L0,20 Z`} fill={`url(#src-spark-${item.id})`} />
                                  <path d={path} fill="none" stroke={catColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                                </>
                              );
                            })()}
                          </svg>
                          {(() => {
                            const history = trackingMap?.get(item.id) ?? [];
                            const startMs = history.length >= 1
                              ? new Date(history[0].tracked_at).getTime()
                              : new Date(item.detected_at).getTime();
                            const nowMs = Date.now();
                            const spanMs = Math.max(nowMs - startMs, 3600000);
                            const totalH = Math.round(spanMs / 3600000);
                            const fmtH = (h: number) => h >= 24 ? `${Math.round(h / 24)}d` : `${Math.round(h)}h`;
                            return (
                              <div className="absolute bottom-1.5 left-3 right-3 flex justify-between text-[7px] font-medium text-white/50 drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">
                                <span>{fmtH(0)}</span>
                                <span>{fmtH(Math.round(totalH * 0.25))}</span>
                                <span>{fmtH(Math.round(totalH * 0.5))}</span>
                                <span>{fmtH(Math.round(totalH * 0.75))}</span>
                                <span>now</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default T2SourceKeywords;
