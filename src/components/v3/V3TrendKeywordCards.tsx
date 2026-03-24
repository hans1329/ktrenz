import React, { useRef } from "react";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TrendKeywordEntry {
  keyword: string;
  keyword_ko?: string | null;
  category: string;
  artist?: string | null;
  context?: string | null;
  influence_index?: number | null;
  confidence?: number | null;
  source?: string | null;
  source_title?: string | null;
  source_url?: string | null;
  source_image_url?: string | null;
  detected_at?: string | null;
  search_volume?: number | null;
  interest_score?: number | null;
  delta_pct?: number | null;
}

interface V3TrendKeywordCardsProps {
  keywords: TrendKeywordEntry[];
  onKeywordClick?: (keyword: TrendKeywordEntry) => void;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
}

const categoryColors: Record<string, string> = {
  brand: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  product: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  media: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  event: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  entertainment: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  fashion: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  beauty: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  food: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const categoryEmoji: Record<string, string> = {
  brand: "🏷️",
  product: "📦",
  media: "🎬",
  event: "🎪",
  entertainment: "🎭",
  fashion: "👗",
  beauty: "💄",
  food: "🍽️",
};

const V3TrendKeywordCards: React.FC<V3TrendKeywordCardsProps> = ({ keywords, onKeywordClick, onLoadMore, loadMoreLabel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!keywords || keywords.length === 0) return null;

  const displayed = keywords.slice(0, 8);

  return (
    <div className="flex flex-col gap-2 mt-2 w-full">
      {/* Horizontal carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {displayed.map((kw, idx) => {
          const catClass = categoryColors[kw.category] || "bg-muted text-muted-foreground border-border";
          const emoji = categoryEmoji[kw.category] || "📊";
          const delta = kw.delta_pct ?? 0;
          const hasDelta = kw.delta_pct != null && kw.delta_pct !== 0;
          const displayKeyword = kw.keyword_ko || kw.keyword;

          return (
            <button
              key={`${kw.keyword}-${idx}`}
              type="button"
              onClick={() => onKeywordClick?.(kw)}
              className="flex-none w-[200px] snap-start rounded-2xl border border-border/40 bg-card/60 hover:bg-card/90 hover:border-primary/30 transition-all group active:scale-[0.97] overflow-hidden flex flex-col text-left"
            >
              {/* Image area */}
              <div className="w-full aspect-[4/3] bg-muted/40 rounded-t-2xl overflow-hidden relative">
                {kw.source_image_url ? (
                  <img
                    src={kw.source_image_url}
                    alt={displayKeyword}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">
                    {emoji}
                  </div>
                )}
                {/* Category badge overlay */}
                <Badge
                  variant="outline"
                  className={cn(
                    "absolute top-2 left-2 text-[9px] px-1.5 py-0 h-4 capitalize backdrop-blur-sm",
                    catClass
                  )}
                >
                  {kw.category}
                </Badge>
              </div>

              {/* Text area */}
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                {/* Keyword title */}
                <span className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                  {displayKeyword}
                </span>

                {/* Artist + metrics row */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                  {kw.artist && (
                    <span className="font-medium text-foreground/60 truncate max-w-[100px]">{kw.artist}</span>
                  )}
                  {kw.influence_index != null && (
                    <span className="shrink-0">🔥 {Math.round(kw.influence_index)}</span>
                  )}
                  {hasDelta && (
                    <span className={cn(
                      "flex items-center gap-0.5 font-bold shrink-0",
                      delta > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Context snippet */}
                {kw.context && (
                  <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-tight">
                    {kw.context}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Load more button */}
      {onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/30 transition-all text-sm font-medium text-primary active:scale-[0.98]"
        >
          <Search className="w-3.5 h-3.5" />
          {loadMoreLabel || "더 찾아보기"}
        </button>
      )}
    </div>
  );
};

export default V3TrendKeywordCards;
