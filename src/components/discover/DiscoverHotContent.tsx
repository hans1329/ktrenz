import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Newspaper } from "lucide-react";
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
  naver_news: "News",
  naver_blog: "Blog",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  reddit: "Reddit",
};

const DiscoverHotContent = () => {
  const { language } = useLanguage();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["discover-hot-content"],
    queryFn: async () => {
      const { data: rawItems } = await supabase
        .from("ktrenz_b2_items")
        .select("id, title, title_en, title_ko, title_ja, title_zh, thumbnail, url, source, engagement_score, star_id")
        .eq("has_thumbnail", true)
        .not("thumbnail", "is", null)
        .order("engagement_score", { ascending: false, nullsFirst: false })
        .limit(50);

      if (!rawItems?.length) return [];

      const bestByUrl = new Map<string, any>();
      for (const item of rawItems) {
        if (!bestByUrl.has(item.url)) bestByUrl.set(item.url, item);
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
      <section className="px-3 mt-4 mb-4">
        <Skeleton className="h-40 rounded-xl" />
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="px-3 mt-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="w-4 h-4 text-foreground/60" />
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Hot Content</h2>
        <span className="text-[10px] text-muted-foreground ml-auto">Recent</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-border/30 bg-card/60 overflow-hidden hover:bg-card/80 transition-colors"
          >
            {item.thumbnail && (
              <div className="aspect-video w-full overflow-hidden bg-muted/20 relative">
                <SmartImage
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  fallbackSrc={item.star_image || undefined}
                />
                <div className="absolute top-2 left-2">
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-background/80 text-foreground/70 backdrop-blur-sm">
                    {SOURCE_LABELS[item.source] || item.source}
                  </span>
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3 text-foreground/60" />
                </div>
              </div>
            )}

            <div className="p-3">
              <p className="text-[12px] font-medium text-foreground/80 line-clamp-2 leading-tight mb-1.5">
                {item.title}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full overflow-hidden bg-muted/30 shrink-0">
                  {item.star_image && (
                    <SmartImage src={item.star_image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/60 truncate">{item.star_name}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default DiscoverHotContent;
