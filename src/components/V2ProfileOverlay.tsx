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
              <div className="flex items-center gap-2 mx-0">
                <span className="mx-[10px] text-xl">💎</span>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    K·Cashes
                  </p>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>
            </button>

            {/* Prediction Tickets */}
            <div className="basis-1/2 min-w-0 rounded-xl bg-card border border-border p-3 text-left">
              <div className="flex items-center gap-2">
                <Ticket className="lucide lucide-ticket text-primary mx-[10px] w-[20px] h-[20px]" />
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {language === "ko" ? "예측 티켓" : "Prediction Tickets"}
                  </p>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {ticketInfo ? `${ticketInfo.remaining}/${ticketInfo.total}` : "–"}
                  </p>
                </div>
              </div>
            </div>
          </div>


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
