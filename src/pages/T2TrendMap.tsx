import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { LayoutGrid, List, Users, MoreVertical, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import T2TrendTreemap, { type TrendCategory, type SortMode, type TrendTile, ALL_CATEGORIES, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
import T2HeroSection from "@/components/t2/T2HeroSection";
import T2AdminControls from "@/components/t2/T2AdminControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type ViewMode = "treemap" | "list" | "artist";

const VIEW_ORDER: ViewMode[] = ["treemap", "artist"];

const VIEW_TABS: { key: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
  { key: "treemap", icon: LayoutGrid, label: "Map" },
  { key: "artist", icon: Users, label: "Artist" },
];

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
const DIRECTION_LOCK_THRESHOLD = 10;
const HEADER_COLLAPSE_THRESHOLD = 60;

const T2TrendMap = () => {
  const [viewIndex, setViewIndex] = useState(0);
  const [category, setCategory] = useState<TrendCategory>("all");
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const isMobile = useIsMobile();
  const { t } = useLanguage();
  const { isAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [myCount, setMyCount] = useState(0);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [myKeywords, setMyKeywords] = useState<TrendTile[]>([]);
  const [scrollY, setScrollY] = useState(0);

  // Swipe state
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const viewMode = VIEW_ORDER[viewIndex];
  const shouldRenderSwipeOverlay = dragOffsetX !== 0 || isAnimating;

  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    locked: "horizontal" | "vertical" | null;
    isDragging: boolean;
  } | null>(null);

  // Which views to render: current + adjacent (lazy, avoids crash)
  const visibleViews = useMemo(() => {
    const views: { mode: ViewMode; index: number }[] = [];
    if (viewIndex > 0) views.push({ mode: VIEW_ORDER[viewIndex - 1], index: viewIndex - 1 });
    views.push({ mode: VIEW_ORDER[viewIndex], index: viewIndex });
    if (viewIndex < VIEW_ORDER.length - 1) views.push({ mode: VIEW_ORDER[viewIndex + 1], index: viewIndex + 1 });
    return views;
  }, [viewIndex]);

  useEffect(() => {
    const handleWindowScroll = () => {
      const nextScrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
      setScrollY(nextScrollY);
      setHeaderCollapsed(nextScrollY > HEADER_COLLAPSE_THRESHOLD);
    };

    handleWindowScroll();
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleWindowScroll);
  }, []);

  const handleCategoryStatsChange = useCallback((stats: Record<string, number>, total: number, my: number) => {
    setCategoryStats(stats);
    setTotalCount(total);
    setMyCount(my);
  }, []);

  const isDrawerInteraction = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-vaul-drawer], [data-vaul-overlay], [role="dialog"]'));
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (isDrawerInteraction(e.target) || isAnimating) {
      touchRef.current = null;
      return;
    }

    const touch = e.touches[0];
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      locked: null,
      isDragging: false,
    };
  }, [isDrawerInteraction, isAnimating]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || isDrawerInteraction(e.target)) return;

    const touch = e.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!touchRef.current.locked) {
      if (absDx < DIRECTION_LOCK_THRESHOLD && absDy < DIRECTION_LOCK_THRESHOLD) return;

      if (absDy >= absDx) {
        touchRef.current = null;
        setDragOffsetX(0);
        return;
      }

      touchRef.current.locked = "horizontal";
    }

    touchRef.current.isDragging = true;

    let clampedDx = dx;
    if ((dx > 0 && viewIndex === 0) || (dx < 0 && viewIndex === VIEW_ORDER.length - 1)) {
      clampedDx = dx * 0.2;
    }

    setDragOffsetX(clampedDx);
  }, [isDrawerInteraction, viewIndex]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || isDrawerInteraction(e.target)) {
      touchRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const elapsed = Date.now() - touchRef.current.startTime;
    const velocity = Math.abs(dx) / elapsed;
    const wasHorizontal = touchRef.current.locked === "horizontal";
    const wasDragging = touchRef.current.isDragging;

    touchRef.current = null;

    if (!wasHorizontal || !wasDragging) {
      setDragOffsetX(0);
      return;
    }

    const shouldSwipe = Math.abs(dx) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

    if (shouldSwipe) {
      if (dx < 0 && viewIndex < VIEW_ORDER.length - 1) {
        setIsAnimating(true);
        setDragOffsetX(-window.innerWidth);
        setPendingIndex(viewIndex + 1);
        setTimeout(() => {
          setViewIndex(viewIndex + 1);
          setDragOffsetX(0);
          setIsAnimating(false);
          setPendingIndex(null);
        }, 300);
        return;
      } else if (dx > 0 && viewIndex > 0) {
        setIsAnimating(true);
        setDragOffsetX(window.innerWidth);
        setPendingIndex(viewIndex - 1);
        setTimeout(() => {
          setViewIndex(viewIndex - 1);
          setDragOffsetX(0);
          setIsAnimating(false);
          setPendingIndex(null);
        }, 300);
        return;
      }
    }

    // Snap back
    setIsAnimating(true);
    setDragOffsetX(0);
    setTimeout(() => setIsAnimating(false), 300);
  }, [viewIndex, isDrawerInteraction]);


  return (
    <>
      <SEO
        title="Kinterest – K-Pop Driven Consumer Trends"
        titleKo="Kinterest – K-Pop 파생 소비 트렌드"
        description="Discover consumer trends triggered by K-Pop stars. Real-time influence mapping across fashion, food, beauty, and more."
        descriptionKo="K-Pop 스타가 만든 소비 트렌드를 실시간으로 발견하세요."
        path="/t2"
      />

      <div className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg">
        <V3Header
          rightSlot={
            <div
              className="flex items-center gap-0 rounded-full p-0.5"
              style={{ backgroundColor: "hsl(var(--muted) / 0.5)" }}
            >
              {VIEW_TABS.map(({ key, icon: Icon, label }, i) => (
                <button
                  key={key}
                  onClick={() => {
                    setViewIndex(i);
                    window.scrollTo({ top: 0 });
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-full transition-all",
                    "w-9 h-9 aspect-square",
                    viewIndex === i
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-label={key}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          }
        />

        {/* Fixed sub-header — hidden (title/sort buttons moved or removed)
        <div
          className="fixed top-14 left-0 right-0 z-40 bg-card/90 backdrop-blur-lg"
        >
          <div className="md:max-w-[90%] mx-auto flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-muted-foreground">{t("trend.spectrumTitle")}</h2>
              {isAdmin && isMobile && (
                <div className="relative">
                  <button
                    onClick={() => setAdminMenuOpen((v) => !v)}
                    className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {adminMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-[9999] bg-background border border-border rounded-xl shadow-lg p-3 min-w-[220px]">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Admin Tools</p>
                        <T2AdminControls />
                        <div className="border-t border-border mt-2 pt-2">
                          <button
                            onClick={() => {
                              navigate("/admin");
                              setAdminMenuOpen(false);
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
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
                onClick={() => setSortMode("rate")}
                className={cn(
                  "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  sortMode === "rate" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Hot
              </button>
              <button
                onClick={() => setSortMode("volume")}
                className={cn(
                  "min-w-[60px] px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                  sortMode === "volume" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Trend
              </button>
            </div>
          </div>
        </div>
        */}
      </div>

      {/* Category filter buttons — hidden for carousel view
      <div
        className={cn(
          "fixed left-0 right-0 z-50 py-2 transition-colors duration-300",
          headerCollapsed ? "bg-card/30 backdrop-blur-sm" : "bg-card"
        )}
        style={{ top: headerCollapsed ? 0 : `${Math.max(0, 6.25 * 16 - Math.max(0, scrollY))}px` }}
      >
        <div className="md:max-w-[90%] mx-auto overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-max px-4">
            {ALL_CATEGORIES.map((cat) => {
              const isActive = category === cat;
              const config = cat === "all" || cat === "my" ? null : CATEGORY_CONFIG[cat];
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={cn("flex items-center gap-1.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border", cat === "all" ? "px-5" : "px-3")}
                >
                  {cat === "all" ? "All" : cat === "my" ? "★ My" : config?.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      */}

      <div
        className=""
        style={{ touchAction: "pan-y pinch-zoom" }}
        // onTouchStart={onTouchStart}
        // onTouchMove={onTouchMove}
        // onTouchEnd={onTouchEnd}
      >
        <div
          className="pb-24 scrollbar-hide pt-[4rem]"
        >
          <div className="relative">
            <div className="md:max-w-[90%] mx-auto relative z-10">
              {/* Hero section */}
              <T2HeroSection myKeywords={myKeywords} />

              <div
                style={{
                  transform: shouldRenderSwipeOverlay ? `translate3d(${dragOffsetX}px, 0, 0)` : 'none',
                  transition: isAnimating ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
                  willChange: shouldRenderSwipeOverlay ? 'transform' : 'auto',
                }}
              >
                <T2TrendTreemap
                  viewMode={viewMode}
                  onViewModeChange={(m) => setViewIndex(VIEW_ORDER.indexOf(m))}
                  selectedCategory={category}
                  onCategoryChange={setCategory}
                  hideCategory
                  hideHeader
                  sortMode={sortMode}
                  onSortModeChange={setSortMode}
                  onCategoryStatsChange={handleCategoryStatsChange}
                  onMyKeywordsChange={setMyKeywords}
                />
              </div>
            </div>

            {shouldRenderSwipeOverlay && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                {visibleViews
                  .filter(({ index }) => index !== viewIndex)
                  .map(({ mode, index }) => {
                    const offsetPercent = (index - viewIndex) * 100;

                    return (
                      <div
                        key={mode}
                        className="absolute inset-x-0 top-0"
                        style={{
                          transform: `translate3d(calc(${offsetPercent}% + ${dragOffsetX}px), 0, 0)`,
                          transition: isAnimating ? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
                          willChange: 'transform',
                        }}
                      >
                        <div className="md:max-w-[90%] mx-auto">
                          <T2TrendTreemap
                            viewMode={mode}
                            onViewModeChange={(m) => setViewIndex(VIEW_ORDER.indexOf(m))}
                            selectedCategory={category}
                            onCategoryChange={setCategory}
                            hideCategory
                            hideHeader
                            sortMode={sortMode}
                            onSortModeChange={setSortMode}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </>
  );
};

export default T2TrendMap;
