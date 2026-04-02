import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import V3TabBar from "@/components/v3/V3TabBar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Crosshair, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Timer,
  BarChart3, Eye, Bot, ExternalLink, TrendingUp, Crown, Heart,
} from "lucide-react";
import { differenceInHours, differenceInMinutes, format } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const OUTCOME_CONFIG: Record<string, { emoji: string; label: string; labelKo: string; threshold: string; reward: string }> = {
  mild: { emoji: "🌱", label: "Mild", labelKo: "소폭", threshold: "10~15%", reward: "100T" },
  strong: { emoji: "🔥", label: "Strong", labelKo: "강세", threshold: "15~50%", reward: "300T" },
  explosive: { emoji: "🚀", label: "Explosive", labelKo: "폭발", threshold: "50%+", reward: "1,000T" },
};

const EVENT_WEIGHTS: Record<string, number> = {
  external_link_click: 3, t2_external_link_click: 3, agent_chat: 2,
  artist_detail_view: 1, t2_artist_view: 1, t2_keyword_detail_view: 1,
  t2_treemap_click: 1, t2_list_click: 1, t2_artist_click: 1,
  t2_detail_open: 0.5, t2_share: 2, artist_detail_section: 0.5,
  treemap_click: 1, list_click: 0.5,
};

function getTimeRemaining(expiresAt: string | null) {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp <= now) return null;
  const hours = differenceInHours(exp, now);
  const mins = differenceInMinutes(exp, now) % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

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

  // ── My Predictions ──
  const { data: myBets, isLoading: betsLoading } = useQuery({
    queryKey: ["dashboard-my-bets", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, market_id, outcome, amount, payout, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }).limit(30);
      if (!bets?.length) return [];
      const marketIds = [...new Set((bets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, status, outcome, expires_at")
        .in("id", marketIds);
      const marketMap = new Map<string, any>();
      (markets ?? []).forEach((m: any) => marketMap.set(m.id, m));
      const triggerIds = [...new Set((markets ?? []).map((m: any) => m.trigger_id).filter(Boolean))];
      let triggerMap = new Map<string, any>();
      if (triggerIds.length) {
        const { data: triggers } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko, keyword_category, star_id")
          .in("id", triggerIds);
        (triggers ?? []).forEach((t: any) => triggerMap.set(t.id, t));
      }
      return (bets as any[]).map((b: any) => {
        const market = marketMap.get(b.market_id);
        const trigger = market ? triggerMap.get(market.trigger_id) : null;
        return {
          ...b,
          market,
          trigger,
          keyword: trigger?.keyword || "Unknown",
          keyword_ko: trigger?.keyword_ko,
          trigger_id: market?.trigger_id || "",
        };
      });
    },
    staleTime: 30_000,
  });

  const betStats = useMemo(() => {
    if (!myBets?.length) return { total: 0, won: 0, lost: 0, pending: 0, totalEarned: 0 };
    let won = 0, lost = 0, pending = 0, totalEarned = 0;
    for (const b of myBets) {
      if (!b.market || b.market.status === "open") { pending++; continue; }
      const payout = Number(b.payout) || 0;
      if (payout > 0) { won++; totalEarned += payout; }
      else if (b.market.outcome) { lost++; totalEarned += 10; }
      else pending++;
    }
    return { total: myBets.length, won, lost, pending, totalEarned };
  }, [myBets]);

  // ── User events for stats ──
  const { data: events } = useQuery({
    queryKey: ["dashboard-events", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ktrenz_user_events" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      return (data || []) as any[];
    },
    staleTime: 30_000,
  });

  const stats = useMemo(() => {
    if (!events?.length) return {
      uniqueArtists: 0, externalClicks: 0, detailViews: 0, agentChats: 0,
      topArtists: [] as { name: string; count: number; score: number; normalizedScore: number; breakdown: { type: string; count: number }[] }[],
    };
    const artistData = new Map<string, { count: number; score: number; types: Map<string, number> }>();
    let externalClicks = 0, detailViews = 0, agentChats = 0;
    for (const e of events) {
      const name = (e.event_data as any)?.artist_name;
      const weight = EVENT_WEIGHTS[e.event_type] ?? 0.5;
      if (name) {
        const d = artistData.get(name) || { count: 0, score: 0, types: new Map() };
        d.count++; d.score += weight;
        d.types.set(e.event_type, (d.types.get(e.event_type) || 0) + 1);
        artistData.set(name, d);
      }
      if (e.event_type === "external_link_click" || e.event_type === "t2_external_link_click") externalClicks++;
      if (["artist_detail_view", "artist_detail_section", "t2_artist_view", "t2_keyword_detail_view"].includes(e.event_type)) detailViews++;
      if (e.event_type === "agent_chat") agentChats++;
    }
    const topArtists = Array.from(artistData.entries())
      .map(([name, d]) => ({
        name, count: d.count, score: d.score,
        breakdown: Array.from(d.types.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.score - a.score).slice(0, 5);
    const ABSOLUTE_MAX_SCORE = 900;
    return {
      uniqueArtists: artistData.size, externalClicks, detailViews, agentChats,
      topArtists: topArtists.map(a => ({ ...a, normalizedScore: Math.round(Math.min(100, (a.score / ABSOLUTE_MAX_SCORE) * 100)) })),
    };
  }, [events]);

  const topArtistName = stats.topArtists[0]?.name || null;
  const { data: topArtistEntry } = useQuery({
    queryKey: ["dashboard-top-entry", topArtistName],
    enabled: !!topArtistName,
    queryFn: async () => {
      const { data: entry } = await supabase
        .from("wiki_entries")
        .select("id, title, slug, image_url")
        .ilike("title", topArtistName!)
        .limit(1).maybeSingle();
      return entry;
    },
    staleTime: 60_000,
  });

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title="My Activity – KTrenZ" description="Your trend activity and contribution" path="/dashboard" />
      
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center h-14 px-4 max-w-screen-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 mr-2">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-bold text-foreground">{t("dash.title")}</h1>
        </div>
      </header>

      {!user ? (
        <div className="flex-1 flex items-center justify-center min-h-[calc(100dvh-3.5rem-6rem)] px-4">
          <Card className="p-8 text-center border-border bg-card max-w-xs w-full">
            <Crosshair className="w-10 h-10 mx-auto text-primary/40 mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">{t("dash.signInPrompt")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("dash.signInDesc")}</p>
            <button onClick={() => navigate("/login")} className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold w-full">
              {t("dash.signIn")}
            </button>
          </Card>
        </div>
      ) : (
      <main className="pt-14 pb-24 px-4 max-w-2xl mx-auto">

        {/* ── 1. Prediction Summary Stats ── */}
        <section className="mt-4 mb-5">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />
            {language === "ko" ? "내 트렌드 예측" : "My Predictions"}
          </h2>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-foreground">{betStats.total}</p>
              <p className="text-[9px] text-muted-foreground">{language === "ko" ? "전체" : "Total"}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-emerald-500">{betStats.won}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.won")}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-muted-foreground">{betStats.lost}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.lost")}</p>
            </Card>
            <Card className="p-2.5 bg-card border-border text-center">
              <p className="text-lg font-black text-primary">{betStats.pending}</p>
              <p className="text-[9px] text-muted-foreground">{t("dash.pending")}</p>
            </Card>
          </div>

          {/* Total earned */}
          {betStats.totalEarned > 0 && (
            <Card className="p-3 bg-primary/5 border-primary/20 mb-4 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {language === "ko" ? "총 획득 보상" : "Total Earned"}
              </span>
              <span className="text-sm font-black text-primary">{betStats.totalEarned.toLocaleString()}T</span>
            </Card>
          )}

          {/* Prediction list */}
          {betsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !myBets?.length ? (
            <Card className="p-6 text-center border-border bg-card">
              <Crosshair className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {language === "ko" ? "아직 참여한 예측이 없습니다. 트렌드 맵에서 예측에 참여해보세요!" : "No predictions yet. Join a prediction from the Trend Map!"}
              </p>
              <button
                onClick={() => navigate("/")}
                className="mt-3 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold"
              >
                {language === "ko" ? "트렌드 맵 보기" : "Go to Trend Map"}
              </button>
            </Card>
          ) : (
            <div className="space-y-2">
              {myBets.map((bet) => {
                const displayKw = language === "ko" && bet.keyword_ko ? bet.keyword_ko : bet.keyword;
                const isPending = !bet.market || bet.market.status === "open";
                const isSettled = bet.market?.status === "settled";
                const payout = Number(bet.payout) || 0;
                const isWin = isSettled && payout > 0;
                const isLoss = isSettled && bet.market?.outcome && payout === 0;
                const oc = OUTCOME_CONFIG[bet.outcome] || { emoji: "❓", label: bet.outcome, labelKo: bet.outcome, threshold: "—", reward: "—" };
                const timeLeft = getTimeRemaining(bet.market?.expires_at);

                return (
                  <button
                    key={bet.id}
                    onClick={() => bet.trigger_id && navigate(`/t2/${bet.trigger_id}`)}
                    className={cn(
                      "w-full rounded-xl border p-3 flex items-center gap-3 text-left transition-all group",
                      isWin ? "border-emerald-500/30 bg-emerald-500/5" :
                      isLoss ? "border-border bg-card" :
                      "border-border bg-card hover:bg-muted/30"
                    )}
                  >
                    {/* Outcome icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-xl",
                      isWin ? "bg-emerald-500/10" : isLoss ? "bg-muted" : "bg-primary/5"
                    )}>
                      {isWin ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                       isLoss ? <XCircle className="w-5 h-5 text-muted-foreground" /> :
                       <span>{oc.emoji}</span>}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{displayKw}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="font-medium">{oc.emoji} {language === "ko" ? oc.labelKo : oc.label}</span>
                        <span className="text-primary/70 font-bold">{oc.threshold}↑</span>
                        <span>·</span>
                        <span>{safeFormat(bet.created_at)}</span>
                      </div>
                    </div>

                    {/* Status + reward */}
                    <div className="text-right shrink-0">
                      {isPending && (
                        <>
                          <p className="text-sm font-bold text-primary">{oc.reward}</p>
                          {timeLeft ? (
                            <span className="text-[10px] text-muted-foreground">
                              {language === "ko" ? `${timeLeft} 남음` : `${timeLeft} left`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-500 font-medium">
                              {language === "ko" ? "정산 대기" : "Settling"}
                            </span>
                          )}
                        </>
                      )}
                      {isWin && (
                        <>
                          <p className="text-sm font-bold text-emerald-500">+{payout.toLocaleString()}T</p>
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

                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. My Stats ── */}
        {user && (stats.uniqueArtists > 0 || stats.detailViews > 0) && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t("dash.myStats")}
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: TrendingUp, value: stats.uniqueArtists, label: t("dash.artists") },
                { icon: Eye, value: stats.detailViews, label: t("dash.views") },
                { icon: ExternalLink, value: stats.externalClicks, label: t("dash.links") },
                { icon: Bot, value: stats.agentChats, label: t("dash.agent") },
              ].map((item, i) => (
                <Card key={i} className="p-3 bg-card border-border text-center">
                  <item.icon className="w-4 h-4 mx-auto text-primary mb-1" />
                  <p className="text-lg font-black text-foreground">{item.value}</p>
                  <p className="text-[9px] text-muted-foreground">{item.label}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Top Artist ── */}
        {topArtistEntry && stats.topArtists[0] && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-primary fill-primary/30" />
              {t("dash.topArtist")}
            </h2>
            <Card className="overflow-hidden border-border bg-card">
              <div className="p-4 flex items-center gap-3 border-b border-border/50 bg-gradient-to-r from-primary/8 to-transparent">
                <Avatar className="w-11 h-11 border-2 border-primary/20">
                  <AvatarImage src={topArtistEntry.image_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">{topArtistEntry.title?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-foreground truncate">{topArtistEntry.title}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.topArtists[0].count} {t("dash.interactions")}</p>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-2xl font-black bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      {stats.topArtists[0].normalizedScore}
                    </p>
                    <p className="text-[9px] text-muted-foreground">{t("dash.engagementScore")} /100</p>
                  </div>
                  <div className="h-6 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-lg font-black text-foreground">{stats.topArtists[0].count}</p>
                    <p className="text-[9px] text-muted-foreground">{t("dash.totalEvents")}</p>
                  </div>
                </div>
                {stats.topArtists[0].breakdown.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {stats.topArtists[0].breakdown.map((b) => {
                      const labels: Record<string, string> = {
                        external_link_click: t("dash.evLinks"), artist_detail_view: t("dash.evViews"),
                        artist_detail_section: t("dash.evSections"), agent_chat: t("dash.evAgent"),
                        treemap_click: t("dash.evTreemap"), list_click: t("dash.evList"),
                      };
                      return <span key={b.type} className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">{labels[b.type] || b.type} <span className="opacity-60">{b.count}</span></span>;
                    })}
                  </div>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* ── 4. Most Explored Artists ── */}
        {stats.topArtists.length > 1 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-400" />
              {t("dash.mostExplored")}
            </h2>
            <Card className="p-4 bg-card border-border">
              {stats.topArtists.map((a, i) => (
                <div key={a.name} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                  <span className={cn("w-5 text-center font-black text-xs",
                    i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"
                  )}>{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-foreground truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.count}</span>
                </div>
              ))}
            </Card>
          </section>
        )}
      </main>
      )}

      <V3TabBar activeTab="activity" onTabChange={() => {}} />
    </div>
  );
};

export default UserDashboard;
