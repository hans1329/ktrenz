import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Loader2, LogIn, Trophy, Clock, Flame, Sprout, Rocket, Gem } from "lucide-react";
import { Button } from "@/components/ui/button";
import V3Header from "@/components/v3/V3Header";
import HeaderTicketSlot from "@/components/HeaderTicketSlot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";

const Notifications = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();

  // ── Pending predictions ──
  const { data: pendingPreds, isLoading: pendingLoading } = useQuery({
    queryKey: ["notif-pending", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: preds } = await supabase
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, created_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!preds || preds.length === 0) return [];
      const runIds = [...new Set(preds.flatMap(p => [p.picked_run_id, p.opponent_run_id]))];
      const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any).select("id, star_id").in("id", runIds);
      const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
      const { data: stars } = await (supabase.from("ktrenz_stars") as any).select("id, display_name").in("id", starIds);
      const runToStar = new Map<string, string>();
      (runs || []).forEach((r: any) => {
        const star = (stars || []).find((s: any) => s.id === r.star_id);
        if (star) runToStar.set(r.id, star.display_name);
      });
      return preds.map(p => ({
        ...p,
        picked_star_name: runToStar.get(p.picked_run_id) || "Unknown",
        opponent_star_name: runToStar.get(p.opponent_run_id) || "Unknown",
      }));
    },
    enabled: !!user?.id,
  });

  // ── Settled battle results ──
  const { data: battleResults, isLoading: resultsLoading } = useQuery({
    queryKey: ["notif-battle-results", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: preds } = await supabase
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, picked_growth, opponent_growth, settled_at")
        .eq("user_id", user.id)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(30);
      if (!preds || preds.length === 0) return [];
      const runIds = [...new Set(preds.flatMap(p => [p.picked_run_id, p.opponent_run_id]))];
      const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any).select("id, star_id").in("id", runIds);
      const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
      const { data: stars } = await (supabase.from("ktrenz_stars") as any).select("id, display_name").in("id", starIds);
      const runToStar = new Map<string, string>();
      (runs || []).forEach((r: any) => {
        const star = (stars || []).find((s: any) => s.id === r.star_id);
        if (star) runToStar.set(r.id, star.display_name);
      });
      return preds.map(p => ({
        ...p,
        picked_star_name: runToStar.get(p.picked_run_id) || "Unknown",
        opponent_star_name: runToStar.get(p.opponent_run_id) || "Unknown",
      }));
    },
    enabled: !!user?.id,
  });

  // ── Recent point transactions ──
  const { data: recentPoints } = useQuery({
    queryKey: ["notif-points", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_point_transactions" as any)
        .select("id, amount, reason, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
  });

  const isLoading = authLoading || pendingLoading || resultsLoading;

  const bandMeta = (band: string) => {
    if (band === "rising") return { Icon: Flame, color: "text-orange-500", label: t("notif.bandRising") };
    if (band === "surge") return { Icon: Rocket, color: "text-red-500", label: t("notif.bandSurge") };
    return { Icon: Sprout, color: "text-emerald-500", label: t("notif.bandSteady") };
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  if (authLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">{t("notif.loginRequired")}</h2>
          <p className="text-sm text-muted-foreground">{t("notif.loginDesc")}</p>
        </div>
        <Button onClick={() => navigate("/login")} className="h-12 px-8 rounded-full gap-2 font-medium">
          <LogIn className="w-5 h-5" />
          {t("common.signIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title="Alerts – KTrenZ" description="Battle predictions and results" path="/notifications" />

      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={<HeaderTicketSlot />} />
      </div>

      <div className="px-4 py-4 space-y-6 pb-24 pt-[4.5rem] max-w-lg mx-auto">

        {/* ── Pending Predictions ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-primary" />
            {t("notif.pendingPredictions")}
            {(pendingPreds?.length ?? 0) > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {pendingPreds!.length}
              </span>
            )}
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !pendingPreds?.length ? (
            <div className="rounded-xl bg-card border border-border/50 p-6 text-center">
              <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notif.noPending")}</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => navigate("/")}>
                {t("notif.goToBattle")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {pendingPreds.map((p: any) => {
                const { Icon: BandIcon, color: bandColor, label: bandLabel } = bandMeta(p.band);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-primary/20 bg-primary/[0.02] p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {t("notif.waiting")}
                        </span>
                        <span className="text-xs font-bold text-primary truncate">{p.picked_star_name}</span>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground truncate">{p.opponent_star_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <BandIcon className={cn("w-3 h-3", bandColor)} />
                        <span className="text-[10px] text-muted-foreground">{bandLabel}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{fmtDate(p.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Battle Results ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-primary" />
            {t("notif.battleResults")}
          </h2>
          {(!battleResults || battleResults.length === 0) ? (
            <div className="rounded-xl bg-card border border-border/50 p-6 text-center">
              <Trophy className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notif.noResults")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {battleResults.map((r: any) => {
                const won = r.status === "won";
                const { Icon: BandIcon, color: bandColor, label: bandLabel } = bandMeta(r.band);
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "rounded-xl border p-3 space-y-1.5",
                      won ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-border bg-card/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          won ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/10 text-red-500"
                        )}>
                          {won ? "WIN" : "LOSE"}
                        </span>
                        <span className="text-xs font-bold text-primary truncate">{r.picked_star_name}</span>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground truncate">{r.opponent_star_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={cn("font-bold", (r.picked_growth ?? 0) > 0 ? "text-emerald-500" : "text-red-500")}>
                          {r.picked_growth !== null ? `${r.picked_growth > 0 ? "+" : ""}${r.picked_growth}%` : "–"}
                        </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className={cn("font-bold", (r.opponent_growth ?? 0) > 0 ? "text-emerald-500" : "text-red-500")}>
                          {r.opponent_growth !== null ? `${r.opponent_growth > 0 ? "+" : ""}${r.opponent_growth}%` : "–"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <BandIcon className={cn("w-3 h-3", bandColor)} />
                          <span className="text-[10px] text-muted-foreground">{bandLabel}</span>
                        </div>
                        {(r.reward_amount ?? 0) > 0 && (
                          <span className={cn("text-xs font-bold flex items-center gap-0.5", won ? "text-primary" : "text-muted-foreground")}>
                            +{r.reward_amount} <Gem className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(r.settled_at)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Points History ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Gem className="w-4 h-4 text-primary" />
            {t("notif.recentPoints")}
          </h2>
          {(recentPoints?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-4">{t("notif.noPoints")}</p>
          ) : (
            <div className="space-y-1.5">
              {(recentPoints ?? []).map((pt: any) => (
                <div key={pt.id} className="flex items-center justify-between rounded-lg bg-card/60 border border-border/30 px-3 py-2">
                  <div>
                    <p className="text-sm text-foreground">{pt.description || pt.reason}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtDate(pt.created_at)}</p>
                  </div>
                  <span className={cn("text-sm font-bold", pt.amount > 0 ? "text-emerald-500" : "text-red-500")}>
                    {pt.amount > 0 ? "+" : ""}{pt.amount}P
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Notifications;
