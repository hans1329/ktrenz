import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, TrendingUp, Share2, ShoppingCart, Star, Flame, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import SmartImage from "@/components/SmartImage";

const GRADES = [
  { key: "all", label: "All", icon: Flame, color: "hsl(0 0% 60%)" },
  { key: "spark", label: "Spark", icon: Zap, color: "hsl(45 100% 55%)" },
  { key: "react", label: "React", icon: TrendingUp, color: "hsl(200 80% 55%)" },
  { key: "spread", label: "Spread", icon: Share2, color: "hsl(130 60% 45%)" },
  { key: "intent", label: "Intent", icon: ShoppingCart, color: "hsl(30 90% 55%)" },
  { key: "commerce", label: "Commerce", icon: Star, color: "hsl(340 80% 55%)" },
  { key: "explosive", label: "Explosive", icon: Flame, color: "hsl(0 85% 55%)" },
] as const;

type GradeFilter = typeof GRADES[number]["key"];

interface TrendKeyword {
  id: string;
  keyword: string;
  keyword_en: string | null;
  keyword_ko: string | null;
  artist_name: string;
  trend_grade: string | null;
  purchase_stage: string | null;
  influence_index: number | null;
  baseline_score: number | null;
  peak_score: number | null;
  prev_api_total: number | null;
  trend_score: number | null;
  source_image_url: string | null;
  keyword_category: string;
  detected_at: string;
  star_id: string | null;
  metadata: any;
}

interface ArtistGrade {
  id: string;
  star_id: string;
  grade: string;
  grade_score: number;
  influence_score: number;
  keyword_count: number;
  grade_breakdown: Record<string, number>;
  computed_at: string;
  star?: { display_name: string; name_ko: string | null; profile_image_url: string | null };
}

