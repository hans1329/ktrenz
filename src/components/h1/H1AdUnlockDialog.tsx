// H1AdUnlockDialog — simulated 30s ad placeholder that grants +1 slot.
//
// Why simulated: real ad SDK integration is out of scope for the launch.
// This component wires the full server flow (record_ad_unlock RPC + status
// refetch) so swapping the placeholder for an SSP later is a one-component
// change.
//
// UX:
//   1. Tier choice (mid ×2 or high ×4) — locked-out tiers are disabled.
//   2. 30s countdown with progress bar (cancellable).
//   3. On finish: server records the unlock, dialog auto-closes.
//
// Server gates: daily cap=2 (any tier). Errors surface via toast in the
// caller; this component just calls onComplete and lets the parent refetch.

import { useEffect, useRef, useState } from "react";
import { Activity, Rocket, X as XIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import H1MockAdSlot from "@/components/h1/H1MockAdSlot";

type Tier = "mid" | "high";

const AD_DURATION_S = 30;

const TIER_META: Record<Tier, { mult: number; icon: typeof Activity; gradient: string }> = {
  mid:  { mult: 2, icon: Activity, gradient: "from-violet-500 to-purple-700" },
  high: { mult: 4, icon: Rocket,   gradient: "from-purple-600 to-violet-800" },
};

function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type Props = {
  open: boolean;
  /**
   * Per-tier remaining unlock budget (max_per_day - tier_unlocks_today is
   * not the right shape — what matters is total_used vs max_per_day).
   * We pass total used + max so we can also gate.
   */
  unlocksUsed: number;
  unlocksMax: number;
  onClose: () => void;
  /** Called after the server confirms the unlock. Parent should refetch. */
  onCompleted: (tier: Tier) => void;
};

export default function H1AdUnlockDialog({
  open,
  unlocksUsed,
  unlocksMax,
  onClose,
  onCompleted,
}: Props) {
  const { t } = useLanguage();
  const [tier, setTier] = useState<Tier | null>(null);
  const [remaining, setRemaining] = useState(AD_DURATION_S);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset on open/close.
  useEffect(() => {
    if (!open) {
      setTier(null);
      setRemaining(AD_DURATION_S);
      setSubmitting(false);
      setError(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [open]);

  // Countdown when a tier is picked.
  useEffect(() => {
    if (!open || tier === null) return;
    setRemaining(AD_DURATION_S);
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, AD_DURATION_S - elapsed);
      setRemaining(left);
      if (left === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        void completeUnlock();
      }
    }, 250);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, open]);

  async function completeUnlock() {
    if (!tier || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await (supabase as any)
      .rpc("ktrenz_h1_record_ad_unlock", { _tier: tier });
    setSubmitting(false);
    if (rpcErr) {
      const msg = String((rpcErr as any)?.message ?? "");
      if (msg.includes("AD_UNLOCK_DAILY_CAP")) {
        setError(t("h1.adUnlock.error.dailyCap"));
      } else {
        setError(t("h1.adUnlock.error.generic"));
      }
      return;
    }
    onCompleted(tier);
    onClose();
  }

  if (!open) return null;

  const remainingUnlocks = Math.max(0, unlocksMax - unlocksUsed);
  const dailyCapHit = remainingUnlocks <= 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent className="bg-neutral-950 border-white/10 max-w-md p-0 overflow-hidden">
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 grid place-items-center"
            aria-label={t("common.back")}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <AlertDialogHeader className="px-6 pt-6 pb-3 space-y-2">
          <AlertDialogTitle className="text-xl font-black text-white tracking-tight text-left">
            {tier === null ? t("h1.adUnlock.title") : t("h1.adUnlock.playingTitle")}
          </AlertDialogTitle>
          <p className="text-sm text-white/60 text-left">
            {tier === null
              ? tFmt(t("h1.adUnlock.subtitle"), {
                  remaining: String(remainingUnlocks),
                  max: String(unlocksMax),
                })
              : tFmt(t("h1.adUnlock.playingBody"), { seconds: String(remaining) })}
          </p>
        </AlertDialogHeader>

        {/* Tier picker (pre-roll) */}
        {tier === null && (
          <div className="px-6 pb-6 space-y-3">
            {dailyCapHit ? (
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 text-sm text-white/70 text-center">
                {t("h1.adUnlock.dailyCapBody")}
              </div>
            ) : (
              <>
                <TierOption tier="mid" onPick={() => setTier("mid")} />
                <TierOption tier="high" onPick={() => setTier("high")} />
              </>
            )}
          </div>
        )}

        {/* Ad slot (mock) + countdown */}
        {tier !== null && (
          <div className="px-6 pb-6">
            <H1MockAdSlot remaining={remaining} durationSec={AD_DURATION_S} />

            {error && (
              <div className="mt-3 text-sm text-rose-300 text-center">
                {error}
              </div>
            )}

            {!error && (
              <p className="mt-3 text-xs text-white/45 text-center">
                {tFmt(t("h1.adUnlock.unlockingNote"), {
                  tier: `×${TIER_META[tier].mult}`,
                })}
              </p>
            )}
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TierOption({ tier, onPick }: { tier: Tier; onPick: () => void }) {
  const { t } = useLanguage();
  const { mult, icon: Icon, gradient } = TIER_META[tier];
  const labelKey = tier === "mid" ? "h1.confidence.likely" : "h1.confidence.sure";
  const hintKey  = tier === "mid" ? "h1.confidence.likelyHint" : "h1.confidence.sureHint";
  return (
    <button
      onClick={onPick}
      className={cn(
        "w-full rounded-2xl p-4 text-left flex items-center gap-3 bg-gradient-to-r border border-white/10 hover:scale-[1.01] transition-transform",
        gradient,
      )}
    >
      <div className="w-11 h-11 rounded-xl bg-black/25 grid place-items-center text-white shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-black text-base">
          ×{mult} · {t(labelKey)}
        </div>
        <div className="text-white/75 text-xs mt-0.5">
          {t(hintKey)}
        </div>
      </div>
      <div className="text-white/85 text-xs font-bold whitespace-nowrap">
        +1 {t("h1.adUnlock.slot")}
      </div>
    </button>
  );
}
