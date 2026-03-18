import SEO from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Search, Zap, Brain, Globe, Target,
  BarChart3, Eye, Radio, Layers, ArrowRight,
  ChevronDown, Newspaper, Youtube, Activity,
  AlertTriangle, Sparkles, Shield, Clock,
  Database, LineChart, Radar, MessageSquare, RefreshCw
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ktrenzLogo from "@/assets/k-trenz-logo.webp";

type Lang = "en" | "ko";

const t = {
  en: {
    // Hero
    heroTag: "KTRENZ · Trend Intelligence Engine",
    heroTitle1: "Detect What",
    heroTitle2: "K-Pop Moves",
    heroTitle3: "Before the Market",
    heroDesc: "Which brand collaboration is gaining traction? Which product placement just went viral?",
    heroDescBold: "KTRENZ finds the signal before it becomes noise.",
    heroCta: "View Live Radar",
    statKeywords: "Keywords Tracked",
    statSources: "Sources / Day",
    statLag: "Detection Lag",
    statArtists: "Artists Monitored",

    // Problem
    problemTag: "The Problem",
    problemTitle: ["Billions in ", "Brand Deals", ", Zero Visibility"],
    problemDesc: "K-Pop drives massive commercial impact — but detecting which products and brands are trending around which artists happens too late.",
    problemCards: [
      { title: "Too Slow", desc: "By the time traditional analytics spots a trend, the opportunity window for brand activation has already closed." },
      { title: "Too Scattered", desc: "Brand mentions are spread across news, YouTube, social media, and fan communities — no single source of truth." },
      { title: "Too Generic", desc: "Existing tools track artist popularity, not the specific items and brands artists make relevant." },
    ],

    // Pipeline
    pipelineTag: "Detection Pipeline",
    pipelineTitle: ["4-Phase ", "AI Pipeline"],
    pipelineDesc: "Collect data from domestic and global sources, detect commercial keywords with AI, verify against original text, and track real-time search volume.",
    pipelineSteps: [
      { title: "Collect", desc: "Aggregate news articles, social media posts, YouTube videos, and web content from both domestic and global sources for each artist." },
      { title: "Detect", desc: "AI analyzes collected data to extract brand names, product mentions, and commercial entities — across all source types and markets." },
      { title: "Verify", desc: "Every extracted keyword is cross-checked against original source text. Items not found in the actual content are filtered out to prevent false positives." },
      { title: "Track", desc: "Validated keywords are monitored via real-time search volume data. Measures actual market interest and consumer response over time." },
    ],
    pipelineFlowLabels: ["News & Social", "Global Web", "YouTube", "Search Volume", "Live Radar"],

    // Safeguards
    safeguardTag: "AI Safeguards",
    safeguardTitle: ["Anti-Hallucination ", "Architecture"],
    safeguardDesc: "LLMs hallucinate. Our pipeline is designed to catch every false positive before it reaches users.",
    safeguardCards: [
      { title: "Text-Match Verification", desc: "Every extracted keyword is checked against the original source text. If the keyword doesn't literally appear in the article or video metadata, it's filtered out." },
      { title: "Cross-Artist Deduplication", desc: "Keywords already associated with another artist within the 7-day window are automatically filtered — preventing generic terms from polluting individual profiles." },
      { title: "Strict AI Prompting", desc: "System prompts enforce ZERO external knowledge usage. The AI can only analyze provided text, never rely on prior training data about artist endorsements." },
      { title: "Confidence Scoring", desc: "Each keyword gets a 0.0–1.0 confidence score based on context clarity. Low-confidence items are automatically deprioritized in the radar view." },
    ],

    // Scoring
    scoringTag: "Scoring Engine",
    scoringTitle: ["From Detection to ", "Influence Index"],
    scoringDesc: "Detected keywords are tracked over time. We measure how quickly search interest responds to artist–brand associations.",
    scoringMetrics: [
      { label: "Baseline Score", value: "0–100", desc: "Initial search volume at the moment of detection from Google Trends data" },
      { label: "Peak Score", value: "0–100", desc: "Maximum search volume reached during the tracking window" },
      { label: "Influence Index", value: "Δ%", desc: "Percentage growth from baseline to peak — the true measure of artist impact" },
    ],
    scoringExample: "Example: NCT Taeyong × Loewe",
    scoringExampleDesc: "Detected via domestic news at baseline score 72. After 2 hours of tracking, peak score reached 75.",
    scoringExampleBold: " Influence Index: +4.17%",
    scoringExampleTail: " — indicating steady, sustained interest rather than a viral spike. This pattern is typical of established luxury brand ambassadorships.",

    // Sources
    sourcesTag: "Data Sources",
    sourcesTitle: ["Multi-Source ", "Intelligence"],
    detectionSources: "Detection Sources",
    validationSources: "Validation & Tracking",
    detectionItems: [
      { label: "Domestic News", desc: "50+ articles per artist, 24h window, Korean language focus" },
      { label: "Global Web & Social", desc: "International brand news, social media posts, and web mentions across markets" },
      { label: "YouTube & Video", desc: "15 recent videos per member, 3-day window, title + description analysis" },
    ],
    validationItems: [
      { label: "Search Volume Tracking", desc: "Real-time search volume for keyword × artist combinations" },
      { label: "AI Entity Extraction", desc: "Commercial entity extraction with strict hallucination controls" },
      { label: "Serverless Pipeline", desc: "Automated orchestration with batch processing and rate-limit protection" },
    ],

    // Categories
    categoriesTag: "Trend Categories",
    categoriesTitle: ["All K-Culture ", "Trends"],
    categoriesDesc: "Every detected keyword is classified into trend categories across the full spectrum of K-Culture — enabling vertical-specific analytics.",
    categoryItems: [
      { emoji: "👜", label: "Fashion", desc: "Luxury brands, clothing, accessories" },
      { emoji: "💄", label: "Beauty", desc: "Cosmetics, skincare, fragrances" },
      { emoji: "🏷️", label: "Brand", desc: "Endorsements, ambassadorships" },
      { emoji: "📦", label: "Product", desc: "Tech, electronics, consumer goods" },
      { emoji: "🍽️", label: "Food", desc: "Restaurants, cafes, F&B brands" },
      { emoji: "📍", label: "Place", desc: "Travel destinations, venues" },
      { emoji: "📺", label: "Media", desc: "TV shows, movies, interviews" },
      { emoji: "🔥", label: "Trending", desc: "All categories combined" },
    ],

    // Use Cases
    useCasesTag: "Use Cases",
    useCasesTitle: ["Who Needs ", "KTRENZ", "?"],
    useCaseCards: [
      { title: "Brand Managers", desc: "Monitor which K-Pop artists are organically driving interest in your products. Identify potential ambassadors based on real influence data, not social follower counts." },
      { title: "Entertainment Agencies", desc: "Understand your artists' commercial footprint. Track which endorsement deals generate genuine search interest and which ones go unnoticed." },
      { title: "Market Researchers", desc: "Quantify the real-time commercial impact of K-Pop on consumer behavior. Access structured data on artist–brand associations across categories." },
    ],

    // Product-Led Loop
    pllTag: "Growth Flywheel",
    pllTitle: ["Product-Led ", "Loop"],
    pllDesc: "Every user interaction feeds back into better data — creating a self-reinforcing cycle that competitors cannot replicate.",
    pllSteps: [
      { emoji: "📦", title: "K-Product", desc: "Detect commercial keywords triggered by K-Pop artist activities across news, social, and video." },
      { emoji: "🎯", title: "Artist Trigger", desc: "Artist actions (brand deals, PPL, viral moments) generate real-time trend signals in the radar." },
      { emoji: "🗳️", title: "User Participation", desc: "Fans vote on trends, complete streaming missions, and engage with data — earning K-Points." },
      { emoji: "📈", title: "Data Amplification", desc: "User engagement improves detection accuracy, enriches influence scoring, and expands coverage." },
    ],

    // Revenue Model
    revenueTag: "Revenue Model",
    revenueTitle: ["How KTRENZ ", "Monetizes"],
    revenueDesc: "A diversified revenue engine spanning B2B intelligence, B2C engagement, data licensing, and brand partnerships.",
    revenueStreams: [
      { emoji: "🏢", title: "B2B Intelligence", items: ["Agency dashboard subscriptions", "Custom trend reports & alerts", "API access for real-time data", "White-label analytics solutions"] },
      { emoji: "👤", title: "B2C Fan Economy", items: ["K-Point in-app purchases", "K-Pass premium subscriptions", "Priority access to insights", "Exclusive trend badges & rewards"] },
      { emoji: "📊", title: "Data Licensing", items: ["Trend data feeds for platforms", "Influence Index API for advertisers", "Artist-brand affinity datasets", "Market intelligence reports"] },
      { emoji: "📢", title: "Ads & Sponsorship", items: ["Sponsored trend highlights", "Brand-featured keyword placements", "Agency-sponsored artist cards", "Cross-promotion partnerships"] },
    ],

    // CTA
    ctaTag: "Get Started",
    ctaTitle: ["See the ", "Trend Radar", " Live"],
    ctaDesc: "Explore real-time keyword detections, influence scores, and commercial insights across 100+ K-Pop artists.",
    ctaCta1: "Open KTRENZ Radar",
    ctaCta2: "View Full Platform Deck",
    ctaFooter: "ecosystem — Real-time K-Pop intelligence platform",
  },
  ko: {
    heroTag: "KTRENZ · 트렌드 인텔리전스 엔진",
    heroTitle1: "K-Pop이 만드는",
    heroTitle2: "상업적 움직임을",
    heroTitle3: "시장보다 먼저 감지",
    heroDesc: "어떤 브랜드 콜라보가 주목받고 있나? 어떤 제품 PPL이 바이럴 되었나?",
    heroDescBold: "KTRENZ는 노이즈가 되기 전에 시그널을 찾습니다.",
    heroCta: "라이브 레이더 보기",
    statKeywords: "추적 키워드",
    statSources: "소스 / 일",
    statLag: "감지 지연",
    statArtists: "모니터링 아티스트",

    problemTag: "문제점",
    problemTitle: ["수십억 규모의 ", "브랜드 딜", ", 제로 가시성"],
    problemDesc: "K-Pop은 막대한 상업적 영향력을 발휘하지만, 어떤 제품과 브랜드가 어떤 아티스트를 중심으로 트렌드를 형성하는지 감지하는 것은 항상 너무 늦습니다.",
    problemCards: [
      { title: "너무 느림", desc: "기존 분석이 트렌드를 포착할 때쯤이면, 브랜드 활성화의 기회의 창은 이미 닫혀 있습니다." },
      { title: "너무 분산됨", desc: "브랜드 언급은 뉴스, YouTube, 소셜 미디어, 팬 커뮤니티에 흩어져 있어 단일 소스가 없습니다." },
      { title: "너무 일반적", desc: "기존 도구는 아티스트 인기만 추적하지, 아티스트가 관련시키는 특정 아이템과 브랜드는 추적하지 않습니다." },
    ],

    pipelineTag: "감지 파이프라인",
    pipelineTitle: ["4단계 ", "AI 파이프라인"],
    pipelineDesc: "국내·글로벌 소스에서 데이터를 수집하고, AI로 상업 키워드를 감지하고, 원문 대조로 검증한 뒤, 실시간 검색량을 추적합니다.",
    pipelineSteps: [
      { title: "수집", desc: "아티스트별로 국내·글로벌 뉴스 기사, 소셜 미디어 포스트, YouTube 영상, 웹 콘텐츠를 수집합니다." },
      { title: "감지", desc: "AI가 수집된 데이터를 분석하여 브랜드명, 제품 언급, 상업 엔티티를 추출합니다 — 모든 소스 유형과 시장에 걸쳐." },
      { title: "검증", desc: "추출된 모든 키워드를 원본 소스 텍스트와 대조 검증합니다. 실제 콘텐츠에 존재하지 않는 항목은 오탐 방지를 위해 필터링됩니다." },
      { title: "추적", desc: "검증된 키워드를 실시간 검색량 데이터로 모니터링합니다. 실제 시장 관심도와 소비자 반응을 시간에 따라 측정합니다." },
    ],
    pipelineFlowLabels: ["뉴스 & 소셜", "글로벌 웹", "YouTube", "검색량", "라이브 레이더"],

    safeguardTag: "AI 안전장치",
    safeguardTitle: ["환각 방지 ", "아키텍처"],
    safeguardDesc: "LLM은 환각합니다. 우리 파이프라인은 사용자에게 도달하기 전에 모든 오탐을 포착하도록 설계되었습니다.",
    safeguardCards: [
      { title: "텍스트 매칭 검증", desc: "추출된 모든 키워드는 원본 소스 텍스트와 대조 검증됩니다. 키워드가 기사나 영상 메타데이터에 실제로 존재하지 않으면 필터링됩니다." },
      { title: "크로스 아티스트 중복 제거", desc: "7일 이내에 다른 아티스트에 이미 연결된 키워드는 자동 필터링됩니다 — 일반적인 용어가 개별 프로필을 오염시키는 것을 방지합니다." },
      { title: "엄격한 AI 프롬프팅", desc: "시스템 프롬프트가 외부 지식 사용을 ZERO로 강제합니다. AI는 제공된 텍스트만 분석할 수 있으며, 아티스트 엔도스먼트에 대한 사전 학습 데이터에 의존하지 않습니다." },
      { title: "신뢰도 점수", desc: "각 키워드는 문맥 명확성에 기반한 0.0–1.0 신뢰도 점수를 받습니다. 낮은 신뢰도 항목은 레이더 뷰에서 자동으로 하위 우선순위가 됩니다." },
    ],

    scoringTag: "스코링 엔진",
    scoringTitle: ["감지에서 ", "영향력 지수", "까지"],
    scoringDesc: "감지된 키워드는 시간에 따라 추적됩니다. 아티스트-브랜드 연관에 검색 관심이 얼마나 빠르게 반응하는지 측정합니다.",
    scoringMetrics: [
      { label: "기준 점수", value: "0–100", desc: "Google Trends 데이터에서 감지 시점의 초기 검색량" },
      { label: "최고 점수", value: "0–100", desc: "추적 기간 동안 도달한 최대 검색량" },
      { label: "영향력 지수", value: "Δ%", desc: "기준에서 최고점까지의 성장률 — 아티스트 영향력의 진정한 척도" },
    ],
    scoringExample: "예시: NCT 태용 × Loewe",
    scoringExampleDesc: "국내 뉴스를 통해 기준 점수 72에서 감지. 2시간 추적 후 최고 점수 75 도달.",
    scoringExampleBold: " 영향력 지수: +4.17%",
    scoringExampleTail: " — 바이럴 급등이 아닌 안정적이고 지속적인 관심을 나타냅니다. 이 패턴은 확립된 럭셔리 브랜드 앰배서더십의 전형적인 모습입니다.",

    sourcesTag: "데이터 소스",
    sourcesTitle: ["멀티 소스 ", "인텔리전스"],
    detectionSources: "감지 소스",
    validationSources: "검증 & 추적",
    detectionItems: [
      { label: "국내 뉴스", desc: "아티스트당 50개 이상 기사, 24시간 윈도우, 한국어 중심" },
      { label: "글로벌 웹 & 소셜", desc: "국제 브랜드 뉴스, 소셜 미디어 포스트, 다양한 시장의 웹 언급" },
      { label: "YouTube & 영상", desc: "멤버당 최근 15개 영상, 3일 윈도우, 제목 + 설명 분석" },
    ],
    validationItems: [
      { label: "검색량 추적", desc: "키워드 × 아티스트 조합의 실시간 검색량" },
      { label: "AI 엔티티 추출", desc: "엄격한 환각 제어가 적용된 상업 엔티티 추출" },
      { label: "서버리스 파이프라인", desc: "배치 처리 및 속도 제한 보호 기능의 자동 오케스트레이션" },
    ],

    categoriesTag: "트렌드 카테고리",
    categoriesTitle: ["모든 K-컬쳐의 ", "트렌드"],
    categoriesDesc: "감지된 모든 키워드는 K-컬쳐 전반의 트렌드 카테고리로 분류됩니다 — 수직별 분석을 가능하게 합니다.",
    categoryItems: [
      { emoji: "👜", label: "패션", desc: "럭셔리 브랜드, 의류, 액세서리" },
      { emoji: "💄", label: "뷰티", desc: "화장품, 스킨케어, 향수" },
      { emoji: "🏷️", label: "브랜드", desc: "엔도스먼트, 앰배서더십" },
      { emoji: "📦", label: "제품", desc: "테크, 전자제품, 소비재" },
      { emoji: "🍽️", label: "푸드", desc: "레스토랑, 카페, F&B 브랜드" },
      { emoji: "📍", label: "장소", desc: "여행지, 장소" },
      { emoji: "📺", label: "미디어", desc: "TV 프로그램, 영화, 인터뷰" },
      { emoji: "🔥", label: "트렌딩", desc: "전체 카테고리 통합" },
    ],

    useCasesTag: "유스 케이스",
    useCasesTitle: ["누가 ", "KTRENZ", "를 필요로 하나?"],
    useCaseCards: [
      { title: "브랜드 매니저", desc: "어떤 K-Pop 아티스트가 제품에 대한 관심을 자연스럽게 유도하는지 모니터링합니다. 소셜 팔로워 수가 아닌 실제 영향력 데이터를 기반으로 잠재 앰배서더를 식별합니다." },
      { title: "엔터테인먼트 에이전시", desc: "아티스트의 상업적 영향력을 이해합니다. 어떤 엔도스먼트 딜이 진정한 검색 관심을 생성하고 어떤 것이 주목받지 못하는지 추적합니다." },
      { title: "시장 리서처", desc: "소비자 행동에 대한 K-Pop의 실시간 상업적 영향을 정량화합니다. 카테고리별 아티스트-브랜드 연관 구조화된 데이터에 접근합니다." },
    ],

    pllTag: "성장 플라이휠",
    pllTitle: ["제품 주도 ", "순환 루프"],
    pllDesc: "모든 유저 인터랙션이 더 나은 데이터로 피드백됩니다 — 경쟁사가 복제할 수 없는 자기 강화 사이클을 만듭니다.",
    pllSteps: [
      { emoji: "📦", title: "K-Product", desc: "뉴스, 소셜, 영상에서 K-Pop 아티스트 활동으로 촉발된 상업 키워드를 감지합니다." },
      { emoji: "🎯", title: "아티스트 트리거", desc: "아티스트 활동(브랜드 딜, PPL, 바이럴 모먼트)이 레이더에 실시간 트렌드 시그널을 생성합니다." },
      { emoji: "🗳️", title: "유저 참여", desc: "팬들이 트렌드에 투표하고, 스트리밍 미션을 수행하며, 데이터와 상호작용합니다 — K-Point를 획득하면서." },
      { emoji: "📈", title: "데이터 확산", desc: "유저 참여가 감지 정확도를 개선하고, 영향력 스코어링을 풍부하게 하며, 커버리지를 확장합니다." },
    ],

    revenueTag: "매출 구조",
    revenueTitle: ["KTRENZ ", "수익 모델"],
    revenueDesc: "B2B 인텔리전스, B2C 팬 이코노미, 데이터 라이선싱, 브랜드 파트너십을 아우르는 다각화된 매출 엔진.",
    revenueStreams: [
      { emoji: "🏢", title: "B2B 인텔리전스", items: ["기획사 대시보드 구독", "맞춤 트렌드 리포트 & 알림", "실시간 데이터 API 접근권", "화이트라벨 분석 솔루션"] },
      { emoji: "👤", title: "B2C 팬 이코노미", items: ["K-Point 인앱 구매", "K-Pass 프리미엄 구독", "인사이트 우선 접근권", "독점 트렌드 뱃지 & 리워드"] },
      { emoji: "📊", title: "데이터 라이선싱", items: ["플랫폼용 트렌드 데이터 피드", "광고주용 영향력 지수 API", "아티스트-브랜드 친화도 데이터셋", "시장 인텔리전스 리포트"] },
      { emoji: "📢", title: "광고 & 스폰서십", items: ["스폰서드 트렌드 하이라이트", "브랜드 피처드 키워드 배치", "기획사 스폰서 아티스트 카드", "크로스 프로모션 파트너십"] },
    ],

    ctaTag: "시작하기",
    ctaTitle: ["", "트렌드 레이더", " 라이브 보기"],
    ctaDesc: "100+ K-Pop 아티스트에 대한 실시간 키워드 감지, 영향력 점수, 상업적 인사이트를 탐색하세요.",
    ctaCta1: "KTRENZ 레이더 열기",
    ctaCta2: "전체 플랫폼 덱 보기",
    ctaFooter: "에코시스템 — 실시간 K-Pop 인텔리전스 플랫폼",
  },
};

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
  const [lang, setLang] = useState<Lang>("en");
  const l = t[lang];

  const phaseLabels = lang === "en"
    ? ["Phase 1", "Phase 2", "Phase 3", "Phase 4"]
    : ["1단계", "2단계", "3단계", "4단계"];

  const useCaseIcons = [MessageSquare, BarChart3, TrendingUp];
  const safeguardIcons = [Search, Database, Brain, BarChart3];

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <SEO
        title="KTRENZ Trend Intelligence — Real-Time K-Pop Commercial Keyword Radar"
        description="KTRENZ detects which brands, products, and items K-Pop artists are associated with — before the market catches on."
        path="/pd"
      />

      {/* ─── Language Toggle ─── */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setLang(lang === "en" ? "ko" : "en")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-md border border-border/60 text-sm font-semibold text-foreground hover:border-primary/40 transition-all shadow-lg"
        >
          <span className={lang === "ko" ? "opacity-40" : ""}>EN</span>
          <span className="text-muted-foreground">/</span>
          <span className={lang === "en" ? "opacity-40" : ""}>한글</span>
        </button>
      </div>

      {/* ───── 1. HERO ───── */}
      <Section className="overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/6 rounded-full blur-[180px]" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-blue-500/4 rounded-full blur-[140px]" />
          <div className="absolute top-20 right-10 w-72 h-72 bg-amber-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center z-10">
          <img src={ktrenzLogo} alt="K-TRENZ" className="h-8 w-auto mx-auto mb-6 opacity-60" />


          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.08] tracking-tight mb-6">
            <span className="text-foreground">{l.heroTitle1}</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-orange-400 to-amber-400 bg-clip-text text-transparent">
              {l.heroTitle2}
            </span>
            <br />
            <span className="text-foreground">{l.heroTitle3}</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {l.heroDesc}
            <br className="hidden md:block" />
            <strong className="text-foreground">{l.heroDescBold}</strong>
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <button
              onClick={() => navigate("/t2")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              {l.heroCta} <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4 max-w-xl mx-auto">
            {[
              { label: l.statKeywords, value: 500, suffix: "+" },
              { label: l.statSources, value: 3, suffix: "" },
              { label: l.statLag, value: 15, suffix: "min" },
              { label: l.statArtists, value: 100, suffix: "+" },
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
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.problemTitle[0]}<span className="text-primary">{l.problemTitle[1]}</span>{l.problemTitle[2]}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.problemDesc}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {l.problemCards.map((item, i) => (
              <FeatureCard key={i} icon={[Clock, Layers, Target][i]} title={item.title} desc={item.desc} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 3. PIPELINE ───── */}
      <Section id="pipeline">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.pipelineTitle[0]}<span className="text-primary">{l.pipelineTitle[1]}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.pipelineDesc}</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {l.pipelineSteps.map((step, i) => (
              <PipelineStep
                key={i}
                step={phaseLabels[i]}
                icon={[Newspaper, Globe, Youtube, TrendingUp][i]}
                title={step.title}
                desc={step.desc}
                color={["bg-blue-600", "bg-violet-600", "bg-red-600", "bg-primary"][i]}
              />
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border/50 bg-card/40 p-8">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {[
                { label: l.pipelineFlowLabels[0], icon: Newspaper, bg: "bg-blue-600/20 text-blue-400" },
                { label: "→", icon: null, bg: "" },
                { label: l.pipelineFlowLabels[1], icon: Globe, bg: "bg-violet-600/20 text-violet-400" },
                { label: "→", icon: null, bg: "" },
                { label: l.pipelineFlowLabels[2], icon: Youtube, bg: "bg-red-600/20 text-red-400" },
                { label: "→", icon: null, bg: "" },
                { label: l.pipelineFlowLabels[3], icon: TrendingUp, bg: "bg-primary/20 text-primary" },
                { label: "→", icon: null, bg: "" },
                { label: l.pipelineFlowLabels[4], icon: Radar, bg: "bg-amber-600/20 text-amber-400" },
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
          </div>
        </div>
      </Section>

      {/* ───── 4. AI SAFEGUARDS ───── */}
      <Section id="safeguards">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.safeguardTitle[0]}<span className="text-primary">{l.safeguardTitle[1]}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.safeguardDesc}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {l.safeguardCards.map((item, i) => (
              <FeatureCard key={i} icon={safeguardIcons[i]} title={item.title} desc={item.desc} accent={i < 2} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 5. SCORING ENGINE ───── */}
      <Section id="scoring">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.scoringTitle[0]}<span className="text-primary">{l.scoringTitle[1]}</span>{l.scoringTitle[2] || ""}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.scoringDesc}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {l.scoringMetrics.map((item) => (
              <div key={item.label} className="rounded-2xl p-6 border border-border/50 bg-card/60 text-center">
                <div className={`text-3xl font-black mb-2 ${
                  item.value === "Δ%" ? "text-primary" : item.value === "0–100" ? "text-blue-400" : "text-amber-400"
                }`}>{item.value}</div>
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
                <h4 className="font-bold text-foreground text-lg mb-2">{l.scoringExample}</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {l.scoringExampleDesc}
                  <strong className="text-foreground">{l.scoringExampleBold}</strong>
                  {l.scoringExampleTail}
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
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.sourcesTitle[0]}<span className="text-primary">{l.sourcesTitle[1]}</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="font-bold text-xl text-foreground mb-4">{l.detectionSources}</h3>
              {l.detectionItems.map((item, i) => {
                const icons = [Newspaper, Globe, Youtube];
                const colors = ["bg-green-500/20 text-green-400", "bg-violet-500/20 text-violet-400", "bg-red-500/20 text-red-400"];
                const ItemIcon = icons[i];
                return (
                  <div key={i} className="flex items-start gap-4 rounded-xl p-4 border border-border/50 bg-card/40">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[i]}`}>
                      <ItemIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm">{item.label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-xl text-foreground mb-4">{l.validationSources}</h3>
              {l.validationItems.map((item, i) => {
                const icons = [TrendingUp, Brain, Database];
                const colors = ["bg-primary/20 text-primary", "bg-cyan-500/20 text-cyan-400", "bg-emerald-500/20 text-emerald-400"];
                const ItemIcon = icons[i];
                return (
                  <div key={i} className="flex items-start gap-4 rounded-xl p-4 border border-border/50 bg-card/40">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[i]}`}>
                      <ItemIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground text-sm">{item.label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 7. KEYWORD CATEGORIES ───── */}
      <Section id="categories">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.categoriesTitle[0]}<span className="text-primary">{l.categoriesTitle[1]}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.categoriesDesc}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {l.categoryItems.map((item, i) => {
              const colors = [
                "border-pink-500/30 bg-pink-500/5", "border-rose-500/30 bg-rose-500/5",
                "border-blue-500/30 bg-blue-500/5", "border-cyan-500/30 bg-cyan-500/5",
                "border-amber-500/30 bg-amber-500/5", "border-green-500/30 bg-green-500/5",
                "border-violet-500/30 bg-violet-500/5", "border-primary/30 bg-primary/5",
              ];
              return (
                <div key={i} className={`rounded-2xl p-5 border ${colors[i]} text-center transition-all hover:-translate-y-0.5`}>
                  <div className="text-3xl mb-2">{item.emoji}</div>
                  <h4 className="font-bold text-foreground text-sm mb-1">{item.label}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ───── 8. USE CASES ───── */}
      <Section id="usecases">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Target className="w-3.5 h-3.5" /> {l.useCasesTag}</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.useCasesTitle[0]}<span className="text-primary">{l.useCasesTitle[1]}</span>{l.useCasesTitle[2]}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {l.useCaseCards.map((item, i) => (
              <FeatureCard key={i} icon={useCaseIcons[i]} title={item.title} desc={item.desc} accent={i === 0} />
            ))}
          </div>
        </div>
      </Section>

      {/* ───── 9. PRODUCT-LED LOOP ───── */}
      <Section id="pll">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><RefreshCw className="w-3.5 h-3.5" /> {l.pllTag}</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.pllTitle[0]}<span className="text-primary">{l.pllTitle[1]}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.pllDesc}</p>
          </div>

          {/* Flywheel visual */}
          <div className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {l.pllSteps.map((step, i) => (
                <div key={i} className="relative rounded-2xl border border-border/50 bg-card/40 p-6 group hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                      {step.emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-primary/60">STEP {i + 1}</span>
                      </div>
                      <h3 className="font-bold text-lg text-foreground mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                  {/* Arrow connector */}
                  {i < l.pllSteps.length - 1 && (
                    <div className="hidden sm:block absolute -bottom-4 left-1/2 -translate-x-1/2 text-primary/40 text-lg z-10">
                      {i % 2 === 0 ? "→" : "↓"}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Loop indicator */}
            <div className="flex justify-center mt-8">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <RefreshCw className="w-4 h-4 text-primary animate-spin" style={{ animationDuration: "4s" }} />
                <span className="text-xs font-bold text-primary">
                  {lang === "ko" ? "자기 강화 사이클 반복" : "Self-reinforcing cycle"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ───── 10. REVENUE MODEL ───── */}
      <Section id="revenue">
        <div className="max-w-5xl mx-auto w-full">
          <div className="text-center mb-16">
            <SectionTag><Layers className="w-3.5 h-3.5" /> {l.revenueTag}</SectionTag>
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              {l.revenueTitle[0]}<span className="text-primary">{l.revenueTitle[1]}</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">{l.revenueDesc}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {l.revenueStreams.map((stream, i) => {
              const borderColors = [
                "border-blue-500/30 hover:border-blue-500/50",
                "border-purple-500/30 hover:border-purple-500/50",
                "border-emerald-500/30 hover:border-emerald-500/50",
                "border-amber-500/30 hover:border-amber-500/50",
              ];
              return (
                <div key={i} className={`rounded-2xl border bg-card/40 p-6 transition-colors ${borderColors[i]}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{stream.emoji}</span>
                    <h3 className="font-bold text-lg text-foreground">{stream.title}</h3>
                  </div>
                  <ul className="space-y-2.5">
                    {stream.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* ───── 11. CTA ───── */}
      <Section>
        <div className="relative max-w-3xl mx-auto text-center z-10">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[160px]" />
          </div>

          <SectionTag><Zap className="w-3.5 h-3.5" /> {l.ctaTag}</SectionTag>

          <h2 className="text-3xl md:text-5xl font-black mb-6">
            {l.ctaTitle[0]}<span className="text-primary">{l.ctaTitle[1]}</span>{l.ctaTitle[2]}
          </h2>

          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">{l.ctaDesc}</p>

          <div className="flex flex-wrap justify-center gap-4">
            <button
              onClick={() => navigate("/t2")}
              className="px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 transition-all shadow-[0_0_20px_hsl(11_100%_46%/0.3)]"
            >
              {l.ctaCta1} <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
            <button
              onClick={() => navigate("/pitchdeck")}
              className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-base hover:bg-secondary/80 transition-all border border-border"
            >
              {l.ctaCta2}
            </button>
          </div>

          <p className="text-muted-foreground text-sm mt-12">
            <strong className="text-foreground">KTrenZ</strong> {l.ctaFooter}
          </p>
        </div>
      </Section>
    </div>
  );
}
