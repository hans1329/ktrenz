import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import {
  Flame, Activity, BarChart3, Zap, Wand2, Bot, Sparkles,
  TrendingUp, Eye, Radio, Layers, Target, Shield, ArrowRight,
  ChevronDown, Music, Globe, Users
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";
import BoxParticles from "@/components/v3/BoxParticles";

/* ─────── Section wrapper ─────── */
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
    className={`relative min-h-screen flex items-center justify-center px-5 py-20 md:py-28 ${className}`}
  >
    {children}
  </section>
);

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/15 text-primary border border-primary/20 mb-6">
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
    className={`group relative rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-1 ${
      accent
        ? "bg-primary/10 border-primary/30 hover:border-primary/50 hover:shadow-[0_0_30px_hsl(11_100%_46%/0.15)]"
        : "bg-card/60 border-border/50 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(11_100%_46%/0.08)]"
    }`}
  >
    <div
      className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
        accent ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground group-hover:text-primary"
      } transition-colors`}
    >
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="text-foreground font-bold text-lg mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
  </div>
);

/* ─────── Animated counter ─────── */
const Counter = ({ end, suffix = "" }: { end: number; suffix?: string }) => {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          let start = 0;
          const step = Math.ceil(end / 40);
          const interval = setInterval(() => {
            start += step;
            if (start >= end) {
              start = end;
              clearInterval(interval);
            }
            setVal(start);
          }, 30);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref} className="tabular-nums">
      {val.toLocaleString()}
      {suffix}
    </span>
  );
};

/* ═══════════════════════════════════════════
   PITCH DECK PAGE
   ═══════════════════════════════════════════ */
export default function PitchDeck() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <SEO title="KTrenZ – The Only Place to See K-Pop Firepower Live" description="KTrenZ is the real-time K-Pop trend platform tracking 100+ artists across YouTube, X, and music charts with AI-powered FES energy scores." path="/pitchdeck" />

      {/* ───── 1. HERO ───── */}
      <Section className="overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[160px]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-8 w-auto mx-auto mb-8" />

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
            <span className="text-foreground">The Only Place to See</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              K-Pop Firepower
            </span>
            <br />
            <span className="text-foreground">Live</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Fusing YouTube · X · TikTok and music platform data into a single score —
            <br className="hidden md:block" />
            <strong className="text-foreground">Fan Energy Score (FES)</strong> measures artist momentum in real time.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              View Live Rankings
            </button>
            <button
              onClick={() => navigate("/agent")}
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              Try AI Agent
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { label: "Tracked Artists", value: 200, suffix: "+" },
              { label: "Data Points/Day", value: 50000, suffix: "+" },
              { label: "Live Updates", value: 24, suffix: "h" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-primary">
                  <Counter end={s.value} suffix={s.suffix} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <ChevronDown className="w-6 h-6 text-muted-foreground mx-auto mt-16 animate-bounce" />
        </div>
      </Section>

      {/* ───── 2. DATA ENGINE ───── */}
      <Section id="engine">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Activity className="w-3.5 h-3.5" /> Data Engine
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              FES — <span className="text-primary">Fan Energy Score</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Collecting multi-platform data in real time and synthesizing it into
              a single energy score with our proprietary weighted algorithm.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              {
                icon: Globe,
                step: "01",
                title: "Collect",
                desc: "Automatically collect views, mentions, and engagement metrics from YouTube · X · TikTok and more.",
              },
              {
                icon: Layers,
                step: "02",
                title: "Normalize",
                desc: "Normalize platform-specific scale differences to a common baseline.",
              },
              {
                icon: Activity,
                step: "03",
                title: "Weight & Sum",
                desc: "Calculate FES using multi-source weights across Energy, Buzz, and YouTube.",
              },
              {
                icon: TrendingUp,
                step: "04",
                title: "Momentum",
                desc: "Determine acceleration and trend direction from 24h / 7d change rates.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="relative bg-card/60 border border-border/50 rounded-2xl p-6 hover:border-primary/30 transition-all group"
              >
                <span className="absolute top-4 right-4 text-xs font-mono text-primary/40 group-hover:text-primary/70 transition-colors">
                  {item.step}
                </span>
                <item.icon className="w-8 h-8 text-primary/70 mb-4" />
                <h3 className="text-foreground font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 3. VISUALIZATION ───── */}
      <Section id="viz">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Eye className="w-3.5 h-3.5" /> Visualization
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Read Firepower through{" "}
              <span className="text-primary">Velocity</span> &{" "}
              <span className="text-primary">Density</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Not just numbers — an energy map you can feel at a glance.
              Area = energy, color = trend, neon = explosion.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-[80px]" />
              <h3 className="text-foreground font-bold text-xl mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> Energy Treemap
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Top artists placed by area proportion. Neon glow on ≥25% surge.
              </p>
              <div className="grid grid-cols-4 grid-rows-3 gap-1.5 h-40">
                <div className="col-span-2 row-span-2 rounded-lg bg-red-500/30 border border-red-500/40 flex items-center justify-center text-xs font-bold text-red-300 shadow-[0_0_12px_hsl(0_80%_50%/0.3)]">BTS</div>
                <div className="col-span-1 row-span-1 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[10px] font-bold text-green-300">aespa</div>
                <div className="col-span-1 row-span-2 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[10px] font-bold text-red-300">IVE</div>
                <div className="col-span-1 row-span-1 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-300">LE SSE..</div>
                <div className="col-span-2 row-span-1 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center text-[10px] font-bold text-green-300">BLACKPINK</div>
                <div className="col-span-1 row-span-1 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-[10px] font-bold text-blue-300">NCT</div>
                <div className="col-span-1 row-span-1 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[10px] font-bold text-green-300">SKZ</div>
              </div>
            </div>

            <div className="space-y-5 flex flex-col justify-center">
              {[
                { color: "bg-red-500", label: "Surging (≥15%)", desc: "Energy accelerating fast. Comeback, viral, or major event detected." },
                { color: "bg-green-500", label: "Stable (≥0%)", desc: "Steady fandom activity keeping energy solidly maintained." },
                { color: "bg-blue-500", label: "Declining (<0%)", desc: "Activity decrease or natural decay. Rebound expected on next activity." },
                { color: "bg-red-500 shadow-[0_0_12px_hsl(0_80%_50%/0.5)]", label: "Neon Burst (≥25%)", desc: "Extreme surge. Glow effect provides immediate visual alert." },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className={`w-4 h-4 rounded-sm mt-1 shrink-0 ${item.color}`} />
                  <div>
                    <div className="text-foreground font-semibold text-sm">{item.label}</div>
                    <div className="text-muted-foreground text-sm">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-6 overflow-hidden">
              <BoxParticles count={40} color="hsl(11, 100%, 46%)" />
              <h3 className="relative z-10 text-foreground font-bold text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Live Change Rate
              </h3>
              <div className="space-y-2.5">
                {[
                  { rank: 1, name: "BTS", score: "9,420", change: "+18.3%", up: true },
                  { rank: 2, name: "aespa", score: "8,150", change: "+5.1%", up: true },
                  { rank: 3, name: "IVE", score: "7,830", change: "+12.7%", up: true },
                  { rank: 4, name: "BLACKPINK", score: "6,920", change: "+1.2%", up: true },
                  { rank: 5, name: "NCT", score: "5,410", change: "-3.4%", up: false },
                ].map((a) => (
                  <div key={a.rank} className="flex items-center gap-3 py-1.5">
                    <span className={`text-xs font-black w-5 text-center ${a.rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
                      {a.rank}
                    </span>
                    <span className="text-foreground text-sm font-medium flex-1 truncate">{a.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{a.score}</span>
                    <span className={`text-xs font-semibold tabular-nums ${a.up ? "text-red-400" : "text-blue-400"}`}>
                      {a.change}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-6 overflow-hidden">
              <BoxParticles count={28} color="hsl(11, 100%, 46%)" />
              <h3 className="relative z-10 text-foreground font-bold text-sm mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Momentum
              </h3>
              <p className="text-muted-foreground text-xs mb-4">24h energy change rate trend</p>
              <div className="relative h-28">
                <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(11 100% 46%)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="hsl(11 100% 46%)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,60 Q20,55 40,50 T80,35 T120,20 T160,30 T200,15" fill="none" stroke="hsl(11 100% 46%)" strokeWidth="2" />
                  <path d="M0,60 Q20,55 40,50 T80,35 T120,20 T160,30 T200,15 L200,80 L0,80 Z" fill="url(#momentumGrad)" />
                </svg>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-muted-foreground px-1">
                  <span>-24h</span><span>-12h</span><span>Now</span>
                </div>
              </div>
              <div className="mt-3 text-center">
                <span className="text-primary font-bold text-lg">+18.3%</span>
                <span className="text-muted-foreground text-xs ml-1">Accelerating</span>
              </div>
            </div>

            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-6 overflow-hidden">
              <BoxParticles count={18} color="hsl(11, 100%, 46%)" />
              <h3 className="relative z-10 text-foreground font-bold text-sm mb-4 flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary" /> FES Density
              </h3>
              <p className="text-muted-foreground text-xs mb-4">Artist density by score range</p>
              <div className="flex items-end gap-2 h-28">
                {[
                  { h: "20%", label: "2K", count: 8 },
                  { h: "35%", label: "4K", count: 15 },
                  { h: "65%", label: "6K", count: 32 },
                  { h: "100%", label: "8K", count: 45 },
                  { h: "80%", label: "9K+", count: 12 },
                ].map((bar) => (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">{bar.count}</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-primary/80 transition-all"
                      style={{ height: bar.h }}
                    />
                    <span className="text-[9px] text-muted-foreground">{bar.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-center">
                <span className="text-foreground font-bold text-sm">8K–9K range most dense</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 4. MERITS ───── */}
      <Section id="merits">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Sparkles className="w-3.5 h-3.5" /> Why K-TRENZ
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              A <span className="text-primary">whole new dimension</span> beyond charts
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              icon={Zap}
              title="Real-Time Momentum"
              desc="Not weekly or monthly aggregates — we track energy flow in real time, second by second."
              accent
            />
            <FeatureCard
              icon={Layers}
              title="Multi-Source Fusion"
              desc="YouTube, X, TikTok and more fused into a single unbiased composite score."
            />
            <FeatureCard
              icon={Target}
              title="AI Personal Assistant"
              desc="An agent that auto-briefs you on your artist's live firepower changes and optimal streaming strategy."
            />
            <FeatureCard
              icon={Eye}
              title="Intuitive Visualization"
              desc="Treemaps, sparklines, and energy charts let you read complex data at a glance."
            />
            <FeatureCard
              icon={Shield}
              title="Transparent Data"
              desc="All scoring criteria and change history are public. A fair playing field for fandoms."
              accent
            />
            <FeatureCard
              icon={Radio}
              title="Streaming Strategy"
              desc="AI generates optimal streaming strategies per artist in real time. Maximize fan activity efficiency."
            />
          </div>
        </div>
      </Section>

      {/* ───── 5. AI WEAPON ───── */}
      <Section id="weapon">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Wand2 className="w-3.5 h-3.5" /> Magic Wand
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              A Powerful
              <br />
              <span className="text-primary">Magic Wand</span> for Fans
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              The AI agent is not just a chatbot.
              <br />
              It's a fan-exclusive <strong className="text-foreground">strategic weapon</strong> armed with real-time data.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: "🔍",
                title: "Live Firepower Recon",
                desc: "Get real-time briefings on your artist's FES score, ranking, and energy changes.",
              },
              {
                icon: "📋",
                title: "Streaming Battle Plan",
                desc: "AI analyzes platform weights to suggest the most efficient streaming order and strategy.",
              },
              {
                icon: "🎯",
                title: "Watchlist Management",
                desc: "\"Add BTS\" — one sentence to register. Manage everything with natural language.",
              },
              {
                icon: "📊",
                title: "Instant Ranking Cards",
                desc: "One quick button to view live TOP rankings as inline cards.",
              },
              {
                icon: "⚡",
                title: "Trend Change Detection",
                desc: "The agent auto-detects surges and drops and alerts you immediately.",
              },
              {
                icon: "🤖",
                title: "24/7 Standby",
                desc: "Ask anytime, get instant responses. A fan activity partner that never sleeps.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className={`relative bg-card/60 border rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 ${
                  i === 0
                    ? "border-primary/30 hover:border-primary/50 hover:shadow-[0_0_30px_hsl(11_100%_46%/0.15)]"
                    : "border-border/50 hover:border-primary/30"
                }`}
              >
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-foreground font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-card border border-border text-sm text-muted-foreground">
              <Wand2 className="w-4 h-4 text-primary" />
              Data + AI = The Fan's <strong className="text-foreground">Ultimate Weapon</strong>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 6. AI AGENT ───── */}
      <Section id="agent">
        <div className="max-w-5xl mx-auto w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <SectionTag>
                <Bot className="w-3.5 h-3.5" /> Fan Agent
              </SectionTag>
              <h2 className="text-3xl md:text-5xl font-black mb-6">
                An AI <span className="text-primary">Agent</span>
                <br />
                to Power Your Fandom
              </h2>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                Register your favorite artists and let AI handle real-time briefings,
                ranking change alerts, and streaming strategies.
              </p>
              <ul className="space-y-4">
                {[
                  "Register & manage artists with natural language",
                  "FES-based real-time trend briefings",
                  "Personalized streaming optimization guide",
                  "Instant ranking cards via quick buttons",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-foreground">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Zap className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card/80 border border-border/50 rounded-2xl p-5 space-y-3 shadow-[0_0_40px_hsl(11_100%_46%/0.06)]">
              <div className="flex items-center gap-2 pb-3 border-b border-border/40 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <span className="text-foreground font-bold text-sm">K-TRENZ Agent</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              {[
                { role: "user", text: "How's BTS doing right now?" },
                {
                  role: "agent",
                  text: "🔥 BTS current FES 9,420 — Energy +18.3% surging! Spotify streaming is exploding with comeback effect.",
                },
                { role: "user", text: "Plan a streaming strategy" },
                {
                  role: "agent",
                  text: "📋 I recommend streaming Dynamite → Butter → Spring Day in 3 rotations. Spotify weight is currently highest for maximum efficiency.",
                },
              ].map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary/15 text-foreground rounded-br-md"
                        : "bg-secondary text-secondary-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 7. KEY FEATURES ───── */}
      <Section id="features">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Sparkles className="w-3.5 h-3.5" /> Key Features
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Key <span className="text-primary">Features</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Flame, title: "Live FES Rankings", desc: "Real-time Fan Energy Score rankings and change tracking per artist." },
              { icon: BarChart3, title: "Energy Treemap", desc: "Area = energy, color = trend. See the entire market in one screen." },
              { icon: Music, title: "Streaming Guide", desc: "AI generates optimal streaming strategies per artist in real time." },
              { icon: Wand2, title: "AI Magic Wand", desc: "Agent armed with real-time data to maximize your fan activity efficiency." },
              { icon: Bot, title: "Fan Agent Bot", desc: "AI that communicates in natural language. Artist briefings & strategy delivery." },
              { icon: Users, title: "Fandom Community", desc: "Wiki, posts, challenges, DMs — an integrated space for fan activities." },
            ].map((f, i) => (
              <FeatureCard key={i} icon={f.icon} title={f.title} desc={f.desc} accent={i === 0} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 8. CTA ───── */}
      <Section id="cta">
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[140px]" />
          </div>

          <div className="text-6xl mb-6">🔥</div>
          <h2 className="text-3xl md:text-5xl font-black mb-6">
            Check the
            <br />
            <span className="text-primary">Live Firepower</span> Right Now
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-lg mx-auto">
            The energy dashboard no K-Pop fan can miss.
            <br />
            See where your artist stands right now.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="group px-10 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg hover:brightness-110 transition-all shadow-[0_0_30px_hsl(11_100%_46%/0.35)] flex items-center gap-2"
            >
              Live Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate("/agent")}
              className="px-10 py-4 rounded-xl bg-card text-foreground font-bold text-lg hover:bg-secondary transition-all border border-border flex items-center gap-2"
            >
              <Bot className="w-5 h-5" />
              Start Agent
            </button>
          </div>

          <p className="text-muted-foreground text-xs mt-16">
            © 2026 K-TRENZ. Built for K-Pop fans, by fans.
          </p>
        </div>
      </Section>
    </div>
  );
}
