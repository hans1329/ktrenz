import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";

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

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

const V3RankingCards = ({ rankings }: V3RankingCardsProps) => {
  if (!rankings || rankings.length === 0) return null;

  return (
    <div className="mt-2 w-full rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30 bg-gradient-to-r from-amber-500/5 to-transparent">
        <Trophy className="w-4 h-4 text-amber-400" />
        <span className="text-[13px] font-bold text-foreground">Real-time Trend Rankings</span>
        <span className="text-[10px] text-muted-foreground ml-auto">Top {rankings.length}</span>
      </div>

      {/* List */}
      <div className="divide-y divide-border/20">
        {rankings.map((entry) => {
          const change = entry.energy_change_24h;
          const isUp = change > 0;
          const isDown = change < 0;
          const isTop3 = entry.rank <= 3;

          return (
            <div
              key={entry.rank}
              className={cn(
                "flex items-center gap-2.5 px-3.5 py-2 transition-colors",
                isTop3 && "bg-amber-500/[0.03]"
              )}
            >
              {/* Rank */}
              <div className="w-6 text-center shrink-0">
                {isTop3 ? (
                  <span className="text-base">{RANK_MEDALS[entry.rank - 1]}</span>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground">{entry.rank}</span>
                )}
              </div>

              {/* Avatar */}
              <div className={cn(
                "w-8 h-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold",
                isTop3
                  ? "bg-gradient-to-br from-amber-500/20 to-primary/10 text-amber-400"
                  : "bg-muted/50 text-muted-foreground"
              )}>
                {entry.image_url ? (
                  <img src={entry.image_url} alt={entry.artist_name} className="w-full h-full object-cover" />
                ) : (
                  entry.artist_name.charAt(0)
                )}
              </div>

              {/* Name + Score */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-[13px] font-semibold truncate",
                  isTop3 ? "text-foreground" : "text-foreground/80"
                )}>
                  {entry.artist_name}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>⚡ {entry.energy_score.toLocaleString()}</span>
                  <span className="opacity-30">·</span>
                  <span>FES {entry.total_score.toLocaleString()}</span>
                </div>
              </div>

              {/* Change badge */}
              <div className={cn(
                "flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                isUp && "text-emerald-400 bg-emerald-500/10",
                isDown && "text-red-400 bg-red-500/10",
                !isUp && !isDown && "text-muted-foreground bg-muted/30"
              )}>
                {isUp && <TrendingUp className="w-3 h-3" />}
                {isDown && <TrendingDown className="w-3 h-3" />}
                {!isUp && !isDown && <Minus className="w-3 h-3" />}
                {isUp ? "+" : ""}{change.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3RankingCards;
