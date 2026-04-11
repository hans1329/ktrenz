import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const DiscoverBattleStatus = () => {
  const { t: globalT } = useLanguage();
  const t = (key: string) => globalT(`discover.${key}`);

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
      if (diff <= 0) { setCountdown(t("closed")); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const iv = setInterval(tick, 60000);
    return () => clearInterval(iv);
  }, [battle?.betting_closes_at]);

  const statusLabel = battle?.status === "open" ? t("open") :
    battle?.status === "collecting" ? t("collecting") :
    battle?.status === "settled" ? t("settled") : battle?.status || "—";

  if (isLoading) {
    return (
      <section className="px-3 mt-4">
        <Skeleton className="h-20 rounded-xl" />
      </section>
    );
  }

  return (
    <section className="px-3 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">{t("battleStatus")}</h2>
      </div>

      <div className="rounded-xl border border-border/30 bg-card/60 p-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              battle?.status === "open" ? "bg-foreground" : "bg-muted-foreground/40"
            )} />
            <span className="text-[12px] font-medium text-foreground">{statusLabel}</span>
            {battle?.battle_date && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(battle.battle_date).toLocaleDateString("en", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          {battle?.status === "open" && countdown && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {countdown}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t("battles"), value: stats?.totalBattles || 0 },
            { label: t("today"), value: stats?.todayPredictions || 0 },
            { label: t("totalBets"), value: stats?.totalPredictions || 0 },
          ].map((item) => (
            <div key={item.label} className="text-center py-2 rounded-lg bg-muted/20">
              <p className="text-[15px] font-semibold text-foreground tabular-nums">{item.value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DiscoverBattleStatus;
