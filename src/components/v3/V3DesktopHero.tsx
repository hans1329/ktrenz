import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Zap, TrendingUp, TrendingDown, MapPin } from "lucide-react";
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

  const { data: topArtists } = useQuery({
    queryKey: ["hero-top-artists"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_artists" as any)
        .select("id, name, slug, image_url, total_score, velocity_score, intensity_score")
        .order("total_score", { ascending: false })
        .limit(5);
      return (data ?? []) as any[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch latest geo spike signals for the #1 artist
  const topArtistId = topArtists?.[0]?.id;
  const { data: hotSpots } = useQuery({
    queryKey: ["hero-hot-spots", topArtistId],
    queryFn: async () => {
      if (!topArtistId) return [];
      const { data } = await supabase
        .from("ktrenz_geo_change_signals" as any)
        .select("country_code, country_name, change_rate, spike_direction, source, detected_at")
        .eq("wiki_entry_id", topArtistId)
        .eq("is_spike", true)
        .order("detected_at", { ascending: false })
        .limit(4);
      return (data ?? []) as any[];
    },
    enabled: !!topArtistId,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <section className="relative overflow-hidden border-b border-border/30">
      {/* Background image */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src={heroVisual}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
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
                  {hotSpots.map((spot: any, i: number) => {
                    const isSurge = spot.spike_direction === "surge";
                    const flag = FLAG_EMOJI[spot.country_code] || "🌍";
                    const rate = Math.abs(spot.change_rate ?? 0);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl border backdrop-blur-sm transition-colors",
                          isSurge
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : "bg-red-500/5 border-red-500/20"
                        )}
                      >
                        <span className="text-lg shrink-0">{flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {spot.country_name}
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">{spot.source}</p>
                        </div>
                        <div className={cn(
                          "flex items-center gap-0.5 text-xs font-bold shrink-0",
                          isSurge ? "text-emerald-500" : "text-red-500"
                        )}>
                          {isSurge ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {rate > 0 ? `${rate.toFixed(0)}%` : "NEW"}
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
                    key={artist.id}
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
                          V {artist.velocity_score?.toFixed(1) ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          I {artist.intensity_score?.toFixed(1) ?? "—"}
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
