import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

interface Props {
  wikiEntryId: string;
  artistName: string;
}

const CATS = [
  { key: "youtube", label: "YouTube", hot: "🔥", warm: "😊", cold: "❄️" },
  { key: "buzz", label: "Buzz", hot: "🔥", warm: "😊", cold: "❄️" },
  { key: "album", label: "Sales", hot: "🔥", warm: "😊", cold: "❄️" },
  { key: "music", label: "Music", hot: "🔥", warm: "😊", cold: "❄️" },
  { key: "social", label: "Social", hot: "🔥", warm: "😊", cold: "❄️" },
] as const;

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

  const result = useMemo(() => {
    if (!snapshots?.length || snapshots.length < 3) return null;

    const byDay = new Map<string, any>();
    for (const s of snapshots) byDay.set(s.snapshot_at.slice(0, 10), s);
    const days = [...byDay.values()];
    if (days.length < 3) return null;

    const latest = days[days.length - 1];
    const weekAgoIdx = Math.max(0, days.length - 8);
    const weekAgo = days[weekAgoIdx];

    const getScore = (d: any, key: string) =>
      d[`${key}_score`] || (key === "social" ? d.fan_score || 0 : 0);

    const channels = CATS.map(c => {
      const now = getScore(latest, c.key);
      const prev = getScore(weekAgo, c.key);
      const delta = prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? 100 : 0;
      const temp: "hot" | "warm" | "cold" = delta > 15 ? "hot" : delta >= -5 ? "warm" : "cold";
      return { ...c, delta: Math.round(delta), temp };
    });

    const hotCount = channels.filter(c => c.temp === "hot").length;
    const coldCount = channels.filter(c => c.temp === "cold").length;

    // Generate one-line summary
    let summaryKey: string;
    if (hotCount >= 3) {
      summaryKey = "correlationSummary.allHot";
    } else if (coldCount >= 3) {
      summaryKey = "correlationSummary.needsAttention";
    } else {
      const hotCh = channels.find(c => c.temp === "hot");
      const coldCh = channels.find(c => c.temp === "cold");
      if (hotCh && coldCh) {
        summaryKey = "correlationSummary.mixed";
      } else {
        summaryKey = "correlationSummary.steady";
      }
    }

    const hotCh = channels.find(c => c.temp === "hot");
    const coldCh = channels.sort((a, b) => a.delta - b.delta).find(c => c.temp === "cold");

    return { channels, summaryKey, hotCh, coldCh, artistName };
  }, [snapshots, artistName]);

  if (!result) return null;

  return (
    <div className={cn(
      "w-full rounded-2xl overflow-hidden",
      "border border-foreground/[0.06]",
      "bg-foreground/[0.03]",
    )}>
      <div className="px-4 py-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">
            {t("correlationSummary.title")}
          </span>
        </div>

        {/* Emoji temperature strip */}
        <div className="flex items-center justify-between gap-1">
          {result.channels.map(ch => (
            <div key={ch.key} className="flex flex-col items-center gap-0.5 flex-1">
              <span className="text-lg leading-none">{ch[ch.temp]}</span>
              <span className="text-[9px] font-medium text-foreground/50">{ch.label}</span>
            </div>
          ))}
        </div>

        {/* One-line summary */}
        <p className="text-xs text-foreground/70 leading-relaxed">
          {t(result.summaryKey)
            .replace("{artist}", result.artistName)
            .replace("{hot}", result.hotCh?.label || "")
            .replace("{cold}", result.coldCh?.label || "")}
        </p>
      </div>
    </div>
  );
}
