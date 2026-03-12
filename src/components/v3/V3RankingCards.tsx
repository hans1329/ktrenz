import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface RankingEntry {
  rank: number;
  artist_name: string;
  image_url: string | null;
  total_score: number;
  energy_score: number;
  energy_change_24h: number;
  youtube_score: number;
  buzz_score: number;
}

interface V3RankingCardsProps {
  rankings: RankingEntry[];
}

const V3RankingCards = ({ rankings }: V3RankingCardsProps) => {
  if (!rankings || rankings.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 w-full">
      {rankings.map((entry) => {
        const changePercent = entry.energy_change_24h;
        const isUp = changePercent > 0;
        const isDown = changePercent < 0;

        return (
          <div
            key={entry.rank}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors",
              "bg-card/80 border-border/30 hover:border-primary/20",
              entry.rank <= 3 && "border-primary/20 bg-primary/5"
            )}
          >
            {/* Rank */}
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
              entry.rank === 1 && "bg-amber-500/20 text-amber-400",
              entry.rank === 2 && "bg-slate-300/20 text-slate-300",
              entry.rank === 3 && "bg-orange-400/20 text-orange-400",
              entry.rank > 3 && "bg-muted/50 text-muted-foreground"
            )}>
              {entry.rank}
            </div>

            {/* Avatar */}
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted shrink-0">
              {entry.image_url ? (
                <img src={entry.image_url} alt={entry.artist_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {entry.artist_name.charAt(0)}
                </div>
              )}
            </div>

            {/* Name + Score */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{entry.artist_name}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>FES {entry.total_score.toLocaleString()}</span>
                <span className="text-muted-foreground/30">·</span>
                <span>E {entry.energy_score}°E</span>
              </div>
            </div>

            {/* Change */}
            <div className={cn(
              "flex items-center gap-0.5 text-xs font-medium shrink-0 px-1.5 py-0.5 rounded-md",
              isUp && "text-emerald-400 bg-emerald-500/10",
              isDown && "text-red-400 bg-red-500/10",
              !isUp && !isDown && "text-muted-foreground bg-muted/50"
            )}>
              {isUp && <TrendingUp className="w-3 h-3" />}
              {isDown && <TrendingDown className="w-3 h-3" />}
              {!isUp && !isDown && <Minus className="w-3 h-3" />}
              <span>{isUp ? "+" : ""}{changePercent.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default V3RankingCards;
