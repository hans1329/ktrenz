import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";

import V3TabBar from "@/components/v3/V3TabBar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, ExternalLink, Eye, Bot, MousePointerClick,
  Crown, Heart, Flame, Trophy, Clock, ChevronRight, Zap, BarChart3,
  ChevronLeft, Target, CheckCircle2, XCircle, Timer, Crosshair, Bell
} from "lucide-react";
import { CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const EVENT_WEIGHTS: Record<string, number> = {
  external_link_click: 3, t2_external_link_click: 3, agent_chat: 2,
  artist_detail_view: 1, t2_artist_view: 1, t2_keyword_detail_view: 1,
  t2_treemap_click: 1, t2_list_click: 1, t2_artist_click: 1,
  t2_detail_open: 0.5, t2_share: 2, artist_detail_section: 0.5,
  treemap_click: 1, list_click: 0.5,
};

const OUTCOME_CONFIG: Record<string, { emoji: string; label: string; labelKo: string; color: string }> = {
  mild: { emoji: "🌱", label: "Mild", labelKo: "소폭", color: "amber" },
  strong: { emoji: "🔥", label: "Strong", labelKo: "강세", color: "emerald" },
  explosive: { emoji: "🚀", label: "Explosive", labelKo: "폭발", color: "purple" },
};

const UserDashboard = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Tracked Keywords (from ktrenz_keyword_follows) ──
  const { data: trackedKeywords, isLoading: trackedLoading } = useQuery({
    queryKey: ["dashboard-tracked-keywords", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: follows } = await supabase
        .from("ktrenz_keyword_follows" as any)
        .select("id, trigger_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!follows?.length) return [];

      const triggerIds = (follows as any[]).map((f: any) => f.trigger_id);
      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_category, artist_name, influence_index, detected_at, source_image_url, star_id, status")
        .in("id", triggerIds);

      const triggerMap = new Map<string, any>();
      (triggers ?? []).forEach((t: any) => triggerMap.set(t.id, t));

      // Get star display names
      const starIds = [...new Set((triggers ?? []).map((t: any) => t.star_id).filter(Boolean))];
      const starMap = new Map<string, any>();
      if (starIds.length) {
        const { data: stars } = await supabase
          .from("ktrenz_stars" as any)
          .select("id, display_name, name_ko")
          .in("id", starIds);
        (stars ?? []).forEach((s: any) => starMap.set(s.id, s));
      }

      // Get recent notifications for these triggers
      const { data: notifs } = await supabase
        .from("ktrenz_keyword_notifications" as any)
        .select("trigger_id, change_type, old_value, new_value, created_at")
        .eq("user_id", user.id)
        .in("trigger_id", triggerIds)
        .order("created_at", { ascending: false })
        .limit(50);

      const notifMap = new Map<string, any[]>();
      (notifs ?? []).forEach((n: any) => {
        const arr = notifMap.get(n.trigger_id) || [];
        arr.push(n);
        notifMap.set(n.trigger_id, arr);
      });

      return (follows as any[]).map((f: any) => {
        const trigger = triggerMap.get(f.trigger_id);
        const star = trigger ? starMap.get(trigger.star_id) : null;
        return {
          followId: f.id,
          triggerId: f.trigger_id,
          followedAt: f.created_at,
          keyword: trigger?.keyword || "Unknown",
          keywordKo: trigger?.keyword_ko,
          category: trigger?.keyword_category || "brand",
          artistName: star?.display_name || trigger?.artist_name || "",
          artistNameKo: star?.name_ko,
          influenceIndex: Number(trigger?.influence_index) || 0,
          status: trigger?.status || "expired",
          sourceImageUrl: trigger?.source_image_url,
          detectedAt: trigger?.detected_at,
          notifications: notifMap.get(f.trigger_id) || [],
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

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

  // ── Stats ──
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

  // ── Top artist image ──
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

  // ── My Trend Predictions (Bets) ──
  const { data: myBets } = useQuery({
    queryKey: ["dashboard-my-bets", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, market_id, outcome, amount, shares, payout, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }).limit(20);
      if (!bets?.length) return [];
      const marketIds = [...new Set((bets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, status, outcome, pool_mild, pool_strong, pool_explosive, total_volume, expires_at")
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
        const starIds = [...new Set((triggers ?? []).map((t: any) => t.star_id).filter(Boolean))];
        if (starIds.length) {
          const { data: stars } = await supabase
            .from("ktrenz_stars" as any).select("id, display_name, name_ko").in("id", starIds);
          const starMap = new Map<string, any>();
          (stars ?? []).forEach((s: any) => starMap.set(s.id, s));
          (triggers ?? []).forEach((t: any) => {
            const star = starMap.get(t.star_id);
            if (star) { t.artistName = star.display_name; t.artistNameKo = star.name_ko; }
          });
        }
      }
      return (bets as any[]).map((b: any) => {
        const market = marketMap.get(b.market_id);
        return { ...b, market, trigger: market ? triggerMap.get(market.trigger_id) : null };
      });
    },
    staleTime: 30_000,
  });

  const betStats = useMemo(() => {
    if (!myBets?.length) return { total: 0, won: 0, lost: 0, pending: 0 };
    let won = 0, lost = 0, pending = 0;
    for (const b of myBets) {
      if (!b.market || b.market.status === "open") { pending++; continue; }
      if (b.market.outcome === b.outcome) won++; else if (b.market.outcome) lost++; else pending++;
    }
    return { total: myBets.length, won, lost, pending };
  }, [myBets]);

  const handleUntrack = async (followId: string) => {
    await supabase.from("ktrenz_keyword_follows" as any).delete().eq("id", followId);
    queryClient.invalidateQueries({ queryKey: ["dashboard-tracked-keywords"] });
  };

  const getKw = (kw: any) => language === "ko" && kw.keywordKo ? kw.keywordKo : kw.keyword;
  const getArtist = (kw: any) => language === "ko" && kw.artistNameKo ? kw.artistNameKo : kw.artistName;

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

      <main className="pt-14 pb-24 px-4 max-w-2xl mx-auto">

        {/* ── 1. Tracked Keywords ── */}
        <section className="mt-4 mb-6">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />
            {t("dash.trackedKeywords")}
          </h2>

          {!user ? (
            <Card className="p-6 text-center border-border bg-card">
              <p className="text-sm text-muted-foreground mb-3">{t("dash.signInPrompt")}</p>
              <button onClick={() => navigate("/login")} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {t("dash.signIn")}
              </button>
            </Card>
          ) : trackedLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : !trackedKeywords?.length ? (
            <Card className="p-6 text-center border-border bg-card">
              <Crosshair className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t("dash.noTrackedKeywords")}</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {trackedKeywords.map((kw) => {
                const config = CATEGORY_CONFIG[kw.category];
                const isActive = kw.status === "active";
                const latestNotif = kw.notifications[0];
                const delta = latestNotif ? (Number(latestNotif.new_value) - Number(latestNotif.old_value)) : null;
                const deltaPct = latestNotif && Number(latestNotif.old_value) > 0
                  ? ((Number(latestNotif.new_value) - Number(latestNotif.old_value)) / Number(latestNotif.old_value) * 100)
                  : null;

                return (
                  <div key={kw.followId} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => navigate(`/t2/${kw.triggerId}`)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      {/* Thumbnail */}
                      {kw.sourceImageUrl ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-muted">
                          <img src={kw.sourceImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center" style={{ background: config?.color || "hsl(var(--muted))" }}>
                          <Zap className="w-5 h-5 text-white/80" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {/* Keyword + status */}
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-foreground truncate">{getKw(kw)}</span>
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-sm shrink-0",
                            isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                          )}>
                            {isActive ? "LIVE" : "ENDED"}
                          </span>
                        </div>

                        {/* Artist + category */}
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
                          {kw.artistName && <span className="truncate">{getArtist(kw)}</span>}
                          {config && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded text-white shrink-0" style={{ background: config.color }}>
                              {config.label}
                            </span>
                          )}
                        </div>

                        {/* Influence + change */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-muted-foreground">
                            🔥 {kw.influenceIndex.toFixed(0)}
                          </span>
                          {deltaPct != null && (
                            <span className={cn(
                              "flex items-center gap-0.5 font-bold",
                              delta! > 0 ? "text-green-400" : "text-red-400"
                            )}>
                              {delta! > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {delta! > 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                            </span>
                          )}
                          {latestNotif && (
                            <span className="text-muted-foreground/60 flex items-center gap-0.5 ml-auto">
                              <Clock className="w-2.5 h-2.5" /> {formatAge(latestNotif.created_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    </button>

                    {/* Notification alerts */}
                    {kw.notifications.length > 0 && (
                      <div className="border-t border-border/50 px-3 py-2 bg-muted/20">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                          <Bell className="w-3 h-3" />
                          <span className="font-medium">Recent changes</span>
                        </div>
                        <div className="space-y-1">
                          {kw.notifications.slice(0, 2).map((n: any, i: number) => {
                            const nDelta = Number(n.new_value) - Number(n.old_value);
                            return (
                              <div key={i} className="text-[10px] flex items-center gap-1.5">
                                <span className={cn("font-bold", nDelta > 0 ? "text-green-400" : "text-red-400")}>
                                  {nDelta > 0 ? "▲" : "▼"} {Math.abs(nDelta).toFixed(1)}
                                </span>
                                <span className="text-muted-foreground">
                                  {Number(n.old_value).toFixed(0)} → {Number(n.new_value).toFixed(0)}
                                </span>
                                <span className="text-muted-foreground/50 ml-auto">{formatAge(n.created_at)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. My Predictions ── */}
        {user && myBets && myBets.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              {t("dash.predictions")}
            </h2>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-foreground">{betStats.won}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.won")}</p>
              </Card>
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-foreground">{betStats.lost}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.lost")}</p>
              </Card>
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-foreground">{betStats.pending}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.pending")}</p>
              </Card>
            </div>

            <div className="space-y-2">
              {(() => {
                const grouped = new Map<string, { bets: any[]; trigger: any; market: any }>();
                for (const bet of myBets) {
                  const triggerId = bet.market?.trigger_id || bet.id;
                  const existing = grouped.get(triggerId);
                  if (existing) existing.bets.push(bet);
                  else grouped.set(triggerId, { bets: [bet], trigger: bet.trigger, market: bet.market });
                }
                return Array.from(grouped.values()).slice(0, 6).map((group) => {
                  const { bets: groupBets, market, trigger } = group;
                  const isSettled = market?.status === "settled";
                  const kw = trigger ? (language === "ko" && trigger.keyword_ko ? trigger.keyword_ko : trigger.keyword) : "Unknown";
                  const an = trigger ? (language === "ko" && trigger.artistNameKo ? trigger.artistNameKo : (trigger.artistName || "")) : "";
                  const cfg = trigger ? CATEGORY_CONFIG[trigger.keyword_category] : null;
                  const hasWon = isSettled && groupBets.some((b: any) => market?.outcome === b.outcome);
                  const hasLost = isSettled && market?.outcome && !hasWon;
                  const totalPayout = groupBets.reduce((s: number, b: any) => s + (Number(b.payout) || 0), 0);
                  const totalAmount = groupBets.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
                  const expiresAt = market?.expires_at ? new Date(market.expires_at).getTime() : null;
                  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)) : null;
                  const outcomeBreakdown = ["mild", "strong", "explosive"]
                    .map(o => ({ outcome: o, amount: groupBets.filter((b: any) => b.outcome === o).reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0) }))
                    .filter(o => o.amount > 0);

                  return (
                    <button key={market?.trigger_id || groupBets[0].id}
                      onClick={() => trigger && navigate(`/t2/${market?.trigger_id}`)}
                      className={cn("w-full rounded-xl border p-3 flex items-center gap-3 text-left transition-all",
                        hasWon ? "border-green-500/30 bg-green-500/5" : hasLost ? "border-red-500/30 bg-red-500/5" : "border-border bg-card hover:bg-muted/50"
                      )}>
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        hasWon ? "bg-green-500/15" : hasLost ? "bg-red-500/15" : "bg-muted"
                      )}>
                        {hasWon ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                         hasLost ? <XCircle className="w-4 h-4 text-red-400" /> :
                         <Timer className="w-4 h-4 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-foreground truncate">{kw}</span>
                          {cfg && <span className="text-[8px] font-bold px-1 py-0.5 rounded text-white shrink-0" style={{ background: cfg.color }}>{cfg.label}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          {an && <span>{an}</span>}
                          {outcomeBreakdown.map(({ outcome, amount }) => {
                            const oc = OUTCOME_CONFIG[outcome];
                            return <span key={outcome} className={cn("font-bold", `text-${oc?.color}-400`)}>{oc?.emoji} {language === "ko" ? oc?.labelKo : oc?.label} {amount.toLocaleString()}T</span>;
                          })}
                          {daysLeft !== null && !isSettled && <span>⏳ {daysLeft}{language === "ko" ? "일" : "d"}</span>}
                        </div>
                      </div>
                      {hasWon && totalPayout > 0 && <span className="text-xs font-black text-green-400 shrink-0">+{totalPayout.toLocaleString()}</span>}
                      {!isSettled && <span className="text-[10px] text-muted-foreground shrink-0">{totalAmount.toLocaleString()} <span className="opacity-60">T</span></span>}
                    </button>
                  );
                });
              })()}
            </div>
          </section>
        )}

        {/* ── 3. My Stats ── */}
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

        {/* ── 4. Top Artist ── */}
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

        {/* ── 5. Most Explored Artists ── */}
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

      <V3TabBar activeTab="activity" onTabChange={() => {}} />
    </div>
  );
};

export default UserDashboard;
