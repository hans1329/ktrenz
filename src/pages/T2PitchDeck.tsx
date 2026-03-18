import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Search, Zap, Brain, Globe, Target,
  BarChart3, Eye, Radio, Layers, ArrowRight,
  ChevronDown, Newspaper, Youtube, Activity,
  AlertTriangle, Sparkles, Shield, Clock,
  Database, LineChart, Radar, MessageSquare
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";

/* ─── Section ─── */
const Section = ({
  children, className = "", id,
}: { children: React.ReactNode; className?: string; id?: string }) => (
  <section id={id} className={`relative min-h-screen flex items-center justify-center px-5 py-20 md:py-28 ${className}`}>
    {children}
  </section>
);

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-primary/15 text-primary border border-primary/20 mb-6">
    {children}
  </span>
);

/* ─── Animated counter ─── */
const Counter = ({ end, suffix = "" }: { end: number; suffix?: string }) => {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = Math.ceil(end / 40);
        const interval = setInterval(() => {
          start += step;
          if (start >= end) { start = end; clearInterval(interval); }
          setVal(start);
        }, 30);
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end]);
  return <span ref={ref} className="tabular-nums">{val.toLocaleString()}{suffix}</span>;
};

/* ─── Pipeline step card ─── */
const PipelineStep = ({ step, icon: Icon, title, desc, color }: {
  step: string; icon: React.ElementType; title: string; desc: string; color: string;
}) => (
  <div className="relative group">
    <div className={`absolute -top-3 -left-1 text-xs font-black px-2 py-0.5 rounded-md ${color} text-white`}>
      {step}
    </div>
    <div className="rounded-2xl p-6 border border-border/50 bg-card/60 hover:border-primary/30 transition-all">
      <Icon className="w-6 h-6 text-primary mb-3" />
      <h4 className="font-bold text-foreground mb-2">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  </div>
);

