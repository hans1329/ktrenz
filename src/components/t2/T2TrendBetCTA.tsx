import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Target, ChevronRight, TrendingUp, TrendingDown, Minus, Clock, Trophy, Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface BetCandidate {
  id: string;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  category: string;
  deltaPct: number;
  trendGrade: string | null;
  detectedAt: string;
  marketId?: string;
  userBet?: string | null;
  totalVolume?: number;
}

const OUTCOMES = [
  { key: "mild", label: "Flat", labelKo: "유지", icon: Minus, color: "border-blue-500/40 bg-blue-500/10 text-blue-400", activeColor: "border-blue-500 bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/30", mult: "1.2x" },
  { key: "strong", label: "Rise", labelKo: "상승", icon: TrendingUp, color: "border-green-500/40 bg-green-500/10 text-green-400", activeColor: "border-green-500 bg-green-500/20 text-green-300 ring-2 ring-green-500/30", mult: "3x" },
  { key: "explosive", label: "Surge", labelKo: "급등", icon: Flame, color: "border-destructive/40 bg-destructive/10 text-destructive", activeColor: "border-destructive bg-destructive/20 text-red-300 ring-2 ring-destructive/30", mult: "10x" },
] as const;

function getKeyword(item: BetCandidate, lang: string) {
  if (lang === "ko" && item.keywordKo) return item.keywordKo;
  return item.keyword;
}

