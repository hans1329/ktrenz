/**
 * /h1/history — Past vouches with resolution status.
 *
 * Auth-gated: not-logged-in users get a sign-in prompt. Once authed, the page
 * lists every vouch the caller has made, joined with the underlying item.
 * Hits/misses surface once the drop has resolved.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sparkles, ArrowRight, Loader2, Check, X as XIcon, Clock, Trophy } from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import { trackH1Event } from "@/lib/h1Telemetry";
import { useToast } from "@/hooks/use-toast";
import H1AuthChip from "@/components/h1/H1AuthChip";
import H1CallConfirmDialog from "@/components/h1/H1CallConfirmDialog";
import H1AppHeader from "@/components/h1/H1AppHeader";
import { useH1Status } from "@/hooks/useH1Status";
import { BottomNav, DesktopSidebar, useActivePicksCount, BOTTOM_NAV_H } from "./H1Discover";
import { cn } from "@/lib/utils";

function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

type HistoryRow = {
  vouch_id: string;
  drop_id: string;
  drop_date: string;
  confidence: "low" | "mid" | "high";
  vouched_at: string;
  resolved: boolean;
  hit: boolean | null;
  raw_score: number | null;
  final_score: number | null;
  k_cash: number | null;
  item_id: string;
  source: string;
  title: string;
  thumbnail: string | null;
  url: string;
  star_display_name: string | null;
  star_image_url: string | null;
  // Added by 20260509120000_h1_my_history_with_rank migration. Optional so
  // the client renders gracefully on stale RPCs (just shows "pending").
  current_rank: number | null;
  cohort_size: number | null;
};

function useMyHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["h1-my-history"],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await (supabase as any).rpc("ktrenz_h1_my_history", {
        _limit: 200,
        _offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
    enabled,
    staleTime: 1000 * 30,
  });
}

const confidenceShade: Record<string, string> = {
  low:  "from-amber-400 to-amber-500",
  mid:  "from-orange-400 to-orange-500",
  high: "from-rose-400 to-red-500",
};

const TIER_MULT: Record<string, number> = { low: 1, mid: 2, high: 4 };

type RoundGroup = {
  drop_date: string;
  resolutionAt: number;          // ms
  rows: HistoryRow[];
  resolved: boolean;             // all rows in this round resolved?
  hits: number;
  misses: number;
  pending: number;
  kCash: number;
};

function groupByRound(rows: HistoryRow[]): RoundGroup[] {
  const map = new Map<string, RoundGroup>();
  for (const r of rows) {
    let g = map.get(r.drop_date);
    if (!g) {
      const resolutionAt = new Date(r.drop_date).getTime() + 7 * 24 * 3600 * 1000;
      g = { drop_date: r.drop_date, resolutionAt, rows: [], resolved: true, hits: 0, misses: 0, pending: 0, kCash: 0 };
      map.set(r.drop_date, g);
    }
    g.rows.push(r);
    if (r.resolved) {
      if (r.hit) g.hits += 1; else g.misses += 1;
      g.kCash += r.k_cash ?? 0;
    } else {
      g.pending += 1;
      g.resolved = false;
    }
  }
  return [...map.values()].sort((a, b) => b.drop_date.localeCompare(a.drop_date));
}

export default function H1History() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const { data: rows = [], isLoading, refetch } = useMyHistory(!!user?.id);
  const { data: activePicksCount = 0 } = useActivePicksCount(user?.id);
  const { status: h1Status } = useH1Status(user?.id);
  const { toast } = useToast();
  const [pending, setPending] = useState<{ row: HistoryRow; tier: "low"|"mid"|"high" } | null>(null);

  useEffect(() => {
    trackH1Event("h1_page_view", { page: "history", authed: !!user?.id });
    void import("./H1Discover");
    void import("./H1Leaderboard");
  }, [user?.id]);

  const totalKCash = rows.reduce((s, r) => s + (r.k_cash ?? 0), 0);
  const hits = rows.filter((r) => r.resolved && r.hit).length;
  const settled = rows.filter((r) => r.resolved).length;
  const groups = useMemo(() => groupByRound(rows), [rows]);

  async function applyTierChange() {
    if (!pending) return;
    const { row, tier } = pending;
    setPending(null);
    const { error } = await (supabase as any).rpc("ktrenz_h1_record_vouch", {
      _item_id: row.item_id,
      _confidence: tier,
    });
    if (error) {
      toast({
        variant: "destructive",
        title: "변경 실패",
        description: String((error as any)?.message ?? error),
      });
      return;
    }
    void refetch();
  }

  return (
    <>
      <SEO
        title={`${t("h1.history.title")} — KTrenZ Discover`}
        description={t("h1.history.subtitle")}
        path="/h1/history"
      />
      <main
        className="min-h-screen bg-neutral-950 text-white"
        style={isMobile ? { paddingBottom: BOTTOM_NAV_H + 16 } : undefined}
      >
        <H1AppHeader
          active="history"
          balance={h1Status.balance}
          signedIn={h1Status.signed_in}
          picksBadge={activePicksCount > 0 ? activePicksCount : undefined}
        />

        <div className="lg:flex lg:max-w-[1400px] lg:mx-auto">
          <DesktopSidebar active="history" activePicksCount={activePicksCount} showQuota={false} />
          <div className="flex-1 max-w-3xl mx-auto lg:mx-0 w-full px-4 sm:px-6 py-8 sm:py-10 lg:px-8">
            {!user?.id ? (
              <SignInPrompt />
            ) : isLoading ? (
              <div className="flex items-center justify-center py-32 text-white/50">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Page heading */}
                <header className="mb-6">
                  <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-1.5">{t("h1.history.title")}</h1>
                  <p className="text-sm text-white/55">{t("h1.history.subtitle")}</p>
                </header>

                {/* Stats strip */}
                <section className="grid grid-cols-3 gap-3 mb-7">
                  <StatCard label={t("h1.history.stat.total")} value={String(rows.length)} />
                  <StatCard label={t("h1.history.stat.hits")} value={settled === 0 ? "—" : `${hits}/${settled}`} />
                  <StatCard label={t("h1.history.stat.earned")} value={totalKCash.toLocaleString()} accent="amber" />
                </section>

                {/* Round groups */}
                <section className="space-y-7">
                  {groups.map((g) => (
                    <RoundSection
                      key={g.drop_date}
                      group={g}
                      language={language}
                      t={t}
                      onChangeTier={(row, tier) => setPending({ row, tier })}
                    />
                  ))}
                </section>
              </>
            )}
          </div>
        </div>

        {isMobile && <BottomNav active="history" activePicksCount={activePicksCount} position="fixed" />}
      </main>
      <H1CallConfirmDialog
        open={!!pending}
        tier={pending?.tier ?? null}
        resolutionMs={pending ? new Date(pending.row.drop_date).getTime() + 7 * 24 * 3600 * 1000 : Date.now()}
        onCancel={() => setPending(null)}
        onConfirm={applyTierChange}
      />
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      accent === "amber"
        ? "bg-gradient-to-br from-sky-500/10 to-blue-500/5 border-sky-300/20"
        : "bg-white/[0.03] border-white/10",
    )}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">{label}</div>
      <div className={cn(
        "text-xl sm:text-2xl font-black tabular-nums",
        accent === "amber" ? "text-sky-100" : "text-white",
      )}>{value}</div>
    </div>
  );
}

