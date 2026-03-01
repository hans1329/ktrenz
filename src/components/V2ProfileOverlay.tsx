import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronRight, Settings, Coins } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
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
  const { t } = useLanguage();

  const { data: kpassInfo } = useQuery({
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

  const { data: dailyLoginPoints } = useQuery({
    queryKey: ["daily-login-points-setting"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_point_settings" as any)
        .select("points")
        .eq("reward_type", "daily_login")
        .eq("is_enabled", true)
        .maybeSingle();
      return (data as any)?.points ?? 10;
    },
    staleTime: 1000 * 60 * 30,
  });

  if (!user) return null;

  const tierName = kpassInfo?.name || "Free";
  const tierIcon = kpassInfo?.icon || "🎵";
  const tierColor = "#0ABAB5";

  return (
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

          {/* K-Points Card */}
          <div className="rounded-xl bg-card border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    K-Points
                  </p>
                  <p className="text-lg font-bold text-foreground leading-tight">
                    {kPoints.toLocaleString()}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                매일 로그인 +{dailyLoginPoints ?? 10}
              </span>
            </div>
          </div>

          {/* K-Pass Ticket */}
          <button
            onClick={() => { onOpenChange(false); navigate("/k-pass"); }}
            className="w-full group text-left"
          >
            <div className="relative rounded-xl overflow-hidden bg-card" style={{ boxShadow: `0 0 20px 2px ${tierColor}15, 0 0 40px 4px ${tierColor}08` }}>
              {/* Top half */}
              <div
                className="relative px-4 py-3.5 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${tierColor}35, ${tierColor}15)` }}
              >
                <div
                  className="absolute -right-4 -top-4 w-20 h-20 rounded-full blur-xl opacity-20"
                  style={{ background: tierColor }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ background: 'hsl(0 0% 45%)' }}
                    >
                      <span className="text-foreground">{tierIcon}</span>
                    </div>
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                        style={{ color: tierColor }}
                      >
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
              <div className="relative h-0 flex items-center">
                <div className="absolute -left-2.5 w-5 h-5 rounded-full bg-card z-10" />
                <div className="w-full border-t border-dashed border-border/60 mx-4" />
                <div className="absolute -right-2.5 w-5 h-5 rounded-full bg-card z-10" />
              </div>

              {/* Bottom half */}
              <div className="px-4 py-3.5 flex items-center justify-between" style={{ background: `${tierColor}18` }}>
                <p className="text-xs text-muted-foreground">
                  View plans & upgrade →
                </p>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border"
                  style={{
                    color: tierColor,
                    borderColor: `${tierColor}30`,
                    background: `${tierColor}08`,
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
              onClick={() => onOpenChange(false)}
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
  );
};

export default V2ProfileOverlay;
