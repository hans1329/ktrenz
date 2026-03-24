import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { ChevronRight, Clock, LogIn, Sparkles, Heart, MessageCircle } from "lucide-react";
import { sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
import type { TrendTile } from "@/components/t2/T2TrendTreemap";
import heroBg from "@/assets/t2-hero-bg.jpg";

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

/** Generate a simple sparkline SVG path from seed values (viewBox height=40) */
function generateSparkline(seed: number, points = 8): string {
  const vals: number[] = [];
  let v = 15 + (seed % 12);
  for (let i = 0; i < points; i++) {
    v += ((seed * (i + 1) * 7) % 15) - 5;
    v = Math.max(3, Math.min(32, v));
    vals.push(v);
  }
  vals[vals.length - 1] = Math.max(...vals) + 2;
  const step = 100 / (points - 1);
  return vals.map((y, i) => `${i === 0 ? "M" : "L"}${i * step},${36 - y}`).join(" ");
}

const HERO_GRADIENTS = [
  "linear-gradient(135deg, hsl(330, 70%, 55%), hsl(350, 80%, 45%))",
  "linear-gradient(135deg, hsl(260, 65%, 55%), hsl(280, 70%, 40%))",
  "linear-gradient(135deg, hsl(200, 70%, 50%), hsl(220, 75%, 40%))",
  "linear-gradient(135deg, hsl(150, 60%, 45%), hsl(170, 65%, 35%))",
  "linear-gradient(135deg, hsl(25, 80%, 55%), hsl(15, 75%, 45%))",
];

interface T2HeroSectionProps {
  myKeywords: TrendTile[];
}

const T2HeroSection = ({ myKeywords }: T2HeroSectionProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();

  // Fetch user's active bet keywords
  const { data: betKeywords = [] } = useQuery({
    queryKey: ["hero-bet-keywords", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get user's active bets
      const { data: bets } = await supabase
        .from("ktrenz_trend_bets" as any)
        .select("market_id")
        .eq("user_id", user!.id);
      if (!bets?.length) return [];

      const marketIds = [...new Set((bets as any[]).map((b: any) => b.market_id))];
      const { data: markets } = await supabase
        .from("ktrenz_trend_markets" as any)
        .select("trigger_id, status")
        .in("id", marketIds)
        .in("status", ["open", "active", "pending"]);
      if (!markets?.length) return [];

      const triggerIds = [...new Set((markets as any[]).map((m: any) => m.trigger_id).filter(Boolean))];
      if (!triggerIds.length) return [];

      const { data: triggers } = await supabase
        .from("ktrenz_trend_triggers" as any)
        .select("id, keyword, keyword_ko, keyword_ja, keyword_zh, keyword_category, artist_name, detected_at, source_url, source_image_url, influence_index, baseline_score, star_id, wiki_entry_id, status, lifetime_hours, peak_at, expired_at, peak_delay_hours, peak_score, source_title, source_snippet, context, context_ko, context_ja, context_zh, prev_api_total")
        .in("id", triggerIds);
      if (!triggers?.length) return [];

      const wikiIds = [...new Set((triggers as any[]).map((t: any) => t.wiki_entry_id).filter(Boolean))];
      const { data: entries } = wikiIds.length
        ? await supabase
            .from("wiki_entries")
            .select("id, title, title_ko, image_url, star_id")
            .in("id", wikiIds)
        : { data: [] as any[] };
      const entryMap = new Map((entries || []).map((e: any) => [e.id, e]));

      return (triggers as any[]).map((t: any): TrendTile => {
        const entry = entryMap.get(t.wiki_entry_id);
        return {
          id: t.id,
          keyword: t.keyword,
          keywordKo: t.keyword_ko,
          keywordJa: t.keyword_ja,
          keywordZh: t.keyword_zh,
          category: t.keyword_category || "social",
          artistName: entry?.title || t.artist_name || "",
          artistNameKo: entry?.title_ko || null,
          artistImageUrl: entry?.image_url || null,
          wikiEntryId: t.wiki_entry_id || "",
          influenceIndex: t.influence_index || 0,
          context: t.context,
          contextKo: t.context_ko,
          contextJa: t.context_ja,
          contextZh: t.context_zh,
          detectedAt: t.detected_at,
          peakAt: t.peak_at,
          expiredAt: t.expired_at,
          lifetimeHours: t.lifetime_hours,
          peakDelayHours: t.peak_delay_hours,
          baselineScore: t.baseline_score,
          peakScore: t.peak_score,
          sourceUrl: t.source_url,
          sourceTitle: t.source_title,
          sourceImageUrl: t.source_image_url,
          sourceSnippet: t.source_snippet,
          starId: entry?.star_id || t.star_id,
          status: t.status,
          prevApiTotal: t.prev_api_total,
        };
      });
    },
  });

  // Deduplicate: exclude bet keywords already in myKeywords
  const myIds = useMemo(() => new Set(myKeywords.map(k => k.id)), [myKeywords]);
  const uniqueBetKeywords = useMemo(
    () => betKeywords.filter((bk: TrendTile) => !myIds.has(bk.id)),
    [betKeywords, myIds]
  );

  // Not logged in
  if (!user) {
    return (
      <div className="px-4 pt-2 pb-5">
        <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: "220px" }}>
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" width={960} height={512} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "220px" }}>
            <h2 className="text-2xl font-black text-white leading-tight mb-2 whitespace-pre-line">
              {language === "ko"
                ? "K·스타가 만드는\n소비 트렌드를 발견하세요"
                : "Discover Trends\nDriven by K-Pop"}
            </h2>
            <p className="text-sm text-white/70 mb-4">
              {language === "ko"
                ? "패션, 뷰티, 음식까지 — 실시간 트렌드 분석"
                : "Fashion, beauty, food & more — real-time analysis"}
            </p>
            <button
              onClick={() => (window.location.href = "/login")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all self-start"
            >
              <LogIn className="w-4 h-4" />
              {language === "ko" ? "시작하기" : "Get Started"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in but no watched artists and no bets
  if (!myKeywords.length && !uniqueBetKeywords.length) {
    return (
      <div className="px-4 pt-2 pb-5">
        <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: "200px" }}>
          <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={960} height={512} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end h-full p-6" style={{ minHeight: "200px" }}>
            <h2 className="text-xl font-black text-white leading-tight mb-2 whitespace-pre-line">
              {language === "ko"
                ? "관심 아티스트를 등록하고\n맞춤 트렌드를 받아보세요"
                : "Follow your favorite artists\nfor personalized trends"}
            </h2>
            <button
              onClick={() => navigate("/t2/my")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-bold hover:bg-white/25 transition-all self-start"
            >
              <Heart className="w-4 h-4" />
              {language === "ko" ? "아티스트 등록하기" : "Follow Artists"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Personalized: My Picks carousel (artist keywords + bet keywords)
  const topPicks = myKeywords.slice(0, 8);
  const allItems = [...topPicks, ...uniqueBetKeywords.slice(0, 4)];

  return (
    <div className="pt-2 pb-2">
      <div className="px-4 mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-black text-foreground">My Picks</h2>
        </div>
        <button
          onClick={() => navigate("/t2/category/my")}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {myKeywords.length} {language === "ko" ? "개" : "trends"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div
        className="flex gap-3 overflow-x-auto px-4 pb-3 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", scrollPaddingLeft: "16px" }}
      >
        {allItems.map((item, idx) => {
          const isBet = idx >= topPicks.length;
          const config = CATEGORY_CONFIG[item.category];
          const rawSourceImg = sanitizeImageUrl(
            item.sourceImageUrl?.startsWith("https://") || item.sourceImageUrl?.startsWith("http://")
              ? item.sourceImageUrl
              : null
          );
          const safeSourceImg = rawSourceImg && !isBlockedImageDomain(rawSourceImg) ? rawSourceImg : null;
          const platformLogo = detectPlatformLogo(item.sourceUrl, item.sourceImageUrl);
          const bgImg = safeSourceImg || item.artistImageUrl || platformLogo;
          const gradient = HERO_GRADIENTS[idx % HERO_GRADIENTS.length];
          const sparkPath = generateSparkline(item.id.charCodeAt(0) + item.id.charCodeAt(1) + idx);

          return (
            <button
              key={item.id}
              onClick={() => navigate(`/t2/${item.id}`)}
              className={cn(
                "flex-none snap-start rounded-[20px] overflow-hidden text-left transition-all active:scale-[0.97] relative flex flex-col",
                idx === 0 ? "w-[260px]" : "w-[180px]"
              )}
              style={{ background: gradient }}
            >
              {bgImg && (
                <img
                  src={bgImg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30"
                  loading="lazy"
                />
              )}

              {/* Top: keyword + artist */}
              <div className="relative z-10 p-4 pb-2 flex-1">
                <div className="flex items-center gap-1 mb-1">
                  {isBet && (
                    <span className="text-[10px] font-bold text-white bg-purple-500/80 backdrop-blur-sm rounded-full px-1.5 py-0.5" style={{ filter: "hue-rotate(0deg)" }}>
                      💎
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wide">
                    {getLocalizedArtistName(item, language)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5 shrink-0 -scale-x-100 text-white" />
                  <h3
                    className={cn(
                      "font-black text-white leading-tight",
                      idx === 0 ? "text-lg line-clamp-3" : "text-sm line-clamp-2"
                    )}
                  >
                    {getLocalizedKeyword(item, language)}
                  </h3>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold text-white/70 bg-white/15 backdrop-blur-sm rounded-full px-2 py-0.5">
                    {config?.label || item.category}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-white/50">
                    <Clock className="w-2.5 h-2.5" />
                    {formatAge(item.detectedAt)}
                  </span>
                </div>
              </div>

              {/* Bottom: mini sparkline graph + period */}
              <div className="relative z-10 pb-5">
                <svg
                  viewBox="0 0 100 40"
                  className={cn("w-full", idx === 0 ? "h-[48px]" : "h-[36px]")}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id={`spark-fill-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="white" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="white" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${sparkPath} L100,40 L0,40 Z`}
                    fill={`url(#spark-fill-${item.id})`}
                  />
                  <path
                    d={sparkPath}
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.7"
                  />
                </svg>
                {(() => {
                  const age = formatAge(item.detectedAt);
                  const ageNum = parseInt(age) || 0;
                  const unit = age.includes("d") ? "d" : "h";
                  if (unit === "d" && ageNum >= 3) {
                    const step = Math.round(ageNum / 3);
                    return (
                      <div className="absolute bottom-2.5 left-2 right-2 flex justify-between text-[7px] font-medium text-white/35">
                        <span>{ageNum}{unit}</span>
                        <span>{ageNum - step}{unit}</span>
                        <span>{ageNum - step * 2}{unit}</span>
                        <span>now</span>
                      </div>
                    );
                  }
                  if (unit === "h" && ageNum >= 6) {
                    const step = Math.round(ageNum / 3);
                    return (
                      <div className="absolute bottom-2.5 left-2 right-2 flex justify-between text-[7px] font-medium text-white/35">
                        <span>{ageNum}h</span>
                        <span>{ageNum - step}h</span>
                        <span>{ageNum - step * 2}h</span>
                        <span>now</span>
                      </div>
                    );
                  }
                  return (
                    <div className="absolute bottom-2.5 left-2 right-2 flex justify-between text-[7px] font-medium text-white/35">
                      <span>{age}</span>
                      <span>·</span>
                      <span>·</span>
                      <span>now</span>
                    </div>
                  );
                })()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default T2HeroSection;
