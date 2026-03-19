import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, TrendingUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTrackEvent } from "@/hooks/useTrackEvent";
import type { TrendTile } from "./T2TrendTreemap";

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  brand:   { label: "Brand",   color: "hsl(210, 70%, 55%)" },
  product: { label: "Product", color: "hsl(270, 60%, 55%)" },
  place:   { label: "Place",   color: "hsl(145, 55%, 45%)" },
  food:    { label: "Food",    color: "hsl(25, 80%, 55%)" },
  fashion: { label: "Fashion", color: "hsl(330, 65%, 55%)" },
  beauty:  { label: "Beauty",  color: "hsl(350, 60%, 55%)" },
  media:   { label: "Media",   color: "hsl(190, 70%, 45%)" },
};

interface T2ArtistListProps {
  items: TrendTile[];
  watchedSet: Set<string>;
}

interface ArtistGroup {
  groupKey: string;
  starId: string | null;
  wikiEntryId: string;
  artistName: string;
  artistNameKo: string | null;
  artistImageUrl: string | null;
  keywords: TrendTile[];
  topInfluence: number;
  totalScore: number;
}

const T2ArtistList = ({ items, watchedSet }: T2ArtistListProps) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const track = useTrackEvent();

  const artistGroups = useMemo(() => {
    const map = new Map<string, ArtistGroup>();
    for (const item of items) {
      const key = item.starId ?? item.wikiEntryId;
      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          starId: item.starId,
          wikiEntryId: item.wikiEntryId,
          artistName: item.artistName,
          artistNameKo: item.artistNameKo,
          artistImageUrl: item.artistImageUrl,
          keywords: [],
          topInfluence: 0,
          totalScore: 0,
        });
      }
      const group = map.get(key)!;
      group.keywords.push(item);
      if (item.influenceIndex > group.topInfluence) {
        group.topInfluence = item.influenceIndex;
      }
      group.totalScore += (item.baselineScore ?? 0);
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.topInfluence !== a.topInfluence) return b.topInfluence - a.topInfluence;
      return b.totalScore - a.totalScore;
    });
  }, [items]);

  const displayName = (group: ArtistGroup) =>
    language === "ko" && group.artistNameKo ? group.artistNameKo : group.artistName;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {artistGroups.map((group, idx) => {
        const isWatched = watchedSet.has(group.wikiEntryId);
        return (
          <button
            key={group.groupKey}
            onClick={() => {
              if (group.starId) navigate(`/t2/artist/${group.starId}`);
            }}
            className="text-left rounded-2xl border border-border hover:border-primary/30 bg-card overflow-hidden transition-all group"
          >
            {/* Artist image — large */}
            <div className="relative w-full aspect-square bg-muted overflow-hidden">
              {(group.keywords[0]?.sourceImageUrl || group.artistImageUrl) ? (
                <img
                  src={group.keywords[0]?.sourceImageUrl || group.artistImageUrl || ""}
                  alt={displayName(group)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-muted-foreground">
                  {displayName(group).charAt(0)}
                </div>
              )}
              {/* Rank badge */}
              <span className="absolute top-2 left-2 text-xs font-black text-white bg-black/60 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center">
                {idx + 1}
              </span>
              {/* Watched star */}
              {isWatched && (
                <Star className="absolute top-2 right-2 w-4 h-4 text-amber-400 fill-amber-400 drop-shadow-md" />
              )}
              {/* Influence badge */}
              {group.topInfluence > 0 && (
                <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white bg-primary/90 backdrop-blur-sm rounded-full px-2 py-0.5 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  +{group.topInfluence.toFixed(0)}%
                </span>
              )}
            </div>

            {/* Info section */}
            <div className="p-3">
              <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                {displayName(group)}
              </p>

              {/* Keyword badges */}
              <div className="flex flex-wrap gap-1 mt-2">
                {group.keywords.slice(0, 3).map((kw) => {
                  const config = CATEGORY_CONFIG[kw.category];
                  const kwText = language === "ko" && kw.keywordKo ? kw.keywordKo : kw.keyword;
                  return (
                    <span
                      key={kw.id}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white truncate max-w-[100px]"
                      style={{ background: config?.color || "hsl(var(--muted-foreground))" }}
                    >
                      {kwText}
                    </span>
                  );
                })}
                {group.keywords.length > 3 && (
                  <span className="text-[10px] text-muted-foreground font-medium px-1">
                    +{group.keywords.length - 3}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground mt-1.5">
                {group.keywords.length} keyword{group.keywords.length > 1 ? "s" : ""}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default T2ArtistList;
