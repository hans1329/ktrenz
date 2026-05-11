// H1 Landing — body content shown to logged-out visitors instead of the
// full discover feed. Uses the actual DesktopCard from H1Discover so the
// "sample" is functionally identical to a real card: tap opens the same
// DetailDrawer (mounted at page level), vouch buttons trigger a login
// nudge instead of saving locally.

import { Link } from "react-router-dom";
import {
  Sparkles, Flame, Trophy, Eye, ArrowRight, LogIn, Music2, Gift,
  Youtube, Music, Newspaper, MessageCircle, Image as ImageIcon,
  Zap,
} from "lucide-react";
import H1AppHeader from "@/components/h1/H1AppHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BottomNav,
  DesktopSidebar,
  DesktopCard,
  BOTTOM_NAV_H,
  type DiscoverCard,
  type Vouch,
} from "@/pages/H1Discover";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";

export default function H1Landing({
  sample,
  extraCards,
  isLoading,
  onOpenDetail,
  onVouchAttempt,
}: {
  sample: DiscoverCard | null;
  extraCards: DiscoverCard[];
  isLoading: boolean;
  onOpenDetail: (card: DiscoverCard) => void;
  onVouchAttempt: () => void;
}) {
  const { t: _t } = useLanguage();
  const _ = _t;
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="relative bg-neutral-950 text-white w-full min-h-[100dvh]">
        <Backdrop />
        <H1AppHeader active="discover" signedIn={false} />
        <main
          className="px-5"
          style={{ paddingTop: 24, paddingBottom: BOTTOM_NAV_H + 32 }}
        >
          <Hero />

          {/* Mobile: sample card → 3-step stacked */}
          <div className="mb-8">
            <SectionLabel>오늘의 샘플</SectionLabel>
            <SampleCardSlot
              sample={sample}
              isLoading={isLoading}
              onOpenDetail={onOpenDetail}
              onVouchAttempt={onVouchAttempt}
            />
          </div>
          <Steps onVouchAttempt={onVouchAttempt} className="mb-8" />

          <SourcesStrip className="mb-8" />
          <StatsRow className="mb-8" />
          <KCashBox className="mb-8" />
          <MoreCardsStrip extraCards={extraCards} onOpenDetail={onOpenDetail} className="mb-8" />
          <ProTeaser className="mb-8" />
          <FAQ className="mb-8" />
          <CTA />
        </main>
        <BottomNav active="discover" position="fixed" signedIn={false} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      <Backdrop />
      <H1AppHeader active="discover" signedIn={false} />

      <div className="max-w-[1400px] mx-auto flex">
        <DesktopSidebar active="discover" showQuota={false} signedIn={false} />

        <main className="flex-1 px-5 lg:px-8 py-8 min-w-0">
          <div className="max-w-3xl mx-auto">
            <Hero />

            {/* Desktop: 2-col — card on left, steps + tier guide on right.
                items-stretch (grid default) + flex column on right pushes
                TierGuide to the bottom so the right column auto-matches the
                card's height regardless of card aspect / title length. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div>
                <SectionLabel>오늘의 샘플</SectionLabel>
                <SampleCardSlot
                  sample={sample}
                  isLoading={isLoading}
                  onOpenDetail={onOpenDetail}
                  onVouchAttempt={onVouchAttempt}
                />
              </div>
              <div className="flex flex-col">
                <SectionLabel>How it works</SectionLabel>
                <Steps onVouchAttempt={onVouchAttempt} />
                <TierGuide className="mt-3 md:mt-auto md:pt-3" />
              </div>
            </div>

            <SourcesStrip className="mb-10" />
            <StatsRow className="mb-10" />
            <KCashBox className="mb-10" />
            <MoreCardsStrip extraCards={extraCards} onOpenDetail={onOpenDetail} className="mb-10" />
            <ProTeaser className="mb-10" />
            <FAQ className="mb-10" />
            <div className="max-w-md mx-auto">
              <CTA />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-25 bg-rose-600" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-violet-600" />
    </div>
  );
}

function Hero() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-300 text-[10px] font-black tracking-[0.18em] uppercase mb-4">
        <Sparkles className="w-3 h-3" /> KTrenZ Discover
      </div>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05] mb-3 whitespace-nowrap">
        K 트렌드를 예측해보세요!
      </h1>
      <p className="text-sm text-white/65 leading-relaxed">
        매일 아침 K-컨텐츠 24장이 올라옵니다. 7일 뒤 이중 상위 7개를<br className="hidden sm:inline" /> 맞추는 트렌드 예측 게임.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-3 text-center md:text-left">
      {children}
    </p>
  );
}

function SampleCardSlot({
  sample,
  isLoading,
  onOpenDetail,
  onVouchAttempt,
}: {
  sample: DiscoverCard | null;
  isLoading: boolean;
  onOpenDetail: (card: DiscoverCard) => void;
  onVouchAttempt: () => void;
}) {
  if (isLoading) {
    return <div className="aspect-[4/5] rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse" />;
  }
  if (!sample) {
    return (
      <div className="aspect-[4/5] rounded-2xl bg-white/[0.03] border border-white/10 grid place-items-center text-white/40 text-sm">
        오늘 드롭 준비 중
      </div>
    );
  }
  // Anon vouches all route to the login nudge — never actually save state.
  const handleVouch = (_v: Vouch) => onVouchAttempt();
  return (
    <DesktopCard
      card={sample}
      vouch={undefined}
      onVouch={handleVouch}
      onOpenDetail={() => onOpenDetail(sample)}
      onOpenHelp={() => { /* no-op on landing */ }}
    />
  );
}

