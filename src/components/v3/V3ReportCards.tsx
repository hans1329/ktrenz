import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Types ──────────────────────────────────────────
export interface CategoryData {
  key: string;
  label: string;
  score: number;
  rank: number;
}

export interface ReportCard {
  type: "artist_report";
  artist: string;
  rank: number;
  totalArtists: number;
  energy: { score: number; change24h: number };
  categories: CategoryData[];
  strongest: CategoryData;
  weakest: CategoryData;
  tier: string | null;
}

// ── Helper: rank → percentile label ──
function percentileLabel(rank: number, total: number): string {
  const pct = Math.round((rank / total) * 100);
  if (pct <= 5) return "Top 5%";
  if (pct <= 10) return "Top 10%";
  if (pct <= 20) return "Top 20%";
  if (pct <= 30) return "Top 30%";
  if (pct <= 50) return "Top 50%";
  return `Top ${pct}%`;
}

// ── Category icon map ──
const CATEGORY_ICON: Record<string, string> = {
  youtube: "▶️",
  buzz: "💬",
  music: "🎵",
  album: "💿",
};

// ── Component ──────────────────────────────────────
const V3ReportCards = ({ cards }: { cards: ReportCard[] }) => {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="space-y-2 mt-2 w-full">
      {cards.map((card, idx) => (
        <ReportCardItem key={idx} card={card} />
      ))}
    </div>
  );
};

const ReportCardItem = ({ card }: { card: ReportCard }) => {
  const { artist, rank, totalArtists, energy, categories, strongest, weakest, tier } = card;
  const change = energy.change24h;
  const isPositive = change > 0;
  const isNegative = change < 0;

  // Sort categories by rank (best first)
  const sorted = [...categories].sort((a, b) => a.rank - b.rank);

  // Max score for bar scaling
  const maxScore = Math.max(...sorted.map((c) => c.score), 1);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header: Rank + Artist + Energy */}
      <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border/30">
        {/* Rank badge */}
        <div className={cn(
          "w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold",
          rank <= 3 ? "bg-amber-500/15 text-amber-400" :
          rank <= 10 ? "bg-primary/10 text-primary" :
          "bg-muted text-muted-foreground"
        )}>
          <span className="text-[10px] leading-none opacity-60">#</span>
          <span className="text-lg leading-none">{rank}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground text-[15px] truncate">{artist}</span>
            {tier && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
                {tier}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[12px] text-muted-foreground">
              {percentileLabel(rank, totalArtists)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">·</span>
            <span className="text-[12px] text-muted-foreground">
              Energy {energy.score.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Energy change */}
        <div className={cn(
          "flex items-center gap-0.5 px-2 py-1 rounded-lg text-[13px] font-bold shrink-0",
          isPositive ? "bg-emerald-500/15 text-emerald-400" :
          isNegative ? "bg-red-500/15 text-red-400" :
          "bg-muted text-muted-foreground"
        )}>
          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> :
           isNegative ? <TrendingDown className="w-3.5 h-3.5" /> :
           <Minus className="w-3.5 h-3.5" />}
          {isPositive ? "+" : ""}{change}%
        </div>
      </div>

      {/* Category bars */}
      <div className="px-3.5 py-2.5 space-y-2">
        {sorted.map((cat) => {
          const pct = Math.round((cat.score / maxScore) * 100);
          const isStrongest = cat.key === strongest.key;
          const isWeakest = cat.key === weakest.key;

          return (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="text-sm w-5 text-center shrink-0">{CATEGORY_ICON[cat.key] || "📊"}</span>
              <span className={cn(
                "text-[12px] w-14 shrink-0 font-medium",
                isStrongest ? "text-emerald-400" : isWeakest ? "text-amber-400" : "text-muted-foreground"
              )}>
                {cat.label}
              </span>
              <div className="flex-1 h-5 bg-muted/40 rounded-md overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-md transition-all duration-500",
                    isStrongest ? "bg-emerald-500/30" :
                    isWeakest ? "bg-amber-500/20" :
                    "bg-primary/20"
                  )}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
                <span className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] font-bold",
                  isStrongest ? "text-emerald-400" : isWeakest ? "text-amber-400" : "text-foreground/60"
                )}>
                  #{cat.rank}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insight footer */}
      <div className="px-3.5 py-2 border-t border-border/20 bg-muted/20">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          <span className="text-emerald-400 font-semibold">{CATEGORY_ICON[strongest.key]} {strongest.label}</span>
          {" "}#{strongest.rank} · 
          <span className="text-amber-400 font-semibold"> {CATEGORY_ICON[weakest.key]} {weakest.label}</span>
          {" "}#{weakest.rank}
        </p>
      </div>
    </div>
  );
};

export default V3ReportCards;
