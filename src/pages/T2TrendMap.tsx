import { useEffect, useState, useRef, useCallback } from "react";
import { LayoutGrid, List, Users, MoreVertical, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import T2TrendTreemap, { type TrendCategory, type SortMode, ALL_CATEGORIES, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
import T2AdminControls from "@/components/t2/T2AdminControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type ViewMode = "treemap" | "list" | "artist";

const VIEW_ORDER: ViewMode[] = ["treemap", "list", "artist"];

const VIEW_TABS: { key: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { key: "treemap", icon: LayoutGrid, label: "Map" },
  { key: "list", icon: List, label: "List" },
  { key: "artist", icon: Users, label: "Artist" },
];

const SWIPE_THRESHOLD = 40;

const T2TrendMap = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("treemap");
  const [category, setCategory] = useState<TrendCategory>("all");
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const { isAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [myCount, setMyCount] = useState(0);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const handleCategoryStatsChange = useCallback((stats: Record<string, number>, total: number, my: number) => {
    setCategoryStats(stats);
    setTotalCount(total);
    setMyCount(my);
  }, []);

  const currentIndex = VIEW_ORDER.indexOf(viewMode);

  const isDrawerInteraction = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-vaul-drawer], [data-vaul-overlay], [role="dialog"]'));
  }, []);

  const handleSwipe = useCallback((deltaX: number) => {
    const idx = VIEW_ORDER.indexOf(viewMode);
    if (deltaX < -SWIPE_THRESHOLD && idx < VIEW_ORDER.length - 1) {
      setViewMode(VIEW_ORDER[idx + 1]);
    } else if (deltaX > SWIPE_THRESHOLD && idx > 0) {
      setViewMode(VIEW_ORDER[idx - 1]);
    }
  }, [viewMode]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDrawerInteraction(e.target)) {
      touchRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY };
    setIsDragging(true);
  }, [isDrawerInteraction]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDrawerInteraction(e.target) || !touchRef.current) return;

    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      const idx = VIEW_ORDER.indexOf(viewMode);
      const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === VIEW_ORDER.length - 1);
      setDragOffset(atEdge ? dx * 0.2 : dx);
    }
  }, [isDrawerInteraction, viewMode]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isDrawerInteraction(e.target)) {
      touchRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    setIsDragging(false);
    setDragOffset(0);
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    touchRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      handleSwipe(dx);
    }
  }, [handleSwipe, isDrawerInteraction]);

  useEffect(() => {
  }, []);

  const translateX = -currentIndex * 100 + (isDragging ? (dragOffset / window.innerWidth) * 100 : 0);

  return (
    <>
      <SEO
        title="Kinterest – K-Pop Driven Consumer Trends"
        titleKo="Kinterest – K-Pop 파생 소비 트렌드"
        description="Discover consumer trends triggered by K-Pop stars. Real-time influence mapping across fashion, food, beauty, and more."
        descriptionKo="K-Pop 스타가 만든 소비 트렌드를 실시간으로 발견하세요."
        path="/t2"
      />

      <V3Header
        centerSlot={
          <div
            className="flex items-center gap-0 rounded-full p-0.5 md:gap-1 md:p-1"
            style={{ backgroundColor: "hsl(var(--card))" }}
          >
            {VIEW_TABS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => { setViewMode(key); window.scrollTo({ top: 0 }); }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full transition-all",
                  "w-10 h-10 aspect-square md:aspect-auto md:w-auto md:h-8 md:px-4",
                  viewMode === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={key}
              >
                <Icon className="w-4 h-4 md:w-4 md:h-4" />
                <span className="hidden md:inline text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
        }
      />

      {/* Title + Sort — slides up on scroll */}
      <div
        className="fixed top-14 left-0 right-0 z-40 transition-all duration-500 ease-in-out overflow-hidden"
        style={{
          maxHeight: headerCollapsed ? 0 : 60,
          opacity: headerCollapsed ? 0 : 1,
          backgroundColor: "hsl(var(--card) / 0.9)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div className="md:max-w-[90%] mx-auto flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-muted-foreground">{t("trend.spectrumTitle")}</h2>
            {isAdmin && isMobile && (
              <div className="relative">
                <button onClick={() => setAdminMenuOpen(v => !v)}
                  className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
                {adminMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-xl shadow-lg p-3 min-w-[220px]">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Admin Tools</p>
                      <T2AdminControls />
                      <div className="border-t border-border mt-2 pt-2">
                        <button onClick={() => { navigate("/admin"); setAdminMenuOpen(false); }}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                          <Zap className="w-3 h-3" /> 관리자 대시보드
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {isAdmin && !isMobile && <T2AdminControls />}
          </div>
          <div className="flex items-center gap-1 bg-muted/50 rounded-full p-0.5">
            <button
              onClick={() => setSortMode("volume")}
              className={cn(
                "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                sortMode === "volume" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Hot
            </button>
            <button
              onClick={() => setSortMode("rate")}
              className={cn(
                "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                sortMode === "rate" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Trend
            </button>
          </div>
        </div>
      </div>

      {/* Category filter — always pinned at top */}
      <div
        className="fixed left-0 right-0 z-40 py-2 transition-all duration-500 ease-in-out"
        style={{
          top: headerCollapsed ? "3.5rem" : "6.25rem",
          backgroundColor: "hsl(var(--card) / 0.9)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <div className="md:max-w-[90%] mx-auto overflow-x-auto pb-1 scrollbar-hide">
          <div className="flex items-center gap-2 min-w-max px-4">
            {ALL_CATEGORIES.map((cat) => {
              const isActive = category === cat;
              const config = cat === "all" || cat === "my" ? null : CATEGORY_CONFIG[cat];

              return (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={cn(
                    "flex items-center gap-1.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                    cat === "all" ? "px-5" : "px-3"
                  )}
                  style={{
                    backgroundColor: isActive
                      ? (cat === "my" ? "hsl(45 90% 50%)" : config?.color ?? "hsl(var(--primary))")
                      : "hsl(var(--muted) / 0.35)",
                    color: isActive ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    borderColor: isActive
                      ? "transparent"
                      : cat === "all"
                        ? "hsl(var(--border) / 0.9)"
                        : cat === "my"
                        ? "hsl(45 90% 50% / 0.3)"
                        : config?.color ? `${config.color.replace(")", ", 0.3)").replace("hsl(", "hsla(")}` : "hsl(var(--border) / 0.9)",
                  }}
                >
                  {cat === "all" ? "All" : cat === "my" ? "★ My" : config?.label}
                  {(() => {
                    const count = cat === "all" ? totalCount : cat === "my" ? myCount : categoryStats[cat] || 0;
                    return count > 0 ? (
                      <span
                        className="text-[10px]"
                        style={{ color: isActive ? "hsl(var(--primary-foreground) / 0.75)" : "hsl(var(--muted-foreground) / 0.8)" }}
                      >
                        {count}
                      </span>
                    ) : null;
                  })()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="h-[100dvh] overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full items-start"
          style={{
            transform: `translateX(${translateX}%)`,
            transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          {VIEW_ORDER.map((mode) => (
            <div key={mode} className={cn("h-full w-full flex-shrink-0 overflow-y-auto overscroll-contain pb-24 scrollbar-hide transition-all duration-500 ease-in-out", headerCollapsed ? "pt-[6.5rem]" : "pt-[9rem]")}
              onScroll={(e) => {
                const scrollTop = (e.target as HTMLElement).scrollTop;
                setHeaderCollapsed(scrollTop > 80);
              }}
            >
              <div className="md:max-w-[90%] mx-auto">
                <T2TrendTreemap
                  viewMode={mode}
                  onViewModeChange={setViewMode}
                  selectedCategory={category}
                  onCategoryChange={setCategory}
                  hideCategory
                  hideHeader
                  sortMode={sortMode}
                  onSortModeChange={setSortMode}
                  onCategoryStatsChange={handleCategoryStatsChange}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </>
  );
};

export default T2TrendMap;
