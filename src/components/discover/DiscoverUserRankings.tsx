import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface UserStat {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  total_bets: number;
  wins: number;
  losses: number;
  win_rate: number;
}

const DiscoverUserRankings = () => {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["discover-user-rankings"],
    queryFn: async () => {
      const { data: predictions } = await supabase
        .from("b2_predictions")
        .select("user_id, status");

      if (!predictions?.length) return [];

      const statsMap = new Map<string, { total: number; wins: number; losses: number }>();
      for (const p of predictions) {
        const existing = statsMap.get(p.user_id) || { total: 0, wins: 0, losses: 0 };
        existing.total++;
        if (p.status === "won") existing.wins++;
        if (p.status === "lost") existing.losses++;
        statsMap.set(p.user_id, existing);
      }

      const userIds = [...statsMap.keys()];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, username")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      return userIds
        .map((uid) => {
          const s = statsMap.get(uid)!;
          const pr = profileMap.get(uid);
          return {
            user_id: uid,
            display_name: pr?.display_name || pr?.username || "Anonymous",
            avatar_url: pr?.avatar_url || null,
            username: pr?.username || null,
            total_bets: s.total,
            wins: s.wins,
            losses: s.losses,
            win_rate: s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0,
          } as UserStat;
        })
        .sort((a, b) => b.total_bets - a.total_bets);
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <section className="px-3 mt-4">
        <Skeleton className="h-32 rounded-xl" />
      </section>
    );
  }

  if (users.length === 0) {
    return (
      <section className="px-3 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-foreground/60" />
          <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Top Predictors</h2>
        </div>
        <div className="rounded-xl border border-border/30 bg-card/60 p-6 text-center text-[13px] text-muted-foreground">
          No predictions yet
        </div>
      </section>
    );
  }

  const mostActive = [...users].sort((a, b) => b.total_bets - a.total_bets).slice(0, 5);
  const highestWinRate = [...users]
    .filter((u) => u.total_bets >= 2)
    .sort((a, b) => b.win_rate - a.win_rate || b.total_bets - a.total_bets)
    .slice(0, 5);

  return (
    <section className="px-3 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-foreground/60" />
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Top Predictors</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RankingCard title="Most Active" users={mostActive} />
        <RankingCard title="Best Win Rate" users={highestWinRate} showWinRate />
      </div>
    </section>
  );
};

const RankingCard = ({ title, users, showWinRate }: { title: string; users: UserStat[]; showWinRate?: boolean }) => (
  <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden">
    <div className="px-3.5 py-2 border-b border-border/20">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
    </div>
    <div className="divide-y divide-border/15">
      {users.length > 0 ? (
        users.map((u, i) => (
          <div key={u.user_id} className="flex items-center gap-2 px-3.5 py-2">
            <span className="w-4 text-[10px] font-medium text-muted-foreground/60 tabular-nums shrink-0">
              {i + 1}
            </span>
            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-muted/30 flex items-center justify-center text-[9px] font-medium text-muted-foreground">
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                (u.display_name || "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-foreground/80 truncate">{u.display_name}</p>
              <p className="text-[9px] text-muted-foreground/60">{u.total_bets} bets · {u.wins}W</p>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums shrink-0">
              {showWinRate ? `${u.win_rate}%` : `${u.total_bets}`}
            </span>
          </div>
        ))
      ) : (
        <div className="p-4 text-center text-[11px] text-muted-foreground/50">
          Min 2 bets required
        </div>
      )}
    </div>
  </div>
);

export default DiscoverUserRankings;
