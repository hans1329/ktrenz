import { useState, useEffect, useLayoutEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import V3Sidebar from "@/components/v3/V3Sidebar";
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
        <Helmet>
          <title>KTRENDZ - Live K-Pop Trend Rankings</title>
          <meta name="description" content="Real-time K-Pop trend rankings powered by YouTube, X, and music data" />
        </Helmet>
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
      <Helmet>
        <title>KTRENDZ - Live K-Pop Trend Rankings</title>
        <meta name="description" content="Real-time K-Pop trend rankings powered by YouTube, X, and music data" />
      </Helmet>
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <V3Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <main className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto">
                {renderContent()}
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default V3Home;
