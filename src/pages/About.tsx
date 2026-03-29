import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import { TrendingUp, Search, Brain, Gift, ShoppingBag, BarChart3, Zap, Target, Activity, Globe, Users, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import aboutHero from "@/assets/about-hero.jpg";
import aboutDetection from "@/assets/about-detection.jpg";
import aboutScoring from "@/assets/about-scoring.jpg";
import aboutRewards from "@/assets/about-rewards.jpg";

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

  const stats = [
    { value: "500+", labelKey: "about.statKeywords" },
    { value: "24/7", labelKey: "about.statTracking" },
    { value: "6", labelKey: "about.statGrades" },
    { value: "100K+", labelKey: "about.statDataPoints" },
  ];

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
      icon: Activity,
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

  const differentiators = [
    { icon: Globe, titleKey: "about.diffMultiSource", descKey: "about.diffMultiSourceDesc" },
    { icon: Brain, titleKey: "about.diffSmartScoring", descKey: "about.diffSmartScoringDesc" },
    { icon: Users, titleKey: "about.diffFanFirst", descKey: "about.diffFanFirstDesc" },
    { icon: Award, titleKey: "about.diffRewards", descKey: "about.diffRewardsDesc" },
  ];

  return (
    <>
      <SEO
        title="About KTrenZ — K-Pop Trend Intelligence Platform"
        titleKo="KTrenZ 소개 — K-Pop 트렌드 인텔리전스 플랫폼"
        description="KTrenZ tracks K-Pop star trends via keyword scoring, real-time tracking, prediction, and rewards fans with points redeemable for goods."
        descriptionKo="KTrenZ는 K-Pop 스타의 트렌드를 키워드 스코어링, 실시간 추적, 예측으로 분석하고 팬에게 굿즈 교환 가능한 포인트를 제공합니다."
        path="/about"
        type="website"
        jsonLd={jsonLd}
      />

      <div className="min-h-screen bg-background">
        <V3Header />

        {/* Hero with image */}
        <section className="relative overflow-hidden min-h-[420px] md:min-h-[520px]">
          <div className="absolute inset-0">
            <img src={aboutHero} alt="K-Pop concert with light sticks" className="w-full h-full object-cover" width={1920} height={960} />
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>
          <div className="relative max-w-4xl mx-auto text-center px-4 pt-28 pb-20 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-semibold border border-white/20">
              <Zap className="w-3.5 h-3.5" />
              {t("about.badge")}
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight whitespace-pre-line drop-shadow-lg">
              {t("about.heroTitle")}
            </h1>
            <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed drop-shadow-md">
              {t("about.heroDesc")}
            </p>
            <Button
              size="lg"
              className="mt-4 rounded-full px-8 bg-white/15 border border-white/25 text-white hover:bg-white/25 backdrop-blur-sm"
              onClick={() => navigate("/")}
            >
              <Target className="w-4 h-4 mr-2" />
              {t("about.cta")}
            </Button>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {stats.map((stat, i) => (
              <div key={i} className="py-6 text-center">
                <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{t(stat.labelKey)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 1: Detection — image left, text right */}
        <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
              <img src={aboutDetection} alt="Multi-source keyword detection" className="w-full h-auto" loading="lazy" width={1280} height={720} />
            </div>
            <div className="space-y-4">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel1")}</span>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-snug">
                {t("about.section1Title")}
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {t("about.section1Desc")}
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Scoring — text left, image right */}
        <section className="bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div className="space-y-4 md:order-1">
                <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel2")}</span>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-snug">
                  {t("about.section2Title")}
                </h2>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {t("about.section2Desc")}
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-border shadow-lg md:order-2">
                <img src={aboutScoring} alt="Trend scoring dashboard" className="w-full h-auto" loading="lazy" width={1280} height={720} />
              </div>
            </div>
          </div>
        </section>

        {/* How It Works — 6 steps */}
        <section className="max-w-5xl mx-auto px-4 py-16 md:py-24">
          <h2 className="text-xl md:text-3xl font-bold text-foreground text-center mb-4">
            {t("about.howTitle")}
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            {t("about.howSubtitle")}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, i) => (
              <article
                key={i}
                className="group relative rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-11 h-11 rounded-xl ${step.bg} flex items-center justify-center`}>
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

        {/* Section 3: Rewards — image + text */}
        <section className="bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div className="rounded-2xl overflow-hidden border border-border shadow-lg">
                <img src={aboutRewards} alt="K-Points rewards system" className="w-full h-auto" loading="lazy" width={1280} height={720} />
              </div>
              <div className="space-y-4">
                <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel3")}</span>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-snug">
                  {t("about.section3Title")}
                </h2>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {t("about.section3Desc")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Differentiators */}
        <section className="max-w-5xl mx-auto px-4 py-16 md:py-24">
          <h2 className="text-xl md:text-3xl font-bold text-foreground text-center mb-12">
            {t("about.valueTitle")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {differentiators.map((d, i) => (
              <div key={i} className="flex gap-4 p-5 rounded-xl border border-border bg-card">
                <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <d.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-1">{t(d.titleKey)}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t(d.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent py-16 px-4">
          <div className="max-w-3xl mx-auto text-center space-y-5">
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {t("about.ctaTitle")}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {t("about.ctaDesc")}
            </p>
            <Button size="lg" className="rounded-full px-10" onClick={() => navigate("/")}>
              {t("about.cta")}
            </Button>
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
