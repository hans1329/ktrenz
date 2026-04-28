import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Flame, Bot, Activity, Bell, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguagePickerDrawer from "@/components/LanguagePickerDrawer";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import ktrenzLogo from "@/assets/logo_col3.webp";
import type { V3Tab } from "@/components/v3/V3TabBar";




const navItems: { id: V3Tab | "myActivity"; titleKey: string; icon: typeof Flame }[] = [
  { id: "battle", titleKey: "nav.battle", icon: Flame },
  { id: "agent", titleKey: "nav.fanAgent", icon: Bot },
  { id: "myActivity", titleKey: "nav.myActivity", icon: Activity },
];

interface V3DesktopHeaderProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const SPOTIFY_GOAL = 9000;
const SPOTIFY_SVG = (
  <svg viewBox="0 0 24 24" fill="hsl(142, 71%, 45%)"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

const SpotifyGoalPopupDesktop = ({ open, onClose, kPoints }: { open: boolean; onClose: () => void; kPoints: number }) => {
  if (!open) return null;
  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,90vw)] bg-card rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12">{SPOTIFY_SVG}</div>
          <div>
            <p className="font-bold text-foreground">Spotify Premium 1 Month</p>
            <p className="text-sm text-muted-foreground">Redeem at 9,000 K-Cash</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="w-full h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(progress, 2)}%`, backgroundColor: "hsl(142, 71%, 45%)" }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-bold text-foreground">{kPoints.toLocaleString()}</span>
            <span className="text-muted-foreground">/ {SPOTIFY_GOAL.toLocaleString()} K</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Earn K-Cash by completing daily missions, predictions, and battles. Reach the goal to redeem a Spotify Premium subscription coupon!
        </p>
        <button
          onClick={() => { onClose(); window.location.href = "/redeem/spotify"; }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: "hsl(142, 71%, 45%)" }}
        >
          Go to Redeem Page
        </button>
        <button onClick={onClose} className="w-full py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          Close
        </button>
      </div>
    </>
  );
};

const SpotifyGoalBarDesktop = () => {
  const { kPoints } = useAuth();
  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);
  const [showPopup, setShowPopup] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="flex items-center px-2 py-1 rounded-full hover:bg-muted/50 transition-colors"
      >
        <div className="relative w-20 h-4 rounded-full bg-muted overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 5)}%`, backgroundColor: "hsl(142, 71%, 45%)" }}
          />
          {/* Spotify icon overlaid on left */}
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none">
            <svg viewBox="0 0 24 24" fill="white"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          </div>
        </div>
      </button>
      <SpotifyGoalPopupDesktop open={showPopup} onClose={() => setShowPopup(false)} kPoints={kPoints} />
    </>
  );
};

const V3DesktopHeader = ({ activeTab, onTabChange }: V3DesktopHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const [showLangDrawer, setShowLangDrawer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Auto-open profile drawer when navigating back from settings/kpass
  useEffect(() => {
    if ((location.state as any)?.openProfile) {
      setProfileOpen(true);
      window.history.replaceState({}, "");
    }
  }, [location.state]);



  // Check for unread daily news notification (red dot)
  const { data: watchedArtists } = useQuery({
    queryKey: ["ktrenz-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });
  const hasAlertOn = (watchedArtists?.length ?? 0) > 0;

  const hasUnread = useMemo(() => {
    if (!user?.id) return false;
    if (hasAlertOn) {
      const today = new Date().toISOString().slice(0, 10);
      const seen = localStorage.getItem(`ktrenz-daily-news-seen-${user.id}`);
      return seen !== today;
    }
    return false;
  }, [user?.id, hasAlertOn]);

  const [, forceUpdateDesktop] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdateDesktop(n => n + 1);
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const showAgentBadge = user && hasUnread;




  return (
    <>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between h-16 px-6 w-full">
          {/* Left: Logo */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center">
              <img src={ktrenzLogo} alt="K-TRENZ" className="h-3.5 w-auto" loading="eager" fetchPriority="high" decoding="async" />
            </Link>
          </div>

          {/* Center: Tab buttons */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card rounded-full p-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => item.id === "agent" ? navigate("/agent") : item.id === "myActivity" ? navigate("/dashboard") : onTabChange(item.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(item.titleKey)}</span>
                  {item.id === "agent" && showAgentBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Search + Lang + Profile */}
          <div className="flex items-center gap-3">
            {/* Spotify Goal Bar */}
            <SpotifyGoalBarDesktop />

            {/* Language */}
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 rounded-full"
              onClick={() => setShowLangDrawer(true)}
            >
              <Globe className="w-4 h-4" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} className="w-9 h-9 rounded-full">
              <Bell className="w-4 h-4" />
            </Button>

            {/* Profile / Sign In */}
            {user ? (
              <button onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted transition-colors">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback delayMs={600} className="bg-primary/10 text-primary text-sm font-medium">
                    {profile?.username?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => window.location.href = '/login'}>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>
      <V2ProfileOverlay open={profileOpen} onOpenChange={setProfileOpen} />
      <LanguagePickerDrawer open={showLangDrawer} onOpenChange={setShowLangDrawer} />
    </>
  );
};

export default V3DesktopHeader;
