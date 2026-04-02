import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, ChevronRight, ExternalLink, Crosshair, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const outcomeLabels: Record<string, string> = {
  explosive: "🔥 Explosive",
  strong: "💪 Strong",
  mild: "🌱 Mild",
};
const outcomeColors: Record<string, string> = {
  explosive: "text-red-400",
  strong: "text-amber-400",
  mild: "text-emerald-400",
};

interface ProfileTrendBetsProps {
  onClose: () => void;
}

const ProfileTrendBets: React.FC<ProfileTrendBetsProps> = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { language, t } = useLanguage();


  // ── Predictions (up to 3) ──
  const { data: bets = [], isLoading } = useQuery({
    queryKey: ["profile-trend-bets", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: userBets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, amount, outcome, payout, created_at, market_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (!userBets?.length) return [];

      const marketIds = [...new Set((userBets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, status")
        .in("id", marketIds);
      if (!markets) return [];

      const triggerIds = [...new Set((markets as any[]).map((m: any) => m.trigger_id))];
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko")
        .in("id", triggerIds);

      const marketMap = new Map((markets as any[]).map((m: any) => [m.id, m]));
      const triggerMap = new Map((triggers as any[] || []).map((t: any) => [t.id, t]));

      return (userBets as any[]).map((bet: any) => {
        const market = marketMap.get(bet.market_id);
        const trigger = market ? triggerMap.get(market.trigger_id) : null;
        return {
          id: bet.id, amount: bet.amount, outcome: bet.outcome, payout: bet.payout,
          keyword: trigger?.keyword || "—", keyword_ko: trigger?.keyword_ko || null,
          trigger_id: trigger?.id || "", market_status: market?.status || "open",
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  if (!user) return null;

  const isEmpty = !isLoading && bets.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-bold text-foreground uppercase tracking-wider">
            {t("dash.activeTrends")}
          </span>
        </div>
        <button
          onClick={() => { onClose(); navigate("/dashboard"); }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          <span>All</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {isEmpty ? (
        <div className="p-3 rounded-lg border border-dashed border-border/60 text-center">
          <p className="text-xs text-muted-foreground">{t("dash.noTrackedKeywords")}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {bets.map((bet) => {
            const displayKeyword = language === "ko" && bet.keyword_ko ? bet.keyword_ko : bet.keyword;
            const isPending = bet.market_status === "open";
            const isWin = bet.payout != null && bet.payout > 0;
            const isLoss = bet.payout != null && bet.payout === 0;
            return (
              <button
                key={bet.id}
                onClick={() => { onClose(); if (bet.trigger_id) navigate(`/t2/${bet.trigger_id}`); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all text-left group"
              >
                <span className="text-sm shrink-0" style={{ filter: "hue-rotate(260deg) saturate(2)" }}>💎</span>
                <div className="flex-1 min-w-0">
                   <p className="text-sm font-bold text-foreground truncate">{displayKeyword}</p>
                  <p className={cn("text-xs font-medium", outcomeColors[bet.outcome] || "text-muted-foreground")}>
                    {outcomeLabels[bet.outcome] || bet.outcome}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{bet.amount.toLocaleString()}</p>
                   {isPending && <span className="text-xs text-primary font-medium">Pending</span>}
                  {isWin && <span className="text-xs text-emerald-400 font-bold">+{bet.payout!.toLocaleString()}</span>}
                  {isLoss && <span className="text-xs text-red-400 font-medium">Lost</span>}
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProfileTrendBets;