function RoundSection({
  group,
  language,
  t,
  onChangeTier,
}: {
  group: RoundGroup;
  language: string;
  t: (k: string) => string;
  onChangeTier: (row: HistoryRow, tier: "low" | "mid" | "high") => void;
}) {
  const localeMap: Record<string, string> = { ko: "ko-KR", ja: "ja-JP", zh: "zh-CN", en: "en-US" };
  const locale = localeMap[language] ?? "en-US";
  const dateLabel = new Date(group.drop_date).toLocaleDateString(locale, {
    month: "short", day: "numeric", weekday: "short",
  });
  const daysLeft = Math.ceil((group.resolutionAt - Date.now()) / (24 * 3600 * 1000));

  return (
    <div>
      {/* Round header */}
      <div className="flex items-end justify-between gap-2 mb-2.5 pb-2 border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className="text-[10px] font-black tracking-[0.18em] uppercase text-white/45 mb-0.5">{dateLabel}</div>
          <div className="text-base font-black text-white tracking-tight">
            {group.rows.length} pick{group.rows.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!group.resolved && daysLeft > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 border border-violet-300/25 text-[10px] font-black tabular-nums">
              <Clock className="w-2.5 h-2.5" /> {tFmt(t("h1.history.resolveIn"), { n: String(daysLeft) })}
            </span>
          )}
          {group.resolved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-black tabular-nums">
              <Check className="w-2.5 h-2.5" /> {group.hits}/{group.hits + group.misses}
            </span>
          )}
          {group.kCash > 0 && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-100 border border-sky-300/25 text-[10px] font-black tabular-nums">
              💎+{group.kCash}
            </span>
          )}
        </div>
      </div>
      {/* Picks within this round */}
      <ul className="space-y-2">
        {group.rows.map((r) => (
          <HistoryCard
            key={r.vouch_id}
            row={r}
            onChangeTier={(tier) => onChangeTier(r, tier)}
          />
        ))}
      </ul>
    </div>
  );
}

