import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { ChevronRight, LogIn, Heart, Crosshair, Trophy, Clock, Ticket } from "lucide-react";
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

  return (
    <div className="px-4 pt-2 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-black text-foreground">
            {lang === "ko" ? "나의 예측" : "My Predictions"}
          </h2>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {lang === "ko" ? "전체보기" : "View All"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: lang === "ko" ? "참여" : "Joined", value: stats.total, icon: Crosshair },
          { label: lang === "ko" ? "당첨" : "Won", value: stats.won, icon: Trophy },
          { label: lang === "ko" ? "진행중" : "Pending", value: stats.pending, icon: Clock },
          { label: lang === "ko" ? "티켓" : "Tickets", value: `${tickets.max - tickets.used}/${tickets.max}`, icon: Ticket },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <stat.icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-black text-foreground">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Earned Banner */}
      {stats.earned > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-primary">
            {lang === "ko" ? "총 획득" : "Total Earned"}
          </span>
          <span className="text-sm font-black text-primary">{stats.earned.toLocaleString()}T</span>
        </div>
      )}

      {/* Recent Predictions */}
      {stats.recent.length > 0 && (
        <div className="space-y-2">
          {stats.recent.map((bet: any) => {
            const oc = outcomeConfig[bet.outcome] || outcomeConfig.mild;
            const isPending = bet.market_status === "open" || bet.market_status === "tracking";
            const isWon = bet.market_status === "settled" && bet.market_outcome === bet.outcome;
            const isLost = bet.market_status === "settled" && bet.market_outcome !== bet.outcome;
            const keyword = lang === "ko" && bet.keyword_ko ? bet.keyword_ko : bet.keyword;

            return (
              <div key={bet.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg">{oc.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{keyword}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {oc.label[lang] || oc.label.en}
                    {isPending && (
                      <span className="ml-2 text-primary font-medium">
                        {lang === "ko" ? "진행중" : "Pending"}
                      </span>
                    )}
                    {isWon && (
                      <span className="ml-2 text-emerald-500 font-medium">
                        +{(bet.payout ?? 0).toLocaleString()}T
                      </span>
                    )}
                    {isLost && (
                      <span className="ml-2 text-muted-foreground">
                        {lang === "ko" ? "미달성" : "Missed"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
