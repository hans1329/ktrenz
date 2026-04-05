import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import { TrendingUp, Search, Brain, Gift, ShoppingBag, BarChart3, Zap, Target, Activity, Globe, Users, Award, Newspaper, Instagram, Youtube, Music, MessageCircle, Coffee, Store } from "lucide-react";
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


  const sources = [
    { icon: Newspaper, name: "Naver News & Blogs", color: "text-emerald-400" },
    { icon: Youtube, name: "YouTube", color: "text-red-400" },
    { icon: Instagram, name: "Instagram", color: "text-pink-400" },
    { icon: Music, name: "TikTok", color: "text-cyan-400" },
  ];

  const steps = [
    {
      icon: Search,
      titleKey: "about.step1Title",
      descKey: "about.step1Desc",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      icon: Brain,
      titleKey: "about.step2Title",
      descKey: "about.step2Desc",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: BarChart3,
      titleKey: "about.step3Title",
      descKey: "about.step3Desc",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      icon: TrendingUp,
      titleKey: "about.step4Title",
      descKey: "about.step4Desc",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      icon: Activity,
      titleKey: "about.step5Title",
      descKey: "about.step5Desc",
      color: "text-pink-400",
      bg: "bg-pink-500/10",
    },
    {
      icon: Gift,
      titleKey: "about.step6Title",
      descKey: "about.step6Desc",
      color: "text-violet-400",
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
        description="KTrenZ detects trending keywords from 600+ K-Pop artists across news, social media, and video platforms — then scores, grades, and lets fans predict what's next."
        descriptionKo="KTrenZ는 600명 이상의 K-Pop 아티스트에서 뉴스, 소셜 미디어, 동영상 플랫폼의 트렌드 키워드를 감지하고 스코어링·등급 평가한 뒤, 팬이 다음 트렌드를 예측할 수 있게 합니다."
        path="/about"
        type="website"
        jsonLd={jsonLd}
      />

      <div className="min-h-screen bg-background">
        <V3Header />

        {/* Hero — clean dark */}
        <section className="relative overflow-hidden bg-zinc-950">
          {/* Subtle gradient orbs */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/6 rounded-full blur-3xl" />

          <div className="relative max-w-4xl mx-auto text-center px-4 pt-24 pb-16 md:pt-32 md:pb-24 space-y-5">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-700">
              <Zap className="w-3.5 h-3.5 text-primary" />
              {t("about.badge")}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-50 leading-tight tracking-tight whitespace-pre-line">
              {t("about.heroTitle")}
            </h1>
            <p className="text-sm md:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              {t("about.heroDesc")}
            </p>
            <Button
              size="lg"
              className="mt-2 rounded-full px-8"
              onClick={() => navigate("/")}
            >
              <Target className="w-4 h-4 mr-2" />
              {t("about.cta")}
            </Button>
          </div>
        </section>


        {/* Data Sources */}
        <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel1")}</span>
          <h2 className="text-xl md:text-3xl font-bold text-foreground leading-snug mt-2 mb-3">
            {t("about.section1Title")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-8">
            {t("about.section1Desc")}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sources.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <span className="text-xs font-semibold text-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Analysis Engine */}
        <section className="bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel2")}</span>
            <h2 className="text-xl md:text-3xl font-bold text-foreground leading-snug mt-2 mb-3">
              {t("about.section2Title")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-8">
              {t("about.section2Desc")}
            </p>
            {/* Grade progression */}
            <div className="flex flex-wrap gap-2">
              {["Spark", "Rising", "Hot", "Viral", "Mega", "Explosive"].map((grade, i) => (
                <div key={grade} className="flex items-center gap-1.5">
                  <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-card border border-border text-foreground">
                    {grade}
                  </span>
                  {i < 5 && <span className="text-muted-foreground text-xs">→</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works — 6 steps */}
        <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <h2 className="text-xl md:text-3xl font-bold text-foreground text-center mb-3">
            {t("about.howTitle")}
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-10 max-w-xl mx-auto">
            {t("about.howSubtitle")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, i) => (
              <article
                key={i}
                className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-10 h-10 rounded-lg ${step.bg} flex items-center justify-center`}>
                    <step.icon className={`w-5 h-5 ${step.color}`} />
                  </div>
                  <div className="space-y-1 min-w-0">
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

        {/* Fan Economy */}
        <section className="bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{t("about.sectionLabel3")}</span>
            <h2 className="text-xl md:text-3xl font-bold text-foreground leading-snug mt-2 mb-3">
              {t("about.section3Title")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {t("about.section3Desc")}
            </p>
          </div>
        </section>

        {/* Differentiators */}
        <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <h2 className="text-xl md:text-3xl font-bold text-foreground text-center mb-10">
            {t("about.valueTitle")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
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
        <section className="bg-zinc-900 py-14 px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
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
