import SEO from "@/components/SEO";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useNavigate } from "react-router-dom";
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
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent ? "bg-primary/20" : "bg-muted"}`}>
      <Icon className={`w-5 h-5 ${accent ? "text-primary" : "text-muted-foreground"}`} />
    </div>
    <h3 className="font-semibold text-foreground mb-1.5 text-sm">{title}</h3>
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
              AI-Powered Fan Energy Intelligence Platform
            </p>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6 text-foreground">
              Turn Fandom Energy into
              <br />
              <span className="text-primary">Measurable Impact</span>
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-10">
              K·TRENZ collects and analyzes K-POP fan activity data with AI to produce a real-time
              Fan Energy Score (FES), letting fans directly contribute to their favorite artist's
              popularity through mission participation.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
              >
                Open Energy Map <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#product"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-medium text-sm hover:bg-muted transition"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════ VISION ═══════════ */}
        <Section id="vision" className="border-t border-border/50">
          <SectionTag><Eye className="w-3.5 h-3.5" /> Vision</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            "According to K·TRENZ" — the industry benchmark.
          </h2>
          <p className="text-muted-foreground max-w-3xl leading-relaxed mb-8">
            K·TRENZ is not just a ranking site. It's a <strong className="text-foreground">megaphone, amplifier, and gateway</strong> where
            fans' content consumption directly moves real popularity metrics on YouTube, Spotify, and X.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard icon={Megaphone} title="Megaphone" desc="Missions guide fans to watch, like, and stream — amplifying signals on actual platforms." accent />
            <FeatureCard icon={Radio} title="Amplifier" desc="Coordinated fan energy is aggregated and reflected in real platform metrics, not just K·TRENZ scores." accent />
            <FeatureCard icon={ExternalLink} title="Gateway" desc="Every mission links directly to YouTube, Spotify, and X — driving real engagement to official content." accent />
          </div>
        </Section>

        {/* ═══════════ PROBLEM & OPPORTUNITY ═══════════ */}
        <Section id="problem" className="border-t border-border/50">
          <SectionTag><Target className="w-3.5 h-3.5" /> Problem & Opportunity</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            What fans struggle with today
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left">
              <thead>
                <TableRow isHeader cells={["Fan Need", "Current Problem", "K·TRENZ Solution"]} />
              </thead>
              <tbody>
                <TableRow cells={["Belonging", "Fan activities are invisible & individual", "Contribute to FES via missions + rank by contribution"]} />
                <TableRow cells={["Accuracy", "Hard to gauge real popularity", "Multi-source energy map for accurate fandom status"]} />
                <TableRow cells={["Time Mgmt", "Info scattered across platforms", "All activities & content unified in mission popups"]} />
                <TableRow cells={["Language", "Korean content barrier", "AI translation + multilingual support"]} />
                <TableRow cells={["Archive", "No fandom history tools", "Energy history archive + momentum charts per artist"]} />
              </tbody>
            </table>
          </div>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 bg-card rounded-xl border border-border p-6">
            <StatCard value="$13B+" label="Global K-POP market (2025)" />
            <StatCard value="300M+" label="K-POP fans worldwide" />
            <StatCard value="Dual" label="B2C fans + B2B industry" />
            <StatCard value="All" label="Artists covered, not niche" />
          </div>
        </Section>

        {/* ═══════════ PRODUCT OVERVIEW ═══════════ */}
        <Section id="product" className="border-t border-border/50">
          <SectionTag><Layers className="w-3.5 h-3.5" /> Product Overview</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Four core pillars
          </h2>

          {/* Energy Map */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Energy Map</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              The main screen — a live treemap visualizing fan energy by artist in real-time.
              Block size = total FES. Color = hot pink (rising) / teal (falling). Change rate displayed with ▲/▼% + 🔥 emoji.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">📊</div>
                <div className="text-xs text-muted-foreground">Block Size = FES Volume</div>
              </div>
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">🔴🟢</div>
                <div className="text-xs text-muted-foreground">Color = Trend Direction</div>
              </div>
              <div className="rounded-xl bg-primary/15 border border-primary/30 p-4 text-center">
                <div className="text-2xl mb-1">🔥</div>
                <div className="text-xs text-muted-foreground">Flame = Surging Energy</div>
              </div>
            </div>
          </div>

          {/* Mission System */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Mission System</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              Tap an artist on the Energy Map to see mission popups. Watch YouTube, like on X, stream on Spotify —
              these actions affect <strong className="text-foreground">real platform metrics</strong>, not just K·TRENZ internal scores.
            </p>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                <Sparkles className="w-4 h-4 text-primary" /> How it works
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { step: "1", label: "Tap artist", desc: "Open mission popup from energy map" },
                  { step: "2", label: "Choose mission", desc: "YouTube watch, X like, Spotify stream" },
                  { step: "3", label: "Complete on platform", desc: "Redirected to real content — your engagement counts" },
                  { step: "4", label: "Earn K-Points", desc: "Return to K·TRENZ & earn rewards" },
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
              <h3 className="text-xl font-bold">AI Fan Agent</h3>
            </div>
            <p className="text-muted-foreground mb-4 max-w-3xl">
              A dedicated AI chatbot for your bias artist. Ask questions, get real-time trend alerts, 
              and receive personalized analysis.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FeatureCard icon={Star} title="Bias Artist" desc="Set your favorite artist for a dedicated agent" />
              <FeatureCard icon={MessageSquare} title="Smart Chat" desc="Ask anything about fan activities, news, and strategies" />
              <FeatureCard icon={TrendingUp} title="Real-time Alerts" desc="Get notified on ranking changes and energy surges" />
              <FeatureCard icon={LineChart} title="Analysis" desc="Personalized insights and streaming recommendations" />
            </div>
          </div>

          {/* Activity Dashboard */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Activity Dashboard</h3>
            </div>
            <p className="text-muted-foreground max-w-3xl">
              Track your personal contribution to your artist's FES — see your rank, activity stats
              (profile views, map clicks, link clicks, agent conversations), and contribution percentage.
            </p>
          </div>
        </Section>

        {/* ═══════════ K-POINTS ECONOMY ═══════════ */}
        <Section id="economy" className="border-t border-border/50">
          <SectionTag><Gift className="w-3.5 h-3.5" /> K-Points Economy</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            All activities revolve around K-Points
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Earn
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Daily login bonus: +5P</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Mission completion: +10P per mission</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Non-cashable — used for in-app features only</li>
              </ul>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Spend
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Agent messages (per message)</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Extra agent slots (1,000P)</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Future: badges, profile customization</li>
              </ul>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" /> K-Pass
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Free: Energy Map + 1 Agent + Missions</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Premium: Extra slots + advanced analytics</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Pricing TBD</li>
              </ul>
            </div>
          </div>

          {/* IAP Packages */}
          <h3 className="text-lg font-semibold mb-4">Purchase Packages</h3>
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
          <SectionTag><BarChart3 className="w-3.5 h-3.5" /> Business Model</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Dual revenue: B2C + B2B
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* B2C */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> B2C Revenue
              </h3>
              <div className="space-y-3">
                {[
                  { label: "K-Points IAP", desc: "Micro-transactions for agent messages and features" },
                  { label: "K-Pass Subscription", desc: "Premium tier unlocking advanced features" },
                  { label: "Agent Slots", desc: "Purchasable via K-Points or K-Pass" },
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
                <Globe className="w-5 h-5 text-primary" /> B2B Revenue
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Super Agent Subscription", desc: "Enterprise AI agent with all-artist analytics and multi-login" },
                  { label: "Sponsored Missions", desc: "Priority placement in mission popups for target artists" },
                  { label: "Bonus Points Distribution", desc: "Companies purchase points to incentivize fan activity" },
                  { label: "Fan Data Insights", desc: "Cross-artist demand analysis: what fans ask most" },
                  { label: "Agent-Fan Connection", desc: "Enterprise agents linked directly to fan accounts" },
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
          <SectionTag><Shield className="w-3.5 h-3.5" /> Data Moat</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Two proprietary data assets
          </h2>
          <p className="text-muted-foreground mb-8 max-w-3xl">
            As data accumulates, competitors cannot replicate our competitive moat.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-card border border-border rounded-xl p-6">
              <Database className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">Crawling DB</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Historical energy change logs per artist per channel. 
                Correlate which posts, news, and events drove the hottest reactions over time.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <Lock className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">User Behavior DB</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Which agents fans use, what they ask most, mission patterns, content consumption habits —
                exclusive data unavailable anywhere else.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <Brain className="w-8 h-8 text-primary mb-3" />
              <h4 className="font-bold text-foreground mb-2">AI Analysis Layer</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Raw Data → AI Analysis → Insights & Strategy.
                Not raw numbers — refined intelligence powering the Super Agent.
              </p>
            </div>
          </div>
        </Section>

        {/* ═══════════ DATA ARCHITECTURE ═══════════ */}
        <Section id="data" className="border-t border-border/50">
          <SectionTag><Database className="w-3.5 h-3.5" /> Data Architecture</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Multi-platform data collection
          </h2>

          <div className="overflow-x-auto rounded-xl border border-border bg-card mb-8">
            <table className="w-full text-left">
              <thead>
                <TableRow isHeader cells={["Platform", "Data Collected", "Category"]} />
              </thead>
              <tbody>
                <TableRow cells={["YouTube", "Views, comments, likes, subscribers", "YouTube"]} />
                <TableRow cells={["X (Twitter)", "Tweets, RT, hashtags, sentiment", "Buzz"]} />
                <TableRow cells={["Spotify", "Streams, chart positions", "Music"]} />
                <TableRow cells={["MelOn", "Chart rankings, likes", "Music"]} />
                <TableRow cells={["Hanteo / Album sales", "Album sales volume", "Album"]} />
                <TableRow cells={["TikTok", "Views, hashtags, challenges", "Buzz"]} />
                <TableRow cells={["Google Trends", "Search interest trends", "All"]} />
                <TableRow cells={["K·TRENZ Internal", "Mission participation, agent usage", "Fan Activity"]} />
              </tbody>
            </table>
          </div>

          {/* Pipeline */}
          <h3 className="text-lg font-semibold mb-4">AI Processing Pipeline</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Radio, label: "Collection", desc: "Platform APIs & crawlers → real-time streaming" },
              { icon: Brain, label: "Analysis", desc: "NLP sentiment + anomaly detection + trend prediction" },
              { icon: Flame, label: "Scoring", desc: "FES calculation → Energy Map + Mission generation + alerts" },
              { icon: Database, label: "Accumulation", desc: "Crawling DB + User DB → AI Insights → Super Agent" },
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
            Fan Energy Score formula
          </h2>
          <p className="text-muted-foreground mb-6 max-w-3xl">
            Each category Energy = <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">Velocity × 0.6 + Intensity × 0.4</code>
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
          <SectionTag><Rocket className="w-3.5 h-3.5" /> Roadmap</SectionTag>
          <h2 className="text-2xl md:text-3xl font-bold mb-8">
            Three-phase plan
          </h2>

          <div className="space-y-4">
            {[
              {
                phase: "Phase 1 — MVP",
                period: "Current",
                goal: "Core loop validation",
                features: "Top 23 Energy Map • Missions • AI Agent (1 slot) • K-Points IAP",
                active: true,
              },
              {
                phase: "Phase 2 — Growth",
                period: "Next",
                goal: "User acquisition + data accumulation",
                features: "Artist expansion • K-Pass subscription • Super Agent beta",
                active: false,
              },
              {
                phase: "Phase 3 — B2B Expansion",
                period: "Future",
                goal: "Enterprise monetization",
                features: "Super Agent subscription • Sponsored missions • Data API",
                active: false,
              },
            ].map(r => (
              <div key={r.phase} className={`rounded-xl border p-5 ${r.active ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
                <div className="flex items-center gap-3 mb-2">
                  {r.active && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                  <h4 className="font-bold text-foreground">{r.phase}</h4>
                  <span className="text-xs text-muted-foreground ml-auto">{r.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1"><strong className="text-foreground">Goal:</strong> {r.goal}</p>
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">Features:</strong> {r.features}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══════════ CTA FOOTER ═══════════ */}
        <section className="border-t border-border/50 py-20 px-5 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-foreground">
              Experience the Energy Map
            </h2>
            <p className="text-muted-foreground mb-8">
              See real-time K-POP fan energy and start contributing to your artist's popularity today.
            </p>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
            >
              Open K·TRENZ <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-muted-foreground mt-6">
              Confidential — K·TRENZ Service Deck v1.0 · March 2026
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default Deck;
