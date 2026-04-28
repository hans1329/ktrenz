import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import {
  Flame, Activity, BarChart3, Zap, Wand2, Bot, Sparkles,
  TrendingUp, Eye, Radio, Layers, Target, Shield, ArrowRight,
  ChevronDown, Music, Globe, Users, Coins, Lock, Vote, Rocket,
  Award, Wallet, RefreshCw, Network, FileCheck, Map, Linkedin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";
import BoxParticles from "@/components/v3/BoxParticles";
import ceoHanKim from "@/assets/team/ceo-han-kim.jpg";
import cfoChrisLee from "@/assets/team/cfo-chris-lee.jpg";
import cooWilliamYang from "@/assets/team/coo-william-yang.jpg";

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
   PITCH DECK 3 — Web3 Edition
   ═══════════════════════════════════════════ */
export default function PitchDeck3() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <SEO
        title="KTrenZ Web3 — K-Pop Trend Prediction Token Economy"
        description="KTrenZ is bringing K-Pop fandom on-chain with $KTNZ on Base. A dual-track Web2/Web3 platform where every prediction earns, every analysis matters."
        path="/pd3"
      />

      {/* ───── 1. HERO ───── */}
      <Section className="overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[160px]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-8 w-auto mx-auto mb-8" />

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-6">
            <Coins className="w-3 h-3" /> $KTNZ on Base · Web3 Edition
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
            <span className="text-foreground">The Only Place to See</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              K-Pop Firepower
            </span>
            <br />
            <span className="text-foreground">— On-Chain.</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Fusing YouTube · X · TikTok and music platform data into a single trend score.
            <br className="hidden md:block" />
            Every analysis is an <strong className="text-foreground">on-chain receipt</strong>.
            Every prediction, a stake in fandom history.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              Try Battle Live
            </button>
            <a
              href="#tokenomics"
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              View Tokenomics
            </a>
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { label: "Total Supply", value: 5, suffix: "B" },
              { label: "Activity Mint", value: 85, suffix: "%" },
              { label: "Chain", value: 0, suffix: "Base", custom: "Base" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-primary">
                  {s.custom ? s.custom : <Counter end={s.value} suffix={s.suffix} />}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <ChevronDown className="w-6 h-6 text-muted-foreground mx-auto mt-16 animate-bounce" />
        </div>
      </Section>

      {/* ───── 2. DATA ENGINE (FES) ───── */}
      <Section id="engine">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Activity className="w-3.5 h-3.5" /> Data Engine
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Trend Score — <span className="text-primary">Fan Energy</span>, Quantified
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Multi-platform data flows in real time and synthesizes into a single
              trend score with our proprietary weighted algorithm.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { icon: Globe, step: "01", title: "Collect", desc: "Auto-collect views, mentions, engagement metrics from YouTube · X · TikTok and more." },
              { icon: Layers, step: "02", title: "Normalize", desc: "Cross-platform scale differences normalized to a common baseline." },
              { icon: Activity, step: "03", title: "Weight & Sum", desc: "Composite score from multi-source weights across Energy, Buzz, and Music." },
              { icon: TrendingUp, step: "04", title: "Momentum", desc: "Acceleration and trend direction inferred from 24h / 7d change rates." },
            ].map((item) => (
              <div key={item.step} className="relative bg-card/60 border border-border/50 rounded-2xl p-6 hover:border-primary/30 transition-all group">
                <span className="absolute top-4 right-4 text-xs font-mono text-primary/40 group-hover:text-primary/70 transition-colors">{item.step}</span>
                <item.icon className="w-8 h-8 text-primary/70 mb-4" />
                <h3 className="text-foreground font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 3. BATTLE PRODUCT ───── */}
      <Section id="battle">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Flame className="w-3.5 h-3.5" /> Core Game
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Battle — <span className="text-primary">Read the Trend</span>, Make the Call
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Daily K-Star vs K-Star trend matchups. Browse the content, sense the momentum,
              predict tomorrow's growth band.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard icon={Eye} title="Browse the Evidence" desc="See real content driving each star's trend — videos, posts, news. Engagement gating ensures every prediction is informed." accent />
            <FeatureCard icon={Target} title="Pick Your Trend" desc="Choose A or B — the K-Star trend you believe will grow more. Confidence boost optional via $KTNZ." />
            <FeatureCard icon={Award} title="Earn Rewards" desc="Steady · Rising · Surge bands give different K-Cash rewards. Higher accuracy = bigger win." />
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-4">
            {[
              { val: "200+", label: "K-Stars Tracked" },
              { val: "10+", label: "Daily Battle Pairs" },
              { val: "24h", label: "Settlement Cycle" },
            ].map((s) => (
              <div key={s.label} className="text-center bg-card/60 border border-border/50 rounded-xl p-6">
                <div className="text-2xl md:text-3xl font-black text-primary mb-2">{s.val}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 4. KEY FEATURES ───── */}
      <Section id="features">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Sparkles className="w-3.5 h-3.5" /> Why K-TRENZ
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              A <span className="text-primary">whole new dimension</span> of fandom
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard icon={Zap} title="Real-Time Momentum" desc="Not weekly aggregates — every trend tick counts. Live, second-by-second pulse." accent />
            <FeatureCard icon={Layers} title="Multi-Source Fusion" desc="YouTube, X, TikTok, news fused into one unbiased composite score." />
            <FeatureCard icon={Bot} title="AI Insight Co-Pilot" desc="Per-trend AI analysis. Headlines, momentum signals, vibe detection." />
            <FeatureCard icon={BarChart3} title="Intuitive Visualization" desc="Treemaps, signal strips, energy charts let you read complex data at a glance." />
            <FeatureCard icon={Shield} title="Transparent Data" desc="All scoring criteria, change history, and settlement results are public." accent />
            <FeatureCard icon={Coins} title="Web3 Ready" desc="Optional wallet connect transforms K-Cash into $KTNZ — your fandom contribution, on-chain." />
          </div>
        </div>
      </Section>

      {/* ───── 5. WEB3 VISION ───── */}
      <Section id="web3-vision" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Network className="w-3.5 h-3.5" /> Web3 Vision
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Why <span className="text-primary">On-Chain</span> Matters
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              K-pop is a global cultural movement. Its fandom should own its history,
              not rent it from platforms.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-[80px]" />
              <h3 className="text-foreground font-bold text-xl mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" /> Web2 Track (Universal)
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Every fan, no wallet needed. Frictionless game UX.
              </p>
              <ul className="space-y-3">
                {[
                  "Battle, prediction, K-Cash points",
                  "Daily ticket quota & tier system",
                  "Watch ad → extra battle ticket",
                  "Available worldwide (incl. Korea)",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative bg-primary/10 border border-primary/30 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 left-0 w-40 h-40 bg-primary/10 rounded-full blur-[80px]" />
              <h3 className="text-foreground font-bold text-xl mb-4 flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" /> Web3 Track (Opt-in)
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Connect a wallet to unlock the full economy.
              </p>
              <ul className="space-y-3">
                {[
                  "Earn $KTNZ via activity contribution",
                  "Trend NFT minting + collectibles",
                  "Stake for boosts + governance vote",
                  "Available in compliant jurisdictions",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-card/60 border border-border/50 rounded-2xl p-6 text-center">
            <p className="text-foreground text-base font-semibold mb-2">
              ⚖️ Dual-Track is by Design, Not Compromise
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl mx-auto">
              Korea's game-currency law forbids redeemable in-game tokens.
              Our split protects Korean users (largest K-pop base) while letting global Web3
              users own their participation.
              <strong className="text-foreground"> One product, two trust models.</strong>
            </p>
          </div>
        </div>
      </Section>

      {/* ───── 6. TOKENOMICS ───── */}
      <Section id="tokenomics">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Coins className="w-3.5 h-3.5" /> Tokenomics
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">$KTNZ</span> — Built for Activity
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Total supply <strong className="text-foreground">5B</strong>, fixed.
              Only <strong className="text-foreground">15% pre-minted</strong> —
              the rest is earned by analyzing K-pop trends.
            </p>
          </div>

          {/* Supply allocation visual */}
          <div className="bg-card/60 border border-border/50 rounded-2xl p-8 mb-8">
            <h3 className="text-foreground font-bold text-lg mb-6 text-center">Supply Distribution</h3>
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-foreground font-semibold text-sm">Pre-Minted</span>
                    <span className="text-primary font-black text-sm">750M (15%)</span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: "15%" }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Already issued. Allocated for ICO, treasury, team, liquidity.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-foreground font-semibold text-sm">Activity Mining</span>
                    <span className="text-primary font-black text-sm">4.25B (85%)</span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary via-orange-400 to-amber-400 rounded-full" style={{ width: "85%" }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Minted over 10 years through user trend analysis &amp; predictions.</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Pre-Mint Breakdown (750M)</h4>
                {[
                  { label: "ICO Sale @ VBI", pct: 30, value: "225M" },
                  { label: "Treasury / Ops", pct: 25, value: "187.5M" },
                  { label: "Team & Advisors", pct: 15, value: "112.5M" },
                  { label: "DEX Liquidity", pct: 15, value: "112.5M" },
                  { label: "Strategic Partners", pct: 10, value: "75M" },
                  { label: "Marketing & Airdrop", pct: 5, value: "37.5M" },
                ].map((it) => (
                  <div key={it.label} className="flex items-center gap-3 text-xs">
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-foreground font-medium">{it.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        <span className="text-primary font-bold">{it.pct}%</span> · {it.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Activity mining schedule */}
          <div className="bg-card/60 border border-border/50 rounded-2xl p-8">
            <h3 className="text-foreground font-bold text-lg mb-2 text-center">10-Year Emission Schedule</h3>
            <p className="text-xs text-muted-foreground text-center mb-6">
              Front-loaded decay. Early adopters earn more per action.
              Auto-throttle adjusts emission to user growth.
            </p>
            <div className="flex items-end gap-1.5 h-32">
              {[
                { y: 1, h: "100%", v: "1B" },
                { y: 2, h: "85%", v: "850M" },
                { y: 3, h: "70%", v: "700M" },
                { y: 4, h: "55%", v: "550M" },
                { y: 5, h: "42%", v: "425M" },
                { y: 6, h: "30%", v: "300M" },
                { y: 7, h: "20%", v: "200M" },
                { y: 8, h: "13%", v: "130M" },
                { y: 9, h: "6%", v: "65M" },
                { y: 10, h: "3%", v: "30M" },
              ].map((bar) => (
                <div key={bar.y} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{bar.v}</span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary/30 to-primary/80 transition-all hover:to-primary"
                    style={{ height: bar.h }}
                  />
                  <span className="text-[10px] text-muted-foreground">Y{bar.y}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 7. EARN MECHANICS ───── */}
      <Section id="earn">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <RefreshCw className="w-3.5 h-3.5" /> Earn
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Activity = <span className="text-primary">Mint</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              No "buy-to-play". Every analysis, every prediction, every contribution mints $KTNZ —
              attributed to participation, not luck.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-card/60 border border-border/50 rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mb-4">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-foreground font-bold text-lg mb-2">Tier 1 — Daily</h3>
              <p className="text-xs text-muted-foreground mb-4">Browsing & analysis</p>
              <ul className="space-y-2 text-xs text-foreground">
                <li className="flex justify-between"><span>Daily login</span><span className="text-primary font-bold">+1</span></li>
                <li className="flex justify-between"><span>Trend insight (×5)</span><span className="text-primary font-bold">+1</span></li>
                <li className="flex justify-between"><span>Content view (×10)</span><span className="text-primary font-bold">+1</span></li>
                <li className="flex justify-between"><span>7-day streak</span><span className="text-primary font-bold">+10</span></li>
              </ul>
            </div>

            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-foreground font-bold text-lg mb-2">Tier 2 — Predict</h3>
              <p className="text-xs text-muted-foreground mb-4">Skill-based earning</p>
              <ul className="space-y-2 text-xs text-foreground">
                <li className="flex justify-between"><span>Submit prediction</span><span className="text-primary font-bold">+1</span></li>
                <li className="flex justify-between"><span>Hit Steady band</span><span className="text-primary font-bold">+2</span></li>
                <li className="flex justify-between"><span>Hit Rising band</span><span className="text-primary font-bold">+5</span></li>
                <li className="flex justify-between"><span>Hit Surge band</span><span className="text-primary font-bold">+15</span></li>
                <li className="flex justify-between"><span>3 in a row combo</span><span className="text-primary font-bold">+10</span></li>
              </ul>
            </div>

            <div className="bg-card/60 border border-border/50 rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-foreground font-bold text-lg mb-2">Tier 3 — Contribute</h3>
              <p className="text-xs text-muted-foreground mb-4">Ecosystem growth</p>
              <ul className="space-y-2 text-xs text-foreground">
                <li className="flex justify-between"><span>Refer + activate (W3)</span><span className="text-primary font-bold">+30</span></li>
                <li className="flex justify-between"><span>Trend NFT creator share</span><span className="text-primary font-bold">+5</span></li>
                <li className="flex justify-between"><span>Curation vote</span><span className="text-primary font-bold">+0.5</span></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 bg-card/40 border border-border/50 rounded-2xl p-6">
            <div className="grid md:grid-cols-3 gap-6 items-center">
              <div className="text-center md:border-r md:border-border/50 md:pr-6">
                <div className="text-2xl font-black text-primary mb-1">30 KTNZ</div>
                <div className="text-xs text-muted-foreground">Daily cap (no stake)</div>
              </div>
              <div className="text-center md:border-r md:border-border/50 md:pr-6">
                <div className="text-2xl font-black text-primary mb-1">×2.0</div>
                <div className="text-xs text-muted-foreground">365-day stake boost</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-primary mb-1">×0.5</div>
                <div className="text-xs text-muted-foreground">First 7 days (sybil guard)</div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 8. SUSTAINABLE ECONOMY (SINKS) ───── */}
      <Section id="sinks" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Flame className="w-3.5 h-3.5" /> Burn Economy
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Sustainable by <span className="text-primary">Sink Design</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Heavy emission needs heavy demand. Five sink mechanisms keep
              net inflation in healthy single-digits — even at scale.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-8">
            <FeatureCard icon={Award} title="Battle Pass · Monthly" desc="200 KTNZ burn for season-pass perks. +50% earn cap, NFT drop eligibility, leaderboard entry." accent />
            <FeatureCard icon={Shield} title="Insurance & Boost" desc="Pre-prediction options: Loss Insurance (30 KTNZ), Confidence Boost (50), Multi-Stake (80). High frequency sink." accent />
            <FeatureCard icon={Wallet} title="Extra Battle Tickets" desc="Web2 watches ad. Web3 spends KTNZ (30→50→80→120 escalating) for extra picks. Token use = +10% bonus." />
            <FeatureCard icon={Sparkles} title="Trend NFTs" desc="Mint winning predictions as collectibles. 100 KTNZ each. Top 10 predictors per pair only — FOMO sink." />
            <FeatureCard icon={Lock} title="Stake-Gated Tiers" desc="Pro Analyst (1000 KTNZ × 365d), Curator (500 × 90d), VIP (200 × 30d). Lock = circulation drain." />
            <FeatureCard icon={RefreshCw} title="Buy-Back & Burn" desc="30% of treasury revenue → quarterly market buyback → permanent burn. Price floor + trust signal." />
          </div>

          <div className="bg-card/60 border border-border/50 rounded-2xl p-6 mb-8">
            <h3 className="text-foreground font-bold text-base mb-4 text-center">Y1 Inflation Model · DAU 100K Scenario</h3>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-black text-primary mb-1">342M</div>
                <div className="text-xs text-muted-foreground">Activity Mint</div>
              </div>
              <div>
                <div className="text-3xl font-black text-foreground mb-1">281M</div>
                <div className="text-xs text-muted-foreground">Burned via Sinks</div>
              </div>
              <div>
                <div className="text-3xl font-black text-primary mb-1">8%</div>
                <div className="text-xs text-muted-foreground">Net Y1 Inflation</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6 max-w-2xl mx-auto">
              Target: 8% Y1 → 5% Y3 → 3% Y5 → 0% Y8. Beyond that, deflationary pressure
              from cumulative buyback &amp; burn.
            </p>
          </div>

          <div className="bg-card/40 border border-border/50 rounded-2xl p-6 text-center">
            <h4 className="text-sm font-bold text-foreground mb-2">Burn Split Policy</h4>
            <p className="text-xs text-muted-foreground">
              Game-internal sinks: <strong className="text-foreground">70% burn / 30% treasury</strong>
              {" · "} External redemption: <strong className="text-foreground">100% treasury</strong>
              {" · "} Treasury revenue: <strong className="text-foreground">30% buyback &amp; burn</strong>
            </p>
          </div>
        </div>
      </Section>

      {/* ───── 9. STAKING & GOVERNANCE ───── */}
      <Section id="stake-gov">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Vote className="w-3.5 h-3.5" /> Stake & Govern
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Hold Long. <span className="text-primary">Earn More.</span> Decide Together.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-card/60 border border-border/50 rounded-2xl p-8">
              <h3 className="text-foreground font-bold text-xl mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" /> Staking Tiers
              </h3>
              <p className="text-xs text-muted-foreground mb-6">Lock duration = boost magnitude</p>
              <div className="space-y-3">
                {[
                  { lock: "Flexible", boost: "1.0×", gov: "0.05×" },
                  { lock: "30 days", boost: "1.1×", gov: "0.15×" },
                  { lock: "90 days", boost: "1.25×", gov: "0.50×" },
                  { lock: "180 days", boost: "1.5×", gov: "0.85×" },
                  { lock: "365 days", boost: "2.0×", gov: "1.0×", emphasis: true },
                ].map((t) => (
                  <div key={t.lock} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${t.emphasis ? "bg-primary/10 border border-primary/30" : "bg-card/40 border border-border/30"}`}>
                    <span className={`text-sm font-medium ${t.emphasis ? "text-primary font-bold" : "text-foreground"}`}>{t.lock}</span>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="text-muted-foreground">Earn <strong className={t.emphasis ? "text-primary" : "text-foreground"}>{t.boost}</strong></span>
                      <span className="text-muted-foreground">Vote <strong className={t.emphasis ? "text-primary" : "text-foreground"}>{t.gov}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card/60 border border-border/50 rounded-2xl p-8">
              <h3 className="text-foreground font-bold text-xl mb-2 flex items-center gap-2">
                <Vote className="w-5 h-5 text-primary" /> Governance Scope
              </h3>
              <p className="text-xs text-muted-foreground mb-6">DAO votes shape the roadmap</p>
              <ul className="space-y-3 text-sm">
                {[
                  { label: "Action rate adjustment", freq: "Quarterly" },
                  { label: "New K-Star nomination", freq: "Monthly" },
                  { label: "Season events & reward pools", freq: "Monthly" },
                  { label: "Treasury allocation (>10%)", freq: "On demand" },
                  { label: "Contract upgrades", freq: "On demand · 14d timelock" },
                ].map((g) => (
                  <li key={g.label} className="flex items-start justify-between gap-3 py-2 border-b border-border/30 last:border-0">
                    <span className="text-foreground">{g.label}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{g.freq}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-4">
                Phase 3: Snapshot (off-chain) →
                Phase 4: On-chain Governor (Compound-style)
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 10. GEO COMPLIANCE ───── */}
      <Section id="compliance">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Shield className="w-3.5 h-3.5" /> Compliance
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">Defense in Depth</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Web3 features activate only in compliant jurisdictions.
              Web2 game stays universal — Korean fans never lose access.
            </p>
          </div>

          <div className="bg-card/60 border border-border/50 rounded-2xl p-6 mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Region</th>
                  <th className="text-center py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Web2 Game</th>
                  <th className="text-center py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Wallet Connect</th>
                  <th className="text-center py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">$KTNZ Claim</th>
                  <th className="text-center py-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">NFT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { region: "🇰🇷 Korea", w2: "✅", wc: "❌", claim: "❌", nft: "❌", note: "Game-currency law compliance" },
                  { region: "🇨🇳 China", w2: "✅", wc: "❌", claim: "❌", nft: "❌", note: "Crypto banned" },
                  { region: "🇺🇸 USA", w2: "✅", wc: "❌", claim: "❌", nft: "❌", note: "SEC + state review" },
                  { region: "🇸🇬 Singapore", w2: "✅", wc: "⚠️", claim: "⚠️", nft: "⚠️", note: "MAS gating + KYC" },
                  { region: "🇯🇵 Japan", w2: "✅", wc: "✅", claim: "✅", nft: "⚠️", note: "FSA registration for NFT" },
                  { region: "🇪🇺 EU", w2: "✅", wc: "✅", claim: "✅", nft: "✅", note: "MiCA compliant" },
                  { region: "Other", w2: "✅", wc: "✅", claim: "✅", nft: "✅", note: "Default open" },
                ].map((r) => (
                  <tr key={r.region} className="border-b border-border/30 last:border-0 hover:bg-card/40 transition-colors">
                    <td className="py-3 px-3 text-foreground font-medium">{r.region}</td>
                    <td className="py-3 px-3 text-center">{r.w2}</td>
                    <td className="py-3 px-3 text-center">{r.wc}</td>
                    <td className="py-3 px-3 text-center">{r.claim}</td>
                    <td className="py-3 px-3 text-center">{r.nft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { layer: "Layer 1", title: "IP Geolocation", desc: "Cloudflare cf-ipcountry filters Web3 UI server-side." },
              { layer: "Layer 2", title: "ToS Acknowledgment", desc: "Wallet connect requires non-restricted residency check." },
              { layer: "Layer 3", title: "KYC Verification", desc: "Sumsub / Persona for claim eligibility." },
              { layer: "Layer 4", title: "Contract Whitelist", desc: "Merkle distributor only allows KYC-approved wallets." },
            ].map((l) => (
              <div key={l.layer} className="bg-card/60 border border-border/50 rounded-xl p-4">
                <div className="text-[10px] font-mono text-primary mb-1">{l.layer}</div>
                <h4 className="text-foreground font-bold text-sm mb-1">{l.title}</h4>
                <p className="text-xs text-muted-foreground">{l.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 11. ROADMAP ───── */}
      <Section id="roadmap" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Map className="w-3.5 h-3.5" /> Roadmap
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">Phased</span> Rollout
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Web2 first to prove product-market fit, then on-chain layer by layer.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                phase: "Phase 0",
                status: "Live",
                title: "Web2 Game",
                items: ["Battle, predictions, K-Cash", "200+ K-Stars tracked", "Daily ticket quota system"],
                done: true,
              },
              {
                phase: "Phase 1",
                status: "Q3 2026",
                title: "Web3 Infrastructure",
                items: ["Wallet connect (RainbowKit/Privy)", "Region detection", "Activity tracking on-chain (data-only)", "KYC integration"],
              },
              {
                phase: "Phase 2",
                status: "Q4 2026",
                title: "VBI ICO + Activity Mint Live",
                items: ["VBI ICO 225M", "DEX initial liquidity (Base)", "Merkle distributor live", "Battle Pass + Insurance/Boost sinks active"],
                accent: true,
              },
              {
                phase: "Phase 3",
                status: "H1 2027",
                title: "NFTs + Governance",
                items: ["Trend NFT collection", "Staking with boost tiers", "Snapshot governance", "Buy-back & burn quarterly"],
              },
              {
                phase: "Phase 4",
                status: "H2 2027",
                title: "DAO + IP Partnerships",
                items: ["On-chain Compound-style governor", "Star Fan Tokens (with entertainment co. licenses)", "EU MiCA / Japan FSA activation"],
              },
              {
                phase: "Phase 5",
                status: "2028+",
                title: "Global Expansion",
                items: ["Multi-language fan communities", "Cross-chain bridges as needed", "Regional partnerships"],
              },
            ].map((p) => (
              <div
                key={p.phase}
                className={`relative bg-card/60 border rounded-2xl p-6 transition-all hover:-translate-y-0.5 ${
                  p.accent
                    ? "border-primary/40 shadow-[0_0_30px_hsl(11_100%_46%/0.1)]"
                    : p.done
                      ? "border-green-500/30"
                      : "border-border/50"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 text-center">
                    <div className={`text-xs font-mono font-bold ${p.accent ? "text-primary" : p.done ? "text-green-500" : "text-muted-foreground"}`}>
                      {p.phase}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{p.status}</div>
                    {p.done && <div className="text-[10px] text-green-500 font-bold mt-1">✓ DONE</div>}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-foreground font-bold text-lg mb-3">{p.title}</h3>
                    <ul className="grid md:grid-cols-2 gap-x-4 gap-y-1.5">
                      {p.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${p.accent ? "bg-primary" : "bg-muted-foreground/40"}`} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 12. Team ───── */}
      <Section id="team">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-12 md:mb-16">
            <SectionTag>
              <Users className="w-3.5 h-3.5" /> Team
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Where K-Pop Insiders <br className="hidden md:inline" />
              Meet <span className="text-primary">Web3 Builders</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Han Kim",
                role: "CEO",
                img: ceoHanKim,
                bio: ["Platform Industry Veteran", "Smart Contract Specialist &", "Full-Stack Developer"],
                linkedin: "https://www.linkedin.com/in/han-seok-kim-0057121aa/",
              },
              {
                name: "Chris Lee",
                role: "CFO",
                img: cfoChrisLee,
                bio: ["Strategy Lead", "Platform Architecture &", "Financial Design Expert"],
                linkedin: "https://www.linkedin.com/in/chris-lee-73a4a74/",
              },
              {
                name: "William Yang",
                role: "COO",
                img: cooWilliamYang,
                bio: ["Community", "Fandom Network Specialist", "K-Culture Expert"],
                linkedin: "https://www.linkedin.com/in/william-yang-vim/",
              },
            ].map((m) => (
              <div
                key={m.name}
                className="rounded-2xl bg-card/60 border border-border/50 p-6 md:p-7 flex flex-col items-center"
              >
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden mb-4 ring-2 ring-primary/30">
                  <img src={m.img} alt={m.name} className="w-full h-full object-cover" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-foreground text-center mb-1">
                  {m.name}
                </h3>
                <p className="text-primary font-semibold text-sm md:text-base text-center mb-3">
                  {m.role}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground text-center leading-relaxed">
                  {m.bio.map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < m.bio.length - 1 && <br />}
                    </span>
                  ))}
                </p>
                <a
                  href={m.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-4 text-xs md:text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                  <span>LinkedIn</span>
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-xs md:text-sm text-muted-foreground mt-10">
            Get in touch:{" "}
            <a
              href="mailto:manager@k-trendz.com"
              className="text-primary hover:underline font-semibold"
            >
              manager@k-trendz.com
            </a>
          </p>
        </div>
      </Section>

      {/* ───── 13. ICO via VBI ───── */}
      <Section id="ico">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Rocket className="w-3.5 h-3.5" /> Token Sale
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              ICO via <span className="text-primary">VBI</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              225M $KTNZ allocation across three rounds.
              Vesting protects against dump pressure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {[
              { round: "Seed", price: "$0.005", alloc: "50M", vest: "24mo linear", emphasis: false },
              { round: "Private", price: "$0.012", alloc: "75M", vest: "12mo linear", emphasis: false },
              { round: "Public", price: "$0.025", alloc: "100M", vest: "6mo linear", emphasis: true, badge: "@ VBI" },
            ].map((r) => (
              <div
                key={r.round}
                className={`relative rounded-2xl p-6 border ${
                  r.emphasis
                    ? "bg-primary/10 border-primary/40 shadow-[0_0_30px_hsl(11_100%_46%/0.15)]"
                    : "bg-card/60 border-border/50"
                }`}
              >
                {r.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">{r.badge}</span>
                )}
                <h3 className="text-foreground font-bold text-xl mb-1">{r.round}</h3>
                <div className="text-3xl font-black text-primary my-3 tabular-nums">{r.price}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Allocation</span>
                    <span className="text-foreground font-bold">{r.alloc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vesting</span>
                    <span className="text-foreground font-bold">{r.vest}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card/40 border border-border/50 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-foreground mb-4 text-center flex items-center justify-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" /> Investor Protections
            </h4>
            <div className="grid md:grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Team: <strong className="text-foreground">12-month cliff + 36-month linear</strong> — no one runs.</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>DEX LP: <strong className="text-foreground">2-year locked</strong> — no rug pull risk.</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Audit: <strong className="text-foreground">CertiK / OpenZeppelin</strong> review pre-launch.</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Treasury: <strong className="text-foreground">DAO multisig 3-of-5</strong>, 5-year drawdown.</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 13. CTA ───── */}
      <Section id="cta">
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[140px]" />
          </div>

          <div className="text-6xl mb-6">🔥</div>
          <h2 className="text-3xl md:text-5xl font-black mb-6">
            Be Early.
            <br />
            <span className="text-primary">Earn the Future</span> of K-Pop Fandom.
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-lg mx-auto">
            Web2 fans play free. Web3 fans own a piece.
            <br />
            Pick your trend. Mint your history.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="group px-10 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg hover:brightness-110 transition-all shadow-[0_0_30px_hsl(11_100%_46%/0.35)] flex items-center gap-2"
            >
              Try Battle Now
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="#tokenomics"
              className="px-10 py-4 rounded-xl bg-card text-foreground font-bold text-lg hover:bg-secondary transition-all border border-border flex items-center gap-2"
            >
              <Coins className="w-5 h-5" />
              Tokenomics
            </a>
          </div>

          <p className="text-muted-foreground text-xs mt-16">
            © 2026 K-TRENZ · $KTNZ on Base · ICO via VBI
            <br />
            Built for K-Pop fans, by fans — soon, owned by fans.
          </p>
        </div>
      </Section>
    </div>
  );
}
