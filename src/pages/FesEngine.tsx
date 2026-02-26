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

      <SectionHeader icon={Flame} title="Fan Energy Score (FES) v2" color="bg-red-600" />
      <p className="text-xs text-muted-foreground">Measures an artist's <strong>current momentum</strong> relative to historical baselines. <Badge variant="outline" className="text-[9px] ml-1">Baseline 100 · Max 250</Badge></p>

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">v2 Key Changes</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">Data Source:</strong> Reads raw YouTube/Buzz data directly from <code className="text-primary">ktrenz_data_snapshots</code> table</li>
          <li><strong className="text-foreground">Damped Scoring:</strong> ratio ≤ 1 → linear (ratio × 100), ratio &gt; 1 → log₂ decay — prevents spikes</li>
          <li><strong className="text-foreground">EMA Baselines:</strong> α=0.15 (7-day), α=0.05 (30-day) exponential moving averages gradually update baselines</li>
          <li><strong className="text-foreground">Cap:</strong> Individual component max 250, final FES max 500 (250×2)</li>
        </ul>
      </Card>

      <FormulaCard title="Core Formula" formula="FES = Velocity × 0.40 + Intensity × 0.60" description="Baseline 100 = normal state. Above 100 means more active than average." />

      <Card className="p-3 bg-card border-border/50 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3.5 h-3.5 text-amber-500" /><span className="text-xs font-bold text-foreground">Velocity (40%)</span></div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Mention growth rate (60%) + View growth rate (40%)</p>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Velocity = buzzVelocity × 0.60 + ytVelocity × 0.40

buzzVelocity = damped(mentions / avg_mentions_7d)
ytVelocity   = damped(recentViews / avg_views_30d)`}</code>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1"><Activity className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-bold text-foreground">Intensity (60%)</span></div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Buzz score intensity (50%) + Sentiment-weighted mentions (50%)</p>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Intensity = engIntensity × 0.50 + buzzIntensity × 0.50

engIntensity  = damped(buzz_score / avg_buzz_7d)
buzzIntensity = damped(qualityMentions / avg_mentions_30d)

qualityMentions = mentions × sentimentMultiplier
sentimentMultiplier = 0.7 + (sentimentScore / 100) × 0.6`}</code>
        </div>
      </Card>

      <FormulaCard title="Damped Score Function" formula={`damped(ratio):
  ratio ≤ 0  → 0
  ratio ≤ 1  → ratio × 100  (linear)
  ratio > 1  → 100 + log₂(ratio) × 60  (log decay)
  Max 250`} description="When ratio exceeds 1 (= average), score increase is suppressed on a log scale to prevent excessive spikes from single events." />

      <FormulaCard title="EMA Baseline Update" formula={`avg_7d  = avg_7d  × (1 − 0.15) + current × 0.15
avg_30d = avg_30d × (1 − 0.05) + current × 0.05`} description="Each calculation reflects current values into exponential moving averages, gradually adjusting baselines. Rapidly changing trends are naturally absorbed." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💤</span><p className="text-xs font-bold text-foreground mt-1">&lt; 100</p><p className="text-[10px] text-muted-foreground">Low</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💫</span><p className="text-xs font-bold text-foreground mt-1">100+</p><p className="text-[10px] text-muted-foreground">Normal</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">⚡</span><p className="text-xs font-bold text-foreground mt-1">150+</p><p className="text-[10px] text-muted-foreground">Active</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">🔥</span><p className="text-xs font-bold text-foreground mt-1">300+</p><p className="text-[10px] text-muted-foreground">Explosive</p></Card>
      </div>

      <VarTable rows={[
        { name: "avg_velocity_7d", desc: "Mention count EMA (α=0.15)", source: "v3_energy_baselines_v2" },
        { name: "avg_velocity_30d", desc: "View count EMA (α=0.05)", source: "v3_energy_baselines_v2" },
        { name: "avg_intensity_7d", desc: "Buzz score EMA (α=0.15)", source: "v3_energy_baselines_v2" },
        { name: "avg_intensity_30d", desc: "Sentiment-weighted mention EMA (α=0.05)", source: "v3_energy_baselines_v2" },
        { name: "total_mentions", desc: "Mentions in last 6 hours", source: "ktrenz_data_snapshots" },
        { name: "buzz_score", desc: "Weighted buzz score", source: "ktrenz_data_snapshots" },
        { name: "sentiment_score", desc: "Sentiment score (0–100)", source: "ktrenz_data_snapshots" },
        { name: "recentTotalViews", desc: "Recent video total views", source: "ktrenz_data_snapshots" },
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

      <p className="text-[10px] text-muted-foreground text-center mt-6">Last updated: Feb 26, 2026 · KTRENDZ FES Engine v2</p>
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
