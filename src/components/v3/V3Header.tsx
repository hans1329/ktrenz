import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";
import ktrenzMobileLogo from "@/assets/logo-ko-mobile.webp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  image_url: string | null;
  schema_type: string;
}

const V3Header = ({ centerSlot }: { centerSlot?: React.ReactNode }) => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) inputRef.current.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]);
      }
    };
    if (isSearchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          // Search wiki_entries by title/slug
          const { data: wikiData } = await supabase
            .from("wiki_entries")
            .select("id, title, slug, image_url, schema_type")
            .or(`title.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`)
            .in("schema_type", ["artist", "member"] as const)
            .limit(8);

          // Also search v3_artist_tiers by name_ko / display_name
          const { data: tierData } = await (supabase as any)
            .from("v3_artist_tiers")
            .select("wiki_entry_id, display_name, name_ko, wiki_entries:wiki_entry_id(id, title, slug, image_url, schema_type)")
            .or(`name_ko.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
            .limit(8);

          const resultMap = new Map<string, SearchResult>();
          (wikiData || []).forEach((r: SearchResult) => resultMap.set(r.id, r));
          (tierData || []).forEach((t: any) => {
            if (t.wiki_entries && !resultMap.has(t.wiki_entries.id)) {
              resultMap.set(t.wiki_entries.id, t.wiki_entries);
            }
          });
          setSearchResults(Array.from(resultMap.values()).slice(0, 8));
        } catch (err) { console.error("Search error:", err); }
        finally { setIsSearching(false); }
      } else { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (slug: string) => {
    navigate(`/artist/${slug}`);
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]);
  };

  const handleSearchClose = () => {
    setIsSearchOpen(false); setSearchQuery(""); setSearchResults([]);
  };

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
      <div className="relative flex items-center justify-between h-14 px-4 max-w-screen-lg mx-auto">
        {isSearchOpen ? (
          <div ref={searchContainerRef} className="flex-1 flex items-center gap-2 relative">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input ref={inputRef} type="text" placeholder={t("search.placeholder")}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 h-10 bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-primary" />
              {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
            </div>
            <Button variant="ghost" size="icon" onClick={handleSearchClose} className="w-10 h-10 rounded-full shrink-0">
              <X className="w-5 h-5 text-muted-foreground" />
            </Button>
            {(searchResults.length > 0 || (searchQuery.length >= 2 && !isSearching)) && (
              <div className="absolute top-full left-0 right-10 mt-2 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
                {searchResults.length > 0 ? searchResults.map((result) => (
                  <button key={result.id} onClick={() => handleResultClick(result.slug)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left">
                    <Avatar className="w-10 h-10 rounded-lg shrink-0">
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
          <>
            <Link to="/" className="flex items-center shrink-0">
              <img
                src={isMobile ? ktrenzMobileLogo : ktrenzLogo}
                alt="K-TRENZ"
                className={isMobile ? "h-6 w-auto rounded-md" : "h-6 w-auto"}
                fetchPriority="high"
                decoding="async"
              />
            </Link>
            {centerSlot && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">{centerSlot}</div>}
            <div className="flex items-center gap-1 shrink-0">
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
