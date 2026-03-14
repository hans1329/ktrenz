import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus, Zap, BarChart3 } from "lucide-react";

interface Props {
  wikiEntryId: string;
  artistName: string;
}

const CATEGORIES = [
  { key: "youtube", label: "YouTube", emoji: "📺" },
  { key: "buzz", label: "Buzz", emoji: "💬" },
  { key: "album", label: "Album", emoji: "💿" },
  { key: "music", label: "Music", emoji: "🎵" },
  { key: "social", label: "Social", emoji: "📱" },
] as const;

export default function V3CorrelationInsightCard({ wikiEntryId, artistName }: Props) {
  const { t } = useLanguage();
  const fromDate = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: snapshots } = useQuery({
    queryKey: ["correlation-insight", wikiEntryId],
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

  const analysis = useMemo(() => {
    if (!snapshots?.length || snapshots.length < 3) return null;

    // Group by day, take last per day
    const byDay = new Map<string, any>();
    for (const s of snapshots) {
      byDay.set(s.snapshot_at.slice(0, 10), s);
    }
    const days = [...byDay.values()];
    if (days.length < 3) return null;

    // Category strength analysis
    const latest = days[days.length - 1];
    const fes = latest.energy_score || 0;

    const catScores = CATEGORIES.map(c => {
      const score = latest[`${c.key}_score`] || (c.key === "social" ? latest.fan_score || 0 : 0);
      const gap = fes - score;
      return { ...c, score, gap };
    });

    // Sort: most behind (highest positive gap = FES leads, performance lags)
    const weakest = [...catScores].sort((a, b) => b.gap - a.gap)[0];
    const strongest = [...catScores].sort((a, b) => a.gap - b.gap)[0];

    // Catch-up badge: check last 3 days
    const recent3 = days.slice(-3);
    let catchUp: { type: "catchup" | "lagging"; category: string } | null = null;

    // Check against the weakest category
    const allOver = recent3.every(d => {
      const s = d[`${weakest.key}_score`] || (weakest.key === "social" ? d.fan_score || 0 : 0);
      return (d.energy_score || 0) - s > 15;
    });
    if (allOver) catchUp = { type: "catchup", category: weakest.label };

    const allUnder = recent3.every(d => {
      const s = d[`${strongest.key}_score`] || (strongest.key === "social" ? d.fan_score || 0 : 0);
      return (d.energy_score || 0) - s < -15;
    });
    if (allUnder) catchUp = { type: "lagging", category: strongest.label };

    return { fes, catScores, weakest, strongest, catchUp };
  }, [snapshots]);

  if (!analysis) return null;

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden",
        "border border-indigo-500/20",
        "bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-cyan-500/5",
      )}
    >
      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">
            {t("correlationInsight.title")}
          </span>
        </div>

        {/* Channel strength bars */}
        <div className="space-y-2">
          {analysis.catScores.map(cat => {
            const maxScore = Math.max(analysis.fes, ...analysis.catScores.map(c => c.score), 1);
            const pct = Math.min((cat.score / maxScore) * 100, 100);
            const isWeak = cat.key === analysis.weakest.key;
            const isStrong = cat.key === analysis.strongest.key;

            return (
              <div key={cat.key} className="flex items-center gap-2">
                <span className="text-sm w-6 text-center">{cat.emoji}</span>
                <span className="text-xs w-14 font-medium text-foreground/70">{cat.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isWeak ? "bg-amber-400/70" : isStrong ? "bg-emerald-400/70" : "bg-foreground/20"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn(
                  "text-xs font-bold w-10 text-right tabular-nums",
                  isWeak ? "text-amber-400" : isStrong ? "text-emerald-400" : "text-foreground/50"
                )}>
                  {Math.round(cat.score)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Action insight */}
        <div className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs font-bold text-amber-300/80 uppercase tracking-wider">
              {t("correlationInsight.focusArea")}
            </p>
          </div>
          <p className="text-sm sm:text-base text-foreground/90 font-medium leading-snug">
            {analysis.weakest.emoji} {t("correlationInsight.weakChannel")
              .replace("{channel}", analysis.weakest.label)
              .replace("{artist}", artistName)}
          </p>
        </div>

        {/* Catch-up badge */}
        {analysis.catchUp && (
          <div className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold",
            analysis.catchUp.type === "catchup"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
          )}>
            {analysis.catchUp.type === "catchup" ? (
              <>
                <ArrowUpRight className="w-4 h-4" />
                <span>{t("correlationInsight.catchUpHint").replace("{channel}", analysis.catchUp.category)}</span>
              </>
            ) : (
              <>
                <ArrowDownRight className="w-4 h-4" />
                <span>{t("correlationInsight.laggingHint").replace("{channel}", analysis.catchUp.category)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
