import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Star, ArrowLeft, TrendingUp, Clock } from "lucide-react";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import V3TabBar from "@/components/v3/V3TabBar";
import T2DetailSheet from "@/components/t2/T2DetailSheet";
import type { TrendTile } from "@/components/t2/T2TrendTreemap";

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  brand:   { label: "Brand",   color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   color: "hsl(190, 70%, 45%)" },
};

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface ArtistGroup {
  artistName: string;
  artistNameKo: string | null;
  artistImageUrl: string | null;
  wikiEntryId: string;
  keywords: TrendTile[];
}

const T2MyArtists = () => {
  const isMobile = useIsMobile();
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedTile, setSelectedTile] = useState<TrendTile | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  // Fetch watched wiki ids
  const { data: watchedWikiIds } = useQuery({
    queryKey: ["t2-watched-artists", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: slots } = await supabase
        .from("ktrenz_agent_slots")
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null);
      const directIds = (slots ?? []).map((d: any) => d.wiki_entry_id).filter(Boolean) as string[];
      if (!directIds.length) return [];

      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id")
        .in("wiki_entry_id", directIds);
      const starIds = (stars ?? []).map((s: any) => s.id) as string[];

      if (starIds.length) {
        const { data: members } = await supabase
          .from("ktrenz_stars" as any)
          .select("wiki_entry_id")
          .in("group_star_id", starIds)
          .not("wiki_entry_id", "is", null);
        const memberIds = (members ?? []).map((m: any) => m.wiki_entry_id).filter(Boolean) as string[];
        return [...new Set([...directIds, ...memberIds])];
      }
      return directIds;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const watchedSet = useMemo(() => new Set(watchedWikiIds ?? []), [watchedWikiIds]);

  // Fetch triggers
  const { data: triggers, isLoading } = useQuery({
    queryKey: ["t2-trend-triggers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .order("influence_index", { ascending: false })
        .order("baseline_score", { ascending: false })
        .order("detected_at", { ascending: false })
        .limit(500);

      const raw = (data ?? []) as any[];
      const starIds = [...new Set(raw.map((t: any) => t.star_id).filter(Boolean))];
      const starMap = new Map<string, any>();
      if (starIds.length > 0) {
        const { data: stars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, wiki_entry_id, display_name, name_ko")
          .in("id", starIds);
        const wikiIds = (stars ?? []).map((s: any) => s.wiki_entry_id).filter(Boolean);
        const imageMap = new Map<string, string>();
        if (wikiIds.length > 0) {
          const { data: wikiEntries } = await supabase.from("wiki_entries").select("id, image_url").in("id", wikiIds);
          (wikiEntries ?? []).forEach((w: any) => { if (w.image_url) imageMap.set(w.id, w.image_url); });
        }
        (stars ?? []).forEach((s: any) => {
          starMap.set(s.id, { display_name: s.display_name, name_ko: s.name_ko, image_url: imageMap.get(s.wiki_entry_id) || null, wiki_entry_id: s.wiki_entry_id });
        });
      }

      return raw.map((t: any): TrendTile => {
        const star = t.star_id ? starMap.get(t.star_id) : null;
        return {
          id: t.id, keyword: t.keyword, keywordKo: t.keyword_ko || null, keywordJa: t.keyword_ja || null, keywordZh: t.keyword_zh || null,
          category: t.keyword_category || "brand", artistName: star?.display_name || t.artist_name || "Unknown",
          artistNameKo: star?.name_ko || null, artistImageUrl: star?.image_url || null,
          wikiEntryId: star?.wiki_entry_id || t.wiki_entry_id, influenceIndex: Number(t.influence_index) || 0,
          context: t.context, contextKo: t.context_ko || null, contextJa: t.context_ja || null, contextZh: t.context_zh || null,
          detectedAt: t.detected_at, peakAt: t.peak_at || null, expiredAt: t.expired_at || null,
          lifetimeHours: t.lifetime_hours != null ? Number(t.lifetime_hours) : null,
          peakDelayHours: t.peak_delay_hours != null ? Number(t.peak_delay_hours) : null,
          baselineScore: t.baseline_score != null ? Number(t.baseline_score) : null,
          peakScore: t.peak_score != null ? Number(t.peak_score) : null,
          sourceUrl: t.source_url || null, sourceTitle: t.source_title || null, sourceImageUrl: t.source_image_url || null,
          starId: t.star_id || null, status: t.status,
        };
      });
    },
    staleTime: 30_000,
  });

  const myKeywords = useMemo(() => {
    if (!triggers?.length || !watchedSet.size) return [];
    return triggers.filter(t => watchedSet.has(t.wikiEntryId));
  }, [triggers, watchedSet]);

  // Group by artist
  const artistGroups = useMemo(() => {
    const map = new Map<string, ArtistGroup>();
    for (const kw of myKeywords) {
      if (!map.has(kw.wikiEntryId)) {
        map.set(kw.wikiEntryId, {
          artistName: kw.artistName,
          artistNameKo: kw.artistNameKo,
          artistImageUrl: kw.artistImageUrl,
          wikiEntryId: kw.wikiEntryId,
          keywords: [],
        });
      }
      map.get(kw.wikiEntryId)!.keywords.push(kw);
    }
    return Array.from(map.values()).sort((a, b) => {
      const aTop = Math.max(...a.keywords.map(k => k.influenceIndex));
      const bTop = Math.max(...b.keywords.map(k => k.influenceIndex));
      return bTop - aTop;
    });
  }, [myKeywords]);

  const handleTileClick = useCallback((item: TrendTile) => {
    setSelectedTile(prev => prev?.id === item.id ? null : item);
  }, []);

  const displayArtist = (g: ArtistGroup) =>
    language === "ko" && g.artistNameKo ? g.artistNameKo : g.artistName;

  const content = (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate("/t2")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          My Artists' Keywords
        </h2>
        <span className="text-sm text-muted-foreground">{myKeywords.length}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : myKeywords.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 flex flex-col items-center justify-center py-16 gap-2">
          <Star className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No watched artist keywords found.</p>
          <p className="text-xs text-muted-foreground/60">Add artists in Fan Agent to see their trends here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {artistGroups.map((group) => (
            <div key={group.wikiEntryId}>
              {/* Artist header */}
              <button
                onClick={() => {
                  const starId = group.keywords[0]?.starId;
                  if (starId) navigate(`/t2/artist/${starId}`);
                }}
                className="flex items-center gap-2.5 mb-2 group"
              >
                {group.artistImageUrl ? (
                  <img src={group.artistImageUrl} alt={displayArtist(group)} className="w-9 h-9 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-black text-muted-foreground">
                    {displayArtist(group).charAt(0)}
                  </div>
                )}
                <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{displayArtist(group)}</span>
                <span className="text-[10px] text-muted-foreground">{group.keywords.length} keywords</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
              {/* Keywords */}
              <div className="space-y-1.5 pl-2">
                {group.keywords.map((kw) => {
                  const config = CATEGORY_CONFIG[kw.category];
                  return (
                    <button
                      key={kw.id}
                      onClick={() => handleTileClick(kw)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
                        selectedTile?.id === kw.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-muted/40"
                      )}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: config?.color || "hsl(var(--muted-foreground))" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{getLocalizedKeyword(kw, language)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm text-white" style={{ background: config?.color }}>
                            {config?.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />{formatAge(kw.detectedAt)}
                          </span>
                        </div>
                      </div>
                      {kw.influenceIndex > 0 && (
                        <span className="text-sm font-black text-primary flex items-center gap-0.5 shrink-0">
                          <TrendingUp className="w-3 h-3" />+{kw.influenceIndex.toFixed(0)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <T2DetailSheet
        tile={selectedTile}
        rank={selectedTile ? myKeywords.findIndex(t => t.id === selectedTile.id) + 1 : undefined}
        totalCount={myKeywords.length}
        onClose={() => setSelectedTile(null)}
      />
    </div>
  );

  if (isMobile) {
    return (
      <>
        <SEO title="My Artists' Keywords – Kinterest" description="Track trends from your favorite K-Pop artists." path="/t2/my" />
        <V3Header />
        <div className="pt-14 pb-24">{content}</div>
        <V3TabBar activeTab="rankings" onTabChange={() => {}} />
      </>
    );
  }

  return (
    <>
      <SEO title="My Artists' Keywords – Kinterest" description="Track trends from your favorite K-Pop artists." path="/t2/my" />
      <div className="min-h-screen flex flex-col">
        <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />
        <main className="flex-1">
          <div className="max-w-[90%] mx-auto">{content}</div>
        </main>
      </div>
    </>
  );
};

export default T2MyArtists;
