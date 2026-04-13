import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Search, X, Loader2, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import T2AdminControls from "@/components/t2/T2AdminControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import ktrenzLogo from "@/assets/logo_nd.webp";
import ktrenzMobileLogo from "@/assets/logo_nd.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";

const SPOTIFY_SVG = (
  <svg viewBox="0 0 24 24" fill="hsl(142, 71%, 45%)"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

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

const SPOTIFY_GOAL = 9000;

const SpotifyGoalPopup = ({ open, onClose, kPoints }: { open: boolean; onClose: () => void; kPoints: number }) => {
  const { language } = useLanguage();
  if (!open) return null;
  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);

  const title = language === "ko" ? "Spotify Premium 1개월" : language === "ja" ? "Spotify Premium 1ヶ月" : language === "zh" ? "Spotify Premium 1个月" : "Spotify Premium 1 Month";
  const redeemText = language === "ko" ? "9,000 K-Cash에 교환 가능" : language === "ja" ? "9,000 K-Cashで交換可能" : language === "zh" ? "9,000 K-Cash可兑换" : "Redeem at 9,000 K-Cash";
  const howText = language === "ko" ? "데일리 미션, 예측, 배틀을 통해 K-Cash를 모으세요. 목표에 도달하면 Spotify Premium 구독 쿠폰을 받을 수 있습니다!" : language === "ja" ? "デイリーミッション、予測、バトルでK-Cashを貯めましょう。目標達成でSpotify Premiumクーポンを獲得！" : language === "zh" ? "通过每日任务、预测和对战赚取K-Cash。达到目标即可兑换Spotify Premium订阅券！" : "Earn K-Cash by completing daily missions, predictions, and battles. Reach the goal to redeem a Spotify Premium subscription coupon!";
  const closeText = language === "ko" ? "닫기" : language === "ja" ? "閉じる" : language === "zh" ? "关闭" : "Close";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed z-[101] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,90vw)] bg-card rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10">{SPOTIFY_SVG}</div>
          <div>
            <p className="font-bold text-foreground text-sm">{title}</p>
            <p className="text-xs text-muted-foreground">{redeemText}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(progress, 2)}%`, backgroundColor: "hsl(142, 71%, 45%)" }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="font-bold text-foreground flex items-center gap-1">💎{kPoints.toLocaleString()}</span>
            <span className="text-muted-foreground">/ {SPOTIFY_GOAL.toLocaleString()} K</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {howText}
        </p>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-muted text-sm font-medium text-foreground hover:bg-muted/80 transition-colors">
          {closeText}
        </button>
      </div>
    </>,
    document.body
  );
};

const SpotifyGoalBar = () => {
  const { kPoints } = useAuth();
  const progress = Math.min((kPoints / SPOTIFY_GOAL) * 100, 100);
  const isFull = progress >= 100;
  const [showPopup, setShowPopup] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="flex items-center gap-1.5 px-0.5 py-1 active:opacity-60 transition-opacity"
      >
        <div className={cn("w-5 h-5 shrink-0", isFull && "animate-[pulse_2s_ease-in-out_infinite]")}>{SPOTIFY_SVG}</div>
        <div className="w-8 h-3.5 rounded-full bg-muted overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 10)}%`, backgroundColor: "hsl(142, 71%, 45%)" }}
          />
          {isFull && (
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white drop-shadow-sm">✓</span>
          )}
        </div>
      </button>
      <SpotifyGoalPopup open={showPopup} onClose={() => setShowPopup(false)} kPoints={kPoints} />
    </>
  );
};

