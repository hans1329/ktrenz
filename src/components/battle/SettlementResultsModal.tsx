import { createPortal } from "react-dom";
import { Trophy, TrendingUp, TrendingDown, Minus, Sprout, Flame, Rocket } from "lucide-react";
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

const BAND_META: Record<Band, { icon: typeof Sprout; iconColor: string; label: Record<string, string>; threshold: number }> = {
  steady: { icon: Sprout, iconColor: "text-emerald-500", label: { en: "Steady", ko: "안정", ja: "安定", zh: "稳定" }, threshold: 15 },
  rising: { icon: Flame, iconColor: "text-orange-500", label: { en: "Rising", ko: "상승", ja: "上昇", zh: "上升" }, threshold: 30 },
  surge: { icon: Rocket, iconColor: "text-red-500", label: { en: "Surge", ko: "급등", ja: "急騰", zh: "暴涨" }, threshold: 80 },
};

function getResultReason(result: SettledPrediction, lang: string): string {
  const pg = result.picked_growth ?? 0;
  const og = result.opponent_growth ?? 0;
  const band = BAND_META[result.band];
  const threshold = band.threshold;
  const bandName = band.label[lang] || band.label.en;

  if (result.status === "won") {
    if (lang === "ko") return `${result.picked_star_name} +${pg}%로 상대 +${og}%를 넘고, ${bandName}(${threshold}%+) 달성!`;
    if (lang === "ja") return `${result.picked_star_name} +${pg}%で相手 +${og}%を上回り、${bandName}(${threshold}%+)達成！`;
    if (lang === "zh") return `${result.picked_star_name} +${pg}%超过对手 +${og}%，达到${bandName}(${threshold}%+)！`;
    return `${result.picked_star_name} grew +${pg}% vs +${og}%, hitting ${bandName} (${threshold}%+)!`;
  }

  // Lost reasons
  const pickedWonVs = pg > og;
  const bandMatched = pg >= threshold;

  if (!pickedWonVs && !bandMatched) {
    if (lang === "ko") return `성장률 +${pg}%로 상대 +${og}%보다 낮고, ${bandName}(${threshold}%+) 미달`;
    if (lang === "ja") return `成長率 +${pg}%で相手 +${og}%より低く、${bandName}(${threshold}%+)未達`;
    if (lang === "zh") return `增长率 +${pg}%低于对手 +${og}%，未达${bandName}(${threshold}%+)`;
    return `Grew +${pg}% vs opponent's +${og}%, missed ${bandName} (${threshold}%+)`;
  }
  if (!pickedWonVs) {
    if (lang === "ko") return `${bandName} 달성했으나, 상대 +${og}%가 더 높음`;
    if (lang === "ja") return `${bandName}達成も、相手 +${og}%が上回った`;
    if (lang === "zh") return `达到${bandName}，但对手 +${og}%更高`;
    return `Hit ${bandName}, but opponent grew more (+${og}%)`;
  }
  // pickedWonVs but !bandMatched
  if (lang === "ko") return `상대보다 높지만 +${pg}%로 ${bandName}(${threshold}%+) 미달`;
  if (lang === "ja") return `相手より高いが +${pg}%で${bandName}(${threshold}%+)未達`;
  if (lang === "zh") return `超过对手但 +${pg}%未达${bandName}(${threshold}%+)`;
  return `Outgrew opponent, but +${pg}% missed ${bandName} threshold (${threshold}%+)`;
}

const SettlementResultsModal = ({ open, onClose, results, language }: SettlementResultsModalProps) => {
  if (!open || results.length === 0) return null;
  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";

  const wins = results.filter(r => r.status === "won");
  const losses = results.filter(r => r.status === "lost");
  const totalReward = results.reduce((sum, r) => sum + (r.reward_amount || 0), 0);

  const title = lang === "ko" ? "배틀 결과 발표! 🏆"
    : lang === "ja" ? "バトル結果発表！🏆"
    : lang === "zh" ? "战斗结果公布！🏆"
    : "Battle Results! 🏆";

  const summaryText = lang === "ko"
    ? `${results.length}건 중 ${wins.length}건 적중`
    : lang === "ja" ? `${results.length}件中${wins.length}件的中`
    : lang === "zh" ? `${results.length}场中${wins.length}场命中`
    : `${wins.length} of ${results.length} correct`;

  const rewardText = lang === "ko" ? "획득 보상" : lang === "ja" ? "獲得報酬" : lang === "zh" ? "获得奖励" : "Earned";
  const closeLabel = lang === "ko" ? "확인" : lang === "ja" ? "確認" : lang === "zh" ? "确认" : "Got it";
  const winHeader = lang === "ko" ? "적중 ✅" : lang === "ja" ? "的中 ✅" : lang === "zh" ? "命中 ✅" : "Correct ✅";
  const loseHeader = lang === "ko" ? "미적중 ❌" : lang === "ja" ? "不的中 ❌" : lang === "zh" ? "未命中 ❌" : "Missed ❌";

  const winLabel = lang === "ko" ? "적중" : lang === "ja" ? "的中" : lang === "zh" ? "命中" : "Correct";
  const loseLabel = lang === "ko" ? "미적중" : lang === "ja" ? "不的中" : lang === "zh" ? "未命中" : "Missed";

  const renderResult = (result: SettledPrediction) => {
    const band = BAND_META[result.band];
    const BandIcon = band?.icon || Sprout;
    const won = result.status === "won";
    const reason = getResultReason(result, lang);

    return (
      <div
        key={result.id}
        className={cn(
          "rounded-xl border p-3.5 space-y-2.5",
          won ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-red-500/20 bg-red-500/[0.03]"
        )}
      >
        {/* Status badge centered */}
        <div className="flex justify-center">
          <span className={cn(
            "text-[11px] font-bold px-3 py-0.5 rounded-full",
            won ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
          )}>
            {won ? `✅ ${winLabel}` : `❌ ${loseLabel}`}
          </span>
        </div>

        {/* Artists side by side */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="text-sm font-bold text-primary truncate w-full">{result.picked_star_name}</span>
            <GrowthBadge value={result.picked_growth} />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">vs</span>
          <div className="flex flex-col items-end min-w-0 flex-1">
            <span className="text-sm font-bold text-muted-foreground truncate w-full text-right">{result.opponent_star_name}</span>
            <GrowthBadge value={result.opponent_growth} />
          </div>
        </div>

        {/* Reason */}
        <p className="text-[11px] text-muted-foreground leading-snug text-center">{reason}</p>

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
  };

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
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          {results.map(renderResult)}
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

export default SettlementResultsModal;
export type { SettledPrediction };
