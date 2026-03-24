import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, Check, Star, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface ArtistOnboardingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requireMinOne?: boolean;
}

interface StarItem {
  id: string;
  wiki_entry_id: string;
  display_name: string;
  name_ko: string | null;
  image_url: string | null;
  contentImageUrl: string | null;
  agency: string | null;
  star_type: string;
  trendCount?: number;
}

const ArtistOnboardingDrawer = ({ open, onOpenChange, requireMinOne = true }: ArtistOnboardingDrawerProps) => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Fetch all active stars with wiki_entries images as fallback
  const { data: stars, isLoading: starsLoading } = useQuery({
    queryKey: ["onboarding-stars"],
    queryFn: async () => {
      const { data: starsData } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id, display_name, name_ko, image_url, agency, star_type, group_star_id")
        .eq("is_active", true)
        .order("display_name");

      const starsList = (starsData ?? []) as any[];

      // Collect wiki_entry_ids and group_star_ids for image fallback
      const wikiIds = new Set<string>();
      const groupStarIds = new Set<string>();
      starsList.forEach((s) => {
        if (s.wiki_entry_id) wikiIds.add(s.wiki_entry_id);
        if (s.group_star_id) groupStarIds.add(s.group_star_id);
      });

      // Fetch wiki_entries images
      const imageMap = new Map<string, string>();
      if (wikiIds.size > 0) {
        const { data: wikiEntries } = await supabase
          .from("wiki_entries")
          .select("id, image_url")
          .in("id", Array.from(wikiIds));
        (wikiEntries ?? []).forEach((w: any) => {
          if (w.image_url) imageMap.set(w.id, w.image_url);
        });
      }

      // Fetch group stars' wiki_entry_ids for fallback
      const groupWikiMap = new Map<string, string>();
      if (groupStarIds.size > 0) {
        const { data: groupStars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, wiki_entry_id")
          .in("id", Array.from(groupStarIds));
        (groupStars ?? []).forEach((g: any) => {
          if (g.wiki_entry_id) {
            groupWikiMap.set(g.id, g.wiki_entry_id);
          }
        });
        // Fetch group wiki images if not already fetched
        const missingWikiIds = Array.from(groupWikiMap.values()).filter((id) => !imageMap.has(id));
        if (missingWikiIds.length > 0) {
          const { data: groupWiki } = await supabase
            .from("wiki_entries")
            .select("id, image_url")
            .in("id", missingWikiIds);
          (groupWiki ?? []).forEach((w: any) => {
            if (w.image_url) imageMap.set(w.id, w.image_url);
          });
        }
      }

      // Count active triggers per star & grab latest content image per star
      const { data: triggerData } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("star_id, source_image_url")
        .eq("status", "active")
        .not("star_id", "is", null)
        .order("detected_at", { ascending: false });

      const countMap = new Map<string, number>();
      const contentImageMap = new Map<string, string>();
      ((triggerData ?? []) as any[]).forEach((t) => {
        countMap.set(t.star_id, (countMap.get(t.star_id) || 0) + 1);
        if (t.source_image_url && !contentImageMap.has(t.star_id)) {
          contentImageMap.set(t.star_id, t.source_image_url);
        }
      });

      return starsList.map((s): StarItem => {
        const ownImage = s.wiki_entry_id ? imageMap.get(s.wiki_entry_id) : null;
        const groupWikiId = s.group_star_id ? groupWikiMap.get(s.group_star_id) : null;
        const groupImage = groupWikiId ? imageMap.get(groupWikiId) : null;
        const directImage = s.image_url && s.image_url !== "" ? s.image_url : null;

        const contentImage = contentImageMap.get(s.id) || null;
        return {
          id: s.id,
          wiki_entry_id: s.wiki_entry_id,
          display_name: s.display_name,
          name_ko: s.name_ko,
          image_url: ownImage || directImage || groupImage || contentImage || null,
          contentImageUrl: contentImage,
          agency: s.agency,
          star_type: s.star_type,
          trendCount: countMap.get(s.id) || 0,
        };
      });
    },
    enabled: open,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch already watched artists
  const { data: watchedIds } = useQuery({
    queryKey: ["onboarding-watched", user?.id],
    queryFn: async () => {
      if (!user?.id) return new Set<string>();
      const { data } = await supabase
        .from("ktrenz_watched_artists" as any)
        .select("wiki_entry_id")
        .eq("user_id", user.id);
      return new Set((data ?? []).map((d: any) => d.wiki_entry_id as string));
    },
    enabled: open && !!user?.id,
  });

  useEffect(() => {
    if (watchedIds && watchedIds.size > 0) {
      setSelected(new Set(watchedIds));
    }
  }, [watchedIds]);

  // Popular: groups first (star_type=group), then solo, sorted by active trend count
  const popular = useMemo(() => {
    if (!stars) return [];
    // Prioritize groups with trends, then individuals with trends
    return [...stars]
      .sort((a, b) => {
        // Groups first
        const aGroup = a.star_type === "group" ? 1 : 0;
        const bGroup = b.star_type === "group" ? 1 : 0;
        if (bGroup !== aGroup) return bGroup - aGroup;
        // Then by trend count
        return (b.trendCount || 0) - (a.trendCount || 0);
      })
      .filter((s) => (s.trendCount || 0) > 0 || s.image_url)
      .slice(0, 24);
  }, [stars]);

  // Search filter
  const filtered = useMemo(() => {
    if (!stars || !search.trim()) return null;
    const q = search.toLowerCase().trim();
    return stars.filter(
      (s) =>
        s.display_name.toLowerCase().includes(q) ||
        (s.name_ko && s.name_ko.toLowerCase().includes(q)) ||
        (s.agency && s.agency.toLowerCase().includes(q))
    );
  }, [stars, search]);

  const displayList = filtered ?? popular;
  const isSearching = !!search.trim();

  const toggleArtist = useCallback((wikiEntryId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(wikiEntryId)) {
        next.delete(wikiEntryId);
      } else {
        next.add(wikiEntryId);
      }
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!user?.id) {
      navigate("/login");
      return;
    }
    if (requireMinOne && selected.size === 0) {
      toast.error(language === "ko" ? "최소 1명의 아티스트를 선택해주세요" : "Please select at least 1 artist");
      return;
    }

    setSaving(true);
    try {
      await supabase
        .from("ktrenz_watched_artists" as any)
        .delete()
        .eq("user_id", user.id);

      if (selected.size > 0 && stars) {
        const starMap = new Map(stars.map((s) => [s.wiki_entry_id, s]));
        const inserts = Array.from(selected)
          .filter((wid) => starMap.has(wid))
          .map((wid) => ({
            user_id: user.id,
            wiki_entry_id: wid,
            artist_name: starMap.get(wid)!.display_name,
          }));

        if (inserts.length > 0) {
          await supabase.from("ktrenz_watched_artists" as any).insert(inserts);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["watched-artists"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-watched"] });
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
      toast.success(language === "ko" ? `관심 아티스트 ${selected.size}명 저장 완료` : `Saved ${selected.size} favorite artists`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val && !user?.id) {
      navigate("/login");
      return;
    }
    onOpenChange(val);
  };

  if (open && !user) {
    navigate("/login");
    return null;
  }

  const getName = (s: StarItem) => language === "ko" && s.name_ko ? s.name_ko : s.display_name;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85dvh] mx-auto max-w-lg">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            {language === "ko" ? "관심 아티스트 등록" : "Pick Your Artists"}
          </DrawerTitle>
          <p className="text-sm text-muted-foreground">
            {language === "ko"
              ? "좋아하는 아티스트를 선택하면 맞춤 트렌드를 받아볼 수 있어요"
              : "Select your favorite artists to get personalized trends"}
          </p>
        </DrawerHeader>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={language === "ko" ? "아티스트 검색..." : "Search artists..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Selected count */}
        {selected.size > 0 && (
          <div className="px-4 pb-2">
            <span className="text-xs font-semibold text-primary">
              {selected.size} {language === "ko" ? "명 선택됨" : "selected"}
            </span>
          </div>
        )}

        {/* Artist list */}
        <ScrollArea className="flex-1 px-4 pb-4" style={{ maxHeight: "50dvh" }}>
          {starsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {!isSearching && (
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  {language === "ko" ? "🔥 트렌드 아티스트" : "🔥 Trending Artists"}
                </p>
              )}
              {isSearching && displayList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {language === "ko" ? "검색 결과가 없습니다" : "No results found"}
                </p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {displayList.map((star) => {
                  const isChecked = selected.has(star.wiki_entry_id);
                  return (
                    <button
                      key={star.id}
                      onClick={() => toggleArtist(star.wiki_entry_id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                        isChecked
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/40 bg-card/60 hover:bg-card/90"
                      )}
                    >
                      <div className="relative">
                        <Avatar className="w-14 h-14">
                          <AvatarImage src={star.image_url || undefined} className="object-cover" />
                          <AvatarFallback className="bg-muted text-xs font-bold">
                            {getName(star).slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {isChecked && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                      <span className={cn(
                        "text-[11px] font-semibold text-center leading-tight w-full",
                        isChecked ? "text-primary" : "text-foreground"
                      )}>
                        {getName(star)}
                      </span>
                      {(star.trendCount || 0) > 0 && !isSearching && (
                        <span className="text-[9px] text-muted-foreground">
                          {star.trendCount} keywords
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </ScrollArea>

        {/* Save button */}
        <div className="p-4 border-t border-border/30">
          <Button
            onClick={handleSave}
            disabled={saving || (requireMinOne && selected.size === 0)}
            className="w-full gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {language === "ko"
              ? `완료 (${selected.size}명 선택)`
              : `Done (${selected.size} selected)`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ArtistOnboardingDrawer;
