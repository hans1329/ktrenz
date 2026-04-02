import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings, Globe, Ticket } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { t, language } = useLanguage();
  const [showPointsDrawer, setShowPointsDrawer] = useState(false);
  const [showLangDrawer, setShowLangDrawer] = useState(false);

  // Prediction tickets
  const { data: ticketInfo, refetch: refetchTickets } = useQuery({
    queryKey: ["prediction-tickets", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("ktrenz_get_prediction_tickets", {
        _user_id: user.id,
      });
      if (error) return null;
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      return parsed as { total: number; used: number; remaining: number };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && user?.id) {
      refetchTickets();
      queryClient.invalidateQueries({ queryKey: ["profile-trend-bets", user.id] });
    }
  }, [open]);

  if (!user) return null;

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

          {/* K-Tokens + Prediction Tickets row */}
          <div className="flex gap-2">
            {/* K·Trend Cashes */}
            <button
              onClick={() => setShowPointsDrawer(true)}
              className="basis-1/2 min-w-0 rounded-xl bg-card border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base p-0.5">💎</div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    K·Trend Cashes
                  </p>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>
            </button>

            {/* Prediction Tickets */}
            {/* Prediction Tickets – ticket stub style */}
            <div className="basis-1/2 min-w-0 rounded-xl overflow-hidden text-left">
              {/* Top half */}
              <div className="relative px-3 py-1.5" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(59,130,246,0.25), rgba(6,182,212,0.2))' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(59,130,246,0.5))' }}>
                      <Ticket className="w-4 h-4 text-foreground" />
                    </div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em]"
                      style={{ background: 'linear-gradient(90deg, #a78bfa, #60a5fa, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      {language === "ko" ? "예측 티켓" : "Prediction Tickets"}
                    </p>
                  </div>
                  <p className="text-lg font-bold" style={{ color: '#ffffff' }}>
                    {ticketInfo ? `${ticketInfo.remaining}/${ticketInfo.total}` : "–"}
                  </p>
                </div>
              </div>
              {/* Perforation */}
              <div className="relative h-0 flex items-center overflow-visible">
                <div className="absolute -left-1.5 w-3 h-3 rounded-full z-10" style={{ backgroundColor: 'hsl(var(--background))' }} />
                <svg className="mx-2 flex-1" height="2" style={{ overflow: 'visible' }}>
                  <line x1="0" y1="1" x2="100%" y2="1" stroke="hsl(220 10% 85%)" strokeWidth="2" strokeDasharray="4 3" />
                </svg>
                <div className="absolute -right-1.5 w-3 h-3 rounded-full z-10" style={{ backgroundColor: 'hsl(var(--background))' }} />
              </div>
              {/* Bottom half */}
              <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.2), rgba(6,182,212,0.18))' }}>
                <span className="text-[9px] text-muted-foreground">
                  {language === "ko" ? "매일 자동 충전" : "Daily refill"}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border"
                  style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))', borderColor: 'rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                  {t("common.active")}
                </span>
              </div>
            </div>
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
