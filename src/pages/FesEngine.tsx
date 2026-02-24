import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import V3Sidebar from "@/components/v3/V3Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Home, Flame, Youtube, Zap, Music, TrendingUp, Activity, Gauge, Server } from "lucide-react";
import { cn } from "@/lib/utils";

const SectionHeader = ({ icon: Icon, title, color }: { icon: any; title: string; color: string }) => (
  <div className="flex items-center gap-2 mt-6 mb-3">
    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", color)}><Icon className="w-4 h-4 text-white" /></div>
    <h2 className="text-base font-black text-foreground">{title}</h2>
  </div>
);

const FormulaCard = ({ title, formula, description }: { title: string; formula: string; description?: string }) => (
  <Card className="p-3 bg-card border-border/50">
    <p className="text-[11px] text-muted-foreground font-medium mb-1">{title}</p>
    <code className="block text-xs font-mono font-bold text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{formula}</code>
    {description && <p className="text-[10px] text-muted-foreground mt-1.5">{description}</p>}
  </Card>
);

const VarTable = ({ rows }: { rows: { name: string; desc: string; source: string }[] }) => (
  <div className="rounded-lg border border-border overflow-hidden">
    <table className="w-full text-xs">
      <thead><tr className="bg-muted/50"><th className="text-left p-2 font-semibold text-foreground">변수</th><th className="text-left p-2 font-semibold text-foreground">설명</th><th className="text-left p-2 font-semibold text-foreground">출처</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (<tr key={i} className="border-t border-border"><td className="p-2 font-mono text-primary text-[11px]">{r.name}</td><td className="p-2 text-muted-foreground">{r.desc}</td><td className="p-2"><Badge variant="outline" className="text-[9px]">{r.source}</Badge></td></tr>))}
      </tbody>
    </table>
  </div>
);

const ApiCard = ({ method, endpoint, description, params }: { method: string; endpoint: string; description: string; params?: string[] }) => (
  <Card className="p-3 bg-card border-border/50">
    <div className="flex items-center gap-2 mb-1"><Badge className="text-[9px] bg-primary/20 text-primary border-0 rounded">{method}</Badge><code className="text-[11px] font-mono font-bold text-foreground">{endpoint}</code></div>
    <p className="text-[10px] text-muted-foreground">{description}</p>
    {params && params.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{params.map((p, i) => <Badge key={i} variant="secondary" className="text-[9px]">{p}</Badge>)}</div>}
  </Card>
);

