import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SEO from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft, Loader2, Star, Zap, Shield, BarChart3 } from "lucide-react";
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

/* ── tier별 feature 목록 ── */
const tierFeatures: Record<number, { icon: typeof Star; text: string }[]> = {
  1: [
    { icon: BarChart3, text: "기본 트렌드 랭킹 조회" },
    { icon: Star, text: "최대 3명 아티스트 관심 등록" },
    { icon: Zap, text: "Fan Agent 일 3회 사용" },
  ],
  2: [
    { icon: BarChart3, text: "상세 트렌드 분석 리포트" },
    { icon: Star, text: "최대 10명 아티스트 관심 등록" },
    { icon: Zap, text: "Fan Agent 무제한" },
    { icon: Shield, text: "광고 제거" },
  ],
  3: [
    { icon: BarChart3, text: "실시간 에너지 스코어 알림" },
    { icon: Star, text: "무제한 아티스트 관심 등록" },
    { icon: Zap, text: "스트리밍 가이드 AI 생성" },
    { icon: Shield, text: "우선 데이터 접근" },
  ],
  4: [
    { icon: BarChart3, text: "API 접근 (개발자용)" },
    { icon: Star, text: "커뮤니티 전용 채널" },
    { icon: Zap, text: "모든 Pro 기능 포함" },
    { icon: Shield, text: "전용 서포트" },
  ],
  5: [
    { icon: BarChart3, text: "1:1 전담 매니저" },
    { icon: Star, text: "오프라인 이벤트 초대" },
    { icon: Zap, text: "모든 Premium 기능 포함" },
    { icon: Shield, text: "얼리 액세스 기능 우선 체험" },
  ],
};

const tierGradients: Record<number, string> = {
  1: "from-slate-400/20 to-slate-500/5",
  2: "from-blue-400/20 to-blue-500/5",
  3: "from-purple-400/20 to-purple-500/5",
  4: "from-amber-400/20 to-amber-500/5",
  5: "from-red-400/20 to-red-500/5",
};

const KPassPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromProfile = (location.state as any)?.fromProfile;
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const { data: tiers = [] } = useQuery({
    queryKey: ["kpass-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpass_tiers")
        .select("id, name, name_ko, monthly_price_usd, color, icon, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as KPassTier[];
    },
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
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <SEO title="K-Pass Membership – KTrenZ" description="Unlock premium K-Pop trend data with K-Pass." path="/kpass" />

      <div className="min-h-screen bg-background pb-24">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <button onClick={() => fromProfile ? navigate("/", { state: { openProfile: true } }) : navigate(-1)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center font-bold text-lg">{t("kpass.title")}</h1>
            <div className="w-9" />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
          {/* Current status */}
          {currentSub && (
            <div className="text-center text-sm text-muted-foreground mb-1">
              {t("kpass.currentPlan")}{" "}
              <span className="text-foreground font-semibold">
                {tiers.find((ti) => ti.id === currentSub.tier_id)?.icon}{" "}
                {tiers.find((ti) => ti.id === currentSub.tier_id)?.name}
              </span>
            </div>
          )}

          {/* ── Ticket Cards ── */}
          {tiers.map((tier) => {
            const isActive = currentSub?.tier_id === tier.id;
            const features = tierFeatures[tier.id] || [];
            const gradient = tierGradients[tier.id] || "from-muted/20 to-transparent";

            return (
              <div key={tier.id} className="relative">
                {/* Ticket body */}
                <div
                  className={cn(
                    "relative rounded-2xl border overflow-hidden transition-all",
                    isActive
                      ? "border-primary shadow-lg shadow-primary/15"
                      : "border-border"
                  )}
                >
                  {/* Top section – gradient bg */}
                  <div className={cn("bg-gradient-to-br p-5 pb-4", gradient)}>
                    {isActive && (
                      <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                        {t("common.current")}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-background/80 flex items-center justify-center text-2xl shadow-sm">
                        {tier.icon}
                      </div>
                      <div>
                        <p className="font-bold text-lg text-foreground leading-tight">{tier.name}</p>
                        <p className="text-xs text-muted-foreground">{tier.name_ko}</p>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1">
                      {tier.monthly_price_usd === 0 ? (
                        <span className="text-2xl font-black text-foreground">{t("common.free")}</span>
                      ) : (
                        <>
                          <span className="text-2xl font-black text-foreground">${tier.monthly_price_usd}</span>
                          <span className="text-sm text-muted-foreground">{t("kpass.perMonth")}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dashed divider with notches */}
                  <div className="relative h-0">
                    <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-background" />
                    <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-background" />
                    <div className="border-t border-dashed border-border mx-5" />
                  </div>

                  {/* Bottom section – features */}
                  <div className="p-5 pt-4 bg-card/50">
                    <div className="space-y-2.5">
                      {features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-md bg-muted/80 flex items-center justify-center shrink-0">
                            <f.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <span className="text-sm text-foreground/90">{f.text}</span>
                        </div>
                      ))}
                    </div>

                    {isActive ? (
                      <div className="flex items-center justify-center gap-1.5 mt-4 text-sm text-primary font-medium">
                        <Check className="w-4 h-4" /> {t("common.active")}
                      </div>
                    ) : tier.monthly_price_usd > 0 ? (
                      <Button
                        className="w-full mt-4 rounded-full h-10 text-sm font-medium"
                        variant={tier.id >= 4 ? "default" : "outline"}
                        disabled
                      >
                        {t("common.comingSoon")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          <p className="text-center text-xs text-muted-foreground pt-2">
            {t("kpass.premiumSoon")}
          </p>
        </div>
      </div>
    </>
  );
};

export default KPassPage;
