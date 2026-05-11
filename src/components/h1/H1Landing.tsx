// H1 Landing — body content shown to logged-out visitors instead of the
// full discover feed. Uses the actual DesktopCard from H1Discover so the
// "sample" is functionally identical to a real card: tap opens the same
// DetailDrawer (mounted at page level), vouch buttons trigger a login
// nudge instead of saving locally.

import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, LogIn, Music2, Gift,
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

// {key} placeholder substitution — t() in this project is pure dict lookup.
function tFmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Renders i18n strings that may contain `<b>...</b>` for emphasis without
// pulling a full markdown parser. Translations are author-controlled so
// raw innerHTML is safe here.
function RichText({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

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
  const { t } = useLanguage();
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
          <Hero t={t} />

          <div className="mb-8">
            <SectionLabel>{t("h1.landing.section.sample")}</SectionLabel>
            <SampleCardSlot
              sample={sample}
              isLoading={isLoading}
              onOpenDetail={onOpenDetail}
              onVouchAttempt={onVouchAttempt}
              emptyLabel={t("h1.landing.sample.empty")}
            />
          </div>
          <SectionLabel>{t("h1.landing.section.howItWorks")}</SectionLabel>
          <Steps t={t} className="mb-3" />
          <TierGuide t={t} className="mb-8" />

          <SourcesStrip t={t} className="mb-8" />
          <StatsRow t={t} className="mb-8" />
          <KCashBox t={t} className="mb-8" />
          <MoreCardsStrip t={t} extraCards={extraCards} onOpenDetail={onOpenDetail} className="mb-8" />
          <ProTeaser t={t} className="mb-8" />
          <FAQ t={t} className="mb-8" />
          <CTA t={t} />
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
            <Hero t={t} />

            {/* Desktop: 2-col — card on left, steps + tier guide on right.
                items-stretch (grid default) + flex column on right pushes
                TierGuide to the bottom so the right column auto-matches the
                card's height regardless of card aspect / title length. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div>
                <SectionLabel>{t("h1.landing.section.sample")}</SectionLabel>
                <SampleCardSlot
                  sample={sample}
                  isLoading={isLoading}
                  onOpenDetail={onOpenDetail}
                  onVouchAttempt={onVouchAttempt}
                  emptyLabel={t("h1.landing.sample.empty")}
                />
              </div>
              <div className="flex flex-col">
                <SectionLabel>{t("h1.landing.section.howItWorks")}</SectionLabel>
                <Steps t={t} />
                <TierGuide t={t} className="mt-3 md:mt-auto md:pt-3" />
              </div>
            </div>

            <SourcesStrip t={t} className="mb-10" />
            <StatsRow t={t} className="mb-10" />
            <KCashBox t={t} className="mb-10" />
            <MoreCardsStrip t={t} extraCards={extraCards} onOpenDetail={onOpenDetail} className="mb-10" />
            <ProTeaser t={t} className="mb-10" />
            <FAQ t={t} className="mb-10" />
            <div className="max-w-md mx-auto">
              <CTA t={t} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

type TFn = (key: string) => string;

function Backdrop() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute -top-1/3 -left-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-25 bg-rose-600" />
      <div className="absolute -bottom-1/3 -right-1/4 w-[60vw] h-[60vh] rounded-full blur-[200px] opacity-20 bg-violet-600" />
    </div>
  );
}

function Hero({ t }: { t: TFn }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-300 text-[10px] font-black tracking-[0.18em] uppercase mb-4">
        <Sparkles className="w-3 h-3" /> {t("h1.landing.heroBadge")}
      </div>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-[1.05] mb-3 whitespace-nowrap">
        {t("h1.landing.heroHeadline")}
      </h1>
      <p className="text-sm text-white/65 leading-relaxed">
        {t("h1.landing.heroSub")}
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
  emptyLabel,
}: {
  sample: DiscoverCard | null;
  isLoading: boolean;
  onOpenDetail: (card: DiscoverCard) => void;
  onVouchAttempt: () => void;
  emptyLabel: string;
}) {
  if (isLoading) {
    return <div className="aspect-[4/5] rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse" />;
  }
  if (!sample) {
    return (
      <div className="aspect-[4/5] rounded-2xl bg-white/[0.03] border border-white/10 grid place-items-center text-white/40 text-sm">
        {emptyLabel}
      </div>
    );
  }
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

function Steps({ t, className = "" }: { t: TFn; className?: string }) {
  return (
    <ol className={`space-y-3 ${className}`}>
      <Step num={1} t={t} titleKey="h1.landing.step1.title" bodyKey="h1.landing.step1.body" />
      <Step num={2} t={t} titleKey="h1.landing.step2.title" bodyKey="h1.landing.step2.body" />
      <Step num={3} t={t} titleKey="h1.landing.step3.title" bodyKey="h1.landing.step3.body" />
    </ol>
  );
}

function Step({
  num,
  t,
  titleKey,
  bodyKey,
}: {
  num: number;
  t: TFn;
  titleKey: string;
  bodyKey: string;
}) {
  return (
    <li className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/45 mb-1">
        {tFmt(t("h1.landing.stepNum"), { n: String(num) })}
      </div>
      <div className="text-base font-black text-white mb-1">{t(titleKey)}</div>
      <p className="text-xs text-white/65 leading-relaxed">{t(bodyKey)}</p>
    </li>
  );
}

function TierGuide({ t, className = "" }: { t: TFn; className?: string }) {
  const tiers: Array<{ mult: string; labelKey: string; hint: string; chip: string }> = [
    { mult: "×1", labelKey: "h1.landing.tier.x1.label", hint: "+5💎",  chip: "bg-amber-400/15 text-amber-200 border-amber-400/30" },
    { mult: "×2", labelKey: "h1.landing.tier.x2.label", hint: "+10💎", chip: "bg-orange-400/15 text-orange-200 border-orange-400/30" },
    { mult: "×4", labelKey: "h1.landing.tier.x4.label", hint: "+20💎", chip: "bg-rose-400/15 text-rose-200 border-rose-400/30" },
  ];
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/10 p-3 ${className}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45 mb-2 text-center">
        {t("h1.landing.section.tier")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {tiers.map((tier) => (
          <div key={tier.mult} className={`rounded-lg border ${tier.chip} px-2 py-1.5 text-center`}>
            <div className="text-sm font-black leading-none">{tier.mult}</div>
            <div className="text-[10px] font-bold opacity-80 mt-0.5">{t(tier.labelKey)}</div>
            <div className="text-[9px] opacity-65 mt-0.5">{tier.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesStrip({ t, className = "" }: { t: TFn; className?: string }) {
  const sources: Array<{ Icon: React.ElementType; label: string; tint: string }> = [
    { Icon: Youtube,     label: "YouTube",   tint: "text-red-400" },
    { Icon: Music,       label: "TikTok",    tint: "text-pink-400" },
    { Icon: ImageIcon,   label: "Instagram", tint: "text-fuchsia-400" },
    { Icon: Newspaper,   label: "Naver",     tint: "text-emerald-400" },
    { Icon: MessageCircle, label: "Reddit",  tint: "text-orange-400" },
  ];
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/10 p-5 ${className}`}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        {t("h1.landing.section.sources")}
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

function StatsRow({ t, className = "" }: { t: TFn; className?: string }) {
  const stats: Array<{ value: string; labelKey: string }> = [
    { value: "24",  labelKey: "h1.landing.stats.cards" },
    { value: "7",   labelKey: "h1.landing.stats.days" },
    { value: "30%", labelKey: "h1.landing.stats.cutoff" },
  ];
  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {stats.map((s) => (
        <div key={s.labelKey} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-black text-white tabular-nums leading-none mb-1">{s.value}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 leading-tight">{t(s.labelKey)}</div>
        </div>
      ))}
    </div>
  );
}

function MoreCardsStrip({
  t,
  extraCards,
  onOpenDetail,
  className = "",
}: {
  t: TFn;
  extraCards: DiscoverCard[];
  onOpenDetail: (card: DiscoverCard) => void;
  className?: string;
}) {
  const cards = extraCards.slice(0, 4);
  if (cards.length === 0) return null;
  return (
    <div className={className}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        {t("h1.landing.section.morePicks")}
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
        {t("h1.landing.morePicks.foot")}
      </p>
    </div>
  );
}

function KCashBox({ t, className = "" }: { t: TFn; className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-rose-500/10 border border-sky-400/25 p-5 ${className}`}>
      <div className="mb-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300/80 mb-1">
          {t("h1.landing.kcash.label")}
        </div>
        <div className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
          {t("h1.landing.kcash.title")}
        </div>
      </div>

      <ul className="space-y-2 text-xs text-white/75 leading-relaxed">
        <li className="flex items-start gap-2">
          <Music2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-300" />
          <RichText html={t("h1.landing.kcash.spotify")} />
        </li>
        <li className="flex items-start gap-2">
          <Gift className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-300" />
          <RichText html={t("h1.landing.kcash.kpass")} />
        </li>
        <li className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
          <RichText html={t("h1.landing.kcash.daily")} />
        </li>
      </ul>
    </div>
  );
}

function ProTeaser({ t, className = "" }: { t: TFn; className?: string }) {
  return (
    <Link
      to="/pro"
      className={`block rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 border border-amber-400/25 p-5 hover:scale-[1.005] transition-transform ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/80 mb-1">
            {t("h1.landing.pro.label")}
          </div>
          <div className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight mb-1">
            {t("h1.landing.pro.title")}
          </div>
          <div className="text-xs text-white/60">
            {t("h1.landing.pro.body")}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/40 shrink-0 mt-1.5" />
      </div>
    </Link>
  );
}

function FAQ({ t, className = "" }: { t: TFn; className?: string }) {
  const items: Array<{ qKey: string; aKey: string }> = [
    { qKey: "h1.landing.faq.q1", aKey: "h1.landing.faq.a1" },
    { qKey: "h1.landing.faq.q2", aKey: "h1.landing.faq.a2" },
    { qKey: "h1.landing.faq.q3", aKey: "h1.landing.faq.a3" },
    { qKey: "h1.landing.faq.q4", aKey: "h1.landing.faq.a4" },
    { qKey: "h1.landing.faq.q5", aKey: "h1.landing.faq.a5" },
    { qKey: "h1.landing.faq.q6", aKey: "h1.landing.faq.a6" },
    { qKey: "h1.landing.faq.q7", aKey: "h1.landing.faq.a7" },
    { qKey: "h1.landing.faq.q8", aKey: "h1.landing.faq.a8" },
  ];
  return (
    <div className={className}>
      <p className="text-lg sm:text-xl font-black text-white tracking-tight mb-4 text-center">
        {t("h1.landing.section.faq")}
      </p>
      <Accordion type="single" collapsible className="space-y-2">
        {items.map((it, idx) => (
          <AccordionItem
            key={it.qKey}
            value={`faq-${idx}`}
            className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-1 border-b"
          >
            <AccordionTrigger className="text-sm font-bold text-white hover:no-underline text-left py-3">
              {t(it.qKey)}
            </AccordionTrigger>
            <AccordionContent className="text-xs text-white/65 leading-relaxed pb-3">
              {t(it.aKey)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function CTA({ t }: { t: TFn }) {
  const redirect = encodeURIComponent("/h1");
  const signInHref = `/login?redirect=${redirect}`;
  return (
    <div className="flex flex-col gap-3 items-center">
      <Link
        to={signInHref}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-400 to-violet-500 text-white font-black text-sm hover:scale-[1.01] transition-transform shadow-2xl"
      >
        <LogIn className="w-4 h-4" />
        {t("h1.landing.cta.button")}
        <ArrowRight className="w-4 h-4" />
      </Link>
      <p className="text-[11px] text-white/40 text-center">
        {t("h1.landing.cta.fineprint")}
      </p>
    </div>
  );
}

// `Zap` is referenced for future Pro Mode icon usage; kept exported via
// the import to avoid the unused-import lint while we wait on design.
export const _zapKeep = Zap;
