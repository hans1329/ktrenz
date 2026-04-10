import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TrendingUp, Bot, Activity, Bell, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/LanguageContext";
import LanguagePickerDrawer from "@/components/LanguagePickerDrawer";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import ktrenzLogo from "@/assets/logo_col3.webp";
import type { V3Tab } from "@/components/v3/V3TabBar";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  schema_type: string;
}

interface KeywordResult {
  id: string;
  keyword: string;
  keyword_ko: string | null;
  artist_name: string;
  keyword_category: string;
  star_id: string | null;
}

const navItems: { id: V3Tab | "myActivity"; titleKey: string; icon: typeof TrendingUp }[] = [
  { id: "rankings", titleKey: "nav.trendz", icon: TrendingUp },
  { id: "agent", titleKey: "nav.fanAgent", icon: Bot },
  { id: "myActivity", titleKey: "nav.myActivity", icon: Activity },
];

interface V3DesktopHeaderProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const SPOTIFY_GOAL = 9000;

const SpotifyGoalBarDesktop = () => {
  const { kPoints } = useAuth();
  const navigate = useNavigate();
  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);

  return (
    <button
      onClick={() => navigate("/kpass")}
      className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-muted/50 transition-colors"
      title={`${kPoints.toLocaleString()} / ${SPOTIFY_GOAL.toLocaleString()} K`}
    >
      <span className="text-xs font-medium text-muted-foreground">🎧</span>
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            backgroundColor: "hsl(142, 71%, 45%)",
          }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {kPoints.toLocaleString()} / {SPOTIFY_GOAL.toLocaleString()}
      </span>
    </button>
  );
};

const V3DesktopHeader = ({ activeTab, onTabChange }: V3DesktopHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { t, language } = useLanguage();
  const [showLangDrawer, setShowLangDrawer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Auto-open profile drawer when navigating back from settings/kpass
  useEffect(() => {
    if ((location.state as any)?.openProfile) {
      setProfileOpen(true);
      window.history.replaceState({}, "");
    }
  }, [location.state]);



  // Check for unread daily news notification (red dot)
  const { data: watchedArtists } = useQuery({
    queryKey: ["ktrenz-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });
  const hasAlertOn = (watchedArtists?.length ?? 0) > 0;

  const hasUnread = useMemo(() => {
    if (!user?.id) return false;
    if (hasAlertOn) {
      const today = new Date().toISOString().slice(0, 10);
      const seen = localStorage.getItem(`ktrenz-daily-news-seen-${user.id}`);
      return seen !== today;
    }
    return false;
  }, [user?.id, hasAlertOn]);

  const [, forceUpdateDesktop] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdateDesktop(n => n + 1);
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const showAgentBadge = user && hasUnread;

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); setKeywordResults([]); return; }
    setIsSearching(true);
    const q = query.trim();
    const qNoSpace = q.replace(/\s+/g, "");
    const starFilter = q === qNoSpace
      ? `display_name.ilike.%${q}%,name_ko.ilike.%${q}%`
      : `display_name.ilike.%${q}%,name_ko.ilike.%${q}%,display_name.ilike.%${qNoSpace}%,name_ko.ilike.%${qNoSpace}%`;
    try {
      const { data: starsData } = await (supabase as any)
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, wiki_entry_id, star_type, image_url")
        .eq("is_active", true)
        .or(starFilter)
        .limit(10);

      const { data: kwData } = await (supabase as any)
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_ko, artist_name, keyword_category, star_id")
        .eq("status", "active")
        .or(`keyword.ilike.%${q}%,keyword_ko.ilike.%${q}%,keyword_en.ilike.%${q}%`)
        .order("detected_at", { ascending: false })
        .limit(8);

      const stars = starsData ?? [];
      const kws = kwData ?? [];

      const results: any[] = stars.map((s: any) => ({
        id: s.id, title: s.display_name, slug: s.id,
        image_url: s.image_url ?? null,
        schema_type: s.star_type === "group" ? "artist" : "member",
        starId: s.id,
      }));
      setSearchResults(results.slice(0, 8));

      const seenKw = new Set<string>();
      const uniqueKw: KeywordResult[] = [];
      for (const kw of kwData as KeywordResult[]) {
        const key = `${kw.keyword}-${kw.artist_name}`;
        if (!seenKw.has(key)) { seenKw.add(key); uniqueKw.push(kw); }
      }
      setKeywordResults(uniqueKw.slice(0, 6));
    } catch (err) { console.error("Search error:", err); }
    finally { setIsSearching(false); }
  };

  const handleResultClick = (result: any) => {
    navigate(result.starId ? `/t2/artist/${result.starId}` : `/t2/artist/${result.id}`);
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
  };

  const handleKeywordClick = (kw: KeywordResult) => {
    navigate(`/t2/${kw.id}`);
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
  };

  const hasResults = searchResults.length > 0 || keywordResults.length > 0;

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between h-16 px-6 w-full">
          {/* Left: Logo */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center">
              <img src={ktrenzLogo} alt="K-TRENZ" className="h-3.5 w-auto" loading="eager" fetchPriority="high" decoding="async" />
            </Link>
          </div>

          {/* Center: Tab buttons */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card rounded-full p-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => item.id === "agent" ? navigate("/agent") : item.id === "myActivity" ? navigate("/dashboard") : onTabChange(item.id)}
                  className={cn(
                    "relative flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(item.titleKey)}</span>
                  {item.id === "agent" && showAgentBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Search + Lang + Profile */}
          <div className="flex items-center gap-3">
            {/* Spotify Goal Bar */}
            <SpotifyGoalBarDesktop />

            {/* Language */}
            <Button
              variant="ghost"
              size="icon"
              className="w-9 h-9 rounded-full"
              onClick={() => setShowLangDrawer(true)}
            >
              <Globe className="w-4 h-4" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} className="w-9 h-9 rounded-full">
              <Bell className="w-4 h-4" />
            </Button>

            {/* Profile / Sign In */}
            {user ? (
              <button onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted transition-colors">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback delayMs={600} className="bg-primary/10 text-primary text-sm font-medium">
                    {profile?.username?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            ) : (
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={() => window.location.href = '/login'}>
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>
      <V2ProfileOverlay open={profileOpen} onOpenChange={setProfileOpen} />
      <LanguagePickerDrawer open={showLangDrawer} onOpenChange={setShowLangDrawer} />
    </>
  );
};

export default V3DesktopHeader;
