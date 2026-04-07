import { useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Trophy, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORY_CONFIG, sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo } from "@/components/t2/T2TrendTreemap";
import { getYouTubeThumbnailUrl } from "@/lib/sourceMedia";
import type { TrendTile } from "@/components/t2/T2TrendTreemap";

function getLocalizedKeyword(tile: TrendTile, lang: string): string {
  switch (lang) {
    case "ko": return tile.keywordKo || tile.keyword;
    case "en": return tile.keywordEn || tile.keyword;
    case "ja": return tile.keywordJa || tile.keywordKo || tile.keyword;
    case "zh": return tile.keywordZh || tile.keywordKo || tile.keyword;
    default: return tile.keywordEn || tile.keyword;
  }
}

function getLocalizedArtistName(tile: TrendTile, lang: string): string {
  if (lang === "ko" && tile.artistNameKo) return tile.artistNameKo;
  return tile.artistName;
}

interface T2TopCardsProps {
  items: TrendTile[];
  onTileClick: (item: TrendTile) => void;
  trackingMap?: Map<string, any[]>;
}

const getBgImg = (item: TrendTile) => {
  const rawSourceImg = sanitizeImageUrl(
    (item.sourceImageUrl?.startsWith("https://") || item.sourceImageUrl?.startsWith("http://"))
      ? item.sourceImageUrl
      : null
  );
  const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;
  const youtubeThumb = !safeSourceImg ? getYouTubeThumbnailUrl(item.sourceUrl) : null;
  const platformLogo = detectPlatformLogo(item.sourceUrl, item.sourceImageUrl);
  return safeSourceImg || youtubeThumb || item.artistImageUrl || platformLogo;
};

const buildSparkPath = (item: TrendTile, trackingMap?: Map<string, any[]>) => {
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
  const maxVal = Math.max(...vals);
  if (maxVal === 0) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i === pts.length - 1 ? 100 : Math.max(0, Math.min(((p.t - startMs) / spanMs) * 100, 100))).toFixed(1)},11`).join(" ");
  }
  const range = maxVal - minVal;
  const effectiveMin = range < maxVal * 0.05 ? maxVal * 0.8 : minVal;
  const effectiveRange = maxVal - effectiveMin || 1;
  const toX = (t: number, i: number) => i === pts.length - 1 ? 100 : Math.max(0, Math.min(((t - startMs) / spanMs) * 100, 100));
  const toY = (v: number) => 18 - Math.max(0, Math.min((v - effectiveMin) / effectiveRange, 1)) * 14;
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t, i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");
};

const T2TopCards = ({ items, onTileClick, trackingMap }: T2TopCardsProps) => {
  const { language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const top5 = [...items].sort((a, b) => {
    const aVol = (a.prevApiTotal ?? a.peakScore ?? 0) - (a.baselineScore ?? 0);
    const bVol = (b.prevApiTotal ?? b.peakScore ?? 0) - (b.baselineScore ?? 0);
    return bVol - aVol;
  }).slice(0, 5);

  if (top5.length === 0) return null;

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  return (
    <div className="mt-4 mb-6">
      <div className="px-4 md:px-0 flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-foreground pl-1 flex items-center gap-1.5">
          <Trophy className="w-5 h-5 text-primary" />Top K·Trenz
        </h3>
        <div className="hidden md:flex items-center gap-1">
          <button onClick={() => scroll(-1)} className="p-1 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <button onClick={() => scroll(1)} className="p-1 rounded-full hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pl-4 pr-4 md:pl-0 md:pr-0 scroll-pl-4 md:scroll-pl-0"
      >
        {top5.map((item, idx) => {
          const rank = idx + 1;
          const bgImg = getBgImg(item);
          const catColor = CATEGORY_CONFIG[item.category]?.color || "hsl(var(--primary))";
          const sparkPath = buildSparkPath(item, trackingMap);

          return (
            <button
              key={item.id}
              onClick={() => onTileClick(item)}
              className="relative flex-none w-[72vw] md:w-[280px] aspect-[3/4] rounded-t-2xl rounded-b-none overflow-hidden text-left snap-start active:scale-[0.97] transition-transform"
            >
              {bgImg ? (
                <img
                  src={bgImg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (item.artistImageUrl && target.src !== item.artistImageUrl) {
                      target.src = item.artistImageUrl;
                    } else {
                      target.style.display = "none";
                    }
                  }}
                />
              ) : (
                <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: CATEGORY_CONFIG[item.category]?.tileColor || "hsl(var(--muted))" }} />
              )}

              {/* Gradients */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 via-[40%] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />

              {/* Sparkline */}
              <div className="absolute inset-x-0 bottom-0">
                <svg viewBox="0 0 100 20" className="w-full h-[40px]" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`top-spark-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={rank === 1 ? "white" : catColor} stopOpacity={rank === 1 ? 0.35 : 0.5} />
                      <stop offset="100%" stopColor={rank === 1 ? "white" : catColor} stopOpacity={rank === 1 ? 0.05 : 0.08} />
                    </linearGradient>
                  </defs>
                  {sparkPath && (
                    <>
                      <path d={`${sparkPath} L100,20 L0,20 Z`} fill={`url(#top-spark-${item.id})`} />
                      <path d={sparkPath} fill="none" stroke={rank === 1 ? "white" : catColor} strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
                    </>
                  )}
                </svg>
              </div>

              {/* Content overlay */}
              <div className="relative z-10 flex flex-col h-full p-3">
                {/* Top: rank + artist */}
                <div className="flex items-center gap-1.5">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center font-black text-sm text-white bg-black/60 backdrop-blur-sm shrink-0">
                    {rank}
                  </span>
                  <span className="text-[11px] font-medium text-white/80 truncate drop-shadow-md">
                    {getLocalizedArtistName(item, language)}
                  </span>
                </div>

                {/* Center: keyword */}
                <div className="flex-1 flex items-center justify-center px-2">
                  <div className="flex items-start gap-1">
                    <MessageCircle className="w-3.5 h-3.5 shrink-0 -scale-x-100 mt-0.5 text-white/80" />
                    <h4 className="font-black text-lg text-white leading-tight drop-shadow-md line-clamp-3">
                      {getLocalizedKeyword(item, language)}
                    </h4>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default T2TopCards;
