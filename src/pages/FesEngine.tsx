import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import V3Sidebar from "@/components/v3/V3Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Home, Flame, Youtube, Zap, Music, TrendingUp, Activity, Gauge, Server, Headphones, Disc3, BarChart3 } from "lucide-react";
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
      <thead><tr className="bg-muted/50"><th className="text-left p-2 font-semibold text-foreground">Variable</th><th className="text-left p-2 font-semibold text-foreground">Description</th><th className="text-left p-2 font-semibold text-foreground">Source</th></tr></thead>
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
          <div><h1 className="text-lg font-black text-foreground">KTRENDZ Scoring Engine</h1><p className="text-xs text-muted-foreground mt-0.5">How artist trend scores and fan energy are calculated</p></div>
        </div>
      </Card>

      <SectionHeader icon={TrendingUp} title="Total Trend Score" color="bg-primary" />
      <p className="text-xs text-muted-foreground">The main ranking score. Each sub-score is <strong>normalized to 0–100</strong> then weighted (max 10,000).</p>
      <FormulaCard title="Normalized Weighted Sum" formula={`TotalTrendScore =
  min(ytScore / 310, 100) × 30   ← YouTube 30%
+ min(buzzScore / 15, 100) × 25  ← Buzz 25%
+ min(albumScore / 40, 100) × 25 ← Album Sales 25%
+ min(musicScore / 2, 100) × 20  ← Music 20%`} description="Each component is capped at 100 after dividing by its normalization constant. The final score is a GENERATED column in DB, auto-recalculated on any sub-score update." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2.5 bg-card border-border/50 text-center"><Youtube className="w-4 h-4 mx-auto text-destructive" /><p className="text-xs font-bold text-foreground mt-1">30%</p><p className="text-[9px] text-muted-foreground">YouTube</p></Card>
        <Card className="p-2.5 bg-card border-border/50 text-center"><Zap className="w-4 h-4 mx-auto text-amber-500" /><p className="text-xs font-bold text-foreground mt-1">25%</p><p className="text-[9px] text-muted-foreground">Buzz</p></Card>
        <Card className="p-2.5 bg-card border-border/50 text-center"><BarChart3 className="w-4 h-4 mx-auto text-emerald-500" /><p className="text-xs font-bold text-foreground mt-1">25%</p><p className="text-[9px] text-muted-foreground">Album Sales</p></Card>
        <Card className="p-2.5 bg-card border-border/50 text-center"><Music className="w-4 h-4 mx-auto text-purple-500" /><p className="text-xs font-bold text-foreground mt-1">20%</p><p className="text-[9px] text-muted-foreground">Music</p></Card>
      </div>

      <SectionHeader icon={Youtube} title="YouTube Score" color="bg-destructive" />
      <FormulaCard title="Formula" formula={`YouTubeScore = subScore + totalViewScore + recentViewScore + recentEngagement + volumeScore\n\nsubScore       = subscribers / 1,000,000 × 100\ntotalViewScore = totalViews / 100,000,000 × 50\nrecentViewScore= avgRecentViews / 1,000,000 × 30\nrecentEngagement = (likes + comments) / 100,000 × 20\nvolumeScore    = min(50, totalVideos / 100 × 10)`} />
      <VarTable rows={[
        { name: "subscriberCount", desc: "Channel subscriber count", source: "YouTube Data API v3" },
        { name: "totalViewCount", desc: "Channel total view count", source: "YouTube Data API v3" },
        { name: "avgRecentViews", desc: "Average views of recent videos", source: "YouTube Data API v3" },
        { name: "musicVideoViews", desc: "Total views of Music category (ID=10) videos", source: "YouTube Data API v3" },
        { name: "musicVideoCount", desc: "Number of Music category videos", source: "YouTube Data API v3" },
      ]} />

      <SectionHeader icon={Headphones} title="YouTube Music (Topic Channel)" color="bg-rose-600" />
      <p className="text-xs text-muted-foreground">Official audio/streaming data from auto-generated <strong>"Artist - Topic"</strong> channels on YouTube.</p>
      <FormulaCard title="Data Collection" formula={`1. Initial: search "Artist - Topic" → save channel ID (100 units, once)
2. After:  playlistItems + channels API only (3 units/call)
3. ID stored in v3_artist_tiers.youtube_topic_channel_id`} description="Topic channel ID is auto-saved after first search, so subsequent calls skip the expensive search API." />
      <FormulaCard title="Contribution to Music Score" formula={`topicViewScore = log10(topicTotalViews + 1) × 10
topicSubScore  = log10(topicSubscribers + 1) × 8
mvViewScore    = log10(musicVideoViews + 1) × 12`} description="Topic channel views/subs and MV-specific views are weighted via log10 into the overall music_score." />
      <VarTable rows={[
        { name: "topicTotalViews", desc: "Topic channel total views (streaming count)", source: "YouTube Data API v3" },
        { name: "topicSubscribers", desc: "Topic channel subscriber count", source: "YouTube Data API v3" },
        { name: "topMusicTracks", desc: "Recent audio tracks (up to 5)", source: "YouTube Data API v3" },
      ]} />

      <SectionHeader icon={Zap} title="X (Twitter) Buzz Score" color="bg-amber-500" />
      <FormulaCard title="Formula" formula={`BuzzScore = mentionScore + sentimentBonus\n\nmentionScore   = min(800, log10(mentionCount) × 200)\nsentimentBonus = (sentimentScore − 50) × 4`} />
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">Source Weights</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`News: 2.0 | X/Twitter: 1.5 | TikTok: 1.4
Naver: 1.3 | Reddit: 1.2 | YouTube: 1.0`}</code>
      </Card>

      <SectionHeader icon={BarChart3} title="Album Sales Score" color="bg-emerald-600" />
      <p className="text-xs text-muted-foreground">Album/physical sales data sourced from <strong>Hanteo Chart</strong>.</p>

      <SectionHeader icon={Music} title="Music Score" color="bg-purple-600" />
      <FormulaCard title="Formula" formula={`MusicScore = lastfmListeners + lastfmPlays + deezerFans
           + mbAlbums + mbSingles
           + topicViewScore + topicSubScore + mvViewScore`} description="Combines Last.fm, Deezer, MusicBrainz data with YouTube Music Topic channel and MV category metrics." />

      <SectionHeader icon={Flame} title="Fan Energy Score (FES) v4" color="bg-red-600" />
      <p className="text-xs text-muted-foreground">Measures an artist's <strong>current momentum</strong> — how much they changed vs yesterday. <Badge variant="outline" className="text-[9px] ml-1">Min 10 · Max 250</Badge></p>

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">v4 Key Changes</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">Momentum-Driven:</strong> 24h 변동률(momentum)이 점수의 70%를 결정 — 변동이 클수록 높은 점수</li>
          <li><strong className="text-foreground">Percentile Ranking:</strong> 모든 지표를 절대값 대신 아티스트 간 상대 순위(percentile)로 변환</li>
          <li><strong className="text-foreground">Absolute Baseline (30%):</strong> 언급량, 조회수, 버즈 등 원시 지표의 순위 기반 점수</li>
          <li><strong className="text-foreground">Momentum (70%):</strong> 어제 energy_score 대비 오늘 absolute_score의 변동률 순위</li>
          <li><strong className="text-foreground">Neutral Fallback:</strong> 어제 스냅샷이 없는 아티스트는 중앙값(median) momentum 할당</li>
        </ul>
      </Card>

      <FormulaCard title="Core Formula (v4)" formula={`FES = absolute_score × 0.30 + momentum_percentile × 0.70

