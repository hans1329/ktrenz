import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { ChevronRight, LogIn, Heart, Crosshair, Trophy, Clock, Ticket, Gift } from "lucide-react";
import heroBg from "@/assets/t2-hero-bg.jpg";

const outcomeConfig: Record<string, { emoji: string; label: Record<string, string>; color: string }> = {
  mild: { emoji: "🌱", label: { en: "Mild", ko: "소폭" }, color: "text-emerald-400" },
  strong: { emoji: "🔥", label: { en: "Strong", ko: "강세" }, color: "text-amber-400" },
  explosive: { emoji: "🚀", label: { en: "Explosive", ko: "폭발" }, color: "text-rose-400" },
};

interface T2HeroSectionProps {
  myKeywords: any[];
  onOpenOnboarding?: () => void;
}

const T2HeroSection = ({ myKeywords, onOpenOnboarding }: T2HeroSectionProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  // Check watched artists
  const { data: hasWatchedArtists, isLoading: isWatchedLoading } = useQuery({
    queryKey: ["hero-has-watched", user?.id],
    queryFn: async () => {
      const [{ count: watchedCount }, { count: slotCount }] = await Promise.all([
        supabase
          .from("ktrenz_watched_artists" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id),
        supabase
          .from("ktrenz_agent_slots")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .not("wiki_entry_id", "is", null),
      ]);
      return ((watchedCount ?? 0) + (slotCount ?? 0)) > 0;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  // Fetch prediction stats
  const { data: betStats } = useQuery({
    queryKey: ["hero-bet-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: allBets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id, outcome, payout, market_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!allBets?.length) return { total: 0, won: 0, pending: 0, earned: 0, recent: [] };

      const marketIds = [...new Set((allBets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("id, status, outcome, trigger_id, expires_at")
        .in("id", marketIds);

      const marketMap = new Map((markets as any[] || []).map((m: any) => [m.id, m]));

      let won = 0, pending = 0, earned = 0;
      const enriched: any[] = [];

      for (const bet of allBets as any[]) {
        const market = marketMap.get(bet.market_id);
        const isWon = market?.status === "settled" && market?.outcome === bet.outcome;
        const isPending = market?.status === "open" || market?.status === "tracking";
        if (isWon) { won++; earned += (bet.payout ?? 0); }
        if (isPending) pending++;
        if (enriched.length < 3) {
          enriched.push({ ...bet, market_status: market?.status, market_outcome: market?.outcome, expires_at: market?.expires_at, trigger_id: market?.trigger_id });
        }
      }

      // Fetch trigger keywords for recent bets
      const triggerIds = [...new Set(enriched.map(b => b.trigger_id).filter(Boolean))];
      let triggerMap = new Map();
      if (triggerIds.length) {
        const { data: triggers } = await supabase
          .from("ktrenz_trend_triggers" as any)
          .select("id, keyword, keyword_ko")
          .in("id", triggerIds);
        triggerMap = new Map((triggers as any[] || []).map((t: any) => [t.id, t]));
      }

      const recent = enriched.map(b => ({
        ...b,
        keyword: triggerMap.get(b.trigger_id)?.keyword || "—",
        keyword_ko: triggerMap.get(b.trigger_id)?.keyword_ko || null,
      }));

      return { total: (allBets as any[]).length, won, pending, earned, recent };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Fetch daily ticket usage
  const { data: ticketInfo } = useQuery({
    queryKey: ["hero-tickets", user?.id],
    queryFn: async () => {
      if (!user?.id) return { used: 0, max: 3 };
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", `${today}T00:00:00Z`);
      return { used: count ?? 0, max: 3 };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Fetch user points
  const { data: userPoints } = useQuery({
    queryKey: ["hero-user-points", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data } = await supabase
        .from("profiles")
        .select("available_points")
        .eq("id", user.id)
        .single();
      return (data as any)?.available_points ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Not logged in
  // Auto-sliding banner for logged-out users
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTimer = useRef<ReturnType<typeof setInterval>>();
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    if (user) return;
    bannerTimer.current = setInterval(() => {
      setBannerIndex((prev) => (prev === 0 ? 1 : 0));
    }, 4000);
    return () => clearInterval(bannerTimer.current);
  }, [user]);

  if (!user) {
    const banners = [
      // Banner 0: Spotify reward — same height as discover
      <button
        key="spotify"
        onClick={() => (window.location.href = "/login")}
        className="w-full min-w-full shrink-0 rounded-2xl flex items-center gap-5 p-6"
        style={{ background: "linear-gradient(135deg, hsl(141 65% 36%) 0%, hsl(160 50% 34%) 40%, hsl(220 40% 40%) 75%, hsl(280 45% 42%) 100%)", minHeight: "220px" }}
      >
        <svg viewBox="0 0 24 24" className="w-16 h-16 shrink-0" fill="white">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        <div className="flex-1 text-left">
          <p className="text-lg font-bold text-white leading-tight whitespace-pre-line">
            {t("t2.hero.spotifyBannerTitle")}
          </p>
          <p className="text-sm text-white/70 mt-1.5">
            {t("t2.hero.spotifyBannerDesc")}
          </p>
        </div>
      </button>,

      // Banner 1: Discover hero — original layout
      <div key="discover" className="w-full min-w-full shrink-0 relative rounded-2xl overflow-hidden" style={{ minHeight: "220px" }}>
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" width={960} height={512} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "220px" }}>
          <h2 className="text-xl font-black text-white leading-tight mb-2 whitespace-pre-line">
            {t("t2.hero.discoverTitle")}
          </h2>
          <p className="text-sm text-white/70 mb-4">
            {t("t2.hero.discoverDesc")}
          </p>
          <button
            onClick={() => (window.location.href = "/login")}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-primary-foreground text-sm font-bold transition-all self-start bg-[#a428bd]/[0.22] border border-white/20"
          >
            <LogIn className="w-4 h-4" />
            {t("t2.hero.getStarted")}
          </button>
        </div>
      </div>,
    ];

    return (
      <div className="px-4 pt-2 pb-5">
        <div
          className="overflow-hidden rounded-2xl"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; touchDeltaX.current = 0; }}
          onTouchMove={(e) => { touchDeltaX.current = e.touches[0].clientX - touchStartX.current; }}
          onTouchEnd={() => {
            if (Math.abs(touchDeltaX.current) > 40) {
              const next = touchDeltaX.current < 0 ? 1 : 0;
              setBannerIndex(next);
              clearInterval(bannerTimer.current);
              bannerTimer.current = setInterval(() => setBannerIndex((p) => (p === 0 ? 1 : 0)), 4000);
            }
          }}
        >
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${bannerIndex * 100}%)` }}
          >
            {banners}
          </div>
        </div>
        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 mt-2">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => setBannerIndex(i)}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all",
                bannerIndex === i ? "w-4 bg-primary" : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>
      </div>
    );
  }

  // Logged in but no watched artists and no bets
  if (!myKeywords.length && !isWatchedLoading && !hasWatchedArtists && !betStats?.total) {
    return (
      <div className="px-4 pt-2 pb-5">
        <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: "200px" }}>
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={960} height={512} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "200px" }}>
            <h2 className="text-xl font-black text-white leading-tight mb-2 whitespace-pre-line">
              {t("t2.hero.followArtistsTitle")}
            </h2>
            <button
              onClick={() => onOpenOnboarding ? onOpenOnboarding() : navigate("/t2/my")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-bold hover:bg-white/25 transition-all self-start"
            >
              <Heart className="w-4 h-4" />
              {t("t2.hero.followArtists")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = betStats || { total: 0, won: 0, pending: 0, earned: 0, recent: [] };
  const tickets = ticketInfo || { used: 0, max: 3 };
  const lang = language === "ko" ? "ko" : "en";

  const points = userPoints ?? 0;
  const goal = 9000;
  const pct = Math.min((points / goal) * 100, 100);

  return (
    <div className="px-4 pt-2 pb-1">
      {/* Liquid Glass container with hero bg — tappable */}
      <div className="rounded-2xl overflow-hidden mb-2 cursor-pointer active:scale-[0.98] transition-transform bg-card border border-border" onClick={() => navigate("/dashboard")}>
        <div className="p-3 space-y-2.5">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: lang === "ko" ? "참여" : "Joined", value: stats.total, icon: Crosshair, isIcon: false },
              { label: lang === "ko" ? "당첨" : "Won", value: stats.won, icon: Trophy, isIcon: false },
              { label: lang === "ko" ? "진행중" : "Active", value: stats.pending, icon: Clock, isIcon: false },
              { label: "Tickets", value: `${tickets.max - tickets.used}`, icon: Ticket, isIcon: true },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl py-2 text-center bg-muted border border-border">
                <p className="text-base font-black text-foreground leading-none">{stat.value}</p>
                {stat.isIcon ? (
                  <stat.icon className="w-3 h-3 text-muted-foreground mx-auto mt-0.5" />
                ) : (
                  <p className="text-[9px] text-muted-foreground font-medium mt-0.5">{stat.label}</p>
                )}
              </div>
            ))}
          </div>

          {/* Points + Reward goal */}
          <div className="px-0.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">💎</span>
                <span className="text-xs font-bold text-foreground">{points.toLocaleString()}</span>
                {stats.earned > 0 && (
                  <span className="text-[10px] text-primary font-semibold">(+{stats.earned.toLocaleString()})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Gift className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-muted-foreground">Spotify Premium</span>
                <span className="text-[10px] font-bold text-foreground">{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden relative bg-muted">
              <div
                 className="absolute inset-0 rounded-full"
                 style={{ background: "linear-gradient(90deg, hsl(280 45% 58%), hsl(220 50% 55%), hsl(180 40% 50%), hsl(150 45% 50%), hsl(45 55% 55%), hsl(20 50% 55%))", clipPath: `inset(0 ${100 - pct}% 0 0)`, transition: "clip-path 0.5s ease" }}
              />
            </div>
          </div>
        </div>
      </div>


      {/* Empty state */}
      {stats.total === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Crosshair className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {lang === "ko" ? "아직 예측에 참여하지 않았어요" : "No predictions yet"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {lang === "ko" ? "트렌드를 예측하고 보상을 받으세요!" : "Predict trends and earn rewards!"}
          </p>
        </div>
      )}
    </div>
  );
};

export default T2HeroSection;
