import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import HeaderTicketSlot from "@/components/HeaderTicketSlot";
import V3TabBar from "@/components/v3/V3TabBar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, CheckCircle2, XCircle, Timer, Swords,
  Trophy, TrendingUp, Sprout, Flame, Rocket, Eye,
} from "lucide-react";
import { format } from "date-fns";
import SettlementResultsModal, { type SettledPrediction } from "@/components/battle/SettlementResultsModal";

type Band = "steady" | "rising" | "surge";

const BAND_META: Record<Band, { emoji: string; label: string; labelKo: string; icon: typeof Sprout }> = {
  steady: { emoji: "🌱", label: "Steady", labelKo: "안정", icon: Sprout },
  rising: { emoji: "🔥", label: "Rising", labelKo: "상승", icon: Flame },
  surge: { emoji: "🚀", label: "Surge", labelKo: "급등", icon: Rocket },
};

function safeFormat(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return format(d, "MM.dd HH:mm");
}

const UserDashboard = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [reviewResults, setReviewResults] = useState<SettledPrediction[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // ── My Battle Predictions ──
  const { data: myPredictions, isLoading: predictionsLoading } = useQuery({
    queryKey: ["dashboard-battle-predictions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: preds } = await supabase
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, picked_growth, opponent_growth, settled_at, created_at, seen_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!preds?.length) return [];

      const runIds = [...new Set((preds as any[]).flatMap((p: any) => [p.picked_run_id, p.opponent_run_id]))];
      const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any)
        .select("id, star_id")
        .in("id", runIds);
      const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
      const { data: stars } = await (supabase.from("ktrenz_stars") as any)
        .select("id, display_name")
        .in("id", starIds);

      const runToStar = new Map<string, string>();
      (runs || []).forEach((r: any) => {
        const star = (stars || []).find((s: any) => s.id === r.star_id);
        if (star) runToStar.set(r.id, star.display_name);
      });

      return (preds as any[]).map((p: any) => ({
        ...p,
        picked_star_name: runToStar.get(p.picked_run_id) || "Unknown",
        opponent_star_name: runToStar.get(p.opponent_run_id) || "Unknown",
      }));
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    if (!myPredictions?.length) return { total: 0, won: 0, lost: 0, pending: 0, totalReward: 0 };
    let won = 0, lost = 0, pending = 0, totalReward = 0;
    for (const p of myPredictions) {
      if (p.status === "won") { won++; totalReward += (p.reward_amount || 0); }
      else if (p.status === "lost") { lost++; }
      else { pending++; }
    }
    return { total: myPredictions.length, won, lost, pending, totalReward };
  }, [myPredictions]);

  // Group settled predictions by date for review
  const settledByDate = useMemo(() => {
    if (!myPredictions?.length) return [];
    const settled = myPredictions.filter((p: any) => p.status === "won" || p.status === "lost");
    const dateMap = new Map<string, any[]>();
    for (const p of settled) {
      const dateKey = p.settled_at ? format(new Date(p.settled_at), "yyyy-MM-dd") : "unknown";
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
      dateMap.get(dateKey)!.push(p);
    }
    return Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, preds]) => ({
        date,
        preds,
        wins: preds.filter((p: any) => p.status === "won").length,
        total: preds.length,
        totalReward: preds.reduce((s: number, p: any) => s + (p.reward_amount || 0), 0),
      }));
  }, [myPredictions]);

  function openReviewModal(preds: any[]) {
    const mapped: SettledPrediction[] = preds.map((p: any) => ({
      id: p.id,
      picked_star_name: p.picked_star_name,
      opponent_star_name: p.opponent_star_name,
      band: p.band as Band,
      status: p.status as "won" | "lost",
      reward_amount: p.reward_amount || 0,
      picked_growth: p.picked_growth,
      opponent_growth: p.opponent_growth,
      settled_at: p.settled_at,
    }));
    setReviewResults(mapped);
    setShowReviewModal(true);
  }

  const lang = language === "ko" ? "ko" : "en";

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title="My Activity – KTrenZ" description="Your battle activity and results" path="/dashboard" />
      
      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={<HeaderTicketSlot />} />
      </div>

      {!user ? (
        <div className="flex-1 flex items-center justify-center min-h-[calc(100dvh-3.5rem-6rem)] px-4">
          <Card className="p-8 text-center border-border bg-card max-w-xs w-full">
            <Swords className="w-10 h-10 mx-auto text-primary/40 mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">{t("dash.signInPrompt")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("dash.signInDesc")}</p>
            <button onClick={() => navigate("/login")} className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold w-full">
              {t("dash.signIn")}
            </button>
          </Card>
        </div>
      ) : (
      <main className="pt-14 pb-24 px-4 max-w-2xl mx-auto">

        {/* ── 1. Battle Stats Summary ── */}
        <section className="mt-4 mb-5">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" />
            {lang === "ko" ? "배틀 전적" : "Battle Record"}
          </h2>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-foreground">{stats.total}</p>
              <p className="text-[9px] text-muted-foreground">{lang === "ko" ? "전체" : "Total"}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-emerald-500">{stats.won}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.won")}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-muted-foreground">{stats.lost}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.lost")}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-primary">{stats.pending}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.pending")}</p>
            </Card>
          </div>

          {stats.totalReward > 0 && (
            <Card className="p-3 bg-primary/5 border-primary/20 mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {lang === "ko" ? "총 획득 보상" : "Total Earned"}
              </span>
              <span className="text-sm font-black text-primary">{stats.totalReward.toLocaleString()} 💎</span>
            </Card>
          )}
        </section>

        {/* ── 2. Recent Predictions ── */}
        <section className="mb-5">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            {lang === "ko" ? "최근 예측" : "Recent Predictions"}
          </h2>

          {predictionsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !myPredictions?.length ? (
            <Card className="p-6 text-center border-border bg-card">
              <Swords className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {lang === "ko" ? "아직 참여한 배틀이 없습니다." : "No battles yet."}
              </p>
              <button
                onClick={() => navigate("/")}
                className="mt-3 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold"
              >
                {lang === "ko" ? "배틀 참여하기" : "Join Battle"}
              </button>
            </Card>
          ) : (
            <div className="space-y-2">
              {myPredictions.slice(0, 10).map((pred: any) => {
                const band = BAND_META[pred.band as Band] || BAND_META.steady;
                const isPending = pred.status === "pending" || pred.status === "open";
                const isWon = pred.status === "won";
                const isLost = pred.status === "lost";

                return (
                  <div
                    key={pred.id}
                    className={cn(
                      "rounded-xl border p-3 flex items-center gap-3",
                      isWon ? "border-emerald-500/30 bg-emerald-500/5" :
                      isLost ? "border-border bg-card" :
                      "border-border bg-card"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      isWon ? "bg-emerald-500/10" : isLost ? "bg-muted" : "bg-primary/5"
                    )}>
                      {isWon ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                       isLost ? <XCircle className="w-5 h-5 text-muted-foreground" /> :
                       <Timer className="w-5 h-5 text-primary" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {pred.picked_star_name} <span className="text-muted-foreground font-normal">vs</span> {pred.opponent_star_name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                        <span>{band.emoji} {lang === "ko" ? band.labelKo : band.label}</span>
                        <span>·</span>
                        <span>{safeFormat(pred.created_at)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {isPending && (
                        <span className="text-[10px] text-amber-500 font-medium">
                          {lang === "ko" ? "대기중" : "Pending"}
                        </span>
                      )}
                      {isWon && (
                        <>
                          <p className="text-sm font-bold text-emerald-500">+{pred.reward_amount || 0} 💎</p>
                          <span className="text-[10px] text-emerald-500 font-medium">
                            {lang === "ko" ? "적중!" : "Won!"}
                          </span>
                        </>
                      )}
                      {isLost && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {lang === "ko" ? "미적중" : "Missed"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 3. Settlement History (re-viewable) ── */}
        {settledByDate.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              {lang === "ko" ? "정산 기록" : "Settlement History"}
            </h2>

            <div className="space-y-2">
              {settledByDate.map(({ date, preds, wins, total, totalReward }) => (
                <button
                  key={date}
                  onClick={() => openReviewModal(preds)}
                  className="w-full rounded-xl border border-border bg-card p-3 flex items-center gap-3 text-left active:bg-muted/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                    <Eye className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{format(new Date(date), "MM.dd")}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {wins}/{total} {lang === "ko" ? "적중" : "correct"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {totalReward > 0 && (
                      <p className="text-xs font-bold text-primary">+{totalReward} 💎</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      )}

      <SettlementResultsModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        results={reviewResults}
        language={language}
      />
      <V3TabBar activeTab="activity" onTabChange={() => {}} />
    </div>
  );
};

export default UserDashboard;
