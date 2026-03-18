import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
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

  // Poll for total active members count (once)
  const { data: totalMembers } = useQuery({
    queryKey: ["pipeline-total-members"],
    queryFn: async () => {
      const { count } = await supabase
        .from("ktrenz_stars" as any)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("star_type", "member");
      return count ?? 0;
    },
    enabled: !!run,
    staleTime: 60_000,
  });

  // Poll for recently detected keywords since run started
  const { data: recentKeywords } = useQuery({
    queryKey: ["pipeline-recent-keywords", run?.startedAt.toISOString()],
    queryFn: async () => {
      if (!run) return [];
      const { data } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, artist_name, detected_at, keyword_category")
        .gte("detected_at", run.startedAt.toISOString())
        .order("detected_at", { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as RecentKeyword[];
    },
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  // Poll for processed count via snapshots (naver_news snapshots since run start)
  const { data: processedCount } = useQuery({
    queryKey: ["pipeline-processed", run?.startedAt.toISOString()],
    queryFn: async () => {
      if (!run) return 0;
      const { count } = await supabase
        .from("ktrenz_data_snapshots" as any)
        .select("id", { count: "exact", head: true })
        .eq("platform", "naver_news")
        .gte("collected_at", run.startedAt.toISOString());
      return count ?? 0;
    },
    enabled: !!run,
    refetchInterval: 5000,
  });

  if (!run) return null;

  const total = totalMembers ?? 405;
  const processed = processedCount ?? 0;
  const progress = Math.min((processed / total) * 100, 100);
  const isComplete = processed >= total;
  const keywordCount = recentKeywords?.length ?? 0;

  const phaseLabel = {
    detect: "국내 감지",
    detect_global: "글로벌 감지",
    track: "트렌드 추적",
  }[run.phase];

  const elapsed = Math.round((Date.now() - run.startedAt.getTime()) / 1000);
  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  return (
    <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          )}
          <span className="text-xs font-bold text-foreground truncate">
            {isComplete ? "파이프라인 완료" : `${phaseLabel} 진행 중`}
          </span>
          <span className="text-[10px] text-muted-foreground">
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
              <span>멤버 처리</span>
              <span>{processed} / {total}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {/* Recent keywords feed */}
          {recentKeywords && recentKeywords.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[10px] font-bold text-muted-foreground">최근 감지된 키워드</p>
              {recentKeywords.slice(0, 10).map((kw) => (
                <div
                  key={kw.id}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg bg-background/60"
                >
                  <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="font-bold text-foreground truncate">{kw.keyword}</span>
                  <span className="text-muted-foreground truncate">· {kw.artist_name}</span>
                  <span className="text-muted-foreground/60 text-[9px] ml-auto shrink-0">
                    {kw.keyword_category}
                  </span>
                </div>
              ))}
            </div>
          )}

          {recentKeywords && recentKeywords.length === 0 && !isComplete && (
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
