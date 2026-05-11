/**
 * /k-pass — K-Pass membership tiers, redesigned for the H1 (Discover) era.
 *
 * Pre-launch the page sold Battle / Fan Agent perks. Post-P10 launch the
 * meaningful upsells live around Discover (slot caps, momentum access,
 * ad removal, B2B-lite API). Dark theme matches /h1, /wallet, /settings.
 *
 * Tiers still come from the kpass_tiers DB table (5 sort_orders), but the
 * feature lists below are rewritten to reflect Discover game + 30-day
 * insight access — the actual product surface today.
 */
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SEO from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Check, Loader2, Flame, BarChart3, Zap, Bell, Database,
  ShieldCheck, Crown, Sparkles, ArrowRight, MailQuestion,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface KPassTier {
  id: number;
  name: string;
  name_ko: string;
  monthly_price_usd: number;
  color: string;
  icon: string;
  sort_order: number;
}

type FeatureLine = { icon: typeof Flame; text: string };

// Feature copy keyed by sort_order (tier rank) so it survives DB renames.
// All copy is H1 / Discover era — slot caps, 30-day momentum, B2B export.
const tierFeatures: Record<number, FeatureLine[]> = {
  1: [
    { icon: Flame, text: "매일 24장 라운드 참여" },
    { icon: Zap, text: "일일 슬롯 7 (×1·1 / ×2·4 / ×4·2)" },
    { icon: Sparkles, text: "K-Cash 적립 + Spotify Premium 교환" },
  ],
  2: [
    { icon: Zap, text: "슬롯 캡 ×2 — 일일 14 actions" },
    { icon: BarChart3, text: "내 픽의 30일 trajectory 추적" },
    { icon: ShieldCheck, text: "광고 제거 / 빠른 정산 표시" },
    { icon: Sparkles, text: "Daily drip +20 💎 (×2)" },
  ],
  3: [
    { icon: Crown, text: "무제한 슬롯 — 24장 모두 가능" },
    { icon: BarChart3, text: "내 픽 30일 모멘텀 grade (A/B/C/D)" },
    { icon: Bell, text: "코호트 순위 변동 실시간 알림" },
    { icon: ShieldCheck, text: "정산 우선 처리 + 베타 기능 우선 체험" },
  ],
  4: [
    { icon: Database, text: "Trend API · 일 1,000 호출 (Pro Studio)" },
    { icon: BarChart3, text: "30일 아티스트별 모멘텀 export (CSV/JSON)" },
    { icon: Bell, text: "신규 떠오르는 아티스트 webhook 알림" },
    { icon: ShieldCheck, text: "Pro 모든 기능 포함" },
  ],
  5: [
    { icon: Crown, text: "Enterprise · 전담 매니저" },
    { icon: Database, text: "Predictive Dashboard 전체 access" },
    { icon: BarChart3, text: "라벨 / 브랜드 맞춤 분석 리포트 (월 1)" },
    { icon: Sparkles, text: "Studio 모든 기능 + 직접 컨설팅" },
  ],
};

// Tier accent — violet/sky family (matches H1 design tokens).
const tierAccent: Record<number, { ring: string; gradient: string; chip: string }> = {
  1: { ring: "ring-white/10",       gradient: "from-white/[0.04] to-white/[0.01]", chip: "bg-white/10 text-white/70" },
  2: { ring: "ring-violet-400/30",  gradient: "from-violet-500/10 to-violet-500/5", chip: "bg-violet-500/20 text-violet-200 border-violet-300/30" },
  3: { ring: "ring-purple-400/40",  gradient: "from-purple-500/15 to-fuchsia-500/5", chip: "bg-purple-500/25 text-purple-100 border-purple-300/40" },
  4: { ring: "ring-sky-400/35",     gradient: "from-sky-500/12 to-blue-500/5",      chip: "bg-sky-500/25 text-sky-100 border-sky-300/35" },
  5: { ring: "ring-amber-400/35",   gradient: "from-amber-500/12 to-orange-500/5",  chip: "bg-amber-500/20 text-amber-200 border-amber-300/40" },
};

