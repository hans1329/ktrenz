import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Youtube, Twitter, Music, Disc3, Globe, MessageCircle,
  Loader2, RefreshCw, ChevronDown, ChevronUp, Headphones, Newspaper, Hash
} from "lucide-react";

interface AdminDataSourcePanelProps {
  wikiEntryId: string;
  artistTitle: string;
}

const SOURCE_CONFIG = [
  { key: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500", platform: "youtube" },
  { key: "youtube_music", label: "YT Music", icon: Headphones, color: "text-red-400", platform: "youtube_music" },
  { key: "lastfm", label: "Last.fm", icon: Music, color: "text-red-600", platform: "lastfm" },
  { key: "deezer", label: "Deezer", icon: Headphones, color: "text-purple-500", platform: "deezer" },
  { key: "hanteo", label: "Hanteo", icon: Disc3, color: "text-amber-500", platform: "hanteo" },
  { key: "buzz_x", label: "X (Twitter)", icon: Twitter, color: "text-blue-400", platform: "buzz_multi", sourceFilter: "x_twitter" },
  { key: "buzz_reddit", label: "Reddit", icon: MessageCircle, color: "text-orange-500", platform: "buzz_multi", sourceFilter: "reddit" },
  { key: "buzz_naver", label: "Naver", icon: Globe, color: "text-green-500", platform: "buzz_multi", sourceFilter: "naver" },
  { key: "buzz_tiktok", label: "TikTok", icon: Hash, color: "text-pink-400", platform: "buzz_multi", sourceFilter: "tiktok" },
  { key: "buzz_news", label: "News", icon: Newspaper, color: "text-sky-500", platform: "buzz_multi", sourceFilter: "news" },
  { key: "buzz_youtube", label: "YT Buzz", icon: Youtube, color: "text-red-300", platform: "buzz_multi", sourceFilter: "youtube" },
] as const;

// 수집 모듈 매핑 (data-engine에 전달할 모듈명)
const COLLECT_MODULE_MAP: Record<string, string> = {
  youtube: "youtube",
  youtube_music: "youtube", // YouTube 수집 시 같이 수집됨
  lastfm: "music",
  deezer: "music",
  hanteo: "hanteo",
  buzz_x: "buzz_x",
  buzz_reddit: "buzz_reddit",
  buzz_naver: "buzz_naver",
  buzz_tiktok: "buzz_tiktok",
  buzz_news: "buzz_news",
  buzz_youtube: "buzz_youtube",
};

const formatValue = (v: any): string => {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toLocaleString();
  }
  if (typeof v === "string") return v;
  return JSON.stringify(v);
};

const formatAge = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "방금";
  if (hours < 24) return `${hours}h 전`;
  const days = Math.floor(hours / 24);
  return `${days}d 전`;
};

const AdminDataSourcePanel = ({ wikiEntryId, artistTitle }: AdminDataSourcePanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [collectingModules, setCollectingModules] = useState<Set<string>>(new Set());

  // 최근 스냅샷 가져오기 (모든 플랫폼)
  const { data: snapshots, isLoading, refetch } = useQuery({
    queryKey: ["admin-source-snapshots", wikiEntryId],
    queryFn: async () => {
      const platforms = ["youtube", "youtube_music", "lastfm", "deezer", "hanteo", "buzz_multi"];
      const results: Record<string, any> = {};

      const promises = platforms.map(async (platform) => {
        const { data } = await supabase
          .from("ktrenz_data_snapshots" as any)
          .select("platform, metrics, collected_at")
          .eq("wiki_entry_id", wikiEntryId)
          .eq("platform", platform)
          .order("collected_at", { ascending: false })
          .limit(1)
          .maybeSingle() as { data: any };
        if (data) results[platform] = data;
      });

      await Promise.all(promises);
      return results;
    },
    staleTime: 30_000,
    enabled: expanded,
  });

  const getSourceData = (config: typeof SOURCE_CONFIG[number]) => {
    if (!snapshots) return null;
    const snap = snapshots[config.platform];
    if (!snap) return null;

    if (config.platform === "buzz_multi" && "sourceFilter" in config) {
      const breakdown = snap.metrics?.source_breakdown as any[];
      if (!breakdown) return null;
      const sourceData = breakdown.find((s: any) => s.source === config.sourceFilter);
      return sourceData
        ? { metrics: { mentions: sourceData.mentions, weighted: sourceData.weighted }, collected_at: snap.collected_at }
        : null;
    }

    return { metrics: snap.metrics, collected_at: snap.collected_at };
  };

  const triggerCollect = async (sourceKey: string) => {
    const module = COLLECT_MODULE_MAP[sourceKey];
    if (!module) return;

    setCollectingModules(prev => new Set(prev).add(sourceKey));
    try {
      const { error } = await supabase.functions.invoke("data-engine", {
        body: { module, wikiEntryId, triggerSource: "admin-detail" },
      });
      if (error) throw error;
      toast.success(`${sourceKey} 수집 시작됨`);
      // 10초 후 리프레시
      setTimeout(() => refetch(), 10000);
    } catch (err: any) {
      toast.error(`${sourceKey} 수집 실패: ${err.message}`);
    } finally {
      setCollectingModules(prev => { const n = new Set(prev); n.delete(sourceKey); return n; });
    }
  };

  const renderMetricSummary = (config: typeof SOURCE_CONFIG[number], data: any) => {
    if (!data?.metrics) return <span className="text-[10px] text-muted-foreground">—</span>;
    const m = data.metrics;

    // 플랫폼별 핵심 지표 표시
    const kvPairs: [string, any][] = Object.entries(m).slice(0, 3);
    return (
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {kvPairs.map(([k, v]) => (
          <span key={k} className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{formatValue(v)}</span>
            {" "}
            <span className="opacity-70">{k.replace(/_/g, " ")}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Admin: Data Sources</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {isLoading ? (
            <div className="space-y-1">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
          ) : (
            SOURCE_CONFIG.map(config => {
              const data = getSourceData(config);
              const isCollecting = collectingModules.has(config.key);
              const Icon = config.icon;

              return (
                <div key={config.key} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-card/60 border border-border/40">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-foreground">{config.label}</span>
                      {data?.collected_at && (
                        <span className="text-[9px] text-muted-foreground">{formatAge(data.collected_at)}</span>
                      )}
                    </div>
                    {renderMetricSummary(config, data)}
                  </div>
                  <button
                    onClick={() => triggerCollect(config.key)}
                    disabled={isCollecting}
                    className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold border transition-colors shrink-0",
                      isCollecting
                        ? "bg-primary/20 text-primary border-primary/30"
                        : "bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                    )}
                  >
                    {isCollecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "수집"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
};

export default AdminDataSourcePanel;
