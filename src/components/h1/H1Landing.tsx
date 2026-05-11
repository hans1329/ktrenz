// H1 Landing — body content shown to logged-out visitors instead of the
// full discover feed. Uses the actual DesktopCard from H1Discover so the
// "sample" is functionally identical to a real card: tap opens the same
// DetailDrawer (mounted at page level), vouch buttons trigger a login
// nudge instead of saving locally.

import { Link } from "react-router-dom";
import { Sparkles, Flame, Trophy, Eye, ArrowRight, LogIn, Music2, Gift, Coins } from "lucide-react";
import H1AppHeader from "@/components/h1/H1AppHeader";
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
  isLoading,
  onOpenDetail,
  onVouchAttempt,
}: {
  sample: DiscoverCard | null;
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

          <KCashBox className="mb-8" />
          <CTA />
        </main>
        <BottomNav active="discover" position="fixed" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative">
      <Backdrop />
      <H1AppHeader active="discover" signedIn={false} />

      <div className="max-w-[1400px] mx-auto flex">
        <DesktopSidebar active="discover" showQuota={false} />

        <main className="flex-1 px-5 lg:px-8 py-8 min-w-0">
          <div className="max-w-3xl mx-auto">
            <Hero />

            {/* Desktop: 2-col — card on left, steps on right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 items-start">
              <div>
                <SectionLabel>오늘의 샘플</SectionLabel>
                <SampleCardSlot
                  sample={sample}
                  isLoading={isLoading}
                  onOpenDetail={onOpenDetail}
                  onVouchAttempt={onVouchAttempt}
                />
              </div>
              <div>
                <SectionLabel>How it works</SectionLabel>
                <Steps onVouchAttempt={onVouchAttempt} />
              </div>
            </div>

            <KCashBox className="mb-10" />
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
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05] mb-3">
        K 트렌드를<br />예측해보세요!
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
      <Step num={1} Icon={Flame}  title="예측하기"     body="24개 컨텐츠 중 상승할 트렌드라 확신하는 카드에 ×1 / ×2 / ×4 강도로 예측" />
      <Step num={2} Icon={Eye}    title="7일간 트래킹"  body="당신의 픽이 실시간 cohort 순위에서 어떻게 움직이는지 확인." />
      <Step num={3} Icon={Trophy} title="적중 시 K-Cash" body="7일 후 상위 7개 (top 30%)에 든 픽은 💎 보상, 빗나가면 소액 차감." />
    </ol>
  );
}

function Step({
  num,
  Icon,
  title,
  body,
}: {
  num: number;
  Icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 grid place-items-center shrink-0 shadow-lg">
        <Icon className="w-4 h-4 text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/45">
            Step {num}
          </span>
        </div>
        <div className="text-sm font-black text-white mb-0.5">{title}</div>
        <p className="text-xs text-white/65 leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

function KCashBox({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-rose-500/10 border border-sky-400/25 p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-sky-400/20 grid place-items-center">
          <Coins className="w-4 h-4 text-sky-300" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300/80">
            K-Cash 💎
          </div>
          <div className="text-sm font-black text-white">
            모아서 진짜 보상으로 교환
          </div>
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
