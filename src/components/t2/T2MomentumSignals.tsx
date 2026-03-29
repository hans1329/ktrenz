import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TrendingUp, Flame, Zap, ArrowUpRight } from "lucide-react";

interface MomentumItem {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  triggerSource: string;
  deltaPct: number;
  interestScore: number;
  category: string;
}

const SOURCE_BADGE: Record<string, { label: string; class: string }> = {
  naver_news: { label: "Naver", class: "bg-green-500/15 text-green-400" },
  instagram: { label: "Insta", class: "bg-pink-500/15 text-pink-400" },
  tiktok: { label: "TikTok", class: "bg-cyan-500/15 text-cyan-400" },
  youtube_search: { label: "YouTube", class: "bg-red-500/15 text-red-400" },
};

function getKeyword(item: MomentumItem, lang: string) {
  if (lang === "ko" && item.keywordKo) return item.keywordKo;
  return item.keyword;
}

const T2MomentumSignals = () => {
  const { language, t } = useLanguage();
  const [, setSearchParams] = useSearchParams();

  const { data: signals } = useQuery({
    queryKey: ["momentum-signals"],
    queryFn: async () => {
      // Get recent tracking with highest delta
      const { data: tracking } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("trigger_id, interest_score, delta_pct, tracked_at")
        .gt("delta_pct", 10)
        .order("tracked_at", { ascending: false })
        .limit(100);

      if (!tracking?.length) return [];

      // Deduplicate by trigger_id, keep latest
      const seen = new Map<string, any>();
      for (const t of tracking as any[]) {
        if (!seen.has(t.trigger_id)) seen.set(t.trigger_id, t);
      }

      const topTracking = [...seen.values()]
        .sort((a, b) => b.delta_pct - a.delta_pct)
        .slice(0, 5);

      const triggerIds = topTracking.map((t) => t.trigger_id);
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, trigger_source, keyword_category")
        .in("id", triggerIds);

      const triggerMap = new Map((triggers || []).map((t: any) => [t.id, t]));

      return topTracking
        .map((t) => {
          const trigger = triggerMap.get(t.trigger_id) as any;
          if (!trigger) return null;
          return {
            id: trigger.id,
            keyword: trigger.keyword,
            keywordKo: trigger.keyword_ko,
            artistName: trigger.artist_name,
            triggerSource: trigger.trigger_source,
            deltaPct: t.delta_pct,
            interestScore: t.interest_score,
            category: trigger.keyword_category,
          } as MomentumItem;
        })
        .filter(Boolean) as MomentumItem[];
    },
    staleTime: 1000 * 60 * 3,
  });

  if (!signals?.length) return null;

  const handleClick = (item: MomentumItem) => {
    setSearchParams((prev) => {
      prev.set("modal", item.id);
      return prev;
    });
  };

  return (
    <section className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-destructive/10">
          <Flame className="w-4.5 h-4.5 text-destructive" />
        </div>
        <div>
          <h2 className="text-base font-black text-foreground">
            {language === "ko" ? "지금 급등 중" : "Surging Now"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {language === "ko" ? "가속도가 가장 높은 키워드" : "Highest velocity keywords"}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {signals.slice(0, 3).map((item, idx) => {
          const srcBadge = SOURCE_BADGE[item.triggerSource] || { label: item.triggerSource, class: "bg-muted text-muted-foreground" };
          const intensity = Math.min(item.deltaPct / 100, 1);

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className={cn(
                "w-full text-left rounded-2xl p-4 border transition-all active:scale-[0.98]",
                "bg-card hover:bg-accent/50",
                idx === 0 ? "border-destructive/30 shadow-[0_0_20px_-5px_hsl(var(--destructive)/0.15)]" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {item.artistName}
                    </span>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", srcBadge.class)}>
                      {srcBadge.label}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-foreground leading-snug truncate">
                    {getKeyword(item, language)}
                  </h3>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className={cn(
                    "flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-sm font-black",
                    item.deltaPct > 50
                      ? "bg-destructive/15 text-destructive"
                      : "bg-green-500/15 text-green-500"
                  )}>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{item.deltaPct.toFixed(0)}%
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    score {item.interestScore}
                  </span>
                </div>
              </div>

              {/* Velocity bar */}
              <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    item.deltaPct > 50 ? "bg-destructive" : "bg-green-500"
                  )}
                  style={{ width: `${Math.min(intensity * 100, 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default T2MomentumSignals;
