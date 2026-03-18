import { useMemo, useState } from "react";
import { TrendingUp, Clock, ChevronRight, Star, Users, Tag } from "lucide-react";
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

type GroupBy = "none" | "category" | "artist";

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

interface T2TrendListProps {
  items: TrendTile[];
  watchedSet: Set<string>;
  onTileClick: (tile: TrendTile) => void;
  selectedTileId: string | null;
}

const T2TrendList = ({ items, watchedSet, onTileClick, selectedTileId }: T2TrendListProps) => {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const { language } = useLanguage();

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "All Trends", items }];

    const map = new Map<string, TrendTile[]>();
    for (const item of items) {
      const key = groupBy === "category" ? item.category : item.artistName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .sort((a, b) => {
        const aMax = Math.max(...a[1].map(t => t.influenceIndex));
        const bMax = Math.max(...b[1].map(t => t.influenceIndex));
        return bMax - aMax;
      })
      .map(([key, groupItems]) => ({
        key,
        label: groupBy === "category"
          ? (CATEGORY_CONFIG[key]?.label || key)
          : key,
        items: groupItems.sort((a, b) => b.influenceIndex - a.influenceIndex),
      }));
  }, [items, groupBy]);

  return (
    <div>
      {/* Group-by controls */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-muted-foreground font-medium mr-1">Group:</span>
        {([
          { value: "none" as GroupBy, label: "None", icon: null },
          { value: "category" as GroupBy, label: "Category", icon: Tag },
          { value: "artist" as GroupBy, label: "Artist", icon: Users },
        ]).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setGroupBy(value)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border",
              groupBy === value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {label}
          </button>
        ))}
      </div>

      {/* Grouped lists */}
      <div className="space-y-4">
        {grouped.map((group) => (
          <div key={group.key}>
            {groupBy !== "none" && (
              <div className="flex items-center gap-2 mb-2">
                {groupBy === "category" && (
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ background: CATEGORY_CONFIG[group.key]?.color || "hsl(var(--muted-foreground))" }}
                  />
                )}
                <h3 className="text-sm font-bold text-foreground">{group.label}</h3>
                <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
              </div>
            )}

            <div className="space-y-1">
              {group.items.map((item, idx) => {
                const globalRank = items.indexOf(item) + 1;
                const catConfig = CATEGORY_CONFIG[item.category];
                const isMyArtist = watchedSet.has(item.wikiEntryId);
                const isSelected = selectedTileId === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onTileClick(item)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:bg-muted/50"
                    )}
                  >
                    {/* Rank */}
                    <span className={cn(
                      "shrink-0 w-7 text-center font-black text-sm",
                      globalRank <= 3 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {globalRank}
                    </span>

                    {/* Image */}
                    <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-border bg-muted">
                      {(item.sourceImageUrl || item.artistImageUrl) ? (
                        <img
                          src={item.sourceImageUrl || item.artistImageUrl!}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <TrendingUp className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground truncate">
                          {getLocalizedKeyword(item, language)}
                        </span>
                        {isMyArtist && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground truncate">
                          {getLocalizedArtistName(item, language)}
                        </span>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm text-white shrink-0"
                          style={{ background: catConfig?.color || "hsl(var(--muted-foreground))" }}
                        >
                          {catConfig?.label || item.category}
                        </span>
                      </div>
                    </div>

                    {/* Influence + Age */}
                    <div className="shrink-0 text-right">
                      {item.influenceIndex > 0 && (
                        <span className="text-sm font-black text-primary">
                          +{item.influenceIndex.toFixed(0)}%
                        </span>
                      )}
                      <div className="flex items-center justify-end gap-0.5 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{formatAge(item.detectedAt)}</span>
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default T2TrendList;
