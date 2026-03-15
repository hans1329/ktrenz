import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Link2 } from "lucide-react";

interface Props {
  wikiEntryId: string;
  artistName: string;
}

const CATS = [
  { key: "youtube", label: "YouTube" },
  { key: "buzz", label: "Buzz" },
  { key: "album", label: "Sales" },
  { key: "music", label: "Music" },
  { key: "social", label: "Social" },
] as const;

// Known causal pairs: [driver, follower, translationKeySuffix]
const CAUSAL_PAIRS: [string, string, string][] = [
  ["youtube", "music", "ytToMusic"],     // MV views → streams
  ["youtube", "buzz", "ytToBuzz"],       // MV views → online buzz
  ["buzz", "album", "buzzToSales"],      // buzz → album sales
  ["social", "buzz", "socialToBuzz"],    // follower growth → buzz
  ["music", "social", "musicToSocial"],  // chart performance → follower gain
  ["buzz", "music", "buzzToMusic"],      // viral buzz → streaming spike
  ["album", "buzz", "salesToBuzz"],      // sales records → media buzz
];

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

export default function V3CorrelationSummaryCard({ wikiEntryId, artistName }: Props) {
  const { t } = useLanguage();
  const fromDate = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: snapshots } = useQuery({
    queryKey: ["correlation-summary", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("v3_energy_snapshots_v2" as any)
        .select("energy_score, youtube_score, buzz_score, album_score, music_score, social_score, fan_score, snapshot_at")
        .eq("wiki_entry_id", wikiEntryId)
        .gte("snapshot_at", fromDate)
        .order("snapshot_at", { ascending: true });
      return (data || []) as any[];
    },
    staleTime: 5 * 60_000,
  });

  const insight = useMemo(() => {
    if (!snapshots?.length || snapshots.length < 4) return null;

    const byDay = new Map<string, any>();
    for (const s of snapshots) byDay.set(s.snapshot_at.slice(0, 10), s);
    const days = [...byDay.values()];
    if (days.length < 4) return null;

    const getScore = (d: any, key: string) =>
      d[`${key}_score`] || (key === "social" ? d.fan_score || 0 : 0);

    // Build time series per category
    const series: Record<string, number[]> = {};
    for (const c of CATS) {
      series[c.key] = days.map(d => getScore(d, c.key));
    }

    // Find strongest causal pair with lag-1 correlation
    // Driver's values at t correlate with follower's values at t+1
    let bestPair: { driver: string; follower: string; r: number; tKey: string } | null = null;

    for (const [driverKey, followerKey, tKey] of CAUSAL_PAIRS) {
      const driverSeries = series[driverKey];
      const followerSeries = series[followerKey];
      if (!driverSeries || !followerSeries) continue;

      // Lag-1: driver[0..n-2] vs follower[1..n-1]
      const xs = driverSeries.slice(0, -1);
      const ys = followerSeries.slice(1);
      const r = pearsonR(xs, ys);

      if (Math.abs(r) > (bestPair?.r ?? 0.3)) {
        bestPair = { driver: driverKey, follower: followerKey, r: Math.abs(r), tKey };
      }
    }

    if (!bestPair) return null;

    const driverLabel = CATS.find(c => c.key === bestPair!.driver)!.label;
    const followerLabel = CATS.find(c => c.key === bestPair!.follower)!.label;

    // Determine direction: is driver rising or falling?
    const dSeries = series[bestPair.driver];
    const recent = dSeries.slice(-3);
    const earlier = dSeries.slice(-6, -3);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgEarlier = earlier.length ? earlier.reduce((a, b) => a + b, 0) / earlier.length : avgRecent;
    const rising = avgRecent >= avgEarlier;

    const strengthKey = bestPair.r > 0.7 ? "strong" : "moderate";

    return {
      tKey: bestPair.tKey,
      driverLabel,
      followerLabel,
      rising,
      strengthKey,
    };
  }, [snapshots]);

  if (!insight) return null;

  return (
    <div className={cn(
      "w-full rounded-2xl overflow-hidden",
      "border border-foreground/[0.06]",
      "bg-foreground/[0.03]",
    )}>
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">
            {t("causalInsight.title")}
          </span>
        </div>

        <p className="text-xs text-foreground/80 leading-relaxed">
          {t(`causalInsight.${insight.tKey}.${insight.rising ? "up" : "down"}`)
            .replace("{artist}", artistName)}
        </p>

        <span className={cn(
          "inline-block text-[10px] font-bold px-2 py-0.5 rounded-full",
          insight.strengthKey === "strong"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-foreground/5 text-foreground/40"
        )}>
          {t(`causalInsight.strength.${insight.strengthKey}`)}
        </span>
      </div>
    </div>
  );
}
