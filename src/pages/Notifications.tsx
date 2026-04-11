import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bell, TrendingUp, TrendingDown, Minus, Zap, Loader2, LogIn, Crosshair, CheckCheck, Trophy, Sprout, Flame, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";

interface WatchedArtistScore {
  artist_name: string;
  
  image_url: string | null;
  energy_score: number;
  energy_change_24h: number;
  total_score: number;
  youtube_score: number;
  buzz_score: number;
  rank: number;
}

const Notifications = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
  }, []);

  // Fetch watched artists
  const { data: watchedArtists, isLoading: watchedLoading } = useQuery({
    queryKey: ["notifications-watched", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id, artist_name")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch scores for watched artists
  const { data: artistScores, isLoading: scoresLoading } = useQuery({
    queryKey: ["notifications-scores", watchedArtists],
    queryFn: async (): Promise<WatchedArtistScore[]> => {
      if (!watchedArtists?.length) return [];
      // wiki_entry_id removed - return empty for now as scoring relies on v3_scores
      return [];

      // Get all latest scores
      const { data: allScores } = await supabase
        .from("v3_scores_v2" as any)
        .select("wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, scored_at, wiki_entries:wiki_entry_id(id, title, image_url)")
        .order("scored_at", { ascending: false })
        .limit(200);

      if (!allScores) return [];

      // Deduplicate
      const seen = new Map<string, any>();
      for (const s of allScores as any[]) {
        if (!seen.has(s.wiki_entry_id)) seen.set(s.wiki_entry_id, s);
      }

      // Get all sorted for rank
      const sorted = Array.from(seen.values()).sort((a, b) => b.energy_score - a.energy_score);

      // Map watched artists
      return watchedArtists.map(w => {
        const score = seen.get(w.id ?? "");
        const rank = score ? sorted.indexOf(score) + 1 : 999;
        return {
          artist_name: w.artist_name,
          image_url: (score?.wiki_entries as any)?.image_url ?? null,
          energy_score: score?.energy_score ?? 0,
          energy_change_24h: score?.energy_change_24h ?? 0,
          total_score: score?.total_score ?? 0,
          youtube_score: score?.youtube_score ?? 0,
          buzz_score: score?.buzz_score ?? 0,
          rank,
        };
      }).sort((a, b) => a.rank - b.rank);
    },
    enabled: (watchedArtists?.length ?? 0) > 0,
  });

  // Fetch keyword follow notifications
  const queryClient = useQueryClient();
  const { data: keywordNotifs = [] } = useQuery({
    queryKey: ["keyword-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_keyword_notifications" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
  });

  const unreadCount = keywordNotifs.filter((n: any) => !n.is_read).length;

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    const unreadIds = keywordNotifs.filter((n: any) => !n.is_read).map((n: any) => n.id);
    await supabase.from("ktrenz_keyword_notifications" as any).update({ is_read: true }).in("id", unreadIds);
    queryClient.invalidateQueries({ queryKey: ["keyword-notifications", user.id] });
  };

  // Fetch recent point transactions
  const { data: recentPoints } = useQuery({
    queryKey: ["notifications-points", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_point_transactions" as any)
        .select("id, amount, reason, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch recent battle results
  const { data: battleResults } = useQuery({
    queryKey: ["notifications-battle-results", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: preds } = await supabase
        .from("b2_predictions")
        .select("id, picked_run_id, opponent_run_id, band, status, reward_amount, picked_growth, opponent_growth, settled_at")
        .eq("user_id", user.id)
        .in("status", ["won", "lost"])
        .order("settled_at", { ascending: false })
        .limit(20);
      if (!preds || preds.length === 0) return [];
      const runIds = [...new Set(preds.flatMap(p => [p.picked_run_id, p.opponent_run_id]))];
      const { data: runs } = await (supabase.from("ktrenz_b2_runs") as any).select("id, star_id").in("id", runIds);
      const starIds = [...new Set((runs || []).map((r: any) => r.star_id))];
      const { data: stars } = await (supabase.from("ktrenz_stars") as any).select("id, display_name").in("id", starIds);
      const runToStar = new Map<string, string>();
      (runs || []).forEach((r: any) => {
        const star = (stars || []).find((s: any) => s.id === r.star_id);
        if (star) runToStar.set(r.id, star.display_name);
      });
      return preds.map(p => ({
        ...p,
        picked_star_name: runToStar.get(p.picked_run_id) || "Unknown",
        opponent_star_name: runToStar.get(p.opponent_run_id) || "Unknown",
      }));
    },
    enabled: !!user?.id,
  });

  const isLoading = authLoading || watchedLoading || scoresLoading;

  if (authLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">로그인이 필요합니다</h2>
          <p className="text-sm text-muted-foreground">알림을 보려면 로그인해주세요</p>
        </div>
        <Button onClick={() => navigate("/login")} className="h-12 px-8 rounded-full gap-2 font-medium">
          <LogIn className="w-5 h-5" />
          {t("common.signIn")}
        </Button>
      </div>
    );
  }

  const ChangeIndicator = ({ value }: { value: number }) => {
    if (value > 0) return (
      <span className="inline-flex items-center gap-0.5 text-green-400 text-xs font-semibold">
        <TrendingUp className="w-3 h-3" />+{value.toFixed(1)}%
      </span>
    );
    if (value < 0) return (
      <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-semibold">
        <TrendingDown className="w-3 h-3" />{value.toFixed(1)}%
      </span>
    );
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
        <Minus className="w-3 h-3" />0%
      </span>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SEO title="알림 – KTrenZ" description="관심 아티스트 순위 변동 알림" path="/notifications" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center h-14 px-4 gap-3">
          <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold text-foreground">{t("notif.title")}</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6 pb-24 max-w-lg mx-auto">
        {/* Keyword Follow Alerts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-primary" />
              {t("notif.keywordAlerts")}
              {unreadCount > 0 && (
                <span className="ml-1 text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary flex items-center gap-1 hover:underline">
                <CheckCheck className="w-3 h-3" />
                {t("notif.markAllRead")}
              </button>
            )}
          </div>

          {keywordNotifs.length === 0 ? (
            <div className="rounded-xl bg-card border border-border/50 p-6 text-center">
              <Crosshair className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notif.noKeywordAlerts")}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t("notif.followKeywords")}</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => navigate("/")}>
                {t("nav.battle")}
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {keywordNotifs.map((notif: any) => (
                <button
                  key={notif.id}
                  onClick={() => navigate(`/t2/keyword/${notif.trigger_id}`)}
                  className={cn(
                    "w-full rounded-xl border p-3 flex items-start gap-3 text-left transition-colors",
                    notif.is_read
                      ? "bg-card/50 border-border/30"
                      : "bg-primary/5 border-primary/20"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                    notif.notification_type === "influence_up" ? "bg-emerald-500/10" : "bg-red-500/10"
                  )}>
                    {notif.notification_type === "influence_up"
                      ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                      : <TrendingDown className="w-4 h-4 text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", notif.is_read ? "text-muted-foreground" : "text-foreground")}>
                      {notif.keyword}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{notif.artist_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {Number(notif.old_value).toFixed(0)} → {Number(notif.new_value).toFixed(0)}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold",
                        notif.delta_pct > 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {notif.delta_pct > 0 ? "+" : ""}{Number(notif.delta_pct).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(notif.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Battle Results Section */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-primary" />
            {language === "ko" ? "배틀 결과" : "Battle Results"}
          </h2>
          {(!battleResults || battleResults.length === 0) ? (
            <div className="rounded-xl bg-card border border-border/50 p-6 text-center">
              <Trophy className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {language === "ko" ? "아직 정산된 배틀이 없습니다" : "No settled battles yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {battleResults.map((r: any) => {
                const won = r.status === "won";
                const bandIcon = r.band === "steady" ? Sprout : r.band === "rising" ? Flame : Rocket;
                const BandIcon = bandIcon;
                const bandColor = r.band === "steady" ? "text-emerald-500" : r.band === "rising" ? "text-orange-500" : "text-red-500";
                const bandLabel = r.band === "steady" ? (language === "ko" ? "안정" : "Steady")
                  : r.band === "rising" ? (language === "ko" ? "상승" : "Rising")
                  : (language === "ko" ? "급등" : "Surge");
                return (
                  <div
                    key={r.id}
                    className={cn(
                      "rounded-xl border p-3 space-y-1.5",
                      won ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-border bg-card/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          won ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/10 text-red-500"
                        )}>
                          {won ? "✅ WIN" : "❌ LOSE"}
                        </span>
                        <span className="text-xs font-bold text-primary truncate">{r.picked_star_name}</span>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <span className="text-xs text-muted-foreground truncate">{r.opponent_star_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={cn("font-bold", (r.picked_growth ?? 0) > 0 ? "text-emerald-500" : "text-red-500")}>
                          {r.picked_growth !== null ? `${r.picked_growth > 0 ? "+" : ""}${r.picked_growth}%` : "–"}
                        </span>
                        <span className="text-muted-foreground">vs</span>
                        <span className={cn("font-bold", (r.opponent_growth ?? 0) > 0 ? "text-emerald-500" : "text-red-500")}>
                          {r.opponent_growth !== null ? `${r.opponent_growth > 0 ? "+" : ""}${r.opponent_growth}%` : "–"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <BandIcon className={cn("w-3 h-3", bandColor)} />
                          <span className="text-[10px] text-muted-foreground">{bandLabel}</span>
                        </div>
                        {won && r.reward_amount > 0 && (
                          <span className="text-xs font-bold text-primary">+{r.reward_amount} 💎</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.settled_at).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Watched Artists Section */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-primary" />
            {t("notif.watchedArtists")}
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !artistScores?.length ? (
            <div className="rounded-xl bg-card border border-border/50 p-6 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">관심 아티스트가 없습니다</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Fan Agent에서 아티스트를 등록하면 알림을 받을 수 있어요</p>
              <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => navigate("/agent")}>
                Fan Agent 열기
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {artistScores.map((artist) => (
                <button
                  key={artist.artist_name}
                  onClick={() => navigate(`/`)}
                  className="w-full rounded-xl bg-card/80 border border-border/50 p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
                >
                  {artist.image_url ? (
                    <img src={artist.image_url} alt={artist.artist_name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <span className="text-lg font-bold text-muted-foreground">{artist.artist_name[0]}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-bold",
                        artist.rank <= 3 ? "text-yellow-400" : "text-foreground"
                      )}>#{artist.rank}</span>
                      <span className="font-semibold text-foreground truncate">{artist.artist_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <ChangeIndicator value={artist.energy_change_24h} />
                      <span className="text-[10px] text-muted-foreground">Total {Math.round(artist.total_score).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-primary">
                      <Zap className="w-3 h-3" />
                      <span className="text-base font-black">{Math.round(artist.energy_score)}°</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Points History Section */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">📊 최근 토큰 내역</h2>
          {(recentPoints?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-4">토큰 기록이 없습니다</p>
          ) : (
            <div className="space-y-1.5">
              {(recentPoints ?? []).map((pt: any) => (
                <div key={pt.id} className="flex items-center justify-between rounded-lg bg-card/60 border border-border/30 px-3 py-2">
                  <div>
                    <p className="text-sm text-foreground">{pt.description || pt.reason}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(pt.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={cn("text-sm font-bold", pt.amount > 0 ? "text-green-400" : "text-red-400")}>
                    {pt.amount > 0 ? "+" : ""}{pt.amount}P
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Notifications;
