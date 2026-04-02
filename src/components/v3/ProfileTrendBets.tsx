import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Crosshair, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { differenceInHours, differenceInMinutes, format } from "date-fns";

const outcomeConfig: Record<string, { emoji: string; label: Record<string, string>; reward: string }> = {
  mild: { emoji: "🌱", label: { en: "Mild", ko: "소폭" }, reward: "100T" },
  strong: { emoji: "🔥", label: { en: "Strong", ko: "강세" }, reward: "300T" },
  explosive: { emoji: "🚀", label: { en: "Explosive", ko: "폭발" }, reward: "1,000T" },
};

interface ProfileTrendBetsProps {
  onClose: () => void;
}

const ProfileTrendBets: React.FC<ProfileTrendBetsProps> = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const { data: bets = [], isLoading } = useQuery({
    queryKey: ["profile-trend-bets", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: userBets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, amount, outcome, payout, created_at, market_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!userBets?.length) return [];

      const marketIds = [...new Set((userBets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, status, expires_at, outcome")
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
          id: bet.id,
          outcome: bet.outcome,
          payout: bet.payout,
          created_at: bet.created_at,
          keyword: trigger?.keyword || "—",
          keyword_ko: trigger?.keyword_ko || null,
          trigger_id: trigger?.id || "",
          market_status: market?.status || "open",
          market_outcome: market?.outcome || null,
          expires_at: market?.expires_at || null,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  if (!user) return null;

  const isEmpty = !isLoading && bets.length === 0;

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const exp = new Date(expiresAt);
    const now = new Date();
    if (exp <= now) return null;
    const hours = differenceInHours(exp, now);
    const mins = differenceInMinutes(exp, now) % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getParticipatedTime = (createdAt: string) => {
    return format(new Date(createdAt), "MM.dd HH:mm");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-bold text-foreground uppercase tracking-wider">
            {language === "ko" ? "내 트렌드 예측" : "My Predictions"}
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
          <p className="text-xs text-muted-foreground">
            {language === "ko" ? "아직 참여한 예측이 없습니다." : "No predictions yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {bets.map((bet) => {
            const displayKeyword = language === "ko" && bet.keyword_ko ? bet.keyword_ko : bet.keyword;
            const isPending = bet.market_status === "open";
            const isSettled = bet.market_status === "settled";
            const isWin = bet.payout != null && bet.payout > 0;
            const isLoss = isSettled && (bet.payout == null || bet.payout === 0);
            const config = outcomeConfig[bet.outcome] || { emoji: "❓", label: { en: bet.outcome, ko: bet.outcome }, reward: "—" };
            const timeLeft = getTimeRemaining(bet.expires_at);

            return (
              <button
                key={bet.id}
                onClick={() => { onClose(); if (bet.trigger_id) navigate(`/t2/${bet.trigger_id}`); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all text-left group"
              >
                {/* Outcome emoji */}
                <div className="text-xl shrink-0 w-8 text-center">{config.emoji}</div>

                {/* Keyword + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{displayKeyword}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                    <span>{config.label[language] || config.label.en}</span>
                    <span>·</span>
                    <span>{getParticipatedTime(bet.created_at)}</span>
                  </div>
                </div>

                {/* Status + reward */}
                <div className="text-right shrink-0">
                  {isPending && (
                    <>
                      <p className="text-sm font-bold text-primary">{config.reward}</p>
                      {timeLeft && (
                        <span className="text-[10px] text-muted-foreground">
                          {language === "ko" ? `${timeLeft} 남음` : `${timeLeft} left`}
                        </span>
                      )}
                      {!timeLeft && (
                        <span className="text-[10px] text-amber-500 font-medium">
                          {language === "ko" ? "정산 대기" : "Settling"}
                        </span>
                      )}
                    </>
                  )}
                  {isWin && (
                    <>
                      <p className="text-sm font-bold text-emerald-500">+{bet.payout!.toLocaleString()}T</p>
                      <span className="text-[10px] text-emerald-500 font-medium">
                        {language === "ko" ? "적중!" : "Won!"}
                      </span>
                    </>
                  )}
                  {isLoss && (
                    <>
                      <p className="text-sm font-bold text-muted-foreground">+10T</p>
                      <span className="text-[10px] text-muted-foreground">
                        {language === "ko" ? "참여 보상" : "Consolation"}
                      </span>
                    </>
                  )}
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
