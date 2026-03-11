import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { TrendingUp, TrendingDown, Flame, MapPin, Youtube, MessageCircle, Music, Disc3 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import heroVisual from "@/assets/hero-visual.webp";

const FLAG_EMOJI: Record<string, string> = {
  US: "🇺🇸", BR: "🇧🇷", GB: "🇬🇧", PH: "🇵🇭", JP: "🇯🇵", KR: "🇰🇷",
  ID: "🇮🇩", MX: "🇲🇽", TH: "🇹🇭", MY: "🇲🇾", FR: "🇫🇷", DE: "🇩🇪",
  IN: "🇮🇳", AU: "🇦🇺", CA: "🇨🇦", SG: "🇸🇬", HK: "🇭🇰", TW: "🇹🇼",
  VN: "🇻🇳", CL: "🇨🇱", MO: "🇲🇴", ES: "🇪🇸", IT: "🇮🇹", TR: "🇹🇷",
  AR: "🇦🇷", CO: "🇨🇴", PE: "🇵🇪", NL: "🇳🇱", PL: "🇵🇱", RU: "🇷🇺",
};

const CATEGORY_META: Record<string, { label: string; icon: typeof Youtube; color: string }> = {
  youtube: { label: "YouTube", icon: Youtube, color: "text-red-400" },
  buzz: { label: "Buzz", icon: MessageCircle, color: "text-sky-400" },
  music: { label: "Music", icon: Music, color: "text-violet-400" },
  album: { label: "Album", icon: Disc3, color: "text-amber-400" },
};

const V3DesktopHero = () => {
  const { t } = useLanguage();

  // Hot movers: top 4 by absolute energy_change_24h + top geo target
  const hotMovers = useQuery({
    queryKey: ["hero-hot-movers-geo"],
    queryFn: async () => {
      const { data: tiers } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tierIds = new Set((tiers ?? []).map((t: any) => t.wiki_entry_id));

      const { data: scores } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, energy_change_24h, total_score,
          youtube_change_24h, buzz_change_24h, music_change_24h, album_change_24h,
          wiki_entries:wiki_entry_id (title, slug, image_url)`)
        .order("scored_at", { ascending: false });

      if (!scores?.length) return [];

      const seen = new Map<string, any>();
      for (const s of scores as any[]) {
        if (tierIds.has(s.wiki_entry_id) && !seen.has(s.wiki_entry_id)) {
          seen.set(s.wiki_entry_id, s);
        }
      }

      const movers = Array.from(seen.values())
        .filter((s) => s.energy_change_24h != null && s.energy_change_24h !== 0)
        .sort((a, b) => Math.abs(b.energy_change_24h) - Math.abs(a.energy_change_24h))
        .slice(0, 4);

      // Fetch top geo target for each mover
      const wikiIds = movers.map((m) => m.wiki_entry_id);
      const { data: geoData } = await supabase
        .from("ktrenz_geo_fan_data" as any)
        .select("wiki_entry_id, country_code, country_name, source, interest_score, listeners")
        .in("wiki_entry_id", wikiIds)
        .order("collected_at", { ascending: false });

      // Build best geo per wiki_entry_id (prefer google_trends interest_score, fallback listeners)
      const geoMap = new Map<string, { country_code: string; country_name: string; source: string }>();
      if (geoData) {
        const seenGeo = new Set<string>();
        const sorted = [...(geoData as any[])].sort((a, b) => {
          const scoreA = a.interest_score > 0 ? a.interest_score : (a.listeners ?? 0) / 1000;
          const scoreB = b.interest_score > 0 ? b.interest_score : (b.listeners ?? 0) / 1000;
          return scoreB - scoreA;
        });
        for (const g of sorted) {
          if (!seenGeo.has(g.wiki_entry_id)) {
            seenGeo.add(g.wiki_entry_id);
            geoMap.set(g.wiki_entry_id, {
              country_code: g.country_code,
              country_name: g.country_name,
              source: g.source,
            });
          }
        }
      }

      return movers.map((s) => {
        // Determine hottest category by highest absolute change
        const categories = [
          { key: "youtube" as const, change: s.youtube_change_24h },
          { key: "buzz" as const, change: s.buzz_change_24h },
          { key: "music" as const, change: s.music_change_24h },
          { key: "album" as const, change: s.album_change_24h },
        ].filter((c) => c.change != null);
        const hotCategory = categories.length > 0
          ? categories.sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))[0]
          : null;

        return {
          wiki_entry_id: s.wiki_entry_id,
          name: s.wiki_entries?.title ?? "—",
          slug: s.wiki_entries?.slug ?? "",
          image_url: s.wiki_entries?.image_url,
          change: s.energy_change_24h,
          score: s.total_score,
          geo: geoMap.get(s.wiki_entry_id) ?? null,
          hotCategory: hotCategory ? { key: hotCategory.key, change: hotCategory.change! } : null,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="relative overflow-hidden border-b border-border/30">
      {/* Background image */}
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

          {/* Right: Hot Movers — single column */}
          {hotMovers.data && hotMovers.data.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t("hero.hotSpots")}
                </span>
              </div>
              <div className="space-y-2">
                {hotMovers.data.map((mover, i) => {
                  const isUp = mover.change > 0;
                  const flag = mover.geo ? (FLAG_EMOJI[mover.geo.country_code] ?? "🌍") : null;
                  return (
                    <Link
                      key={i}
                      to={`/artist/${mover.slug}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm hover:bg-card/80 transition-colors"
                    >
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarImage src={mover.image_url || undefined} className="object-cover" />
                        <AvatarFallback className="bg-muted text-[10px]">{mover.name?.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{mover.name}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          FES {mover.score?.toFixed(1)}
                        </p>
                      </div>
                      {/* Hot category */}
                      {mover.hotCategory && (() => {
                        const meta = CATEGORY_META[mover.hotCategory.key];
                        if (!meta) return null;
                        const CatIcon = meta.icon;
                        return (
                          <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg bg-muted/40">
                            <CatIcon className={cn("w-3 h-3", meta.color)} />
                            <span className="text-[11px] text-muted-foreground font-medium">{meta.label}</span>
                          </div>
                        );
                      })()}
                      {/* Geo target */}
                      {mover.geo && (
                        <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-muted/40">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs">{flag}</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{mover.geo.country_name}</span>
                        </div>
                      )}
                      {/* Change */}
                      <div className={cn(
                        "flex items-center gap-0.5 text-xs font-bold shrink-0",
                        isUp ? "text-emerald-500" : "text-red-500"
                      )}>
                        {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
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
