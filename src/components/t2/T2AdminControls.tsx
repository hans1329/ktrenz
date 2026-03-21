import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Zap, Database } from "lucide-react";
import { useNavigate } from "react-router-dom";
import T2PipelineProgress from "./T2PipelineProgress";

interface PipelineRun {
  startedAt: Date;
  phase: "detect" | "postprocess";
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
  const { data: pipelineActive } = useQuery({
    queryKey: ["pipeline-active-check"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_pipeline_state" as any)
        .select("id, run_id, phase, status, current_offset, total_candidates")
        .in("status", ["running", "postprocess_requested", "postprocess_running"])
        .order("created_at", { ascending: false })
        .limit(1);
      return (data as any[])?.[0] ?? null;
    },
    refetchInterval: 3000,
  });

  // 자동 tick
  useEffect(() => {
    if (!pipelineActive || !isAdmin) return;
    const interval = setInterval(async () => {
      try {
        await supabase.functions.invoke("ktrenz-trend-cron", {
          body: { action: "tick" },
        });
        queryClient.invalidateQueries({ queryKey: ["pipeline-active-check"] });
        queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
      } catch (e) {
        console.warn("Tick failed:", e);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [pipelineActive, isAdmin, queryClient]);

  // 파이프라인 active → UI run 자동 감지
  useEffect(() => {
    if (!pipelineActive) return;
    const phase = pipelineActive.phase as PipelineRun["phase"];
    setActiveRuns((prev) => {
      if (prev[phase]) return prev;
      return { ...prev, [phase]: { startedAt: new Date(), phase } };
    });
  }, [pipelineActive]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-cron", {
        body: { action: "start", phase: "detect", batchSize: 5 },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onMutate: () => startRun("detect"),
    onSuccess: (data) => {
      toast.success(`트렌드 수집 시작 (run: ${data?.runId})`);
      queryClient.invalidateQueries({ queryKey: ["pipeline-active-check"] });
      queryClient.invalidateQueries({ queryKey: ["t2-trend-triggers"] });
    },
    onError: (err) => toast.error(`수집 실패: ${(err as Error).message}`),
  });

  if (loading || !isAdmin) return null;

  const activeRunList = Object.values(activeRuns);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="gap-1 text-xs h-7 px-2"
        >
          {runMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          트렌드 수집
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
