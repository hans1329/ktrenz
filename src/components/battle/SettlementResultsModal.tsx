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
  steady: { en: "Steady 15%+", ko: "안정 15%+", ja: "安定 15%+", zh: "稳定 15%+" },
  rising: { en: "Rising 30%+", ko: "상승 30%+", ja: "上昇 30%+", zh: "上升 30%+" },
  surge: { en: "Surge 80%+", ko: "급등 80%+", ja: "急騰 80%+", zh: "暴涨 80%+" },
};

const i18n = (lang: string, key: string) => {
  const map: Record<string, Record<string, string>> = {
    title: { en: "Battle Results", ko: "배틀 결과", ja: "バトル結果", zh: "战斗结果" },
    gotIt: { en: "Got it", ko: "확인", ja: "確認", zh: "确认" },
    missed: { en: "Missed", ko: "미적중", ja: "不的中", zh: "未命中" },
    earned: { en: "Earned", ko: "획득", ja: "獲得", zh: "获得" },
    of: { en: "of", ko: "/", ja: "/", zh: "/" },
    myPick: { en: "My Pick", ko: "내 선택", ja: "自分の選択", zh: "我的选择" },
    opponent: { en: "Opponent", ko: "상대", ja: "相手", zh: "对手" },
    growth: { en: "Growth", ko: "성장률", ja: "成長率", zh: "增长率" },
    band: { en: "Band", ko: "밴드", ja: "バンド", zh: "档位" },
    result: { en: "Result", ko: "결과", ja: "結果", zh: "结果" },
    winner: { en: "Higher", ko: "높음", ja: "高い", zh: "更高" },
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
      <div className="w-full sm:mx-4 sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 max-h-[88dvh] flex flex-col">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-3 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
            {i18n(lang, "title")}
          </p>

          <div className="flex items-center justify-center gap-6">
            {/* Score ring */}
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

        <div className="h-px bg-border mx-5" />

        {/* Table results */}
        <div className="px-4 py-3 overflow-y-auto flex-1 space-y-3">
          {results.map((r) => {
            const won = r.status === "won";
            const pg = r.picked_growth ?? 0;
            const og = r.opponent_growth ?? 0;
            const pickedHigher = pg > og;
            const bandLabel = BAND_LABEL[r.band]?.[lang] || BAND_LABEL[r.band]?.en;

            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-2xl border overflow-hidden",
                  won ? "border-primary/25" : "border-border"
                )}
              >
                {/* Result badge row */}
                <div className={cn(
                  "flex items-center justify-between px-3 py-1.5",
                  won ? "bg-primary/[0.06]" : "bg-muted/40"
                )}>
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-5 h-5 rounded-md flex items-center justify-center",
                      won ? "bg-primary/15" : "bg-muted"
                    )}>
                      {won
                        ? <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                        : <X className="w-3 h-3 text-muted-foreground" strokeWidth={3} />
                      }
                    </div>
                    <span className={cn(
                      "text-xs font-bold",
                      won ? "text-primary" : "text-muted-foreground"
                    )}>
                      {won ? "WIN" : i18n(lang, "missed")}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{bandLabel}</span>
                  {won && r.reward_amount > 0 && (
                    <span className="text-xs font-black text-primary">+{r.reward_amount}💎</span>
                  )}
                </div>

                {/* Comparison table */}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-t border-border/50">
                      <th className="py-1.5 px-3 text-left font-medium text-muted-foreground/70 w-[35%]"></th>
                      <th className="py-1.5 px-2 text-center font-medium text-muted-foreground/70">{i18n(lang, "growth")}</th>
                      <th className="py-1.5 px-2 text-center font-medium text-muted-foreground/70 w-[50px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* My pick row */}
                    <tr className={cn(
                      "border-t border-border/30",
                      pickedHigher ? "bg-primary/[0.03]" : ""
                    )}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider shrink-0">{i18n(lang, "myPick")}</span>
                        </div>
                        <p className={cn("text-sm font-bold truncate mt-0.5", won ? "text-primary" : "text-foreground")}>
                          {r.picked_star_name}
                        </p>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <GrowthDisplay value={pg} isHigher={pickedHigher} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        {pickedHigher && (
                          <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            ▲
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Opponent row */}
                    <tr className={cn(
                      "border-t border-border/30",
                      !pickedHigher && og > pg ? "bg-red-500/[0.02]" : ""
                    )}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider shrink-0">{i18n(lang, "opponent")}</span>
                        </div>
                        <p className="text-sm font-medium text-muted-foreground truncate mt-0.5">
                          {r.opponent_star_name}
                        </p>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <GrowthDisplay value={og} isHigher={!pickedHigher && og > pg} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        {!pickedHigher && og > pg && (
                          <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                            ▲
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
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

function GrowthDisplay({ value, isHigher }: { value: number; isHigher: boolean }) {
  const positive = value > 0;
  const Icon = positive ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={cn(
        "w-3.5 h-3.5",
        isHigher && positive ? "text-primary" : positive ? "text-emerald-500" : value < 0 ? "text-red-400" : "text-muted-foreground"
      )} />
      <span className={cn(
        "text-sm font-bold",
        isHigher && positive ? "text-primary" : positive ? "text-emerald-500" : value < 0 ? "text-red-400" : "text-muted-foreground"
      )}>
        {positive ? "+" : ""}{value}%
      </span>
    </div>
  );
}

export default SettlementResultsModal;
export type { SettledPrediction };
