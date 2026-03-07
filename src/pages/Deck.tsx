import SEO from "@/components/SEO";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Flame, Activity, BarChart3, Zap, Bot, Sparkles,
  TrendingUp, Eye, Radio, Target, Shield, ArrowRight,
  Music, Globe, Users, Database, Layers, Crown,
  MessageSquare, Gift, Rocket, ChevronRight, Star,
  ExternalLink, LineChart, Megaphone, Brain, Lock
} from "lucide-react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";

/* ─────── Reusable components ─────── */
const Section = ({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) => (
  <section
    id={id}
    className={`relative px-5 py-16 md:py-24 ${className}`}
  >
    <div className="max-w-5xl mx-auto">{children}</div>
  </section>
);

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/15 text-primary border border-primary/20 mb-4">
    {children}
  </span>
);

const FeatureCard = ({
  icon: Icon,
  title,
  desc,
  accent = false,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  accent?: boolean;
}) => (
  <div
    className={`rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-0.5 ${
      accent
        ? "bg-primary/10 border-primary/30 hover:border-primary/50"
        : "bg-card border-border hover:border-primary/30"
    }`}
  >
    <Icon className="w-6 h-6 text-primary mb-3" />
    <h4 className="font-semibold text-foreground text-sm mb-1">{title}</h4>
    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
  </div>
);

const StatCard = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center p-4">
    <div className="text-2xl md:text-3xl font-bold text-primary mb-1">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);

const TableRow = ({ cells, isHeader = false }: { cells: string[]; isHeader?: boolean }) => (
  <tr className={isHeader ? "border-b border-border" : "border-b border-border/50 hover:bg-muted/30"}>
    {cells.map((cell, i) => (
      isHeader
        ? <th key={i} className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-3 px-3 first:pl-0">{cell}</th>
        : <td key={i} className="text-sm text-foreground py-3 px-3 first:pl-0">{cell}</td>
    ))}
  </tr>
);

