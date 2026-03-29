import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Layers, ArrowRight, ChevronRight } from "lucide-react";

interface CrossInsight {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  triggerSource: string;
  category: string;
  naverBuzz: number;
  socialScore: number;
  gapType: "social_only" | "naver_only" | "cross_confirmed";
  gapLabel: string;
  gapLabelKo: string;
}

const GAP_CONFIG: Record<string, { icon: string; label: string; labelKo: string; tagColor: string }> = {
  social_only: { icon: "🚀", label: "Social Early", labelKo: "소셜 선행", tagColor: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  naver_only: { icon: "📰", label: "News Only", labelKo: "뉴스 중심", tagColor: "bg-green-500/15 text-green-600 dark:text-green-400" },
  cross_confirmed: { icon: "🔥", label: "Confirmed", labelKo: "교차 확인", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
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
      // Get active triggers with metadata containing buzz data
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, trigger_source, keyword_category, metadata, baseline_score, peak_score")
        .eq("status", "active")
        .order("detected_at", { ascending: false })
        .limit(200);

      if (!triggers?.length) return [];

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
          gapLabel = `Trending on ${t.trigger_source === "tiktok" ? "TikTok" : t.trigger_source === "instagram" ? "Instagram" : "YouTube"}, not yet in news`;
          gapLabelKo = `${t.trigger_source === "tiktok" ? "틱톡" : t.trigger_source === "instagram" ? "인스타" : "유튜브"}에서 화제, 뉴스는 아직`;
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

      // Prioritize: social_only first (early signals), then cross_confirmed, then naver_only
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
        <div>
          <h2 className="text-base font-black text-foreground">
            {language === "ko" ? "소스 교차 인사이트" : "Cross-Source Insights"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {language === "ko" ? "네이버에서 못 보는 멀티소스 분석" : "Multi-source gap analysis"}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {insights.map((item) => {
          const config = GAP_CONFIG[item.gapType];

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className={cn(
                "w-full text-left rounded-2xl p-4 border transition-all active:scale-[0.98]",
                config.bg
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{config.icon}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {item.artistName}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-bold text-foreground leading-snug truncate">
                    {getKeyword(item, language)}
                  </h3>
                  <p className={cn("text-xs mt-1", config.color)}>
                    {language === "ko" ? item.gapLabelKo : item.gapLabel}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0 pt-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      📰 {item.naverBuzz}
                    </span>
                    {item.socialScore > 0 && (
                      <span className="flex items-center gap-1">
                        📱 {item.socialScore}
                      </span>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
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