const T2TrendBetCTA = () => {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedOutcomes, setSelectedOutcomes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data: candidates } = useQuery({
    queryKey: ["trend-bet-candidates"],
    queryFn: async () => {
      const { data: tracking } = await supabase
        .from("ktrenz_trend_tracking" as any)
        .select("trigger_id, delta_pct, tracked_at")
        .order("tracked_at", { ascending: false })
        .limit(500);

      if (!tracking?.length) return [];

      const seen = new Map<string, any>();
      for (const t of tracking as any[]) {
        if (!seen.has(t.trigger_id)) seen.set(t.trigger_id, t);
      }

      const interesting = [...seen.values()]
        .filter((t) => Math.abs(t.delta_pct) > 5)
        .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
        .slice(0, 6);

      if (!interesting.length) return [];

      const triggerIds = interesting.map((t) => t.trigger_id);
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name, keyword_category, trend_grade, detected_at")
        .in("id", triggerIds)
        .eq("status", "active");

      // Check existing markets & user bets
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, total_volume, status")
        .in("trigger_id", triggerIds)
        .eq("status", "open");

      let userBets: any[] = [];
      if (user) {
        const marketIds = (markets || []).map((m: any) => m.id);
        if (marketIds.length) {
          const { data } = await supabase
            .from("ktrenz_trend_bets" as any)
            .select("market_id, outcome")
            .eq("user_id", user.id)
            .in("market_id", marketIds);
          userBets = data || [];
        }
      }

      const marketByTrigger = new Map((markets || []).map((m: any) => [m.trigger_id, m]));
      const betByMarket = new Map(userBets.map((b: any) => [b.market_id, b.outcome]));
      const triggerMap = new Map((triggers || []).map((t: any) => [t.id, t]));

      return interesting
        .map((t) => {
          const trigger = triggerMap.get(t.trigger_id) as any;
          if (!trigger) return null;
          const market = marketByTrigger.get(t.trigger_id);
          return {
            id: trigger.id,
            keyword: trigger.keyword,
            keywordKo: trigger.keyword_ko,
            artistName: trigger.artist_name,
            category: trigger.keyword_category,
            deltaPct: t.delta_pct,
            trendGrade: trigger.trend_grade,
            detectedAt: trigger.detected_at,
            marketId: market?.id,
            userBet: market ? betByMarket.get(market.id) || null : null,
            totalVolume: market?.total_volume ?? 0,
          } as BetCandidate;
        })
        .filter(Boolean) as BetCandidate[];
    },
    staleTime: 1000 * 60 * 3,
  });

  // User stats
  const { data: userStats } = useQuery({
    queryKey: ["trend-bet-user-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("amount, payout")
        .eq("user_id", user!.id);

      if (!bets?.length) return null;
      const total = bets.length;
      const wins = bets.filter((b: any) => b.payout && b.payout > 0).length;
      const pending = bets.filter((b: any) => b.payout === null).length;
      const totalEarned = bets.reduce((sum: number, b: any) => sum + (b.payout ?? 0), 0);
      const totalSpent = bets.reduce((sum: number, b: any) => sum + b.amount, 0);
      return { total, wins, pending, totalEarned, totalSpent, profit: totalEarned - totalSpent };
    },
    staleTime: 1000 * 60 * 5,
  });

  const placeBet = async (triggerId: string, outcome: string) => {
    if (!user) {
      toast.error(language === "ko" ? "로그인이 필요합니다" : "Login required");
      return;
    }
    setSubmitting(triggerId);
    try {
      const { data, error } = await supabase.functions.invoke("ktrenz-trend-bet", {
        body: { triggerId, outcome, amount: 10 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        language === "ko"
          ? `${outcome === "mild" ? "유지" : outcome === "strong" ? "상승" : "급등"} 예측 완료! (${data.multiplier}x)`
          : `Predicted ${outcome}! (${data.multiplier}x)`
      );
      queryClient.invalidateQueries({ queryKey: ["trend-bet-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["trend-bet-user-stats"] });
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setSubmitting(null);
    }
  };

  if (!candidates?.length) return null;

  return (
    <section className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500/10">
            <Target className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground">
              {language === "ko" ? "내일의 트렌드 예측" : "Tomorrow's Trend"}
            </h2>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {language === "ko" ? "24시간 후 결과 발표 · 10 K-Point" : "Results in 24h · 10 K-Point"}
            </p>
          </div>
        </div>

        {userStats && userStats.total > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted/50 text-[10px] font-bold text-muted-foreground">
            <Trophy className="w-3 h-3 text-amber-500" />
            {userStats.wins}/{userStats.total}
            {userStats.profit !== 0 && (
              <span className={userStats.profit > 0 ? "text-green-400" : "text-red-400"}>
                {userStats.profit > 0 ? "+" : ""}{userStats.profit}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {candidates.slice(0, 3).map((item) => {
          const selected = selectedOutcomes[item.id] || item.userBet;
          const hasAlreadyBet = !!item.userBet;
          const isSubmitting = submitting === item.id;

          return (
            <div
              key={item.id}
              className="rounded-2xl p-4 border border-border bg-card"
            >
              {/* Keyword info */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {item.artistName}
                  </span>
                  <h3
                    className="text-[15px] font-bold text-foreground leading-snug truncate cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setSearchParams((p) => { p.set("modal", item.id); return p; })}
                  >
                    {getKeyword(item, language)}
                  </h3>
                </div>
                <div className={cn(
                  "flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-black shrink-0",
                  item.deltaPct > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {item.deltaPct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {item.deltaPct > 0 ? "+" : ""}{item.deltaPct.toFixed(0)}%
                </div>
              </div>

              {/* Outcome buttons */}
              <div className="grid grid-cols-3 gap-2">
                {OUTCOMES.map(({ key, label, labelKo, icon: Icon, color, activeColor, mult }) => {
                  const isSelected = selected === key;
                  const isDisabled = hasAlreadyBet && !isSelected;

                  return (
                    <button
                      key={key}
                      disabled={hasAlreadyBet || isSubmitting}
                      onClick={() => {
                        if (!hasAlreadyBet) {
                          setSelectedOutcomes((prev) => ({ ...prev, [item.id]: key }));
                        }
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-all",
                        isSelected ? activeColor : color,
                        isDisabled && "opacity-30",
                        !hasAlreadyBet && !isSubmitting && "active:scale-95"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] font-bold">{language === "ko" ? labelKo : label}</span>
                      <span className="text-[9px] opacity-60 text-black dark:text-black">{mult}</span>
                    </button>
                  );
                })}
              </div>

              {/* Confirm / Status */}
              {hasAlreadyBet ? (
                <div className="mt-2.5 text-center text-[11px] text-muted-foreground">
                  ✅ {language === "ko" ? "예측 완료 — 24시간 후 결과 발표" : "Predicted — results in 24h"}
                </div>
              ) : selected && !hasAlreadyBet ? (
                <button
                  onClick={() => placeBet(item.id, selected)}
                  disabled={isSubmitting}
                  className="mt-2.5 w-full py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  {isSubmitting
                    ? "..."
                    : language === "ko"
                      ? `${selected === "mild" ? "유지" : selected === "strong" ? "상승" : "급등"} 예측하기 (10 K-Point)`
                      : `Predict ${selected} (10 K-Point)`}
                </button>
              ) : null}

              {item.totalVolume ? (
                <div className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {item.totalVolume} K-Point {language === "ko" ? "참여 중" : "wagered"}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default T2TrendBetCTA;
