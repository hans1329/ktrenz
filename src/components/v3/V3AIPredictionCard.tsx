import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Target, Users, MessageCircle } from "lucide-react";

interface AIPredictionCardProps {
  wikiEntryId: string;
  artistName: string;
}

const DIRECTION_CONFIG: Record<string, { emoji: string; bgClass: string }> = {
  rising: { emoji: "📈", bgClass: "from-green-500/10 to-emerald-500/5" },
  spike: { emoji: "🔥", bgClass: "from-pink-500/10 to-rose-500/5" },
  spike_up: { emoji: "🔥", bgClass: "from-pink-500/10 to-rose-500/5" },
  falling: { emoji: "📉", bgClass: "from-blue-500/10 to-blue-500/5" },
  spike_down: { emoji: "📉", bgClass: "from-red-500/10 to-red-500/5" },
  flat: { emoji: "😌", bgClass: "from-muted/20 to-muted/10" },
  stable: { emoji: "😌", bgClass: "from-muted/20 to-muted/10" },
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
    // Build a context message from the prediction to seed the agent chat
    const contextMessage = prediction.hot_summary || prediction.fan_briefing || "";
    const actionMessage = prediction.fan_action || "";
    const seed = [contextMessage, actionMessage].filter(Boolean).join(" ");

    // Store context for the agent to pick up
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
        "w-full text-left rounded-xl overflow-hidden border border-border/60 transition-all",
        "bg-gradient-to-br", config.bgClass,
        "hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
      )}
    >
      <div className="p-3.5 space-y-2.5">
        {hasStructured ? (
          <>
            {/* Part 1: Hot Summary */}
            <div className="flex items-start gap-2">
              <span className="text-base mt-0.5 shrink-0">{config.emoji}</span>
              <p className="text-[12px] font-bold text-foreground leading-snug">
                {prediction.hot_summary}
              </p>
            </div>

            {/* Part 2: Fan Action */}
            {prediction.fan_action && (
              <div className="flex items-start gap-2 pl-0.5">
                <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Target className="w-3 h-3 text-primary" />
                </div>
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                  {prediction.fan_action}
                </p>
              </div>
            )}

            {/* Part 3: Position Note */}
            {prediction.position_note && (
              <div className="flex items-start gap-2 pl-0.5">
                <div className="w-5 h-5 rounded-md bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {prediction.position_note}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2">
            <span className="text-base mt-0.5 shrink-0">{config.emoji}</span>
            <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-4">
              {prediction.fan_briefing}
            </p>
          </div>
        )}

        {/* CTA + Timestamp row */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
            <MessageCircle className="w-3 h-3" />
            {t("prediction.askAgent") || "Ask Agent more →"}
          </span>
          <p className="text-[9px] text-muted-foreground">
            {new Date(prediction.predicted_at).toLocaleDateString()}
          </p>
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
