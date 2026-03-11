import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bell, TrendingUp, TrendingDown, Minus, Zap, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";

interface WatchedArtistScore {
  artist_name: string;
  wiki_entry_id: string | null;
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
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  // Fetch watched artists
  const { data: watchedArtists, isLoading: watchedLoading } = useQuery({
    queryKey: ["notifications-watched", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("ktrenz_watched_artists")
        .select("id, artist_name, wiki_entry_id")
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

      const wikiIds = watchedArtists.filter(w => w.wiki_entry_id).map(w => w.wiki_entry_id!);
      if (!wikiIds.length) return [];

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
        const score = seen.get(w.wiki_entry_id ?? "");
        const rank = score ? sorted.indexOf(score) + 1 : 999;
        return {
          artist_name: w.artist_name,
          wiki_entry_id: w.wiki_entry_id,
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
          <h1 className="text-base font-bold text-foreground">알림</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6 pb-24 max-w-lg mx-auto">
        {/* Watched Artists Section */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-primary" />
            관심 아티스트 실시간 현황
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
                  key={artist.wiki_entry_id ?? artist.artist_name}
                  onClick={() => artist.wiki_entry_id && navigate(`/artist/${artist.wiki_entry_id}`)}
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
                      <span className="text-base font-black">{Math.round(artist.energy_score)}</span>
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
