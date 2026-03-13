import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Sparkles, ChevronRight, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AIPredictionCardProps {
  wikiEntryId: string;
  artistName: string;
}

const DIRECTION_CONFIG: Record<string, {
  emoji: string;
  gradient: string;
  accentClass: string;
  Icon: typeof TrendingUp;
}> = {
  rising: {
    emoji: "🚀",
    gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    accentClass: "text-emerald-400",
    Icon: TrendingUp,
  },
  spike: {
    emoji: "🔥",
    gradient: "from-pink-500/15 via-rose-500/5 to-transparent",
    accentClass: "text-pink-400",
    Icon: Flame,
  },
  spike_up: {
    emoji: "🔥",
    gradient: "from-pink-500/15 via-rose-500/5 to-transparent",
    accentClass: "text-pink-400",
    Icon: Flame,
  },
  falling: {
    emoji: "💤",
    gradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    accentClass: "text-blue-400",
    Icon: TrendingDown,
  },
  spike_down: {
    emoji: "⚡",
    gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
    accentClass: "text-amber-400",
    Icon: TrendingDown,
  },
  flat: {
    emoji: "😎",
    gradient: "from-muted/20 via-muted/10 to-transparent",
    accentClass: "text-muted-foreground",
    Icon: Minus,
  },
  stable: {
    emoji: "😎",
    gradient: "from-muted/20 via-muted/10 to-transparent",
    accentClass: "text-muted-foreground",
    Icon: Minus,
  },
};

export default function V3AIPredictionCard({ wikiEntryId, artistName }: AIPredictionCardProps) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const { data: prediction, isLoading } = useQuery({
    queryKey: ["fes-prediction-v2", wikiEntryId],
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
        hot_summary: pick(pred, "hot_summary", language) || pick(pred, "fan_briefing", language),
        fan_action: pick(pred, "fan_action", language),
        position_note: pick(pred, "position_note", language),
        fan_briefing: pick(pred, "fan_briefing", language) || d.reasoning,
        predicted_at: d.predicted_at,
      };
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading || !prediction) return null;

  const config = DIRECTION_CONFIG[prediction.direction] || DIRECTION_CONFIG.stable;
  const hasStructured = prediction.hot_summary && prediction.fan_action;

  const handleClick = () => {
    const contextMessage = prediction.hot_summary || prediction.fan_briefing || "";
    const actionMessage = prediction.fan_action || "";
    const seed = [contextMessage, actionMessage].filter(Boolean).join(" ");

    localStorage.setItem("ktrenz_agent_seed", JSON.stringify({
      artistName,
      wikiEntryId,
      message: seed,
      createdAt: Date.now(),
    }));

    navigate("/agent");
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-2xl overflow-hidden transition-all group",
        "bg-gradient-to-br border border-border/40",
        config.gradient,
        "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        "active:scale-[0.97] active:shadow-none"
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header: AI badge + timestamp */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/70">
            <Sparkles className="w-3 h-3" />
            {t("prediction.aiLabel")}
          </span>
          <span className="text-[9px] text-muted-foreground/60">
            {new Date(prediction.predicted_at).toLocaleDateString()}
          </span>
        </div>

        {hasStructured ? (
          <>
            {/* Main insight - casual speech bubble style */}
            <div className="flex items-start gap-2.5">
              <span className="text-xl mt-0.5 shrink-0">{config.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground leading-snug">
                  {prediction.hot_summary}
                </p>
              </div>
            </div>

            {/* Action suggestion - pill style */}
            {prediction.fan_action && (
              <div className={cn(
                "rounded-xl px-3.5 py-2.5",
                "bg-primary/[0.06] border border-primary/10"
              )}>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-wider mb-1">
                  {t("prediction.doThis")}
                </p>
                <p className="text-[12px] text-foreground/90 leading-relaxed font-medium">
                  {prediction.fan_action}
                </p>
              </div>
            )}

            {/* Position context - subtle */}
            {prediction.position_note && (
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed pl-1">
                💡 {prediction.position_note}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <span className="text-xl mt-0.5 shrink-0">{config.emoji}</span>
            <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-4">
              {prediction.fan_briefing}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-end pt-0.5">
          <span className={cn(
            "inline-flex items-center gap-1 text-[11px] font-bold",
            "text-primary/70 group-hover:text-primary transition-colors"
          )}>
            {t("prediction.talkMore")}
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

/** Pick localized field from prediction object */
function pick(pred: any, field: string, lang: string): string | undefined {
  const langSuffix: Record<string, string> = { ko: "_ko", ja: "_ja", zh: "_zh", en: "" };
  const suffix = langSuffix[lang] ?? "";
  return pred[`${field}${suffix}`] || pred[field];
}
