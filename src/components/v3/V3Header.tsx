import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X, Loader2, Zap } from "lucide-react";
import T2AdminControls from "@/components/t2/T2AdminControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import ktrenzLogo from "@/assets/logo_col3.webp";
import ktrenzMobileLogo from "@/assets/logo_col3.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";

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
          const starsPromise = (supabase as any)
            .from("ktrenz_stars")
            .select("id, display_name, name_ko, wiki_entry_id, is_group")
            .eq("is_active", true)
            .or(starFilter)
            .limit(10)
            .then((r: any) => r.data || [])
            .then((d: any) => d, () => [] as any[]);

          const kwPromise = (supabase as any)
            .from("ktrenz_trend_triggers")
            .select("id, keyword, keyword_ko, artist_name, keyword_category, star_id")
            .eq("status", "active")
            .or(`keyword.ilike.%${q}%,keyword_ko.ilike.%${q}%,keyword_en.ilike.%${q}%`)
            .order("detected_at", { ascending: false })
            .limit(8)
            .then((r: any) => r.data || [])
            .then((d: any) => d, () => [] as any[]);

          const [starsData, kwData] = await Promise.all([starsPromise, kwPromise]);

          // Build search results directly from ktrenz_stars
          const results: (SearchResult & { starId: string })[] = [];
          for (const s of starsData) {
            // Fetch image from wiki_entries if available
            let imageUrl: string | null = null;
            if (s.wiki_entry_id) {
              const { data: entry } = await supabase
                .from("wiki_entries")
                .select("image_url")
                .eq("id", s.wiki_entry_id)
                .maybeSingle();
              imageUrl = (entry as any)?.image_url ?? null;
            }
            results.push({
              id: s.id,
              title: s.display_name,
              slug: s.id,
              image_url: imageUrl,
              schema_type: s.is_group ? "artist" : "member",
              starId: s.id,
            });
          }
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
        className="sticky top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)]"
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
                {rightSlot}
                <button className="p-1 active:opacity-60 transition-opacity" onClick={() => setIsSearchOpen(true)}>
                  <Search className="w-5 h-5 text-foreground/80" />
                </button>
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
};

export default V3Header;
