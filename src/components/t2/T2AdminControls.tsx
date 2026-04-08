import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Zap, Database, Activity, BarChart3, ShoppingCart, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import T2PipelineProgress from "./T2PipelineProgress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PipelineRun {
  startedAt: Date;
  phase: "collect_social" | "detect" | "detect_youtube" | "postprocess";
}

const STORAGE_KEY = "t2-pipeline-active-runs";

const loadPersistedRuns = (): Record<string, PipelineRun> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { startedAt: string; phase: string }>;
    const runs: Record<string, PipelineRun> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val.phase === "postprocess") continue;
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeRuns, setActiveRuns] = useState<Record<string, PipelineRun>>(loadPersistedRuns);

  useEffect(() => {
    persistRuns(activeRuns);
  }, [activeRuns]);

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

  // DB 기반 상태머신 자동 폴링
  const { data: pipelineActive, isFetched: isPipelineFetched } = useQuery({
    queryKey: ["pipeline-active-check"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_pipeline_state" as any)
        .select("id, run_id, phase, status, current_offset, total_candidates, created_at")
        .in("status", ["running", "running_inflight", "postprocess_requested", "postprocess_running"])
        .neq("phase", "youtube_track_quota")
        .order("created_at", { ascending: false })
        .limit(1);
      return (data as any[])?.[0] ?? null;
    },
    refetchInterval: 3000,
  });

  // 서버 사이드 pg_cron이 2분마다 tick을 자동 호출하므로,
  // 프론트엔드에서는 DB 폴링(pipeline-active-check)만 수행하여 UI를 갱신한다.

  // 파이프라인 active → UI run 자동 감지
  useEffect(() => {
    if (!pipelineActive) return;
    const phase = pipelineActive.phase as PipelineRun["phase"];
    const dbStartedAt = pipelineActive.created_at ? new Date(pipelineActive.created_at) : new Date();
    setActiveRuns((prev) => {
      if (prev[phase]) return prev;
      return { ...prev, [phase]: { startedAt: dbStartedAt, phase } };
    });
  }, [pipelineActive]);

  // 서버에 활성 run이 없으면 localStorage 기반 잔존 UI도 즉시 정리
  useEffect(() => {
    if (!isPipelineFetched || pipelineActive) return;
    setActiveRuns({});
  }, [isPipelineFetched, pipelineActive]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { action: "start", phase: "detect", batchSize: 15 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("detect"),
    onSuccess: (data) => {
      toast({ title: `트렌드 수집 시작${data?.runId ? ` (run: ${data.runId})` : ""}` });
      queryClient.invalidateQueries({ queryKey: ["pipeline-active-check"] });
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast({ title: `수집 실패: ${(err as Error).message}`, variant: "destructive" }),
  });

  const shopMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-track", {
        body: { batchSize: 50, batchOffset: 0 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onSuccess: (data) => {
      toast({ title: `쇼핑 키워드 추적 완료: ${data?.tracked ?? 0}건` });
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast({ title: `쇼핑 추적 실패: ${(err as Error).message}`, variant: "destructive" }),
  });

  if (loading || !isAdmin) return null;

  const activeRunList = Object.values(activeRuns);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Shield className="w-4 h-4" />
          {activeRunList.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2 space-y-1">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 pb-1">Admin</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="w-full justify-start gap-2 text-xs h-8"
        >
          {runMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          트렌드 수집
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => shopMutation.mutate()}
          disabled={shopMutation.isPending}
          className="w-full justify-start gap-2 text-xs h-8"
        >
          {shopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
          쇼핑 수집
        </Button>

        <div className="border-t border-border/40 my-1" />

        <Button size="sm" variant="ghost" onClick={() => navigate("/admin/stars")} className="w-full justify-start gap-2 text-xs h-8">
          <Database className="w-3.5 h-3.5" /> 스타 관리
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate("/admin/keyword-monitor")} className="w-full justify-start gap-2 text-xs h-8">
          <BarChart3 className="w-3.5 h-3.5" /> 키워드 모니터
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate("/admin")} className="w-full justify-start gap-2 text-xs h-8">
          <Shield className="w-3.5 h-3.5" /> 관리자 대시보드
        </Button>

        {activeRunList.length > 0 && (
          <>
            <div className="border-t border-border/40 my-1" />
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs h-8 text-primary border-primary/30">
                  <Activity className="w-3.5 h-3.5 animate-pulse" /> 수집 현황
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto z-[9999]">
                <DialogHeader>
                  <DialogTitle>수집 모니터링</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {activeRunList.map((run) => (
                    <T2PipelineProgress
                      key={run.phase}
                      run={run}
                      onClose={() => closeRun(run.phase)}
                    />
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default T2AdminControls;
