import { useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Bot, PanelLeftClose, PanelLeftOpen, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import type { V3Tab } from "@/components/v3/V3TabBar";

const v3NavItems: { id: V3Tab; title: string; icon: typeof TrendingUp }[] = [
  { id: "rankings", title: "Trendz", icon: TrendingUp },
  { id: "agent", title: "Fan Agent", icon: Bot },
];

interface V3SidebarProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const V3Sidebar = ({ activeTab, onTabChange }: V3SidebarProps) => {
  const { state, toggleSidebar } = useSidebar();
  const { user, profile } = useAuth();
  const collapsed = state === "collapsed";
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <Sidebar className={cn("border-r border-border bg-background transition-all duration-300", collapsed ? "w-16" : "w-64")} collapsible="icon">
        <SidebarHeader className={cn("h-[68px] border-b border-border justify-center", collapsed ? "px-2" : "px-4")}>
          <Link to="/" className={cn("flex items-center", collapsed && "justify-center")}>
            {collapsed ? (
              <img src="https://auth.k-trendz.com/storage/v1/object/public/brand_assets/logo_m.png" alt="KTRENDZ" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <img src="https://jguylowswwgjvotdcsfj.supabase.co/storage/v1/object/public/brand_assets/logo_l.webp" alt="KTRENDZ" className="h-7 w-auto" />
            )}
          </Link>
        </SidebarHeader>

        <SidebarContent className={cn("py-4", collapsed ? "px-0" : "px-2")}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {v3NavItems.map((item) => {
                  const active = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild>
                        <button onClick={() => onTabChange(item.id)}
                          className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-full",
                            collapsed && "justify-center px-0",
                            active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                          <Icon className="w-5 h-5 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <div className="px-3 pt-2">
          <button onClick={() => toggleSidebar()}
            className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full", collapsed && "justify-center")}>
            {collapsed ? <PanelLeftOpen className="w-5 h-5 shrink-0" /> : <PanelLeftClose className="w-5 h-5 shrink-0" />}
            {!collapsed && <span className="text-sm">Collapse</span>}
          </button>
        </div>

        <SidebarFooter className="p-3 border-t border-border">
          {user ? (
            <button onClick={() => setProfileOpen(true)}
              className={cn("flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors w-full text-left", collapsed && "justify-center")}>
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {profile?.username?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile?.display_name || profile?.username || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">@{profile?.username || "user"}</p>
                </div>
              )}
              {!collapsed && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          ) : (
          <Button variant="default" className={cn("w-full rounded-full", collapsed ? "px-2" : "")} onClick={() => window.location.href = '/login'}>
              {collapsed ? <TrendingUp className="w-4 h-4" /> : "Sign In"}
            </Button>
          )}
        </SidebarFooter>
      </Sidebar>
      <V2ProfileOverlay open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};

export default V3Sidebar;
