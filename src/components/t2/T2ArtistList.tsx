import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Star, TrendingUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
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

  const artistGroups = useMemo(() => {
    const map = new Map<string, ArtistGroup>();
    for (const item of items) {
      const key = item.wikiEntryId;
      if (!map.has(key)) {
        map.set(key, {
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
    <div className="space-y-2">
      {artistGroups.map((group, idx) => {
        const isWatched = watchedSet.has(group.wikiEntryId);
        return (
          <button
            key={group.wikiEntryId}
            onClick={() => {
              if (group.starId) navigate(`/t2/artist/${group.starId}`);
            }}
            className="w-full text-left rounded-xl border border-border hover:border-primary/30 bg-card p-3 transition-all group"
          >
            <div className="flex items-center gap-3">
              {/* Rank */}
              <span className="text-sm font-black text-muted-foreground w-6 text-center shrink-0">
                {idx + 1}
              </span>

              {/* Artist image */}
              {group.artistImageUrl ? (
                <img
                  src={group.artistImageUrl}
                  alt={displayName(group)}
                  className="w-11 h-11 rounded-full object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-lg font-black text-muted-foreground shrink-0">
                  {displayName(group).charAt(0)}
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isWatched && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                  <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {displayName(group)}
                  </span>
                </div>
                {/* Keyword badges */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {group.keywords.slice(0, 3).map((kw) => {
                    const config = CATEGORY_CONFIG[kw.category];
                    const kwText = language === "ko" && kw.keywordKo ? kw.keywordKo : kw.keyword;
                    return (
                      <span
                        key={kw.id}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm text-white truncate max-w-[120px]"
                        style={{ background: config?.color || "hsl(var(--muted-foreground))" }}
                      >
                        {kwText}
                      </span>
                    );
                  })}
                  {group.keywords.length > 3 && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                      +{group.keywords.length - 3}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side */}
              <div className="shrink-0 flex items-center gap-2">
                {group.topInfluence > 0 && (
                  <span className="text-sm font-black text-primary flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" />
                    +{group.topInfluence.toFixed(0)}%
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default T2ArtistList;
