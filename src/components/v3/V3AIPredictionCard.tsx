import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Sparkles, ExternalLink, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AIPredictionCardProps {
  wikiEntryId: string;
  artistName: string;
}

const DIRECTION_CONFIG: Record<string, {
  emoji: string;
  Icon: typeof TrendingUp;
}> = {
  rising:     { emoji: "🚀", Icon: TrendingUp },
  spike:      { emoji: "🔥", Icon: Flame },
  spike_up:   { emoji: "🔥", Icon: Flame },
  falling:    { emoji: "💤", Icon: TrendingDown },
  spike_down: { emoji: "⚡", Icon: TrendingDown },
  flat:       { emoji: "😎", Icon: Minus },
  stable:     { emoji: "😎", Icon: Minus },
};

/** Build an external action URL based on the leading category */
function buildActionUrl(
  category: string | undefined,
  artistName: string,
  ytChannelId?: string | null,
  ytVideoId?: string | null
): string | null {
  switch (category) {
    case "youtube":
      if (ytVideoId) return `https://www.youtube.com/watch?v=${ytVideoId}`;
      if (ytChannelId) return `https://www.youtube.com/channel/${ytChannelId}`;
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(artistName)}`;
    case "buzz":
    case "social":
      return `https://x.com/search?q=${encodeURIComponent(artistName)}&f=live`;
    case "music":
      return `https://open.spotify.com/search/${encodeURIComponent(artistName)}`;
    case "album":
      return `https://www.google.com/search?q=${encodeURIComponent(artistName + " album")}`;
    default:
      return null;
  }
}

export default function V3AIPredictionCard({ wikiEntryId, artistName }: AIPredictionCardProps) {
  const { language, t } = useLanguage();

  // Fetch prediction
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
        leading_category: pred.leading_category_next,
        hot_summary: pick(pred, "hot_summary", language) || pick(pred, "fan_briefing", language),
        fan_action: pick(pred, "fan_action", language),
        position_note: pick(pred, "position_note", language),
        fan_briefing: pick(pred, "fan_briefing", language) || d.reasoning,
        predicted_at: d.predicted_at,
      };
    },
    staleTime: 5 * 60_000,
  });

  // Fetch artist YouTube info for action URL
  const { data: artistTier } = useQuery({
    queryKey: ["artist-tier-yt", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v3_artist_tiers" as any)
        .select("youtube_channel_id, latest_youtube_video_id")
        .eq("wiki_entry_id", wikiEntryId)
        .maybeSingle();
      return data as { youtube_channel_id?: string; latest_youtube_video_id?: string } | null;
    },
    staleTime: 30 * 60_000,
  });

  if (isLoading || !prediction) return null;

  const config = DIRECTION_CONFIG[prediction.direction] || DIRECTION_CONFIG.stable;
  const hasStructured = prediction.hot_summary && prediction.fan_action;

  const actionUrl = buildActionUrl(
    prediction.leading_category,
    artistName,
    artistTier?.youtube_channel_id,
    artistTier?.latest_youtube_video_id
  );

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionUrl) {
      window.open(actionUrl, "_blank", "noopener,noreferrer");
    }
  };

  const categoryLabel: Record<string, string> = {
    youtube: "YouTube",
    buzz: "Buzz / SNS",
    album: "Album",
    music: "Music",
    social: "Social",
  };

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden",
        "border border-border/30",
        "bg-gradient-to-br",
        config.gradientClass,
        "shadow-lg",
        config.glowColor,
      )}
    >
      {/* Animated shimmer overlay */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-rainbow-slide" />
      </div>

      <div className="relative p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/80">
            <Sparkles className="w-3 h-3" />
            {t("prediction.aiLabel")}
          </span>
          <span className="text-[9px] text-muted-foreground/50">
            {new Date(prediction.predicted_at).toLocaleDateString()}
          </span>
        </div>

        {hasStructured ? (
          <>
            {/* Hot summary */}
            <div className="flex items-start gap-2.5">
              <span className="text-xl mt-0.5 shrink-0">{config.emoji}</span>
              <p className="text-[13px] font-bold text-foreground leading-snug">
                {prediction.hot_summary}
              </p>
            </div>

            {/* Action CTA — the main interactive element */}
            {prediction.fan_action && (
              <button
                onClick={handleActionClick}
                className={cn(
                  "w-full text-left rounded-xl px-3.5 py-3 group/action",
                  "bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5",
                  "border border-primary/20",
                  "hover:border-primary/40 hover:from-primary/20 hover:via-primary/15 hover:to-primary/10",
                  "active:scale-[0.98]",
                  "transition-all duration-200",
                )}
              >
                <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-1">
                  {t("prediction.doThis")}
                </p>
                <p className="text-[12px] text-foreground/90 leading-relaxed font-medium">
                  {prediction.fan_action}
                </p>
                {actionUrl && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-primary/80 group-hover/action:text-primary transition-colors">
                      {t("prediction.goNow")} — {categoryLabel[prediction.leading_category] || "Link"}
                    </span>
                    <ExternalLink className="w-3 h-3 text-primary/60 group-hover/action:text-primary transition-colors" />
                  </div>
                )}
              </button>
            )}

            {/* Position note */}
            {prediction.position_note && (
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed pl-1">
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
      </div>
    </div>
  );
}

/** Pick localized field from prediction object */
function pick(pred: any, field: string, lang: string): string | undefined {
  const langSuffix: Record<string, string> = { ko: "_ko", ja: "_ja", zh: "_zh", en: "" };
  const suffix = langSuffix[lang] ?? "";
  return pred[`${field}${suffix}`] || pred[field];
}
