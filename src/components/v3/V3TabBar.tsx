import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Bot, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";

export type V3Tab = "rankings" | "agent";

interface V3TabBarProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const V3TabBar = ({ activeTab, onTabChange }: V3TabBarProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleProfileClick = () => {
    if (user) setProfileOpen(true);
  };

  const tabs = [
    { id: "rankings" as const, label: "Trendz", icon: TrendingUp },
    { id: "profile" as const, label: "Profile", icon: null, isCenter: true },
    { id: "agent" as const, label: "Agent", icon: Bot },
  ];

  return (
    <>
      <nav className="fixed bottom-2 left-3 right-3 z-50 bg-background/95 backdrop-blur-md border border-purple-500/30 rounded-full overflow-visible"
        style={{
          transform: 'translate3d(0,0,0)',
          boxShadow: '0 0 30px 12px rgba(168, 85, 247, 0.15), 0 0 60px 25px rgba(168, 85, 247, 0.08)',
        }}>
        <div className="flex items-center justify-evenly h-16 max-w-md mx-auto">
          {tabs.map((tab) => {
            if (tab.isCenter) {
              return (
                <button key={tab.id} onClick={handleProfileClick} className="flex flex-col items-center justify-center -mt-6">
                  <div className={cn("w-16 h-16 rounded-full border-4 transition-all duration-200 overflow-hidden",
                    profileOpen ? "border-primary shadow-lg shadow-primary/30" : "border-background shadow-md")}>
                    {user ? (
                      <Avatar className="w-full h-full">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                          {profile?.username?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Power className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </button>
              );
            }

            const isActive = activeTab === tab.id;
            const Icon = tab.icon!;

            return (
              <button key={tab.id} onClick={() => onTabChange(tab.id as V3Tab)}
                className={cn("flex flex-col items-center justify-center gap-1 transition-all duration-200",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                <Icon className={cn("w-[22px] h-[22px] transition-transform duration-200", isActive && "scale-110")} />
                <span className={cn("text-[8px] font-medium transition-all", isActive && "font-semibold")}>{tab.label}</span>
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
