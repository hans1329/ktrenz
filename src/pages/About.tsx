import { useLanguage } from "@/contexts/LanguageContext";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import { TrendingUp, Search, Brain, Gift, ShoppingBag, BarChart3, Zap, Target, Activity, Globe, Users, Award, Newspaper, Instagram, Youtube, Music, MessageCircle, Coffee, Store, Ticket, Crosshair, Trophy, Headphones, Megaphone, Building2, HelpCircle, ChevronDown } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import SamplePredictionCards from "@/components/about/SamplePredictionCards";
import HeroSignalCanvas from "@/components/about/HeroSignalCanvas";
import { useState } from "react";


const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-foreground pr-4">{question}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};


const About = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const faqs = [
    { q: "about.faq1Q", a: "about.faq1A" },
    { q: "about.faq2Q", a: "about.faq2A" },
    { q: "about.faq3Q", a: "about.faq3A" },
    { q: "about.faq4Q", a: "about.faq4A" },
    { q: "about.faq5Q", a: "about.faq5A" },
    { q: "about.faq6Q", a: "about.faq6A" },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: t(f.q),
      acceptedAnswer: { "@type": "Answer", text: t(f.a) },
    })),
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "KTrenZ",
      url: "https://ktrenz.com",
      description: "Real-time K-Pop trend intelligence platform — keyword-centric scoring, tracking & prediction with fan rewards.",
      logo: "https://ktrenz.com/placeholder.svg",
      sameAs: [],
      foundingDate: "2025",
      knowsAbout: ["K-Pop", "Trend Analysis", "Fan Intelligence", "Music Industry Analytics"],
    },
    faqJsonLd,
  ];


  const sources = [
    { icon: Newspaper, name: "Naver News & Blogs", color: "text-emerald-400" },
    { icon: Youtube, name: "YouTube", color: "text-red-400" },
    { icon: Instagram, name: "Instagram", color: "text-pink-400" },
    { icon: Music, name: "TikTok", color: "text-cyan-400" },
    { icon: MessageCircle, name: "Reddit", color: "text-orange-400" },
    { icon: Coffee, name: "Naver Cafe", color: "text-green-400" },
    { icon: Store, name: "Commerce Data", color: "text-amber-400" },
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
      icon: ShoppingBag,
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
    { icon: Megaphone, titleKey: "about.diffBrandAgency", descKey: "about.diffBrandAgencyDesc" },
    { icon: Building2, titleKey: "about.diffEntertainment", descKey: "about.diffEntertainmentDesc" },
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
        jsonLd={jsonLd as any}
      />
      <div className="min-h-screen bg-background">
        <div className="relative">
          <V3Header hideSpotify />
          <div className="absolute top-3 right-14 z-50">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Hero — clean dark */}
        <section className="relative overflow-hidden bg-zinc-950">
          {/* Animated signal lines */}
          <HeroSignalCanvas />
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
              onClick={() => navigate("/login")}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-10">
              {t("about.section2Desc")}
            </p>

            {/* Grade progression — clean horizontal bar */}
            <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grade Progression</span>
              </div>

              {/* Grade steps */}
              <div className="space-y-2.5">
                {[
                  { grade: "Spark", desc: "about.gradeSpark", pct: 12 },
                  { grade: "Rising", desc: "about.gradeRising", pct: 28 },
                  { grade: "Hot", desc: "about.gradeHot", pct: 48 },
                  { grade: "Viral", desc: "about.gradeViral", pct: 68 },
                  { grade: "Mega", desc: "about.gradeMega", pct: 85 },
                  { grade: "Explosive", desc: "about.gradeExplosive", pct: 100 },
                ].map((g) => (
                  <div key={g.grade} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-semibold text-foreground">{g.grade}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                        style={{ width: `${g.pct}%` }}
                      />
                    </div>
                    <span className="w-32 shrink-0 text-[10px] text-muted-foreground hidden sm:block">{t(g.desc)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Score types */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Activity, label: "about.scoreTrend", color: "text-primary" },
                { icon: TrendingUp, label: "about.scoreInfluence", color: "text-emerald-400" },
                { icon: Zap, label: "about.scoreMomentum", color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-xl border border-border bg-card">
                  <s.icon className={`w-4 h-4 ${s.color} shrink-0`} />
                  <span className="text-[11px] text-muted-foreground font-medium">{t(s.label)}</span>
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
                <div className={`w-10 h-10 rounded-lg ${step.bg} flex items-center justify-center mb-3`}>
                  <step.icon className={`w-5 h-5 ${step.color}`} />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                  Step {i + 1}
                </span>
                <h3 className="text-sm font-bold text-foreground leading-snug mt-1 mb-1.5">
                  {t(step.titleKey)}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(step.descKey)}
                </p>
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
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-10">
              {t("about.section3Desc")}
            </p>

            {/* Free reward loop */}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: Ticket, titleKey: "about.fanLoop1Title", descKey: "about.fanLoop1Desc", color: "text-emerald-400", bg: "bg-emerald-500/10", step: 1 },
                { icon: Crosshair, titleKey: "about.fanLoop2Title", descKey: "about.fanLoop2Desc", color: "text-blue-400", bg: "bg-blue-500/10", step: 2 },
                { icon: Trophy, titleKey: "about.fanLoop3Title", descKey: "about.fanLoop3Desc", color: "text-amber-400", bg: "bg-amber-500/10", step: 3 },
                { icon: Headphones, titleKey: "about.fanLoop4Title", descKey: "about.fanLoop4Desc", color: "text-pink-400", bg: "bg-pink-500/10", step: 4 },
              ].map((item) => (
                <article key={item.step} className="rounded-xl border border-border bg-card p-5">
                  <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center mb-3`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                    Step {item.step}
                  </span>
                  <h3 className="text-sm font-bold text-foreground leading-snug mt-1 mb-1.5">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(item.descKey)}
                  </p>
                </article>
              ))}
            </div>

            {/* Sample prediction cards */}
            <SamplePredictionCards />
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

        {/* GEO: What is KTrenZ — definition paragraph for AI crawlers */}
        <section className="bg-muted/30">
          <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
            <h2 className="text-xl md:text-3xl font-bold text-foreground mb-4">
              {t("about.whatIsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl mb-6">
              {t("about.whatIsDesc")}
            </p>

            {/* Key stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
              {[
                { value: "5,000+", labelKey: "about.stat1" },
                { value: "10+", labelKey: "about.stat2" },
                { value: "6", labelKey: "about.stat3" },
                { value: "24/7", labelKey: "about.stat4" },
              ].map((stat) => (
                <div key={stat.labelKey} className="text-center p-4 rounded-xl border border-border bg-card">
                  <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{t(stat.labelKey)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GEO: FAQ Section */}
        <section className="max-w-5xl mx-auto px-4 py-14 md:py-20">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">FAQ</span>
          </div>
          <h2 className="text-xl md:text-3xl font-bold text-foreground mb-8">
            {t("about.faqTitle")}
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FaqItem key={i} question={t(faq.q)} answer={t(faq.a)} />
            ))}
          </div>
        </section>

        <section className="bg-zinc-900 py-14 px-4">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-primary-foreground">
              {t("about.ctaTitle")}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {t("about.ctaDesc")}
            </p>
            <Button size="lg" className="rounded-full px-10" onClick={() => navigate("/login")}>
              <Target className="w-4 h-4 mr-2" />
              {t("about.cta")}
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-4 text-center text-xs text-muted-foreground space-y-2">
          <div className="flex items-center justify-center gap-3">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <span>·</span>
            <a href="/terms" className="hover:text-foreground transition-colors">Terms of Service</a>
          </div>
          <p>© {new Date().getFullYear()} KTrenZ. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
};

export default About;
