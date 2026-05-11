// H1 Landing — body content shown to logged-out visitors instead of the
// full discover feed. Goal: explain the game in 10 seconds, show one real
// sample card from today's drop so the value prop isn't abstract, drop a
// sign-in CTA at the bottom.
//
// Anon vouching path is intentionally removed here — too much friction for
// a first-time visitor (and the cross-account leak we fixed was caused by
// allowing anon writes to localStorage without an account boundary).

import { Link } from "react-router-dom";
import { Sparkles, Flame, Trophy, Eye, ArrowRight, LogIn } from "lucide-react";
import H1AppHeader, { H1_HEADER_H } from "@/components/h1/H1AppHeader";
import { useLanguage } from "@/contexts/LanguageContext";

// Shared shape — keep loose so we can render whatever today's drop returns.
type SampleCard = {
  id: string;
  source: string;
  title: string;
  artist?: string | null;
  starImage?: string | null;
  thumbnail?: string | null;
};

export default function H1Landing({
  sample,
  isLoading,
}: {
  sample: SampleCard | null;
  isLoading: boolean;
}) {
  const { t: _t } = useLanguage();
  const _ = _t; // reserved for i18n migration

  const redirect = encodeURIComponent("/h1");
  const signInHref = `/login?redirect=${redirect}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-white relative overflow-hidden">
      {/* Ambient backdrop */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-25 bg-rose-600" />
        <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-violet-600" />
      </div>

      <H1AppHeader active="discover" signedIn={false} />

      <main
        className="max-w-md mx-auto px-5 pb-24"
        style={{ paddingTop: H1_HEADER_H + 24 }}
      >
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-300 text-[10px] font-black tracking-[0.18em] uppercase mb-4">
            <Sparkles className="w-3 h-3" /> KTrenZ Discover
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05] mb-3">
            오늘 뜰 K-pop을<br />먼저 짚어보세요
          </h1>
          <p className="text-sm text-white/65 leading-relaxed">
            매일 아침 새 컨텐츠 24장이 올라옵니다. 7일 뒤 상위 7개를<br className="hidden sm:inline" /> 맞추는 콘텐츠-퍼스트 예측 게임.
          </p>
        </div>

        {/* Sample card — show one real item from today's drop so the value
            prop isn't abstract. Falls back to a skeleton during load. */}
        <div className="mb-10">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45 mb-3 text-center">
            오늘의 샘플
          </p>
          <SampleCardPreview sample={sample} isLoading={isLoading} />
        </div>

        {/* 3-step */}
        <ol className="space-y-3 mb-10">
          <Step
            num={1}
            Icon={Flame}
            title="감으로 콜"
            body="24개 컨텐츠 카드 중 뜰 것 같은 걸 ×1 / ×2 / ×4 강도로 찍습니다."
          />
          <Step
            num={2}
            Icon={Eye}
            title="7일간 트래킹"
            body="당신의 픽이 실시간 cohort 순위에서 어떻게 움직이는지 확인."
          />
          <Step
            num={3}
            Icon={Trophy}
            title="적중 시 K-Cash"
            body="7일 후 상위 7개 (top 30%)에 든 픽은 💎 보상, 빗나가면 소액 차감."
          />
        </ol>

        {/* CTA */}
        <div className="flex flex-col gap-3 items-center">
          <Link
            to={signInHref}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:scale-[1.01] transition-transform shadow-2xl"
          >
            <LogIn className="w-4 h-4" /> 로그인하고 시작하기
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-[11px] text-white/40 text-center">
            게스트로 둘러보기는 곧 추가됩니다.
          </p>
        </div>

        {/* Footer note */}
        <div className="mt-12 text-[11px] text-white/30 text-center leading-relaxed">
          매일 KST 09:15 새 드롭 · 7일 후 정산
        </div>
      </main>
    </div>
  );
}

function SampleCardPreview({
  sample,
  isLoading,
}: {
  sample: SampleCard | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="aspect-[3/4] rounded-3xl bg-white/[0.03] border border-white/10 animate-pulse" />
    );
  }
  if (!sample) {
    return (
      <div className="aspect-[3/4] rounded-3xl bg-white/[0.03] border border-white/10 grid place-items-center text-white/40 text-sm">
        오늘 드롭 준비 중
      </div>
    );
  }
  return (
    <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 bg-neutral-900">
      {sample.thumbnail ? (
        <img
          src={sample.thumbnail}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
          decoding="async"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rose-700 via-violet-800 to-neutral-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {/* Artist chip */}
      {sample.artist && (
        <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-2 py-1 rounded-full bg-black/60 backdrop-blur text-white text-[11px] font-bold">
          {sample.starImage ? (
            <img
              src={sample.starImage}
              alt=""
              className="w-4 h-4 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <span className="truncate max-w-[140px]">{sample.artist}</span>
        </div>
      )}

      {/* "오늘 뜰까?" prompt */}
      <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/30 backdrop-blur border border-rose-300/40 text-rose-100 text-[10px] font-black tracking-[0.18em] uppercase">
        오늘 뜰까?
      </div>

      {/* Title at bottom */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="text-white text-base font-bold leading-snug line-clamp-3 drop-shadow-lg">
          {sample.title}
        </div>
      </div>
    </div>
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
