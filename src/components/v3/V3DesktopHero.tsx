import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Zap, MapPin, Globe } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import heroVisual from "@/assets/hero-visual.webp";

const FLAG_EMOJI: Record<string, string> = {
  US: "🇺🇸", KR: "🇰🇷", JP: "🇯🇵", BR: "🇧🇷", MX: "🇲🇽", IN: "🇮🇳", ID: "🇮🇩",
  TH: "🇹🇭", PH: "🇵🇭", DE: "🇩🇪", FR: "🇫🇷", GB: "🇬🇧", TR: "🇹🇷", VN: "🇻🇳",
  AR: "🇦🇷", CL: "🇨🇱", CO: "🇨🇴", PL: "🇵🇱", IT: "🇮🇹", ES: "🇪🇸", CA: "🇨🇦",
  AU: "🇦🇺", RU: "🇷🇺", SA: "🇸🇦", EG: "🇪🇬", NG: "🇳🇬", MY: "🇲🇾", SG: "🇸🇬",
  TW: "🇹🇼", HK: "🇭🇰", CN: "🇨🇳", NL: "🇳🇱", SE: "🇸🇪", PE: "🇵🇪",
};

const V3DesktopHero = () => {
  const { t } = useLanguage();

  // Get top 5 from v3_scores_v2 (which has wiki_entry_id)
  const { data: topArtists } = useQuery({
    queryKey: ["hero-top-artists-v2"],
    queryFn: async () => {
      // Get tier 1 IDs first
      const { data: tiers } = await supabase
        .from("v3_artist_tiers" as any)
        .select("wiki_entry_id")
        .eq("tier", 1);
      const tierIds = new Set((tiers ?? []).map((t: any) => t.wiki_entry_id));

      const { data: scores } = await supabase
        .from("v3_scores_v2" as any)
        .select(`wiki_entry_id, total_score, energy_score, energy_change_24h,
          wiki_entries:wiki_entry_id (id, title, slug, image_url)`)
        .order("scored_at", { ascending: false });

      if (!scores?.length) return [];

      // Dedupe by wiki_entry_id, keep latest, filter tier 1
      const seen = new Map<string, any>();
      for (const s of scores as any[]) {
        if (tierIds.has(s.wiki_entry_id) && !seen.has(s.wiki_entry_id)) {
          seen.set(s.wiki_entry_id, s);
        }
      }

      return Array.from(seen.values())
        .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0))
        .slice(0, 5)
        .map((s) => ({
          wiki_entry_id: s.wiki_entry_id,
          name: s.wiki_entries?.title ?? "—",
          slug: s.wiki_entries?.slug ?? "",
          image_url: s.wiki_entries?.image_url,
          total_score: s.total_score,
          energy_score: s.energy_score,
          energy_change: s.energy_change_24h,
        }));
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch top geo fan data for #1 artist
  const topWikiId = topArtists?.[0]?.wiki_entry_id;
  const { data: hotSpots } = useQuery({
    queryKey: ["hero-hot-spots", topWikiId],
    queryFn: async () => {
      if (!topWikiId) return [];

      // First try spike signals
      const { data: spikes } = await supabase
        .from("ktrenz_geo_change_signals" as any)
        .select("country_code, country_name, change_rate, spike_direction, source")
        .eq("wiki_entry_id", topWikiId)
        .eq("is_spike", true)
        .order("detected_at", { ascending: false })
        .limit(4);

      if (spikes && spikes.length > 0) {
        return (spikes as any[]).map((s) => ({
          country_code: s.country_code,
          country_name: s.country_name,
          value: Math.abs(s.change_rate ?? 0),
          label: s.change_rate ? `${s.change_rate > 0 ? "+" : ""}${s.change_rate.toFixed(0)}%` : "NEW",
          source: s.source,
          type: "spike" as const,
        }));
      }

      // Fallback: show top listener countries
      const { data: geoFans } = await supabase
        .from("ktrenz_geo_fan_data" as any)
        .select("country_code, country_name, listeners, source")
        .eq("wiki_entry_id", topWikiId)
        .not("listeners", "is", null)
        .order("listeners", { ascending: false })
        .limit(20);

      if (!geoFans?.length) return [];

      // Dedupe by country
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const g of geoFans as any[]) {
        if (!seen.has(g.country_code)) {
          seen.add(g.country_code);
          unique.push(g);
        }
        if (unique.length >= 4) break;
      }

      return unique.map((g) => ({
        country_code: g.country_code,
        country_name: g.country_name,
        value: g.listeners,
        label: g.listeners >= 1000 ? `${(g.listeners / 1000).toFixed(0)}K` : `${g.listeners}`,
        source: g.source,
        type: "listeners" as const,
      }));
    },
    enabled: !!topWikiId,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="relative overflow-hidden border-b border-border/30">
      {/* Background image */}
      <div className="absolute inset-0 pointer-events-none">
        <img src={heroVisual} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 gap-12 items-center">
          {/* Left: Copy + Hot Spots */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wide uppercase">
                {t("hero.badge")}
              </span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-extrabold text-foreground leading-tight tracking-tight whitespace-pre-line">
              {t("hero.title")}
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-lg whitespace-pre-line">
              {t("hero.subtitle")}
            </p>

            {/* Hot Spots Cards */}
            {hotSpots && hotSpots.length > 0 && topArtists?.[0] && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("hero.hotSpots")}
                  </span>
                  <span className="text-xs font-bold text-foreground">{topArtists[0].name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {hotSpots.map((spot, i) => {
                    const flag = FLAG_EMOJI[spot.country_code] || "🌍";
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm"
                      >
                        <span className="text-lg shrink-0">{flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {spot.country_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">{spot.source}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Globe className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-bold text-primary tabular-nums">
                            {spot.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Top artists showcase */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-md">
              <div className="space-y-3">
                {topArtists?.slice(0, 5).map((artist, i) => (
                  <Link
                    key={artist.wiki_entry_id}
                    to={`/artist/${artist.slug}`}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 group",
                      i === 0
                        ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5"
                        : "bg-card/60 border-border/50 hover:border-primary/20 hover:bg-card/80"
                    )}
                  >
                    <span className={cn(
                      "text-sm font-bold w-6 text-center shrink-0",
                      i === 0 ? "text-primary" : "text-muted-foreground"
                    )}>
                      {i + 1}
                    </span>
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarImage src={artist.image_url || undefined} className="object-cover" />
                      <AvatarFallback className="bg-muted text-xs">{artist.name?.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-semibold text-sm truncate",
                        i === 0 ? "text-foreground" : "text-foreground/80"
                      )}>
                        {artist.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          E {artist.energy_score?.toFixed(0) ?? "—"}
                        </span>
                        <span className={cn(
                          "text-xs font-medium",
                          (artist.energy_change ?? 0) > 0 ? "text-emerald-500" : (artist.energy_change ?? 0) < 0 ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {artist.energy_change != null ? `${artist.energy_change > 0 ? "+" : ""}${artist.energy_change.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn(
                        "text-lg font-bold tabular-nums",
                        i === 0 ? "text-primary" : "text-foreground"
                      )}>
                        {artist.total_score?.toFixed(1) ?? "—"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default V3DesktopHero;
