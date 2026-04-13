import { createPortal } from "react-dom";
import { TrendingUp, TrendingDown, Minus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Band = "steady" | "rising" | "surge";

interface SettledPrediction {
  id: string;
  picked_star_name: string;
  opponent_star_name: string;
  band: Band;
  status: "won" | "lost";
  reward_amount: number;
  picked_growth: number | null;
  opponent_growth: number | null;
  settled_at: string;
}

interface SettlementResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: SettledPrediction[];
  language: string;
}

const BAND_LABEL: Record<Band, Record<string, string>> = {
  steady: { en: "Steady", ko: "안정", ja: "安定", zh: "稳定" },
  rising: { en: "Rising", ko: "상승", ja: "上昇", zh: "上升" },
  surge: { en: "Surge", ko: "급등", ja: "急騰", zh: "暴涨" },
};

const i18n = (lang: string, key: string) => {
  const map: Record<string, Record<string, string>> = {
    title: { en: "Battle Results", ko: "배틀 결과", ja: "バトル結果", zh: "战斗结果" },
    gotIt: { en: "Got it", ko: "확인", ja: "確認", zh: "确认" },
    correct: { en: "Correct", ko: "적중", ja: "的中", zh: "命中" },
    missed: { en: "Missed", ko: "미적중", ja: "不的中", zh: "未命中" },
    earned: { en: "Earned", ko: "획득", ja: "獲得", zh: "获得" },
    of: { en: "of", ko: "/", ja: "/", zh: "/" },
    win: { en: "WIN", ko: "WIN", ja: "WIN", zh: "WIN" },
  };
  return map[key]?.[lang] || map[key]?.en || key;
};

const SettlementResultsModal = ({ open, onClose, results, language }: SettlementResultsModalProps) => {
  if (!open || results.length === 0) return null;
  const lang = (["ko", "ja", "zh"].includes(language)) ? language : "en";

  const wins = results.filter(r => r.status === "won");
  const totalReward = results.reduce((sum, r) => sum + (r.reward_amount || 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:mx-4 sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 max-h-[88dvh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Compact header */}
        <div className="px-5 pt-4 pb-3 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
            {i18n(lang, "title")}
          </p>

          {/* Score ring */}
          <div className="flex items-center justify-center gap-6">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15.5" fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${(wins.length / results.length) * 97.4} 97.4`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-foreground leading-none">{wins.length}</span>
                <span className="text-[10px] text-muted-foreground">{i18n(lang, "of")} {results.length}</span>
              </div>
            </div>

            {totalReward > 0 && (
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{i18n(lang, "earned")}</p>
                <p className="text-xl font-black text-foreground">+{totalReward.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">💎 K-Point</p>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-5" />

        {/* Results */}
        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {results.map((r) => {
            const won = r.status === "won";
            const pg = r.picked_growth ?? 0;
            const og = r.opponent_growth ?? 0;
            const bandLabel = BAND_LABEL[r.band]?.[lang] || BAND_LABEL[r.band]?.en;

            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-2xl border p-3 flex items-center gap-3 transition-colors",
                  won ? "border-primary/20 bg-primary/[0.03]" : "border-border bg-muted/30"
                )}
              >
                {/* Win/Lose icon */}
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  won ? "bg-primary/10" : "bg-muted"
                )}>
                  {won
                    ? <Check className="w-4.5 h-4.5 text-primary" strokeWidth={3} />
                    : <X className="w-4.5 h-4.5 text-muted-foreground" strokeWidth={2.5} />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-sm font-bold truncate", won ? "text-foreground" : "text-muted-foreground")}>
                      {r.picked_star_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">vs</span>
                    <span className="text-xs text-muted-foreground truncate">{r.opponent_star_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <GrowthPill value={pg} highlight={won} />
                    <span className="text-[10px] text-muted-foreground/40">vs</span>
                    <GrowthPill value={og} highlight={false} />
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">{bandLabel}</span>
                  </div>
                </div>

                {/* Reward */}
                <div className="shrink-0 text-right">
                  {won && r.reward_amount > 0 ? (
                    <span className="text-sm font-black text-primary">+{r.reward_amount}💎</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{i18n(lang, "missed")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="p-4 pt-2 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold transition-all active:scale-[0.97]"
          >
            {i18n(lang, "gotIt")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

function GrowthPill({ value, highlight }: { value: number; highlight: boolean }) {
  const positive = value > 0;
  const Icon = positive ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold",
      highlight && positive ? "text-primary" : positive ? "text-emerald-500" : value < 0 ? "text-red-400" : "text-muted-foreground"
    )}>
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}{value}%
    </span>
  );
}

export default SettlementResultsModal;
export type { SettledPrediction };
