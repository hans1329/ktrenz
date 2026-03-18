import { useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Clock, Star, ExternalLink, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TrendTile } from "./T2TrendTreemap";

const CATEGORY_CONFIG: Record<string, { label: string; labelKo: string; labelJa: string; labelZh: string; color: string }> = {
  brand:   { label: "Brand",   labelKo: "브랜드",  labelJa: "ブランド",  labelZh: "品牌",   color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", labelKo: "제품",    labelJa: "製品",      labelZh: "产品",   color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   labelKo: "장소",    labelJa: "場所",      labelZh: "地点",   color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    labelKo: "음식",    labelJa: "フード",    labelZh: "美食",   color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", labelKo: "패션",    labelJa: "ファッション", labelZh: "时尚", color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  labelKo: "뷰티",    labelJa: "ビューティー", labelZh: "美妆", color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   labelKo: "미디어",  labelJa: "メディア",  labelZh: "媒体",   color: "hsl(190, 70%, 45%)" },
};

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

function getLocalizedContext(tile: TrendTile, lang: string): string | null {
  switch (lang) {
    case "ko": return tile.contextKo || tile.context;
    case "ja": return tile.contextJa || tile.context;
    case "zh": return tile.contextZh || tile.context;
    default: return tile.context;
  }
}

function getCategoryLabel(cat: string, lang: string): string {
  const c = CATEGORY_CONFIG[cat];
  if (!c) return cat;
  switch (lang) {
    case "ko": return c.labelKo;
    case "ja": return c.labelJa;
    case "zh": return c.labelZh;
    default: return c.label;
  }
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface T2TrendListProps {
  items: TrendTile[];
  watchedSet: Set<string>;
  onTileClick: (tile: TrendTile) => void;
  selectedTileId: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const T2TrendList = ({ items, watchedSet, onTileClick, selectedTileId, hasMore, onLoadMore }: T2TrendListProps) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto space-y-5 lg:space-y-6">
      {items.map((item, idx) => {
        const catConfig = CATEGORY_CONFIG[item.category];
        const isMyArtist = watchedSet.has(item.wikiEntryId);
        const isSelected = selectedTileId === item.id;
        const rank = idx + 1;
        const heroImage = item.sourceImageUrl || item.artistImageUrl;
        const context = getLocalizedContext(item, language);

        return (
          <article
            key={item.id}
            className={cn(
              "rounded-2xl border overflow-hidden bg-card transition-all",
              isSelected ? "border-primary ring-1 ring-primary/20" : "border-border"
            )}
          >
            {/* Header — keyword + artist row */}
            <div className="px-3.5 pt-4 pb-3 lg:px-5 lg:pt-5 lg:pb-4">
              <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mt-1">
                    <MessageCircle className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="text-lg lg:text-xl font-black text-foreground leading-tight truncate">
                      {getLocalizedKeyword(item, language)}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mt-2 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground truncate">
                      {getLocalizedArtistName(item, language)}
                    </span>
                    {isMyArtist && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatAge(item.detectedAt)}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                  <span className={cn(
                    "text-xs font-black px-2 py-0.5 rounded-full",
                    rank <= 3
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}>
                    #{rank}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero image */}
            {heroImage && (
              <button
                onClick={() => onTileClick(item)}
                className="relative w-full aspect-[4/3] lg:aspect-[3/4] bg-muted overflow-hidden group"
              >
                <img
                  src={heroImage}
                  alt={getLocalizedKeyword(item, language)}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Category badge — bottom left */}
                <span
                  className="absolute bottom-2.5 left-2.5 z-10 text-[10px] font-bold px-2 py-0.5 rounded-sm text-white backdrop-blur-sm"
                  style={{ background: catConfig?.color ? `${catConfig.color.replace(')', ', 0.85)').replace('hsl(', 'hsla(')}` : "hsla(var(--muted-foreground), 0.85)" }}
                >
                  {getCategoryLabel(item.category, language)}
                </span>
                {/* Influence badge — top right */}
                {item.influenceIndex > 0 && (
                  <span className="absolute top-2.5 right-2.5 z-10 text-sm font-black text-white bg-primary/80 backdrop-blur-sm px-2.5 py-1 rounded-full drop-shadow-lg">
                    +{item.influenceIndex.toFixed(0)}%
                  </span>
                )}
              </button>
            )}

            {/* No image fallback */}
            {!heroImage && (
              <button
                onClick={() => onTileClick(item)}
                className="w-full px-3.5 py-4 bg-muted/30 text-left group flex items-center justify-between"
              >
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-sm text-white"
                  style={{ background: catConfig?.color || "hsl(var(--muted-foreground))" }}
                >
                  {getCategoryLabel(item.category, language)}
                </span>
                {item.influenceIndex > 0 && (
                  <span className="text-sm font-black text-primary">
                    +{item.influenceIndex.toFixed(0)}%
                  </span>
                )}
              </button>
            )}

            {/* Caption / context */}
            <div className="px-3.5 py-2.5 lg:px-5 lg:py-3.5 space-y-1.5 lg:space-y-2">
              {context && (
                <p className="text-sm lg:text-base text-foreground leading-snug line-clamp-3">
                  <span className="font-bold">{getLocalizedArtistName(item, language)}</span>{" "}
                  {context}
                </p>
              )}
              {item.sourceTitle && item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">{item.sourceTitle}</span>
                </a>
              )}
            </div>
          </article>
        );
      })}
      {hasMore && <div ref={sentinelRef} className="h-10" />}
    </div>
  );
};

export default T2TrendList;
