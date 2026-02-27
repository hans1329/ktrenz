import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TrendingUp, Bot, Search, X, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import V2ProfileOverlay from "@/components/V2ProfileOverlay";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";
import type { V3Tab } from "@/components/v3/V3TabBar";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  schema_type: string;
}

const navItems: { id: V3Tab; titleKey: string; icon: typeof TrendingUp }[] = [
  { id: "rankings", titleKey: "nav.trendz", icon: TrendingUp },
  { id: "agent", titleKey: "nav.fanAgent", icon: Bot },
];

interface V3DesktopHeaderProps {
  activeTab: V3Tab;
  onTabChange: (tab: V3Tab) => void;
}

const V3DesktopHeader = ({ activeTab, onTabChange }: V3DesktopHeaderProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 관심 아티스트 유무 체크
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
  const showAgentBadge = user && (watchedArtists?.length ?? 0) === 0;

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("wiki_entries")
        .select("id, title, slug, image_url, schema_type")
        .or(`title.ilike.%${query}%,slug.ilike.%${query}%`)
        .in("schema_type", ["artist", "member"] as const)
        .limit(8);
      if (!error && data) setSearchResults(data);
    } catch (err) { console.error("Search error:", err); }
    finally { setIsSearching(false); }
  };

  const handleResultClick = (slug: string) => {
    navigate(`/artist/${slug}`);
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]);
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center justify-between h-16 px-6 w-full">
          {/* Left: Logo */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center">
              <img src={ktrenzLogo} alt="K-TRENZ" className="h-5 w-auto" loading="eager" fetchPriority="high" decoding="async" />
            </Link>
          </div>

          {/* Center: Tab buttons */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-muted/50 rounded-full p-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => item.id === "agent" ? navigate("/agent") : onTabChange(item.id)}
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
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Search + Lang + Profile */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              {isSearchOpen ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      type="text"
                      placeholder={t("search.placeholder")}
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="pl-9 pr-4 h-9 w-64 bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); }} className="w-8 h-8 rounded-full">
                    <X className="w-4 h-4" />
                  </Button>
                  {(searchResults.length > 0 || (searchQuery.length >= 2 && !isSearching)) && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                      {searchResults.length > 0 ? searchResults.map((result) => (
                        <button key={result.id} onClick={() => handleResultClick(result.slug)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                          <Avatar className="w-9 h-9 rounded-lg shrink-0">
                            <AvatarImage src={result.image_url || undefined} className="object-cover" />
                            <AvatarFallback className="rounded-lg text-xs bg-muted">{result.title.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{result.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{result.schema_type}</p>
                          </div>
                        </button>
                      )) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">{t("search.noResults")}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setIsSearchOpen(true)} className="w-9 h-9 rounded-full">
                  <Search className="w-4 h-4" />
                </Button>
              )}
            </div>

            <LanguageSwitcher />

            {/* Profile / Sign In */}
            {user ? (
              <button onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted transition-colors">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
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
    </>
  );
};

export default V3DesktopHeader;
