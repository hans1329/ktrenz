import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Target, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface BetCandidate {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  category: string;
  deltaPct: number;
  trendGrade: string | null;
  detectedAt: string;
}

const GRADE_COLORS: Record<string, string> = {
  spark: "text-blue-400",
  react: "text-cyan-400",
  spread: "text-green-400",
  intent: "text-amber-400",
  commerce: "text-orange-400",
  explosive: "text-destructive",
};

function getKeyword(item: BetCandidate, lang: string) {
  if (lang === "ko" && item.keywordKo) return item.keywordKo;
  return item.keyword;
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const T2TrendBetCTA = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: candidates } = useQuery({
    queryKey: ["trend-bet-candidates"],
    queryFn: async () => {
      // Find keywords with active momentum that are good betting candidates
      const { data: tracking } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("trigger_id, delta_pct, tracked_at")
        .order("tracked_at", { ascending: false })
        .limit(500);

      if (!tracking?.length) return [];

      // Deduplicate
      const seen = new Map<string, any>();
      for (const t of tracking as any[]) {
        if (!seen.has(t.trigger_id)) seen.set(t.trigger_id, t);
      }

      // Get keywords with interesting momentum (both up and down)
      const interesting = [...seen.values()]
        .filter((t) => Math.abs(t.delta_pct) > 5)
        .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
        .slice(0, 6);

      if (!interesting.length) return [];

      const triggerIds = interesting.map((t) => t.trigger_id);
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, keyword_category, trend_grade, detected_at")
        .in("id", triggerIds)
        .eq("status", "active");

      const triggerMap = new Map((triggers || []).map((t: any) => [t.id, t]));

      return interesting
        .map((t) => {
          const trigger = triggerMap.get(t.trigger_id) as any;
          if (!trigger) return null;
          return {
            id: trigger.id,
            keyword: trigger.keyword,
            keywordKo: trigger.keyword_ko,
            artistName: trigger.artist_name,
            category: trigger.keyword_category,
            deltaPct: t.delta_pct,
            trendGrade: trigger.trend_grade,
            detectedAt: trigger.detected_at,
          } as BetCandidate;
        })
        .filter(Boolean) as BetCandidate[];
    },
    staleTime: 1000 * 60 * 3,
  });

  if (!candidates?.length) return null;

  const handleClick = (item: BetCandidate) => {
    setSearchParams((prev) => {
      prev.set("modal", item.id);
      return prev;
    });
  };

  return (
    <section className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/10">
            <Target className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground">
              {language === "ko" ? "트렌드 예측" : "Trend Predictions"}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {language === "ko" ? "이 키워드, 내일 더 오를까?" : "Will this keyword rise tomorrow?"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {candidates.slice(0, 4).map((item) => {
          const isUp = item.deltaPct > 0;
          const gradeColor = item.trendGrade ? GRADE_COLORS[item.trendGrade] || "text-muted-foreground" : "text-muted-foreground";

          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className={cn(
                "text-left rounded-2xl p-3.5 border transition-all active:scale-[0.97]",
                "bg-card border-border hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                  {item.artistName}
                </span>
                <span className="text-[9px] text-muted-foreground">· {formatAge(item.detectedAt)}</span>
              </div>

              <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2 mb-2">
                {getKeyword(item, language)}
              </h3>

              <div className="flex items-center justify-between">
                <div className={cn(
                  "flex items-center gap-0.5 text-xs font-bold",
                  isUp ? "text-green-500" : "text-red-400"
                )}>
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isUp ? "+" : ""}{item.deltaPct.toFixed(0)}%
                </div>

                {item.trendGrade && (
                  <span className={cn("text-[9px] font-bold uppercase", gradeColor)}>
                    {item.trendGrade}
                  </span>
                )}
              </div>

              {/* Prediction prompt */}
              <div className="mt-2.5 pt-2.5 border-t border-border/50">
                <span className="text-[10px] font-semibold text-primary flex items-center gap-1">
                  {language === "ko" ? "예측하기" : "Predict"}
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default T2TrendBetCTA;
