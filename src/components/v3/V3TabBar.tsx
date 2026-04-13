import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Flame, Bot, Power, Activity, Bell, User, Compass } from "lucide-react";
import { getDefaultAvatar } from "@/lib/defaultAvatar";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import { useAgentSlots } from "@/hooks/useAgentSlots";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type V3Tab = "battle" | "discover" | "agent" | "activity" | "settings";

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

  // Check for actual alert conditions (trend spike / rank #1) before showing red dot
  const { data: activeKeywordCount } = useQuery({
    queryKey: ["ktrenz-agent-badge-keywords", activeSlot?.wiki_entry_id],
    queryFn: async () => {
      if (!activeSlot?.wiki_entry_id) return 0;
      const { count } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("id", { count: "exact", head: true })
        .eq("wiki_entry_id", activeSlot.wiki_entry_id)
        .eq("status", "active");
      return count ?? 0;
    },
    enabled: !!user?.id && !!activeSlot?.wiki_entry_id,
    staleTime: 1000 * 60 * 5,
  });

  // Show red dot only when there's a real alert condition AND not yet seen today
  const hasUnread = useMemo(() => {
    if (!user?.id || !activeSlot?.wiki_entry_id) return false;
    // Only show if 3+ active keywords (trend spike threshold)
    if ((activeKeywordCount ?? 0) < 3) return false;
    const today = new Date().toISOString().slice(0, 10);
    const seen = localStorage.getItem(`ktrenz-daily-news-seen-${user.id}`);
    return seen !== today;
  }, [user?.id, activeSlot?.wiki_entry_id, activeKeywordCount]);

  // Re-evaluate when returning from agent page (focus/visibility change)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const showAgentBadge = user && hasUnread;

  const handleProfileClick = () => {
    if (user) setProfileOpen(true);
    else navigate('/login');
  };

  const tabs = [
    { id: "battle" as const, labelKey: "nav.battle", icon: Flame },
    { id: "discover" as const, labelKey: "nav.discover", icon: Compass },
    { id: "profile" as const, labelKey: "nav.profile", icon: User, isCenter: true },
    { id: "activity" as const, labelKey: "nav.activity", icon: Activity },
    { id: "notifications" as const, labelKey: "nav.notifications", icon: Bell },
  ];

  return (
    <>
      <nav className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-md bg-tabbar-background backdrop-blur-none rounded-full overflow-visible"
        style={{
          transform: 'translate3d(-50%, 0, 0)',
          boxShadow: '0 -4px 24px 0 hsl(220 10% 50% / 0.12), 0 2px 12px 0 hsl(220 10% 50% / 0.08)',
        }}>

        <div className="flex items-center h-16 max-w-md mx-auto">
          {tabs.map((tab) => {
            if (tab.isCenter) {
              // Profile center button
              return (
                <button key={tab.id} onClick={handleProfileClick} className="flex-1 flex items-center justify-center -mt-3 relative">
                   <div className="w-[72px] h-[72px] rounded-full transition-all duration-200 overflow-hidden grid place-items-center bg-black">
                      <img src={profile?.avatar_url || getDefaultAvatar(user?.id)} alt="Profile" className="w-full h-full object-cover" loading="eager" fetchPriority="high" />
                   </div>
                </button>
              );
            }

            const isActive = activeTab === tab.id;
            const Icon = tab.icon!;

            return (
              <button key={tab.id} onClick={() => (tab.id === "battle" ? navigate("/") : tab.id === "discover" ? navigate("/discover") : tab.id === "activity" ? navigate("/dashboard") : tab.id === "notifications" ? navigate("/notifications") : onTabChange(tab.id as V3Tab))}
                className={cn("flex-1 relative flex flex-col items-center justify-center gap-1 transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground/60 hover:text-foreground")}>
                <Icon className={cn("w-[22px] h-[22px] transition-transform duration-200", isActive && "scale-110")} />
                <span className={cn("text-[10px] font-medium transition-all", isActive && "font-semibold")}>{t(tab.labelKey)}</span>
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
