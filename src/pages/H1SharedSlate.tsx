/**
 * /h1/share/:slateId — Public viral slate page.
 *
 * Anyone (no login) can open this URL. Renders the snapshot of vouches that
 * the original caller published. Acts as the cold-entry point for the
 * Discover funnel: visitor lands here → sees a credible flex → CTA to play.
 */
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import { Sparkles, Eye, ArrowRight, Loader2, Flame } from "lucide-react";
import ktrenzLogo from "@/assets/logo_nd.webp";
import { trackH1Event } from "@/lib/h1Telemetry";
import H1AuthChip from "@/components/h1/H1AuthChip";

type SlateVouch = {
  item_id: string;
  confidence: "low" | "mid" | "high";
  title: string;
  artist: string;
  thumbnail: string | null;
  source: string;
};

type Slate = {
  id: string;
  handle: string | null;
  drop_date: string;
  vouches: SlateVouch[];
  view_count: number;
  created_at: string;
};

function useSharedSlate(slateId: string | undefined) {
  return useQuery({
    queryKey: ["h1-shared-slate", slateId],
    queryFn: async (): Promise<Slate | null> => {
      if (!slateId) return null;
      const { data, error } = await (supabase as any)
        .from("ktrenz_h1_shared_slates")
        .select("id, handle, drop_date, vouches, view_count, created_at")
        .eq("id", slateId)
        .maybeSingle();
      if (error) throw error;
      return (data as Slate) || null;
    },
    enabled: !!slateId,
    staleTime: 1000 * 60,
  });
}

const confidenceMeta = {
  low:  { label: "Low",  shade: "from-amber-400 to-amber-500" },
  mid:  { label: "Mid",  shade: "from-orange-400 to-orange-500" },
  high: { label: "High", shade: "from-rose-400 to-red-500" },
} as const;

export default function H1SharedSlate() {
  const { slateId } = useParams<{ slateId: string }>();
  const { data: slate, isLoading, error } = useSharedSlate(slateId);

  // Bump view count + log telemetry once per mount (best-effort).
  useEffect(() => {
    if (!slateId) return;
    void (supabase as any).rpc("ktrenz_h1_bump_slate_view", { _slate_id: slateId });
    trackH1Event("h1_share_viewed", { slate_id: slateId });
  }, [slateId]);

  const headline = slate?.handle
    ? `${slate.handle}'s K-pop calls — ${slate.vouches.length} content vouches`
    : `${slate?.vouches.length ?? 0} K-pop content calls — KTrenZ Discover`;
  const subline = slate
    ? `Vouched on ${new Date(slate.drop_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. Resolves 7 days later.`
    : "";

  return (
    <>
      <SEO
        title={headline}
        description={`See which K-pop contents this caller predicted would go viral${slate?.handle ? ` — ${slate.handle}` : ""}. Make your own calls on KTrenZ Discover.`}
        path={`/h1/share/${slateId ?? ""}`}
        type="article"
        ogImage={slateId ? `https://jguylowswwgjvotdcsfj.supabase.co/functions/v1/ktrenz-h1-share-image?slate=${slateId}` : undefined}
      />
      <main className="min-h-screen bg-neutral-950 text-white">
        {/* Ambient backdrop */}
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
          <div className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-rose-600" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-15 bg-orange-500" />
        </div>

        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
            <Link to="/h1" className="flex items-center gap-2.5 shrink-0">
              <img src={ktrenzLogo} alt="KtrenZ" className="h-4 w-auto" />
              <span className="hidden sm:inline text-[11px] font-black tracking-[0.22em] uppercase text-white/85">Discover</span>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/h1"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500 text-white text-xs font-black hover:bg-rose-400 transition-colors"
              >
                Make your calls <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <H1AuthChip compact />
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {isLoading ? (
            <div className="flex items-center justify-center py-32 text-white/50">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : error || !slate ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
              <Sparkles className="w-8 h-8 text-white/40 mx-auto mb-3" />
              <h1 className="text-lg font-bold text-white mb-1">Slate not found</h1>
              <p className="text-sm text-white/50">
                This share link may have expired or never existed.
              </p>
              <Link
                to="/h1"
                className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-full bg-white text-black text-sm font-black hover:scale-[1.02] transition-transform"
              >
                Try Discover <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <>
              {/* Hero block */}
              <section className="mb-8 sm:mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-300 text-[10px] font-black tracking-[0.18em] uppercase mb-4">
                  <Flame className="w-3 h-3" /> {slate.handle ? "Caller's slate" : "Anonymous slate"}
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] text-white mb-3">
                  {slate.vouches.length} contents.
                  <br className="hidden sm:block" /> Will they pop?
                </h1>
                <p className="text-sm sm:text-base text-white/60 max-w-xl mb-6">{subline}</p>
                <div className="flex items-center gap-4 text-xs text-white/50">
                  <span className="inline-flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> {slate.view_count.toLocaleString()} views
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span>Resolution in 7 days</span>
                </div>
              </section>

              {/* Slate grid */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {slate.vouches.map((v) => (
                  <SlateCard key={v.item_id} v={v} />
                ))}
              </section>

              {/* CTA */}
              <section className="mt-10 sm:mt-14 rounded-3xl bg-gradient-to-br from-rose-900/40 via-neutral-900 to-orange-900/40 border border-rose-500/20 p-7 sm:p-10 text-center">
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
                  Think you can call earlier?
                </h2>
                <p className="text-sm sm:text-base text-white/70 max-w-md mx-auto mb-6">
                  Today's drop is fresh. Vouch on the contents you think will pop —
                  earlier calls earn more.
                </p>
                <Link
                  to="/h1"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:scale-[1.02] transition-transform shadow-2xl"
                >
                  Open Discover <ArrowRight className="w-4 h-4" />
                </Link>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SlateCard({ v }: { v: SlateVouch }) {
  const cfg = confidenceMeta[v.confidence];
  return (
    <article className="relative rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden hover:bg-white/[0.05] transition-colors">
      <div className="relative aspect-video bg-neutral-900 overflow-hidden">
        {v.thumbnail ? (
          <img
            src={v.thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-rose-900/40 to-orange-900/40" />
        )}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />
        <div
          className={`absolute top-2.5 right-2.5 inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r ${cfg.shade} text-white text-[10px] font-black uppercase tracking-wider shadow-lg`}
        >
          {cfg.label}
        </div>
      </div>
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-1.5 truncate">
          {v.artist}
        </div>
        <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{v.title}</h3>
      </div>
    </article>
  );
}
