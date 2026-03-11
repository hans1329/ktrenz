import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { TrendingUp, TrendingDown, Flame } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import heroVisual from "@/assets/hero-visual.webp";

const V3DesktopHero = () => {
  const { t } = useLanguage();

  // Hot movers: top 4 by absolute energy_change_24h
  const hotMovers = useQuery({
    queryKey: ["hero-hot-movers"],
    queryFn: async () => {
      const { data: tiers } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tierIds = new Set((tiers ?? []).map((t: any) => t.wiki_entry_id));

      const { data: scores } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, energy_change_24h, total_score,
          wiki_entries:wiki_entry_id (title, slug, image_url)`)
        .order("scored_at", { ascending: false });

      if (!scores?.length) return [];

      const seen = new Map<string, any>();
      for (const s of scores as any[]) {
        if (tierIds.has(s.wiki_entry_id) && !seen.has(s.wiki_entry_id)) {
          seen.set(s.wiki_entry_id, s);
        }
      }

      return Array.from(seen.values())
        .filter((s) => s.energy_change_24h != null && s.energy_change_24h !== 0)
        .sort((a, b) => Math.abs(b.energy_change_24h) - Math.abs(a.energy_change_24h))
        .slice(0, 4)
        .map((s) => ({
          name: s.wiki_entries?.title ?? "—",
          slug: s.wiki_entries?.slug ?? "",
          image_url: s.wiki_entries?.image_url,
          change: s.energy_change_24h,
          score: s.total_score,
        }));
    },
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="relative overflow-hidden border-b border-border/30">
      {/* Background image — more visible */}
      <div className="absolute inset-0 pointer-events-none">
        <img src={heroVisual} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 gap-12 items-center">
          {/* Left: Copy */}
          <div className="space-y-6">
            <h1 className="text-4xl lg:text-5xl font-extrabold text-foreground leading-tight tracking-tight whitespace-pre-line">
              {t("hero.title")}
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg whitespace-pre-line">
              {t("hero.subtitle")}
            </p>
          </div>

          {/* Right: Hot Movers */}
          {hotMovers.data && hotMovers.data.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("hero.hotSpots")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {hotMovers.data.map((mover, i) => {
                  const isUp = mover.change > 0;
                  return (
                    <Link
                      key={i}
                      to={`/artist/${mover.slug}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-colors"
                    >
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={mover.image_url || undefined} className="object-cover" />
                        <AvatarFallback className="bg-muted text-[10px]">{mover.name?.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{mover.name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {mover.score?.toFixed(1)}
                        </p>
                      </div>
                      <div className={cn(
                        "flex items-center gap-0.5 text-xs font-bold shrink-0",
                        isUp ? "text-emerald-500" : "text-red-500"
                      )}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isUp ? "+" : ""}{mover.change.toFixed(1)}%
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default V3DesktopHero;
