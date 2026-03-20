import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Search, TrendingUp, Zap, Database, Globe, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import T2PipelineProgress from "./T2PipelineProgress";

interface PipelineRun {
  startedAt: Date;
  phase: "detect" | "detect_global" | "track";
}

const STORAGE_KEY = "t2-pipeline-active-runs";

const loadPersistedRuns = (): Record<string, PipelineRun> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { startedAt: string; phase: string }>;
    const runs: Record<string, PipelineRun> = {};
    for (const [key, val] of Object.entries(parsed)) {
      const started = new Date(val.startedAt);
      if (Date.now() - started.getTime() > 2 * 60 * 60 * 1000) continue;
      runs[key] = { startedAt: started, phase: val.phase as PipelineRun["phase"] };
    }
    return runs;
  } catch { return {}; }
};

const persistRuns = (runs: Record<string, PipelineRun>) => {
  if (Object.keys(runs).length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  }
};

const T2AdminControls = () => {
  const { isAdmin, loading } = useAdminAuth();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeRuns, setActiveRuns] = useState<Record<string, PipelineRun>>(loadPersistedRuns);
  const [hasAutoDetected, setHasAutoDetected] = useState(false);

  // Persist runs to localStorage
  useEffect(() => {
    persistRuns(activeRuns);
  }, [activeRuns]);

  // Auto-detect running pipelines from DB on mount
  // Check if there are pending triggers created in the last 30 min (= pipeline is running)
  const { data: detectedPhases } = useQuery({
    queryKey: ["pipeline-auto-detect"],
    queryFn: async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("trigger_source, detected_at")
        .gte("detected_at", thirtyMinAgo)
        .order("detected_at", { ascending: true })
        .limit(200);
      if (!data || data.length === 0) return null;

      const phases: Record<string, string> = {};
      for (const row of data as any[]) {
        const src = row.trigger_source;
        if (src === "naver_news" && !phases.detect) phases.detect = row.detected_at;
        if (src === "global_news" && !phases.detect_global) phases.detect_global = row.detected_at;
      }
      return phases;
    },
    enabled: !hasAutoDetected && isAdmin === true,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!detectedPhases || hasAutoDetected) return;
    setHasAutoDetected(true);

    const existing = loadPersistedRuns();
    const newRuns: Record<string, PipelineRun> = { ...existing };

    for (const [phase, firstDetected] of Object.entries(detectedPhases)) {
      if (!existing[phase]) {
        newRuns[phase] = {
          startedAt: new Date(firstDetected),
          phase: phase as PipelineRun["phase"],
        };
      }
    }

    if (Object.keys(newRuns).length > Object.keys(existing).length) {
      setActiveRuns(newRuns);
    }
  }, [detectedPhases, hasAutoDetected]);

  const startRun = (phase: PipelineRun["phase"]) => {
    setActiveRuns((prev) => ({ ...prev, [phase]: { startedAt: new Date(), phase } }));
  };

  const closeRun = (phase: string) => {
    setActiveRuns((prev) => {
      const next = { ...prev };
      delete next[phase];
      return next;
    });
  };

  const detectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "detect", batchSize: 5, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("detect"),
    onSuccess: (data) => {
      const found = data?.detect?.totalKeywords ?? 0;
      const total = data?.detect?.totalCandidates ?? 0;
      const hasNext = data?.nextBatch !== undefined;
      toast.success(
        hasNext
          ? `감지 1차 배치 완료 (${found}건). ${total}명 체이닝 중...`
          : `감지 완료: ${found}건`
      );
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast.error(`감지 실패: ${(err as Error).message}`),
  });

  const trackMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "track" },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("track"),
    onSuccess: (data) => {
      toast.success(`추적 완료: ${data?.track?.tracked ?? 0}건`);
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast.error(`추적 실패: ${(err as Error).message}`),
  });

  const fullMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "detect", batchSize: 5, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("detect"),
    onSuccess: () => {
      toast.success("전체 파이프라인 시작 (detect → detect_global → track 체이닝)");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
      }, 60_000);
    },
    onError: (err) => toast.error(`파이프라인 실패: ${(err as Error).message}`),
  });

  const detectGlobalMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { phase: "detect_global", batchSize: 5, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("detect_global"),
    onSuccess: (data) => {
      toast.success(`글로벌 감지 완료: ${data?.detect_global?.totalKeywords ?? 0}건`);
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast.error(`글로벌 감지 실패: ${(err as Error).message}`),
  });

  if (loading || !isAdmin) return null;

  // detect and detect_global can run in parallel; track and full block all
  const isTrackOrFullRunning = trackMutation.isPending || fullMutation.isPending;
  const isDetectRunning = detectMutation.isPending;
  const isGlobalRunning = detectGlobalMutation.isPending;

  const activeRunList = Object.values(activeRuns);

  // Mobile: collapse into dropdown menu
  if (isMobile) {
    return (
      <div className="space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={isTrackOrFullRunning}>
              {isTrackOrFullRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onClick={() => fullMutation.mutate()} disabled={isTrackOrFullRunning || isDetectRunning || isGlobalRunning}>
              <Zap className="w-3.5 h-3.5 mr-2" /> 전체 수집
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => detectMutation.mutate()} disabled={isTrackOrFullRunning || isDetectRunning}>
              <Search className="w-3.5 h-3.5 mr-2" /> 감지-국내{isDetectRunning ? " ⏳" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => detectGlobalMutation.mutate()} disabled={isTrackOrFullRunning || isGlobalRunning}>
              <Globe className="w-3.5 h-3.5 mr-2" /> 감지-해외{isGlobalRunning ? " ⏳" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => trackMutation.mutate()} disabled={isTrackOrFullRunning || isDetectRunning || isGlobalRunning}>
              <TrendingUp className="w-3.5 h-3.5 mr-2" /> 추적
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/admin/stars")}>
              <Database className="w-3.5 h-3.5 mr-2" /> 스타 관리
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeRunList.map((run) => (
          <T2PipelineProgress
            key={run.phase}
            run={run}
            onClose={() => closeRun(run.phase)}
          />
        ))}
      </div>
    );
  }

  // Desktop: inline buttons
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fullMutation.mutate()}
          disabled={isTrackOrFullRunning || isDetectRunning || isGlobalRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {fullMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          전체 수집
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => detectMutation.mutate()}
          disabled={isTrackOrFullRunning || isDetectRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {detectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          감지-국내
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => detectGlobalMutation.mutate()}
          disabled={isTrackOrFullRunning || isGlobalRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {detectGlobalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
          감지-해외
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => trackMutation.mutate()}
          disabled={isTrackOrFullRunning || isDetectRunning || isGlobalRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {trackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
          추적
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate("/admin/stars")}
          className="gap-1 text-xs h-7 px-2"
        >
          <Database className="w-3 h-3" />
          스타 관리
        </Button>
      </div>

      {activeRunList.map((run) => (
        <T2PipelineProgress
          key={run.phase}
          run={run}
          onClose={() => closeRun(run.phase)}
        />
      ))}
    </div>
  );
};

export default T2AdminControls;
