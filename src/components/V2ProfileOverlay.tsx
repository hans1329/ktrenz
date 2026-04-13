import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Settings, Globe, Ticket } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

import TicketInfoPopup from "@/components/TicketInfoPopup";
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
  const [showLangDrawer, setShowLangDrawer] = useState(false);
  const [showTicketInfo, setShowTicketInfo] = useState(false);

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
              <div className="flex items-center gap-2">
                <p className="font-bold text-foreground truncate">
                  {profile?.display_name || profile?.username || "User"}
                </p>
                {(() => {
                  const lvl = getLevelInfo(profile?.total_points ?? 0);
                  const tier = getTierForLevel(lvl.level);
                  const lang = (language === "ko" || language === "ja" || language === "zh") ? language : "en";
                  return (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary leading-none">
                      Lv.{lvl.level} · {tier.tier[lang]}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm text-muted-foreground truncate">
                  @{profile?.username || "user"}
                </p>
              </div>
              {(() => {
                const lvl = getLevelInfo(profile?.total_points ?? 0);
                return (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Progress value={lvl.progress} className="h-1.5 flex-1" />
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {lvl.currentXp}/{lvl.xpForNextLevel}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* K-Tokens + Prediction Tickets row */}
          <div>
            <div className="flex gap-2">
              {/* K·Trend Cashes */}
              <div
                className="basis-1/2 min-w-0 rounded-xl bg-card border border-border p-3 text-left space-y-2"
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  K·Cashes
                </p>
                <div className="flex items-center gap-2">
                  <span className="mx-[10px] text-xl">💎</span>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Prediction Tickets */}
              <button
                onClick={() => setShowTicketInfo(true)}
                className="basis-1/2 min-w-0 rounded-xl bg-card border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-left space-y-2"
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {language === "ko" ? "예측 티켓" : "Prediction Tickets"}
                </p>
                <div className="flex items-center gap-2">
                  <Ticket className="text-primary mx-[10px] w-[20px] h-[20px]" />
                  <p className="text-base font-bold text-foreground leading-tight flex items-center gap-1.5">
                    {ticketInfo ? <>{ticketInfo.remaining}<span className="text-[10px] font-medium text-muted-foreground">/{ticketInfo.total}</span></> : "–"}
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                      (profile?.current_level ?? 1) >= 31
                        ? "bg-amber-500/15 text-amber-600"
                        : (profile?.current_level ?? 1) >= 16
                        ? "bg-violet-500/15 text-violet-500"
                        : (profile?.current_level ?? 1) >= 6
                        ? "bg-blue-500/15 text-blue-500"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {(profile?.current_level ?? 1) >= 31
                        ? (language === "ko" ? "전문가" : "Expert")
                        : (profile?.current_level ?? 1) >= 16
                        ? (language === "ko" ? "분석가" : "Analyst")
                        : (profile?.current_level ?? 1) >= 6
                        ? (language === "ko" ? "탐색가" : "Explorer")
                        : (language === "ko" ? "초보" : "Beginner")}
                    </span>
                  </p>
                </div>
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-right mt-1">
              {language === "ko" ? "등급이 오르면 더 많은 한도가 생겨요!" : "Level up for more tickets!"}
            </p>
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
    
    <TicketInfoPopup open={showTicketInfo} onClose={() => setShowTicketInfo(false)} remaining={ticketInfo?.remaining ?? 0} total={ticketInfo?.total ?? 3} />
    <LanguagePickerDrawer open={showLangDrawer} onOpenChange={setShowLangDrawer} />
    </>
  );
};

export default V2ProfileOverlay;
