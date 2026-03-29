import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import { V3Header } from "@/components/v3/V3Header";
import { TrendingUp, Search, Brain, Gift, ShoppingBag, BarChart3, Zap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const About = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KTrenZ",
    url: "https://ktrenz.lovable.app",
    description: "Real-time K-Pop trend intelligence platform — keyword-centric scoring, tracking & prediction with fan rewards.",
    logo: "https://ktrenz.lovable.app/placeholder.svg",
    sameAs: [],
    foundingDate: "2025",
    knowsAbout: ["K-Pop", "Trend Analysis", "Fan Intelligence", "Music Industry Analytics"],
  };

  const steps = [
    {
      icon: Search,
      titleKey: "about.step1Title",
      descKey: "about.step1Desc",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      icon: BarChart3,
      titleKey: "about.step2Title",
      descKey: "about.step2Desc",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: TrendingUp,
      titleKey: "about.step3Title",
      descKey: "about.step3Desc",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      icon: Brain,
      titleKey: "about.step4Title",
      descKey: "about.step4Desc",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      icon: Gift,
      titleKey: "about.step5Title",
      descKey: "about.step5Desc",
      color: "text-pink-500",
      bg: "bg-pink-500/10",
    },
    {
      icon: ShoppingBag,
      titleKey: "about.step6Title",
      descKey: "about.step6Desc",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <>
      <SEO
        title="About KTrenZ — K-Pop Trend Intelligence Platform"
        titleKo="KTrenZ 소개 — K-Pop 트렌드 인텔리전스 플랫폼"
        description="KTrenZ tracks K-Pop star trends via keyword scoring, AI prediction, and rewards fans with points redeemable for goods."
        descriptionKo="KTrenZ는 K-Pop 스타의 트렌드를 키워드 스코어링, AI 예측으로 추적하고 팬에게 굿즈 교환 가능한 포인트를 제공합니다."
        path="/about"
        type="website"
        jsonLd={jsonLd}
      />

      <div className="min-h-screen bg-background">
        <V3Header />

        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-16 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5" />
          <div className="relative max-w-3xl mx-auto text-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Zap className="w-3.5 h-3.5" />
              {t("about.badge")}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground leading-tight tracking-tight">
              {t("about.heroTitle")}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              {t("about.heroDesc")}
            </p>
            <Button
              size="lg"
              className="mt-4 rounded-full px-8"
              onClick={() => navigate("/")}
            >
              <Target className="w-4 h-4 mr-2" />
              {t("about.cta")}
            </Button>
          </div>
        </section>

        {/* How It Works */}
        <section className="max-w-4xl mx-auto px-4 pb-20">
          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center mb-10">
            {t("about.howTitle")}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, i) => (
              <article
                key={i}
                className="group relative rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start gap-3.5">
                  <div className={`shrink-0 w-10 h-10 rounded-xl ${step.bg} flex items-center justify-center`}>
                    <step.icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                      Step {i + 1}
                    </span>
                    <h3 className="text-sm font-bold text-foreground leading-snug">
                      {t(step.titleKey)}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(step.descKey)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Value Prop */}
        <section className="bg-muted/50 py-16 px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {t("about.valueTitle")}
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-xl mx-auto">
              {t("about.valueDesc")}
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} KTrenZ. All rights reserved.
        </footer>
      </div>
    </>
  );
};

export default About;
