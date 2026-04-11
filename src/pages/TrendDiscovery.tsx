import { useState, useCallback } from "react";
import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import T2TrendTreemap, { type TrendCategory, type SortMode, type TrendTile } from "@/components/t2/T2TrendTreemap";
import T2MomentumSignals from "@/components/t2/T2MomentumSignals";
import T2MegaTrends from "@/components/t2/T2MegaTrends";
import T2CrossSourceInsights from "@/components/t2/T2CrossSourceInsights";
import { useLanguage } from "@/contexts/LanguageContext";

const TrendDiscovery = () => {
  const [category, setCategory] = useState<TrendCategory>("all");
  const [sortMode, setSortMode] = useState<SortMode>("volume");
  const { t } = useLanguage();

  const handleCategoryStatsChange = useCallback((_stats: Record<string, number>, _total: number, _my: number) => {}, []);

  return (
    <>
      <SEO
        title="KTrenZ – Trend Discovery"
        titleKo="KTrenZ – 트렌드 디스커버리"
        description="Discover real-time K-Pop driven consumer trends. Rising keywords, momentum signals, and cross-source insights."
        descriptionKo="K-Pop이 만드는 실시간 소비 트렌드를 발견하세요."
        path="/discover"
      />

      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header />
      </div>

      <div className="pb-24 pt-[4rem]">
        <div className="md:max-w-[90%] mx-auto">
          {/* Mega Trends — cross-artist trend detection */}
          <T2MegaTrends />

          {/* Trend Treemap / List */}
          <T2TrendTreemap
            viewMode="treemap"
            onViewModeChange={() => {}}
            selectedCategory={category}
            onCategoryChange={setCategory}
            hideCategory
            hideHeader
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            onCategoryStatsChange={handleCategoryStatsChange}
          />

          {/* Momentum Signals */}
          <T2MomentumSignals />

          {/* Cross Source Insights */}
          <T2CrossSourceInsights />
        </div>
      </div>

      <V3TabBar activeTab="discover" onTabChange={() => {}} />
    </>
  );
};

export default TrendDiscovery;
