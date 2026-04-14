import SEO from "@/components/SEO";
import V3Header from "@/components/v3/V3Header";
import V3TabBar from "@/components/v3/V3TabBar";
import DiscoverLeaderboard from "@/components/discover/DiscoverLeaderboard";
import DiscoverBattleStatus from "@/components/discover/DiscoverBattleStatus";
import DiscoverUserRankings from "@/components/discover/DiscoverUserRankings";
import DiscoverHotContent from "@/components/discover/DiscoverHotContent";
import HeaderTicketSlot from "@/components/HeaderTicketSlot";
import V3Footer from "@/components/v3/V3Footer";

const TrendDiscovery = () => {
  return (
    <>
      <SEO
        title="KTrenZ – Discover"
        titleKo="KTrenZ – 디스커버"
        description="Battle leaderboard, live status, top predictors, and trending K-Pop content."
        descriptionKo="배틀 리더보드, 실시간 현황, 예측 랭킹, 인기 콘텐츠를 확인하세요."
        path="/discover"
      />

      <div className="fixed top-0 left-0 right-0 z-50 bg-card">
        <V3Header rightSlot={<HeaderTicketSlot />} />
      </div>

      <div className="pb-24 pt-[4rem]">
        <div className="md:max-w-[90%] mx-auto">
          <DiscoverLeaderboard />
          <DiscoverBattleStatus />
          <DiscoverUserRankings />
          <DiscoverHotContent />
        </div>
      </div>

      <V3TabBar activeTab="discover" onTabChange={() => {}} />
    </>
  );
};

export default TrendDiscovery;
