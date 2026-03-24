import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { ChevronRight, Clock, Star, LogIn, TrendingUp, Sparkles, Heart } from "lucide-react";
import { sanitizeImageUrl, isBlockedImageDomain, detectPlatformLogo, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
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
  const { language, t } = useLanguage();

  // Not logged in — welcome & sign-in prompt
  if (!user) {
    return (
      <div className="px-4 pt-4 pb-5">
        <div className="rounded-2xl border border-border/30 bg-card/60 backdrop-blur-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-black text-foreground">For You</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {language === "ko"
              ? "로그인하고 관심 아티스트의 맞춤 트렌드를 받아보세요"
              : "Sign in to get personalized trends from your favorite artists"}
          </p>
          <button
            onClick={() => (window.location.href = "/login")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            <LogIn className="w-4 h-4" />
            {language === "ko" ? "시작하기" : "Get Started"}
          </button>
        </div>
      </div>
    );
  }

  // Logged in but no watched artists — registration prompt
  if (!myKeywords.length) {
    return (
      <div className="px-4 pt-4 pb-5">
        <div className="rounded-2xl border border-border/30 bg-card/60 backdrop-blur-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-black text-foreground">For You</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {language === "ko"
              ? "관심 아티스트를 등록하면 맞춤 트렌드가 여기에 표시됩니다"
              : "Follow artists to see personalized trends here"}
          </p>
          <button
            onClick={() => navigate("/t2/my")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-bold hover:bg-primary/15 transition-all"
          >
            <Heart className="w-4 h-4" />
            {language === "ko" ? "아티스트 등록하기" : "Follow Artists"}
            <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
        </div>
      </div>
    );
  }

  // Personalized section with My Picks carousel
  const topPicks = myKeywords.slice(0, 8);

  return (
    <div className="pt-4 pb-2">
      {/* Section header */}
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

      {/* My Picks carousel */}
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-3 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        {topPicks.map((item, idx) => {
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

          return (
            <button
              key={item.id}
              onClick={() => navigate(`/t2/${item.id}`)}
              className="flex-none snap-start rounded-[20px] overflow-hidden text-left transition-all active:scale-[0.97] relative"
              style={{
                width: idx === 0 ? "260px" : "180px",
                height: idx === 0 ? "260px" : "220px",
                background: gradient,
              }}
            >
              {bgImg && (
                <img
                  src={bgImg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40"
                  loading="lazy"
                />
              )}
              <div className="relative z-10 flex flex-col justify-end h-full p-4">
                <span className="absolute top-3 right-3 flex items-center gap-0.5 text-[10px] text-white/70 bg-white/10 backdrop-blur-sm rounded-full px-2 py-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {formatAge(item.detectedAt)}
                </span>
                <span className="text-[11px] font-semibold text-white/70 mb-1">
                  {getLocalizedArtistName(item, language)}
                </span>
                <h3
                  className={cn(
                    "font-black text-white leading-tight",
                    idx === 0 ? "text-xl line-clamp-3" : "text-sm line-clamp-2"
                  )}
                >
                  {getLocalizedKeyword(item, language)}
                </h3>
                <span className="mt-2 text-[10px] font-bold text-white/80 bg-white/15 backdrop-blur-sm rounded-full px-2 py-0.5 self-start">
                  {config?.label || item.category}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default T2HeroSection;
