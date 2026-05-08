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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { History, Settings as SettingsIcon, LogOut, ChevronDown } from "lucide-react";

type Tone = "light" | "dark";   // light = white text on dark bg, dark = inverse

export default function H1AuthChip({ tone = "light", compact = false }: { tone?: Tone; compact?: boolean }) {
  const { user } = useAuth();
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
        Sign in
      </Link>
    );
  }

  const fullName = (user.user_metadata as any)?.full_name as string | undefined;
  const displayName = fullName || (user.email?.split("@")[0] ?? "User");
  const initial = (displayName || "U").trim().charAt(0).toUpperCase();
  const avatarUrl = (user.user_metadata as any)?.avatar_url as string | undefined;

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
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[200px] rounded-xl bg-neutral-950 border border-white/10 shadow-2xl overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Signed in</div>
            <div className="text-sm text-white font-bold truncate">{displayName}</div>
          </div>
          <MenuItem to="/h1/history" icon={History} label="My calls" onSelect={() => setOpen(false)} />
          <MenuItem to="/settings" icon={SettingsIcon} label="Settings" onSelect={() => setOpen(false)} />
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm text-white/80 hover:bg-white/5 hover:text-white border-t border-white/10"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
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
