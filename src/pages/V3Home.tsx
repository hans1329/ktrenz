import { useState, useEffect } from "react";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import V3Header from "@/components/v3/V3Header";
import V3TabBar, { type V3Tab } from "@/components/v3/V3TabBar";
import V3TrendRankings from "@/components/v3/V3TrendRankings";
import V3FanAgent from "@/components/v3/V3FanAgent";

const V3Home = () => {
  const [activeTab, setActiveTab] = useState<V3Tab>("rankings");
  const isMobile = useIsMobile();
  const isSubPage = activeTab === "agent";

  // V3 다크 테마 적용
  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "rankings": return <V3TrendRankings />;
      case "agent": return <V3FanAgent onBack={() => setActiveTab("rankings")} />;
    }
  };

  if (isMobile) {
    return (
      <>
        <SEO
          title="KTrenZ – Live K-Pop Trend Rankings"
          description="Track real-time K-Pop artist popularity with FES energy scores from YouTube, X (Twitter), and music charts. Updated every hour."
          path="/"
        />
        {!isSubPage && <V3Header />}
        <div className="pb-20 pt-14">
          {renderContent()}
        </div>
        <V3TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </>
    );
  }

  return (
    <>
      <SEO
        title="KTrenZ – Live K-Pop Trend Rankings"
        description="Track real-time K-Pop artist popularity with FES energy scores from YouTube, X (Twitter), and music charts. Updated every hour."
        path="/"
      />
      <div className="h-screen flex flex-col overflow-hidden">
        <V3DesktopHeader activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </>
  );
};

export default V3Home;
