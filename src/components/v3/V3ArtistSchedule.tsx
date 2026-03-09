import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, PartyPopper, Music, Radio, ShoppingBag, Sparkles, MessageCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isThisWeek, parseISO, differenceInDays } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface V3ArtistScheduleProps {
  wikiEntryId: string;
  artistName: string;
}

const CATEGORY_KEYS: Record<string, { icon: any; gradient: string; glow: string; i18nKey: string; emoji: string }> = {
  release: { icon: Music, gradient: "from-primary/20 to-primary/5", glow: "shadow-primary/20", i18nKey: "schedule.release", emoji: "💿" },
  celebration: { icon: PartyPopper, gradient: "from-amber-500/20 to-amber-500/5", glow: "shadow-amber-500/20", i18nKey: "schedule.celebration", emoji: "🎉" },
  broadcast: { icon: Radio, gradient: "from-blue-500/20 to-blue-500/5", glow: "shadow-blue-500/20", i18nKey: "schedule.broadcast", emoji: "📡" },
  purchase: { icon: ShoppingBag, gradient: "from-emerald-500/20 to-emerald-500/5", glow: "shadow-emerald-500/20", i18nKey: "schedule.purchase", emoji: "🛍️" },
  event: { icon: Sparkles, gradient: "from-pink-500/20 to-pink-500/5", glow: "shadow-pink-500/20", i18nKey: "schedule.event", emoji: "✨" },
  sns: { icon: MessageCircle, gradient: "from-violet-500/20 to-violet-500/5", glow: "shadow-violet-500/20", i18nKey: "schedule.sns", emoji: "💬" },
  others: { icon: Calendar, gradient: "from-muted/40 to-muted/10", glow: "shadow-muted/20", i18nKey: "schedule.others", emoji: "📅" },
};

const CATEGORY_COLORS: Record<string, string> = {
  release: "text-primary border-primary/30 bg-primary/10",
  celebration: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  broadcast: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  purchase: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  event: "text-pink-400 border-pink-500/30 bg-pink-500/10",
  sns: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  others: "text-muted-foreground border-border/30 bg-muted/10",
};

const DOT_COLORS: Record<string, string> = {
  release: "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]",
  celebration: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  broadcast: "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]",
  purchase: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  event: "bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.6)]",
  sns: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]",
  others: "bg-muted-foreground",
};

function getDateInfo(dateStr: string, t: (key: string) => string): { label: string; sublabel: string; highlight: boolean; daysAway: number } {
  const d = parseISO(dateStr);
  const days = differenceInDays(d, new Date());
  if (isToday(d)) return { label: t("artist.today"), sublabel: format(d, "MMM d"), highlight: true, daysAway: 0 };
  if (isTomorrow(d)) return { label: t("artist.tomorrow"), sublabel: format(d, "MMM d"), highlight: true, daysAway: 1 };
  if (isThisWeek(d)) return { label: format(d, "EEE").toUpperCase(), sublabel: format(d, "MMM d"), highlight: false, daysAway: days };
  return { label: format(d, "MMM d"), sublabel: `D-${days}`, highlight: false, daysAway: days };
}

const V3ArtistSchedule = ({ wikiEntryId, artistName }: V3ArtistScheduleProps) => {
  const { t } = useLanguage();
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["artist-schedules", wikiEntryId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("ktrenz_schedules" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(10) as { data: any[] | null };
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !schedules || schedules.length === 0) return null;

  // Group by date
  const grouped = schedules.reduce((acc: Record<string, any[]>, s: any) => {
    (acc[s.event_date] = acc[s.event_date] || []).push(s);
    return acc;
  }, {});

  const dateGroups = Object.entries(grouped);

  return (
    <div className="mt-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{t("artist.upcomingSchedule")}</h3>
          <p className="text-[10px] text-muted-foreground">{schedules.length} {t("artist.eventsComingUp")}</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative ml-1">
        {dateGroups.map(([date, events], groupIdx) => {
          const dateInfo = getDateInfo(date, t);
          const isLast = groupIdx === dateGroups.length - 1;

          return (
            <div key={date} className="relative flex gap-3">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center shrink-0 w-6">
                {/* Date dot */}
                <div className={cn(
                  "w-3 h-3 rounded-full mt-1 shrink-0 z-10 transition-all",
                  dateInfo.highlight
                    ? "bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)] ring-2 ring-primary/20"
                    : "bg-muted-foreground/40"
                )} />
                {/* Connecting line */}
                {!isLast && (
                  <div className="w-px flex-1 bg-gradient-to-b from-border/60 to-border/20 min-h-[16px]" />
                )}
              </div>

              {/* Date group content */}
              <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
                {/* Date label */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn(
                    "text-[11px] font-bold tracking-wide",
                    dateInfo.highlight ? "text-primary" : "text-muted-foreground"
                  )}>
                    {dateInfo.label}
                  </span>
                  {dateInfo.highlight && (
                    <span className="text-[9px] text-muted-foreground font-medium">{dateInfo.sublabel}</span>
                  )}
                  {!dateInfo.highlight && dateInfo.daysAway > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-medium">
                      {dateInfo.sublabel}
                    </span>
                  )}
                </div>

                {/* Event cards for this date */}
                <div className="space-y-1.5">
                  {(events as any[]).map((schedule: any) => {
                    const cat = CATEGORY_KEYS[schedule.category] || CATEGORY_KEYS.others;
                    const dotColor = DOT_COLORS[schedule.category] || DOT_COLORS.others;
                    const catColor = CATEGORY_COLORS[schedule.category] || CATEGORY_COLORS.others;

                    return (
                      <div
                        key={schedule.id}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border transition-all duration-200",
                          "bg-gradient-to-r border-border/20",
                          cat.gradient,
                          "hover:border-primary/30 hover:shadow-lg",
                          cat.glow,
                          dateInfo.highlight && "ring-1 ring-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-3 p-3">
                          {/* Category dot */}
                          <div className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground line-clamp-1">
                              {schedule.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {schedule.event_time && (
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {schedule.event_time}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Category badge */}
                          <span className={cn(
                            "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                            catColor
                          )}>
                            {cat.emoji} {t(cat.i18nKey)}
                          </span>
                        </div>

                        {/* Subtle hover effect line */}
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3ArtistSchedule;
