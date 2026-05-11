/**
 * Single source of truth for "how does the Discover game work?"
 *
 * Lives outside the cards so the buttons can stay free of inline mechanics
 * copy. Triggered by a HelpCircle next to the "Will this go viral?" prompt
 * — discoverable when needed, invisible when not.
 *
 * Uses shadcn Sheet (Radix Dialog under the hood) — same pattern as Battle's
 * detail drawer. Picked over vaul because vaul's touch-event capture broke
 * autoplay on embedded media in sibling drawers.
 */
import { Sparkles, Sprout, Activity, Rocket, Clock, Coins, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function H1HowItWorksModal({ open, onClose }: Props) {
  const { t } = useLanguage();
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        hideClose
        className="rounded-t-3xl h-[calc(100dvh-88px)] sm:h-auto sm:max-h-[85vh] overflow-y-auto sm:max-w-md sm:mx-auto bg-neutral-950 border-t border-white/10 p-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Sticky top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-neutral-950/95 backdrop-blur border-b border-white/10">
          <div className="inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-400" />
            <SheetTitle className="text-base font-black text-white tracking-tight">
              {t("h1.howItWorks")}
            </SheetTitle>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 grid place-items-center"
            aria-label={t("common.back")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          <Block label={t("h1.help.dropTitle")} body={t("h1.help.dropBody")} />
          <Block label={t("h1.help.viralTitle")} body={t("h1.help.viralBody")} />

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2">
              {t("h1.help.callsScale")}
            </p>
            <ul className="space-y-1.5">
              <ScaleRow Icon={Sprout} label={t("h1.confidence.hunch")} desc={t("h1.help.hunchDesc")} />
              <ScaleRow Icon={Activity} label={t("h1.confidence.likely")} desc={t("h1.help.likelyDesc")} />
              <ScaleRow Icon={Rocket} label={t("h1.confidence.sure")} desc={t("h1.help.sureDesc")} />
            </ul>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <Clock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-0.5">{t("h1.help.earlyTitle")}</p>
              <p className="text-xs text-white/55 leading-relaxed">{t("h1.help.earlyBody")}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <Coins className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-0.5">{t("h1.help.kcashTitle")}</p>
              <p className="text-xs text-white/55 leading-relaxed">{t("h1.help.kcashBody")}</p>
            </div>
          </div>

          <p className="text-[11px] text-white/35 text-center pt-1 pb-2">
            {t("h1.help.adjustNote")}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-1.5">
        {label}
      </p>
      <p className="text-sm text-white/85 leading-relaxed">{body}</p>
    </div>
  );
}

function ScaleRow({ Icon, label, desc }: { Icon: React.ElementType; label: string; desc: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5">
      <Icon className="w-4 h-4 text-white/80 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-black text-white mr-2">{label}</span>
        <span className="text-xs text-white/55">{desc}</span>
      </div>
    </li>
  );
}
