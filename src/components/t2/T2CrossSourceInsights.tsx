import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Layers, ChevronRight } from "lucide-react";

interface CrossInsight {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  artistImage: string | null;
  triggerSource: string;
  category: string;
  naverBuzz: number;
  socialScore: number;
  gapType: "social_only" | "naver_only" | "cross_confirmed";
  gapLabel: string;
  gapLabelKo: string;
}

const GAP_CONFIG: Record<string, { label: string; labelKo: string; tagColor: string }> = {
  social_only: { label: "Social Early", labelKo: "소셜 선행", tagColor: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  naver_only: { label: "News Only", labelKo: "뉴스 중심", tagColor: "bg-green-500/15 text-green-600 dark:text-green-400" },
  cross_confirmed: { label: "Confirmed", labelKo: "교차 확인", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
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

const ArtistThumb = ({ name, src }: { name: string; src: string | null }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-muted shrink-0 flex items-center justify-center text-lg font-bold text-muted-foreground">
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
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
        .select("id, keyword, keyword_ko, artist_name, trigger_source, keyword_category, metadata, baseline_score, peak_score")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(200);

      if (!triggers?.length) return [];

      // Collect unique artist names to fetch images
      const artistNames = [...new Set((triggers as any[]).map((t) => t.artist_name))];
      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("display_name, image_url")
        .in("display_name", artistNames);

      const imageMap = new Map((stars || []).map((s: any) => [s.display_name, s.image_url]));

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
          results.push({
            id: t.id,
            keyword: t.keyword,
            keywordKo: t.keyword_ko,
            artistName: t.artist_name,
            artistImage: imageMap.get(t.artist_name) || null,
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
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10">
          <Layers className="w-4.5 h-4.5 text-primary" />
        </div>
        <h2 className="text-base font-black text-foreground">
          {language === "ko" ? "소스 교차 인사이트" : "Cross-Source Insights"}
        </h2>
      </div>

      <div className="space-y-2.5">
        {insights.map((item) => {
          const config = GAP_CONFIG[item.gapType];

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className="w-full text-left rounded-2xl bg-card border border-border overflow-hidden transition-all active:scale-[0.98] hover:shadow-md"
            >
              <div className="flex items-center gap-3 p-3">
                {/* Artist image */}
                <ArtistThumb name={item.artistName} src={item.artistImage} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground truncate">
                      {item.artistName}
                    </span>
                    <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", config.tagColor)}>
                      {language === "ko" ? config.labelKo : config.label}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground leading-snug truncate">
                    {getKeyword(item, language)}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {language === "ko" ? item.gapLabelKo : item.gapLabel}
                  </p>
                </div>

                {/* Right side */}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default T2CrossSourceInsights;