export default function KPassPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromProfile = (location.state as any)?.fromProfile;
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["kpass-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpass_tiers")
        .select("id, name, name_ko, monthly_price_usd, color, icon, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as KPassTier[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: currentSub } = useQuery({
    queryKey: ["kpass-subscription", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("kpass_subscriptions")
        .select("tier_id, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=%2Fk-pass", { replace: true });
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <Loader2 className="w-6 h-6 animate-spin text-white/55" />
      </div>
    );
  }

  // Default active tier = Free (sort_order 1) when no DB subscription.
  const activeTierId = currentSub?.tier_id ?? tiers.find((t) => t.sort_order === 1)?.id;

  return (
    <>
      <SEO
        title="K-Pass — KTrenZ"
        titleKo="K-Pass — KTrenZ"
        description="Discover slot upgrades + 30-day momentum + B2B-lite API."
        descriptionKo="Discover 슬롯 확장 + 30일 모멘텀 + B2B API."
        path="/k-pass"
      />
      <main className="min-h-screen bg-neutral-950 text-white">
        {/* Sticky header */}
        <header className="sticky top-0 z-30 bg-black/65 backdrop-blur-xl border-b border-white/10">
          <div className="flex items-center h-12 px-3 max-w-lg mx-auto">
            <button
              onClick={() => fromProfile ? navigate("/", { state: { openProfile: true } }) : navigate(-1)}
              className="p-2 -ml-2 text-white/55 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center text-sm font-bold tracking-tight text-white">
              K-Pass
            </h1>
            <div className="w-9" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* Hero copy */}
          <div className="text-center mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              Discover를 <span className="bg-gradient-to-r from-violet-300 to-sky-300 bg-clip-text text-transparent">더 깊게</span>
            </h2>
            <p className="text-sm text-white/55 leading-relaxed max-w-md mx-auto">
              슬롯 확장 · 30일 모멘텀 · B2B-lite API.
              <br className="hidden sm:block" />
              팬덤이 진심이라면 K-Pass.
            </p>
          </div>

          {tiersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-white/45" />
            </div>
          ) : (
            <div className="space-y-4">
              {tiers.map((tier) => {
                const isActive = activeTierId === tier.id;
                const features = tierFeatures[tier.sort_order] ?? [];
                const accent = tierAccent[tier.sort_order] ?? tierAccent[1];
                const isFree = tier.monthly_price_usd === 0;
                const isEnterprise = tier.sort_order === 5;

                return (
                  <article
                    key={tier.id}
                    className={cn(
                      "relative rounded-2xl border bg-gradient-to-br p-5 ring-1 transition-all",
                      accent.gradient,
                      accent.ring,
                      isActive ? "border-white/25" : "border-white/10",
                    )}
                  >
                    {isActive && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-300/30 text-[10px] font-black uppercase tracking-wider">
                        <Check className="w-2.5 h-2.5" /> 사용 중
                      </span>
                    )}

                    {/* Header row */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 grid place-items-center text-2xl shrink-0">
                        {tier.icon || "💎"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-lg font-black text-white leading-tight">{tier.name}</h3>
                          <span className={cn("text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border", accent.chip)}>
                            T{tier.sort_order}
                          </span>
                        </div>
                        <p className="text-xs text-white/45 mt-0.5">{tier.name_ko}</p>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1.5 mb-4">
                      {isFree ? (
                        <span className="text-2xl font-black text-white">무료</span>
                      ) : isEnterprise ? (
                        <span className="text-lg font-black text-white">문의</span>
                      ) : (
                        <>
                          <span className="text-2xl font-black text-white tabular-nums">${tier.monthly_price_usd}</span>
                          <span className="text-xs text-white/55">/ 월</span>
                        </>
                      )}
                    </div>

                    {/* Feature list */}
                    <ul className="space-y-2 mb-5">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded-md bg-white/5 grid place-items-center shrink-0 mt-0.5">
                            <f.icon className="w-3.5 h-3.5 text-white/70" />
                          </div>
                          <span className="text-sm text-white/80 leading-relaxed">{f.text}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    {isActive ? (
                      <div className="flex items-center justify-center gap-1.5 py-2.5 text-sm text-emerald-300 font-bold">
                        <Check className="w-4 h-4" /> 사용 중
                      </div>
                    ) : isEnterprise ? (
                      <a
                        href="mailto:hello@ktrenz.com?subject=K-Pass Enterprise 문의"
                        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/15 border border-amber-300/30 text-amber-200 text-sm font-bold hover:from-amber-500/30 hover:to-orange-500/25 transition-colors"
                      >
                        <MailQuestion className="w-4 h-4" />
                        문의하기 <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        disabled
                        className="w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/45 text-sm font-bold cursor-not-allowed"
                      >
                        준비중
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* B2B link */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center mt-6">
            <p className="text-xs text-white/55 leading-relaxed mb-3">
              라벨·브랜드·에이전시는 별도 B2B 플랜 (Predictive Dashboard / API).
            </p>
            <button
              onClick={() => navigate("/pd")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-300 hover:text-violet-200"
            >
              B2B 자세히 보기 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <p className="text-center text-[10px] text-white/30 pt-1 tracking-wider">
            KTrenZ · K-Pass · © 2026
          </p>
        </div>
      </main>
    </>
  );
}
