import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronRight, Settings, Coins, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import KPointsPurchaseDrawer from "@/components/v3/KPointsPurchaseDrawer";
import LanguagePickerDrawer from "@/components/LanguagePickerDrawer";
import ProfileTrendBets from "@/components/v3/ProfileTrendBets";
import ProfileDailyMissions from "@/components/v3/ProfileDailyMissions";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface V2ProfileOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const V2ProfileOverlay = ({ open, onOpenChange }: V2ProfileOverlayProps) => {
  const { user, profile, signOut, kPoints } = useAuth();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const [showPointsDrawer, setShowPointsDrawer] = useState(false);
  const [showLangDrawer, setShowLangDrawer] = useState(false);
  

  const { data: kpassInfo, refetch: refetchKpass } = useQuery({
    queryKey: ["kpass-current", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: sub } = await supabase
        .from("kpass_subscriptions")
        .select("tier_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub) return null;
      const { data: tier } = await supabase
        .from("kpass_tiers")
        .select("name, name_ko, icon, color")
        .eq("id", sub.tier_id)
        .single();
      return tier;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const queryClient = useQueryClient();

  // Refetch kpass + trend bets data when drawer opens
  useEffect(() => {
    if (open && user?.id) {
      refetchKpass();
      queryClient.invalidateQueries({ queryKey: ["profile-trend-bets", user.id] });
    }
  }, [open]);



  if (!user) return null;

  const tierName = kpassInfo?.name || "Free";
  const tierIcon = kpassInfo?.icon || "🎵";

  // Tier-based gradient palettes
  const tierGradients: Record<string, { top: string; bottom: string; glow: string; accent: string; label: string; badge: string; badgeBorder: string; badgeText: string }> = {
    Free: {
      top: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(59,130,246,0.25), rgba(6,182,212,0.2))',
      bottom: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2), rgba(6,182,212,0.18))',
      glow: '0 0 24px 4px rgba(139,92,246,0.15), 0 0 48px 8px rgba(59,130,246,0.08)',
      accent: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(59,130,246,0.5))',
      label: 'linear-gradient(90deg, #a78bfa, #60a5fa, #22d3ee)',
      badge: 'linear-gradient(90deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
      badgeBorder: 'rgba(139,92,246,0.3)',
      badgeText: '#a78bfa',
    },
    Basic: {
      top: 'linear-gradient(135deg, rgba(56,189,248,0.45), rgba(34,211,238,0.35), rgba(52,211,153,0.3))',
      bottom: 'linear-gradient(135deg, rgba(56,189,248,0.35), rgba(34,211,238,0.28), rgba(52,211,153,0.25))',
      glow: '0 0 24px 4px rgba(56,189,248,0.2), 0 0 48px 8px rgba(34,211,238,0.1)',
      accent: 'linear-gradient(135deg, rgba(56,189,248,0.6), rgba(34,211,238,0.6))',
      label: 'linear-gradient(90deg, #38bdf8, #22d3ee, #34d399)',
      badge: 'linear-gradient(90deg, rgba(56,189,248,0.2), rgba(34,211,238,0.2))',
      badgeBorder: 'rgba(56,189,248,0.4)',
      badgeText: '#38bdf8',
    },
  };
  const g = tierGradients[tierName] || tierGradients.Free;

  return (
    <>
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background border-border mx-auto md:max-w-md max-h-[80dvh] overflow-hidden">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="sr-only">Profile</DrawerTitle>
        </DrawerHeader>

        <div className="px-5 pb-6 space-y-5 overflow-y-auto">
          {/* Profile */}
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12 border-2 border-border">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                {profile?.username?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground truncate">
                {profile?.display_name || profile?.username || "User"}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                @{profile?.username || "user"}
              </p>
            </div>
          </div>

          {/* K-Tokens + K-Pass row with ticket styling */}
          <div className="flex gap-2">
            {/* K·Trend Caches */}
            <button
              onClick={() => setShowPointsDrawer(true)}
              className="basis-1/2 min-w-0 rounded-xl bg-card border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">💎</div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    K·Trend Caches
                  </p>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>
            </button>

            {/* K-Pass ticket mini */}
            <button
              onClick={() => { onOpenChange(false); navigate("/k-pass", { state: { fromProfile: true } }); }}
              className="flex-1 rounded-xl overflow-hidden transition-all text-left group"
            >
              {/* Top */}
              <div className="relative px-3 py-2.5" style={{ background: g.top }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: g.accent }}>
                    <span className="text-foreground">{tierIcon}</span>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em]"
                      style={{ background: g.label, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      K-Pass
                    </p>
                    <p className="text-sm font-bold text-foreground leading-tight">{tierName}</p>
                  </div>
                </div>
              </div>
              {/* Perforation + bottom */}
              <div className="relative h-0 flex items-center overflow-visible">
                <div className="absolute -left-1.5 w-3 h-3 rounded-full z-10" style={{ backgroundColor: 'hsl(var(--background))' }} />
                <div className="w-full border-t border-dashed border-border/60 mx-2" />
                <div className="absolute -right-1.5 w-3 h-3 rounded-full z-10" style={{ backgroundColor: 'hsl(var(--background))' }} />
              </div>
              <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: g.bottom }}>
                <span className="text-[9px] text-muted-foreground">View plans →</span>
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                  style={{ background: g.badge, borderColor: g.badgeBorder, color: g.badgeText }}>
                  {t("common.active")}
                </span>
              </div>
            </button>
          </div>

          {/* Daily Missions */}
          <ProfileDailyMissions onClose={() => onOpenChange(false)} />

          {/* My Trend Bets */}
          <ProfileTrendBets onClose={() => onOpenChange(false)} />


          {/* Menu items */}
          <div className="space-y-0.5 pt-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
              onClick={() => setShowLangDrawer(true)}
            >
              <Globe className="w-4 h-4" /> <span className="text-sm">{t("common.language") || "Language"}</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
              onClick={() => { onOpenChange(false); navigate("/settings", { state: { fromProfile: true } }); }}
            >
              <Settings className="w-4 h-4" /> <span className="text-sm">{t("common.settings")}</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-destructive hover:bg-transparent hover:text-destructive"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" /> <span className="text-sm">{t("common.signOut")}</span>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
    <KPointsPurchaseDrawer open={showPointsDrawer} onOpenChange={setShowPointsDrawer} />
    <LanguagePickerDrawer open={showLangDrawer} onOpenChange={setShowLangDrawer} />



    </>
  );
};

export default V2ProfileOverlay;
