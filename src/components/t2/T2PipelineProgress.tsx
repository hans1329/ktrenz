import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, Zap, X, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PipelineRun {
  startedAt: Date;
  phase: "detect" | "detect_global" | "track" | "postprocess";
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

  const isTrackPhase = run?.phase === "track";
  const isPostprocess = run?.phase === "postprocess";
  const triggerSourceFilter = run?.phase === "detect" ? "naver_news" : run?.phase === "detect_global" ? "global_news" : null;

  // Poll for total count
  const { data: totalCount } = useQuery({
    queryKey: ["pipeline-total-count", run?.phase],
    queryFn: async () => {
      if (isPostprocess) return 0;
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
    enabled: !!run && !isPostprocess,
    staleTime: 300_000,
  });

  // Poll for ACTUAL processed count
  const { data: processedCount } = useQuery({
    queryKey: ["pipeline-processed-count", run?.startedAt.toISOString(), run?.phase, triggerSourceFilter],
    queryFn: async () => {
      if (!run || isPostprocess) return 0;
      if (isTrackPhase) {
        const { data } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id")
          .eq("status", "active")
          .gte("last_tracked_at", run.startedAt.toISOString());
        return data?.length ?? 0;
      }
      let query = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("star_id")
        .gte("detected_at", run.startedAt.toISOString());
      if (triggerSourceFilter) {
        query = query.eq("trigger_source", triggerSourceFilter);
      }
      const { data } = await query;
      if (!data) return 0;
      const uniqueStars = new Set((data as any[]).map((d: any) => d.star_id).filter(Boolean));
      return uniqueStars.size;
    },
    enabled: !!run && !isPostprocess,
    refetchInterval: 5000,
  });

  // Poll for postprocess status from collection_log
  const { data: postprocessStatus } = useQuery({
    queryKey: ["pipeline-postprocess-status", run?.startedAt.toISOString()],
    queryFn: async () => {
      if (!run) return null;
      // Check latest postprocess log
      const { data } = await supabase
        .from("ktrenz_collection_log" as any)
        .select("status, records_collected, error_message, collected_at")
        .eq("platform", "trend_postprocess")
        .order("collected_at", { ascending: false })
        .limit(1);
      if (!data || data.length === 0) return null;
      const latest = data[0] as any;
      return {
        status: latest.status as string,
        activated: latest.records_collected as number,
        details: latest.error_message as string | null,
        at: latest.collected_at as string,
      };
    },
    enabled: !!run && isPostprocess,
    refetchInterval: 3000,
  });

  // Poll for pending count (for postprocess phase)
  const { data: pendingCount } = useQuery({
    queryKey: ["pipeline-pending-count"],
    queryFn: async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("detected_at", threeDaysAgo);
      return count ?? 0;
    },
    enabled: !!run && isPostprocess,
    refetchInterval: 3000,
  });

  // Poll for keywords
  const { data: recentKeywords } = useQuery({
    queryKey: ["pipeline-recent-keywords", run?.startedAt.toISOString(), isTrackPhase, triggerSourceFilter, isPostprocess],
    queryFn: async () => {
      if (!run) return [];
      if (isPostprocess) {
        // Show recently activated keywords
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category")
          .eq("status", "active")
          .gte("detected_at", fiveMinAgo)
          .order("detected_at", { ascending: false })
          .limit(500);
        return (data ?? []) as unknown as RecentKeyword[];
      }
      if (isTrackPhase) {
        const { data } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category")
          .eq("status", "active")
          .order("detected_at", { ascending: false })
          .limit(500);
        return (data ?? []) as unknown as RecentKeyword[];
      }
      let query = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category")
        .gte("detected_at", run.startedAt.toISOString())
        .order("detected_at", { ascending: false })
        .limit(500);
      if (triggerSourceFilter) {
        query = query.eq("trigger_source", triggerSourceFilter);
      }
      const { data } = await query;
      return (data ?? []) as unknown as RecentKeyword[];
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  const total = totalCount ?? 0;
  const processed = processedCount ?? 0;
  const batchSize = 5;

  // Progress calculation for detect/track phases
  const batchesDone = Math.ceil(processed / batchSize);
  const totalBatches = Math.ceil(total / batchSize);

  const batchTime = 30;
  const estimatedBatchesByTime = Math.floor(elapsed / batchTime);
  const effectiveBatches = Math.max(estimatedBatchesByTime, batchesDone);
  const progress = totalBatches > 0 ? Math.min((effectiveBatches / totalBatches) * 100, 99) : 0;

  const estimatedRemaining = totalBatches > 0
    ? Math.max((totalBatches - effectiveBatches) * batchTime, 0)
    : 0;
  const remainMin = Math.floor(estimatedRemaining / 60);
  const remainSec = estimatedRemaining % 60;

  // Postprocess progress
  const postprocessDone = isPostprocess && postprocessStatus?.status === "success";
  const postprocessPending = pendingCount ?? 0;

  // Stall detection (for detect/track only)
  const [lastProcessedCount, setLastProcessedCount] = useState(0);
  const [stallTimer, setStallTimer] = useState(0);

  useEffect(() => {
    if (isPostprocess) return;
    if (processed > lastProcessedCount) {
      setLastProcessedCount(processed);
      setStallTimer(0);
    } else if (run && elapsed > 60) {
      setStallTimer((prev) => prev + 1);
    }
  }, [processed, elapsed, lastProcessedCount, run, isPostprocess]);

  const isStalled = !isPostprocess && stallTimer > 18;
  const estimatedTotal = totalBatches * batchTime;
  const isDone = isPostprocess
    ? postprocessDone
    : (processed > 0 && effectiveBatches >= totalBatches) || elapsed > estimatedTotal + 60;

  // Auto-refresh when done
  useEffect(() => {
    if (!run) return;
    if (isDone) {
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    }
  }, [isDone, run, queryClient]);

  if (!run) return null;

  const keywordCount = recentKeywords?.length ?? 0;
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  const phaseLabel = {
    detect: "국내 감지",
    detect_global: "글로벌 감지",
    track: "트렌드 추적",
    postprocess: "후처리 분석",
  }[run.phase];

  // Status text
  let statusText: string;
  if (isPostprocess) {
    if (postprocessDone) {
      statusText = "완료";
    } else if (postprocessStatus?.status === "running") {
      statusText = `분석 중 (pending: ${postprocessPending}건)`;
    } else {
      statusText = "대기 중...";
    }
  } else {
    statusText = isDone
      ? "완료"
      : isStalled
        ? "⚠️ 응답 대기 중..."
        : `잔여 ~${remainMin > 0 ? `${remainMin}분 ` : ""}${remainSec}초`;
  }

  // Parse postprocess details for display
  const postprocessDetails = postprocessStatus?.details
    ? Object.fromEntries(
        postprocessStatus.details.split(", ").map((s: string) => {
          const [k, v] = s.split("=");
          return [k, parseInt(v) || 0];
        })
      )
    : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isPostprocess
        ? "border-amber-500/20 bg-amber-500/5"
        : "border-primary/20 bg-primary/5"
    }`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDone ? (
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isPostprocess ? "text-amber-500" : "text-primary"}`} />
          ) : isStalled ? (
            <Loader2 className="w-4 h-4 text-yellow-500 animate-spin shrink-0" />
          ) : isPostprocess ? (
            <FlaskConical className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          )}
          <span className="text-xs font-bold text-foreground truncate">
            {isDone ? `${phaseLabel} 완료` : `${phaseLabel} 진행 중`}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {elapsedMin > 0 ? `${elapsedMin}분 ${elapsedSec}초` : `${elapsedSec}초`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {keywordCount > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isPostprocess
                ? "text-amber-600 bg-amber-500/10"
                : "text-primary bg-primary/10"
            }`}>
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
              {isPostprocess ? (
                <span>
                  {postprocessDone
                    ? `AI 분류 → 중복제거 → 활성화 ${postprocessDetails?.activated ?? 0}건`
                    : postprocessStatus?.status === "running"
                      ? `AI 분류 · 멤버 귀속 · 중복제거 · 활성화 중...`
                      : "후처리 시작 대기 중..."
                  }
                </span>
              ) : (
                <span>
                  {isTrackPhase
                    ? `${processed}/${total}개 추적됨`
                    : `배치 ${effectiveBatches}/${totalBatches} (${total}명 멤버 · ${batchSize}명/배치)`}
                </span>
              )}
              <span>{statusText}</span>
            </div>
            <Progress
              value={isPostprocess ? (postprocessDone ? 100 : elapsed > 5 ? Math.min(elapsed * 2, 90) : 10) : (isDone ? 100 : progress)}
              className={`h-1.5 ${isPostprocess ? "[&>div]:bg-amber-500" : ""}`}
            />
          </div>

          {/* Postprocess details when done */}
          {isPostprocess && postprocessDone && postprocessDetails && (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "AI 분류", value: postprocessDetails.ai_reclassified ?? 0 },
                { label: "멤버 귀속", value: postprocessDetails.member_dedup ?? 0 },
                { label: "국내 우선", value: postprocessDetails.domestic_dedup ?? 0 },
                { label: "활성화", value: postprocessDetails.activated ?? 0 },
              ].map((item) => (
                <div key={item.label} className="text-center py-1 px-1 rounded bg-background/60">
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  <div className="text-xs font-bold text-foreground">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent keywords feed */}
          {recentKeywords && recentKeywords.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-bold text-muted-foreground">
                {isPostprocess
                  ? "정제된 활성 키워드"
                  : isTrackPhase
                    ? "추적 중인 키워드"
                    : "최근 감지된 키워드"}
              </p>
              {recentKeywords.slice(0, 10).map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg bg-background/60"
                >
                  <Zap className={`w-3 h-3 shrink-0 ${isPostprocess ? "text-amber-500" : "text-primary"}`} />
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
              {isPostprocess
                ? "후처리 분석 진행 중..."
                : "아직 감지된 키워드 없음... 배치 처리 진행 중"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default T2PipelineProgress;
