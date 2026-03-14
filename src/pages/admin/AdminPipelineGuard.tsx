import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const RULE_LABELS: Record<string, string> = {
  yt_view_drop: "YouTube 조회수 급락",
  yt_sub_drop: "YouTube 구독자 급락",
  yt_view_zero: "YouTube 조회수 0",
  music_score_zero: "Music 점수 0",
  music_lastfm_zero: "Last.fm 리스너 0",
  buzz_spike: "Buzz 점수 급등",
  buzz_zero: "Buzz 점수 0",
  social_ig_drop: "Instagram 팔로워 급락",
  social_x_drop: "X 팔로워 급락",
  hanteo_negative: "Hanteo 판매량 비정상",
};

const AdminPipelineGuard = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "warn" | "block">("all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["guard-logs", filter],
    queryFn: async () => {
      let query = supabase
        .from("ktrenz_guard_logs" as any)
        .select("*, wiki_entry:wiki_entries(title)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter !== "all") {
        query = query.eq("action", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["guard-stats"],
    queryFn: async () => {
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ktrenz_guard_logs" as any)
        .select("action, guard_rule, resolved")
        .gte("created_at", cutoff24h);
      if (error) throw error;

      const items = data as any[];
      return {
        total: items.length,
        warns: items.filter((i: any) => i.action === "warn").length,
        blocks: items.filter((i: any) => i.action === "block").length,
        unresolved: items.filter((i: any) => !i.resolved).length,
        byRule: items.reduce((acc: Record<string, number>, i: any) => {
          acc[i.guard_rule] = (acc[i.guard_rule] || 0) + 1;
          return acc;
        }, {}),
      };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase
        .from("ktrenz_guard_logs" as any)
        .update({ resolved: true } as any)
        .eq("id", logId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guard-logs"] });
      queryClient.invalidateQueries({ queryKey: ["guard-stats"] });
      toast.success("해결 처리됨");
    },
  });

  const runGuardMutation = useMutation({
    mutationFn: async (module: string) => {
      const { data, error } = await supabase.functions.invoke("ktrenz-pipeline-guard", {
        body: { module },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["guard-logs"] });
      queryClient.invalidateQueries({ queryKey: ["guard-stats"] });
      toast.success(`Guard 검사 완료: ${data.warnings} warn, ${data.blocks} block`);
    },
    onError: (err) => toast.error(`Guard 실행 실패: ${err.message}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🛡️ Pipeline Guard</h1>
          <p className="text-sm text-muted-foreground mt-1">수집 데이터 이상치 검증 및 플래그 관리</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShieldCheck className="w-6 h-6 mx-auto mb-1 text-emerald-500" />
            <div className="text-2xl font-bold">{stats?.total ?? "–"}</div>
            <div className="text-xs text-muted-foreground">24시간 총 감지</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShieldAlert className="w-6 h-6 mx-auto mb-1 text-amber-500" />
            <div className="text-2xl font-bold text-amber-600">{stats?.warns ?? "–"}</div>
            <div className="text-xs text-muted-foreground">경고 (WARN)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShieldX className="w-6 h-6 mx-auto mb-1 text-red-500" />
            <div className="text-2xl font-bold text-red-600">{stats?.blocks ?? "–"}</div>
            <div className="text-xs text-muted-foreground">차단 (BLOCK)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <RefreshCw className="w-6 h-6 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold text-blue-600">{stats?.unresolved ?? "–"}</div>
            <div className="text-xs text-muted-foreground">미해결</div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Guard Run */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">수동 Guard 실행</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["youtube", "music", "buzz", "social", "hanteo"].map((mod) => (
              <Button
                key={mod}
                variant="outline"
                size="sm"
                onClick={() => runGuardMutation.mutate(mod)}
                disabled={runGuardMutation.isPending}
              >
                {runGuardMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                {mod}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rule Distribution */}
      {stats?.byRule && Object.keys(stats.byRule).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">24시간 규칙별 감지 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byRule)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .map(([rule, count]) => (
                  <Badge key={rule} variant="secondary" className="gap-1">
                    {RULE_LABELS[rule] || rule}
                    <span className="font-bold">{count as number}</span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter + Log Table */}
      <div className="flex gap-2 items-center">
        <span className="text-sm font-medium text-muted-foreground">필터:</span>
        {(["all", "warn", "block"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "전체" : f === "warn" ? "⚠️ WARN" : "🚫 BLOCK"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !logs?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            감지된 이상치가 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const isBlock = log.action === "block";
            const isUnresolved = !log.resolved;
            return (
              <Card
                key={log.id}
                className={
                  log.resolved
                    ? "opacity-40"
                    : isBlock
                    ? "border-destructive/60 bg-destructive/5 shadow-[0_0_12px_-2px_hsl(var(--destructive)/0.25)]"
                    : ""
                }
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isBlock && isUnresolved && (
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
                          </span>
                        )}
                        <Badge
                          variant={isBlock ? "destructive" : "secondary"}
                          className={isBlock ? "text-xs font-bold animate-pulse" : "text-xs"}
                        >
                          {isBlock ? "🚫 BLOCK — 수집 실패" : "⚠️ WARN"}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {log.wiki_entry?.title || log.wiki_entry_id?.slice(0, 8)}
                        </span>
                        <Badge variant="outline" className="text-xs">{log.module}</Badge>
                      </div>

                      {/* BLOCK: 상세 실패 정보 강조 */}
                      {isBlock && isUnresolved ? (
                        <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20 text-xs space-y-1">
                          <div className="font-semibold text-destructive">
                            {RULE_LABELS[log.guard_rule] || log.guard_rule}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                            <span>이전 값:</span>
                            <span className="font-mono">{JSON.stringify(log.previous_value)}</span>
                            <span>현재 값:</span>
                            <span className="font-mono font-bold text-destructive">{JSON.stringify(log.current_value)}</span>
                            {log.delta_pct !== null && (
                              <>
                                <span>변동률:</span>
                                <span className="font-bold text-destructive">{log.delta_pct > 0 ? "+" : ""}{log.delta_pct}%</span>
                              </>
                            )}
                          </div>
                          <div className="text-[10px] text-destructive/70 pt-1">
                            ⚠ 이 스냅샷은 플래그 처리되어 다운스트림 계산에서 제외됩니다
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground space-x-3">
                          <span>{RULE_LABELS[log.guard_rule] || log.guard_rule}</span>
                          {log.delta_pct !== null && (
                            <span className={log.delta_pct < 0 ? "text-destructive" : "text-amber-500"}>
                              {log.delta_pct > 0 ? "+" : ""}{log.delta_pct}%
                            </span>
                          )}
                          <span className="font-mono">
                            {JSON.stringify(log.previous_value)} → {JSON.stringify(log.current_value)}
                          </span>
                        </div>
                      )}

                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(log.created_at).toLocaleString("ko-KR")}
                        {log.engine_run_id && <span className="ml-2">Run: {log.engine_run_id.slice(0, 8)}</span>}
                      </div>
                    </div>
                    {isUnresolved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => resolveMutation.mutate(log.id)}
                        disabled={resolveMutation.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPipelineGuard;
