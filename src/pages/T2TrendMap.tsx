import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import V3Header from "@/components/v3/V3Header";
import V3DesktopHeader from "@/components/v3/V3DesktopHeader";
import T2TrendTreemap from "@/components/t2/T2TrendTreemap";

const T2TrendMap = () => {
  const isMobile = useIsMobile();

  useEffect(() => {
    document.documentElement.classList.add("v3-theme");
    return () => { document.documentElement.classList.remove("v3-theme"); };
  }, []);

  if (isMobile) {
    return (
      <>
        <SEO
          title="Kinterest – K-Pop Driven Consumer Trends"
          titleKo="Kinterest – K-Pop 파생 소비 트렌드"
          description="Discover consumer trends triggered by K-Pop stars. Real-time influence mapping across fashion, food, beauty, and more."
          descriptionKo="K-Pop 스타가 만든 소비 트렌드를 실시간으로 발견하세요."
          path="/t2"
        />
        <V3Header />
        <div className="pt-14 pb-6">
          <T2TrendTreemap />
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title="Kinterest – K-Pop Driven Consumer Trends"
        titleKo="Kinterest – K-Pop 파생 소비 트렌드"
        description="Discover consumer trends triggered by K-Pop stars. Real-time influence mapping across fashion, food, beauty, and more."
        descriptionKo="K-Pop 스타가 만든 소비 트렌드를 실시간으로 발견하세요."
        path="/t2"
      />
      <div className="min-h-screen flex flex-col">
        <V3DesktopHeader activeTab="rankings" onTabChange={() => {}} />
        <main className="flex-1">
          <div className="max-w-[90%] mx-auto">
            <T2TrendTreemap />
          </div>
        </main>
      </div>
    </>
  );
};

export default T2TrendMap;
