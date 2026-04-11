import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Flame, Award } from "lucide-react";
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
      <section className="px-3 mt-5">
        <Skeleton className="h-40 rounded-2xl" />
      </section>
    );
  }

  if (users.length === 0) {
    return (
      <section className="px-3 mt-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-violet-400" />
          </div>
          <h2 className="text-[15px] font-bold text-foreground">Top Predictors</h2>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/80 p-6 text-center text-sm text-muted-foreground">
          No predictions yet. Be the first to join!
        </div>
      </section>
    );
  }

  // Split: most active + highest win rate
  const mostActive = [...users].sort((a, b) => b.total_bets - a.total_bets).slice(0, 5);
  const highestWinRate = [...users]
    .filter((u) => u.total_bets >= 2)
    .sort((a, b) => b.win_rate - a.win_rate || b.total_bets - a.total_bets)
    .slice(0, 5);

  return (
    <section className="px-3 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-violet-400" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">Top Predictors</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Most Active */}
        <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30 bg-gradient-to-r from-orange-500/5 to-transparent">
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[12px] font-bold text-foreground">Most Active</span>
          </div>
          <div className="divide-y divide-border/20">
            {mostActive.map((u, i) => (
              <UserRow key={u.user_id} user={u} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* Highest Win Rate */}
        <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[12px] font-bold text-foreground">Highest Win Rate</span>
          </div>
          <div className="divide-y divide-border/20">
            {highestWinRate.length > 0 ? (
              highestWinRate.map((u, i) => (
                <UserRow key={u.user_id} user={u} rank={i + 1} showWinRate />
              ))
            ) : (
              <div className="p-4 text-center text-[11px] text-muted-foreground">
                Need 2+ bets to qualify
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const UserRow = ({ user, rank, showWinRate }: { user: UserStat; rank: number; showWinRate?: boolean }) => (
  <div className="flex items-center gap-2.5 px-3.5 py-2">
    <span className="w-5 text-center text-[11px] font-bold text-muted-foreground shrink-0">
      {rank}
    </span>
    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        (user.display_name || "?").charAt(0).toUpperCase()
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[12px] font-semibold text-foreground truncate">{user.display_name}</p>
      <p className="text-[10px] text-muted-foreground">
        {user.total_bets} bets · {user.wins}W {user.losses}L
      </p>
    </div>
    {showWinRate ? (
      <span className={cn(
        "text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
        user.win_rate >= 50 ? "text-emerald-400 bg-emerald-500/10" : "text-muted-foreground bg-muted/30"
      )}>
        {user.win_rate}%
      </span>
    ) : (
      <span className="text-[11px] font-bold text-primary shrink-0">
        {user.total_bets} bets
      </span>
    )}
  </div>
);

export default DiscoverUserRankings;
