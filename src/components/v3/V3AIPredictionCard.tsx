import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowUpRight, Minus, Brain, Heart } from "lucide-react";

interface AIPredictionCardProps {
  wikiEntryId: string;
  artistName: string;
}

const DIRECTION_CONFIG: Record<string, { labelKey: string; emoji: string; gradient: string; icon: typeof TrendingUp }> = {
  rising: { labelKey: "insights.predRising", emoji: "📈", gradient: "from-green-500/20 via-emerald-500/10 to-transparent", icon: TrendingUp },
  spike: { labelKey: "insights.predSpike", emoji: "🚀", gradient: "from-pink-500/20 via-rose-500/10 to-transparent", icon: ArrowUpRight },
  spike_up: { labelKey: "insights.predSpike", emoji: "🚀", gradient: "from-pink-500/20 via-rose-500/10 to-transparent", icon: ArrowUpRight },
  falling: { labelKey: "insights.predFalling", emoji: "📉", gradient: "from-red-500/20 via-orange-500/10 to-transparent", icon: TrendingDown },
  spike_down: { labelKey: "insights.predFalling", emoji: "📉", gradient: "from-red-500/20 via-orange-500/10 to-transparent", icon: TrendingDown },
  flat: { labelKey: "insights.predStable", emoji: "➡️", gradient: "from-muted/30 to-transparent", icon: Minus },
  stable: { labelKey: "insights.predStable", emoji: "➡️", gradient: "from-muted/30 to-transparent", icon: Minus },
};

export default function V3AIPredictionCard({ wikiEntryId, artistName }: AIPredictionCardProps) {
  const { t, language } = useLanguage();

  const { data: prediction, isLoading } = useQuery({
    queryKey: ["fes-prediction", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_prediction_logs" as any)
        .select("prediction, reasoning, predicted_at")
        .eq("wiki_entry_id", wikiEntryId)
        .order("predicted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const d = data as any;
      const pred = d.prediction || {};
      return {
        direction: pred.fes_direction || "stable",
        confidence: pred.confidence || 0,
        leading_next: pred.leading_category_next,
        category_predictions: pred.category_predictions,
        // Fan briefing (new v3)
        fan_briefing: pred.fan_briefing,
        fan_briefing_ko: pred.fan_briefing_ko,
        fan_briefing_ja: pred.fan_briefing_ja,
        fan_briefing_zh: pred.fan_briefing_zh,
        // Legacy reasoning (fallback)
        reasoning: d.reasoning,
        reasoning_ko: pred.reasoning_ko,
        reasoning_ja: pred.reasoning_ja,
        reasoning_zh: pred.reasoning_zh,
        predicted_at: d.predicted_at,
      };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading || !prediction) return null;

  const config = DIRECTION_CONFIG[prediction.direction] || DIRECTION_CONFIG.stable;
  const DirIcon = config.icon;

  // Fan briefing (prefer fan_briefing, fallback to reasoning)
  const fanBriefingMap: Record<string, string | undefined> = {
    en: prediction.fan_briefing || prediction.reasoning,
    ko: prediction.fan_briefing_ko || prediction.reasoning_ko,
    ja: prediction.fan_briefing_ja || prediction.reasoning_ja,
    zh: prediction.fan_briefing_zh || prediction.reasoning_zh,
  };
  const fanBriefing = fanBriefingMap[language] || fanBriefingMap.en;

  const confidencePct = Math.round(prediction.confidence * 100);

  return (
    <div className={cn(
      "relative rounded-2xl overflow-hidden border border-primary/20",
      "bg-gradient-to-br", config.gradient
    )}>
      {/* Shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-[shimmer_3s_ease-in-out_infinite] pointer-events-none" />
      
      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <Heart className="w-4 h-4 text-pink-400" />
            </div>
            <div>
              <p className="text-[10px] text-primary uppercase tracking-wider font-bold">
                {t("insights.fanBriefing")}
              </p>
              <p className="text-[9px] text-muted-foreground">
                {t("insights.next48h")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg">{config.emoji}</span>
            <span className={cn(
              "text-xs font-black px-2.5 py-1 rounded-full",
              prediction.direction === "rising" && "bg-green-500/15 text-green-400",
              (prediction.direction === "spike" || prediction.direction === "spike_up") && "bg-pink-500/15 text-pink-400",
              (prediction.direction === "falling" || prediction.direction === "spike_down") && "bg-red-500/15 text-red-400",
              (prediction.direction === "flat" || prediction.direction === "stable") && "bg-muted text-muted-foreground",
            )}>
              <DirIcon className="w-3 h-3 inline mr-0.5" />
              {t(config.labelKey)}
            </span>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-muted-foreground font-medium shrink-0">
            {t("insights.confidence") || "Confidence"}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-foreground">{confidencePct}%</span>
        </div>

        {/* Fan Briefing */}
        {fanBriefing && (
          <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-4">
            {fanBriefing}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[9px] text-muted-foreground">
            {new Date(prediction.predicted_at).toLocaleDateString()}
          </span>
          {prediction.leading_next && (
            <span className="text-[9px] text-muted-foreground">
              {t("insights.nextLeading") || "Next leading"}: {prediction.leading_next}
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
