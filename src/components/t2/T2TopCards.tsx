import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Clock, TrendingUp, MessageCircle } from "lucide-react";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo } from "@/components/t2/T2TrendTreemap";
import type { TrendTile } from "@/components/t2/T2TrendTreemap";

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "ja": return tile.keywordJa || tile.keyword;
    case "zh": return tile.keywordZh || tile.keyword;
    default: return tile.keyword;
  }
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface T2TopCardsProps {
  items: TrendTile[];
  onTileClick: (item: TrendTile) => void;
  trackingMap?: Map<string, any[]>;
}

const RANK_COLORS = [
  "hsl(45, 95%, 55%)",   // gold
  "hsl(210, 15%, 70%)",  // silver
  "hsl(25, 60%, 50%)",   // bronze
  "hsl(var(--muted-foreground))",
  "hsl(var(--muted-foreground))",
];

const T2TopCards = ({ items, onTileClick, trackingMap }: T2TopCardsProps) => {
  const { language } = useLanguage();
  const top4 = items.slice(0, 4);

  if (top4.length === 0) return null;

  const first = top4[0];
  const rest = top4.slice(1);

  const getBgImg = (item: TrendTile) => {
    const rawSourceImg = sanitizeImageUrl(
      (item.sourceImageUrl?.startsWith("https://") || item.sourceImageUrl?.startsWith("http://"))
        ? item.sourceImageUrl
        : null
    );
    const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;
    const platformLogo = detectPlatformLogo(item.sourceUrl, item.sourceImageUrl);
    return safeSourceImg || item.artistImageUrl || platformLogo;
  };

  const buildSparkPath = (item: TrendTile) => {
    const history = trackingMap?.get(item.id) ?? [];
    const nowMs = Date.now();
    let pts: { t: number; v: number }[] = [];
    if (history.length >= 2) {
      pts = history.map((h: any) => ({ t: new Date(h.tracked_at).getTime(), v: Number(h.interest_score ?? 0) }));
    } else if (history.length === 1) {
      pts = [
        { t: new Date(item.detectedAt).getTime(), v: Number(item.baselineScore ?? 0) },
        { t: new Date(history[0].tracked_at).getTime(), v: Number(history[0].interest_score ?? 0) },
      ];
    } else {
      const bv = Number(item.baselineScore ?? 0);
      pts = [{ t: new Date(item.detectedAt).getTime(), v: bv }, { t: nowMs, v: bv }];
    }
    if (pts.length < 2) return null;
    const lastPt = pts[pts.length - 1];
    if (lastPt.t < nowMs) pts = [...pts, { t: nowMs, v: lastPt.v }];
    const startMs = Math.min(pts[0].t, nowMs);
    const spanMs = Math.max(nowMs - startMs, 3600000);
    const vals = pts.map(p => p.v);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals, 1);
    const range = maxVal - minVal;
    const effectiveMin = range < maxVal * 0.05 ? maxVal * 0.8 : minVal;
    const effectiveRange = maxVal - effectiveMin || 1;
    const toX = (t: number, i: number) => i === pts.length - 1 ? 100 : Math.max(0, Math.min(((t - startMs) / spanMs) * 100, 100));
    const toY = (v: number) => 18 - Math.max(0, Math.min((v - effectiveMin) / effectiveRange, 1)) * 14;
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t, i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");
  };

  const second = top4[1];
  const bottomTwo = top4.slice(2);

  const renderCard = (
    item: TrendTile,
    rank: number,
    opts: { rankSize: string; titleClass: string; padClass: string; showArtist?: boolean }
  ) => {
    const bgImg = getBgImg(item);
    const catColor = CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))";
    return (
      <button
        key={item.id}
        onClick={() => onTileClick(item)}
        className="relative rounded-2xl overflow-hidden text-left w-full h-full active:scale-[0.97] transition-transform"
      >
        {bgImg ? (
          <img src={bgImg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: CATEGORY_CONFIG[item.category]?.tileColor || "hsl(var(--muted))" }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 via-[45%] to-transparent" />

        <div className="absolute inset-x-0 bottom-0">
          <svg viewBox="0 0 100 20" className="w-full h-[18px]" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`top-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={rank === 1 ? "white" : catColor} stopOpacity={rank === 1 ? 0.35 : 0.5} />
                <stop offset="100%" stopColor={rank === 1 ? "white" : catColor} stopOpacity={rank === 1 ? 0.05 : 0.08} />
              </linearGradient>
            </defs>
            {(() => {
              const path = buildSparkPath(item);
              if (!path) return null;
              return (
                <>
                  <path d={`${path} L100,20 L0,20 Z`} fill={`url(#top-spark-${item.id})`} />
                  <path d={path} fill="none" stroke={rank === 1 ? "white" : catColor} strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                </>
              );
            })()}
          </svg>
        </div>

        {/* Top-left: rank badge + keyword */}
        <div className={cn("relative z-10 flex flex-col justify-start h-full", opts.padClass)}>
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn("rounded-full flex items-center justify-center font-black text-white bg-black/60 backdrop-blur-sm shrink-0", opts.rankSize)}
            >
              {rank}
            </span>
            {opts.showArtist !== false && (
              <span className="text-[11px] font-medium text-white/80 truncate drop-shadow-md">
                {getLocalizedArtistName(item, language)}
              </span>
            )}
          </div>
          <div className="flex items-start gap-1">
            <MessageCircle className="w-3.5 h-3.5 shrink-0 -scale-x-100 mt-0.5 text-white/80" />
            <h4 className={cn("font-black text-white leading-tight drop-shadow-md", opts.titleClass)}>
              {getLocalizedKeyword(item, language)}
            </h4>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="px-4 md:px-0 mb-6">
      <div className="flex items-center gap-1.5 mb-3 pl-0">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-base font-medium text-foreground">Top 4</h3>
      </div>

      <div className="flex gap-2 h-[460px]">
        {/* #1 — tall vertical card, left half */}
        <div className="w-[48%] shrink-0 h-full">
          {renderCard(first, 1, { rankSize: "w-7 h-7 text-sm", titleClass: "text-lg line-clamp-3", padClass: "p-4" })}
        </div>

        {/* Right column: #2 on top (larger), #3 & #4 side by side on bottom */}
        <div className="flex-1 min-w-0 flex flex-col gap-2 h-full">
          {/* #2 — takes ~60% height */}
          <div className="h-[58%]">
            {second && renderCard(second, 2, { rankSize: "w-6 h-6 text-[11px]", titleClass: "text-base line-clamp-2", padClass: "p-3" })}
          </div>
          {/* #3 & #4 side by side — remaining ~40% */}
          <div className="flex-1 flex gap-2 min-h-0">
            {bottomTwo.map((item, idx) => (
              <div key={item.id} className="flex-1 min-w-0 h-full">
                {renderCard(item, idx + 3, { rankSize: "w-5 h-5 text-[10px]", titleClass: "text-xs line-clamp-1", padClass: "p-2.5", showArtist: false })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default T2TopCards;
