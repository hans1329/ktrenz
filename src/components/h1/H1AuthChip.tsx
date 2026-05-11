/**
 * Auth indicator for /h1 surfaces.
 *
 * Anon: "Sign in" pill that links to /login with the current path encoded as
 *   redirect param so Login.tsx can navigate back after success.
 * Authed: avatar (image_url or display_name initial) with dropdown menu —
 *   History, Settings, Sign out.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { History, Settings as SettingsIcon, LogOut, ChevronDown, Music2, ChevronRight } from "lucide-react";

// 1 month of Spotify Premium ≈ $10 USD; KCASH_PER_USD=1000 in SpotifyRedeem
// → first redeemable tier costs 10,000 K-Cash. Progress bar targets this.
const SPOTIFY_TARGET_KCASH = 10000;

type Tone = "light" | "dark";   // light = white text on dark bg, dark = inverse

export default function H1AuthChip({ tone = "light", compact = false }: { tone?: Tone; compact?: boolean }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return (
      <Link
        to={`/login?redirect=${redirect}`}
        className={
          tone === "light"
            ? "inline-flex items-center px-3 py-1.5 rounded-full bg-white text-black text-xs font-black hover:scale-[1.02] transition-transform"
            : "inline-flex items-center px-3 py-1.5 rounded-full bg-black text-white text-xs font-black hover:scale-[1.02] transition-transform"
        }
      >
        {t("common.signIn")}
      </Link>
    );
  }

  const fullName = (user.user_metadata as any)?.full_name as string | undefined;
  const displayName = fullName || (user.email?.split("@")[0] ?? "User");
  const initial = (displayName || "U").trim().charAt(0).toUpperCase();
  const avatarUrl = (user.user_metadata as any)?.avatar_url as string | undefined;

  // K-Cash balance for the Spotify progress bar at the top of the dropdown.
  // Cached for 60s — same data is used by /h1 header, so React Query
  // dedupes if the page already has it.
  const { data: kPoints = 0 } = useQuery({
    queryKey: ["ktrenz-points", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("ktrenz_user_points")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.points as number | undefined) ?? 0;
    },
    enabled: !!user.id && open,    // only fetch when menu opens
    staleTime: 60_000,
  });
  const spotifyPct = Math.min(100, (kPoints / SPOTIFY_TARGET_KCASH) * 100);
  const spotifyReady = kPoints >= SPOTIFY_TARGET_KCASH;

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    // Stay on the current page — header re-renders to anon "Sign in".
    navigate(location.pathname, { replace: true });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Account menu"
      >
        <span className={compact ? "w-7 h-7" : "w-8 h-8"}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-full h-full rounded-full object-cover ring-1 ring-white/15"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-full h-full rounded-full bg-gradient-to-br from-rose-500 to-orange-500 grid place-items-center text-white font-black text-xs">
              {initial}
            </span>
          )}
        </span>
        {!compact && <ChevronDown className="w-3 h-3 text-white/55 mr-1" />}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[240px] rounded-xl bg-neutral-950 border border-white/10 shadow-2xl overflow-hidden">
          {/* Spotify Premium progress — tap to open redeem page */}
          <Link
            to="/spotify-redeem"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-3 border-b border-white/10 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Music2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] uppercase tracking-[0.15em] text-white/65">Spotify Premium</span>
              <ChevronRight className="w-3 h-3 text-white/35 ml-auto shrink-0" />
            </div>
            <div className="flex items-end justify-between gap-2 mb-1.5">
              <div className="text-[15px] font-black text-white tabular-nums leading-none inline-flex items-baseline gap-0.5">
                💎{kPoints.toLocaleString()}
              </div>
              <div className="text-[10px] text-white/45 tabular-nums leading-none">
                / {SPOTIFY_TARGET_KCASH.toLocaleString()}
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all ${spotifyReady ? "bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-gradient-to-r from-emerald-500/60 to-emerald-400/40"}`}
                style={{ width: `${spotifyPct}%` }}
              />
            </div>
            {spotifyReady && (
              <div className="text-[10px] font-black text-emerald-300 mt-1.5 uppercase tracking-wider">
                Ready to redeem →
              </div>
            )}
          </Link>

          <MenuItem to="/h1/history" icon={History} label={t("h1.nav.myCalls")} onSelect={() => setOpen(false)} />
          <MenuItem to="/settings" icon={SettingsIcon} label={t("common.settings")} onSelect={() => setOpen(false)} />
          {/* Logged-in email — placed just above Sign out so the user sees
              which account they're about to log out of. Full email shown
              (no truncation on the email itself, container handles overflow). */}
          <div className="px-3.5 py-2 border-t border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-0.5">{t("common.signIn")}</div>
            <div className="text-xs text-white/70 break-all">{user.email}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm text-white/80 hover:bg-white/5 hover:text-white border-t border-white/10"
          >
            <LogOut className="w-3.5 h-3.5" /> {t("common.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  to,
  icon: Icon,
  label,
  onSelect,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white"
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </Link>
  );
}
