import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import {
  Flame, Activity, BarChart3, Zap, Wand2, Bot, Sparkles,
  TrendingUp, Eye, Radio, Layers, Target, Shield, ArrowRight,
  ChevronDown, Music, Globe, Users
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";

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
      <Helmet>
        <title>K-TRENZ — The Only Place to See K-Pop Firepower Live</title>
        <meta
          name="description"
          content="K-TRENZ: Real-time K-Pop artist momentum engine powered by FES data, fan lightsticks, and AI agent."
        />
      </Helmet>

      {/* ───── 1. HERO ───── */}
      <Section className="overflow-hidden">
        {/* bg glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[160px]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-8 w-auto mx-auto mb-8" />

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
            <span className="text-foreground">K-Pop 아티스트의</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              실시간 화력
            </span>
            <span className="text-foreground">을</span>
            <br />
            <span className="text-foreground">볼 수 있는 유일한 곳</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            유튜브 · X · 틱톡 등 다양한 플랫폼 데이터를 하나의 점수로 융합한
            <br className="hidden md:block" />
            <strong className="text-foreground">Fan Energy Score(FES)</strong>가 실시간으로 아티스트 모멘텀을 측정합니다.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              라이브 랭킹 보기
            </button>
            <button
              onClick={() => navigate("/agent")}
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              AI 에이전트 체험
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { label: "추적 아티스트", value: 200, suffix: "+" },
              { label: "데이터 포인트/일", value: 50000, suffix: "+" },
              { label: "실시간 갱신", value: 24, suffix: "h" },
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
              멀티 플랫폼 데이터를 실시간으로 수집하고, 독자적인 가중치 알고리즘으로
              하나의 에너지 점수로 합성합니다.
            </p>
          </div>

          {/* Pipeline */}
          <div className="grid md:grid-cols-4 gap-4">
            {[
              {
                icon: Globe,
                step: "01",
                title: "수집",
                desc: "YouTube · X · TikTok 등 다양한 소스에서 조회수, 언급량, 반응 지표를 자동 수집",
              },
              {
                icon: Layers,
                step: "02",
                title: "정규화",
                desc: "플랫폼별 스케일 차이를 정규화하여 동일 기준선으로 변환",
              },
              {
                icon: Activity,
                step: "03",
                title: "가중 합산",
                desc: "Energy · Buzz · YouTube 등 멀티소스 가중치로 FES 산출",
              },
              {
                icon: TrendingUp,
                step: "04",
                title: "모멘텀 계산",
                desc: "24h / 7d 변화율로 가속도(Momentum)와 추세 방향 판별",
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

      {/* ───── 3. VISUALIZATION — 가속도 & 밀도 ───── */}
      <Section id="viz">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Eye className="w-3.5 h-3.5" /> Visualization
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">가속도</span>와{" "}
              <span className="text-primary">밀도</span>로 읽는 화력
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              숫자 나열이 아닌, 한눈에 체감되는 에너지 맵.
              면적은 에너지량, 색상은 추세, 네온은 폭발을 뜻합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Treemap preview */}
            <div className="relative bg-card/60 border border-border/50 rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-[80px]" />
              <h3 className="text-foreground font-bold text-xl mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> 에너지 트리맵
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                상위 아티스트를 면적 비례로 배치. 25% 이상 급증 시 네온 글로우 효과.
              </p>
              {/* Fake treemap blocks */}
              <div className="grid grid-cols-4 grid-rows-3 gap-1.5 h-40">
                <div className="col-span-2 row-span-2 rounded-lg bg-red-500/30 border border-red-500/40 flex items-center justify-center text-xs font-bold text-red-300 shadow-[0_0_12px_hsl(0_80%_50%/0.3)]">
                  BTS
                </div>
                <div className="col-span-1 row-span-1 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[10px] font-bold text-green-300">
                  aespa
                </div>
                <div className="col-span-1 row-span-2 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-[10px] font-bold text-red-300">
                  IVE
                </div>
                <div className="col-span-1 row-span-1 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-300">
                  LE SSE..
                </div>
                <div className="col-span-2 row-span-1 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center text-[10px] font-bold text-green-300">
                  BLACKPINK
                </div>
                <div className="col-span-1 row-span-1 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-[10px] font-bold text-blue-300">
                  NCT
                </div>
                <div className="col-span-1 row-span-1 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-[10px] font-bold text-green-300">
                  SKZ
                </div>
              </div>
            </div>

            {/* Legend / Interpretation */}
            <div className="space-y-5">
              {[
                {
                  color: "bg-red-500",
                  label: "급상승 (≥15%)",
                  desc: "에너지가 빠르게 가속 중. 컴백, 바이럴, 주요 이벤트 감지.",
                },
                {
                  color: "bg-green-500",
                  label: "안정 유지 (≥0%)",
                  desc: "꾸준한 팬덤 활동으로 에너지가 견조하게 유지.",
                },
                {
                  color: "bg-blue-500",
                  label: "하락 추세 (<0%)",
                  desc: "활동 감소 또는 자연 감쇠. 다음 활동 시 반등 기대.",
                },
                {
                  color: "bg-red-500 shadow-[0_0_12px_hsl(0_80%_50%/0.5)]",
                  label: "네온 폭발 (≥25%)",
                  desc: "극단적 급등. 글로우 효과로 즉각적인 시각 경고.",
                },
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
        </div>
      </Section>

      {/* ───── 4. MERITS — 왜 K-TRENZ인가 ───── */}
      <Section id="merits">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Sparkles className="w-3.5 h-3.5" /> Why K-TRENZ
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              기존 차트와는 <span className="text-primary">차원이 다릅니다</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <FeatureCard
              icon={Zap}
              title="실시간 모멘텀"
              desc="주간/월간 집계가 아닌, 실시간으로 변하는 에너지 흐름을 초 단위로 추적합니다."
              accent
            />
            <FeatureCard
              icon={Layers}
              title="멀티소스 융합"
              desc="유튜브, X, 틱톡 등 다양한 소스 데이터를 하나의 통합 점수로 합성. 편향 없는 종합 지표."
            />
            <FeatureCard
              icon={Target}
              title="AI 개인 비서"
              desc="에이전트가 관심 아티스트의 실시간 화력 변동과 최적 스트리밍 전략을 자동으로 브리핑합니다."
            />
            <FeatureCard
              icon={Eye}
              title="직관적 시각화"
              desc="트리맵, 스파크라인, 에너지 차트로 복잡한 데이터를 한눈에 읽을 수 있습니다."
            />
            <FeatureCard
              icon={Shield}
              title="투명한 데이터"
              desc="모든 점수 산출 기준과 변동 내역이 공개. 팬덤 간 공정한 경쟁의 장."
              accent
            />
            <FeatureCard
              icon={Radio}
              title="스트리밍 전략"
              desc="AI가 아티스트별 최적 스트리밍 전략을 실시간 생성. 팬 활동의 효율을 극대화."
            />
          </div>
        </div>
      </Section>

      {/* ───── 5. 마술봉 무기 = AI 에이전트 ───── */}
      <Section id="weapon">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag>
              <Wand2 className="w-3.5 h-3.5" /> Magic Wand
            </SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              팬에게 쥐어주는
              <br />
              <span className="text-primary">강력한 마술봉 무기</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              AI 에이전트는 단순한 챗봇이 아닙니다.
              <br />
              실시간 데이터로 무장한, 팬 전용 <strong className="text-foreground">전략 무기</strong>입니다.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: "🔍",
                title: "실시간 화력 정찰",
                desc: "내 아티스트의 FES 점수, 순위, 에너지 변동을 실시간으로 브리핑받습니다.",
              },
              {
                icon: "📋",
                title: "스트리밍 작전 수립",
                desc: "AI가 플랫폼별 가중치를 분석해 가장 효율적인 스트리밍 순서와 전략을 제시합니다.",
              },
              {
                icon: "🎯",
                title: "관심 아티스트 관리",
                desc: "\"BTS 추가해줘\" 한마디로 워치리스트 등록. 자연어로 모든 관리가 가능합니다.",
              },
              {
                icon: "📊",
                title: "랭킹 카드 즉시 조회",
                desc: "퀵 버튼 하나로 실시간 TOP 랭킹을 인라인 카드로 바로 확인합니다.",
              },
              {
                icon: "⚡",
                title: "트렌드 변동 감지",
                desc: "급상승·급하락 이벤트를 에이전트가 자동 감지하고 알려줍니다.",
              },
              {
                icon: "🤖",
                title: "24시간 대기",
                desc: "언제든 질문하면 즉시 응답. 잠들지 않는 팬 활동 파트너.",
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
              데이터 + AI = 팬의 <strong className="text-foreground">최강 무기</strong>
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
                AI <span className="text-primary">에이전트</span>가
                <br />
                당신의 덕질을 돕습니다
              </h2>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                관심 아티스트를 등록하면, 실시간 브리핑 · 순위 변동 알림 ·
                스트리밍 전략까지 AI가 챙겨드립니다.
              </p>
              <ul className="space-y-4">
                {[
                  "자연어로 아티스트 등록 & 관리",
                  "FES 기반 실시간 트렌드 브리핑",
                  "맞춤형 스트리밍 최적화 가이드",
                  "퀵 버튼으로 즉시 랭킹 카드 조회",
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

            {/* Chat mock */}
            <div className="bg-card/80 border border-border/50 rounded-2xl p-5 space-y-3 shadow-[0_0_40px_hsl(11_100%_46%/0.06)]">
              <div className="flex items-center gap-2 pb-3 border-b border-border/40 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <span className="text-foreground font-bold text-sm">K-TRENZ Agent</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              {[
                { role: "user", text: "BTS 실시간 화력 어때?" },
                {
                  role: "agent",
                  text: "🔥 BTS 현재 FES 9,420 — Energy +18.3% 급상승 중입니다! 스포티파이 스트리밍이 컴백 효과로 폭발하고 있어요.",
                },
                { role: "user", text: "스트리밍 전략 짜줘" },
                {
                  role: "agent",
                  text: "📋 Dynamite → Butter → Spring Day 순서로 3회 반복 스트리밍을 추천드립니다. 현재 스포티파이 가중치가 높아 효율 극대화됩니다.",
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
              주요 <span className="text-primary">기능</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Flame, title: "실시간 FES 랭킹", desc: "아티스트별 Fan Energy Score 실시간 순위 및 변동 추적." },
              { icon: BarChart3, title: "에너지 트리맵", desc: "면적 = 에너지, 색상 = 추세. 한 화면에 시장 전체를 파악." },
              { icon: Music, title: "스트리밍 가이드", desc: "AI가 아티스트별 최적 스트리밍 전략을 실시간 생성." },
              { icon: Wand2, title: "AI 마술봉 무기", desc: "에이전트가 실시간 데이터로 무장해 팬의 덕질 효율을 극대화." },
              { icon: Bot, title: "팬 에이전트 봇", desc: "자연어로 소통하는 AI. 관심 아티스트 브리핑 & 전략 제공." },
              { icon: Users, title: "팬덤 커뮤니티", desc: "위키, 포스트, 챌린지, DM 등 팬 활동을 위한 통합 공간." },
            ].map((f, i) => (
              <FeatureCard key={i} icon={f.icon} title={f.title} desc={f.desc} accent={i === 0} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 8. CTA — 실시간 화력 결과 ───── */}
      <Section id="cta">
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[140px]" />
          </div>

          <div className="text-6xl mb-6">🔥</div>
          <h2 className="text-3xl md:text-5xl font-black mb-6">
            지금 바로
            <br />
            <span className="text-primary">실시간 화력</span>을 확인하세요
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-lg mx-auto">
            K-Pop 팬이라면 놓칠 수 없는 에너지 대시보드.
            <br />
            당신의 아티스트가 지금 어디에 있는지 확인하세요.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="group px-10 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg hover:brightness-110 transition-all shadow-[0_0_30px_hsl(11_100%_46%/0.35)] flex items-center gap-2"
            >
              라이브 대시보드
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate("/agent")}
              className="px-10 py-4 rounded-xl bg-card text-foreground font-bold text-lg hover:bg-secondary transition-all border border-border flex items-center gap-2"
            >
              <Bot className="w-5 h-5" />
              에이전트 시작
            </button>
          </div>

          <p className="text-muted-foreground text-xs mt-16">
            © 2025 K-TRENZ. Built for K-Pop fans, by fans.
          </p>
        </div>
      </Section>
    </div>
  );
}
