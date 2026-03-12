import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Brain, Target, Zap, ArrowRight, Youtube, MessageSquare, Disc3, Music, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgencyAIActionsProps {
  wikiEntryId: string;
  artistName: string;
}

const CATEGORY_ICONS: Record<string, typeof Youtube> = {
  youtube: Youtube,
  buzz: MessageSquare,
  album: Disc3,
  music: Music,
  social: Users,
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; border: string }> = {
  high: { label: "긴급", color: "bg-red-500/10 text-red-600", border: "border-l-red-500" },
  medium: { label: "권장", color: "bg-amber-500/10 text-amber-600", border: "border-l-amber-500" },
  low: { label: "참고", color: "bg-emerald-500/10 text-emerald-600", border: "border-l-emerald-500" },
};

export default function AgencyAIActions({ wikiEntryId, artistName }: AgencyAIActionsProps) {
  const { data: prediction, isLoading } = useQuery({
    queryKey: ["fes-prediction-agency", wikiEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_prediction_logs" as any)
        .select("prediction, reasoning, predicted_at")
        .eq("wiki_entry_id", wikiEntryId)
        .order("predicted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const d = data as any;
      const pred = d.prediction || {};
      return {
        direction: pred.fes_direction || "stable",
        confidence: pred.confidence || 0,
        agency_actions: pred.agency_actions || [],
        reasoning_ko: pred.reasoning_ko || pred.reasoning,
        predicted_at: d.predicted_at,
        model_version: d.model_version,
      };
    },
    staleTime: 5 * 60_000,
    enabled: !!wikiEntryId,
  });

  if (isLoading) return null;

  const actions = prediction?.agency_actions || [];
  const hasActions = actions.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              AI 전략 액션 아이템
            </CardTitle>
            <CardDescription className="text-xs">
              경쟁사 벤치마크 기반 AI 전략 제안 — {artistName}
            </CardDescription>
          </div>
          {prediction && (
            <Badge variant="outline" className="text-[10px]">
              {new Date(prediction.predicted_at).toLocaleDateString()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasActions ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>다음 예측 사이클에서 전략 액션 아이템이 생성됩니다</p>
            <p className="text-xs mt-1">(v3-dual-persona 모델 적용 후 자동 생성)</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Technical reasoning summary */}
            {prediction?.reasoning_ko && (
              <div className="rounded-lg bg-muted/30 p-3 mb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
                  <Brain className="w-3 h-3" /> 분석 요약
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{prediction.reasoning_ko}</p>
              </div>
            )}

            {/* Action Items */}
            {actions.map((action: any, i: number) => {
              const priorityCfg = PRIORITY_CONFIG[action.priority] || PRIORITY_CONFIG.medium;
              const CatIcon = CATEGORY_ICONS[action.category] || Zap;

              return (
                <div
                  key={i}
                  className={cn(
                    "border-l-4 rounded-lg p-3 bg-card",
                    priorityCfg.border
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <CatIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-sm flex-1">{action.title}</span>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      priorityCfg.color
                    )}>
                      {priorityCfg.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 ml-6">
                    <div className="flex items-start gap-1.5">
                      <ArrowRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground leading-relaxed">{action.action}</p>
                    </div>

                    {action.rationale && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                        📊 {action.rationale}
                      </p>
                    )}

                    {action.expected_impact && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                        💡 기대효과: {action.expected_impact}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
