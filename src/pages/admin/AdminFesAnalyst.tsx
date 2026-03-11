import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, Play, TrendingUp, TrendingDown, Minus, BarChart3, Target, Zap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const AdminFesAnalyst = () => {
  const qc = useQueryClient();

  // 최신 정규화 통계
  const { data: normStats, isLoading: normLoading } = useQuery({
    queryKey: ["admin-norm-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_normalization_stats" as any)
        .select("*")
        .order("calculated_at", { ascending: false })
        .limit(5);
      return data as any[];
    },
  });

  // 최신 기여도 (상위 아티스트)
  const { data: contributions, isLoading: contribLoading } = useQuery({
    queryKey: ["admin-fes-contributions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_fes_contributions" as any)
        .select("*")
        .order("snapshot_at", { ascending: false })
        .limit(30);
      // 아티스트별 최신 1건씩
      const byArtist = new Map<string, any>();
      for (const row of data || []) {
        if (!byArtist.has(row.wiki_entry_id)) byArtist.set(row.wiki_entry_id, row);
      }
      // 이름 조회
      const ids = [...byArtist.keys()];
      if (ids.length === 0) return [];
      const { data: entries } = await supabase
        .from("wiki_entries")
        .select("id, name")
        .in("id", ids);
      const nameMap = new Map((entries || []).map((e: any) => [e.id, e.name]));
      return [...byArtist.values()].map((c: any) => ({ ...c, artist_name: nameMap.get(c.wiki_entry_id) || "Unknown" }));
    },
  });

  // 최신 예측
  const { data: predictions, isLoading: predLoading } = useQuery({
    queryKey: ["admin-fes-predictions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_prediction_logs" as any)
        .select("*")
        .order("predicted_at", { ascending: false })
        .limit(20);
      const ids = [...new Set((data || []).map((d: any) => d.wiki_entry_id))];
      if (ids.length === 0) return [];
      const { data: entries } = await supabase
        .from("wiki_entries")
        .select("id, name")
        .in("id", ids);
      const nameMap = new Map((entries || []).map((e: any) => [e.id, e.name]));
      return (data || []).map((p: any) => ({ ...p, artist_name: nameMap.get(p.wiki_entry_id) || "Unknown" }));
    },
  });

  // 카테고리 트렌드
  const { data: trends } = useQuery({
    queryKey: ["admin-category-trends"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_category_trends" as any)
        .select("*")
        .order("calculated_at", { ascending: false })
        .limit(50);
      return data as any[];
    },
  });

  // Analyst 실행
  const runAnalyst = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-fes-analyst", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`분석 완료: ${data.artists_processed}명 처리, 기여도 ${data.contributions_saved}건, 트렌드 ${data.trends_saved}건`);
      qc.invalidateQueries({ queryKey: ["admin-norm-stats"] });
      qc.invalidateQueries({ queryKey: ["admin-fes-contributions"] });
      qc.invalidateQueries({ queryKey: ["admin-category-trends"] });
    },
    onError: (e) => toast.error(`분석 실패: ${e.message}`),
  });

  // Predictor 실행
  const runPredictor = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ktrenz-fes-predictor", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`예측 완료: ${data.predictions?.length || 0}건`);
      qc.invalidateQueries({ queryKey: ["admin-fes-predictions"] });
    },
    onError: (e) => toast.error(`예측 실패: ${e.message}`),
  });

  const dirIcon = (dir: string) => {
    if (dir === "rising" || dir === "spike_up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    if (dir === "falling" || dir === "spike_down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> FES 분석 에이전트
          </h1>
          <p className="text-sm text-muted-foreground mt-1">정규화 기여도 분석 · 독립 트렌드 추적 · AI 예측</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => runAnalyst.mutate()} disabled={runAnalyst.isPending}>
            <BarChart3 className="w-4 h-4 mr-1" /> {runAnalyst.isPending ? "분석 중..." : "분석 실행"}
          </Button>
          <Button size="sm" onClick={() => runPredictor.mutate()} disabled={runPredictor.isPending}>
            <Brain className="w-4 h-4 mr-1" /> {runPredictor.isPending ? "예측 중..." : "예측 실행"}
          </Button>
        </div>
      </div>

      {/* 정규화 통계 */}
      <Card className="p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><Target className="w-4 h-4 text-primary" /> 정규화 기준 통계 (최신)</h3>
        {normLoading ? <Skeleton className="h-20" /> : normStats?.length ? (
          <div className="grid grid-cols-5 gap-3">
            {normStats.map((s: any) => (
              <div key={s.id} className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs font-bold uppercase text-muted-foreground">{s.category}</p>
                <p className="text-lg font-black text-foreground mt-1">{s.mean_change}</p>
                <p className="text-[10px] text-muted-foreground">σ={s.stddev_change} · n={s.sample_count}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">데이터 없음 — 분석을 먼저 실행하세요</p>}
      </Card>

      {/* 기여도 분석 */}
      <Card className="p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-primary" /> 카테고리별 기여도 (최신)</h3>
        {contribLoading ? <Skeleton className="h-40" /> : contributions?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2">아티스트</th>
                  <th className="text-center py-2 px-1">YT</th>
                  <th className="text-center py-2 px-1">Buzz</th>
                  <th className="text-center py-2 px-1">Album</th>
                  <th className="text-center py-2 px-1">Music</th>
                  <th className="text-center py-2 px-1">Social</th>
                  <th className="text-center py-2 px-1">FES</th>
                  <th className="text-center py-2 px-1">주도</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{c.artist_name}</td>
                    <td className="text-center py-2 px-1">
                      <span className="text-[10px]">{c.youtube_contrib}%</span>
                      <span className="block text-[9px] text-muted-foreground">z:{c.youtube_z}</span>
                    </td>
                    <td className="text-center py-2 px-1">
                      <span className="text-[10px]">{c.buzz_contrib}%</span>
                      <span className="block text-[9px] text-muted-foreground">z:{c.buzz_z}</span>
                    </td>
                    <td className="text-center py-2 px-1">
                      <span className="text-[10px]">{c.album_contrib}%</span>
                      <span className="block text-[9px] text-muted-foreground">z:{c.album_z}</span>
                    </td>
                    <td className="text-center py-2 px-1">
                      <span className="text-[10px]">{c.music_contrib}%</span>
                      <span className="block text-[9px] text-muted-foreground">z:{c.music_z}</span>
                    </td>
                    <td className="text-center py-2 px-1">
                      <span className="text-[10px]">{c.social_contrib}%</span>
                      <span className="block text-[9px] text-muted-foreground">z:{c.social_z}</span>
                    </td>
                    <td className="text-center py-2 px-1 font-bold">{c.normalized_fes}</td>
                    <td className="text-center py-2 px-1">
                      <Badge variant="outline" className="text-[9px]">{c.leading_category}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground">데이터 없음</p>}
      </Card>

      {/* 카테고리 트렌드 */}
      <Card className="p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> 독립 카테고리 트렌드</h3>
        {trends?.length ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {trends.slice(0, 25).map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 text-xs py-1 border-b border-border/30">
                <span className="w-16 font-mono uppercase text-muted-foreground">{t.category}</span>
                <div className="flex items-center gap-1">{dirIcon(t.trend_direction)}
                  <span className={cn("font-bold", t.trend_direction === "rising" ? "text-green-500" : t.trend_direction === "falling" ? "text-red-500" : "text-muted-foreground")}>
                    {t.trend_direction}
                  </span>
                </div>
                <span className="text-muted-foreground">7d: {t.change_7d}</span>
                <span className="text-muted-foreground">30d: {t.change_30d}</span>
                <span className="text-muted-foreground">momentum: {t.momentum}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">데이터 없음</p>}
      </Card>

      {/* AI 예측 */}
      <Card className="p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><Brain className="w-4 h-4 text-primary" /> AI 예측 로그</h3>
        {predLoading ? <Skeleton className="h-40" /> : predictions?.length ? (
          <div className="space-y-3">
            {predictions.map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">{p.artist_name}</span>
                  <div className="flex items-center gap-2">
                    {p.accuracy_score !== null && (
                      <Badge variant={p.accuracy_score >= 0.7 ? "default" : "destructive"} className="text-[10px]">
                        정확도: {Math.round(p.accuracy_score * 100)}%
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">{new Date(p.predicted_at).toLocaleString("ko")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    {dirIcon(p.prediction?.fes_direction)}
                    <span className="font-semibold">{p.prediction?.fes_direction}</span>
                  </div>
                  <span className="text-muted-foreground">신뢰도: {Math.round((p.prediction?.confidence || 0) * 100)}%</span>
                  <Badge variant="outline" className="text-[9px]">주도: {p.prediction?.leading_category_next}</Badge>
                </div>
                {p.prediction?.reasoning && (
                  <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">{p.prediction.reasoning}</p>
                )}
                {p.outcome && (
                  <div className="mt-2 p-2 rounded bg-muted/50 text-[10px]">
                    <span className="font-bold">실제:</span> {p.outcome.actual_direction} (Δ{p.outcome.actual_delta}) · 주도: {p.outcome.actual_leading}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">예측 데이터 없음 — 예측을 먼저 실행하세요</p>}
      </Card>
    </div>
  );
};

export default AdminFesAnalyst;
