import { useMemo } from "react";
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
  if (!user) {
    return (
      <div className="px-4 pt-2 pb-5">
        <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: "220px" }}>
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" width={960} height={512} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "220px" }}>
            <h2 className="text-2xl font-black text-white leading-tight mb-2 whitespace-pre-line">
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
      {/* Header — tappable */}
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2 mb-2 group"
      >
        <Crosshair className="w-4 h-4 text-primary" />
        <h2 className="text-base font-black text-foreground">
          {lang === "ko" ? "나의 예측" : "My Predictions"}
        </h2>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </button>

      {/* Liquid Glass container with hero bg */}
      <div className="relative rounded-2xl overflow-hidden mb-2">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative z-10 p-3 space-y-2.5"
          style={{
            background: "linear-gradient(135deg, hsla(0,0%,100%,0.06), hsla(0,0%,100%,0.02))",
            backdropFilter: "blur(12px) saturate(1.3)",
            WebkitBackdropFilter: "blur(12px) saturate(1.3)",
          }}
        >
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: lang === "ko" ? "참여" : "Joined", value: stats.total, icon: Crosshair },
              { label: lang === "ko" ? "당첨" : "Won", value: stats.won, icon: Trophy },
              { label: lang === "ko" ? "진행중" : "Active", value: stats.pending, icon: Clock },
              { label: lang === "ko" ? "티켓" : "Tickets", value: `${tickets.max - tickets.used}`, icon: Ticket },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl py-2 text-center"
                style={{
                  background: "hsla(0,0%,100%,0.08)",
                  border: "1px solid hsla(0,0%,100%,0.12)",
                  boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.08)",
                }}
              >
                <p className="text-base font-black text-white leading-none">{stat.value}</p>
                <p className="text-[9px] text-white/60 font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Points + Reward goal */}
          <div className="px-0.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">💎</span>
                <span className="text-xs font-bold text-white">{points.toLocaleString()}T</span>
                {stats.earned > 0 && (
                  <span className="text-[10px] text-primary font-semibold">(+{stats.earned.toLocaleString()})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Gift className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-white/60">Spotify Premium</span>
                <span className="text-[10px] font-bold text-white">{Math.round(pct)}%</span>
              </div>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden relative"
              style={{ background: "hsla(0,0%,100%,0.1)" }}
            >
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
            {lang === "ko" ? "트렌드 키워드를 탭하여 예측에 참여하세요" : "Tap a trend keyword to make your first prediction"}
          </p>
        </div>
      )}
    </div>
  );
};

export default T2HeroSection;
