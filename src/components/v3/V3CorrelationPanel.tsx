import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, ScatterChart, ArrowUpRight, ArrowDownRight, Minus, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ScatterChart as RechartsScatter,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  Area,
} from "recharts";

interface CorrelationPanelProps {
  wikiEntryId: string;
  artistName: string;
}

type ViewMode = "gap" | "timeseries" | "scatter";
type TimeRange = "7d" | "14d" | "30d";

const TIME_RANGES: { key: TimeRange; label: string; days: number }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "14d", label: "14D", days: 14 },
  { key: "30d", label: "30D", days: 30 },
];

const OUTCOME_CATEGORIES = [
  { key: "youtube", label: "YouTube", color: "hsl(0, 80%, 45%)", field: "youtube_score" },
  { key: "buzz", label: "Buzz", color: "hsl(280, 70%, 45%)", field: "buzz_score" },
  { key: "album", label: "Sales", color: "hsl(35, 90%, 42%)", field: "album_score" },
  { key: "music", label: "Music", color: "hsl(145, 70%, 38%)", field: "music_score" },
  { key: "social", label: "Social", color: "hsl(200, 80%, 50%)", field: "social_score" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function V3CorrelationPanel({ wikiEntryId, artistName }: CorrelationPanelProps) {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>("gap");
  const [timeRange, setTimeRange] = useState<TimeRange>("14d");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("youtube");

  const days = TIME_RANGES.find(r => r.key === timeRange)!.days;
  const fromDate = new Date(Date.now() - days * 86400000).toISOString();

  // Fetch FES snapshots (energy_score over time)
  const { data: fesSnapshots, isLoading: fesLoading } = useQuery({
    queryKey: ["correlation-fes", wikiEntryId, timeRange],
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

  // Fetch platform snapshots for growth rates
  const { data: platformSnapshots, isLoading: platLoading } = useQuery({
    queryKey: ["correlation-platform", wikiEntryId, timeRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_data_snapshots" as any)
        .select("platform, metrics, collected_at")
        .eq("wiki_entry_id", wikiEntryId)
        .in("platform", ["youtube", "social_followers", "hanteo", "apple_music_charts", "billboard_charts", "buzz"])
        .gte("collected_at", fromDate)
        .order("collected_at", { ascending: true });
      return (data || []) as any[];
    },
    staleTime: 5 * 60_000,
  });

  // Process data into daily aggregates
  const processedData = useMemo(() => {
    if (!fesSnapshots?.length) return [];

    // Group FES by day (take last snapshot per day)
    const fesByDay = new Map<string, any>();
    for (const snap of fesSnapshots) {
      const day = snap.snapshot_at.slice(0, 10);
      fesByDay.set(day, snap);
    }

    // Group platform data by day
    const platByDay = new Map<string, any>();
    for (const snap of (platformSnapshots || [])) {
      const day = snap.collected_at.slice(0, 10);
      if (!platByDay.has(day)) platByDay.set(day, {});
      const dayData = platByDay.get(day)!;
      dayData[snap.platform] = snap.metrics;
    }

    const days = [...fesByDay.keys()].sort();
    return days.map((day, i) => {
      const fes = fesByDay.get(day);
      const plat = platByDay.get(day) || {};

      // Calculate growth rates from platform data
      const ytSubs = plat.youtube?.subscriberCount || plat.social_followers?.youtube_subscribers || 0;
      const ytViews = plat.youtube?.totalViews || 0;
      const socialTotal = (plat.social_followers?.instagram_followers || 0) +
        (plat.social_followers?.twitter_followers || 0) +
        (plat.social_followers?.tiktok_followers || 0);

      // Calculate deltas from previous day
      const prevDay = i > 0 ? days[i - 1] : null;
      const prevPlat = prevDay ? platByDay.get(prevDay) || {} : {};
      const prevYtSubs = prevPlat.youtube?.subscriberCount || prevPlat.social_followers?.youtube_subscribers || 0;
      const prevSocial = (prevPlat.social_followers?.instagram_followers || 0) +
        (prevPlat.social_followers?.twitter_followers || 0) +
        (prevPlat.social_followers?.tiktok_followers || 0);

      const ytGrowth = prevYtSubs > 0 ? ((ytSubs - prevYtSubs) / prevYtSubs) * 100 : 0;
      const socialGrowth = prevSocial > 0 ? ((socialTotal - prevSocial) / prevSocial) * 100 : 0;

      return {
        date: day,
        dateLabel: formatDate(day),
        fes: Math.round(fes.energy_score || 0),
        youtube: Math.round(fes.youtube_score || 0),
        buzz: Math.round(fes.buzz_score || 0),
        album: Math.round(fes.album_score || 0),
        music: Math.round(fes.music_score || 0),
        social: Math.round(fes.social_score || fes.fan_score || 0),
        ytGrowth: Number(ytGrowth.toFixed(2)),
        socialGrowth: Number(socialGrowth.toFixed(2)),
      };
    });
  }, [fesSnapshots, platformSnapshots]);

  // Gap analysis: FES vs each category score trend
  const gapData = useMemo(() => {
    if (!processedData.length) return [];
    // Normalize: compute per-category "expected" vs FES delta
    const cat = OUTCOME_CATEGORIES.find(c => c.key === selectedOutcome);
    if (!cat) return [];

    return processedData.map(d => {
      const outcomeVal = d[selectedOutcome as keyof typeof d] as number || 0;
      const gap = d.fes - outcomeVal;
      return {
        ...d,
        outcome: outcomeVal,
        gap,
        over: gap > 0,
      };
    });
  }, [processedData, selectedOutcome]);

  // Scatter data: FES vs outcome for each day
  const scatterData = useMemo(() => {
    return processedData.map(d => ({
      fes: d.fes,
      outcome: d[selectedOutcome as keyof typeof d] as number || 0,
      date: d.dateLabel,
    }));
  }, [processedData, selectedOutcome]);

  // Catch-up badge logic: if FES leads outcome by >20% for 2+ days, show badge
  const catchUpBadge = useMemo(() => {
    if (gapData.length < 3) return null;
    const recent3 = gapData.slice(-3);
    const allOver = recent3.every(d => d.gap > 15);
    if (allOver) {
      const avgGap = recent3.reduce((s, d) => s + d.gap, 0) / 3;
      return { type: "catchup" as const, avgGap: Math.round(avgGap) };
    }
    const allUnder = recent3.every(d => d.gap < -15);
    if (allUnder) {
      return { type: "lagging" as const, avgGap: Math.round(recent3.reduce((s, d) => s + Math.abs(d.gap), 0) / 3) };
    }
    return null;
  }, [gapData]);

  const isLoading = fesLoading || platLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!processedData.length) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>{t("correlation.noData")}</p>
      </div>
    );
  }

  const views: { key: ViewMode; icon: typeof BarChart3; label: string }[] = [
    { key: "gap", icon: BarChart3, label: t("correlation.gapBar") },
    { key: "timeseries", icon: TrendingUp, label: t("correlation.timeSeries") },
    { key: "scatter", icon: ScatterChart, label: t("correlation.scatter") },
  ];

  const selectedCat = OUTCOME_CATEGORIES.find(c => c.key === selectedOutcome)!;

  return (
    <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5 text-primary" />
        {t("correlation.title")}
      </p>

      {/* View mode tabs */}
      <div className="flex gap-1">
        {views.map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors",
              viewMode === v.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            <v.icon className="w-3 h-3" />
            {v.label}
          </button>
        ))}
      </div>

      {/* Time range + outcome selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className={cn(
                "text-[9px] font-bold px-2 py-1 rounded-md transition-colors",
                timeRange === r.key
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {OUTCOME_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedOutcome(cat.key)}
              className={cn(
                "text-[9px] font-semibold px-1.5 py-0.5 rounded-md transition-colors whitespace-nowrap",
                selectedOutcome === cat.key
                  ? "text-white"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
              style={selectedOutcome === cat.key ? { backgroundColor: cat.color } : undefined}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Catch-up badge */}
      {catchUpBadge && (
        <div className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold",
          catchUpBadge.type === "catchup"
            ? "bg-green-500/10 border border-green-500/30 text-green-400"
            : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
        )}>
          {catchUpBadge.type === "catchup" ? (
            <>
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{t("correlation.catchUpBadge").replace("{gap}", String(catchUpBadge.avgGap))}</span>
            </>
          ) : (
            <>
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{t("correlation.laggingBadge").replace("{gap}", String(catchUpBadge.avgGap))}</span>
            </>
          )}
        </div>
      )}

      {/* Chart area */}
      <div className="h-48">
        {viewMode === "gap" && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={gapData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "gap") return [`${value > 0 ? "+" : ""}${value}`, "Gap"];
                  if (name === "fes") return [value, "FES"];
                  return [value, selectedCat.label];
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Bar dataKey="gap" radius={[4, 4, 0, 0]}>
                {gapData.map((entry, index) => (
                  <Cell key={index} fill={entry.over ? "hsl(145, 70%, 45%)" : "hsl(0, 70%, 55%)"} fillOpacity={0.7} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="fes" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="outcome" stroke={selectedCat.color} strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {viewMode === "timeseries" && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={processedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
              <Area
                type="monotone"
                dataKey="fes"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.08}
                strokeWidth={2}
                dot={false}
                name="FES"
              />
              {OUTCOME_CATEGORIES.map(cat => (
                <Line
                  key={cat.key}
                  type="monotone"
                  dataKey={cat.key}
                  stroke={cat.color}
                  strokeWidth={selectedOutcome === cat.key ? 2 : 1}
                  dot={false}
                  opacity={selectedOutcome === cat.key ? 1 : 0.25}
                  name={cat.label}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {viewMode === "scatter" && (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsScatter margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                type="number"
                dataKey="fes"
                name="FES"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                label={{ value: "FES", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                type="number"
                dataKey="outcome"
                name={selectedCat.label}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                label={{ value: selectedCat.label, angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              />
              <ZAxis range={[30, 30]} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                formatter={(value: number, name: string) => [value, name]}
              />
              <Scatter data={scatterData} fill={selectedCat.color} fillOpacity={0.6} />
            </RechartsScatter>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded-full bg-primary inline-block" /> FES
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: selectedCat.color }} />
          {selectedCat.label}
        </span>
        {viewMode === "gap" && (
          <>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(145, 70%, 45%)", opacity: 0.7 }} />
              Over
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(0, 70%, 55%)", opacity: 0.7 }} />
              Under
            </span>
          </>
        )}
      </div>
    </div>
  );
}
