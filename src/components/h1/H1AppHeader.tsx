// Unified sticky header for all /h1 surfaces (Discover · History · Leaderboard).
//
// Why a shared header: previously Discover used its own bespoke chrome (logo +
// brand + countdown + balance + Pro Battle), while /h1/history & /h1/leaderboard
// used a different H1TopNav (logo + tabs + auth). Switching pages produced
// visual whiplash. This component unifies all three under one sticky bar with:
//
//   [logo] [Discover] [나의 예측] [리더보드]      [💎 balance]  [Auth]
//
// Pro Battle / countdown / quota progress that were specific to /h1 stay on
// /h1 as a secondary strip below this header — they don't belong here because
// they're page-specific.

import { Link } from "react-router-dom";
import { Sparkles, Trophy, Flame, History as HistoryIcon } from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import H1AuthChip from "@/components/h1/H1AuthChip";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export type H1HeaderTab = "discover" | "history" | "leaderboard";

export const H1_HEADER_H = 48;   // px — single-row sticky header

export default function H1AppHeader({
  active,
  balance,
  signedIn,
  picksBadge,
}: {
  active: H1HeaderTab;
  balance?: number;
  signedIn?: boolean;
  picksBadge?: number;
}) {
  const { t } = useLanguage();
  return (
    <header
      className="sticky top-0 z-40 bg-black/70 backdrop-blur-xl border-b border-white/10"
      style={{ height: H1_HEADER_H }}
    >
      <div className="max-w-[1400px] mx-auto h-full flex items-center justify-between gap-2 px-3 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link to="/h1" className="flex items-center gap-2 shrink-0" aria-label="Home">
            <img
              src={ktrenzLogo}
              alt="K-TRENZ"
              className="h-2.5 md:h-3 w-auto"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            {/* English-only brand label, constant across all locales. Shown
                on both mobile and desktop. The leading "| " doubles as the
                visual separator before whatever follows. */}
            <span className="text-[11px] font-bold tracking-wide uppercase text-white/35 whitespace-nowrap">
              | Discover
            </span>
          </Link>

          {/* Desktop (md+): full tab row. Separator already rendered as the
              "|" in the brand label above. */}
          <nav className="hidden md:flex items-center gap-1 min-w-0">
            <Tab to="/h1"             active={active === "discover"}    icon={Flame}      label={t("h1.nav.discover")} />
            <Tab to="/h1/history"     active={active === "history"}     icon={HistoryIcon} label={t("h1.nav.myCalls")}  badge={picksBadge} disabled={!signedIn} />
            <Tab to="/h1/leaderboard" active={active === "leaderboard"} icon={Trophy}     label={t("h1.nav.leaderboard")} disabled={!signedIn} />
          </nav>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {signedIn && typeof balance === "number" && (
            <div className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-gradient-to-r from-sky-500/20 to-blue-500/15 border border-sky-300/35 text-sky-100 text-[11px] sm:text-[12px] font-black tabular-nums shadow-[0_0_12px_rgba(56,189,248,0.18)]">
              <span className="text-[12px] sm:text-[13px] leading-none">💎</span>
              {balance.toLocaleString()}
            </div>
          )}
          <H1AuthChip compact />
        </div>
      </div>
    </header>
  );
}

function Tab({
  to, active, icon: Icon, label, badge, disabled = false,
}: {
  to: string;
  active: boolean;
  icon: React.ElementType;
  label: string;
  badge?: number;
  disabled?: boolean;
}) {
  const className = cn(
    "relative inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors",
    disabled
      ? "text-white/25 cursor-not-allowed pointer-events-none"
      : active ? "bg-white text-black" : "text-white/65 hover:text-white",
  );
  const inner = (
    <>
      <Icon className="w-3 h-3" strokeWidth={active ? 2.5 : 2} />
      {label}
      {typeof badge === "number" && badge > 0 && (
        <span className={cn(
          "ml-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black tabular-nums grid place-items-center",
          active ? "bg-black/15 text-black" : "bg-violet-500 text-white",
        )}>
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );
  if (disabled) {
    return <span className={className} aria-disabled="true">{inner}</span>;
  }
  return <Link to={to} className={className}>{inner}</Link>;
}
