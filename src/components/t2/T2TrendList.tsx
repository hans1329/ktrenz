import { useMemo } from "react";
import { TrendingUp, Clock, Star, ExternalLink, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TrendTile } from "./T2TrendTreemap";

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  brand:   { label: "Brand",   color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   color: "hsl(190, 70%, 45%)" },
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
}

const T2TrendList = ({ items, watchedSet, onTileClick, selectedTileId }: T2TrendListProps) => {
  const { language } = useLanguage();

  return (
    <div className="max-w-lg mx-auto space-y-4">
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
            <div className="px-3.5 pt-3 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-foreground leading-tight truncate">
                    {getLocalizedKeyword(item, language)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-muted shrink-0">
                      {item.artistImageUrl ? (
                        <img src={item.artistImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <TrendingUp className="w-2.5 h-2.5 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
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
                className="relative w-full aspect-[4/3] bg-muted overflow-hidden group"
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
                  {catConfig?.label || item.category}
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
                  {catConfig?.label || item.category}
                </span>
                {item.influenceIndex > 0 && (
                  <span className="text-sm font-black text-primary">
                    +{item.influenceIndex.toFixed(0)}%
                  </span>
                )}
              </button>
            )}

            {/* Caption / context */}
            <div className="px-3.5 py-2.5 space-y-1.5">
              {context && (
                <p className="text-sm text-foreground leading-snug line-clamp-3">
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
    </div>
  );
};

export default T2TrendList;