/* ─── Feature card ─── */
const FeatureCard = ({ icon: Icon, title, desc, accent = false }: {
  icon: React.ElementType; title: string; desc: string; accent?: boolean;
}) => (
  <div className={`group rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-1 ${
    accent
      ? "bg-primary/10 border-primary/30 hover:border-primary/50 hover:shadow-[0_0_30px_hsl(11_100%_46%/0.15)]"
      : "bg-card/60 border-border/50 hover:border-primary/30 hover:shadow-[0_0_20px_hsl(11_100%_46%/0.08)]"
  }`}>
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
      accent ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground group-hover:text-primary"
    } transition-colors`}>
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="text-foreground font-bold text-lg mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
  </div>
);

/* ═══════════════════════════════════════
   T2 PITCH DECK
   ═══════════════════════════════════════ */
export default function T2PitchDeck() {
  const navigate = useNavigate();

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <SEO
        title="T2 Trend Intelligence — Real-Time K-Pop Commercial Keyword Radar"
        description="T2 detects which brands, products, and items K-Pop artists are associated with — before the market catches on."
        path="/pd"
      />

      {/* ───── 1. HERO ───── */}
      <Section className="overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/6 rounded-full blur-[180px]" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-blue-500/4 rounded-full blur-[140px]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-amber-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-8 w-auto mx-auto mb-6 opacity-60" />

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8">
            <Radar className="w-4 h-4" />
            T2 · Trend Intelligence Engine
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.08] tracking-tight mb-6">
            <span className="text-foreground">Detect What</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              K-Pop Moves
            </span>
            <br />
            <span className="text-foreground">Before the Market</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Which brand collaboration is gaining traction? Which product placement just went viral?
            <br className="hidden md:block" />
            <strong className="text-foreground">T2 finds the signal before it becomes noise.</strong>
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/t2")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              View Live Radar <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4 max-w-xl mx-auto">
            {[
              { label: "Keywords Tracked", value: 500, suffix: "+" },
              { label: "Sources / Day", value: 3, suffix: "" },
              { label: "Detection Lag", value: 15, suffix: "min" },
              { label: "Artists Monitored", value: 100, suffix: "+" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-xl md:text-2xl font-black text-primary">
                  <Counter end={s.value} suffix={s.suffix} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <ChevronDown className="w-6 h-6 text-muted-foreground mx-auto mt-16 animate-bounce" />
        </div>
      </Section>

      {/* ───── 2. PROBLEM ───── */}
      <Section id="problem">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><AlertTriangle className="w-3.5 h-3.5" /> The Problem</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Billions in <span className="text-primary">Brand Deals</span>, Zero Visibility
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              K-Pop drives massive commercial impact — but detecting <em>which</em> products and brands are trending around <em>which</em> artists happens too late.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Clock,
                title: "Too Slow",
                desc: "By the time traditional analytics spots a trend, the opportunity window for brand activation has already closed.",
              },
              {
                icon: Layers,
                title: "Too Scattered",
                desc: "Brand mentions are spread across news, YouTube, social media, and fan communities — no single source of truth.",
              },
              {
                icon: Target,
                title: "Too Generic",
                desc: "Existing tools track artist popularity, not the specific items and brands artists make relevant.",
              },
            ].map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 3. PIPELINE ───── */}
      <Section id="pipeline">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Activity className="w-3.5 h-3.5" /> Detection Pipeline</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              4-Phase <span className="text-primary">AI Pipeline</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Automated keyword detection across domestic news, global web, and YouTube — then validated with real-time search volume tracking.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <PipelineStep
              step="Phase 1"
              icon={Newspaper}
              title="Detect (Naver)"
              desc="Scan 50+ Korean news articles per artist via Naver API. GPT-4o-mini extracts brand/product entities with text-match verification."
              color="bg-blue-600"
            />
            <PipelineStep
              step="Phase 2"
              icon={Globe}
              title="Detect (Global)"
              desc="Perplexity AI scans global news and social media for international brand collaborations and viral product mentions."
              color="bg-violet-600"
            />
            <PipelineStep
              step="Phase 3"
              icon={Youtube}
              title="Detect (YouTube)"
              desc="YouTube Data API searches recent videos. AI analyzes titles and descriptions for product placements and brand features."
              color="bg-red-600"
            />
            <PipelineStep
              step="Phase 4"
              icon={TrendingUp}
              title="Track (Google Trends)"
              desc="SerpAPI validates detected keywords against real-time Google Trends search volume. Measures actual market interest."
              color="bg-primary"
            />
          </div>

          {/* Pipeline flow diagram */}
          <div className="mt-12 rounded-2xl border border-border/50 bg-card/40 p-8">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {[
                { label: "Naver News", icon: Newspaper, bg: "bg-blue-600/20 text-blue-400" },
                { label: "→", icon: null, bg: "" },
                { label: "Global Web", icon: Globe, bg: "bg-violet-600/20 text-violet-400" },
                { label: "→", icon: null, bg: "" },
                { label: "YouTube", icon: Youtube, bg: "bg-red-600/20 text-red-400" },
                { label: "→", icon: null, bg: "" },
                { label: "Google Trends", icon: TrendingUp, bg: "bg-primary/20 text-primary" },
                { label: "→", icon: null, bg: "" },
                { label: "Live Radar", icon: Radar, bg: "bg-amber-600/20 text-amber-400" },
              ].map((item, i) =>
                item.icon ? (
                  <div key={i} className={`flex items-center gap-2 px-4 py-2 rounded-xl ${item.bg} text-sm font-semibold`}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </div>
                ) : (
                  <span key={i} className="text-muted-foreground font-bold text-lg">→</span>
                )
              )}
            </div>
            <p className="text-center text-muted-foreground text-sm mt-4">
              Fully automated orchestration via <code className="text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded text-xs">ktrenz-trend-cron</code> — batch processing with rate-limit protection
            </p>
          </div>
        </div>
      </Section>

      {/* ───── 4. AI SAFEGUARDS ───── */}
      <Section id="safeguards">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Shield className="w-3.5 h-3.5" /> AI Safeguards</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Anti-Hallucination <span className="text-primary">Architecture</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              LLMs hallucinate. Our pipeline is designed to catch every false positive before it reaches users.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Search,
                title: "Text-Match Verification",
                desc: "Every extracted keyword is checked against the original source text. If the keyword doesn't literally appear in the article or video metadata, it's filtered out.",
                accent: true,
              },
              {
                icon: Database,
                title: "Cross-Artist Deduplication",
                desc: "Keywords already associated with another artist within the 7-day window are automatically filtered — preventing generic terms from polluting individual profiles.",
                accent: true,
              },
              {
                icon: Brain,
                title: "Strict AI Prompting",
                desc: "System prompts enforce ZERO external knowledge usage. The AI can only analyze provided text, never rely on prior training data about artist endorsements.",
              },
              {
                icon: BarChart3,
                title: "Confidence Scoring",
                desc: "Each keyword gets a 0.0–1.0 confidence score based on context clarity. Low-confidence items are automatically deprioritized in the radar view.",
              },
            ].map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 5. SCORING ENGINE ───── */}
      <Section id="scoring">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><LineChart className="w-3.5 h-3.5" /> Scoring Engine</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              From Detection to <span className="text-primary">Influence Index</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Detected keywords are tracked over time. We measure how quickly search interest responds to artist–brand associations.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {[
              {
                label: "Baseline Score",
                value: "0–100",
                desc: "Initial search volume at the moment of detection from Google Trends data",
                color: "text-blue-400",
              },
              {
                label: "Peak Score",
                value: "0–100",
                desc: "Maximum search volume reached during the tracking window",
                color: "text-amber-400",
              },
              {
                label: "Influence Index",
                value: "Δ%",
                desc: "Percentage growth from baseline to peak — the true measure of artist impact",
                color: "text-primary",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl p-6 border border-border/50 bg-card/60 text-center">
                <div className={`text-3xl font-black ${item.color} mb-2`}>{item.value}</div>
                <h4 className="font-bold text-foreground mb-2">{item.label}</h4>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-bold text-foreground text-lg mb-2">Example: NCT Taeyong × Loewe</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Detected via Naver News at baseline score 72. After 2 hours of tracking, peak score reached 75.
                  <strong className="text-foreground"> Influence Index: +4.17%</strong> — indicating steady, sustained interest rather than a viral spike.
                  This pattern is typical of established luxury brand ambassadorships.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 6. DATA SOURCES ───── */}
      <Section id="sources">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Radio className="w-3.5 h-3.5" /> Data Sources</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Multi-Source <span className="text-primary">Intelligence</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-xl text-foreground mb-4">Detection Sources</h3>
              {[
                { icon: Newspaper, label: "Naver News API", desc: "50+ articles per artist, 24h window, Korean language focus", color: "bg-green-500/20 text-green-400" },
                { icon: Globe, label: "Perplexity AI (Sonar)", desc: "Global web search for international brand news and social posts", color: "bg-violet-500/20 text-violet-400" },
                { icon: Youtube, label: "YouTube Data API", desc: "15 recent videos per member, 3-day window, title + description analysis", color: "bg-red-500/20 text-red-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-4 rounded-xl p-4 border border-border/50 bg-card/40">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">{item.label}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-xl text-foreground mb-4">Validation & Tracking</h3>
              {[
                { icon: TrendingUp, label: "Google Trends (SerpAPI)", desc: "Real-time search volume for keyword × artist combinations", color: "bg-primary/20 text-primary" },
                { icon: Brain, label: "OpenAI GPT-4o-mini", desc: "Commercial entity extraction with strict hallucination controls", color: "bg-cyan-500/20 text-cyan-400" },
                { icon: Database, label: "Supabase Edge Functions", desc: "Serverless pipeline orchestration with batch processing", color: "bg-emerald-500/20 text-emerald-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-4 rounded-xl p-4 border border-border/50 bg-card/40">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">{item.label}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 7. KEYWORD CATEGORIES ───── */}
      <Section id="categories">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Eye className="w-3.5 h-3.5" /> Keyword Categories</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              7 Commercial <span className="text-primary">Verticals</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Every detected keyword is classified into one of seven commercial categories — enabling vertical-specific analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: "👜", label: "Fashion", desc: "Luxury brands, clothing, accessories", color: "border-pink-500/30 bg-pink-500/5" },
              { emoji: "💄", label: "Beauty", desc: "Cosmetics, skincare, fragrances", color: "border-rose-500/30 bg-rose-500/5" },
              { emoji: "🏷️", label: "Brand", desc: "Endorsements, ambassadorships", color: "border-blue-500/30 bg-blue-500/5" },
              { emoji: "📦", label: "Product", desc: "Tech, electronics, consumer goods", color: "border-cyan-500/30 bg-cyan-500/5" },
              { emoji: "🍽️", label: "Food", desc: "Restaurants, cafes, F&B brands", color: "border-amber-500/30 bg-amber-500/5" },
              { emoji: "📍", label: "Place", desc: "Travel destinations, venues", color: "border-green-500/30 bg-green-500/5" },
              { emoji: "📺", label: "Media", desc: "TV shows, movies, interviews", color: "border-violet-500/30 bg-violet-500/5" },
              { emoji: "🔥", label: "Trending", desc: "All categories combined", color: "border-primary/30 bg-primary/5" },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl p-5 border ${item.color} text-center transition-all hover:-translate-y-0.5`}>
                <div className="text-3xl mb-2">{item.emoji}</div>
                <h4 className="font-bold text-foreground text-sm mb-1">{item.label}</h4>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 8. USE CASES ───── */}
      <Section id="usecases">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Target className="w-3.5 h-3.5" /> Use Cases</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Who Needs <span className="text-primary">T2</span>?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: MessageSquare,
                title: "Brand Managers",
                desc: "Monitor which K-Pop artists are organically driving interest in your products. Identify potential ambassadors based on real influence data, not social follower counts.",
                accent: true,
              },
              {
                icon: BarChart3,
                title: "Entertainment Agencies",
                desc: "Understand your artists' commercial footprint. Track which endorsement deals generate genuine search interest and which ones go unnoticed.",
              },
              {
                icon: TrendingUp,
                title: "Market Researchers",
                desc: "Quantify the real-time commercial impact of K-Pop on consumer behavior. Access structured data on artist–brand associations across categories.",
              },
            ].map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 9. TECH ARCHITECTURE ───── */}
      <Section id="architecture">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Database className="w-3.5 h-3.5" /> Architecture</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Built for <span className="text-primary">Scale</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
              <h3 className="font-bold text-lg text-foreground mb-4">Pipeline Architecture</h3>
              <div className="space-y-3 text-sm">
                {[
                  "Batch processing: 3–5 artists per invocation",
                  "Self-chaining via Edge Function orchestration",
                  "Rate-limit protection: 3s between API calls",
                  "Throttle detection with automatic chain break",
                  "7-day deduplication window across all artists",
                  "Backfill mode for missing translations & images",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/40 p-6">
              <h3 className="font-bold text-lg text-foreground mb-4">Data Quality Controls</h3>
              <div className="space-y-3 text-sm">
                {[
                  "Text-match verification against source content",
                  "Cross-artist keyword deduplication",
                  "Confidence scoring (0.0–1.0) per keyword",
                  "Category classification (7 verticals)",
                  "Multi-language context (EN/KO/JA/ZH)",
                  "Source URL + OG image preservation",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 10. CTA ───── */}
      <Section>
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[160px]" />
          </div>

          <SectionTag><Zap className="w-3.5 h-3.5" /> Get Started</SectionTag>

          <h2 className="text-3xl md:text-5xl font-black mb-6">
            See the <span className="text-primary">Trend Radar</span> Live
          </h2>

          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Explore real-time keyword detections, influence scores, and commercial insights across 100+ K-Pop artists.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/t2")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              Open T2 Radar <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
            <button
              onClick={() => navigate("/pitchdeck")}
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              View Full Platform Deck
            </button>
          </div>

          <p className="text-muted-foreground text-sm mt-12">
            Part of the <strong className="text-foreground">KTrenZ</strong> ecosystem — Real-time K-Pop intelligence platform
          </p>
        </div>
      </Section>
    </div>
  );
}
