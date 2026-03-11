import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronRight, Settings, Coins } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import KPointsPurchaseDrawer from "@/components/v3/KPointsPurchaseDrawer";
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

  // Refetch kpass data when drawer opens
  useEffect(() => {
    if (open && user?.id) refetchKpass();
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
      <DrawerContent className="bg-background border-border max-h-[80vh] mx-auto md:max-w-md">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="sr-only">Profile</DrawerTitle>
        </DrawerHeader>

        <div className="px-5 pb-6 space-y-5">
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

          {/* K-Tokens Card */}
          <button
            onClick={() => setShowPointsDrawer(true)}
            className="w-full text-left rounded-xl bg-card border border-border p-4 hover:border-primary/40 hover:bg-primary/5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    K-Tokens
                  </p>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>

          {/* K-Pass Ticket */}
          <button
            onClick={() => { onOpenChange(false); navigate("/k-pass", { state: { fromProfile: true } }); }}
            className="w-full group text-left"
          >
            <div className="relative rounded-xl">
              {/* Top half */}
              <div
                className="relative px-4 py-3.5 overflow-hidden rounded-t-xl"
                style={{ background: g.top }}
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full blur-2xl opacity-30"
                  style={{ background: g.accent }} />
                <div className="absolute -left-6 -bottom-6 w-20 h-20 rounded-full blur-2xl opacity-20"
                  style={{ background: g.accent }} />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ background: g.accent }}
                    >
                      <span className="text-foreground">{tierIcon}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                        style={{ background: g.label, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        K-Pass
                      </p>
                      <p className="text-base font-bold text-foreground leading-tight">
                        {tierName}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              {/* Perforation */}
              <div className="relative h-0 flex items-center overflow-visible">
                <div className="absolute -left-2.5 w-5 h-5 rounded-full z-10" style={{ boxShadow: '0 0 0 4px hsl(var(--background))', backgroundColor: 'hsl(var(--background))' }} />
                <div className="w-full border-t border-dashed border-border/60 mx-4" />
                <div className="absolute -right-2.5 w-5 h-5 rounded-full z-10" style={{ boxShadow: '0 0 0 4px hsl(var(--background))', backgroundColor: 'hsl(var(--background))' }} />
              </div>

              {/* Bottom half */}
              <div className="px-4 py-3.5 flex items-center justify-between rounded-b-xl"
                style={{ background: g.bottom }}>
                <p className="text-xs text-muted-foreground">
                  View plans & upgrade →
                </p>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border"
                  style={{
                    background: g.badge,
                    borderColor: g.badgeBorder,
                    color: g.badgeText,
                  }}
                >
                  Active
                </span>
              </div>
            </div>
          </button>




          {/* Menu items */}
          <div className="space-y-0.5 pt-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => { onOpenChange(false); navigate("/settings", { state: { fromProfile: true } }); }}
            >
              <Settings className="w-4 h-4" /> <span className="text-sm">{t("common.settings")}</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-destructive hover:text-destructive"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" /> <span className="text-sm">{t("common.signOut")}</span>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
    <KPointsPurchaseDrawer open={showPointsDrawer} onOpenChange={setShowPointsDrawer} />



    </>
  );
};

export default V2ProfileOverlay;
