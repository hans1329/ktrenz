import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Flame, Compass, Activity, Bell, User as UserIcon, Settings, LogOut, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/i18n/translations";
import { getDefaultAvatar } from "@/lib/defaultAvatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";

type NavItem = {
  key: string;
  labelKey: string;
  icon: typeof Flame;
  path: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "battle", labelKey: "nav.battle", icon: Flame, path: "/" },
  { key: "discover", labelKey: "nav.discover", icon: Compass, path: "/discover" },
  { key: "activity", labelKey: "nav.activity", icon: Activity, path: "/dashboard" },
  { key: "notifications", labelKey: "nav.notifications", icon: Bell, path: "/notifications" },
];

const HeaderNavMenu = () => {
  const { user, profile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);

  const avatarUrl = user
    ? profile?.avatar_url || getDefaultAvatar(user.id)
    : null;

  const currentPath = location.pathname;
  const isActive = (path: string) =>
    path === "/" ? currentPath === "/" : currentPath.startsWith(path);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={t("nav.openMenu")}
        >
          {user ? (
            <div className="w-9 h-9 rounded-full overflow-hidden grid place-items-center bg-black ring-1 ring-border">
              <img
                src={avatarUrl!}
                alt="Profile"
                className="w-full h-full object-cover"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full grid place-items-center bg-muted">
              <UserIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-56 rounded-2xl"
        >
          {user ? (
            <>
              <DropdownMenuLabel className="flex items-center gap-2 py-2">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-black shrink-0">
                  <img src={avatarUrl!} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {profile?.display_name || user.email?.split("@")[0] || t("nav.profile")}
                  </p>
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("common.viewProfile")}
                  </button>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : (
            <DropdownMenuItem onClick={() => navigate("/login")} className="gap-2 py-2.5 cursor-pointer">
              <LogIn className="w-4 h-4" />
              <span>{t("common.signIn")}</span>
            </DropdownMenuItem>
          )}

          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={item.key}
                onClick={() => navigate(item.path)}
                className={cn(
                  "gap-2 py-2.5 cursor-pointer",
                  active && "bg-primary/10 text-primary focus:bg-primary/15 focus:text-primary"
                )}
              >
                <Icon className={cn("w-4 h-4", active && "text-primary")} />
                <span className="flex-1">{t(item.labelKey)}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground py-1 font-semibold">
            {t("common.language")}
          </DropdownMenuLabel>
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-md transition-colors",
                  language === lang.code
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="text-base leading-none">{lang.flag}</span>
                <span className="text-[10px] font-bold">{lang.label}</span>
              </button>
            ))}
          </div>

          {user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                className={cn(
                  "gap-2 py-2.5 cursor-pointer",
                  isActive("/settings") && "bg-primary/10 text-primary"
                )}
              >
                <Settings className="w-4 h-4" />
                <span>{t("common.settings")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="gap-2 py-2.5 cursor-pointer text-muted-foreground">
                <LogOut className="w-4 h-4" />
                <span>{t("common.signOut")}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <V2ProfileOverlay open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
};

export default HeaderNavMenu;
