import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ChevronRight, Settings } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";

interface V2ProfileOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const V2ProfileOverlay = ({ open, onOpenChange }: V2ProfileOverlayProps) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

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

  if (!user) return null;

  const tierName = kpassInfo?.name || "Free";
  const tierIcon = kpassInfo?.icon || "🎵";
  const tierColor = kpassInfo?.color || "#94a3b8";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background border-border max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="sr-only">Profile</DrawerTitle>
        </DrawerHeader>

        <div className="px-5 pb-6 space-y-5">
          {/* Profile info */}
          <div className="flex items-center gap-3">
            <Avatar className="w-14 h-14 border-2 border-border">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
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

          {/* K-Pass Ticket */}
          <button
            onClick={() => { onOpenChange(false); navigate("/k-pass"); }}
            className="w-full group"
          >
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
              {/* Ticket top section */}
              <div
                className="relative px-5 py-4"
                style={{
                  background: `linear-gradient(135deg, ${tierColor}18, ${tierColor}08)`,
                }}
              >
                {/* Decorative circles */}
                <div
                  className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10"
                  style={{ background: tierColor }}
                />
                <div
                  className="absolute right-8 bottom-0 w-12 h-12 rounded-full opacity-5"
                  style={{ background: tierColor }}
                />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{tierIcon}</span>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                        K-Pass
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        {tierName}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>

              {/* Ticket perforation line */}
              <div className="relative flex items-center">
                <div
                  className="absolute -left-3 w-6 h-6 rounded-full bg-background"
                />
                <div className="flex-1 border-t border-dashed border-border mx-4" />
                <div
                  className="absolute -right-3 w-6 h-6 rounded-full bg-background"
                />
              </div>

              {/* Ticket bottom section */}
              <div className="px-5 py-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Upgrade for premium features
                </p>
                <div
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: tierColor,
                    background: `${tierColor}15`,
                  }}
                >
                  ACTIVE
                </div>
              </div>
            </div>
          </button>

          {/* Actions */}
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => { onOpenChange(false); }}
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-11 rounded-xl text-destructive hover:text-destructive"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Sign Out</span>
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default V2ProfileOverlay;
