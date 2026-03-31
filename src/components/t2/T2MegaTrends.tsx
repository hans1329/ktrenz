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
  artistNameKoMap: Record<string, string>;
  keywords: { keyword: string; keywordKo: string; artistName: string; influenceIndex: number; imageUrl: string | null }[];
  totalInfluence: number;
}

const T2MegaTrends = () => {
  const { language, t } = useLanguage();

  const { data: clusters = [] } = useQuery<MegaTrendCluster[]>({
    queryKey: ["mega-trends"],
    queryFn: async (): Promise<MegaTrendCluster[]> => {
      // Fetch Korean name map
      const { data: stars } = await supabase
        .from("ktrenz_stars")
        .select("display_name, name_ko");
      const koMap: Record<string, string> = {};
      for (const s of (stars || []) as any[]) {
        if (s.name_ko) koMap[s.display_name] = s.name_ko;
      }

      const buildCluster = (cluster: string, category: string, entries: any[]): MegaTrendCluster => {
        const uniqueStars = new Set(entries.map((e: any) => e.star_id));
        const artists = [...new Set(entries.map((e: any) => e.artist_name))];
        return {
          cluster,
          category,
          artistCount: uniqueStars.size,
          artists,
          artistNameKoMap: koMap,
          keywords: entries.map((e: any) => ({
            keyword: e.keyword,
            keywordKo: e.keyword_ko || e.keyword,
            artistName: e.artist_name,
            influenceIndex: Number(e.influence_index) || 0,
            imageUrl: e.source_image_url,
          })),
          totalInfluence: entries.reduce((s: number, e: any) => s + (Number(e.influence_index) || 0), 0),
        };
      };

      // 1) exact match: 동일 키워드가 2+ 아티스트
      const { data: exactMatches } = await supabase
        .from("ktrenz_trend_triggers")
        .select("keyword, keyword_ko, keyword_category, artist_name, star_id, influence_index, source_image_url, mega_trend_cluster")
        .eq("status", "active")
        .eq("is_mega_trend", true);

      if (!exactMatches?.length) {
        const { data: all } = await supabase
          .from("ktrenz_trend_triggers")
          .select("keyword, keyword_ko, keyword_category, artist_name, star_id, influence_index, source_image_url")
          .eq("status", "active");

        if (!all?.length) return [];

        const byKeyword = new Map<string, any[]>();
        for (const row of all) {
          const key = (row as any).keyword.toLowerCase();
          const list = byKeyword.get(key) || [];
          list.push(row);
          byKeyword.set(key, list);
        }

        const results: MegaTrendCluster[] = [];
        for (const [kw, entries] of byKeyword) {
          const uniqueStars = new Set(entries.map((e: any) => e.star_id));
          if (uniqueStars.size < 2) continue;
          results.push(buildCluster(kw, entries[0].keyword_category, entries));
        }

        return results.sort((a, b) => b.totalInfluence - a.totalInfluence);
      }

      // DB tagged mega trends - group by mega_trend_cluster, skip category trends
      const byCluster = new Map<string, any[]>();
      for (const row of exactMatches) {
        const key = (row as any).mega_trend_cluster || (row as any).keyword.toLowerCase();
        // Skip old category_trend entries
        if (key.endsWith("_category_trend")) continue;
        const list = byCluster.get(key) || [];
        list.push(row);
        byCluster.set(key, list);
      }

      // Only keep clusters with 2+ unique artists
      return [...byCluster.entries()]
        .filter(([_, entries]) => new Set(entries.map((e: any) => e.star_id)).size >= 2)
        .map(([kw, entries]) => buildCluster(kw, entries[0].keyword_category, entries))
        .sort((a, b) => b.totalInfluence - a.totalInfluence);
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 3 * 60 * 1000,
  });

  if (!clusters.length) return null;

  return (
    <section className="px-4 py-5">
      <h2 className="text-xl font-black text-foreground mb-3">
        {t("t2.mega.title")}
      </h2>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
        {clusters.map((cluster) => {
          const config = CATEGORY_CONFIG[cluster.category as keyof typeof CATEGORY_CONFIG];
          const displayName = (language === "ko" ? cluster.keywords[0]?.keywordKo : cluster.keywords[0]?.keyword) || cluster.cluster;

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
              <div className="relative h-32 overflow-hidden">
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


                {/* Artist count */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                  <Users className="w-3 h-3" />
                  {cluster.artistCount} {t("t2.mega.artists")}
                </div>
              </div>

              {/* Category color bar with influence */}
              <div
                className="flex items-center justify-between px-3 py-1.5"
                style={{
                  backgroundColor: `${config?.color || "hsl(var(--muted))"}22`,
                }}
              >
                <span
                  className="text-[10px] font-medium"
                  style={{ color: config?.color || "hsl(var(--muted-foreground))" }}
                >
                  {config?.label || cluster.category}
                </span>
                <span
                  className="text-[10px] font-bold flex items-center gap-0.5"
                  style={{ color: config?.color || "hsl(var(--muted-foreground))" }}
                >
                  <TrendingUp className="w-3 h-3" />
                  {Math.round(cluster.totalInfluence).toLocaleString()}
                </span>
              </div>

              {/* Content */}
              <div className="p-3 pt-2">
                <h4 className="text-sm font-bold text-foreground truncate">{displayName}</h4>

                {/* Artists list */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cluster.artists.slice(0, 4).map((name) => (
                    <span key={name} className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
                      {cluster.artistNameKoMap[name] || name}
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
