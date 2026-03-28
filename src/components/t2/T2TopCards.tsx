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

  return (
    <div className="px-4 md:px-0 mb-6">
      <div className="flex items-center gap-1.5 mb-3 pl-0">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-base font-medium text-foreground">Top 5</h3>
      </div>

      <div className="flex gap-2 h-[420px]">
        {/* #1 — tall vertical card on the left */}
        <button
          onClick={() => onTileClick(first)}
          className="relative rounded-2xl overflow-hidden text-left w-[52%] shrink-0 active:scale-[0.98] transition-transform"
        >
          {getBgImg(first) ? (
            <img
              src={getBgImg(first)!}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ backgroundColor: CATEGORY_CONFIG[first.category]?.tileColor || "hsl(var(--muted))" }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Sparkline overlay */}
          <div className="absolute inset-x-0 bottom-0">
            <svg viewBox="0 0 100 20" className="w-full h-[24px]" preserveAspectRatio="none">
              <defs>
                <linearGradient id="top1-spark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="white" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              {(() => {
                const path = buildSparkPath(first);
                if (!path) return null;
                return (
                  <>
                    <path d={`${path} L100,20 L0,20 Z`} fill="url(#top1-spark)" />
                    <path d={path} fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                  </>
                );
              })()}
            </svg>
          </div>

          <div className="relative z-10 flex flex-col justify-end h-full p-4">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center font-black text-sm text-black shrink-0"
                style={{ backgroundColor: RANK_COLORS[0] }}
              >
                1
              </span>
              <span className="text-xs font-medium text-white/70 truncate">
                {getLocalizedArtistName(first, language)}
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <MessageCircle className="w-4 h-4 shrink-0 -scale-x-100 mt-0.5 text-white/80" />
              <h4 className="text-lg font-black text-white leading-tight line-clamp-3">
                {getLocalizedKeyword(first, language)}
              </h4>
            </div>
            <span className="flex items-center gap-0.5 text-[9px] text-white/50 mt-1.5">
              <Clock className="w-2.5 h-2.5" />
              {formatAge(first.detectedAt)}
            </span>
          </div>
        </button>

        {/* #2–#5 — stacked vertically on the right */}
        <div className="flex flex-col gap-2 w-[45%] shrink-0">
          {rest.map((item, idx) => {
            const rank = idx + 2;
            const bgImg = getBgImg(item);
            const catColor = CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))";

            return (
              <button
                key={item.id}
                onClick={() => onTileClick(item)}
                className="relative rounded-xl overflow-hidden text-left flex-1 min-h-0 active:scale-[0.97] transition-transform"
              >
                {bgImg ? (
                  <img
                    src={bgImg}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{ backgroundColor: CATEGORY_CONFIG[item.category]?.tileColor || "hsl(var(--muted))" }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

                {/* Sparkline */}
                <div className="absolute inset-x-0 bottom-0">
                  <svg viewBox="0 0 100 20" className="w-full h-[14px]" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id={`top-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={catColor} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={catColor} stopOpacity="0.08" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const path = buildSparkPath(item);
                      if (!path) return null;
                      return (
                        <>
                          <path d={`${path} L100,20 L0,20 Z`} fill={`url(#top-spark-${item.id})`} />
                          <path d={path} fill="none" stroke={catColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
                        </>
                      );
                    })()}
                  </svg>
                </div>

                <div className="relative z-10 flex flex-col justify-end h-full p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] text-black shrink-0"
                      style={{ backgroundColor: RANK_COLORS[rank - 1] }}
                    >
                      {rank}
                    </span>
                    <span className="text-[10px] font-medium text-white/70 truncate">
                      {getLocalizedArtistName(item, language)}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white leading-tight line-clamp-1 pl-0.5">
                    {getLocalizedKeyword(item, language)}
                  </h4>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default T2TopCards;
