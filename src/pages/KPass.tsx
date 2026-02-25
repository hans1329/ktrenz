import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft, Loader2, Crown } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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

const KPassPage = () => {
  const navigate = useNavigate();
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
       <SEO title="K-Pass Membership – KTrenZ" description="Unlock premium K-Pop trend data with K-Pass. Get deeper analytics, priority alerts, and ad-free experience." path="/k-pass" />
      
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="flex-1 text-center font-bold text-lg">{t("kpass.title")}</h1>
            <LanguageSwitcher />
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Current status */}
          {currentSub && (
            <div className="text-center text-sm text-muted-foreground mb-2">
              {t("kpass.currentPlan")} <span className="text-foreground font-semibold">
                {tiers.find(t => t.id === currentSub.tier_id)?.icon}{" "}
                {tiers.find(t => t.id === currentSub.tier_id)?.name}
              </span>
            </div>
          )}

          {/* Tier cards */}
          {tiers.map((tier) => {
            const isActive = currentSub?.tier_id === tier.id;
            return (
              <div
                key={tier.id}
                className={cn(
                  "relative rounded-2xl border p-5 transition-all",
                  isActive
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                {isActive && (
                  <div className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                    {t("common.current")}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{tier.icon}</span>
                    <div>
                      <p className="font-bold text-foreground">{tier.name}</p>
                      <p className="text-xs text-muted-foreground">{tier.name_ko}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {tier.monthly_price_usd === 0 ? (
                      <p className="font-bold text-foreground">{t("common.free")}</p>
                    ) : (
                      <>
                        <p className="font-bold text-foreground">${tier.monthly_price_usd}</p>
                        <p className="text-[10px] text-muted-foreground">{t("kpass.perMonth")}</p>
                      </>
                    )}
                  </div>
                </div>

                {!isActive && tier.monthly_price_usd > 0 && (
                  <Button
                    className="w-full mt-4 rounded-full h-10 text-sm font-medium"
                    variant={tier.id >= 4 ? "default" : "outline"}
                    disabled
                  >
                    {t("common.comingSoon")}
                  </Button>
                )}
                {isActive && (
                  <div className="flex items-center justify-center gap-1.5 mt-4 text-sm text-primary font-medium">
                    <Check className="w-4 h-4" /> {t("common.active")}
                  </div>
                )}
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
