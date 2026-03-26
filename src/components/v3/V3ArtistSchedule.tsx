import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Sparkles, Music, Radio, Plane, Mic2, Heart, Award, Tv, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays, isPast } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface V3ArtistScheduleProps {
  starId?: string;
  wikiEntryId?: string;
  artistName: string;
}

const CATEGORY_CONFIG: Record<string, { icon: any; gradient: string; glow: string; label: string; emoji: string }> = {
  release: { icon: Music, gradient: "from-primary/20 to-primary/5", glow: "shadow-primary/20", label: "Release", emoji: "💿" },
  broadcast: { icon: Radio, gradient: "from-blue-500/20 to-blue-500/5", glow: "shadow-blue-500/20", label: "Broadcast", emoji: "📡" },
  event: { icon: Sparkles, gradient: "from-pink-500/20 to-pink-500/5", glow: "shadow-pink-500/20", label: "Event", emoji: "✨" },
  travel: { icon: Plane, gradient: "from-cyan-500/20 to-cyan-500/5", glow: "shadow-cyan-500/20", label: "Travel", emoji: "✈️" },
  concert: { icon: Mic2, gradient: "from-orange-500/20 to-orange-500/5", glow: "shadow-orange-500/20", label: "Concert", emoji: "🎤" },
  fanmeeting: { icon: Heart, gradient: "from-rose-500/20 to-rose-500/5", glow: "shadow-rose-500/20", label: "Fan Meeting", emoji: "💕" },
  award: { icon: Award, gradient: "from-amber-500/20 to-amber-500/5", glow: "shadow-amber-500/20", label: "Award", emoji: "🏆" },
  variety: { icon: Tv, gradient: "from-emerald-500/20 to-emerald-500/5", glow: "shadow-emerald-500/20", label: "Variety", emoji: "📺" },
};

const DOT_COLORS: Record<string, string> = {
  release: "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]",
  broadcast: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]",
  event: "bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]",
  travel: "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]",
  concert: "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]",
  fanmeeting: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]",
  award: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  variety: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
};

function getConfidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.9) return { text: "Very High", color: "text-emerald-400" };
  if (c >= 0.8) return { text: "High", color: "text-blue-400" };
  return { text: "Moderate", color: "text-amber-400" };
}

const V3ArtistSchedule = ({ starId, wikiEntryId, artistName }: V3ArtistScheduleProps) => {
  const { t } = useLanguage();
  const lookupId = starId || wikiEntryId;
  const lookupField = starId ? "star_id" : "wiki_entry_id";

  // Resolve star_id from wiki_entry_id for querying predictions
  const { data: starRecord } = useQuery({
    queryKey: ["star-for-schedule", lookupId],
    queryFn: async () => {
      if (!lookupId) return null;
      if (starId) return { id: starId };
      // Lookup star_id from wiki_entry_id
      const { data } = await supabase
        .from("ktrenz_stars" as any)
        .select("id")
        .eq("wiki_entry_id", lookupId)
        .eq("is_active", true)
        .maybeSingle() as { data: any };
      return data;
    },
    enabled: !!lookupId,
    staleTime: 10 * 60 * 1000,
  });

  const resolvedStarId = starRecord?.id || null;

  const { data: predictions, isLoading } = useQuery({
    queryKey: ["schedule-predictions", resolvedStarId],
    queryFn: async () => {
      if (!resolvedStarId) return [];
      const { data } = await supabase
        .from("ktrenz_schedule_predictions" as any)
        .select("*")
        .eq("star_id", resolvedStarId)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString())
        .gte("confidence", 0.7)
        .order("confidence", { ascending: false })
        .limit(8) as { data: any[] | null };
      return data || [];
    },
    enabled: !!resolvedStarId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !predictions || predictions.length === 0) return null;

  // Sort: future events first (by date), then undated
  const sorted = [...predictions].sort((a, b) => {
    if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date);
    if (a.event_date) return -1;
    if (b.event_date) return 1;
    return b.confidence - a.confidence;
  });

  return (
    <div className="mt-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/20 to-primary/10 border border-violet-500/20 flex items-center justify-center">
          <Brain className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-foreground">
            {t("artist.predictedSchedule") || "Predicted Schedule"}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {t("artist.aiInferredFromNews") || "AI-inferred from recent news"}
          </p>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
          AI
        </span>
      </div>

      {/* Prediction cards */}
      <div className="space-y-2">
        {sorted.map((pred: any) => {
          const cat = CATEGORY_CONFIG[pred.category] || CATEGORY_CONFIG.event;
          const Icon = cat.icon;
          const dotColor = DOT_COLORS[pred.category] || DOT_COLORS.event;
          const conf = getConfidenceLabel(pred.confidence);
          const daysAway = pred.event_date
            ? differenceInDays(parseISO(pred.event_date), new Date())
            : null;
          const isEventPast = pred.event_date ? isPast(parseISO(pred.event_date)) : false;

          return (
            <div
              key={pred.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border transition-all duration-200",
                "bg-gradient-to-r border-border/20",
                cat.gradient,
                "hover:border-violet-500/30 hover:shadow-lg",
                cat.glow,
                isEventPast && "opacity-50"
              )}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Category dot */}
                <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", dotColor)} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground line-clamp-2">
                    {pred.event_title}
                  </p>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Date */}
                    {pred.event_date && (
                      <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(pred.event_date), "MMM d")}
                        {pred.event_date_end && ` - ${format(parseISO(pred.event_date_end), "MMM d")}`}
                      </span>
                    )}

                    {/* Days away */}
                    {daysAway !== null && daysAway >= 0 && (
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        daysAway === 0 ? "bg-primary/20 text-primary" :
                        daysAway <= 3 ? "bg-orange-500/15 text-orange-400" :
                        "bg-muted/50 text-muted-foreground"
                      )}>
                        {daysAway === 0 ? "TODAY" : `D-${daysAway}`}
                      </span>
                    )}

                    {/* Confidence */}
                    <span className={cn("text-[9px] font-medium", conf.color)}>
                      {Math.round(pred.confidence * 100)}%
                    </span>
                  </div>

                  {/* Reasoning */}
                  {pred.reasoning && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-1 italic">
                      {pred.reasoning}
                    </p>
                  )}
                </div>

                {/* Category badge */}
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                  "text-muted-foreground border-border/30 bg-muted/10"
                )}>
                  {cat.emoji} {cat.label}
                </span>
              </div>

              {/* Hover line */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3ArtistSchedule;
