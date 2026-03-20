import React from "react";
import { TrendingUp, TrendingDown, ExternalLink, Sparkles } from "lucide-react";
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
  detected_at?: string | null;
  search_volume?: number | null;
  interest_score?: number | null;
  delta_pct?: number | null;
}

interface V3TrendKeywordCardsProps {
  keywords: TrendKeywordEntry[];
  onKeywordClick?: (keyword: TrendKeywordEntry) => void;
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

function InfluenceGauge({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color =
    clamped >= 70 ? "bg-red-500" :
    clamped >= 40 ? "bg-amber-500" :
    "bg-emerald-500";

  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-bold text-foreground/70 w-7 text-right">
        {Math.round(clamped)}
      </span>
    </div>
  );
}

const V3TrendKeywordCards: React.FC<V3TrendKeywordCardsProps> = ({ keywords, onKeywordClick }) => {
  if (!keywords || keywords.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-2 w-full">
      {keywords.map((kw, idx) => {
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
            className="w-full text-left p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all group active:scale-[0.98]"
          >
            {/* Row 1: Keyword + Category badge */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-sm shrink-0">{emoji}</span>
                <span className="text-sm font-bold text-foreground truncate">
                  {displayKeyword}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0 capitalize", catClass)}
              >
                {kw.category}
              </Badge>
            </div>

            {/* Row 2: Artist/Member + Source */}
            {(kw.artist || kw.source_title) && (
              <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
                {kw.artist && (
                  <span className="font-medium text-foreground/70">by {kw.artist}</span>
                )}
                {kw.artist && kw.source_title && <span>·</span>}
                {kw.source_title && (
                  <span className="truncate flex items-center gap-0.5">
                    {kw.source_url ? (
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                    ) : null}
                    {kw.source_title}
                  </span>
                )}
              </div>
            )}

            {/* Row 3: Influence Index gauge + Search metrics */}
            <div className="flex items-center justify-between gap-3">
              {/* Influence Index */}
              <div className="flex-1">
                <div className="text-[10px] text-muted-foreground mb-0.5">Influence</div>
                <InfluenceGauge value={kw.influence_index ?? 0} />
              </div>

              {/* Search Volume / Interest */}
              <div className="flex items-center gap-2 shrink-0">
                {kw.interest_score != null && (
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground">Interest</div>
                    <div className="text-xs font-bold text-foreground">{kw.interest_score}</div>
                  </div>
                )}
                {hasDelta && (
                  <div className="text-center">
                    <div className="text-[10px] text-muted-foreground">24h</div>
                    <div className={cn(
                      "text-xs font-bold flex items-center gap-0.5",
                      delta > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {delta > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tap hint */}
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-primary/50 group-hover:text-primary/70 transition-colors">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Tap to ask more</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default V3TrendKeywordCards;
