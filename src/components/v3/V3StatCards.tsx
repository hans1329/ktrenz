import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Crown } from "lucide-react";

export interface StatEntry {
  artist: string;
  rank?: number;
  energy_score: number;
  energy_change_24h: number;
  youtube_score: number;
  buzz_score: number;
  music_score: number;
  album_sales_score: number;
  tier?: string | null;
}

interface V3StatCardsProps {
  stats: StatEntry[];
}

function ChangeIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400 text-xs font-bold">
        <TrendingUp className="w-3 h-3" />
        +{value.toFixed(1)}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-bold">
        <TrendingDown className="w-3 h-3" />
        {value.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="w-3 h-3" />
      0.0%
    </span>
  );
}

function CategoryBar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-[52px] shrink-0 text-right">{label}</span>
      <div className="flex-1 h-[6px] rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-[34px] text-right">{value.toLocaleString()}</span>
    </div>
  );
}

function StatCard({ stat, maxScores }: { stat: StatEntry; maxScores: { yt: number; bz: number; mu: number; al: number } }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/80 p-3 space-y-2.5">
      {/* Header: rank + artist + energy */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {stat.rank && (
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black",
              stat.rank === 1 ? "bg-amber-500/20 text-amber-400" :
              stat.rank <= 3 ? "bg-primary/15 text-primary" :
              "bg-muted text-muted-foreground"
            )}>
              {stat.rank === 1 ? <Crown className="w-3.5 h-3.5" /> : `#${stat.rank}`}
            </div>
          )}
          <span className="text-sm font-bold text-foreground truncate">{stat.artist}</span>
          {stat.tier && (
            <span className={cn(
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0",
              stat.tier === "1" ? "bg-amber-500/15 text-amber-400" :
              stat.tier === "2" ? "bg-blue-500/15 text-blue-400" :
              "bg-muted text-muted-foreground"
            )}>
              T{stat.tier}
            </span>
          )}
        </div>
        <ChangeIndicator value={stat.energy_change_24h} />
      </div>

      {/* Energy score */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-black text-foreground tracking-tight">{stat.energy_score.toLocaleString()}</span>
        <span className="text-[10px] text-muted-foreground">FES</span>
      </div>

      {/* Category bars */}
      <div className="space-y-1">
        <CategoryBar label="YouTube" value={stat.youtube_score} maxValue={maxScores.yt} color="bg-red-500" />
        <CategoryBar label="Buzz" value={stat.buzz_score} maxValue={maxScores.bz} color="bg-blue-500" />
        <CategoryBar label="Music" value={stat.music_score} maxValue={maxScores.mu} color="bg-emerald-500" />
        <CategoryBar label="Album" value={stat.album_sales_score} maxValue={maxScores.al} color="bg-purple-500" />
      </div>
    </div>
  );
}

export default function V3StatCards({ stats }: V3StatCardsProps) {
  if (!stats || stats.length === 0) return null;

  // Calculate max scores for bar scaling
  const maxScores = {
    yt: Math.max(...stats.map(s => s.youtube_score), 1),
    bz: Math.max(...stats.map(s => s.buzz_score), 1),
    mu: Math.max(...stats.map(s => s.music_score), 1),
    al: Math.max(...stats.map(s => s.album_sales_score), 1),
  };

  return (
    <div className={cn(
      "mt-2 w-full",
      stats.length === 1 ? "max-w-[280px]" : "grid grid-cols-1 gap-2"
    )}>
      {stats.map((stat, i) => (
        <StatCard key={`${stat.artist}-${i}`} stat={stat} maxScores={maxScores} />
      ))}
    </div>
  );
}
