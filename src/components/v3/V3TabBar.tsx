import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TrendingUp, Bot, Power, Activity, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import { useAgentSlots } from "@/hooks/useAgentSlots";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type V3Tab = "rankings" | "agent" | "activity" | "settings";

interface V3TabBarProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const V3TabBar = ({ activeTab, onTabChange }: V3TabBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [profileOpen, setProfileOpen] = useState(false);

  // Auto-open profile drawer when navigating back from settings/kpass
  useEffect(() => {
    if ((location.state as any)?.openProfile) {
      setProfileOpen(true);
      // Clear state to prevent re-opening on subsequent renders
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // 프로필 이미지 preload
  useEffect(() => {
    const url = profile?.avatar_url;
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [profile?.avatar_url]);

  // Agent slots for avatar
  const { activeSlot } = useAgentSlots();
  
  // Legacy agent avatar fallback
  const { data: legacyAgentAvatarUrl } = useQuery({
    queryKey: ["ktrenz-agent-legacy-avatar", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.storage
        .from("agent-avatars")
        .getPublicUrl(`${user.id}/avatar.webp`);
      // Check if file exists by trying to fetch
      try {
        const res = await fetch(data.publicUrl, { method: "HEAD" });
        return res.ok ? data.publicUrl : null;
      } catch { return null; }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10,
  });
  const agentAvatarUrl = activeSlot?.avatar_url || (activeSlot?.slot_index === 0 ? legacyAgentAvatarUrl : null) || null;

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

  // Show red dot when: no bias registered OR alerts on but daily news not yet seen
  const { data: hasUnread } = useQuery({
    queryKey: ["ktrenz-agent-has-unread", user?.id],
    queryFn: () => {
      if (!user?.id) return false;
      // No bias registered at all
      if (!activeSlot?.wiki_entry_id) return true;
      // Alerts on but daily news not seen today
      if (hasAlertOn) {
        const today = new Date().toISOString().slice(0, 10);
        const seen = localStorage.getItem(`ktrenz-daily-news-seen-${user.id}`);
        return seen !== today;
      }
      return false;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  });
  const showAgentBadge = user && hasUnread;

  const handleProfileClick = () => {
    if (user) setProfileOpen(true);
    else navigate('/login');
  };

  const tabs = [
    { id: "rankings" as const, labelKey: "nav.trendz", icon: TrendingUp },
    { id: "activity" as const, labelKey: "nav.activity", icon: Activity },
    { id: "agent" as const, labelKey: "nav.agent", icon: null, isCenter: true },
    { id: "profile" as const, labelKey: "nav.profile", icon: User },
    { id: "settings" as const, labelKey: "nav.settings", icon: Settings },
  ];

  return (
    <>
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-md bg-tabbar-background/95 backdrop-blur-md border border-purple-500/30 rounded-full overflow-visible"
        style={{
          transform: 'translate3d(-50%, 0, 0)',
          boxShadow: '0 0 30px 12px rgba(168, 85, 247, 0.15), 0 0 60px 25px rgba(168, 85, 247, 0.08)',
        }}>

        <div className="flex items-center justify-evenly h-16 max-w-md mx-auto">
          {tabs.map((tab) => {
            if (tab.isCenter) {
              return (
                <button key={tab.id} onClick={() => navigate("/agent")} className="flex items-center justify-center -mt-6 relative">
                  {showAgentBadge && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background z-10" />
                  )}
                   <div className={cn("w-16 h-16 rounded-full transition-all duration-200 overflow-hidden bg-black grid place-items-center")}
                    style={{ boxShadow: '0 0 15px 4px rgba(255, 255, 255, 0.4), 0 0 30px 8px rgba(255, 255, 255, 0.2)' }}>
                    {agentAvatarUrl ? (
                      <img src={agentAvatarUrl} alt="Agent" className="w-full h-full object-cover" loading="eager" fetchPriority="high" />
                    ) : (
                      <Bot className="w-6 h-6 text-primary -translate-y-[3px]" />
                    )}
                  </div>
                </button>
              );
            }

            const isActive = activeTab === tab.id;
            const Icon = tab.icon!;

            return (
              <button key={tab.id} onClick={() => (tab.id === "profile" ? handleProfileClick() : tab.id === "activity" ? navigate("/dashboard") : tab.id === "settings" ? navigate("/settings") : onTabChange(tab.id as V3Tab))}
                className={cn("relative flex flex-col items-center justify-center gap-1 transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                <Icon className={cn("w-[22px] h-[22px] transition-transform duration-200", isActive && "scale-110")} />
                <span className={cn("text-[8px] font-medium transition-all", isActive && "font-semibold")}>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <V2ProfileOverlay open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};

export default V3TabBar;
