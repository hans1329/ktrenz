import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";

import V3TabBar from "@/components/v3/V3TabBar";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  TrendingUp, ExternalLink, Eye, Bot, MousePointerClick,
  Crown, Heart, Flame, Trophy, Clock, ChevronRight, Zap, BarChart3,
  ChevronLeft, Target, CheckCircle2, XCircle, Timer
} from "lucide-react";
import BoxParticles from "@/components/v3/BoxParticles";
import { CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";

// ── Platform colors ──
const PLATFORM_COLORS: Record<string, string> = {
  YouTube: "bg-red-500/15 text-red-400",
  X: "bg-foreground/10 text-foreground",
  Reddit: "bg-orange-500/15 text-orange-400",
  TikTok: "bg-pink-500/15 text-pink-400",
  Instagram: "bg-fuchsia-500/15 text-fuchsia-400",
  Spotify: "bg-green-500/15 text-green-400",
  Melon: "bg-emerald-500/15 text-emerald-400",
  Naver: "bg-lime-500/15 text-lime-400",
  other: "bg-muted text-muted-foreground",
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const UserDashboard = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  // ── Fetch user's watched artists ──
  const { data: watchedSlots } = useQuery({
    queryKey: ["dashboard-watched-slots", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: slots } = await supabase
        .from("ktrenz_agent_slots")
        .select("wiki_entry_id")
        .eq("user_id", user.id)
        .not("wiki_entry_id", "is", null);
      return (slots ?? []).map((s: any) => s.wiki_entry_id).filter(Boolean) as string[];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  // Get star info for watched artists
  const { data: watchedStars } = useQuery({
    queryKey: ["dashboard-watched-stars", watchedSlots],
    queryFn: async () => {
      if (!watchedSlots?.length) return [];
      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id, display_name, name_ko, group_star_id")
        .in("wiki_entry_id", watchedSlots)
        .eq("is_active", true);
      
      // Also get members of followed groups
      const starIds = (stars ?? []).map((s: any) => s.id);
      let memberWikiIds: string[] = [];
      if (starIds.length) {
        const { data: members } = await supabase
          .from("ktrenz_stars" as any)
          .select("wiki_entry_id")
          .in("group_star_id", starIds)
          .not("wiki_entry_id", "is", null);
        memberWikiIds = (members ?? []).map((m: any) => m.wiki_entry_id).filter(Boolean);
      }

      // Fetch images
      const allWikiIds = [...new Set([...watchedSlots, ...memberWikiIds])];
      const { data: wikiEntries } = await supabase
        .from("wiki_entries")
        .select("id, image_url")
        .in("id", allWikiIds);
      const imageMap = new Map<string, string>();
      (wikiEntries ?? []).forEach((w: any) => { if (w.image_url) imageMap.set(w.id, w.image_url); });

      return (stars ?? []).map((s: any) => ({
        ...s,
        image_url: imageMap.get(s.wiki_entry_id) || null,
        memberWikiIds,
      }));
    },
    enabled: !!watchedSlots?.length,
    staleTime: 60_000,
  });

  const allWatchedWikiIds = useMemo(() => {
    if (!watchedSlots?.length) return new Set<string>();
    const memberIds = watchedStars?.[0]?.memberWikiIds || [];
    return new Set([...watchedSlots, ...memberIds]);
  }, [watchedSlots, watchedStars]);

  // ── My active trend keywords ──
  const { data: myTrends, isLoading: trendsLoading } = useQuery({
    queryKey: ["dashboard-my-trends", Array.from(allWatchedWikiIds)],
    queryFn: async () => {
      if (!allWatchedWikiIds.size) return [];
      
      // Get star_ids for watched wiki_entry_ids
      const { data: stars } = await supabase
        .from("ktrenz_stars" as any)
        .select("id, wiki_entry_id, display_name, name_ko")
        .in("wiki_entry_id", Array.from(allWatchedWikiIds))
        .eq("is_active", true);
      
      const starIds = (stars ?? []).map((s: any) => s.id);
      if (!starIds.length) return [];

      const starMap = new Map<string, any>();
      (stars ?? []).forEach((s: any) => starMap.set(s.id, s));

      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("*")
        .eq("status", "active")
        .neq("trigger_source", "naver_shop")
        .in("star_id", starIds)
        .order("influence_index", { ascending: false })
        .limit(30);

      // Get images
      const wikiIds = [...new Set((stars ?? []).map((s: any) => s.wiki_entry_id).filter(Boolean))];
      const { data: wikiEntries } = await supabase
        .from("wiki_entries").select("id, image_url").in("id", wikiIds);
      const imgMap = new Map<string, string>();
      (wikiEntries ?? []).forEach((w: any) => { if (w.image_url) imgMap.set(w.id, w.image_url); });

      return (triggers ?? []).map((t: any) => {
        const star = starMap.get(t.star_id);
        return {
          id: t.id,
          keyword: t.keyword,
          keywordKo: t.keyword_ko,
          category: t.keyword_category || "brand",
          artistName: star?.display_name || t.artist_name || "Unknown",
          artistNameKo: star?.name_ko || null,
          artistImageUrl: star ? imgMap.get(star.wiki_entry_id) : null,
          influenceIndex: Number(t.influence_index) || 0,
          detectedAt: t.detected_at,
          starId: t.star_id,
          wikiEntryId: star?.wiki_entry_id,
          sourceImageUrl: t.source_image_url,
        };
      });
    },
    enabled: allWatchedWikiIds.size > 0,
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
  // Event type weights for scoring
  const EVENT_WEIGHTS: Record<string, number> = {
    external_link_click: 3,
    t2_external_link_click: 3,
    agent_chat: 2,
    artist_detail_view: 1,
    t2_artist_view: 1,
    t2_keyword_detail_view: 1,
    t2_treemap_click: 1,
    t2_list_click: 1,
    t2_artist_click: 1,
    t2_detail_open: 0.5,
    t2_share: 2,
    artist_detail_section: 0.5,
    treemap_click: 1,
    list_click: 0.5,
  };

  const stats = useMemo(() => {
    if (!events?.length) return {
      uniqueArtists: 0, externalClicks: 0, detailViews: 0, agentChats: 0,
      topArtists: [] as { name: string; count: number; score: number; normalizedScore: number; breakdown: { type: string; count: number }[] }[],
    };
    
    // Per-artist: count + weighted score + type breakdown
    const artistData = new Map<string, { count: number; score: number; types: Map<string, number> }>();
    let externalClicks = 0, detailViews = 0, agentChats = 0;

    for (const e of events) {
      const name = (e.event_data as any)?.artist_name;
      const weight = EVENT_WEIGHTS[e.event_type] ?? 0.5;
      if (name) {
        const d = artistData.get(name) || { count: 0, score: 0, types: new Map() };
        d.count++;
        d.score += weight;
        d.types.set(e.event_type, (d.types.get(e.event_type) || 0) + 1);
        artistData.set(name, d);
      }
      if (e.event_type === "external_link_click" || e.event_type === "t2_external_link_click") externalClicks++;
      if (e.event_type === "artist_detail_view" || e.event_type === "artist_detail_section" || e.event_type === "t2_artist_view" || e.event_type === "t2_keyword_detail_view") detailViews++;
      if (e.event_type === "agent_chat") agentChats++;
    }

    const topArtists = Array.from(artistData.entries())
      .map(([name, d]) => ({
        name, count: d.count, score: d.score,
        breakdown: Array.from(d.types.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Normalize scores to 0-100 scale using absolute max (300 events × 3 max weight = 900)
    const ABSOLUTE_MAX_SCORE = 900;
    const normalizedArtists = topArtists.map(a => ({
      ...a,
      normalizedScore: Math.round(Math.min(100, (a.score / ABSOLUTE_MAX_SCORE) * 100)),
    }));

    return { uniqueArtists: artistData.size, externalClicks, detailViews, agentChats, topArtists: normalizedArtists };
  }, [events]);

  // ── Resolve top artist's wiki entry for image ──
  const topArtistName = stats.topArtists[0]?.name || null;
  const { data: topArtistEntry } = useQuery({
    queryKey: ["dashboard-top-entry", topArtistName],
    enabled: !!topArtistName,
    queryFn: async () => {
      const { data: entry } = await supabase
        .from("wiki_entries")
        .select("id, title, slug, image_url")
        .ilike("title", topArtistName!)
        .limit(1)
        .maybeSingle();
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
        .order("created_at", { ascending: false })
        .limit(20);
      if (!bets?.length) return [];

      // Get market info
      const marketIds = [...new Set((bets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, trigger_id, status, outcome, pool_decline, pool_mild, pool_strong, pool_explosive, total_volume, expires_at")
        .in("id", marketIds);
      const marketMap = new Map<string, any>();
      (markets ?? []).forEach((m: any) => marketMap.set(m.id, m));

      // Get trigger info for keywords
      const triggerIds = [...new Set((markets ?? []).map((m: any) => m.trigger_id).filter(Boolean))];
      let triggerMap = new Map<string, any>();
      if (triggerIds.length) {
        const { data: triggers } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko, keyword_category, star_id")
          .in("id", triggerIds);
        (triggers ?? []).forEach((t: any) => triggerMap.set(t.id, t));

        // Get star names
        const starIds = [...new Set((triggers ?? []).map((t: any) => t.star_id).filter(Boolean))];
        if (starIds.length) {
          const { data: stars } = await supabase
            .from("ktrenz_stars" as any)
            .select("id, display_name, name_ko")
            .in("id", starIds);
          const starMap = new Map<string, any>();
          (stars ?? []).forEach((s: any) => starMap.set(s.id, s));
          (triggers ?? []).forEach((t: any) => {
            const star = starMap.get(t.star_id);
            if (star) {
              t.artistName = star.display_name;
              t.artistNameKo = star.name_ko;
            }
          });
        }
      }

      return (bets as any[]).map((b: any) => {
        const market = marketMap.get(b.market_id);
        const trigger = market ? triggerMap.get(market.trigger_id) : null;
        return {
          ...b,
          market,
          trigger,
        };
      });
    },
    staleTime: 30_000,
  });

  const betStats = useMemo(() => {
    if (!myBets?.length) return { total: 0, won: 0, lost: 0, pending: 0, totalAmount: 0, totalPayout: 0 };
    let won = 0, lost = 0, pending = 0, totalAmount = 0, totalPayout = 0;
    for (const b of myBets) {
      totalAmount += Number(b.amount) || 0;
      totalPayout += Number(b.payout) || 0;
      if (!b.market || b.market.status === "open") { pending++; continue; }
      if (b.market.outcome === b.outcome) won++;
      else if (b.market.outcome) lost++;
      else pending++;
    }
    return { total: myBets.length, won, lost, pending, totalAmount, totalPayout };
  }, [myBets]);

  const getLocalizedKeyword = (t: any) => {
    if (language === "ko" && t.keywordKo) return t.keywordKo;
    return t.keyword;
  };
  const getLocalizedArtistName = (t: any) => {
    if (language === "ko" && t.artistNameKo) return t.artistNameKo;
    return t.artistName;
  };

  const isLoading = trendsLoading;

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title="My Activity – KTrenZ" description="Your trend activity and contribution" path="/dashboard" />
      
      {/* Sub-header: back + title */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center h-14 px-4 max-w-screen-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 mr-2">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-base font-bold text-foreground">{t("dash.title")}</h1>
        </div>
      </header>

      <main className="pt-14 pb-24 px-4 max-w-2xl mx-auto">

        {/* ── My Active Trends ── */}
        <section className="mt-4 mb-6">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            {t("dash.activeTrends")}
          </h2>

          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : !user ? (
            <Card className="p-6 text-center border-border bg-card">
              <p className="text-sm text-muted-foreground mb-3">{t("dash.signInPrompt")}</p>
              <button onClick={() => navigate("/login")} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {t("dash.signIn")}
              </button>
            </Card>
          ) : !myTrends?.length ? (
            <Card className="p-6 text-center border-border bg-card">
              {watchedSlots && watchedSlots.length > 0 ? (
                <p className="text-sm text-muted-foreground">{t("dash.noTrends")}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">{t("dash.noTrends")}</p>
                  <button onClick={() => navigate("/agent")} className="text-xs text-primary font-bold">
                    {t("dash.followArtists")}
                  </button>
                </>
              )}
            </Card>
          ) : (
            <div className="space-y-2">
              {myTrends.slice(0, 8).map((trend, idx) => {
                const config = CATEGORY_CONFIG[trend.category];
                const tileColor = config?.tileColor || "hsla(220, 20%, 40%, 0.85)";
                return (
                  <button
                    key={trend.id}
                    onClick={() => navigate(`/t2/${trend.id}`)}
                    className="w-full relative overflow-hidden rounded-xl border border-border flex items-center gap-3 p-3 text-left transition-all hover:brightness-110 group"
                    style={{
                      backgroundImage: trend.sourceImageUrl || trend.artistImageUrl
                        ? `linear-gradient(to right, ${tileColor}, ${tileColor.replace('0.85', '0.7')}), url("${(trend.sourceImageUrl || trend.artistImageUrl || '').replace(/"/g, '\\"')}")`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: !(trend.sourceImageUrl || trend.artistImageUrl) ? tileColor : undefined,
                    }}
                  >
                    {idx < 2 && (
                      <BoxParticles count={idx === 0 ? 12 : 6} color="hsla(45, 100%, 80%, 0.7)" speed={0.3} density={0.3} shape="star" />
                    )}
                    <div className="relative z-10 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-base font-black text-white truncate drop-shadow-md">
                          {getLocalizedKeyword(trend)}
                        </span>
                        <span className="text-xs font-bold text-white/80 bg-white/15 rounded px-1.5 py-0.5 shrink-0">
                          +{trend.influenceIndex.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-white/70">
                        <span className="font-medium">{getLocalizedArtistName(trend)}</span>
                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold text-white/90" style={{ background: config?.color ? `${config.color.replace(')', ', 0.5)').replace('hsl(', 'hsla(')}` : undefined }}>
                          {config?.label || trend.category}
                        </span>
                        <span className="flex items-center gap-0.5 ml-auto">
                          <Clock className="w-2.5 h-2.5" /> {formatAge(trend.detectedAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/50 shrink-0 relative z-10 group-hover:text-white transition-colors" />
                  </button>
                );
              })}
              {myTrends.length > 8 && (
                <button onClick={() => navigate("/?cat=my")} className="w-full text-center text-xs font-bold text-primary py-2">
                  View all {myTrends.length} trends →
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── My Predictions ── */}
        {user && myBets && myBets.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              {t("dash.predictions")}
            </h2>

            {/* Prediction stats */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-foreground">{betStats.total}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.total")}</p>
              </Card>
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-green-400">{betStats.won}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.won")}</p>
              </Card>
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-red-400">{betStats.lost}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.lost")}</p>
              </Card>
              <Card className="p-2.5 bg-card border-border text-center">
                <p className="text-lg font-black text-yellow-400">{betStats.pending}</p>
                <p className="text-[9px] text-muted-foreground">{t("dash.pending")}</p>
              </Card>
            </div>

            {/* Net result */}
            {(betStats.won > 0 || betStats.lost > 0) && (
              <Card className="p-3 mb-3 bg-card border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{t("dash.winRate")}</span>
                <span className="text-sm font-black text-foreground">
                  {betStats.total > 0 ? Math.round((betStats.won / (betStats.won + betStats.lost)) * 100) : 0}%
                </span>
              </Card>
            )}

            {/* Recent bets – grouped by keyword */}
            <div className="space-y-2">
              {(() => {
                // Group bets by trigger_id (same keyword)
                const grouped = new Map<string, { bets: any[]; trigger: any; market: any; keyword: string; artistName: string; config: any }>();
                for (const bet of myBets) {
                  const triggerId = bet.market?.trigger_id || bet.id;
                  const existing = grouped.get(triggerId);
                  const trigger = bet.trigger;
                  const kw = trigger
                    ? (language === "ko" && trigger.keyword_ko ? trigger.keyword_ko : trigger.keyword)
                    : "Unknown";
                  const an = trigger
                    ? (language === "ko" && trigger.artistNameKo ? trigger.artistNameKo : (trigger.artistName || ""))
                    : "";
                  const cfg = trigger ? CATEGORY_CONFIG[trigger.keyword_category] : null;
                  if (existing) {
                    existing.bets.push(bet);
                  } else {
                    grouped.set(triggerId, { bets: [bet], trigger, market: bet.market, keyword: kw, artistName: an, config: cfg });
                  }
                }

                return Array.from(grouped.values()).slice(0, 6).map((group) => {
                  const { bets: groupBets, market, trigger, keyword, artistName, config } = group;
                  const isSettled = market?.status === "settled";
                  const totalAmount = groupBets.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
                  const totalPayout = groupBets.reduce((s: number, b: any) => s + (Number(b.payout) || 0), 0);
                  const yesAmount = groupBets.filter((b: any) => b.side === "yes").reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
                  const noAmount = groupBets.filter((b: any) => b.side === "no").reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
                  const hasWon = isSettled && groupBets.some((b: any) => market?.outcome === b.side);
                  const hasLost = isSettled && market?.outcome && !hasWon;

                  return (
                    <button
                      key={market?.trigger_id || groupBets[0].id}
                      onClick={() => trigger && navigate(`/t2/${market?.trigger_id}`)}
                      className={cn(
                        "w-full rounded-xl border p-3 flex items-center gap-3 text-left transition-all",
                        hasWon ? "border-green-500/30 bg-green-500/5" :
                        hasLost ? "border-red-500/30 bg-red-500/5" :
                        "border-border bg-card hover:bg-muted/50"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        hasWon ? "bg-green-500/15" : hasLost ? "bg-red-500/15" : "bg-yellow-500/15"
                      )}>
                        {hasWon ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
                         hasLost ? <XCircle className="w-4 h-4 text-red-400" /> :
                         <Timer className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm font-bold text-foreground truncate">{keyword}</span>
                          {config && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded text-white shrink-0" style={{ background: config.color }}>
                              {config.label}
                            </span>
                          )}
                          {groupBets.length > 1 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                              ×{groupBets.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {artistName && <span>{artistName}</span>}
                          {yesAmount > 0 && (
                            <span className="font-bold text-green-400">▲ {yesAmount.toFixed(0)}</span>
                          )}
                          {noAmount > 0 && (
                            <span className="font-bold text-red-400">▼ {noAmount.toFixed(0)}</span>
                          )}
                          <span>{totalAmount.toFixed(0)} pts</span>
                        </div>
                      </div>
                      {hasWon && totalPayout > 0 && (
                        <span className="text-xs font-black text-green-400 shrink-0">+{totalPayout.toFixed(0)}</span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </section>
        )}

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

        {/* ── Top Artist (event-based) ── */}
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

                {/* Event type breakdown */}
                {stats.topArtists[0].breakdown.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {stats.topArtists[0].breakdown.map((b) => {
                      const labels: Record<string, string> = {
                        external_link_click: t("dash.evLinks"),
                        artist_detail_view: t("dash.evViews"),
                        artist_detail_section: t("dash.evSections"),
                        agent_chat: t("dash.evAgent"),
                        treemap_click: t("dash.evTreemap"),
                        list_click: t("dash.evList"),
                      };
                      return (
                        <span key={b.type} className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                          {labels[b.type] || b.type} <span className="opacity-60">{b.count}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* ── Top Explored Artists ── */}
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
                  )}>
                    {i + 1}
                  </span>
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
