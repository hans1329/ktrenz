import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Music, PartyPopper, Radio, ShoppingBag, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays, isToday, isTomorrow } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface V3NextScheduleCardProps {
  wikiEntryId: string;
}

const CAT_META: Record<string, { icon: any; color: string; dot: string; emoji: string; i18nKey: string }> = {
  release:     { icon: Music,         color: "text-primary border-primary/30 bg-primary/10",           dot: "bg-primary",      emoji: "💿", i18nKey: "schedule.release" },
  celebration: { icon: PartyPopper,   color: "text-amber-400 border-amber-500/30 bg-amber-500/10",     dot: "bg-amber-400",    emoji: "🎉", i18nKey: "schedule.celebration" },
  broadcast:   { icon: Radio,         color: "text-blue-400 border-blue-500/30 bg-blue-500/10",        dot: "bg-blue-400",     emoji: "📡", i18nKey: "schedule.broadcast" },
  purchase:    { icon: ShoppingBag,   color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400", emoji: "🛍️", i18nKey: "schedule.purchase" },
  event:       { icon: Sparkles,      color: "text-pink-400 border-pink-500/30 bg-pink-500/10",        dot: "bg-pink-400",     emoji: "✨", i18nKey: "schedule.event" },
  sns:         { icon: MessageCircle, color: "text-violet-400 border-violet-500/30 bg-violet-500/10",  dot: "bg-violet-400",   emoji: "💬", i18nKey: "schedule.sns" },
  others:      { icon: Calendar,      color: "text-muted-foreground border-border/30 bg-muted/10",     dot: "bg-muted-foreground", emoji: "📅", i18nKey: "schedule.others" },
};

const V3NextScheduleCard = ({ wikiEntryId }: V3NextScheduleCardProps) => {
  const { t } = useLanguage();

  const { data: schedule } = useQuery({
    queryKey: ["next-schedule", wikiEntryId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("ktrenz_schedules" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(2) as { data: any[] | null };
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!schedule || schedule.length === 0) return null;

  return (
    <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        <p className="text-xs font-bold text-foreground uppercase tracking-wider">
          {t("drawer.upcomingSchedule")}
        </p>
      </div>
      <div className="space-y-1.5">
        {schedule.map((s: any) => {
          const cat = CAT_META[s.category] || CAT_META.others;
          const d = parseISO(s.event_date);
          const days = differenceInDays(d, new Date());

          let dateLabel: string;
          if (isToday(d)) dateLabel = t("artist.today");
          else if (isTomorrow(d)) dateLabel = t("artist.tomorrow");
          else dateLabel = `D-${days}`;

          return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
                "bg-gradient-to-r border-border/30",
                isToday(d) ? "border-primary/30 bg-primary/5" : "hover:border-border/50"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full shrink-0", cat.dot)} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground line-clamp-1">{s.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{format(d, "MMM d")}</span>
                  {s.event_time && (
                    <span className="text-[10px] text-muted-foreground">· {s.event_time}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full border",
                  cat.color
                )}>
                  {cat.emoji} {t(cat.i18nKey)}
                </span>
                <span className={cn(
                  "text-[10px] font-bold",
                  isToday(d) ? "text-primary" : "text-muted-foreground"
                )}>
                  {dateLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default V3NextScheduleCard;
