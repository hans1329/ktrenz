/**
 * /h1/history — Past vouches with resolution status.
 *
 * Auth-gated: not-logged-in users get a sign-in prompt. Once authed, the page
 * lists every vouch the caller has made, joined with the underlying item.
 * Hits/misses surface once the drop has resolved.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, ArrowRight, Loader2, Check, X as XIcon, Clock, Trophy } from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import { trackH1Event } from "@/lib/h1Telemetry";
import H1AuthChip from "@/components/h1/H1AuthChip";

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

export default function H1History() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useMyHistory(!!user?.id);

  useEffect(() => {
    trackH1Event("h1_page_view", { page: "history", authed: !!user?.id });
  }, [user?.id]);

  const totalKCash = rows.reduce((s, r) => s + (r.k_cash ?? 0), 0);
  const hits = rows.filter((r) => r.resolved && r.hit).length;
  const settled = rows.filter((r) => r.resolved).length;

  return (
    <>
      <SEO
        title="Your calls — KTrenZ Discover"
        description="Your full vouch history with resolution outcomes."
        path="/h1/history"
      />
      <main className="min-h-screen bg-neutral-950 text-white">
        <H1TopNav active="history" />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
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
              {/* Stats strip */}
              <section className="grid grid-cols-3 gap-3 mb-7">
                <StatCard label="Total calls" value={String(rows.length)} />
                <StatCard label="Hits" value={settled === 0 ? "—" : `${hits}/${settled}`} />
                <StatCard label="K-Cash earned" value={totalKCash.toLocaleString()} />
              </section>

              {/* Vouch list */}
              <section className="space-y-2.5">
                {rows.map((r) => (
                  <HistoryCard key={r.vouch_id} row={r} />
                ))}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">{label}</div>
      <div className="text-xl sm:text-2xl font-black text-white tabular-nums">{value}</div>
    </div>
  );
}

function HistoryCard({ row }: { row: HistoryRow }) {
  const confShade = confidenceShade[row.confidence] ?? confidenceShade.mid;
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
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded bg-gradient-to-r ${confShade} text-white text-[9px] font-black uppercase tracking-wider`}>
            {row.confidence}
          </span>
          <ResolutionBadge row={row} />
        </div>
      </div>
      {row.k_cash != null && row.k_cash > 0 && (
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-white/40 font-bold">K-Cash</div>
          <div className="text-sm font-black text-rose-300 tabular-nums">+{row.k_cash}</div>
        </div>
      )}
    </article>
  );
}

function ResolutionBadge({ row }: { row: HistoryRow }) {
  if (!row.resolved) {
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
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center mt-12">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-white mb-1">Sign in to see your calls</h1>
      <p className="text-sm text-white/50 mb-5">
        Your vouches are saved locally for this device until you sign in.
      </p>
      <Link
        to="/login?redirect=%2Fh1%2Fhistory"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
      >
        Sign in <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center mt-12">
      <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
      <h1 className="text-lg font-bold text-white mb-1">No calls yet</h1>
      <p className="text-sm text-white/50 mb-5">
        Make your first call on today's drop. Earlier calls earn more.
      </p>
      <Link
        to="/h1"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
      >
        Open Discover <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

/* ─────── Top nav (shared chrome for /h1 secondary pages) ─────── */
function H1TopNav({ active }: { active: "history" | "leaderboard" }) {
  return (
    <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
        <Link to="/h1" className="flex items-center gap-2.5 shrink-0">
          <img src={ktrenzLogo} alt="KtrenZ" className="h-4 w-auto" />
          <span className="hidden sm:inline text-[11px] font-black tracking-[0.22em] uppercase text-white/85">Discover</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            to="/h1/history"
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              active === "history" ? "bg-white text-black" : "text-white/65 hover:text-white"
            }`}
          >
            History
          </Link>
          <Link
            to="/h1/leaderboard"
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              active === "leaderboard" ? "bg-white text-black" : "text-white/65 hover:text-white"
            }`}
          >
            <Trophy className="w-3 h-3 inline -mt-0.5 mr-0.5" /> Ranks
          </Link>
        </nav>
        <div className="flex items-center shrink-0">
          <H1AuthChip compact />
        </div>
      </div>
    </header>
  );
}

export { H1TopNav };
