// H1CallConfirmDialog — confirms a prediction call before sending to the server.
//
// Shows the user concretely:
//   - Resolution date (drop_date + 7 days)
//   - Today's round context (1 of 24 cohort)
//   - Win condition + K-Cash payout (TOP 7)
//   - Loss condition + K-Cash penalty (rank 8-24)
//   - Time-decay note (×3 today, base day 2-3, ×0.3 day 4+)
//
// Payout math mirrors ktrenz-h1-resolve-drop:
//   raw   = confidence_weight × time_decay
//   hit   = floor(raw × 1.0  × 10)
//   miss  = floor(raw × 0.5  × 10)   (recorded as negative; clamped at wallet)

import { useMemo } from "react";
import { Sprout, Activity, Rocket, Calendar, Trophy, X as XIcon, TrendingUp } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type Tier = "low" | "mid" | "high";

// Confirmation surface uses a purple family — distinct from the tier buttons
// (amber/orange/rose) so the dialog reads as a separate "decision" moment,
// not a hotter version of the same button. Shade deepens with tier strength.
const TIER_META: Record<Tier, { weight: number; mult: number; icon: typeof Sprout; gradient: string }> = {
  low:  { weight: 0.5, mult: 1, icon: Sprout,   gradient: "from-violet-400 to-violet-600" },
  mid:  { weight: 1.0, mult: 2, icon: Activity, gradient: "from-violet-500 to-purple-700" },
  high: { weight: 2.0, mult: 4, icon: Rocket,   gradient: "from-purple-600 to-violet-800" },
};

function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type SlotsProp = {
  low:  { used: number; cap: number };
  mid:  { used: number; cap: number };
  high: { used: number; cap: number };
};

export default function H1CallConfirmDialog({
  open,
  tier,
  resolutionMs,
  slots,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  tier: Tier | null;
  resolutionMs: number;
  slots?: SlotsProp;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, language } = useLanguage();

  // Single-tier payout — no time decay any more (game model: snap judgment,
  // edits free until resolution). hit = weight × 10, miss = weight × 5.
  const computed = useMemo(() => {
    if (!tier) return null;
    const meta = TIER_META[tier];
    const hit = Math.floor(meta.weight * 10);
    const miss = Math.floor(meta.weight * 5);
    return { meta, hit, miss };
  }, [tier]);

  const dateStr = useMemo(() => {
    const d = new Date(resolutionMs);
    const localeMap: Record<string, string> = { ko: "ko-KR", ja: "ja-JP", zh: "zh-CN", en: "en-US" };
    const locale = localeMap[language] ?? "en-US";
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", weekday: "short" });
  }, [resolutionMs, language]);

  if (!tier || !computed) return null;
  const { meta, hit, miss } = computed;
  const Icon = meta.icon;
  const multStr = String(meta.mult);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent className="max-w-sm bg-neutral-950 border-white/10 p-0 overflow-hidden">
        {/* Header band — gradient by tier */}
        <div className={cn("px-5 py-5 bg-gradient-to-br text-white", meta.gradient)}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Icon className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[10px] font-black tracking-[0.2em] uppercase opacity-80">×{multStr}</div>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white text-lg font-black tracking-tight leading-tight">
                  {tFmt(t("h1.confirm.title"), { mult: multStr })}
                </AlertDialogTitle>
              </AlertDialogHeader>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Round + resolve date */}
          <div className="space-y-1.5 text-[13px]">
            <div className="flex items-center gap-2 text-white/80">
              <TrendingUp className="w-3.5 h-3.5 text-white/50 shrink-0" />
              <span>{t("h1.confirm.round")}</span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Calendar className="w-3.5 h-3.5 text-white/50 shrink-0" />
              <span>{tFmt(t("h1.confirm.resolveDate"), { date: dateStr })}</span>
            </div>
          </div>

          <div className="h-px bg-white/10" />

          {/* Outcomes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-400/20">
              <div className="flex items-center gap-2 text-emerald-200">
                <Trophy className="w-4 h-4" />
                <span className="text-[13px] font-bold">{t("h1.confirm.win")}</span>
              </div>
              <span className="text-emerald-200 text-base font-black tabular-nums">
                {tFmt(t("h1.confirm.winValue"), { n: String(hit) })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-rose-500/5 border border-rose-400/15">
              <div className="flex items-center gap-2 text-rose-200/85">
                <XIcon className="w-4 h-4" />
                <span className="text-[13px] font-bold">{t("h1.confirm.miss")}</span>
              </div>
              <span className="text-rose-200/85 text-base font-black tabular-nums">
                {tFmt(t("h1.confirm.missValue"), { n: String(miss) })}
              </span>
            </div>
          </div>

          {/* Today's slot usage — shown only when caller passes slot state */}
          {slots && (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
              <div className="text-[10px] font-black tracking-wider uppercase text-white/55 mb-1.5">
                {t("h1.confirm.slotsTitle")}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["low","mid","high"] as const).map((tk) => {
                  const meta = TIER_META[tk];
                  const s = slots[tk];
                  const isCurrent = tk === tier;
                  const willBeFull = isCurrent && s.used + 1 >= s.cap;
                  return (
                    <div
                      key={tk}
                      className={cn(
                        "rounded px-1 py-1.5 transition-colors",
                        isCurrent ? "bg-white/[0.07] border border-white/15" : "border border-transparent",
                      )}
                    >
                      <div className="text-[10px] font-black text-white/65 tabular-nums">×{meta.mult}</div>
                      <div className={cn(
                        "text-[13px] font-black tabular-nums leading-none mt-1",
                        willBeFull ? "text-amber-300" : isCurrent ? "text-white" : "text-white/70",
                      )}>
                        {isCurrent ? s.used + 1 : s.used}/{s.cap}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Editable note */}
          <div className="text-[11px] text-white/55 text-center pt-1">
            💡 {t("h1.confirm.editableNote")}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-1">
          <button
            onClick={onCancel}
            className="py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white/85 text-sm font-bold hover:bg-white/[0.07] transition-colors"
          >
            {t("h1.confirm.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "py-3 rounded-xl text-white text-sm font-black shadow-lg transition-transform active:scale-[0.98]",
              "bg-gradient-to-b", meta.gradient,
            )}
          >
            {tFmt(t("h1.confirm.confirm"), { mult: multStr })}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
