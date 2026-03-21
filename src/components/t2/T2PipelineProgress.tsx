import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, Zap, X, ChevronDown, ChevronUp, Newspaper, BookOpen, ShoppingBag } from "lucide-react";
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
  status?: string;
  trigger_source?: string;
}

interface Props {
  run: PipelineRun | null;
  onClose: () => void;
}

const T2PipelineProgress = ({ run, onClose }: Props) => {
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!run) return;
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - run.startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [run]);

  const isTrackPhase = run?.phase === "track";
  // 국내: naver_multi, naver_shop, naver_news(레거시)
  // 글로벌: global_news, firecrawl_social, youtube_comments
  const isDetect = run?.phase === "detect";
  const isGlobal = run?.phase === "detect_global";

  // DB 기반 파이프라인 상태 (track 페이즈의 정확한 진행률)
  const { data: dbPipelineState } = useQuery({
    queryKey: ["pipeline-db-state", run?.phase],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_pipeline_state" as any)
        .select("current_offset, total_candidates, status, run_id, batch_size")
        .eq("phase", run?.phase ?? "track")
        .in("status", ["running", "postprocess_requested", "postprocess_running"])
        .order("updated_at", { ascending: false })
        .limit(1);
      return (data as any[])?.[0] ?? null;
    },
    enabled: !!run && isTrackPhase,
    refetchInterval: 3000,
  });

  const { data: totalCount } = useQuery({
    queryKey: ["pipeline-total-count", run?.phase],
    queryFn: async () => {
      // 감지 엔진은 모든 active 스타(group/solo/member)를 대상으로 함
      const { count } = await supabase
        .from("ktrenz_stars" as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("star_type", ["group", "solo", "member"]);
      return count ?? 0;
    },
    enabled: !!run && !isTrackPhase,
    staleTime: 300_000,
  });

  const { data: phaseState } = useQuery({
    queryKey: ["pipeline-phase-state", run?.startedAt.toISOString(), run?.phase],
    queryFn: async () => {
      if (!run) return null;

      if (isTrackPhase) {
        // DB 파이프라인 상태에서 직접 가져옴 (정확한 offset 기반)
        const offset = dbPipelineState?.current_offset ?? 0;
        const total = dbPipelineState?.total_candidates ?? 0;
        
        // 최근 추적 완료된 키워드 수 (ktrenz_trend_tracking에서)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("ktrenz_trend_tracking" as any)
          .select("id", { count: "exact", head: true })
          .gte("tracked_at", twoHoursAgo);

        return {
          processed: offset,
          total: total,
          trackedCount: count ?? 0,
          pending: 0,
          active: 0,
          expired: 0,
          merged: 0,
          bySource: {} as Record<string, number>,
        };
      }

      // 국내/글로벌 감지 — trigger_source 기반 소스별 집계
      const domesticSources = ["naver_multi", "naver_shop", "naver_news"];
      const globalSources = ["global_news", "firecrawl_social", "youtube_comments"];
      const filterSources = isDetect ? domesticSources : isGlobal ? globalSources : null;

      let query = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("status, star_id, trigger_source")
        .gte("detected_at", run.startedAt.toISOString());

      if (filterSources) {
        query = query.in("trigger_source", filterSources);
      }

      const { data } = await query;
      const rows = ((data ?? []) as unknown) as Array<{ status: string; star_id: string | null; trigger_source: string }>;
      const uniqueProcessedStars = new Set(rows.map((row) => row.star_id).filter(Boolean));

      // 소스별 카운트
      const bySource: Record<string, number> = {};
      for (const row of rows) {
        const src = row.trigger_source || "unknown";
        bySource[src] = (bySource[src] || 0) + 1;
      }

      return {
        processed: uniqueProcessedStars.size,
        pending: rows.filter((row) => row.status === "pending").length,
        active: rows.filter((row) => row.status === "active").length,
        expired: rows.filter((row) => row.status === "expired").length,
        merged: rows.filter((row) => row.status === "merged").length,
        bySource,
      };
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  const { data: recentKeywords } = useQuery({
    queryKey: ["pipeline-recent-keywords", run?.startedAt.toISOString(), isTrackPhase, run?.phase],
    queryFn: async () => {
      if (!run) return [];

      if (isTrackPhase) {
        // 최근 추적된 키워드 (ktrenz_trend_tracking)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from("ktrenz_trend_tracking" as any)
          .select("id, keyword, keyword_ko, artist_name, tracked_at, keyword_category, score")
          .gte("tracked_at", twoHoursAgo)
          .order("tracked_at", { ascending: false })
          .limit(20);
        return ((data ?? []) as any[]).map((r: any) => ({
          id: r.id,
          keyword: r.keyword,
          keyword_ko: r.keyword_ko,
          artist_name: r.artist_name,
          detected_at: r.tracked_at,
          keyword_category: r.keyword_category || "",
          status: r.score != null ? `${r.score}점` : undefined,
          trigger_source: undefined,
        })) as RecentKeyword[];
      }

      const domesticSources = ["naver_multi", "naver_shop", "naver_news"];
      const globalSources = ["global_news", "firecrawl_social", "youtube_comments"];
      const filterSources = isDetect ? domesticSources : isGlobal ? globalSources : null;

      let query = supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, detected_at, keyword_category, status, trigger_source")
        .gte("detected_at", run.startedAt.toISOString())
        .order("detected_at", { ascending: false })
        .limit(500);

      if (filterSources) {
        query = query.in("trigger_source", filterSources);
      }

      const { data } = await query;
      return (data ?? []) as unknown as RecentKeyword[];
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  // track 페이즈는 DB pipeline_state에서 직접 진행률 계산
  const trackTotal = isTrackPhase ? (phaseState as any)?.total ?? dbPipelineState?.total_candidates ?? 0 : 0;
  const trackOffset = isTrackPhase ? (phaseState as any)?.processed ?? dbPipelineState?.current_offset ?? 0 : 0;
  const trackedCount = isTrackPhase ? (phaseState as any)?.trackedCount ?? 0 : 0;
  
  const total = isTrackPhase ? trackTotal : (totalCount ?? 0);
  const processed = isTrackPhase ? trackOffset : (phaseState?.processed ?? 0);
  const pending = phaseState?.pending ?? 0;
  const active = phaseState?.active ?? 0;
  const expired = phaseState?.expired ?? 0;
  const merged = phaseState?.merged ?? 0;
  const bySource = phaseState?.bySource ?? {};
  const batchSize = dbPipelineState?.batch_size ?? 5;

  // Track: offset 기반 정확한 진행률
  const progress = isTrackPhase
    ? (total > 0 ? Math.min((processed / total) * 100, 99) : 0)
    : (() => {
        const batchesDone = Math.ceil(processed / batchSize);
        const totalBatches = Math.ceil(total / batchSize);
        const batchTime = 30;
        const estimatedBatchesByTime = Math.floor(elapsed / batchTime);
        const effectiveBatches = Math.max(estimatedBatchesByTime, batchesDone);
        return totalBatches > 0 ? Math.min((effectiveBatches / totalBatches) * 100, 99) : 0;
      })();

  const totalBatches = isTrackPhase ? Math.ceil(total / batchSize) : Math.ceil(total / batchSize);
  const batchesDone = Math.ceil(processed / batchSize);
  const batchTime = 30;
  const estimatedRemaining = isTrackPhase
    ? Math.max(Math.ceil((total - processed) / batchSize) * 8, 0) // 8초/배치
    : Math.max((totalBatches - Math.max(Math.floor(elapsed / batchTime), batchesDone)) * batchTime, 0);
  const remainMin = Math.floor(estimatedRemaining / 60);
  const remainSec = estimatedRemaining % 60;

  const [lastProcessedCount, setLastProcessedCount] = useState(0);
  const [stallTimer, setStallTimer] = useState(0);

  useEffect(() => {
    if (processed > lastProcessedCount) {
      setLastProcessedCount(processed);
      setStallTimer(0);
    } else if (run && elapsed > 60) {
      setStallTimer((prev) => prev + 1);
    }
  }, [processed, elapsed, lastProcessedCount, run]);

  const isStalled = stallTimer > 18;
  const estimatedTotal = totalBatches * batchTime;
  const isDone = isTrackPhase
    ? (dbPipelineState?.status === 'done' || dbPipelineState?.status === 'postprocess_done' || (processed > 0 && processed >= total))
    : processed > 0 && pending === 0;

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

  const statusText = isDone
    ? "완료"
    : isStalled
      ? "⚠️ 응답 대기 중..."
      : isTrackPhase
        ? `잔여 ~${remainMin > 0 ? `${remainMin}분 ` : ""}${remainSec}초`
        : pending > 0
          ? `후처리 대기 ${pending}건`
          : "정제 반영 중";

  // 소스별 라벨 매핑
  const sourceLabel: Record<string, { icon: typeof Newspaper; label: string; color: string }> = {
    naver_multi: { icon: Newspaper, label: "뉴스+블로그", color: "text-blue-400" },
    naver_shop: { icon: ShoppingBag, label: "쇼핑", color: "text-emerald-400" },
    naver_news: { icon: Newspaper, label: "뉴스(레거시)", color: "text-blue-300" },
    global_news: { icon: Newspaper, label: "글로벌 뉴스", color: "text-purple-400" },
    firecrawl_social: { icon: BookOpen, label: "소셜(Reddit/TikTok)", color: "text-pink-400" },
    youtube_comments: { icon: BookOpen, label: "YouTube 댓글", color: "text-red-400" },
  };

  const triggerSourceLabel = (src?: string) => {
    if (!src) return "unknown";
    const info = sourceLabel[src];
    return info?.label || src;
  };

  const totalTriggers = Object.values(bySource).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
          ) : isStalled ? (
            <Loader2 className="w-4 h-4 text-yellow-500 animate-spin shrink-0" />
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
          {isTrackPhase && trackedCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-primary bg-primary/10">
              {trackedCount} tracked
            </span>
          )}
          {!isTrackPhase && totalTriggers > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-primary bg-primary/10">
              {totalTriggers} saved
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
              <span>
                {isTrackPhase
                  ? `${processed}/${total}개 처리 · ${trackedCount}건 추적됨`
                  : `대상 ${total}명 · 처리 ${processed}명`}
              </span>
              <span>{statusText}</span>
            </div>
            <Progress value={isDone ? 100 : progress} className="h-1.5" />
          </div>

          {/* Source breakdown */}
          {!isTrackPhase && Object.keys(bySource).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground">소스별 저장 현황</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(bySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, count]) => {
                    const info = sourceLabel[src];
                    const Icon = info?.icon || Newspaper;
                    return (
                      <div key={src} className="flex items-center gap-1.5 py-1 px-2 rounded bg-background/60">
                        <Icon className={`w-3 h-3 shrink-0 ${info?.color || "text-muted-foreground"}`} />
                        <span className="text-[10px] text-foreground truncate">{info?.label || src}</span>
                        <span className="text-[10px] font-bold text-foreground ml-auto">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          {!isTrackPhase && (active > 0 || expired > 0 || merged > 0 || pending > 0) && (
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "Active", value: active, color: "text-emerald-400" },
                { label: "Pending", value: pending, color: "text-amber-400" },
                { label: "Expired", value: expired, color: "text-muted-foreground" },
                { label: "Merged", value: merged, color: "text-blue-400" },
              ].map((item) => (
                <div key={item.label} className="text-center py-1 px-1 rounded bg-background/60">
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  <div className={`text-xs font-bold ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent keywords with source tag */}
          {recentKeywords && recentKeywords.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-bold text-muted-foreground">
                {isTrackPhase ? "추적 중인 키워드" : `저장된 키워드 (${keywordCount}건)`}
              </p>
              {recentKeywords.slice(0, 15).map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center gap-1.5 text-[11px] py-1 px-2 rounded-lg bg-background/60"
                >
                  <Zap className="w-3 h-3 shrink-0 text-primary" />
                  <span className="font-bold text-foreground truncate">{kw.keyword_ko || kw.keyword}</span>
                  <span className="text-muted-foreground truncate">· {kw.artist_name}</span>
                  {!isTrackPhase && kw.trigger_source && (
                    <span className={`text-[9px] shrink-0 px-1 py-0 rounded ${
                      sourceLabel[kw.trigger_source]?.color || "text-muted-foreground"
                    } bg-muted/50`}>
                      {triggerSourceLabel(kw.trigger_source)}
                    </span>
                  )}
                  {!isTrackPhase && kw.status && (
                    <span className="text-muted-foreground/70 text-[9px] shrink-0 uppercase">{kw.status}</span>
                  )}
                  <span className="text-muted-foreground/60 text-[9px] ml-auto shrink-0">
                    {kw.keyword_category}
                  </span>
                </div>
              ))}
            </div>
          )}

          {recentKeywords && recentKeywords.length === 0 && !isDone && (
            <p className="text-[10px] text-muted-foreground italic">
              아직 반영된 결과 없음... 실제 DB 상태 대기 중
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default T2PipelineProgress;
