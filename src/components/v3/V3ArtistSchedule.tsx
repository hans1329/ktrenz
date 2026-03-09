import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, PartyPopper, Music, Radio, ShoppingBag, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";

interface V3ArtistScheduleProps {
  wikiEntryId: string;
  artistName: string;
}

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  release: { icon: Music, color: "text-primary bg-primary/15 border-primary/25", label: "Release" },
  celebration: { icon: PartyPopper, color: "text-amber-400 bg-amber-500/15 border-amber-500/25", label: "Celebration" },
  broadcast: { icon: Radio, color: "text-blue-400 bg-blue-500/15 border-blue-500/25", label: "Broadcast" },
  purchase: { icon: ShoppingBag, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25", label: "Purchase" },
  event: { icon: Sparkles, color: "text-pink-400 bg-pink-500/15 border-pink-500/25", label: "Event" },
  sns: { icon: MessageCircle, color: "text-violet-400 bg-violet-500/15 border-violet-500/25", label: "SNS" },
  others: { icon: Calendar, color: "text-muted-foreground bg-muted/50 border-border/50", label: "Schedule" },
};

function getDateLabel(dateStr: string): { label: string; highlight: boolean } {
  const d = parseISO(dateStr);
  if (isToday(d)) return { label: "Today", highlight: true };
  if (isTomorrow(d)) return { label: "Tomorrow", highlight: true };
  if (isThisWeek(d)) return { label: format(d, "EEE"), highlight: false };
  return { label: format(d, "MMM d"), highlight: false };
}

const V3ArtistSchedule = ({ wikiEntryId, artistName }: V3ArtistScheduleProps) => {
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

  return (
    <>
      <div className="flex items-center gap-2 mt-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest flex items-center gap-1">
          <Calendar className="w-3 h-3 text-primary" /> Upcoming Schedule
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-1.5">
        {schedules.map((schedule: any) => {
          const cat = CATEGORY_CONFIG[schedule.category] || CATEGORY_CONFIG.others;
          const Icon = cat.icon;
          const { label: dateLabel, highlight } = getDateLabel(schedule.event_date);

          return (
            <div
              key={schedule.id}
              className={cn(
                "flex items-center gap-2.5 p-3 rounded-xl border transition-colors",
                "bg-card/60 border-border/30 hover:border-primary/20"
              )}
            >
              {/* Category icon */}
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", cat.color)}>
                <Icon className="w-4 h-4" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground line-clamp-1">{schedule.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn(
                    "text-[10px] font-medium",
                    highlight ? "text-primary" : "text-muted-foreground"
                  )}>
                    {dateLabel}
                  </span>
                  {schedule.event_time && (
                    <>
                      <span className="text-muted-foreground/30 text-[10px]">·</span>
                      <span className="text-[10px] text-muted-foreground">{schedule.event_time}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Date badge */}
              <div className={cn(
                "px-2 py-1 rounded-md text-[10px] font-bold shrink-0",
                highlight
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/50 text-muted-foreground"
              )}>
                {format(parseISO(schedule.event_date), "M/d")}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default V3ArtistSchedule;
