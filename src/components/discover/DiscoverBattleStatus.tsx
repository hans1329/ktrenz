import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Swords, Clock, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

const DiscoverBattleStatus = () => {
  const { data: battle, isLoading } = useQuery({
    queryKey: ["discover-battle-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_b2_battles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 1000 * 60 * 2,
  });

  const { data: stats } = useQuery({
    queryKey: ["discover-battle-stats"],
    queryFn: async () => {
      const { count: totalPredictions } = await supabase
        .from("b2_predictions")
        .select("*", { count: "exact", head: true });

      const { count: todayPredictions } = await supabase
        .from("b2_predictions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().slice(0, 10));

      const { count: totalBattles } = await supabase
        .from("ktrenz_b2_battles")
        .select("*", { count: "exact", head: true });

      return {
        totalPredictions: totalPredictions || 0,
        todayPredictions: todayPredictions || 0,
        totalBattles: totalBattles || 0,
      };
    },
    staleTime: 1000 * 60 * 2,
  });

  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!battle?.betting_closes_at) return;
    const target = new Date(battle.betting_closes_at).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setCountdown("Closed"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [battle?.betting_closes_at]);

  const statusLabel = battle?.status === "open" ? "Betting Open" :
    battle?.status === "collecting" ? "Collecting Data" :
    battle?.status === "settled" ? "Settled" : battle?.status || "—";

  const statusColor = battle?.status === "open" ? "text-emerald-400 bg-emerald-500/10" :
    battle?.status === "collecting" ? "text-amber-400 bg-amber-500/10" :
    "text-muted-foreground bg-muted/30";

  if (isLoading) {
    return (
      <section className="px-3 mt-5">
        <Skeleton className="h-36 rounded-2xl" />
      </section>
    );
  }

  return (
    <section className="px-3 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Swords className="w-4 h-4 text-primary" />
        </div>
        <h2 className="text-[15px] font-bold text-foreground">Battle Status</h2>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4">
        {/* Status badge + countdown */}
        <div className="flex items-center justify-between mb-4">
          <div className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold", statusColor)}>
            {statusLabel}
          </div>
          {battle?.status === "open" && countdown && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              Closes in {countdown}
            </div>
          )}
          {battle?.battle_date && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(battle.battle_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2.5 rounded-xl bg-muted/30">
            <Swords className="w-4 h-4 mx-auto mb-1 text-primary/60" />
            <p className="text-lg font-bold text-foreground">{stats?.totalBattles || 0}</p>
            <p className="text-[10px] text-muted-foreground">Total Battles</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-muted/30">
            <Users className="w-4 h-4 mx-auto mb-1 text-primary/60" />
            <p className="text-lg font-bold text-foreground">{stats?.todayPredictions || 0}</p>
            <p className="text-[10px] text-muted-foreground">Today's Bets</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-muted/30">
            <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-primary/60" />
            <p className="text-lg font-bold text-foreground">{stats?.totalPredictions || 0}</p>
            <p className="text-[10px] text-muted-foreground">Total Bets</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DiscoverBattleStatus;