const Deck = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <>
      <SEO title="K·TRENZ – Service Deck" description="AI-Powered Fan Energy Intelligence Platform for K-POP" />

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {/* Language switcher */}
        <div className="fixed top-4 right-4 z-50">
          <LanguageSwitcher />
        </div>
        {/* ═══════════ HERO ═══════════ */}
        <section className="relative min-h-[85vh] flex items-center justify-center px-5 py-20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(11_100%_46%/0.08)_0%,transparent_70%)]" />
          <div className="relative text-center max-w-3xl mx-auto">
            <img src={ktrenzLogo} alt="K·TRENZ" className="h-10 md:h-14 mx-auto mb-8" />
            <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-4">
              {t("deck.subtitle")}
            </p>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6 text-foreground">
              {t("deck.heroTitle1")}
              <br />
              <span className="text-primary">{t("deck.heroTitle2")}</span>
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10">
              {t("deck.heroDesc")}
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
              >
                {t("deck.openEnergyMap")} <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#product"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-medium text-sm hover:bg-muted transition"
              >
                {t("deck.learnMore")}
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════ VISION ═══════════ */}
        <Section id="vision" className="border-t border-border/50">
          <SectionTag><Eye className="w-3.5 h-3.5" /> {t("deck.vision")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {t("deck.visionTitle")}
          </h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed mb-8">
            {t("deck.visionDesc")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard icon={Megaphone} title={t("deck.megaphone")} desc={t("deck.megaphoneDesc")} accent />
            <FeatureCard icon={Radio} title={t("deck.amplifier")} desc={t("deck.amplifierDesc")} accent />
            <FeatureCard icon={ExternalLink} title={t("deck.gateway")} desc={t("deck.gatewayDesc")} accent />
          </div>
        </Section>

        {/* ═══════════ PROBLEM & OPPORTUNITY ═══════════ */}
        <Section id="problem" className="border-t border-border/50">
          <SectionTag><Target className="w-3.5 h-3.5" /> {t("deck.problem")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.problemTitle")}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left">
              <thead>
                <TableRow isHeader cells={[t("deck.fanNeed"), t("deck.currentProblem"), t("deck.ktrenzSolution")]} />
              </thead>
              <tbody>
                <TableRow cells={[t("deck.belonging"), t("deck.belongingProblem"), t("deck.belongingSolution")]} />
                <TableRow cells={[t("deck.accuracy"), t("deck.accuracyProblem"), t("deck.accuracySolution")]} />
                <TableRow cells={[t("deck.timeMgmt"), t("deck.timeMgmtProblem"), t("deck.timeMgmtSolution")]} />
                <TableRow cells={[t("deck.language"), t("deck.languageProblem"), t("deck.languageSolution")]} />
                <TableRow cells={[t("deck.archive"), t("deck.archiveProblem"), t("deck.archiveSolution")]} />
              </tbody>
            </table>
          </div>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 bg-card rounded-xl border border-border p-6">
            <StatCard value="$13B+" label={t("deck.globalMarket")} />
            <StatCard value="300M+" label={t("deck.fansWorldwide")} />
            <StatCard value="Dual" label={t("deck.dualRevenue")} />
            <StatCard value="All" label={t("deck.allArtists")} />
          </div>
        </Section>

        {/* ═══════════ PRODUCT OVERVIEW ═══════════ */}
        <Section id="product" className="border-t border-border/50">
          <SectionTag><Layers className="w-3.5 h-3.5" /> {t("deck.product")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.fourPillars")}
          </h2>

          {/* Energy Map */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">{t("deck.energyMap")}</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              {t("deck.energyMapDesc")}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">📊</div>
                <div className="text-xs text-muted-foreground">{t("deck.blockSize")}</div>
              </div>
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">🔴🟢</div>
                <div className="text-xs text-muted-foreground">{t("deck.colorTrend")}</div>
              </div>
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">🔥</div>
                <div className="text-xs text-muted-foreground">{t("deck.flameSurge")}</div>
              </div>
            </div>
          </div>

          {/* Mission System */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">{t("deck.missionSystem")}</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              {t("deck.missionDesc")}
            </p>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <Sparkles className="w-4 h-4 text-primary" /> {t("deck.howItWorks")}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { step: "1", label: t("deck.step1Label"), desc: t("deck.step1Desc") },
                  { step: "2", label: t("deck.step2Label"), desc: t("deck.step2Desc") },
                  { step: "3", label: t("deck.step3Label"), desc: t("deck.step3Desc") },
                  { step: "4", label: t("deck.step4Label"), desc: t("deck.step4Desc") },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-7 h-7 shrink-0 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">{s.step}</div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Agent */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">{t("deck.aiAgent")}</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              {t("deck.aiAgentDesc")}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FeatureCard icon={Star} title={t("deck.biasArtist")} desc={t("deck.biasArtistDesc")} />
              <FeatureCard icon={MessageSquare} title={t("deck.smartChat")} desc={t("deck.smartChatDesc")} />
              <FeatureCard icon={TrendingUp} title={t("deck.realtimeAlerts")} desc={t("deck.realtimeAlertsDesc")} />
              <FeatureCard icon={LineChart} title={t("deck.analysis")} desc={t("deck.analysisDesc")} />
            </div>
          </div>

          {/* Activity Dashboard */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">{t("deck.activityDashboard")}</h3>
            </div>
            <p className="text-muted-foreground max-w-3xl">
              {t("deck.activityDashboardDesc")}
            </p>
          </div>
        </Section>

        {/* ═══════════ K-POINTS ECONOMY ═══════════ */}
        <Section id="economy" className="border-t border-border/50">
          <SectionTag><Gift className="w-3.5 h-3.5" /> {t("deck.kpointsEconomy")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.kpointsTitle")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> {t("deck.earn")}
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.earnLogin")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.earnMission")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.earnNote")}</li>
              </ul>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> {t("deck.spend")}
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.spendAgent")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.spendSlots")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.spendFuture")}</li>
              </ul>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" /> {t("deck.kpass")}
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.kpassFree")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.kpassPremium")}</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {t("deck.kpassPricing")}</li>
              </ul>
            </div>
          </div>

          {/* IAP Packages */}
          <h3 className="text-lg font-semibold mb-4">{t("deck.purchasePackages")}</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: "Starter", points: "100P", price: "$1.00", bonus: "" },
              { name: "Popular", points: "600P", price: "$5.00", bonus: "+20%" },
              { name: "Best Value", points: "1,500P", price: "$10.00", bonus: "+50%" },
            ].map(pkg => (
              <div key={pkg.name} className={`rounded-xl border p-4 text-center ${pkg.bonus ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
                {pkg.bonus && <div className="text-xs font-bold text-primary mb-1">{pkg.bonus} BONUS</div>}
                <div className="text-lg font-bold text-foreground">{pkg.points}</div>
                <div className="text-xs text-muted-foreground mb-1">{pkg.name}</div>
                <div className="text-sm font-semibold text-foreground">{pkg.price}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════ BUSINESS MODEL ═══════════ */}
        <Section id="business" className="border-t border-border/50">
          <SectionTag><BarChart3 className="w-3.5 h-3.5" /> {t("deck.business")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.businessTitle")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* B2C */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> {t("deck.b2cRevenue")}
              </h3>
              <div className="space-y-3">
                {[
                  { label: t("deck.b2cIap"), desc: t("deck.b2cIapDesc") },
                  { label: t("deck.b2cKpass"), desc: t("deck.b2cKpassDesc") },
                  { label: t("deck.b2cSlots"), desc: t("deck.b2cSlotsDesc") },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* B2B */}
            <div className="bg-card border border-primary/30 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" /> {t("deck.b2bRevenue")}
              </h3>
              <div className="space-y-3">
                {[
                  { label: t("deck.b2bSuperAgent"), desc: t("deck.b2bSuperAgentDesc") },
                  { label: t("deck.b2bSponsored"), desc: t("deck.b2bSponsoredDesc") },
                  { label: t("deck.b2bBonus"), desc: t("deck.b2bBonusDesc") },
                  { label: t("deck.b2bData"), desc: t("deck.b2bDataDesc") },
                  { label: t("deck.b2bConnection"), desc: t("deck.b2bConnectionDesc") },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ═══════════ DATA MOAT ═══════════ */}
        <Section id="moat" className="border-t border-border/50">
          <SectionTag><Shield className="w-3.5 h-3.5" /> {t("deck.dataMoat")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {t("deck.dataMoatTitle")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            {t("deck.dataMoatDesc")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-card border border-border rounded-xl p-6">
              <Database className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">{t("deck.crawlingDb")}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("deck.crawlingDbDesc")}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <Lock className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">{t("deck.userBehaviorDb")}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("deck.userBehaviorDbDesc")}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <Brain className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">{t("deck.aiAnalysisLayer")}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("deck.aiAnalysisLayerDesc")}
              </p>
            </div>
          </div>
        </Section>

        {/* ═══════════ DATA ARCHITECTURE ═══════════ */}
        <Section id="data" className="border-t border-border/50">
          <SectionTag><Database className="w-3.5 h-3.5" /> {t("deck.dataArch")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.dataArchTitle")}
          </h2>

          <div className="overflow-x-auto rounded-xl border border-border bg-card mb-8">
            <table className="w-full text-left">
              <thead>
                <TableRow isHeader cells={[t("deck.platform"), t("deck.dataCollected"), t("deck.category")]} />
              </thead>
              <tbody>
                <TableRow cells={["YouTube", t("deck.ytData"), "YouTube"]} />
                <TableRow cells={["X (Twitter)", t("deck.xData"), "Buzz"]} />
                <TableRow cells={["Spotify", t("deck.spotifyData"), "Music"]} />
                <TableRow cells={["MelOn", t("deck.melonData"), "Music"]} />
                <TableRow cells={["Hanteo / Album sales", t("deck.albumData"), "Album"]} />
                <TableRow cells={["TikTok", t("deck.tiktokData"), "Buzz"]} />
                <TableRow cells={["Google Trends", t("deck.googleData"), "All"]} />
                <TableRow cells={["K·TRENZ Internal", t("deck.internalData"), t("deck.fanActivityCat")]} />
              </tbody>
            </table>
          </div>

          {/* Pipeline */}
          <h3 className="text-lg font-semibold mb-4">{t("deck.pipeline")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Radio, label: t("deck.collection"), desc: t("deck.collectionDesc") },
              { icon: Brain, label: t("deck.analysisStep"), desc: t("deck.analysisStepDesc") },
              { icon: Flame, label: t("deck.scoring"), desc: t("deck.scoringDesc") },
              { icon: Database, label: t("deck.accumulation"), desc: t("deck.accumulationDesc") },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                <s.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                <div className="text-sm font-semibold text-foreground mb-1">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════ FES FORMULA ═══════════ */}
        <Section id="fes" className="border-t border-border/50">
          <SectionTag><Activity className="w-3.5 h-3.5" /> FES v5.3</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {t("deck.fesFormula")}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            {t("deck.fesDesc")}
          </p>

          <div className="bg-card border border-border rounded-xl p-6 mb-6 font-mono text-sm">
            <div className="text-muted-foreground mb-2">// Final FES calculation</div>
            <div className="text-foreground">
              FES = clamp(
              <br />
              &nbsp;&nbsp;0.37 × <span className="text-primary">YouTube</span>_Energy
              <br />
              &nbsp;&nbsp;+ 0.23 × <span className="text-primary">Buzz</span>_Energy
              <br />
              &nbsp;&nbsp;+ 0.18 × <span className="text-primary">Music</span>_Energy
              <br />
              &nbsp;&nbsp;+ 0.14 × <span className="text-primary">Album</span>_Energy
              <br />
              &nbsp;&nbsp;+ 0.08 × <span className="text-primary">Fan</span>_Energy
              <br />
              , 10, 250)
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { cat: "YouTube", w: "37%", color: "bg-red-500/20 border-red-500/30" },
              { cat: "Buzz", w: "23%", color: "bg-blue-500/20 border-blue-500/30" },
              { cat: "Music", w: "18%", color: "bg-green-500/20 border-green-500/30" },
              { cat: "Album", w: "14%", color: "bg-yellow-500/20 border-yellow-500/30" },
              { cat: "Fan", w: "8%", color: "bg-purple-500/20 border-purple-500/30" },
            ].map(c => (
              <div key={c.cat} className={`rounded-lg border p-3 text-center ${c.color}`}>
                <div className="text-lg font-bold text-foreground">{c.w}</div>
                <div className="text-xs text-muted-foreground">{c.cat}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════ ROADMAP ═══════════ */}
        <Section id="roadmap" className="border-t border-border/50">
          <SectionTag><Rocket className="w-3.5 h-3.5" /> {t("deck.roadmap")}</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            {t("deck.roadmapTitle")}
          </h2>

          <div className="space-y-4">
            {[
              {
                phase: t("deck.phase1"),
                period: t("deck.phase1Period"),
                goal: t("deck.phase1Goal"),
                features: t("deck.phase1Features"),
                active: true,
              },
              {
                phase: t("deck.phase2"),
                period: t("deck.phase2Period"),
                goal: t("deck.phase2Goal"),
                features: t("deck.phase2Features"),
                active: false,
              },
              {
                phase: t("deck.phase3"),
                period: t("deck.phase3Period"),
                goal: t("deck.phase3Goal"),
                features: t("deck.phase3Features"),
                active: false,
              },
            ].map(r => (
              <div key={r.phase} className={`rounded-xl border p-5 ${r.active ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
                <div className="flex items-center gap-3 mb-2">
                  {r.active && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                  <h4 className="font-bold text-foreground">{r.phase}</h4>
                  <span className="text-xs text-muted-foreground ml-auto">{r.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1"><strong className="text-foreground">{t("deck.goal")}</strong> {r.goal}</p>
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">{t("deck.features")}</strong> {r.features}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════ CTA FOOTER ═══════════ */}
        <section className="border-t border-border/50 py-20 px-5 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-foreground">
              {t("deck.ctaTitle")}
            </h2>
            <p className="text-muted-foreground mb-8">
              {t("deck.ctaDesc")}
            </p>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
            >
              {t("deck.openKtrenz")} <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-muted-foreground mt-6">
              {t("deck.confidential")}
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default Deck;