absolute_score = velocity × 0.50 + intensity × 0.50
velocity       = mentionRank_pct × 0.60 + viewRank_pct × 0.40
intensity      = buzzScoreRank_pct × 0.50 + qualityMentionRank_pct × 0.50

momentum = (absolute_score − yesterday_energy) / yesterday_energy × 100
momentum_percentile = percentileScore(momentum_rank, total_artists)`} description="어제 대비 변동률이 높을수록 momentum_percentile이 높아지고, 최종 FES의 70%를 차지합니다." />

      <Card className="p-3 bg-card border-border/50 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3.5 h-3.5 text-amber-500" /><span className="text-xs font-bold text-foreground">Absolute Score (30%)</span></div>
          <p className="text-[10px] text-muted-foreground mb-1.5">현재 시점의 원시 지표 순위 기반. 모든 아티스트를 percentile 랭킹으로 비교.</p>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`percentileScore(rank, total) = 20 + (1 - (rank-1)/(total-1)) × 230

velocity  = pctScore(mentionRank) × 0.6 + pctScore(viewRank) × 0.4
intensity = pctScore(buzzRank) × 0.5 + pctScore(qualityMentionRank) × 0.5
absolute  = velocity × 0.5 + intensity × 0.5`}</code>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Activity className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-bold text-foreground">Momentum Percentile (70%)</span></div>
          <p className="text-[10px] text-muted-foreground mb-1.5">어제 에너지 스냅샷 대비 오늘 absolute_score의 변동률을 순위화</p>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`momentum = (absScore - prevDayEnergy) / prevDayEnergy × 100
