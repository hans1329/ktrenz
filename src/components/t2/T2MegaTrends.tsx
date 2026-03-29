import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain } from "@/components/t2/T2TrendTreemap";

interface MegaTrendCluster {
  cluster: string;
  category: string;
  artistCount: number;
  artists: string[];
  keywords: { keyword: string; keywordKo: string; artistName: string; influenceIndex: number; imageUrl: string | null }[];
  totalInfluence: number;
}

const T2MegaTrends = () => {
  const { language } = useLanguage();

  const { data: clusters = [] } = useQuery<MegaTrendCluster[]>({
    queryKey: ["mega-trends"],
    queryFn: async () => {
      // 1) exact match: 동일 키워드가 2+ 아티스트
      const { data: exactMatches } = await supabase
        .from("ktrenz_trend_triggers")
        .select("keyword, keyword_ko, keyword_category, artist_name, star_id, influence_index, source_image_url")
        .eq("status", "active")
        .eq("is_mega_trend", true);

      if (!exactMatches?.length) {
        // Fallback: DB에 태깅 안 됐으면 런타임 감지 (exact match)
        const { data: all } = await supabase
          .from("ktrenz_trend_triggers")
          .select("keyword, keyword_ko, keyword_category, artist_name, star_id, influence_index, source_image_url")
          .eq("status", "active");

        if (!all?.length) return [];

        const byKeyword = new Map<string, typeof all>();
        for (const row of all) {
          const key = row.keyword.toLowerCase();
          const list = byKeyword.get(key) || [];
          list.push(row);
          byKeyword.set(key, list);
        }

        const exactClusters: MegaTrendCluster[] = [];
        for (const [kw, entries] of byKeyword) {
          const uniqueStars = new Set(entries.map(e => e.star_id));
          if (uniqueStars.size < 2) continue;
          exactClusters.push({
            cluster: kw,
            category: entries[0].keyword_category,
            artistCount: uniqueStars.size,
            artists: [...new Set(entries.map(e => e.artist_name))],
            keywords: entries.map(e => ({
              keyword: e.keyword,
              keywordKo: e.keyword_ko || e.keyword,
              artistName: e.artist_name,
              influenceIndex: Number(e.influence_index) || 0,
              imageUrl: e.source_image_url,
            })),
            totalInfluence: entries.reduce((s, e) => s + (Number(e.influence_index) || 0), 0),
          });
        }

        // 2) 카테고리 트렌드: 같은 카테고리에 5+ 아티스트가 활성
        const byCategory = new Map<string, typeof all>();
        for (const row of all) {
          const cat = row.keyword_category;
          if (!cat || cat === "social" || cat === "music" || cat === "event") continue;
          const list = byCategory.get(cat) || [];
          list.push(row);
          byCategory.set(cat, list);
        }

        for (const [cat, entries] of byCategory) {
          const uniqueStars = new Set(entries.map(e => e.star_id));
          if (uniqueStars.size < 5) continue;
          const topEntries = entries.sort((a, b) => (Number(b.influence_index) || 0) - (Number(a.influence_index) || 0)).slice(0, 6);
          exactClusters.push({
            cluster: `${cat}_category_trend`,
            category: cat,
            artistCount: uniqueStars.size,
            artists: [...new Set(topEntries.map(e => e.artist_name))],
            keywords: topEntries.map(e => ({
              keyword: e.keyword,
              keywordKo: e.keyword_ko || e.keyword,
              artistName: e.artist_name,
              influenceIndex: Number(e.influence_index) || 0,
              imageUrl: e.source_image_url,
            })),
            totalInfluence: entries.reduce((s, e) => s + (Number(e.influence_index) || 0), 0),
          });
        }

        return exactClusters.sort((a, b) => b.totalInfluence - a.totalInfluence);
      }

      // DB tagged mega trends
      const byCluster = new Map<string, typeof exactMatches>();
      for (const row of exactMatches) {
        const key = row.keyword.toLowerCase();
        const list = byCluster.get(key) || [];
        list.push(row);
        byCluster.set(key, list);
      }

      return [...byCluster.entries()]
        .map(([kw, entries]) => {
          const uniqueStars = new Set(entries.map(e => e.star_id));
          return {
            cluster: kw,
            category: entries[0].keyword_category,
            artistCount: uniqueStars.size,
            artists: [...new Set(entries.map(e => e.artist_name))],
            keywords: entries.map(e => ({
              keyword: e.keyword,
              keywordKo: e.keyword_ko || e.keyword,
              artistName: e.artist_name,
              influenceIndex: Number(e.influence_index) || 0,
              imageUrl: e.source_image_url,
            })),
            totalInfluence: entries.reduce((s, e) => s + (Number(e.influence_index) || 0), 0),
          };
        })
        .sort((a, b) => b.totalInfluence - a.totalInfluence);
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 3 * 60 * 1000,
  });

  if (!clusters.length) return null;

  return (
    <section className="px-4 py-5">
      <h2 className="text-xl font-black text-foreground mb-3">
        {language === "ko" ? "🔥 메가 트렌드" : "🔥 Mega Trends"}
      </h2>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {clusters.map((cluster) => {
          const config = CATEGORY_CONFIG[cluster.category as keyof typeof CATEGORY_CONFIG];
          const isCategoryTrend = cluster.cluster.endsWith("_category_trend");
          const displayName = isCategoryTrend
            ? (config?.label || cluster.category)
            : (language === "ko" ? cluster.keywords[0]?.keywordKo : cluster.keywords[0]?.keyword) || cluster.cluster;

          // Get best image from cluster
          const bestImage = cluster.keywords
            .map(k => k.imageUrl)
            .filter(url => url && !isBlockedImageDomain(url))
            .map(url => sanitizeImageUrl(url!))[0];

          return (
            <div
              key={cluster.cluster}
              className="flex-shrink-0 w-[200px] rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden"
            >
              {/* Image or gradient header */}
              <div className="relative h-24 overflow-hidden">
                {bestImage ? (
                  <img
                    src={bestImage}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(135deg, ${config?.color || "hsl(var(--primary))"}, hsl(var(--background)))`,
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-orange-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Flame className="w-3 h-3" />
                  {isCategoryTrend ? "Category Wave" : "Mega"}
                </div>

                {/* Artist count */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                  <Users className="w-3 h-3" />
                  {cluster.artistCount} artists
                </div>
              </div>

              {/* Content */}
              <div className="p-3">
                <h4 className="text-sm font-bold text-foreground truncate">{displayName}</h4>
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `${config?.color || "hsl(var(--muted))"}22`,
                      color: config?.color || "hsl(var(--muted-foreground))",
                    }}
                  >
                    {config?.label || cluster.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <TrendingUp className="w-3 h-3" />
                    {Math.round(cluster.totalInfluence).toLocaleString()}
                  </span>
                </div>

                {/* Artists list */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {cluster.artists.slice(0, 4).map((name) => (
                    <span key={name} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
                      {name}
                    </span>
                  ))}
                  {cluster.artists.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{cluster.artists.length - 4}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default T2MegaTrends;
