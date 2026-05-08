/**
 * Single source of truth for "how does the Discover game work?"
 *
 * Lives outside the cards so the buttons can stay free of inline mechanics
 * copy. Triggered by a HelpCircle next to the "Will this go viral?" prompt
 * — discoverable when needed, invisible when not.
 */
import { X, Sparkles, Sprout, Activity, Rocket, Clock, Coins } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function H1HowItWorksModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-neutral-950 rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 max-h-[88vh] sm:max-h-[85vh] overflow-y-auto sm:mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-neutral-950/95 backdrop-blur border-b border-white/10">
          <div className="inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-400" />
            <h2 className="text-base font-black text-white tracking-tight">How it works</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 grid place-items-center"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <Block
            label="Today's Drop"
            body="24 K-pop contents curated each morning. Vouch on the ones you think will pop."
          />

          <Block
            label="What 'viral' means here"
            body="Your call hits if the pick lands in the top 8 by buzz growth 7 days from drop. Anything below = miss."
          />

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-2">
              Calls scale
            </p>
            <ul className="space-y-1.5">
              <ScaleRow Icon={Sprout} label="Hunch" desc="low conviction · small reward, small loss" />
              <ScaleRow Icon={Activity} label="Likely" desc="fair shot · medium upside and risk" />
              <ScaleRow Icon={Rocket} label="Sure!" desc="going viral · biggest reward, biggest hit if wrong" />
            </ul>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <Clock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-0.5">Earlier calls pay more</p>
              <p className="text-xs text-white/55 leading-relaxed">
                Day 1 picks earn 3× more than day 4+ picks. Calling something early — before it's
                obviously hot — is the whole point.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <Coins className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-0.5">K-Cash & ranks</p>
              <p className="text-xs text-white/55 leading-relaxed">
                Hits pay K-Cash, misses cost less than hits earn, skips are free.
                Hit at least 30% of your daily drop to qualify for the leaderboard.
              </p>
            </div>
          </div>

          <p className="text-[11px] text-white/35 text-center pt-1">
            Adjust your call any time before it resolves — but later changes earn less.
          </p>
        </div>
      </div>
    </div>
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
