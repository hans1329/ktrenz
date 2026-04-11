import { createPortal } from "react-dom";
import { Trophy, TrendingUp, TrendingDown, Minus, Sprout, Flame, Rocket, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const BAND_META: Record<Band, { icon: typeof Sprout; iconColor: string; label: Record<string, string> }> = {
  steady: { icon: Sprout, iconColor: "text-emerald-500", label: { en: "Steady", ko: "안정", ja: "安定", zh: "稳定" } },
  rising: { icon: Flame, iconColor: "text-orange-500", label: { en: "Rising", ko: "상승", ja: "上昇", zh: "上升" } },
  surge: { icon: Rocket, iconColor: "text-red-500", label: { en: "Surge", ko: "급등", ja: "急騰", zh: "暴涨" } },
};

const SettlementResultsModal = ({ open, onClose, results, language }: SettlementResultsModalProps) => {
  if (!open || results.length === 0) return null;
  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";

  const wonCount = results.filter(r => r.status === "won").length;
  const totalReward = results.reduce((sum, r) => sum + (r.reward_amount || 0), 0);

  const title = lang === "ko" ? "배틀 결과 발표! 🏆"
    : lang === "ja" ? "バトル結果発表！🏆"
    : lang === "zh" ? "战斗结果公布！🏆"
    : "Battle Results! 🏆";

  const summaryText = lang === "ko"
    ? `${results.length}건 중 ${wonCount}건 적중`
    : lang === "ja" ? `${results.length}件中${wonCount}件的中`
    : lang === "zh" ? `${results.length}场中${wonCount}场命中`
    : `${wonCount} of ${results.length} correct`;

  const rewardText = lang === "ko" ? "획득 보상" : lang === "ja" ? "獲得報酬" : lang === "zh" ? "获得奖励" : "Earned";
  const closeLabel = lang === "ko" ? "확인" : lang === "ja" ? "確認" : lang === "zh" ? "确认" : "Got it";
  const growthLabel = lang === "ko" ? "성장률" : lang === "ja" ? "成長率" : lang === "zh" ? "增长率" : "Growth";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="mx-4 w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[85dvh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5 text-center shrink-0">
          <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{summaryText}</p>
          {totalReward > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1">
              <span className="text-xs text-muted-foreground">{rewardText}</span>
              <span className="text-sm font-bold text-primary">+{totalReward.toLocaleString()} 💎</span>
            </div>
          )}
        </div>

        {/* Results list */}
        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {results.map((result) => {
            const band = BAND_META[result.band];
            const BandIcon = band?.icon || Sprout;
            const won = result.status === "won";

            return (
              <div
                key={result.id}
                className={cn(
                  "rounded-xl border p-3 space-y-2",
                  won
                    ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                    : "border-border bg-muted/30"
                )}
              >
                {/* Status + Artists */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      won ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/10 text-red-500"
                    )}>
                      {won ? "✅ WIN" : "❌ LOSE"}
                    </span>
                    <span className="text-xs font-bold text-primary truncate">{result.picked_star_name}</span>
                    <span className="text-[10px] text-muted-foreground">vs</span>
                    <span className="text-xs text-muted-foreground truncate">{result.opponent_star_name}</span>
                  </div>
                </div>

                {/* Growth comparison */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{result.picked_star_name}</span>
                      <GrowthBadge value={result.picked_growth} />
                    </div>
                    <GrowthBar value={result.picked_growth} isWinner={won} />
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium shrink-0">vs</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{result.opponent_star_name}</span>
                      <GrowthBadge value={result.opponent_growth} />
                    </div>
                    <GrowthBar value={result.opponent_growth} isWinner={!won} />
                  </div>
                </div>

                {/* Band + Reward */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BandIcon className={cn("w-3.5 h-3.5", band?.iconColor)} />
                    <span className="text-[11px] text-muted-foreground">
                      {band?.label[lang] || band?.label.en}
                    </span>
                  </div>
                  {won && result.reward_amount > 0 && (
                    <span className="text-xs font-bold text-primary">+{result.reward_amount} 💎</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Close */}
        <div className="p-4 pt-0 shrink-0">
          <Button onClick={onClose} className="w-full" size="sm">{closeLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-[10px] text-muted-foreground">–</span>;
  const positive = value > 0;
  return (
    <span className={cn(
      "text-[11px] font-bold flex items-center gap-0.5",
      positive ? "text-emerald-500" : value < 0 ? "text-red-500" : "text-muted-foreground"
    )}>
      {positive ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {positive ? "+" : ""}{value}%
    </span>
  );
}

function GrowthBar({ value, isWinner }: { value: number | null; isWinner: boolean }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", isWinner ? "bg-emerald-500" : "bg-muted-foreground/30")}
        style={{ width: `${Math.max(pct, 3)}%` }}
      />
    </div>
  );
}

export default SettlementResultsModal;
export type { SettledPrediction };
