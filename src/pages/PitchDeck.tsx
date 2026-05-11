/**
 * /pd, /pitchdeck — Pitch deck for KTrenZ Discover (h1 P10 launched 2026-05-10).
 *
 * Replaces the legacy Battle-centric deck. Reflects the post-launch positioning:
 * Discover game on top of a multi-source K-pop trend intelligence engine,
 * with B2B Trend-Intelligence-as-a-Service as the monetization core.
 *
 * Korean primary copy. /pd3 keeps the Web3 / token-focused English deck.
 */
import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import {
  Activity, BarChart3, Sparkles, TrendingUp, Layers, ArrowRight,
  ChevronDown, Globe, Users, Building2, Megaphone, Briefcase, Newspaper,
  Lightbulb, ShieldCheck, Linkedin, Database, Calendar, LineChart,
} from "lucide-react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";
import ceoHanKim from "@/assets/team/ceo-han-kim.jpg";
import cfoChrisLee from "@/assets/team/cfo-chris-lee.jpg";
import cooWilliamYang from "@/assets/team/coo-william-yang.jpg";

/* ─────── Layout primitives ─────── */
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

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl bg-card/60 border border-border/50 p-6 ${className}`}>
    {children}
  </div>
);

/* ════════════════════════════════════════════════════════════════════ */

export default function PitchDeck() {
  const navigate = useNavigate();
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="KTrenZ — 다음 K-pop 트렌드를 30초 안에"
        description="600+ 아티스트 데이터베이스와 글로벌 팬덤 집단지성을 결합한 K-pop 트렌드 예측 플랫폼. B2B Trend Intelligence as a Service."
        path="/pd"
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
            <Sparkles className="w-3 h-3" /> Discover · 2026-05-10 라이브
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight mb-6">
            <span className="text-foreground">다음 K-pop 트렌드를</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              30초 안에 찾아낸다
            </span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            매일 큐레이션된 24장의 K-pop 콘텐츠 카드.
            <br className="hidden md:block" />
            글로벌 팬덤이 베팅하고, <strong className="text-foreground">우리 엔진은 모멘텀을 데이터화</strong>합니다.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              라운드 열기
            </button>
            <a
              href="#b2b"
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              B2B 데이터 문의
            </a>
          </div>

          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            {[
              { label: "아티스트 DB", value: "600+" },
              { label: "데이터 소스", value: "7+" },
              { label: "일일 큐레이션", value: "24" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-primary tabular-nums">
                  {s.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <ChevronDown className="w-6 h-6 text-muted-foreground mx-auto mt-16 animate-bounce" />
        </div>
      </Section>

      {/* ───── 2. PROBLEM ───── */}
      <Section id="problem" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Lightbulb className="w-3.5 h-3.5" /> Problem</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              K-pop 트렌드 발견의 <span className="text-primary">3가지 공백</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <Card className="hover:border-primary/30 transition-colors">
              <Globe className="w-7 h-7 text-primary mb-3" />
              <h3 className="font-bold text-base mb-2">글로벌 인지 격차</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                "이 아티스트가 뜬다"는 시그널이 한국 외 팬덤엔
                평균 <strong className="text-foreground">6~14일 늦게</strong> 도착.
                먼저 베팅한 사람이 모멘텀을 가져갑니다.
              </p>
            </Card>
            <Card className="hover:border-primary/30 transition-colors">
              <Activity className="w-7 h-7 text-primary mb-3" />
              <h3 className="font-bold text-base mb-2">정량 시그널 부재</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                좋아요·조회수는 <strong className="text-foreground">사후 데이터</strong>.
                "이 콘텐츠가 7일 후 뜰까?"라는
                <strong className="text-foreground"> 사전 예측 정량 지표</strong>가 시장에 없음.
              </p>
            </Card>
            <Card className="hover:border-primary/30 transition-colors">
              <Building2 className="w-7 h-7 text-primary mb-3" />
              <h3 className="font-bold text-base mb-2">B2B 의사결정 공백</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                라벨·A&R·브랜드는 <em>컴백 타이밍 / 글로벌 마케팅 예산 / 신인 발굴</em>을
                직감으로 결정. 데이터 기반 의사결정 도구
                <strong className="text-foreground"> 시장 부재</strong>.
              </p>
            </Card>
          </div>
        </div>
      </Section>

      {/* ───── 3. SOLUTION — Discover Game ───── */}
      <Section id="solution">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Sparkles className="w-3.5 h-3.5" /> Solution</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Discover — <span className="text-primary">Snap-Judgment</span> 예측 게임
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              사용자 게임 자체가 곧 데이터 수집기. 30초 베팅이 7일 후 정산되며,
              그 데이터는 글로벌 팬덤 집단지성으로 누적됩니다.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mb-10">
            {[
              { step: "01", title: "매일 24장", desc: "엔진이 큐레이션한 K-pop 콘텐츠 카드" },
              { step: "02", title: "30초 베팅", desc: "×1 / ×2 / ×4 강도로 \"뜰까?\" 결정" },
              { step: "03", title: "7일 후 정산", desc: "코호트 상위 30% = 적중" },
              { step: "04", title: "💎 보상 → Spotify", desc: "10,000 K-Cash로 1개월 프리미엄 교환" },
            ].map((item) => (
              <div key={item.step} className="relative bg-card/60 border border-border/50 rounded-2xl p-6 hover:border-primary/30 transition-all">
                <div className="text-xs font-bold text-primary mb-3">{item.step}</div>
                <div className="font-bold mb-2">{item.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>

          <Card className="bg-gradient-to-br from-primary/10 to-orange-500/5 border-primary/20">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <Lightbulb className="w-8 h-8 text-primary shrink-0" />
              <p className="text-sm md:text-base text-foreground leading-relaxed">
                <strong>핵심 인사이트</strong>: 사용자가 ×4를 누른다는 건 "이게 뜬다"고 K-Cash를 거는 강한 확신.
                좋아요·조회수보다 <strong className="text-primary">선행 시그널</strong>로 작동.
                이게 우리 데이터 자산의 차별점입니다.
              </p>
            </div>
          </Card>
        </div>
      </Section>

      {/* ───── 4. DATA ENGINE ───── */}
      <Section id="engine" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Database className="w-3.5 h-3.5" /> Data Engine</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">우리 엔진</span>이 가진 6가지 자산
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: Users,
                title: "Star DB · 600+ 아티스트",
                tag: "Asset",
                desc: "그룹·멤버·소셜핸들 매핑. 콘텐츠 → 아티스트 식별 정확도가 모든 분석의 기반.",
              },
              {
                icon: Layers,
                title: "Multi-source 7+ 채널",
                tag: "Coverage",
                desc: "Naver News · YouTube · TikTok · Instagram · Spotify · Reddit · 커머스. 단일 플랫폼 봇·왜곡 면역.",
              },
              {
                icon: BarChart3,
                title: "24장 큐레이션 알고리즘",
                tag: "Precision",
                desc: "engagement × freshness × per-artist cap × 4-layer dedup (썸네일 fingerprint, 같은 날짜+아티스트, Jaccard 토큰, off-topic 해시태그). 사람 손 안 댄 일관 필터링.",
              },
              {
                icon: TrendingUp,
                title: "Cohort Percentile 정산",
                tag: "Stable",
                desc: "drop_date+region 단위 코호트, 상위 30% = hit. 절대 기준 아닌 상대평가 → market noise 면역, hit rate 안정.",
              },
              {
                icon: Activity,
                title: "사용자 ×N 강도 시그널",
                tag: "Edge",
                desc: "베팅 강도가 confidence 지표로 누적. 단순 view보다 \"사전 예측 확신도\" — 가장 강력한 leading indicator.",
              },
              {
                icon: Calendar,
                title: "지속 시계열 데이터",
                tag: "Asset",
                desc: "engagement_score 일일 cron 업데이트 누적. day-7 / 14 / 21 / 30 trajectory 자동 추적 가능 (인프라 보유).",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl bg-card/60 border border-border/50 p-6 hover:border-primary/30 transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base">{item.title}</h3>
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        {item.tag}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 4.5 PREDICTION LAYERS — 7일 게임 / 30일 인사이트 ───── */}
      <Section id="layers">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><LineChart className="w-3.5 h-3.5" /> Prediction Layers</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              7일 <span className="text-primary">게임</span> / 30일 <span className="text-primary">인사이트</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              사용자 게임은 7일 코호트로 빠르게 돌지만, 그 데이터가 곧바로 30일 모멘텀으로 누적됩니다.
              <br className="hidden md:block" />
              4번의 7일 cohort가 한 달 단위 fidelity를 검증.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-4 font-semibold">Layer</th>
                  <th className="text-left p-4 font-semibold">주기</th>
                  <th className="text-left p-4 font-semibold">출력</th>
                  <th className="text-left p-4 font-semibold">대상</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <tr>
                  <td className="p-4 font-bold">Discover 게임</td>
                  <td className="p-4 text-muted-foreground">7일</td>
                  <td className="p-4 text-muted-foreground">hit/miss · K-Cash</td>
                  <td className="p-4"><span className="text-primary font-semibold">사용자</span></td>
                </tr>
                <tr>
                  <td className="p-4 font-bold">Trajectory 추적</td>
                  <td className="p-4 text-muted-foreground">7→14→21→30일</td>
                  <td className="p-4 text-muted-foreground">지속성 % (flash vs sustained)</td>
                  <td className="p-4 text-muted-foreground">내부 검증</td>
                </tr>
                <tr className="bg-primary/[0.03]">
                  <td className="p-4 font-bold">Rolling 30-day 모멘텀</td>
                  <td className="p-4 text-muted-foreground">30일 sliding</td>
                  <td className="p-4 font-semibold">아티스트·키워드별 모멘텀 점수</td>
                  <td className="p-4"><span className="text-primary font-semibold">B2B (라벨·브랜드)</span></td>
                </tr>
                <tr className="bg-primary/[0.03]">
                  <td className="p-4 font-bold">Weekly 리포트</td>
                  <td className="p-4 text-muted-foreground">주 1회</td>
                  <td className="p-4 font-semibold">Top 10 떠오르는 아티스트 + 키워드 클러스터</td>
                  <td className="p-4"><span className="text-primary font-semibold">B2B 구독</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            인프라 (engagement_score 일일 cron · vouches 영구 저장 · resolution 스냅샷) 이미 보유 — 집계만 추가.
          </p>
        </div>
      </Section>

      {/* ───── 5. B2B BUSINESS MODEL ───── */}
      <Section id="b2b" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Briefcase className="w-3.5 h-3.5" /> Business Model</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Trend Intelligence <span className="text-primary">as a Service</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              사용자 게임이 데이터를 만들고, 그 데이터를 4가지 트랙으로 판매합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                icon: Building2,
                track: "Track 1",
                client: "엔터테인먼트 / 라벨",
                clientNote: "HYBE · SM · JYP · YG급",
                product: "Predictive Dashboard",
                products: [
                  "다음 30일 뜰 아티스트·콘텐츠 예측",
                  "컴백 타이밍 시뮬레이터",
                  "글로벌 마케팅 예산 ROI 모델",
                ],
                price: "월 $5K~$50K 구독",
                priceNote: "회사 규모별 tier",
              },
              {
                icon: Megaphone,
                track: "Track 2",
                client: "브랜드 / 광고주",
                clientNote: "코카콜라 · 삼성 · 현대 등",
                product: "Quarterly Trend Report",
                products: [
                  "30일 후 글로벌 모멘텀 예상 아티스트 TOP 10",
                  "사전 모델 콜라보 매칭",
                  "캠페인 timing + 예산 모델",
                ],
                price: "분기 리포트당 $20K",
                priceNote: "+ 캠페인 분석 add-on",
              },
              {
                icon: Users,
                track: "Track 3",
                client: "A&R / 에이전시",
                clientNote: "신인 발굴 · 트레이닝",
                product: "Talent API + Momentum Tracker",
                products: [
                  "신인·트레이닝 후보 발굴",
                  "아티스트별 모멘텀 알람",
                  "Raw API 직접 연동",
                ],
                price: "월 $1K~$5K",
                priceNote: "API volume tier",
              },
              {
                icon: Newspaper,
                track: "Track 4",
                client: "미디어 / 콘텐츠 제작",
                clientNote: "Dispatch · 1theK · 유튜버",
                product: "Topic Priority Dashboard",
                products: [
                  "다음 화제거리 우선순위",
                  "키워드 모멘텀 알림",
                  "콘텐츠 제작 sequence",
                ],
                price: "월 $500~$2K",
                priceNote: "SaaS subscription",
              },
            ].map((t) => (
              <div key={t.track} className="rounded-2xl bg-card/60 border border-border/50 p-6 hover:border-primary/30 transition-all">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                    <t.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">{t.track}</div>
                    <h3 className="font-bold text-lg leading-tight">{t.client}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.clientNote}</p>
                  </div>
                </div>

                <div className="text-sm font-bold text-foreground mb-2">{t.product}</div>
                <ul className="space-y-1.5 mb-4">
                  {t.products.map((p) => (
                    <li key={p} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1.5">▸</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-3 border-t border-border/30">
                  <div className="text-base font-black text-primary">{t.price}</div>
                  <div className="text-[11px] text-muted-foreground">{t.priceNote}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 6. WHY US — Comparison ───── */}
      <Section id="differentiation">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><ShieldCheck className="w-3.5 h-3.5" /> Why Us</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              우리만 할 수 있는 <span className="text-primary">4가지</span>
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card/60">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left p-4 font-semibold"></th>
                  <th className="text-center p-4 font-semibold text-primary">KTrenZ</th>
                  <th className="text-center p-4 font-semibold">Spotify Trends</th>
                  <th className="text-center p-4 font-semibold">Twitter Trending</th>
                  <th className="text-center p-4 font-semibold">Stan Twitter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[
                  { feature: "사전 예측 (7일 전)", ktrenz: "✓", spotify: "—", twitter: "—", stan: "—" },
                  { feature: "Multi-source (7+)", ktrenz: "✓", spotify: "Spotify only", twitter: "Twitter only", stan: "—" },
                  { feature: "K-pop 특화 Star DB", ktrenz: "✓ 600+", spotify: "—", twitter: "—", stan: "비정량" },
                  { feature: "정량 시그널 (cohort %ile)", ktrenz: "✓", spotify: "—", twitter: "—", stan: "—" },
                  { feature: "B2B API", ktrenz: "✓ planned", spotify: "—", twitter: "—", stan: "—" },
                ].map((r) => (
                  <tr key={r.feature}>
                    <td className="p-4 font-semibold">{r.feature}</td>
                    <td className="p-4 text-center text-primary font-bold">{r.ktrenz}</td>
                    <td className="p-4 text-center text-muted-foreground">{r.spotify}</td>
                    <td className="p-4 text-center text-muted-foreground">{r.twitter}</td>
                    <td className="p-4 text-center text-muted-foreground">{r.stan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ───── 7. TRACTION ───── */}
      <Section id="traction" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><TrendingUp className="w-3.5 h-3.5" /> Traction</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              <span className="text-primary">P10 라이브</span> 직후 — 진행 중
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              { done: true, title: "P10 라이브 (2026-05-10)", note: "/ 기본 home = Discover" },
              { done: true, title: "Star DB 600+ 아티스트", note: "그룹·멤버·소셜핸들 매핑 완료" },
              { done: true, title: "일일 cron 7개 소스 자동 수집", note: "24장 큐레이션 + 4-layer dedup" },
              { done: true, title: "K-Cash 통합 wallet", note: "Battle + H1 같은 지갑" },
              { done: true, title: "Spotify Premium 교환", note: "10,000 💎 = 1개월" },
              { done: false, title: "B2B Pilot 5건 (Q2~Q3)", note: "라벨·에이전시 컨택 진행 중" },
              { done: false, title: "Predictive Dashboard MVP (Q3)", note: "30일 모멘텀 + Trajectory" },
              { done: false, title: "첫 라벨급 paid customer (Q4)", note: "HYBE/SM 중 1 목표" },
            ].map((m) => (
              <div key={m.title} className={`rounded-xl border p-4 flex items-start gap-3 ${m.done ? "bg-primary/5 border-primary/30" : "bg-card/60 border-border/50"}`}>
                <div className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 ${m.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {m.done ? "✓" : "·"}
                </div>
                <div>
                  <div className="text-sm font-bold">{m.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 8. ROADMAP ───── */}
      <Section id="roadmap">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Calendar className="w-3.5 h-3.5" /> Roadmap</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              12개월 <span className="text-primary">실행 플랜</span>
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                phase: "Q2 — 검증",
                year: "2026",
                items: ["B2B pilot 5건 가계약", "Predictive Dashboard MVP", "데이터 정확도 검증 (day-7/30 hit rate)"],
              },
              {
                phase: "Q3 — 영업 본격화",
                year: "2026",
                items: ["Trajectory + 30일 모멘텀 production", "Weekly auto-report 발송 시스템", "첫 paid pilot 1건 close"],
              },
              {
                phase: "Q4 — 첫 메이저",
                year: "2026",
                items: ["HYBE/SM/JYP 중 1개 customer 계약", "API 베타 (Track 3 클라이언트 5팀)", "분기 리포트 (Track 2) 정기 발송"],
              },
              {
                phase: "Q1 — 글로벌 확장",
                year: "2027",
                items: ["동남아·일본 시장 (Star DB 1000+)", "Multi-region cohort", "Series A 펀딩"],
              },
            ].map((p) => (
              <div key={p.phase} className="rounded-2xl border border-border/50 bg-card/60 p-6">
                <div className="flex items-baseline gap-3 mb-3">
                  <h3 className="text-lg md:text-xl font-black">{p.phase}</h3>
                  <span className="text-xs font-bold text-primary">{p.year}</span>
                </div>
                <ul className="space-y-1.5">
                  {p.items.map((it) => (
                    <li key={it} className="text-sm text-muted-foreground flex items-start gap-2">
                      <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 9. TEAM ───── */}
      <Section id="team" className="bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-14">
            <SectionTag><Users className="w-3.5 h-3.5" /> Team</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              K-pop 인사이더 + <span className="text-primary">데이터 엔지니어링</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Han Kim",
                role: "CEO",
                img: ceoHanKim,
                bio: ["플랫폼 산업 베테랑", "스마트 컨트랙트 스페셜리스트", "풀스택 개발자"],
                linkedin: "https://www.linkedin.com/in/han-seok-kim-0057121aa/",
              },
              {
                name: "Chris Lee",
                role: "CFO",
                img: cfoChrisLee,
                bio: ["전략 리드", "플랫폼 아키텍처 &", "재무 설계 전문가"],
                linkedin: "https://www.linkedin.com/in/chris-lee-73a4a74/",
              },
              {
                name: "William Yang",
                role: "COO",
                img: cooWilliamYang,
                bio: ["커뮤니티", "팬덤 네트워크 스페셜리스트", "K-Culture Expert"],
                linkedin: "https://www.linkedin.com/in/william-yang-vim/",
              },
            ].map((m) => (
              <div
                key={m.name}
                className="rounded-2xl bg-card/60 border border-border/50 p-6 flex flex-col items-center"
              >
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden mb-4 ring-2 ring-primary/30">
                  <img src={m.img} alt={m.name} className="w-full h-full object-cover" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-foreground text-center mb-1">{m.name}</h3>
                <p className="text-primary font-semibold text-sm md:text-base text-center mb-3">{m.role}</p>
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
                  LinkedIn
                </a>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 10. CTA ───── */}
      <Section id="cta">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            다음 K-pop 트렌드를
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              먼저 알고 싶으시면
            </span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            팬덤은 ktrenz.com에서. B2B는 직접 문의 부탁드립니다.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="px-8 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              라운드 열기
            </button>
            <a
              href="mailto:hello@ktrenz.com?subject=B2B Trend Intelligence 문의"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              B2B 문의 <ArrowRight className="w-4 h-4" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-12">
            KTrenZ · © 2026 · Discover (h1) v2 라이브
          </p>
        </div>
      </Section>
    </div>
  );
}
