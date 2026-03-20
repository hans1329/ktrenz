import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, Zap, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface PipelineRun {
  startedAt: Date;
  phase: "detect" | "detect_global" | "track";
}

interface RecentKeyword {
  id: string;
  keyword: string;
  keyword_ko: string | null;
  artist_name: string;
  detected_at: string;
  keyword_category: string;
}

interface Props {
  run: PipelineRun | null;
  onClose: () => void;
}

const T2PipelineProgress = ({ run, onClose }: Props) => {
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const queryClient = useQueryClient();

  // Tick elapsed every second
  useEffect(() => {
    if (!run) return;
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - run.startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [run]);

  // Poll for total count: members for detect phases, active triggers for track
  const isTrackPhase = run?.phase === "track";
  const { data: totalCount } = useQuery({
    queryKey: ["pipeline-total-count", run?.phase],
    queryFn: async () => {
      if (isTrackPhase) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .gte("detected_at", weekAgo);
        return count ?? 0;
      }
      const { count } = await supabase
        .from("ktrenz_stars" as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("star_type", "member");
      return count ?? 0;
    },
    enabled: !!run,
    staleTime: 300_000,
  });

  // Poll for keywords: detect phases show newly detected (filtered by source), track phase shows active keywords
  const triggerSourceFilter = run?.phase === "detect" ? "naver_news" : run?.phase === "detect_global" ? "global_news" : null;
  const { data: recentKeywords } = useQuery({
    queryKey: ["pipeline-recent-keywords", run?.startedAt.toISOString(), isTrackPhase, triggerSourceFilter],
    queryFn: async () => {
      if (!run) return [];
      if (isTrackPhase) {
        const { data } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category")
          .eq("status", "active")
          .order("detected_at", { ascending: false })
          .limit(50);
        return (data ?? []) as unknown as RecentKeyword[];
      }
      let query = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category")
        .gte("detected_at", run.startedAt.toISOString())
        .order("detected_at", { ascending: false })
        .limit(50);
      if (triggerSourceFilter) {
        query = query.eq("trigger_source", triggerSourceFilter);
      }
      const { data } = await query;
      return (data ?? []) as unknown as RecentKeyword[];
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  // Estimate progress: ~5 members per batch, ~25s per batch, 5s chain delay
  const total = totalCount ?? (isTrackPhase ? 0 : 405);
  const batchSize = 5;
  const batchTime = 30; // seconds per batch including delay
  const totalBatches = Math.ceil(total / batchSize);
  const estimatedTotal = totalBatches * batchTime;
  const progress = Math.min((elapsed / estimatedTotal) * 100, 99);
  const estimatedRemaining = Math.max(estimatedTotal - elapsed, 0);
  const remainMin = Math.floor(estimatedRemaining / 60);
  const remainSec = estimatedRemaining % 60;

  // Auto-close and refresh when estimated complete
  useEffect(() => {
    if (!run) return;
    if (elapsed > estimatedTotal) {
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    }
  }, [elapsed, estimatedTotal, run, queryClient]);

  if (!run) return null;

  const keywordCount = recentKeywords?.length ?? 0;
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;
  const isDone = elapsed > estimatedTotal;

  const phaseLabel = {
    detect: "국내 감지",
    detect_global: "글로벌 감지",
    track: "트렌드 추적",
  }[run.phase];

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          )}
          <span className="text-xs font-bold text-foreground truncate">
            {isDone ? "파이프라인 완료" : `${phaseLabel} 진행 중`}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {elapsedMin > 0 ? `${elapsedMin}분 ${elapsedSec}초` : `${elapsedSec}초`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {keywordCount > 0 && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {keywordCount} keywords
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="ml-1 p-0.5 rounded hover:bg-muted"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{total}{isTrackPhase ? "개 키워드" : "명 멤버"} · {batchSize}{isTrackPhase ? "개" : "명"}/배치</span>
              <span>
                {isDone
                  ? "완료"
                  : `잔여 ~${remainMin > 0 ? `${remainMin}분 ` : ""}${remainSec}초`}
              </span>
            </div>
            <Progress value={isDone ? 100 : progress} className="h-1.5" />
          </div>

          {/* Recent keywords feed */}
          {recentKeywords && recentKeywords.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-bold text-muted-foreground">
                {isTrackPhase ? "추적 중인 키워드" : "최근 감지된 키워드"}
              </p>
              {recentKeywords.slice(0, 10).map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg bg-background/60"
                >
                  <Zap className="w-3 h-3 text-primary shrink-0" />
                  <span className="font-bold text-foreground truncate">{kw.keyword_ko || kw.keyword}</span>
                  <span className="text-muted-foreground truncate">· {kw.artist_name}</span>
                  <span className="text-muted-foreground/60 text-[9px] ml-auto shrink-0">
                    {kw.keyword_category}
                  </span>
                </div>
              ))}
            </div>
          )}

          {recentKeywords && recentKeywords.length === 0 && !isDone && (
            <p className="text-[10px] text-muted-foreground italic">
              아직 감지된 키워드 없음... 배치 처리 진행 중
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default T2PipelineProgress;
