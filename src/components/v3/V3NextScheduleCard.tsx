import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Music, PartyPopper, Radio, ShoppingBag, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays, isToday, isTomorrow } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface V3NextScheduleCardProps {
  wikiEntryId: string;
  artistImage?: string | null;
  artistName?: string;
}

const CAT_META: Record<string, { icon: any; color: string; dot: string; emoji: string; i18nKey: string; gradient: string }> = {
  release:     { icon: Music,         color: "text-primary border-primary/30 bg-primary/10",           dot: "bg-primary",      emoji: "💿", i18nKey: "schedule.release",     gradient: "from-primary/20 to-primary/5" },
  celebration: { icon: PartyPopper,   color: "text-amber-400 border-amber-500/30 bg-amber-500/10",     dot: "bg-amber-400",    emoji: "🎉", i18nKey: "schedule.celebration", gradient: "from-amber-500/20 to-amber-500/5" },
  broadcast:   { icon: Radio,         color: "text-blue-400 border-blue-500/30 bg-blue-500/10",        dot: "bg-blue-400",     emoji: "📡", i18nKey: "schedule.broadcast",   gradient: "from-blue-500/20 to-blue-500/5" },
  purchase:    { icon: ShoppingBag,   color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400", emoji: "🛍️", i18nKey: "schedule.purchase",   gradient: "from-emerald-500/20 to-emerald-500/5" },
  event:       { icon: Sparkles,      color: "text-pink-400 border-pink-500/30 bg-pink-500/10",        dot: "bg-pink-400",     emoji: "✨", i18nKey: "schedule.event",       gradient: "from-pink-500/20 to-pink-500/5" },
  sns:         { icon: MessageCircle, color: "text-violet-400 border-violet-500/30 bg-violet-500/10",  dot: "bg-violet-400",   emoji: "💬", i18nKey: "schedule.sns",         gradient: "from-violet-500/20 to-violet-500/5" },
  others:      { icon: Calendar,      color: "text-muted-foreground border-border/30 bg-muted/10",     dot: "bg-muted-foreground", emoji: "📅", i18nKey: "schedule.others",  gradient: "from-muted/30 to-muted/10" },
};

const V3NextScheduleCard = ({ wikiEntryId, artistImage, artistName }: V3NextScheduleCardProps) => {
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
        .limit(3) as { data: any[] | null };
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!schedule || schedule.length === 0) return null;

  const featured = schedule[0];
  const rest = schedule.slice(1);
  const featCat = CAT_META[featured.category] || CAT_META.others;
  const featDate = parseISO(featured.event_date);
  const featDays = differenceInDays(featDate, new Date());

  let featDateLabel: string;
  if (isToday(featDate)) featDateLabel = t("artist.today");
  else if (isTomorrow(featDate)) featDateLabel = t("artist.tomorrow");
  else featDateLabel = `D-${featDays}`;

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        <p className="text-xs font-bold text-foreground uppercase tracking-wider">
          {t("drawer.upcomingSchedule")}
        </p>
      </div>

      {/* Featured card - large */}
      <div className={cn(
        "relative overflow-hidden rounded-2xl border transition-all",
        "bg-gradient-to-br border-border/30",
        featCat.gradient,
        isToday(featDate) && "border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.15)]"
      )}>
        {/* Artist image background */}
        {artistImage && (
          <div className="absolute inset-0 opacity-[0.08]">
            <img src={artistImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="relative p-4 flex gap-3.5">
          {/* Artist avatar */}
          {artistImage && (
            <div className="shrink-0">
              <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-border/30 shadow-lg">
                <img src={artistImage} alt={artistName || ""} className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                  {featured.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground font-medium">
                    {format(featDate, "MMM d, yyyy")}
                  </span>
                  {featured.event_time && (
                    <span className="text-xs text-muted-foreground">· {featured.event_time}</span>
                  )}
                </div>
              </div>

              {/* D-day badge */}
              <div className={cn(
                "shrink-0 px-2.5 py-1 rounded-lg text-xs font-extrabold",
                isToday(featDate)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-foreground border border-border/30"
              )}>
                {featDateLabel}
              </div>
            </div>

            {/* Category badge */}
            <div className="mt-2.5">
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
                featCat.color
              )}>
                {featCat.emoji} {t(featCat.i18nKey)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Remaining items - compact */}
      {rest.map((s: any) => {
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
              "flex items-center gap-3 p-3 rounded-xl border transition-colors",
              "bg-gradient-to-r border-border/20",
              cat.gradient,
              isToday(d) && "border-primary/30"
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
              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", cat.color)}>
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
  );
};

export default V3NextScheduleCard;
