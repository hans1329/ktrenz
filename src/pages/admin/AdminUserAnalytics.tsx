import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, BarChart3, TrendingUp } from "lucide-react";

const AdminUserAnalytics = () => {
  // ── DAU 통계 ──
  const { data: dauData, isLoading } = useQuery({
    queryKey: ["admin-dau-analytics"],
    queryFn: async () => {
      const days = 14;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("user_id, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!data) return { dailyActive: [], totalUsers: 0 };

      const byDay = new Map<string, Set<string>>();
      for (const e of data as any[]) {
        const day = new Date(e.created_at).toISOString().slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, new Set());
        byDay.get(day)!.add(e.user_id);
      }

      const dailyActive = Array.from(byDay.entries())
        .map(([date, users]) => ({ date, count: users.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalUsers = new Set((data as any[]).map(e => e.user_id)).size;
      return { dailyActive, totalUsers };
    },
    staleTime: 60_000,
  });

  // ── 유저별 이벤트 수 ──
  const { data: userStats } = useQuery({
    queryKey: ["admin-user-event-stats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("user_id, event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!data) return [];

      const counts = new Map<string, { total: number; lastActive: string }>();
      for (const e of data as any[]) {
        const prev = counts.get(e.user_id);
        if (prev) {
          prev.total++;
        } else {
          counts.set(e.user_id, { total: 1, lastActive: e.created_at });
        }
      }

      return Array.from(counts.entries())
        .map(([id, { total, lastActive }]) => ({ id, total, lastActive }))
        .sort((a, b) => b.total - a.total);
    },
    staleTime: 60_000,
  });

  // ── 이벤트 타입별 통계 ──
  const eventTypeStats = useMemo(() => {
    if (!userStats) return [];
    // We need raw events for this - let's use a separate query approach
    return [];
  }, [userStats]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        유저 활동 분석
      </h1>

      {/* DAU 차트 */}
      {dauData && (
        <Card className="p-4 bg-card border-border">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            일별 활성 유저 (최근 14일) · 총 {dauData.totalUsers}명
          </h3>
          <div className="flex items-end gap-1 h-24">
            {dauData.dailyActive.map((d) => {
              const maxCount = Math.max(...dauData.dailyActive.map(x => x.count), 1);
              const pct = (d.count / maxCount) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold text-foreground">{d.count}</span>
                  <div className="w-full rounded-t bg-primary/70 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                  <span className="text-[7px] text-muted-foreground">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 유저별 활동 */}
      <Card className="p-4 bg-card border-border">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          유저별 활동량
        </h3>
        <div className="divide-y divide-border/30 max-h-96 overflow-y-auto">
          {userStats?.map((u, i) => {
            const lastDate = new Date(u.lastActive);
            const timeStr = `${lastDate.getMonth() + 1}/${lastDate.getDate()} ${lastDate.getHours().toString().padStart(2, "0")}:${lastDate.getMinutes().toString().padStart(2, "0")}`;
            return (
              <div key={u.id} className="flex items-center gap-3 py-2">
                <span className="w-6 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-xs font-mono text-foreground truncate">{u.id.slice(0, 12)}…</span>
                <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                <span className="text-xs font-black text-primary min-w-[40px] text-right">{u.total}</span>
              </div>
            );
          })}
          {!userStats?.length && (
            <p className="text-xs text-muted-foreground py-4 text-center">데이터 없음</p>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AdminUserAnalytics;
