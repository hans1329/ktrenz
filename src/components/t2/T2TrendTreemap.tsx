import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, Clock, Star, ChevronRight } from "lucide-react";
import T2DetailSheet from "./T2DetailSheet";
import T2AdminControls from "./T2AdminControls";

// ── Types ──
export interface TrendTile {
  id: string;
  keyword: string;
  keywordKo: string | null;
  keywordJa: string | null;
  keywordZh: string | null;
  category: string;
  artistName: string;
  artistNameKo: string | null;
  artistImageUrl: string | null;
  wikiEntryId: string;
  influenceIndex: number;
  context: string | null;
  contextKo: string | null;
  contextJa: string | null;
  contextZh: string | null;
  detectedAt: string;
  peakAt: string | null;
  expiredAt: string | null;
  lifetimeHours: number | null;
  peakDelayHours: number | null;
  baselineScore: number | null;
  peakScore: number | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceImageUrl: string | null;
  status: string;
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

type TrendCategory = "all" | "brand" | "product" | "place" | "food" | "fashion" | "beauty" | "media";

const CATEGORY_CONFIG: Record<string, { label: string; color: string; tileColor: string }> = {
  brand:   { label: "Brand",   color: "hsl(210, 70%, 55%)", tileColor: "hsla(210, 70%, 45%, 0.85)" },
  product: { label: "Product", color: "hsl(270, 60%, 55%)", tileColor: "hsla(270, 55%, 42%, 0.85)" },
  place:   { label: "Place",   color: "hsl(145, 55%, 45%)", tileColor: "hsla(145, 50%, 38%, 0.85)" },
  food:    { label: "Food",    color: "hsl(25, 80%, 55%)",  tileColor: "hsla(25, 75%, 45%, 0.85)" },
  fashion: { label: "Fashion", color: "hsl(330, 65%, 55%)", tileColor: "hsla(330, 60%, 45%, 0.85)" },
  beauty:  { label: "Beauty",  color: "hsl(350, 60%, 55%)", tileColor: "hsla(350, 55%, 45%, 0.85)" },
  media:   { label: "Media",   color: "hsl(190, 70%, 45%)", tileColor: "hsla(190, 65%, 38%, 0.85)" },
};

const ALL_CATEGORIES: TrendCategory[] = ["all", "brand", "product", "place", "food", "fashion", "beauty", "media"];

// ── Age formatter ──
function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ── Squarify layout ──
interface Rect { x: number; y: number; w: number; h: number; item: TrendTile; }

function squarify(items: TrendTile[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, item: items[0] }];

  const tileSize = (item: TrendTile, idx: number) => {
    const base = Math.max(item.influenceIndex, 1);
    const logBase = Math.log1p(base);
    if (idx === 0) return logBase * 8;
    if (idx === 1) return logBase * 5;
    if (idx === 2) return logBase * 3.5;
    if (idx < 10) return logBase * 2.2;
    if (idx < 20) return logBase * 1.6;
    return logBase;
  };

  const totalValue = items.reduce((s, item, idx) => s + tileSize(item, idx), 0);
  const totalArea = w * h;
  const areas = items.map((item, idx) => (tileSize(item, idx) / totalValue) * totalArea);
  const rects: Rect[] = [];
  let cx = x, cy = y, cw = w, ch = h, idx = 0;

  while (idx < items.length) {
    const isHorizontal = cw >= ch;
    const side = isHorizontal ? ch : cw;
    const row: number[] = [idx];
    let rowArea = areas[idx];
    let bestWorst = worstAspect(row.map(i => areas[i]), rowArea, side);

    for (let j = idx + 1; j < items.length; j++) {
      const testRow = [...row, j];
      const testArea = rowArea + areas[j];
      const testWorst = worstAspect(testRow.map(i => areas[i]), testArea, side);
      if (testWorst <= bestWorst) { row.push(j); rowArea = testArea; bestWorst = testWorst; } else break;
    }

    const rowLength = rowArea / side;
    let rx = cx, ry = cy;
    for (const ri of row) {
      const itemArea = areas[ri];
      const itemLength = itemArea / rowLength;
      if (isHorizontal) { rects.push({ x: rx, y: ry, w: rowLength, h: itemLength, item: items[ri] }); ry += itemLength; }
      else { rects.push({ x: rx, y: ry, w: itemLength, h: rowLength, item: items[ri] }); rx += itemLength; }
    }
    if (isHorizontal) { cx += rowLength; cw -= rowLength; } else { cy += rowLength; ch -= rowLength; }
    idx += row.length;
  }
  return rects;
}

