import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, X, ChevronRight } from "lucide-react";

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

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="absolute bottom-20 left-4 right-4 max-w-sm mx-auto bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onOpenChange(false)} className="absolute top-3 right-3 text-muted-foreground">
          <X className="w-5 h-5" />
        </button>

        {/* Profile info */}
        <div className="flex items-center gap-3">
          <Avatar className="w-14 h-14">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg">
              {profile?.username?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-bold text-foreground">{profile?.display_name || profile?.username || "User"}</p>
            <p className="text-sm text-muted-foreground">@{profile?.username || "user"}</p>
          </div>
        </div>

        {/* K-Pass card */}
        <button
          onClick={() => { onOpenChange(false); navigate("/k-pass"); }}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/60 border border-border hover:bg-secondary transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{kpassInfo?.icon || "🎵"}</span>
            <div className="text-left">
              <p className="text-xs text-muted-foreground">K-Pass</p>
              <p className="text-sm font-semibold text-foreground">{kpassInfo?.name || "Free"}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Sign out */}
        <Button variant="outline" className="w-full rounded-full" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
};

export default V2ProfileOverlay;
