import { useEffect, useState } from "react";
import { LayoutGrid, List, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import T2TrendTreemap from "@/components/t2/T2TrendTreemap";

type ViewMode = "treemap" | "list" | "artist";

const VIEW_TABS: { key: ViewMode; icon: typeof LayoutGrid }[] = [
  { key: "treemap", icon: LayoutGrid },
  { key: "list", icon: List },
  { key: "artist", icon: Users },
];

const T2TrendMap = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("treemap");

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

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
                  "flex items-center justify-center w-10 h-7 md:w-14 md:h-9 rounded-full transition-all",
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
      <div className="pt-14 pb-24">
        <div className="max-w-[90%] mx-auto">
          <T2TrendTreemap viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>
      </div>
      <V3TabBar activeTab="rankings" onTabChange={() => {}} />
    </>
  );
};

export default T2TrendMap;