function worstAspect(areas: number[], totalArea: number, side: number): number {
  const s2 = side * side; const t2 = totalArea * totalArea; let worst = 0;
  for (const a of areas) { const r1 = (s2 * a) / t2; const r2 = t2 / (s2 * a); worst = Math.max(worst, Math.max(r1, r2)); }
  return worst;
}

// ── Main Component ──
const T2TrendTreemap = () => {
  const [selectedCategory, setSelectedCategory] = useState<TrendCategory>("all");
  const [selectedTile, setSelectedTile] = useState<TrendTile | null>(null);
  const isMobile = useIsMobile();
  const { language } = useLanguage();
  const { user } = useAuth();

  // Fetch user's watched artists
  const { data: watchedWikiIds } = useQuery({
    queryKey: ["t2-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_agent_slots")
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null);
      return (data ?? []).map((d: any) => d.wiki_entry_id).filter(Boolean) as string[];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const watchedSet = useMemo(() => new Set(watchedWikiIds ?? []), [watchedWikiIds]);

  const { data: triggers, isLoading } = useQuery({
    queryKey: ["t2-trend-triggers"],
    queryFn: async () => {
      // Fetch triggers
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .order("influence_index", { ascending: false })
        .limit(50);

      const triggers = (data ?? []) as any[];

      // Fetch star names for wiki_entry_ids
      const wikiIds = [...new Set(triggers.map((t: any) => t.wiki_entry_id).filter(Boolean))];
      const starMap = new Map<string, { display_name: string; name_ko: string | null; image_url: string | null }>();
      if (wikiIds.length > 0) {
        const [{ data: stars }, { data: wikiEntries }] = await Promise.all([
          supabase.from("ktrenz_stars" as any).select("wiki_entry_id, display_name, name_ko").in("wiki_entry_id", wikiIds),
          supabase.from("wiki_entries").select("id, image_url").in("id", wikiIds),
        ]);
        const imageMap = new Map<string, string>();
        (wikiEntries ?? []).forEach((w: any) => { if (w.image_url) imageMap.set(w.id, w.image_url); });
        (stars ?? []).forEach((s: any) => {
          starMap.set(s.wiki_entry_id, { display_name: s.display_name, name_ko: s.name_ko, image_url: imageMap.get(s.wiki_entry_id) || null });
        });
      }

      return triggers.map((t: any): TrendTile => {
        const star = starMap.get(t.wiki_entry_id);
        return {
          id: t.id,
          keyword: t.keyword,
          keywordKo: t.keyword_ko || null,
          keywordJa: t.keyword_ja || null,
          keywordZh: t.keyword_zh || null,
          category: t.keyword_category || "brand",
          artistName: star?.display_name || t.artist_name || "Unknown",
          artistNameKo: star?.name_ko || null,
          artistImageUrl: star?.image_url || null,
          wikiEntryId: t.wiki_entry_id,
          influenceIndex: Number(t.influence_index) || 0,
          context: t.context,
          contextKo: t.context_ko || null,
          contextJa: t.context_ja || null,
          contextZh: t.context_zh || null,
          detectedAt: t.detected_at,
          peakAt: t.peak_at || null,
          expiredAt: t.expired_at || null,
          lifetimeHours: t.lifetime_hours != null ? Number(t.lifetime_hours) : null,
          peakDelayHours: t.peak_delay_hours != null ? Number(t.peak_delay_hours) : null,
          baselineScore: t.baseline_score != null ? Number(t.baseline_score) : null,
          peakScore: t.peak_score != null ? Number(t.peak_score) : null,
          sourceUrl: t.source_url || null,
          sourceTitle: t.source_title || null,
          sourceImageUrl: t.source_image_url || null,
          status: t.status,
        };
      });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // My artists' keywords
  const myKeywords = useMemo(() => {
    if (!triggers?.length || !watchedSet.size) return [];
    return triggers.filter(t => watchedSet.has(t.wikiEntryId));
  }, [triggers, watchedSet]);

  const filteredItems = useMemo(() => {
    if (!triggers?.length) return [];
    const items = selectedCategory === "all"
      ? triggers
      : triggers.filter(t => t.category === selectedCategory);
    return items.sort((a, b) => b.influenceIndex - a.influenceIndex);
  }, [triggers, selectedCategory]);

  const containerWidth = isMobile ? 360 : 780;
  const containerHeight = isMobile ? 980 : 720;

  const rects = useMemo(() => {
    if (!filteredItems.length) return [];
    return squarify(filteredItems, 0, 0, containerWidth, containerHeight);
  }, [filteredItems, containerWidth, containerHeight]);

  const handleTileClick = useCallback((item: TrendTile) => {
    setSelectedTile(prev => prev?.id === item.id ? null : item);
  }, []);

  const categoryStats = useMemo(() => {
    if (!triggers?.length) return {};
    const stats: Record<string, number> = {};
    for (const t of triggers) {
      stats[t.category] = (stats[t.category] || 0) + 1;
    }
    return stats;
  }, [triggers]);

  if (isLoading) {
    return (
      <div className="px-4 pb-4">
        <div className="pt-4 pb-3">
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2 mb-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-16 rounded-full" />)}
        </div>
        <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }} />
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Trend Map
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            K-Pop driven consumer trends · Influence Index
          </p>
        </div>
        <T2AdminControls />
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
        {ALL_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          const config = cat === "all" ? null : CATEGORY_CONFIG[cat];
          const count = cat === "all" ? triggers?.length || 0 : categoryStats[cat] || 0;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              {cat === "all" ? "All" : config?.label}
              <span className={cn("text-[10px]", isActive ? "text-primary-foreground/70" : "text-muted-foreground/60")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* My Artists' Keywords */}
      {myKeywords.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            My Artists' Keywords
            <span className="text-[10px] text-muted-foreground font-normal ml-1">{myKeywords.length}</span>
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {myKeywords.map((kw) => {
              const catConfig = CATEGORY_CONFIG[kw.category];
              return (
                <button
                  key={kw.id}
                  onClick={() => handleTileClick(kw)}
                  className={cn(
                    "shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                    selectedTile?.id === kw.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:bg-muted/50"
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: catConfig?.color || "hsl(var(--muted-foreground))" }}
                  />
                  <div className="text-left">
                    <p className="text-xs font-bold text-foreground leading-tight">
                      {getLocalizedKeyword(kw, language)}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {getLocalizedArtistName(kw, language)}
                      {kw.influenceIndex > 0 && (
                        <span className="ml-1 font-bold text-primary">+{kw.influenceIndex.toFixed(0)}%</span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Treemap */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 flex items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">No active trend keywords detected yet.</p>
        </div>
      ) : (
        <div
          className="relative w-full rounded-2xl overflow-hidden border border-border"
          style={{ aspectRatio: `${containerWidth} / ${containerHeight}` }}
        >
          <div className="absolute inset-0">
            {rects.map((rect, rectIndex) => {
              const left = (rect.x / containerWidth) * 100;
              const top = (rect.y / containerHeight) * 100;
              const width = (rect.w / containerWidth) * 100;
              const height = (rect.h / containerHeight) * 100;
               const isTop20 = rectIndex < 20;
               const isLarge = width > 18 && height > 15;
               const isMedium = isTop20 || (width > 10 && height > 8);
              const isSelected = selectedTile?.id === rect.item.id;
              const config = CATEGORY_CONFIG[rect.item.category];
              const tileColor = config?.tileColor || "hsla(220, 20%, 40%, 0.85)";
              const isMyArtist = watchedSet.has(rect.item.wikiEntryId);

              const boxArea = width * height;
              const sizeFactor = Math.sqrt(boxArea) / 10;
              const isTopThree = rectIndex < 3;
              const keywordSize = isTopThree
                ? Math.max(18, Math.min(40, sizeFactor * 5))
                : isTop20
                  ? Math.max(14, Math.min(32, sizeFactor * 4.5))
                  : Math.max(9, Math.min(16, sizeFactor * 2.2));
              const scoreSize = Math.max(10, Math.min(30, sizeFactor * 3.2));
              

              return (
                <button
                  key={rect.item.id}
                  onClick={() => handleTileClick(rect.item)}
                  className={cn(
                    "absolute border flex flex-col items-center justify-center p-1.5 outline-none focus:outline-none transition-all",
                    isTopThree ? "overflow-visible" : "overflow-hidden",
                    isSelected
                      ? "border-primary ring-2 ring-primary/40 z-20 brightness-110"
                      : "border-background/20 hover:brightness-125 hover:z-10"
                  )}
                  style={{
                    left: `${left}%`, top: `${top}%`,
                    width: `${width}%`, height: `${height}%`,
                    background: (rect.item.sourceImageUrl || rect.item.artistImageUrl)
                      ? `linear-gradient(to bottom, ${tileColor.replace('0.85', '0.55')}, ${tileColor}), url(${rect.item.sourceImageUrl || rect.item.artistImageUrl}) center/cover no-repeat`
                      : tileColor,
                  }}
                >
                  {/* Top-right: influence badge */}
                  {isMedium && rect.item.influenceIndex > 0 && (
                    <span className="absolute top-1 right-1 z-20 text-[9px] font-bold text-white/80 drop-shadow-md">
                      +{rect.item.influenceIndex.toFixed(0)}%
                    </span>
                  )}

                  {/* Top-left: age + star */}
                  {isMedium && (
                    <span className="absolute top-1 left-1.5 z-20 flex items-center gap-0.5 text-[9px] text-white/60">
                      {isMyArtist && <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />}
                      <Clock className="w-2.5 h-2.5" />
                      {formatAge(rect.item.detectedAt)}
                    </span>
                  )}

                  {/* Center content */}
                  <div className="relative z-10 flex flex-col items-center w-full px-1" style={{ gap: `${Math.max(0, sizeFactor * 0.3)}px` }}>
                    <span
                      className="font-black text-white truncate w-full text-center leading-tight drop-shadow-lg"
                      style={{ fontSize: `${keywordSize}px`, textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
                    >
                      {getLocalizedKeyword(rect.item, language)}
                    </span>

                    {isMedium && (
                      <span
                        className="font-bold text-white truncate w-full text-center drop-shadow-md"
                        style={{ fontSize: `${Math.max(9, keywordSize * 0.55)}px`, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
                      >
                        {getLocalizedArtistName(rect.item, language)}
                      </span>
                    )}

                    {rect.item.influenceIndex > 0 && (
                      <span
                        className="font-black text-white drop-shadow-lg"
                        style={{ fontSize: `${scoreSize}px`, textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
                      >
                        {rect.item.influenceIndex.toFixed(0)}
                      </span>
                    )}
                  </div>

                  {/* Bottom-right: category badge */}
                  {isMedium && (
                    <span className="absolute bottom-1 right-1 z-20 text-[9px] font-bold text-white/70 bg-black/25 rounded px-1 py-0.5">
                      {isLarge ? (config?.label || rect.item.category) : (config?.label || rect.item.category).charAt(0).toUpperCase()}
                    </span>
                  )}

                  {/* Inner glow for top items */}
                  {isTopThree && (
                    <div className="absolute inset-0 z-[1] pointer-events-none" style={{
                      boxShadow: rectIndex === 0
                        ? 'inset 0 0 25px 8px hsla(0, 0%, 100%, 0.5), inset 0 0 50px 16px hsla(0, 0%, 100%, 0.25)'
                        : 'inset 0 0 15px 4px hsla(0, 0%, 100%, 0.3)',
                      background: rectIndex === 0
                        ? 'radial-gradient(ellipse at center, hsla(0, 0%, 100%, 0.1) 0%, transparent 60%)'
                        : undefined,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: config.color }} />
            <span className="text-[10px] text-muted-foreground">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Detail Sheet */}
      <T2DetailSheet
        tile={selectedTile}
        rank={selectedTile ? filteredItems.findIndex(t => t.id === selectedTile.id) + 1 : undefined}
        totalCount={filteredItems.length}
        onClose={() => setSelectedTile(null)}
      />
    </div>
  );
};

export default T2TrendTreemap;
