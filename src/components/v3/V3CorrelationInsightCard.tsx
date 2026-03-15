import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  Rocket, Play, MessageSquare, ShoppingBag, Music, Users,
  ExternalLink, Sparkles, AlertTriangle,
} from "lucide-react";

interface Props {
  wikiEntryId: string;
  artistName: string;
  artistSlug?: string;
}

const CATEGORIES = [
  { key: "youtube", label: "YouTube", emoji: "📺", icon: Play },
  { key: "buzz", label: "Buzz", emoji: "💬", icon: MessageSquare },
  { key: "album", label: "Sales", emoji: "💿", icon: ShoppingBag },
  { key: "music", label: "Music", emoji: "🎵", icon: Music },
  { key: "social", label: "Social", emoji: "📱", icon: Users },
] as const;

export default function V3CorrelationInsightCard({ wikiEntryId, artistName, artistSlug }: Props) {
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

    const byDay = new Map<string, any>();
    for (const s of snapshots) {
      byDay.set(s.snapshot_at.slice(0, 10), s);
    }
    const days = [...byDay.values()];
    if (days.length < 3) return null;

    const latest = days[days.length - 1];
    const weekAgoIdx = Math.max(0, days.length - 8);
    const weekAgo = days[weekAgoIdx];

    const getScore = (d: any, key: string) =>
      d[`${key}_score`] || (key === "social" ? d.fan_score || 0 : 0);

    const catDeltas = CATEGORIES.map(c => {
      const now = getScore(latest, c.key);
      const prev = getScore(weekAgo, c.key);
      const delta = prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? 100 : 0;
      return { ...c, score: now, delta: Math.round(delta) };
    });

    const sorted = [...catDeltas].sort((a, b) => a.delta - b.delta);
    // Bottom 2 weakest channels
    const weakChannels = sorted.filter(c => c.delta < 20).slice(0, 2);
    if (weakChannels.length === 0) {
      // All channels doing fine — show the lowest anyway
      weakChannels.push(sorted[0]);
    }

    const strongest = sorted[sorted.length - 1];

    // Overall health
    const avgDelta = catDeltas.reduce((s, c) => s + c.delta, 0) / catDeltas.length;

    return { catDeltas, weakChannels, strongest, avgDelta };
  }, [snapshots]);

  if (!analysis) return null;

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden",
        "border border-amber-500/20",
        "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-rose-500/5",
      )}
    >
      <div className="relative p-4 sm:p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Rocket className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
              {t("boostGuide.title")}
            </span>
          </div>
          {analysis.avgDelta > 15 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              {t("boostGuide.goodMomentum")}
            </span>
          )}
        </div>

        {/* Weak channel action cards */}
        <div className="space-y-2">
          {analysis.weakChannels.map(cat => {
            const actionKey = `boostGuide.action.${cat.key}` as string;
            const tipKey = `boostGuide.tip.${cat.key}` as string;
            const Icon = cat.icon;

            return (
              <div
                key={cat.key}
                className={cn(
                  "rounded-xl bg-white/[0.07] border border-white/10 px-3.5 py-3 space-y-1.5",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground/90">
                        {cat.emoji} {cat.label}
                      </p>
                      <p className="text-[10px] text-foreground/40 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {cat.delta >= 0 ? "+" : ""}{cat.delta}% {t("boostGuide.weeklyChange")}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-foreground/70 leading-relaxed pl-9">
                  {t(actionKey).replace("{artist}", artistName)}
                </p>

                <p className="text-[10px] text-amber-400/70 font-medium pl-9 flex items-center gap-1">
                  <ExternalLink className="w-2.5 h-2.5" />
                  {t(tipKey)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Strongest channel praise */}
        {analysis.strongest.delta > 5 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300/90 font-medium leading-snug">
              {t("boostGuide.strongChannel")
                .replace("{channel}", analysis.strongest.label)
                .replace("{delta}", `+${analysis.strongest.delta}%`)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