const V3Header = ({ centerSlot, rightSlot }: { centerSlot?: React.ReactNode; rightSlot?: React.ReactNode }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [keywordResults, setKeywordResults] = useState<KeywordResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Check if pipeline is currently running
  const { data: isPipelineRunning } = useQuery({
    queryKey: ["pipeline-running-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_pipeline_state" as any)
        .select("status")
        .in("status", ["running", "postprocess_requested", "postprocess_running"])
        .limit(1);
      return (data as any[])?.length > 0;
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  useEffect(() => {
    if (isSearchOpen && inputRef.current) inputRef.current.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
      }
    };
    if (isSearchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        const q = searchQuery.trim();
        const qNoSpace = q.replace(/\s+/g, "");
        const starFilter = q === qNoSpace
          ? `display_name.ilike.%${q}%,name_ko.ilike.%${q}%`
          : `display_name.ilike.%${q}%,name_ko.ilike.%${q}%,display_name.ilike.%${qNoSpace}%,name_ko.ilike.%${qNoSpace}%`;
        try {
          const { data: starsData, error: starsErr } = await (supabase as any)
            .from("ktrenz_stars")
            .select("id, display_name, name_ko, wiki_entry_id, star_type, image_url")
            .eq("is_active", true)
            .or(starFilter)
            .limit(10);

          const { data: kwData, error: kwErr } = await (supabase as any)
            .from("ktrenz_trend_triggers")
            .select("id, keyword, keyword_ko, artist_name, keyword_category, star_id")
            .eq("status", "active")
            .or(`keyword.ilike.%${q}%,keyword_ko.ilike.%${q}%,keyword_en.ilike.%${q}%`)
            .order("detected_at", { ascending: false })
            .limit(8);

          const stars = starsData ?? [];
          const kws = kwData ?? [];

          // Build search results directly from ktrenz_stars
          const results: (SearchResult & { starId: string })[] = stars.map((s: any) => ({
            id: s.id,
            title: s.display_name,
            slug: s.id,
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
      } else { setSearchResults([]); setKeywordResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult & { starId?: string }) => {
    if (result.starId) {
      navigate(`/t2/artist/${result.starId}`);
    } else {
      // Fallback: try navigating by wiki_entry_id as slug
      navigate(`/t2/artist/${result.id}`);
    }
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
  };

  const handleKeywordClick = (kw: KeywordResult) => {
    navigate(`/t2/${kw.id}`);
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
  };

  const handleSearchClose = () => {
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]); setKeywordResults([]);
  };

  const hasResults = searchResults.length > 0 || keywordResults.length > 0;
  const showDropdown = hasResults || (searchQuery.length >= 2 && !isSearching);

  return (
    <>
      <header
        className="sticky top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] bg-white"
      >
        <div className="relative flex items-center justify-between h-14 px-4 md:max-w-[90%] mx-auto">
          {isSearchOpen ? (
            <div ref={searchContainerRef} className="flex-1 flex items-center gap-2 relative">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder={t("search.placeholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 h-10 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-primary"
                  style={{ backgroundColor: "hsl(var(--muted) / 0.5)" }}
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
              </div>
              <Button variant="ghost" size="icon" onClick={handleSearchClose} className="w-10 h-10 rounded-full shrink-0">
                <X className="w-5 h-5 text-muted-foreground" />
              </Button>
              {showDropdown && (
                <div className="absolute top-full left-0 right-10 mt-2 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-96 overflow-y-auto">
                  {searchResults.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/30">Artists</div>
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => handleResultClick(result)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <Avatar className="w-10 h-10 rounded-lg shrink-0">
                            <AvatarImage src={result.image_url || undefined} className="object-cover" />
                            <AvatarFallback className="rounded-lg text-xs bg-muted">{result.title.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{result.title}</p>
                            <p className="text-xs text-muted-foreground capitalize">{result.schema_type}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {keywordResults.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/30">Keywords</div>
                      {keywordResults.map((kw) => (
                        <button
                          key={kw.id}
                          onClick={() => handleKeywordClick(kw)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Zap className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{kw.keyword_ko || kw.keyword}</p>
                            <p className="text-xs text-muted-foreground truncate">{kw.artist_name} · {kw.keyword_category}</p>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {!hasResults && (
                    <div className="p-4 text-center text-sm text-muted-foreground">{t("search.noResults")}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <Link to="/" className="flex items-center shrink-0">
                <img
                  src={isMobile ? ktrenzMobileLogo : ktrenzLogo}
                  alt="K-TRENZ"
                  className={`${isMobile ? "h-3.5 w-auto" : "h-5 w-auto"} ${isPipelineRunning ? "animate-[pulse_3s_ease-in-out_infinite]" : ""}`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              </Link>
              {centerSlot && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">{centerSlot}</div>}
              <div className="flex items-center gap-2 shrink-0">
                <T2AdminControls />
                <SpotifyGoalBar />
                {rightSlot}
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
};

export default V3Header;