const T2TrendGrades = () => {
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [viewMode, setViewMode] = useState<"keywords" | "artists">("keywords");
  const [keywords, setKeywords] = useState<TrendKeyword[]>([]);
  const [artistGrades, setArtistGrades] = useState<ArtistGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [kwRes, artRes] = await Promise.all([
      supabase
        .from("ktrenz_trend_triggers")
        .select("id, keyword, keyword_en, keyword_ko, artist_name, trend_grade, purchase_stage, influence_index, baseline_score, peak_score, prev_api_total, trend_score, source_image_url, keyword_category, detected_at, star_id, metadata")
        .eq("status", "active")
        .not("trend_grade", "is", null)
        .order("influence_index", { ascending: false })
        .limit(200),
      supabase
        .from("ktrenz_trend_artist_grades")
        .select("id, star_id, grade, grade_score, keyword_count, grade_breakdown, computed_at")
        .order("grade_score", { ascending: false })
        .limit(100),
    ]);

    if (kwRes.data) setKeywords(kwRes.data as TrendKeyword[]);

    if (artRes.data) {
      // Fetch star info
      const starIds = artRes.data.map((a: any) => a.star_id);
      const { data: stars } = await supabase
        .from("ktrenz_stars")
        .select("id, display_name, name_ko, profile_image_url")
        .in("id", starIds);

      const starMap = new Map((stars || []).map((s: any) => [s.id, s]));
      setArtistGrades(
        artRes.data.map((a: any) => ({ ...a, star: starMap.get(a.star_id) || null })) as ArtistGrade[]
      );
    }
    setLoading(false);
  }

  const filteredKeywords = useMemo(() => {
    if (gradeFilter === "all") return keywords;
    return keywords.filter(k => k.trend_grade === gradeFilter);
  }, [keywords, gradeFilter]);

  const filteredArtists = useMemo(() => {
    if (gradeFilter === "all") return artistGrades;
    return artistGrades.filter(a => a.grade === gradeFilter);
  }, [artistGrades, gradeFilter]);

  const gradeConfig = (grade: string) => GRADES.find(g => g.key === grade) || GRADES[0];

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: viewMode === "keywords" ? keywords.length : artistGrades.length };
    for (const g of GRADES) {
      if (g.key === "all") continue;
      counts[g.key] = viewMode === "keywords"
        ? keywords.filter(k => k.trend_grade === g.key).length
        : artistGrades.filter(a => a.grade === g.key).length;
    }
    return counts;
  }, [keywords, artistGrades, viewMode]);

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Trend Grades | K-Trenz" description="Track K-pop trend lifecycle stages from Spark to Explosive" />
      <V3Header />

      <main className="pt-14 pb-20 px-3 max-w-2xl mx-auto">
        {/* Title */}
        <div className="flex items-center gap-2 mt-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Trend Grades</h1>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mb-3">
          {(["keywords", "artists"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                viewMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {mode === "keywords" ? "Keywords" : "Artists"}
            </button>
          ))}
        </div>

        {/* Grade filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 no-scrollbar">
          {GRADES.map(g => {
            const Icon = g.icon;
            const count = gradeCounts[g.key] || 0;
            return (
              <button
                key={g.key}
                onClick={() => setGradeFilter(g.key)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0",
                  gradeFilter === g.key
                    ? "text-white shadow-md"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
                style={gradeFilter === g.key ? { backgroundColor: g.color } : undefined}
              >
                <Icon className="w-3 h-3" />
                {g.label}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : viewMode === "keywords" ? (
          <div className="space-y-2">
            {filteredKeywords.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No keywords with this grade yet.
                <br />Grades are calculated after each collection cycle.
              </div>
            )}
            {filteredKeywords.map((kw, i) => {
              const gc = gradeConfig(kw.trend_grade || "spark");
              const growth = (kw.prev_api_total || 0) - (kw.baseline_score || 0);
              return (
                <button
                  key={kw.id}
                  onClick={() => navigate(`/t2/${kw.id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-card/80 transition-all text-left border border-border/40"
                >
                  {/* Rank */}
                  <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
                    {i + 1}
                  </span>

                  {/* Image */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                    {kw.source_image_url ? (
                      <SmartImage
                        src={kw.source_image_url}
                        alt={kw.keyword}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <gc.icon className="w-4 h-4" style={{ color: gc.color }} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {kw.keyword_en || kw.keyword}
                      </span>
                      <Badge
                        className="text-[10px] px-1.5 py-0 h-4 border-0 font-medium shrink-0"
                        style={{ backgroundColor: `${gc.color}20`, color: gc.color }}
                      >
                        {gc.label}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {kw.artist_name} · {kw.keyword_category}
                      {kw.purchase_stage && (
                        <span className="ml-1 opacity-70">· {kw.purchase_stage}</span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    {kw.trend_score != null ? (
                      <>
                        <div className="text-xs font-mono font-semibold text-foreground">
                          {(kw.trend_score * 100).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">score</div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-mono font-semibold text-foreground">
                          {Math.round(kw.influence_index || 0)}
                        </div>
                        {growth > 0 && (
                          <div className="text-[10px] text-green-500 font-mono">+{growth}</div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredArtists.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No artists with this grade yet.
              </div>
            )}
            {filteredArtists.map((artist, i) => {
              const gc = gradeConfig(artist.grade);
              return (
                <button
                  key={artist.id}
                  onClick={() => navigate(`/t2/artist/${artist.star_id}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-card/80 transition-all text-left border border-border/40"
                >
                  <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
                    {i + 1}
                  </span>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                    {artist.star?.profile_image_url ? (
                      <img
                        src={artist.star.profile_image_url}
                        alt={artist.star?.display_name || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <gc.icon className="w-4 h-4" style={{ color: gc.color }} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {artist.star?.display_name || "Unknown"}
                      </span>
                      <Badge
                        className="text-[10px] px-1.5 py-0 h-4 border-0 font-medium shrink-0"
                        style={{ backgroundColor: `${gc.color}20`, color: gc.color }}
                      >
                        {gc.label}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex gap-1 flex-wrap">
                      {Object.entries(artist.grade_breakdown || {}).map(([grade, count]) => (
                        <span key={grade} className="opacity-70">
                          {grade}: {count as number}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    {artist.influence_score > 0 ? (
                      <>
                        <div className="text-xs font-mono font-semibold text-foreground">
                          {artist.influence_score.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">influence</div>
                      </>
                    ) : (
                      <div className="text-xs font-mono font-semibold text-foreground">
                        {artist.grade_score}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {artist.keyword_count} kw
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </div>
  );
};

export default T2TrendGrades;