function Steps({
  onVouchAttempt: _onVouchAttempt,
  className = "",
}: {
  onVouchAttempt: () => void;
  className?: string;
}) {
  return (
    <ol className={`space-y-3 ${className}`}>
      <Step num={1} title="예측하기"     body="24개 컨텐츠 중 상승할 트렌드라 확신하는 카드에 ×1 / ×2 / ×4 강도로 예측" />
      <Step num={2} title="7일간 트래킹"  body="당신의 픽이 실시간 cohort 순위에서 어떻게 움직이는지 확인." />
      <Step num={3} title="적중 시 K-Cash" body="7일 후 상위 7개 (top 30%)에 든 픽은 💎 보상, 빗나가면 소액 차감." />
    </ol>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: number;
  Icon?: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
      <div className="text-[11px] font-black uppercase tracking-wider text-white/45 mb-1.5">
        Step {num}
      </div>
      <div className="text-lg font-black text-white mb-1.5">{title}</div>
      <p className="text-sm text-white/70 leading-relaxed">{body}</p>
    </li>
  );
}

function KCashBox({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-rose-500/10 border border-sky-400/25 p-5 ${className}`}>
      <div className="mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300/80 mb-1">
          K-Cash 💎
        </div>
        <div className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
          모아서 진짜 보상으로 교환
        </div>
      </div>

      <ul className="space-y-2 text-xs text-white/75 leading-relaxed">
        <li className="flex items-start gap-2">
          <Music2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-300" />
          <span>
            <b className="text-white">10,000 💎</b> → Spotify Premium 1개월 (≈ $10 상당)
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Gift className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-300" />
          <span>
            <b className="text-white">K-Pass 멤버십</b> 업그레이드 · 슬롯 ×2, 30일 트렌드 인사이트 등
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
          <span>
            매일 1번 이상 예측 시 <b className="text-white">+10 💎</b> 자동 적립 · 적중 시 강도 비례 보상
          </span>
        </li>
      </ul>
    </div>
  );
}

function TierGuide({ className = "" }: { className?: string }) {
  // Compact 3-col tier chip row — sits under How it works on desktop just
  // to top up the column height. Single line per tier; no body copy.
  const tiers: Array<{ mult: string; label: string; hint: string; chip: string }> = [
    { mult: "×1", label: "Hunch", hint: "+5💎",  chip: "bg-amber-400/15 text-amber-200 border-amber-400/30" },
    { mult: "×2", label: "Pick",  hint: "+10💎", chip: "bg-orange-400/15 text-orange-200 border-orange-400/30" },
    { mult: "×4", label: "Lock",  hint: "+20💎", chip: "bg-rose-400/15 text-rose-200 border-rose-400/30" },
  ];
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/10 p-3 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 text-center">
        예측 강도
      </p>
      <div className="grid grid-cols-3 gap-2">
        {tiers.map((t) => (
          <div key={t.mult} className={`rounded-lg border ${t.chip} px-2 py-1.5 text-center`}>
            <div className="text-sm font-black leading-none">{t.mult}</div>
            <div className="text-[10px] font-bold opacity-80 mt-0.5">{t.label}</div>
            <div className="text-[9px] opacity-65 mt-0.5">{t.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesStrip({ className = "" }: { className?: string }) {
  // Where the trending signal actually comes from — credibility first.
  const sources: Array<{ Icon: React.ElementType; label: string; tint: string }> = [
    { Icon: Youtube, label: "YouTube",   tint: "text-red-400" },
    { Icon: Music,   label: "TikTok",    tint: "text-pink-400" },
    { Icon: ImageIcon, label: "Instagram", tint: "text-fuchsia-400" },
    { Icon: Newspaper, label: "Naver",    tint: "text-emerald-400" },
    { Icon: MessageCircle, label: "Reddit", tint: "text-orange-400" },
  ];
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/10 p-5 ${className}`}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        5개 소스 통합 신호
      </p>
      <div className="flex items-center justify-center flex-wrap gap-3">
        {sources.map((s) => (
          <div key={s.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
            <s.Icon className={`w-3.5 h-3.5 ${s.tint}`} />
            <span className="text-[11px] font-bold text-white/80">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsRow({ className = "" }: { className?: string }) {
  // Placeholder static numbers — replace with live counters when we expose
  // the metrics RPCs. Even rough numbers establish "real platform" vibe.
  const stats = [
    { value: "24", label: "매일 새 컨텐츠" },
    { value: "7", label: "정산 일수" },
    { value: "30%", label: "상위 적중 기준" },
  ];
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none mb-1">{s.value}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 leading-tight">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function MoreCardsStrip({
  extraCards,
  onOpenDetail,
  className = "",
}: {
  extraCards: DiscoverCard[];
  onOpenDetail: (card: DiscoverCard) => void;
  className?: string;
}) {
  const cards = extraCards.slice(0, 4);
  if (cards.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        오늘 함께 올라온 픽
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpenDetail(c)}
            className="relative aspect-square rounded-xl overflow-hidden bg-neutral-900 border border-white/10 hover:border-white/25 transition-colors text-left group"
          >
            {c.thumbnail ? (
              <img
                src={c.thumbnail}
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-rose-700 via-violet-800 to-neutral-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            {c.artist && (
              <div className="absolute bottom-1.5 inset-x-1.5 text-white text-[10px] font-black truncate drop-shadow-lg">
                {c.artist}
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-white/35 text-center mt-2.5">
        탭하면 상세 미리보기 · 예측은 로그인 후
      </p>
    </div>
  );
}

function ProTeaser({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/pro"
      className={`block rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 border border-amber-400/25 p-5 hover:scale-[1.005] transition-transform ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/80 mb-1">
            Pro Mode
          </div>
          <div className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight mb-1">
            선수만의 1:1 배틀, Pro Battle
          </div>
          <div className="text-xs text-white/60">
            픽 둘 중 더 뜰 사람을 즉시 골라보기. 토너먼트 방식.
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/40 shrink-0 mt-1.5" />
      </div>
    </Link>
  );
}

function FAQ({ className = "" }: { className?: string }) {
  const items: Array<{ q: string; a: string }> = [
    {
      q: "언제 새 카드가 올라오나요?",
      a: "매일 KST 09:15 자동 발행. 한국 출근시간에 맞춰 24장이 한 번에 드랍됩니다.",
    },
    {
      q: "어떻게 적중이 정해지나요?",
      a: "7일 뒤 24장 중 상위 7개(top 30%)에 든 카드를 적중으로 판정. 누적 buzz·views 등 종합 점수 기준.",
    },
    {
      q: "K-Cash는 진짜 돈인가요?",
      a: "앱 내 포인트지만 10,000 모으면 Spotify Premium 1개월(약 $10)로 교환 가능. K-Pass 업그레이드에도 사용.",
    },
    {
      q: "하루에 몇 번 예측할 수 있나요?",
      a: "기본 7개 슬롯 (×1 1개 + ×2 4개 + ×4 2개). 광고 시청으로 하루 최대 5개 슬롯까지 추가 가능.",
    },
    {
      q: "예측한 카드는 바꿀 수 있나요?",
      a: "정산 전(7일 내)에 언제든 강도(×1/×2/×4) 변경 가능. 단, 바꾸는 시점이 늦을수록 보상은 조금 줄어요.",
    },
    {
      q: "K-Pass 멤버십은 뭔가요?",
      a: "프리미엄 등급. 슬롯 ×2, 30일 트렌드 인사이트, Pro Studio API 등 제공. K-Cash 또는 결제로 업그레이드.",
    },
    {
      q: "5개 소스는 어떻게 활용되나요?",
      a: "YouTube · TikTok · Instagram · Naver · Reddit에서 K-pop 컨텐츠 신호를 매일 수집·정규화해 24장으로 큐레이션.",
    },
    {
      q: "데이터는 어디에 쓰이나요?",
      a: "집합 예측 결과는 B2B Trend Intelligence (레이블·브랜드·미디어용) 인사이트로 활용. 개인 정보는 분리·익명화 처리.",
    },
  ];
  return (
    <div className={className}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        자주 묻는 질문
      </p>
      <Accordion type="single" collapsible className="space-y-2">
        {items.map((it, idx) => (
          <AccordionItem
            key={it.q}
            value={`faq-${idx}`}
            className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-1 border-b"
          >
            <AccordionTrigger className="text-sm font-bold text-white hover:no-underline text-left py-3">
              {it.q}
            </AccordionTrigger>
            <AccordionContent className="text-xs text-white/65 leading-relaxed pb-3">
              {it.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function CTA() {
  const redirect = encodeURIComponent("/h1");
  const signInHref = `/login?redirect=${redirect}`;
  return (
    <div className="flex flex-col gap-3 items-center">
      <Link
        to={signInHref}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-400 to-violet-500 text-white font-black text-sm hover:scale-[1.01] transition-transform shadow-2xl"
      >
        <LogIn className="w-4 h-4" />
        지금 가입시 1,000 💎 즉시 지급
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p className="text-[11px] text-white/40 text-center">
        이미 계정이 있으면 동일 버튼으로 로그인
      </p>
    </div>
  );
}
