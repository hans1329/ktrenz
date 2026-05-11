/**
 * /h1/leaderboard — Daily / weekly rankings of top callers.
 *
 * Reads ktrenz_h1_leaderboard_daily, populated by the resolve cron after
 * each cohort settles. Today's drop won't appear here until 7d post-curate.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import { Sparkles, ArrowRight, Loader2, Trophy, Crown } from "lucide-react";
import H1AppHeader from "@/components/h1/H1AppHeader";
import { BottomNav, DesktopSidebar, useActivePicksCount, BOTTOM_NAV_H } from "./H1Discover";
import { useH1Status } from "@/hooks/useH1Status";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackH1Event } from "@/lib/h1Telemetry";

function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type LeaderboardRow = {
  drop_date: string;
  user_id: string;
  total_score: number;
  hits: number;
  misses: number;
  rank: number;
};

type Range = "latest" | "week";

function useLeaderboard(range: Range) {
  return useQuery({
    queryKey: ["h1-leaderboard", range],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      // Latest resolved drop_date — find max(drop_date) and pull its rows.
      const { data: dates, error: dErr } = await (supabase as any)
        .from("ktrenz_h1_leaderboard_daily")
        .select("drop_date")
        .order("drop_date", { ascending: false })
        .limit(1);
      if (dErr) throw dErr;
      const latest = dates?.[0]?.drop_date as string | undefined;
      if (!latest) return [];

      if (range === "latest") {
        const { data, error } = await (supabase as any)
          .from("ktrenz_h1_leaderboard_daily")
          .select("drop_date, user_id, total_score, hits, misses, rank")
          .eq("drop_date", latest)
          .order("rank", { ascending: true })
          .limit(50);
        if (error) throw error;
        return (data ?? []) as LeaderboardRow[];
      }

      // 7-day rolling: aggregate scores across the last 7 resolved dates.
      const since = new Date(latest);
      since.setUTCDate(since.getUTCDate() - 6);
      const sinceIso = since.toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("ktrenz_h1_leaderboard_daily")
        .select("drop_date, user_id, total_score, hits, misses, rank")
        .gte("drop_date", sinceIso)
        .lte("drop_date", latest)
        .order("drop_date", { ascending: false })
        .limit(2000);
      if (error) throw error;

      // Sum per user across the window.
      const agg = new Map<string, { total: number; hits: number; misses: number }>();
      for (const row of (data ?? []) as LeaderboardRow[]) {
        const cur = agg.get(row.user_id) ?? { total: 0, hits: 0, misses: 0 };
        cur.total += Number(row.total_score ?? 0);
        cur.hits += row.hits;
        cur.misses += row.misses;
        agg.set(row.user_id, cur);
      }
      const ranked = [...agg.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([user_id, s], i) => ({
          drop_date: latest,
          user_id,
          total_score: s.total,
          hits: s.hits,
          misses: s.misses,
          rank: i + 1,
        }));
      return ranked.slice(0, 50);
    },
    staleTime: 1000 * 60,
  });
}

export default function H1Leaderboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [range, setRange] = useState<Range>("latest");
  const { data: rows = [], isLoading } = useLeaderboard(range);
  const { data: activePicksCount = 0 } = useActivePicksCount(user?.id);
  const { status: h1Status } = useH1Status(user?.id);

  useEffect(() => {
    trackH1Event("h1_page_view", { page: "leaderboard", range });
    void import("./H1Discover");
    void import("./H1History");
  }, [range]);

  return (
    <>
      <SEO
        title={`${t("h1.lb.title")} — KTrenZ Discover`}
        description={t("h1.lb.subtitle")}
        path="/h1/leaderboard"
      />
      <main
        className="min-h-screen bg-neutral-950 text-white"
        style={isMobile ? { paddingBottom: BOTTOM_NAV_H + 16 } : undefined}
      >
        <H1AppHeader
          active="leaderboard"
          balance={h1Status.balance}
          signedIn={h1Status.signed_in}
          picksBadge={activePicksCount > 0 ? activePicksCount : undefined}
        />

        <div className="lg:flex lg:max-w-[1400px] lg:mx-auto">
          <DesktopSidebar active="leaderboard" activePicksCount={activePicksCount} showQuota={false} />
          <div className="flex-1 max-w-3xl mx-auto lg:mx-0 w-full px-4 sm:px-6 py-8 sm:py-10 lg:px-8">
            <header className="mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-300/25 text-violet-200 text-[10px] font-black tracking-[0.18em] uppercase mb-3">
                <Trophy className="w-3 h-3" /> {t("h1.lb.title")}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-1">
                {t("h1.lb.title")}
              </h1>
              <p className="text-sm text-white/55">{t("h1.lb.subtitle")}</p>
            </header>

            {/* Range toggle */}
            <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-1 mb-6">
              <RangeBtn label={t("h1.lb.range.latest")} active={range === "latest"} onClick={() => setRange("latest")} />
              <RangeBtn label={t("h1.lb.range.week")} active={range === "week"} onClick={() => setRange("week")} />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-32 text-white/50">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState />
            ) : (
              <ol className="space-y-2">
                {rows.map((r) => (
                  <RankRow key={`${r.drop_date}-${r.user_id}`} row={r} />
                ))}
              </ol>
            )}
          </div>
        </div>

        {isMobile && <BottomNav active="leaderboard" activePicksCount={activePicksCount} position="fixed" />}
      </main>
    </>
  );
}

function RangeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
        active ? "bg-white text-black" : "text-white/65 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function RankRow({ row }: { row: LeaderboardRow }) {
  const { t } = useLanguage();
  const top3 = row.rank <= 3;
  const accent =
    row.rank === 1 ? "from-amber-400 to-amber-500 text-white" :
    row.rank === 2 ? "from-zinc-300 to-zinc-400 text-black" :
    row.rank === 3 ? "from-orange-500 to-orange-600 text-white" :
    "bg-white/5 text-white/65";
  return (
    <li className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${
      top3
        ? "bg-gradient-to-r from-violet-500/[0.06] to-purple-500/[0.04] border-violet-300/20 hover:from-violet-500/[0.1]"
        : "bg-white/[0.03] border-white/10 hover:bg-white/[0.05]"
    }`}>
      <div
        className={`relative w-10 h-10 rounded-full grid place-items-center font-black tabular-nums shrink-0 ${
          top3 ? `bg-gradient-to-br ${accent} shadow-lg` : accent
        }`}
      >
        {row.rank === 1 ? <Crown className="w-5 h-5" /> : row.rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">
          {anonymizeUserId(row.user_id)}
        </div>
        <div className="text-[11px] text-white/45 mt-0.5">
          {tFmt(t("h1.lb.hits"), { n: String(row.hits), m: String(row.misses) })}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[9px] uppercase tracking-wider font-bold text-white/40">{t("h1.lb.score")}</div>
        <div className="text-base font-black text-violet-200 tabular-nums">
          {Math.round(row.total_score).toLocaleString()}
        </div>
      </div>
    </li>
  );
}

function anonymizeUserId(uid: string): string {
  // No public handle field exposed yet — show a stable anon label.
  // Last 4 of UUID is enough for users to recognize themselves without
  // leaking any other info.
  const tail = uid.slice(-4).toUpperCase();
  return `Caller-${tail}`;
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-white mb-1">{t("h1.lb.empty.title")}</h2>
      <p className="text-sm text-white/50 mb-5">{t("h1.lb.empty.body")}</p>
      <Link
        to="/h1"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
      >
        {t("h1.history.empty.cta")} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
