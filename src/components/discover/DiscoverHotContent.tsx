import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import SmartImage from "@/components/SmartImage";
import { useLanguage } from "@/contexts/LanguageContext";

interface HotItem {
  id: string;
  title: string;
  thumbnail: string | null;
  url: string;
  source: string;
  engagement_score: number | null;
  star_name: string;
  star_image: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  naver_news: "Naver News",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

const SOURCE_COLORS: Record<string, string> = {
  naver_news: "bg-emerald-500/10 text-emerald-400",
  youtube: "bg-red-500/10 text-red-400",
  tiktok: "bg-pink-500/10 text-pink-400",
  instagram: "bg-purple-500/10 text-purple-400",
};

const DiscoverHotContent = () => {
  const { language } = useLanguage();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["discover-hot-content"],
    queryFn: async () => {
      // Get recent items with thumbnails
      const { data: rawItems } = await supabase
        .from("ktrenz_b2_items")
        .select("id, title, title_en, title_ko, title_ja, title_zh, thumbnail, url, source, engagement_score, star_id")
        .eq("has_thumbnail", true)
        .not("thumbnail", "is", null)
        .order("engagement_score", { ascending: false, nullsFirst: false })
        .limit(50);

      if (!rawItems?.length) return [];

      // Deduplicate by star_id — pick best per star
      const bestByUrl = new Map<string, any>();
      for (const item of rawItems) {
        const key = item.url;
        if (!bestByUrl.has(key)) bestByUrl.set(key, item);
      }
      const dedupItems = [...bestByUrl.values()].slice(0, 8);

      const starIds = [...new Set(dedupItems.map((i: any) => i.star_id))];
      const { data: stars } = await supabase
        .from("ktrenz_stars")
        .select("id, display_name, image_url")
        .in("id", starIds);

      const starMap = new Map((stars || []).map((s: any) => [s.id, s]));

      return dedupItems.map((item: any) => {
        const star = starMap.get(item.star_id);
        const localTitle = language === "ko" ? item.title_ko :
          language === "ja" ? item.title_ja :
          language === "zh" ? item.title_zh :
          item.title_en || item.title;
        return {
          id: item.id,
          title: localTitle || item.title,
          thumbnail: item.thumbnail,
          url: item.url,
          source: item.source,
          engagement_score: item.engagement_score,
          star_name: star?.display_name || "—",
          star_image: star?.image_url || null,
        } as HotItem;
      });
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <section className="px-3 mt-5 mb-4">
        <Skeleton className="h-48 rounded-2xl" />
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="px-3 mt-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
          <Flame className="w-4 h-4 text-red-400" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">Hot Content</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">From battle collection</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden hover:border-primary/30 transition-colors"
          >
            {/* Thumbnail */}
            {item.thumbnail && (
              <div className="aspect-video w-full overflow-hidden bg-muted/30 relative">
                <SmartImage
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${SOURCE_COLORS[item.source] || "bg-muted/50 text-muted-foreground"}`}>
                    {SOURCE_LABELS[item.source] || item.source}
                  </span>
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3.5 h-3.5 text-white drop-shadow-lg" />
                </div>
              </div>
            )}

            {/* Info */}
            <div className="p-3">
              <p className="text-[12px] font-semibold text-foreground line-clamp-2 leading-tight mb-2">
                {item.title}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full overflow-hidden bg-muted/50 shrink-0">
                  {item.star_image && (
                    <SmartImage src={item.star_image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground truncate">{item.star_name}</span>
                {item.engagement_score && (
                  <>
                    <span className="text-[10px] text-muted-foreground/40">·</span>
                    <span className="text-[10px] text-primary font-bold">Score {item.engagement_score}</span>
                  </>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default DiscoverHotContent;
