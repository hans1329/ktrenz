/**
 * /wallet — K-Cash balance + transaction history.
 *
 * Reads the unified `ktrenz_user_points` (balance) and
 * `ktrenz_point_transactions` (ledger) tables that back both Battle and
 * Discover (h1) earnings + spending.
 *
 * Reachable from:
 *   - /settings (Discover shortcuts row "💎 balance")
 *   - profile menu Spotify progress bar (indirectly via /spotify-redeem)
 */
import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, ExternalLink } from "lucide-react";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type TxRow = {
  id: string;
  amount: number;
  reason: string;
  metadata: Record<string, any> | null;
  created_at: string;
};

const REASON_KEY: Record<string, string> = {
  h1_hit: "wallet.reason.h1_hit",
  h1_miss: "wallet.reason.h1_miss",
  h1_drip: "wallet.reason.h1_drip",
  welcome_bonus: "wallet.reason.welcome_bonus",
  battle_pick: "wallet.reason.battle_pick",
  battle_miss: "wallet.reason.battle_miss",
  spotify_redeem: "wallet.reason.spotify_redeem",
};

export default function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=%2Fwallet", { replace: true });
  }, [user, authLoading, navigate]);

  const { data: balance = 0 } = useQuery({
    queryKey: ["wallet-balance", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { data } = await (supabase as any)
        .from("ktrenz_user_points")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data?.points as number | undefined) ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const { data: txs = [], isLoading: txLoading } = useQuery<TxRow[]>({
    queryKey: ["wallet-tx", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("ktrenz_point_transactions")
        .select("id, amount, reason, metadata, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.warn("[wallet] tx fetch failed:", error);
        return [];
      }
      return (data ?? []) as TxRow[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const localeFmt = useMemo(() => {
    const map: Record<string, string> = { ko: "ko-KR", ja: "ja-JP", zh: "zh-CN", en: "en-US" };
    return map[language] ?? "en-US";
  }, [language]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/55" />
      </div>
    );
  }

  return (
    <>
      <SEO title={`${t("wallet.title")} — KTrenZ`} description={t("wallet.history")} path="/wallet" />
      <main className="min-h-screen bg-neutral-950 text-white">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-white/10">
          <div className="flex items-center h-12 px-3 max-w-lg mx-auto">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-white/55 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center text-sm font-bold tracking-tight text-white">
              {t("wallet.title")}
            </h1>
            <div className="w-9" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Balance hero */}
          <section className="rounded-3xl bg-gradient-to-br from-sky-500/15 via-blue-500/10 to-violet-500/15 border border-sky-300/25 p-6 text-center shadow-[0_0_40px_rgba(56,189,248,0.15)]">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/65 mb-2">
              {t("wallet.balance")}
            </div>
            <div className="text-5xl font-black text-white tabular-nums tracking-tight inline-flex items-baseline gap-1.5">
              💎{balance.toLocaleString()}
            </div>

            <Link
              to="/spotify-redeem"
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold border border-emerald-400/30 transition-colors"
            >
              {t("wallet.cta.redeem")}
            </Link>
          </section>

          {/* History */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                {t("wallet.history")}
              </h2>
            </div>

            {txLoading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="w-5 h-5 animate-spin text-white/45" />
              </div>
            ) : txs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
                <Sparkles className="w-6 h-6 text-white/35 mx-auto mb-2" />
                <p className="text-sm text-white/55">{t("wallet.empty")}</p>
              </div>
            ) : (
              <ul className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
                {txs.map((tx) => (
                  <TxRowItem key={tx.id} tx={tx} t={t} localeFmt={localeFmt} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function TxRowItem({
  tx,
  t,
  localeFmt,
}: {
  tx: TxRow;
  t: (k: string) => string;
  localeFmt: string;
}) {
  const labelKey = REASON_KEY[tx.reason] ?? "wallet.reason.other";
  const date = new Date(tx.created_at);
  const dateStr = date.toLocaleDateString(localeFmt, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(localeFmt, { hour: "2-digit", minute: "2-digit" });
  const positive = tx.amount > 0;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{t(labelKey)}</div>
        <div className="text-[11px] text-white/40 mt-0.5">{dateStr} · {timeStr}</div>
      </div>
      <div className={cn(
        "text-sm font-bold tabular-nums shrink-0",
        positive ? "text-sky-200" : "text-white/55",
      )}>
        💎{positive ? `+${tx.amount}` : tx.amount}
      </div>
    </li>
  );
}
