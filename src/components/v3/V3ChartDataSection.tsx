import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Disc3, Music, BarChart3, TrendingUp } from "lucide-react";

interface V3ChartDataSectionProps {
  wikiEntryId: string;
}

const formatNumber = (n: number | undefined | null) => {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
};

const V3ChartDataSection = ({ wikiEntryId }: V3ChartDataSectionProps) => {
  // Hanteo daily sales
  const { data: hanteoData } = useQuery({
    queryKey: ["chart-hanteo", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_data_snapshots" as any)
        .select("metrics, collected_at")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "hanteo_daily")
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    staleTime: 60_000,
  });

  // Apple Music charts (multiple entries per collection)
  const { data: appleMusicData } = useQuery({
    queryKey: ["chart-apple-music", wikiEntryId],
    queryFn: async () => {
      // Get most recent batch (within last 12 hours)
      const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
      const { data } = await supabase
        .from("ktrenz_data_snapshots" as any)
        .select("metrics, collected_at")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "apple_music_chart")
        .gte("collected_at", cutoff)
        .order("collected_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
    staleTime: 60_000,
  });

  // Billboard charts (multiple chart types per collection)
  const { data: billboardData } = useQuery({
    queryKey: ["chart-billboard", wikiEntryId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { data } = await supabase
        .from("ktrenz_data_snapshots" as any)
        .select("metrics, collected_at")
        .eq("wiki_entry_id", wikiEntryId)
        .eq("platform", "billboard_chart")
        .gte("collected_at", cutoff)
        .order("collected_at", { ascending: false })
        .limit(10);
      return (data as any[]) || [];
    },
    staleTime: 60_000,
  });

  const hasHanteo = hanteoData?.metrics;
  const hasAppleMusic = appleMusicData && appleMusicData.length > 0;
  const hasBillboard = billboardData && billboardData.length > 0;

  if (!hasHanteo && !hasAppleMusic && !hasBillboard) return null;

  // Deduplicate Apple Music by country (keep latest)
  const uniqueAppleMusic = hasAppleMusic
    ? Array.from(
        new Map(
          appleMusicData.map((item: any) => [item.metrics?.country, item])
        ).values()
      ).sort((a: any, b: any) => (a.metrics?.chart_position || 999) - (b.metrics?.chart_position || 999))
    : [];

  // Deduplicate Billboard by chart_id (keep latest)
  const uniqueBillboard = hasBillboard
    ? Array.from(
        new Map(
          billboardData.map((item: any) => [item.metrics?.chart_id, item])
        ).values()
      ).sort((a: any, b: any) => (a.metrics?.position || 999) - (b.metrics?.position || 999))
    : [];

  return (
    <>
      {/* Hanteo */}
      {hasHanteo && (
        <>
          <div className="flex items-center gap-2 mt-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-foreground font-bold flex items-center gap-1.5">
              <Disc3 className="w-4 h-4 text-amber-500" /> Album Data
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Card className="p-4 bg-card border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {hanteoData.metrics.chart_type === "daily_sales" ? "Daily Album Sales" : "Album Sales"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(hanteoData.collected_at).toLocaleDateString()}
              </span>
            </div>
            {hanteoData.metrics.albums?.map((album: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3 py-2">
                <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-sm font-black text-amber-500">
                  #{album.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{album.album}</p>
                  <p className="text-[10px] text-muted-foreground">{album.artist}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-foreground">{formatNumber(album.daily_sales)}</p>
                  <p className="text-[10px] text-muted-foreground">copies</p>
                </div>
              </div>
            ))}
            {hanteoData.metrics.chart_bonus > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Chart Bonus
                </span>
                <span className="text-xs font-bold text-amber-500">+{formatNumber(hanteoData.metrics.chart_bonus)} pts</span>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Apple Music */}
      {hasAppleMusic && uniqueAppleMusic.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-foreground font-bold flex items-center gap-1.5">
              <Music className="w-4 h-4 text-pink-500" /> Music Charts
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Card className="p-4 bg-card border-border/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {(uniqueAppleMusic[0] as any).metrics?.album_name || "Album"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {uniqueAppleMusic.length} countries
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {uniqueAppleMusic.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="text-lg font-black text-pink-500 w-8 text-center">
                    #{item.metrics?.chart_position}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {item.metrics?.country_label}
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase">
                      {item.metrics?.country}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Billboard */}
      {hasBillboard && (
        <>
          <div className="flex items-center gap-2 mt-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-foreground font-bold flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Billboard
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Card className="p-4 bg-card border-border/50">
            {uniqueBillboard.map((entry: any, idx: number) => (
              <div key={idx} className={cn("flex items-center gap-3", idx > 0 && "mt-3 pt-3 border-t border-border/30")}>
                <span className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center text-lg font-black text-blue-600 shrink-0">
                  #{entry.metrics?.position}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {entry.metrics?.song_or_album || "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.metrics?.chart_name || "Billboard"}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
};

export default V3ChartDataSection;