momentumRank = rank among all artists by momentum (desc)
momentumPctScore = percentileScore(momentumRank, total)

// No previous snapshot → assign median momentum`}</code>
        </div>
      </Card>

      <FormulaCard title="energy_change_24h" formula={`change_24h = momentum
         = (absolute_score − yesterday_energy) / yesterday_energy × 100`} description="모멘텀 계산에 사용된 동일한 변동률을 그대로 저장. UI의 ▲/▼ 퍼센트와 FES 순위가 항상 일관됩니다." />

      <FormulaCard title="EMA Baseline Update (unchanged)" formula={`avg_7d  = avg_7d  × (1 − 0.15) + current × 0.15
avg_30d = avg_30d × (1 − 0.05) + current × 0.05`} description="베이스라인은 여전히 EMA로 관리되며, 에너지 스냅샷의 장기 추세 추적에 사용됩니다." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💤</span><p className="text-xs font-bold text-foreground mt-1">&lt; 80</p><p className="text-[10px] text-muted-foreground">Low</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💫</span><p className="text-xs font-bold text-foreground mt-1">80–150</p><p className="text-[10px] text-muted-foreground">Normal</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">⚡</span><p className="text-xs font-bold text-foreground mt-1">150–200</p><p className="text-[10px] text-muted-foreground">Active</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">🔥</span><p className="text-xs font-bold text-foreground mt-1">200+</p><p className="text-[10px] text-muted-foreground">Explosive</p></Card>
      </div>

      <VarTable rows={[
        { name: "totalMentions", desc: "Buzz mentions in last collection", source: "ktrenz_data_snapshots" },
        { name: "buzzScore", desc: "Weighted buzz score", source: "ktrenz_data_snapshots" },
        { name: "recentTotalViews", desc: "Recent video total views", source: "ktrenz_data_snapshots" },
        { name: "qualityMentions", desc: "mentions × sentimentMultiplier", source: "Calculated" },
        { name: "prevDayEnergy", desc: "Yesterday's latest energy_score snapshot", source: "v3_energy_snapshots_v2" },
        { name: "avg_energy_7d", desc: "Energy EMA (α=0.15)", source: "v3_energy_baselines_v2" },
        { name: "avg_energy_30d", desc: "Energy EMA (α=0.05)", source: "v3_energy_baselines_v2" },
      ]} />

      <SectionHeader icon={Server} title="API & Data Sources" color="bg-slate-600" />
      <div className="space-y-2">
        <ApiCard method="POST" endpoint="ktrenz-data-collector" description="Batch-collects YouTube + X/Buzz + Music data and stores in ktrenz_data_snapshots." params={["— (all artists)"]} />
        <ApiCard method="POST" endpoint="calculate-energy-score" description="Calculates FES using ktrenz_data_snapshots data vs EMA baselines." params={["wikiEntryId?", "batchSize?", "batchOffset?", "resetBaselines?"]} />
        <ApiCard method="POST" endpoint="ktrenz-data-collector" description="Fetches YouTube channel stats + recent video data. Use source='youtube'." params={["source: 'youtube'", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="crawl-x-mentions" description="Searches X/web mentions and calculates buzz + sentiment." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="ktrenz-data-collector" description="Collects Last.fm, Deezer data. Use source='music'." params={["source: 'music'", "wikiEntryId"]} />
      </div>

      <VarTable rows={[
        { name: "v3_scores_v2", desc: "Latest total score + FES per artist", source: "Supabase" },
        { name: "v3_energy_snapshots_v2", desc: "FES history snapshots (velocity, intensity, energy)", source: "Supabase" },
        { name: "v3_energy_baselines_v2", desc: "EMA baselines for FES calculation", source: "Supabase" },
        { name: "ktrenz_data_snapshots", desc: "Raw platform collection data", source: "Supabase" },
        { name: "wiki_entries.metadata", desc: "Cached raw data (YouTube/Buzz/Music)", source: "Supabase JSONB" },
      ]} />

      <SectionHeader icon={Activity} title="Energy Map (Treemap) Structure" color="bg-emerald-600" />
      <p className="text-xs text-muted-foreground">The home screen <strong>⚡ Energy Map</strong> visualizes the top 10 FES artists as a treemap.</p>

      <Card className="p-3 bg-card border-border/50 space-y-3">
        <div>
          <span className="text-xs font-bold text-foreground">📐 Tile Area = Fan Energy Score</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Higher FES = larger area. Uses Squarify algorithm to generate near-square tiles for maximum readability.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">🎨 Tile Color = 24h Energy Change Rate</span>
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(0,85%,50%,0.9)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">Red</strong> — Rising (Δ ≥ +5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(160,50%,40%,0.75)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">Mint</strong> — Stable (Δ -5% ~ +5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(220,55%,35%,0.7)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">Blue</strong> — Declining (Δ ≤ -5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm border border-destructive/50 animate-pulse" style={{background:"hsla(0,85%,50%,0.9)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">Neon SURGE</strong> — Extreme surge (Δ ≥ +25%) glow + ripple animation</span></div>
          </div>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">✨ Particle Effects</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Dynamic white particles applied to each tile. Particle speed scales with energy change rate, density with energy share.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">📈 In-Tile Sparklines</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Medium+ tiles show recent score history as mini line charts for intuitive momentum direction.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">🏷️ Trend Label Classification</span>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 mt-1 whitespace-pre-wrap">{`🔥 SURGE  — Δ ≥ 30% or acceleration ≥ 40%\n↑ Rising  — Δ ≥ 10%\n→ Stable  — Δ > -5%\n↘ Cooling — Δ > -15%\n↓ Falling — Δ ≤ -15%`}</code>
        </div>
      </Card>

      <FormulaCard title="Squarify Algorithm Summary" formula={`1. Sum total energy → calculate area ratio per artist\n2. Place rows minimizing Worst Aspect Ratio\n3. Split along longer axis repeatedly\n4. Result: near-square tile layout → readability ↑`} description="Reference: finviz.com/map, kaito.ai style heatmap layout" />

      <p className="text-[10px] text-muted-foreground text-center mt-6">Last updated: Feb 26, 2026 · KTRENDZ FES Engine v4</p>
    </div>
  );

  if (isMobile) {
    return (
      <><SEO title="FES Scoring Engine – KTrenZ" description="How KTrenZ calculates K-Pop energy scores using YouTube views, X buzz mentions, music chart data, and damped EMA baselines." path="/fes-engine" />
        <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center h-14 px-2 max-w-screen-lg mx-auto">
            <div className="flex items-center gap-1 w-20">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" asChild><Link to="/"><Home className="w-4 h-4" /></Link></Button>
            </div>
            <h1 className="flex-1 text-center text-sm font-bold text-foreground truncate">Scoring Engine</h1>
            <div className="w-20" />
          </div>
        </header>
        <div className="pt-14"><PageContent /></div>
      </>
    );
  }

  return (
    <><SEO title="FES Scoring Engine – KTrenZ" description="How KTrenZ calculates K-Pop energy scores using YouTube views, X buzz mentions, music chart data, and damped EMA baselines." path="/fes-engine" />
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <V3Sidebar activeTab="rankings" onTabChange={() => navigate('/')} />
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-[68px] border-b border-border/50 bg-background/60 backdrop-blur-xl sticky top-0 z-40 flex items-center px-4 gap-3">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
              <h1 className="text-lg font-bold text-foreground">Scoring Engine</h1>
            </header>
            <main className="flex-1 overflow-auto"><PageContent /></main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default FesEngine;
