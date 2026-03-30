import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, ExternalLink, Eye, Share2, ChevronRight, Flame, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/* ───── sample data ───── */
const SAMPLE_KEYWORDS = [
  {
    id: "kw-1",
    keyword: "Swim",
    keywordKo: "스윔",
    category: "fashion",
    trendScore: 87,
    scoreDelta: +24,
    momentum: "surging",
    detectedAt: "2026-03-27T06:00:00Z",
    sources: [
      {
        id: "src-1",
        artistName: "Jungkook",
        artistImage: "https://i.pravatar.cc/80?u=jk",
        starType: "member",
        groupName: "BTS",
        sourceType: "instagram",
        sourceUrl: "https://instagram.com/p/example1",
        title: "Jungkook's swim collection photoshoot",
        detectedAt: "2026-03-27T06:00:00Z",
        engagementScore: 94,
      },
      {
        id: "src-2",
        artistName: "Huh Yunjin",
        artistImage: "https://i.pravatar.cc/80?u=yj",
        starType: "member",
        groupName: "LE SSERAFIM",
        sourceType: "tiktok",
        sourceUrl: "https://tiktok.com/@example/video/123",
        title: "Summer swim fashion haul with Yunjin",
        detectedAt: "2026-03-27T09:00:00Z",
        engagementScore: 78,
      },
      {
        id: "src-3",
        artistName: "BTS",
        artistImage: "https://i.pravatar.cc/80?u=bts",
        starType: "group",
        groupName: null,
        sourceType: "news",
        sourceUrl: "https://news.example.com/bts-swim",
        title: "BTS x Nike Swim collaboration announced",
        detectedAt: "2026-03-28T02:00:00Z",
        engagementScore: 65,
      },
    ],
    platforms: { naver_news: 42, youtube: 28, tiktok: 18, instagram: 12 },
  },
  {
    id: "kw-2",
    keyword: "Gelato",
    keywordKo: "젤라또",
    category: "food",
    trendScore: 72,
    scoreDelta: +15,
    momentum: "spreading",
    detectedAt: "2026-03-26T06:00:00Z",
    sources: [
      {
        id: "src-4",
        artistName: "Minji",
        artistImage: "https://i.pravatar.cc/80?u=mj",
        starType: "member",
        groupName: "NewJeans",
        sourceType: "instagram",
        sourceUrl: "https://instagram.com/p/example2",
        title: "Minji's gelato date in Italy",
        detectedAt: "2026-03-26T06:00:00Z",
        engagementScore: 88,
      },
      {
        id: "src-5",
        artistName: "Kazuha",
        artistImage: "https://i.pravatar.cc/80?u=kz",
        starType: "member",
        groupName: "LE SSERAFIM",
        sourceType: "youtube",
        sourceUrl: "https://youtube.com/watch?v=example",
        title: "Kazuha tries 10 gelato flavors",
        detectedAt: "2026-03-27T03:00:00Z",
        engagementScore: 71,
      },
    ],
    platforms: { naver_news: 15, youtube: 35, tiktok: 30, instagram: 20 },
  },
  {
    id: "kw-3",
    keyword: "Pilates",
    keywordKo: "필라테스",
    category: "beauty",
    trendScore: 63,
    scoreDelta: +8,
    momentum: "building",
    detectedAt: "2026-03-25T06:00:00Z",
    sources: [
      {
        id: "src-6",
        artistName: "Jennie",
        artistImage: "https://i.pravatar.cc/80?u=jn",
        starType: "solo",
        groupName: null,
        sourceType: "youtube",
        sourceUrl: "https://youtube.com/watch?v=example2",
        title: "Jennie's morning pilates routine",
        detectedAt: "2026-03-25T06:00:00Z",
        engagementScore: 92,
      },
    ],
    platforms: { naver_news: 22, youtube: 45, tiktok: 20, instagram: 13 },
  },
];

const MOMENTUM_CONFIG: Record<string, { label: string; icon: typeof Flame; color: string }> = {
  surging: { label: "🔥 급상승", icon: Flame, color: "text-red-500" },
  spreading: { label: "📈 확산 중", icon: TrendingUp, color: "text-amber-500" },
  building: { label: "🌱 형성 중", icon: Sparkles, color: "text-emerald-500" },
};

const SOURCE_ICON: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  news: "📰",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "방금 전";
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const KeywordInfluence = () => {
  const navigate = useNavigate();
  const [selectedKw, setSelectedKw] = useState<string | null>(null);

  const activeKeyword = SAMPLE_KEYWORDS.find(k => k.id === selectedKw);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Keyword Influence</h1>
          <p className="text-xs text-muted-foreground">Trace how artist content seeds market trends</p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Keyword Cards */}
        {SAMPLE_KEYWORDS.map(kw => {
          const m = MOMENTUM_CONFIG[kw.momentum];
          const MIcon = m?.icon || Sparkles;
          const isOpen = selectedKw === kw.id;

          return (
            <div key={kw.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Keyword Header */}
              <button
                onClick={() => setSelectedKw(isOpen ? null : kw.id)}
                className="w-full px-4 py-4 flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-black text-foreground">{kw.keyword}</span>
                    <span className="text-sm text-muted-foreground">{kw.keywordKo}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{kw.category}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-bold text-foreground">{kw.trendScore}</span>
                    <span className={cn("text-xs font-semibold", kw.scoreDelta > 0 ? "text-emerald-500" : "text-red-500")}>
                      {kw.scoreDelta > 0 ? "+" : ""}{kw.scoreDelta}
                    </span>
                    <span className={cn("flex items-center gap-1 text-xs font-medium", m?.color)}>
                      <MIcon className="w-3.5 h-3.5" />{m?.label}
                    </span>
                  </div>
                </div>

                {/* Artist avatars stack */}
                <div className="flex -space-x-2 shrink-0">
                  {kw.sources.slice(0, 3).map(s => (
                    <img
                      key={s.id}
                      src={s.artistImage}
                      alt={s.artistName}
                      className="w-8 h-8 rounded-full border-2 border-card object-cover"
                    />
                  ))}
                  {kw.sources.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      +{kw.sources.length - 3}
                    </div>
                  )}
                </div>

                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              </button>

              {/* Expanded Content */}
              {isOpen && (
                <div className="border-t border-border">
                  {/* Platform breakdown */}
                  <div className="px-4 py-3 flex gap-2">
                    {Object.entries(kw.platforms).map(([platform, pct]) => (
                      <div key={platform} className="flex-1 bg-muted/50 rounded-lg p-2 text-center">
                        <div className="text-[10px] text-muted-foreground capitalize">{platform.replace("_", " ")}</div>
                        <div className="text-sm font-bold text-foreground">{pct}%</div>
                      </div>
                    ))}
                  </div>

                  {/* Source contents */}
                  <div className="px-4 pb-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Origin Contents ({kw.sources.length})
                    </h4>
                    {kw.sources.map(src => (
                      <div
                        key={src.id}
                        className="flex items-start gap-3 rounded-xl bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
                      >
                        <img src={src.artistImage} alt={src.artistName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-sm font-bold text-foreground">{src.artistName}</span>
                            {src.groupName && (
                              <span className="text-xs text-muted-foreground">· {src.groupName}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{src.title}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{SOURCE_ICON[src.sourceType]} {src.sourceType}</span>
                            <span>{timeAgo(src.detectedAt)}</span>
                            <span className="text-primary font-semibold">Eng. {src.engagementScore}</span>
                          </div>
                        </div>
                        <a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 shrink-0">
                          <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KeywordInfluence;
