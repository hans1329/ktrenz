import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Sparkles, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface InsightsPanelProps {
  wikiEntryId: string;
  artistName: string;
}

const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  youtube: { label: "YouTube", color: "hsl(0, 80%, 45%)", icon: "🎬" },
  buzz: { label: "Buzz", color: "hsl(280, 70%, 45%)", icon: "💬" },
  album: { label: "Album", color: "hsl(35, 90%, 42%)", icon: "💿" },
  music: { label: "Music", color: "hsl(145, 70%, 38%)", icon: "🎵" },
  social: { label: "Social", color: "hsl(200, 80%, 50%)", icon: "👥" },
};

const DIRECTION_KEYS: Record<string, { labelKey: string; color: string; icon: typeof TrendingUp }> = {
  rising: { labelKey: "insights.rising", color: "text-green-400", icon: TrendingUp },
  spike: { labelKey: "insights.spike", color: "text-pink-400", icon: ArrowUpRight },
  falling: { labelKey: "insights.falling", color: "text-red-400", icon: TrendingDown },
  flat: { labelKey: "insights.flat", color: "text-muted-foreground", icon: Minus },
};

export default function V3InsightsPanel({ wikiEntryId, artistName }: InsightsPanelProps) {
  const { t } = useLanguage();

  // 1) Latest contribution data
  const { data: contrib, isLoading: contribLoading } = useQuery({
    queryKey: ["fes-contribution", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_fes_contributions" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    staleTime: 5 * 60_000,
  });

  // 2) Category trends
  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ["category-trends", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_category_trends" as any)
        .select("*")
        .eq("wiki_entry_id", wikiEntryId)
        .order("calculated_at", { ascending: false })
        .limit(5);
      // Get only latest per category
      const latest = new Map<string, any>();
      for (const row of (data || []) as any[]) {
        if (!latest.has(row.category)) latest.set(row.category, row);
      }
      return latest;
    },
    staleTime: 5 * 60_000,
  });

  // 3) AI prediction
  const { data: prediction, isLoading: predLoading } = useQuery({
    queryKey: ["fes-prediction", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_prediction_logs" as any)
        .select("prediction, reasoning, predicted_at")
        .eq("wiki_entry_id", wikiEntryId)
        .order("predicted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    staleTime: 5 * 60_000,
  });

  const isLoading = contribLoading || trendsLoading || predLoading;
  const hasData = contrib || (trends && trends.size > 0) || prediction;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>{t("insights.noData")}</p>
      </div>
    );
  }

  // Build contribution bars
  const categories = ["youtube", "buzz", "album", "music", "social"];
  const contribValues = categories.map(cat => ({
    key: cat,
    contrib: contrib?.[`${cat}_contrib`] || 0,
    z: contrib?.[`${cat}_z`] || 0,
    ...CATEGORY_META[cat],
  }));
  const leading = contrib?.leading_category || "youtube";

  return (
    <div className="space-y-4">
      {/* ── Leading Category Highlight ── */}
      {contrib && (
        <div className="rounded-xl bg-muted/30 border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {t("insights.leadingCategory")}
          </p>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{CATEGORY_META[leading]?.icon}</span>
            <div>
              <p className="text-sm font-black text-foreground">
                {CATEGORY_META[leading]?.label}{" "}
                <span className="text-primary font-bold">
                  {contribValues.find(c => c.key === leading)?.contrib || 0}%
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t("insights.drivingGrowth")}
              </p>
            </div>
          </div>

          {/* Contribution bar */}
          <div className="flex h-5 rounded-full overflow-hidden bg-muted/50">
            {contribValues
              .filter(c => c.contrib > 0)
              .sort((a, b) => b.contrib - a.contrib)
              .map(c => (
                <div
                  key={c.key}
                  className={cn(
                    "h-full flex items-center justify-center text-[8px] font-bold transition-all",
                    c.key === leading ? "text-white" : "text-white/70"
                  )}
                  style={{
                    width: `${c.contrib}%`,
                    backgroundColor: c.color,
                    minWidth: c.contrib > 0 ? "16px" : "0",
                  }}
                >
                  {c.contrib >= 12 ? `${c.contrib}%` : ""}
                </div>
              ))}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {contribValues.map(c => (
              <div key={c.key} className="flex items-center gap-1 text-[10px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c.color }} />
                <span className={cn(
                  "text-muted-foreground",
                  c.key === leading && "text-foreground font-bold"
                )}>
                  {c.label} {c.contrib}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trend Direction Signals ── */}
      {trends && trends.size > 0 && (
        <div className="rounded-xl bg-muted/30 border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            {t("insights.trendSignals")}
          </p>
          <div className="space-y-1.5">
            {categories.map(cat => {
              const trend = trends.get(cat);
              if (!trend) return null;
              const dir = DIRECTION_CONFIG[trend.trend_direction] || DIRECTION_CONFIG.flat;
              const DirIcon = dir.icon;
              const momentum = trend.momentum || 0;

              return (
                <div key={cat} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{CATEGORY_META[cat]?.icon}</span>
                    <span className="text-xs font-semibold text-foreground">{CATEGORY_META[cat]?.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Momentum badge */}
                    {momentum !== 0 && (
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        momentum > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {momentum > 0 ? "+" : ""}{momentum.toFixed(2)}
                      </span>
                    )}
                    {/* Direction badge */}
                    <span className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full",
                      trend.trend_direction === "spike" && "bg-pink-500/15 text-pink-400",
                      trend.trend_direction === "rising" && "bg-green-500/15 text-green-400",
                      trend.trend_direction === "falling" && "bg-red-500/15 text-red-400",
                      trend.trend_direction === "flat" && "bg-muted text-muted-foreground",
                    )}>
                      <DirIcon className="w-3 h-3" />
                      {dir.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── AI Interpretation Card ── */}
      {prediction && (
        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 p-3">
          <p className="text-[10px] text-primary uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {t("insights.aiAnalysis")}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              prediction.prediction === "rising" && "bg-green-500/15 text-green-400",
              prediction.prediction === "spike" && "bg-pink-500/15 text-pink-400",
              prediction.prediction === "falling" && "bg-red-500/15 text-red-400",
              prediction.prediction === "stable" && "bg-muted text-muted-foreground",
            )}>
              {prediction.prediction === "rising" ? "📈 Rising" :
               prediction.prediction === "spike" ? "🚀 Spike" :
               prediction.prediction === "falling" ? "📉 Falling" : "→ Stable"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t("insights.next48h")}
            </span>
          </div>
          {prediction.reasoning && (
            <p className="text-xs text-foreground/80 leading-relaxed">
              {prediction.reasoning}
            </p>
          )}
          <p className="text-[9px] text-muted-foreground mt-2">
            {new Date(prediction.predicted_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
