import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowLeftRight } from "lucide-react";
import SmartImage from "@/components/SmartImage";
interface CrossInsight {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  imageUrl: string | null;
  triggerSource: string;
  category: string;
  naverBuzz: number;
  socialScore: number;
  gapType: "social_only" | "naver_only" | "cross_confirmed";
  gapLabel: string;
  gapLabelKo: string;
}

const GAP_CONFIG: Record<string, { label: string; labelKo: string; tagColor: string; tagBg: string }> = {
  social_only: { label: "Social Early Signal", labelKo: "소셜 선행 시그널", tagColor: "text-cyan-700 dark:text-cyan-300", tagBg: "bg-cyan-100 dark:bg-cyan-500/20" },
  naver_only: { label: "News Only", labelKo: "뉴스 단독", tagColor: "text-green-700 dark:text-green-300", tagBg: "bg-green-100 dark:bg-green-500/20" },
  cross_confirmed: { label: "Cross Confirmed", labelKo: "교차 확인됨", tagColor: "text-amber-700 dark:text-amber-300", tagBg: "bg-amber-100 dark:bg-amber-500/20" },
};

const SOURCE_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube_search: "YouTube",
  naver_news: "Naver",
};

function getKeyword(item: CrossInsight, lang: string) {
  if (lang === "ko" && item.keywordKo) return item.keywordKo;
  return item.keyword;
}

const T2CrossSourceInsights = () => {
  const { language } = useLanguage();
  const [, setSearchParams] = useSearchParams();

  const { data: insights } = useQuery({
    queryKey: ["cross-source-insights"],
    queryFn: async () => {
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, trigger_source, keyword_category, metadata, baseline_score, peak_score, source_image_url")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(200);

      if (!triggers?.length) return [];

      // Fetch artist images as fallback
      const artistNames = [...new Set((triggers as any[]).map((t) => t.artist_name))];
      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("display_name, image_url")
        .in("display_name", artistNames);
      const starImageMap = new Map((stars || []).map((s: any) => [s.display_name, s.image_url]));

      const results: CrossInsight[] = [];

      for (const t of triggers as any[]) {
        const meta = t.metadata || {};
        const newsTotal = meta.buzz_news_total ?? 0;
        const blogTotal = meta.buzz_blog_total ?? 0;
        const naverBuzz = newsTotal + blogTotal;
        const isSocialSource = ["tiktok", "instagram", "youtube_search"].includes(t.trigger_source);
        const socialScore = meta.social_score ?? 0;

        let gapType: CrossInsight["gapType"] | null = null;
        let gapLabel = "";
        let gapLabelKo = "";

        if (isSocialSource && naverBuzz < 5) {
          gapType = "social_only";
          const src = SOURCE_LABEL[t.trigger_source] || t.trigger_source;
          gapLabel = `Trending on ${src}, not yet in news`;
          gapLabelKo = `${src}에서 화제, 뉴스는 아직`;
        } else if (!isSocialSource && naverBuzz > 20 && socialScore < 10) {
          gapType = "naver_only";
          gapLabel = "Strong in news, quiet on social";
          gapLabelKo = "뉴스에서 강세, 소셜은 조용";
        } else if (isSocialSource && naverBuzz > 10 && socialScore > 30) {
          gapType = "cross_confirmed";
          gapLabel = "Confirmed across social + news";
          gapLabelKo = "소셜 + 뉴스 동시 확인";
        }

        if (gapType) {
          // Prefer source_image_url (content image), fallback to star image
          const imageUrl = t.source_image_url || starImageMap.get(t.artist_name) || null;

          results.push({
            id: t.id,
            keyword: t.keyword,
            keywordKo: t.keyword_ko,
            artistName: t.artist_name,
            imageUrl,
            triggerSource: t.trigger_source,
            category: t.keyword_category,
            naverBuzz,
            socialScore,
            gapType,
            gapLabel,
            gapLabelKo,
          });
        }
      }

      const priority: Record<string, number> = { social_only: 0, cross_confirmed: 1, naver_only: 2 };
      results.sort((a, b) => priority[a.gapType] - priority[b.gapType]);
      return results.slice(0, 10);
    },
    staleTime: 1000 * 60 * 5,
  });

  if (!insights?.length) return null;

  const handleClick = (item: CrossInsight) => {
    setSearchParams((prev) => {
      prev.set("modal", item.id);
      return prev;
    });
  };

  return (
    <section className="px-4 py-6">
      <h2 className="font-black text-foreground text-lg mb-4">
        {language === "ko" ? "어디서 유행 중일까요?" : "Where is it trending?"}
      </h2>

      <div className="space-y-3">
        {insights.map((item) => {
          const config = GAP_CONFIG[item.gapType];
          const sourceName = SOURCE_LABEL[item.triggerSource] || item.triggerSource;

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className="w-full text-left rounded-2xl bg-card overflow-hidden transition-all active:scale-[0.98] hover:shadow-md flex p-2 gap-2"
            >
              {/* 4:3 image on the left */}
              <div className="w-28 h-[84px] flex-shrink-0 bg-muted rounded-xl overflow-hidden relative">
                <SmartImage
                  src={item.imageUrl}
                  alt={item.artistName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <span className="text-xl font-black text-muted-foreground/40">{item.artistName.charAt(0)}</span>
                    </div>
                  }
                />
                <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm">
                  {sourceName}
                </span>
              </div>

              {/* Right content */}
              <div className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-1">
                <p className="text-[11px] text-muted-foreground truncate">
                  {language === "ko" ? item.gapLabelKo : item.gapLabel}
                </p>
                <h3 className="text-sm font-bold text-foreground leading-snug truncate">
                  {getKeyword(item, language)}
                </h3>
                <p className="text-[11px] text-muted-foreground truncate">
                  {item.artistName}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default T2CrossSourceInsights;
