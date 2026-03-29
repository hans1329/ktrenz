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

const CardImage = ({ src, alt }: { src: string | null; alt: string }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <span className="text-2xl font-black text-muted-foreground/40">{alt.charAt(0)}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

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

        if (isSocialSource && naverBuzz < 5 && (t.peak_score ?? 0) > 0) {
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
      return results.slice(0, 5);
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
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="w-5 h-5 text-primary" />
        <h2 className="text-base font-black text-foreground">
          {language === "ko" ? "소스 교차 인사이트" : "Cross-Source Insights"}
        </h2>
      </div>

      <div className="space-y-3">
        {insights.map((item) => {
          const config = GAP_CONFIG[item.gapType];
          const sourceName = SOURCE_LABEL[item.triggerSource] || item.triggerSource;

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className="w-full text-left rounded-2xl bg-card border border-border overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
            >
              {/* Large image area */}
              <div className="relative w-full h-36 overflow-hidden">
                <CardImage src={item.imageUrl} alt={item.artistName} />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Gap type badge */}
                <div className="absolute top-2.5 left-2.5">
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm", config.tagBg, config.tagColor)}>
                    {language === "ko" ? config.labelKo : config.label}
                  </span>
                </div>

                {/* Source badge */}
                <div className="absolute top-2.5 right-2.5">
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-black/40 text-white backdrop-blur-sm">
                    {sourceName}
                  </span>
                </div>

                {/* Bottom text on image */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[11px] font-semibold text-white/80 mb-0.5">{item.artistName}</p>
                  <h3 className="text-base font-bold text-white leading-snug truncate">
                    {getKeyword(item, language)}
                  </h3>
                </div>
              </div>

              {/* Insight detail bar */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate flex-1">
                  {language === "ko" ? item.gapLabelKo : item.gapLabel}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                  {item.naverBuzz > 0 && (
                    <span className="flex items-center gap-0.5">
                      📰 <span className="font-semibold">{item.naverBuzz}</span>
                    </span>
                  )}
                  {item.socialScore > 0 && (
                    <span className="flex items-center gap-0.5">
                      📱 <span className="font-semibold">{item.socialScore}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default T2CrossSourceInsights;