function HistoryCard({
  row,
  onChangeTier,
}: {
  row: HistoryRow;
  onChangeTier: (tier: "low" | "mid" | "high") => void;
}) {
  const confShade = confidenceShade[row.confidence] ?? confidenceShade.mid;
  const currentMult = TIER_MULT[row.confidence] ?? 1;
  return (
    <article className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-3 sm:p-3.5 hover:bg-white/[0.05] transition-colors">
      <div className="relative w-20 h-14 sm:w-24 sm:h-16 shrink-0 rounded-lg bg-neutral-900 overflow-hidden">
        {row.thumbnail ? (
          <img
            src={row.thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-900/30 to-orange-900/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 text-[10px] uppercase tracking-wide text-white/55 font-bold">
          <span className="truncate">{row.star_display_name ?? "Unknown"}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-white/30" />
          <span>{new Date(row.drop_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-1 mb-1">{row.title}</h3>
        <div className="flex items-center gap-2">
          {row.resolved ? (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded bg-gradient-to-r ${confShade} text-white text-[10px] font-black tabular-nums`}>
              ×{currentMult}
            </span>
          ) : (
            // Unresolved → inline tier-change pills. Tap a different ×N to
            // open the confirm dialog and re-vouch.
            <div className="inline-flex items-center gap-1">
              {(["low","mid","high"] as const).map((tier) => {
                const m = TIER_MULT[tier];
                const isActive = row.confidence === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => { if (!isActive) onChangeTier(tier); }}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums border transition-colors",
                      isActive
                        ? `bg-gradient-to-r ${confidenceShade[tier]} text-white border-white/30`
                        : "border-white/10 text-white/55 hover:bg-white/5 hover:text-white/85",
                    )}
                  >
                    ×{m}
                  </button>
                );
              })}
            </div>
          )}
          <ResolutionBadge row={row} />
        </div>
      </div>
      {row.k_cash != null && row.k_cash !== 0 && (
        <div className="text-right shrink-0">
          <div className={cn(
            "text-sm font-black tabular-nums inline-flex items-center gap-0.5",
            row.k_cash > 0 ? "text-sky-200" : "text-white/55",
          )}>
            💎{row.k_cash > 0 ? `+${row.k_cash}` : row.k_cash}
          </div>
        </div>
      )}
    </article>
  );
}

function ResolutionBadge({ row }: { row: HistoryRow }) {
  if (!row.resolved) {
    // Interim signal: show current cohort rank so the 7-day wait isn't a
    // black box. Top 30% of the cohort is the resolution threshold (PRD §6),
    // so highlight provisional hits in green and stragglers in plain pending.
    if (row.current_rank != null && row.cohort_size != null && row.cohort_size > 0) {
      const provisionallyHit = row.current_rank / row.cohort_size <= 0.3;
      return (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
            provisionallyHit
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/5 text-white/55"
          }`}
        >
          <Clock className="w-3 h-3" />
          #{row.current_rank}/{row.cohort_size}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-white/45 font-medium">
        <Clock className="w-3 h-3" /> pending
      </span>
    );
  }
  if (row.hit) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
        <Check className="w-3 h-3" /> hit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 text-white/45 text-[10px] font-bold">
      <XIcon className="w-3 h-3" /> miss
    </span>
  );
}

function SignInPrompt() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center mt-12">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-white mb-1">{t("h1.history.signin.title")}</h1>
      <p className="text-sm text-white/50 mb-5">{t("h1.history.signin.body")}</p>
      <Link
        to="/login?redirect=%2Fh1%2Fhistory"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
      >
        {t("h1.history.signin.cta")} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center mt-12">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-white mb-1">{t("h1.history.empty.title")}</h1>
      <p className="text-sm text-white/50 mb-5">{t("h1.history.empty.body")}</p>
      <Link
        to="/h1"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
      >
        {t("h1.history.empty.cta")} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

/* ─────── Top nav (shared chrome for /h1 secondary pages) ─────── */
function H1TopNav({ active }: { active: "discover" | "history" | "leaderboard" }) {
  const { t } = useLanguage();
  return (
    <header className="sticky top-0 z-30 bg-black/65 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <Link to="/h1" className="flex items-center gap-2 shrink-0" aria-label="Home">
          <img src={ktrenzLogo} alt="KtrenZ" className="h-4 w-auto" />
          <span className="hidden md:inline text-[10px] font-black tracking-[0.22em] uppercase text-white/85">
            {t("h1.brand.discover")}
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <NavTab to="/h1" label={t("h1.nav.discover")} active={active === "discover"} />
          <NavTab to="/h1/history" label={t("h1.nav.myCalls")} active={active === "history"} />
          <NavTab to="/h1/leaderboard" label={t("h1.nav.leaderboard")} active={active === "leaderboard"} icon={Trophy} />
        </nav>
        <div className="flex items-center shrink-0">
          <H1AuthChip compact />
        </div>
      </div>
    </header>
  );
}

function NavTab({ to, label, active, icon: Icon }: { to: string; label: string; active: boolean; icon?: React.ElementType }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tabular-nums transition-colors whitespace-nowrap",
        active ? "bg-white text-black" : "text-white/65 hover:text-white",
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </Link>
  );
}

export { H1TopNav };
