import { useEffect, useState, useRef, useCallback } from "react";
import { LayoutGrid, List, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import T2TrendTreemap, { type TrendCategory, ALL_CATEGORIES, CATEGORY_CONFIG } from "@/components/t2/T2TrendTreemap";
import { useIsMobile } from "@/hooks/use-mobile";

type ViewMode = "treemap" | "list" | "artist";

const VIEW_ORDER: ViewMode[] = ["treemap", "list", "artist"];

const VIEW_TABS: { key: ViewMode; icon: typeof LayoutGrid }[] = [
  { key: "treemap", icon: LayoutGrid },
  { key: "list", icon: List },
  { key: "artist", icon: Users },
];

const SWIPE_THRESHOLD = 40;

const T2TrendMap = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("treemap");
  const [category, setCategory] = useState<TrendCategory>("all");
  const isMobile = useIsMobile();
  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const currentIndex = VIEW_ORDER.indexOf(viewMode);

  const handleSwipe = useCallback((deltaX: number) => {
    const idx = VIEW_ORDER.indexOf(viewMode);
    if (deltaX < -SWIPE_THRESHOLD && idx < VIEW_ORDER.length - 1) {
      setViewMode(VIEW_ORDER[idx + 1]);
    } else if (deltaX > SWIPE_THRESHOLD && idx > 0) {
      setViewMode(VIEW_ORDER[idx - 1]);
    }
  }, [viewMode]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY };
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      const idx = VIEW_ORDER.indexOf(viewMode);
      const atEdge = (dx > 0 && idx === 0) || (dx < 0 && idx === VIEW_ORDER.length - 1);
      setDragOffset(atEdge ? dx * 0.2 : dx);
    }
  }, [viewMode]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
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
  }, [handleSwipe]);

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
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
          <div className="flex items-center gap-1 bg-muted rounded-full border border-border p-1 md:p-1">
            {VIEW_TABS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={cn(
                  "flex items-center justify-center w-10 h-7 md:w-12 md:h-8 rounded-full transition-all",
                  viewMode === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={key}
              >
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            ))}
          </div>
        }
      />

      <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md pt-3 pb-2">
        <div className="max-w-[90%] mx-auto overflow-x-auto pb-1 scrollbar-hide">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border"
                  style={{
                    backgroundColor: isActive
                      ? cat === "my"
                        ? "hsl(45, 90%, 50%)"
                        : config?.color ?? "hsl(var(--primary))"
                      : cat === "my"
                        ? "hsla(45, 90%, 50%, 0.12)"
                        : config?.color
                          ? `${config.color.replace(")", ", 0.12)").replace("hsl(", "hsla(")}`
                          : "hsl(var(--muted) / 0.5)",
                    color: isActive
                      ? "#fff"
                      : cat === "my"
                        ? "hsl(45, 90%, 50%)"
                        : config?.color ?? "hsl(var(--muted-foreground))",
                    borderColor: isActive
                      ? cat === "my"
                        ? "hsl(45, 90%, 50%)"
                        : config?.color ?? "hsl(var(--primary))"
                      : cat === "my"
                        ? "hsla(45, 90%, 50%, 0.25)"
                        : config?.color
                          ? `${config.color.replace(")", ", 0.25)").replace("hsl(", "hsla(")}`
                          : "hsl(var(--border))",
                  }}
                >
                  {cat === "all" ? "All" : cat === "my" ? "⭐ My" : config?.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="pb-24 overflow-hidden"
        {...(isMobile ? { onTouchStart, onTouchMove, onTouchEnd } : {})}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(${translateX}%)`,
            transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        >
          {VIEW_ORDER.map((mode) => (
            <div key={mode} className="w-full flex-shrink-0">
              <div className="max-w-[90%] mx-auto">
                <T2TrendTreemap
                  viewMode={mode}
                  onViewModeChange={setViewMode}
                  selectedCategory={category}
                  onCategoryChange={setCategory}
                  hideCategory
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
