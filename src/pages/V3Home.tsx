import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import V3Header from "@/components/v3/V3Header";
import V3TabBar, { type V3Tab } from "@/components/v3/V3TabBar";
import V3TrendRankings from "@/components/v3/V3TrendRankings";
import V3FanAgent from "@/components/v3/V3FanAgent";
import V3DesktopHero from "@/components/v3/V3DesktopHero";
import AgentAlertNotification from "@/components/v3/AgentAlertNotification";
import { useAgentAlerts } from "@/hooks/useAgentAlerts";

const V3Home = () => {
  const [activeTab, setActiveTab] = useState<V3Tab>("rankings");
  const isMobile = useIsMobile();
  const isSubPage = activeTab === "agent";
  const { pendingAlert, dismissAlert } = useAgentAlerts();


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
          title="KTrenZ – K-Pop Energy Analysis & Trend Prediction"
          titleKo="KTrenZ – K-Pop 에너지 분석 및 트렌드 예측"
          description="Analyze real-time K-Pop artist energy across YouTube, social, music, and buzz data. Data-driven trend prediction updated every 6 hours."
          descriptionKo="유튜브·소셜·음원·버즈 데이터 기반 K-Pop 에너지 실시간 분석과 트렌드 예측."
          path="/"
        />
        {!isSubPage && <V3Header />}
        <div className={cn(
          isSubPage
            ? "h-[calc(100dvh-5rem)] flex flex-col"
            : "pb-20 pt-14"
        )}>
          {renderContent()}
        </div>
        <V3TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <AgentAlertNotification alert={testAlert || pendingAlert} onDismiss={() => { setTestAlert(null); dismissAlert(); }} />
      </>
    );
  }

  return (
    <>
      <SEO
        title="KTrenZ – K-Pop Energy Analysis & Trend Prediction"
        titleKo="KTrenZ – K-Pop 에너지 분석 및 트렌드 예측"
        description="Analyze real-time K-Pop artist energy across YouTube, social, music, and buzz data. Data-driven trend prediction updated every 6 hours."
        descriptionKo="유튜브·소셜·음원·버즈 데이터 기반 K-Pop 에너지 실시간 분석과 트렌드 예측."
        path="/"
      />
      <div className="min-h-screen flex flex-col">
        <V3DesktopHeader activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1">
          {activeTab === "rankings" && <V3DesktopHero />}
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
      <AgentAlertNotification alert={pendingAlert} onDismiss={dismissAlert} />
    </>
  );
};

export default V3Home;
