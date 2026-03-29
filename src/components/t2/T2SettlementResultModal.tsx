import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Trophy, TrendingUp, TrendingDown, Minus, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettledBet {
  id: string;
  outcome: string;
  amount: number;
  payout: number;
  keyword: string;
  keywordKo: string | null;
  artistName: string;
  marketOutcome: string;
  settledAt: string;
}

const OUTCOME_META: Record<string, { label: string; labelKo: string; icon: typeof TrendingUp; color: string }> = {
  mild: { label: "Flat", labelKo: "유지", icon: Minus, color: "text-blue-400" },
  strong: { label: "Rise", labelKo: "상승", icon: TrendingUp, color: "text-green-400" },
  explosive: { label: "Surge", labelKo: "급등", icon: Flame, color: "text-red-400" },
};

const STORAGE_KEY = "ktrenz_last_settlement_seen";

const T2SettlementResultModal = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  const { data: results } = useQuery({
    queryKey: ["settlement-results", user?.id],
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const lastSeen = localStorage.getItem(STORAGE_KEY) || "2000-01-01T00:00:00Z";

      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, outcome, amount, payout, market_id, created_at")
        .eq("user_id", user!.id)
        .not("payout", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!bets?.length) return [];

      const marketIds = [...new Set((bets as any[]).map((b) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, outcome, settled_at, status")
        .in("id", marketIds)
        .eq("status", "settled");

      if (!markets?.length) return [];

      const newMarkets = (markets as any[]).filter(
        (m) => m.settled_at && new Date(m.settled_at) > new Date(lastSeen)
      );
      if (!newMarkets.length) return [];

      const newMarketIds = new Set(newMarkets.map((m) => m.id));
      const triggerIds = newMarkets.map((m) => m.trigger_id);

      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, artist_name")
        .in("id", triggerIds);

      const triggerMap = new Map((triggers || []).map((t: any) => [t.id, t]));
      const marketMap = new Map(newMarkets.map((m: any) => [m.id, m]));

      const settled: SettledBet[] = [];
      for (const bet of bets as any[]) {
        if (!newMarketIds.has(bet.market_id)) continue;
        const market = marketMap.get(bet.market_id);
        if (!market) continue;
        const trigger = triggerMap.get(market.trigger_id);
        if (!trigger) continue;

        settled.push({
          id: bet.id,
          outcome: bet.outcome,
          amount: bet.amount,
          payout: bet.payout ?? 0,
          keyword: trigger.keyword,
          keywordKo: trigger.keyword_ko,
          artistName: trigger.artist_name,
          marketOutcome: market.outcome,
          settledAt: market.settled_at,
        });
      }

      return settled;
    },
  });

  useEffect(() => {
    if (results && results.length > 0) {
      setOpen(true);
    }
  }, [results]);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  };

  if (!results?.length) return null;

  const totalSpent = results.reduce((s, r) => s + r.amount, 0);
  const totalPayout = results.reduce((s, r) => s + r.payout, 0);
  const netProfit = totalPayout - totalSpent;
  const wins = results.filter((r) => r.payout > 0).length;

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent className="max-h-[85dvh] bg-background rounded-t-2xl">
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-2 mb-1" />

        {/* Hero */}
        <div className={cn(
          "px-6 pt-4 pb-5 text-center",
          netProfit > 0
            ? "bg-gradient-to-b from-green-500/15 to-transparent"
            : netProfit < 0
              ? "bg-gradient-to-b from-red-500/10 to-transparent"
              : "bg-gradient-to-b from-muted/20 to-transparent"
        )}>
          <div className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3",
            netProfit > 0 ? "bg-green-500/15" : netProfit < 0 ? "bg-red-500/10" : "bg-muted/30"
          )}>
            <Trophy className={cn(
              "w-7 h-7",
              netProfit > 0 ? "text-green-400" : netProfit < 0 ? "text-red-400" : "text-muted-foreground"
            )} />
          </div>
          <h2 className="text-lg font-black text-foreground">
            {language === "ko" ? "예측 결과 발표!" : "Prediction Results!"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {language === "ko"
              ? `${results.length}건의 예측이 정산되었습니다`
              : `${results.length} prediction${results.length > 1 ? "s" : ""} settled`}
          </p>

          <div className={cn(
            "mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-lg font-black",
            netProfit > 0
              ? "bg-green-500/15 text-green-400"
              : netProfit < 0
                ? "bg-red-500/15 text-red-400"
                : "bg-muted/30 text-muted-foreground"
          )}>
            {netProfit > 0 ? "+" : ""}{netProfit} K-Point
          </div>

          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>{language === "ko" ? "적중" : "Wins"}: <strong className="text-foreground">{wins}/{results.length}</strong></span>
            <span>{language === "ko" ? "투자" : "Spent"}: <strong className="text-foreground">{totalSpent}</strong></span>
            <span>{language === "ko" ? "수익" : "Earned"}: <strong className="text-foreground">{totalPayout}</strong></span>
          </div>
        </div>

        {/* Results list */}
        <div className="px-4 pb-4 overflow-y-auto flex-1 space-y-2">
          {results.map((r) => {
            const won = r.payout > 0;
            const meta = OUTCOME_META[r.outcome] || OUTCOME_META.mild;
            const actualMeta = OUTCOME_META[r.marketOutcome] || OUTCOME_META.mild;
            const Icon = meta.icon;
            const keyword = language === "ko" && r.keywordKo ? r.keywordKo : r.keyword;

            return (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border",
                  won ? "border-green-500/20 bg-green-500/5" : "border-border bg-muted/20"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-black",
                  won ? "bg-green-500/15 text-green-400" : "bg-muted/30 text-muted-foreground"
                )}>
                  {won ? "🎯" : "✗"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {r.artistName}
                  </div>
                  <div className="text-sm font-bold text-foreground truncate">{keyword}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      {language === "ko" ? "예측" : "Bet"}: <Icon className={cn("w-3 h-3", meta.color)} />
                      <span className={meta.color}>{language === "ko" ? meta.labelKo : meta.label}</span>
                    </span>
                    <span>→</span>
                    <span className="flex items-center gap-0.5">
                      {language === "ko" ? "결과" : "Result"}: 
                      <span className={actualMeta.color}>{language === "ko" ? actualMeta.labelKo : actualMeta.label}</span>
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "text-sm font-black shrink-0",
                  won ? "text-green-400" : "text-red-400"
                )}>
                  {won ? `+${r.payout - r.amount}` : `-${r.amount}`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Close CTA */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleClose}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-all active:scale-[0.97]"
          >
            {language === "ko" ? "확인" : "Got it"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default T2SettlementResultModal;