const FesEngine = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => { document.documentElement.classList.add("v3-theme"); return () => { document.documentElement.classList.remove("v3-theme"); }; }, []);

  const PageContent = () => (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 pb-24 space-y-3">
      <Card className="p-4 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center"><Gauge className="w-6 h-6 text-primary" /></div>
          <div><h1 className="text-lg font-black text-foreground">KTRENDZ 스코어링 엔진</h1><p className="text-xs text-muted-foreground mt-0.5">아티스트 트렌드 점수와 팬 에너지를 계산하는 방법</p></div>
        </div>
      </Card>

      <SectionHeader icon={TrendingUp} title="종합 트렌드 스코어" color="bg-primary" />
      <p className="text-xs text-muted-foreground">아티스트 상세 페이지에 표시되는 메인 점수입니다.</p>
      <FormulaCard title="기본 가중치" formula="TotalTrendScore = YouTube × 0.60 + Buzz × 0.20 + Music × 0.20" description="Buzz/YouTube 비율이 0.5를 초과하면 Buzz 가중치가 자동으로 최대 0.35까지 증가합니다." />

      <SectionHeader icon={Youtube} title="유튜브 스코어" color="bg-destructive" />
      <FormulaCard title="공식" formula={`YouTubeScore = subScore + totalViewScore + recentViewScore + recentEngagement + volumeScore\n\nsubScore       = subscribers / 1,000,000 × 100\ntotalViewScore = totalViews / 100,000,000 × 50\nrecentViewScore= avgRecentViews / 1,000,000 × 30\nrecentEngagement = (likes + comments) / 100,000 × 20\nvolumeScore    = min(50, totalVideos / 100 × 10)`} />
      <VarTable rows={[
        { name: "subscriberCount", desc: "채널 구독자 수", source: "YouTube Data API v3" },
        { name: "totalViewCount", desc: "채널 누적 조회수", source: "YouTube Data API v3" },
        { name: "avgRecentViews", desc: "최근 영상 평균 조회수", source: "YouTube Data API v3" },
      ]} />

      <SectionHeader icon={Zap} title="X (트위터) 버즈 스코어" color="bg-amber-500" />
      <FormulaCard title="공식" formula={`BuzzScore = mentionScore + sentimentBonus\n\nmentionScore   = min(800, log10(mentionCount) × 200)\nsentimentBonus = (sentimentScore − 50) × 4`} />

      <SectionHeader icon={Music} title="뮤직 스코어" color="bg-purple-600" />
      <FormulaCard title="공식" formula={`MusicScore = lastfmListeners + lastfmPlays + deezerFans + mbAlbums + mbSingles`} />

      <SectionHeader icon={Flame} title="팬 에너지 스코어 (FES)" color="bg-red-600" />
      <p className="text-xs text-muted-foreground">아티스트의 <strong>현재 모멘텀</strong>을 과거 기준값 대비 측정합니다. 100점 = 평상시 상태.</p>
      <FormulaCard title="핵심 공식" formula="FES = Velocity × 0.40 + Intensity × 0.60" />

      <Card className="p-3 bg-card border-border/50 space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3 h-3 text-amber-500" /><span className="text-xs font-bold text-foreground">속도 Velocity (40%)</span></div>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Velocity = buzzVelocity × 0.60 + ytVelocity × 0.40\n\nbuzzVelocity = (mentions_6h / avg_mentions_6h) × 100\nytVelocity   = (views_24h / avg_views_24h) × 100`}</code>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Activity className="w-3 h-3 text-blue-500" /><span className="text-xs font-bold text-foreground">강도 Intensity (60%)</span></div>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Intensity = ytIntensity × 0.50 + buzzIntensity × 0.50\n\nytIntensity   = (engagement_rate / avg_engagement) × 100\nbuzzIntensity = (sentiment_score / avg_sentiment) × 100`}</code>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💤</span><p className="text-xs font-bold text-foreground mt-1">&lt; 100</p><p className="text-[10px] text-muted-foreground">저조</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">⚡</span><p className="text-xs font-bold text-foreground mt-1">150 – 300</p><p className="text-[10px] text-muted-foreground">활발</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">🔥</span><p className="text-xs font-bold text-foreground mt-1">300+</p><p className="text-[10px] text-muted-foreground">폭발적</p></Card>
      </div>

      <SectionHeader icon={Server} title="API 및 데이터 소스" color="bg-slate-600" />
      <div className="space-y-2">
        <ApiCard method="POST" endpoint="crawl-youtube-trends" description="YouTube 채널 통계 + 최근 200개 영상 데이터를 가져와 점수를 계산합니다." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="crawl-x-mentions" description="X/웹 멘션을 검색하고 버즈 + 감성을 계산합니다." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="crawl-music-data" description="Last.fm, MusicBrainz, Deezer 데이터를 수집합니다." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="calculate-energy-score" description="캐시된 데이터 vs 베이스라인으로 FES를 계산합니다." params={["wikiEntryId?"]} />
      </div>

      <VarTable rows={[
        { name: "v3_scores", desc: "아티스트별 최신 종합 점수", source: "Supabase" },
        { name: "v3_energy_snapshots", desc: "FES 이력 스냅샷", source: "Supabase" },
        { name: "v3_energy_baselines", desc: "FES 계산용 EMA 기준값", source: "Supabase" },
        { name: "wiki_entries.metadata", desc: "캐시된 원시 데이터", source: "Supabase JSONB" },
      ]} />
      <p className="text-[10px] text-muted-foreground text-center mt-6">최종 업데이트: 2026년 2월 · KTRENDZ v3 스코어링 엔진</p>
    </div>
  );

  if (isMobile) {
    return (
      <><Helmet><title>스코어링 엔진 - KTRENDZ</title></Helmet>
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center h-14 px-2 max-w-screen-lg mx-auto">
            <div className="flex items-center gap-1 w-20">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" asChild><Link to="/"><Home className="w-4 h-4" /></Link></Button>
            </div>
            <h1 className="flex-1 text-center text-sm font-bold text-foreground truncate">스코어링 엔진</h1>
            <div className="w-20" />
          </div>
        </header>
        <div className="pt-14"><PageContent /></div>
      </>
    );
  }

  return (
    <><Helmet><title>스코어링 엔진 - KTRENDZ</title></Helmet>
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <V3Sidebar activeTab="rankings" onTabChange={() => navigate('/')} />
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-[68px] border-b border-border/50 bg-background/60 backdrop-blur-xl sticky top-0 z-40 flex items-center px-4 gap-3">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" asChild><Link to="/"><Home className="w-4 h-4" /></Link></Button>
              <h1 className="flex-1 text-center font-bold text-lg text-foreground">스코어링 엔진</h1>
              <div className="w-20" />
            </header>
            <main className="flex-1 overflow-auto"><PageContent /></main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default FesEngine;
