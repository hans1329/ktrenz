import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Search, TrendingUp, Zap, Database, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import T2PipelineProgress from "./T2PipelineProgress";

interface PipelineRun {
  startedAt: Date;
  phase: "detect" | "detect_global" | "track";
}

const T2AdminControls = () => {
  const { isAdmin, loading } = useAdminAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);

  const startRun = (phase: PipelineRun["phase"]) => {
    setPipelineRun({ startedAt: new Date(), phase });
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

  const isAnyRunning = detectMutation.isPending || trackMutation.isPending || fullMutation.isPending || detectGlobalMutation.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => fullMutation.mutate()}
          disabled={isAnyRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {fullMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          전체 수집
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => detectMutation.mutate()}
          disabled={isAnyRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {detectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          감지
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => detectGlobalMutation.mutate()}
          disabled={isAnyRunning}
          className="gap-1 text-xs h-7 px-2"
        >
          {detectGlobalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
          글로벌
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => trackMutation.mutate()}
          disabled={isAnyRunning}
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

      <T2PipelineProgress
        run={pipelineRun}
        onClose={() => setPipelineRun(null)}
      />
    </div>
  );
};

export default T2AdminControls;
