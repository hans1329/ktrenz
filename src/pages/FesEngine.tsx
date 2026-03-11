import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import V3Sidebar from "@/components/v3/V3Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Home, Flame, Youtube, Zap, Music, TrendingUp, Activity, Gauge, Server, Headphones, Disc3, BarChart3, Users, Heart, Globe, MapPin } from "lucide-react";
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
          <div><h1 className="text-lg font-black text-foreground">KTRENDZ Scoring Engine</h1><p className="text-xs text-muted-foreground mt-0.5">FES v5.4 — How artist trend scores and fan energy are calculated</p></div>
        </div>
      </Card>

      {/* ── Data Pipeline ── */}
      <SectionHeader icon={Server} title="Data Pipeline & Collection Cycle" color="bg-slate-600" />
      <p className="text-xs text-muted-foreground">Every <strong>6 hours</strong> (00:05, 06:05, 12:05, 18:05 UTC), the pipeline runs in dependency order:</p>
      <FormulaCard title="Pipeline Execution Order" formula={`youtube → external_videos → music → hanteo
→ naver_news → buzz → social → fan_activity → energy
→ detect_geo_changes`} description="Each module runs as an independent Edge Function to avoid the 60s timeout. Dependencies are resolved by sequential ordering. Geographic change detection runs last to capture all fresh data from the current cycle." />
      <FormulaCard title="Daily Geo Trends Pipeline (04:00 UTC)" formula={`geo-trends-cron (1x/day):
  collect-geo-trends (SerpAPI) → detect-geo-changes`} description="Google Trends data updates daily, so a separate cron runs once per day to collect interest_by_region data and immediately detect regional spikes." />

      {/* ── Total Trend Score ── */}
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

      {/* ── YouTube Score ── */}
      <SectionHeader icon={Youtube} title="YouTube Score (v2 Delta Model)" color="bg-destructive" />
      <p className="text-xs text-muted-foreground">30% absolute magnitude (log scale) + 70% 24h delta. Cumulative metrics use <strong>delta-over-delta (acceleration)</strong>.</p>
      <FormulaCard title="Formula" formula={`YouTubeScore = baseScore × 0.30 + deltaScore × 0.70

baseScore  = log10(subscribers) × 50 + log10(totalViews) × 30
deltaScore = recentViewsDelta + likesDelta + totalViewDelta

recentViewsDelta = (current − prev24h) / 100K × 100
totalViewDelta   = incrementDeltaScore(current, prev24h, prev48h, scale=50)
                 → log10(increment) × scale × acceleration`}
        description="totalViewCount is cumulative, so acceleration = today's increment / yesterday's increment (0.3x~5.0x). deltaScore is clamped to max(baseScore × 5, 500) to prevent spikes." />
      <VarTable rows={[
        { name: "subscriberCount", desc: "Channel subscriber count", source: "YouTube Data API v3" },
        { name: "totalViewCount", desc: "Channel total view count (cumulative)", source: "YouTube Data API v3" },
        { name: "recentTotalViews", desc: "Sum of recent 10 video views", source: "YouTube Data API v3" },
        { name: "musicVideoViews", desc: "Total views of Music category (ID=10) videos", source: "YouTube Data API v3" },
        { name: "prev48hSnapshot", desc: "48h ago snapshot for acceleration calc", source: "ktrenz_data_snapshots" },
      ]} />

      {/* ── YouTube Music ── */}
      <SectionHeader icon={Headphones} title="YouTube Music (Topic Channel)" color="bg-rose-600" />
      <p className="text-xs text-muted-foreground">Official audio/streaming data from auto-generated <strong>"Artist - Topic"</strong> channels on YouTube.</p>
      <FormulaCard title="Data Collection" formula={`1. Initial: search "Artist - Topic" → save channel ID (100 units, once)
2. After:  playlistItems + channels API only (3 units/call)
3. ID stored in v3_artist_tiers.youtube_topic_channel_id`} description="Topic channel ID is auto-saved after first search, so subsequent calls skip the expensive search API." />
      <FormulaCard title="Contribution to Music Score" formula={`topicViewScore = log10(topicTotalViews + 1) × 10
topicSubScore  = log10(topicSubscribers + 1) × 8
mvViewScore    = log10(musicVideoViews + 1) × 12`} description="Topic channel views/subs and MV-specific views are weighted via log10 into the overall music_score." />

      {/* ── Buzz Score ── */}
      <SectionHeader icon={Zap} title="Buzz Score (Multi-Source)" color="bg-amber-500" />
      <p className="text-xs text-muted-foreground">Aggregated from 7 sources with weighted mentions. Firecrawl Search crawls X, Reddit, TikTok, News; YouTube comments and Naver News are collected separately.</p>
      <FormulaCard title="Formula" formula={`BuzzScore = mentionScore + sentimentBonus

mentionScore   = min(800, log10(totalWeightedMentions) × 200)
sentimentBonus = (sentimentScore − 50) × 4`} />
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">Source Weights (7 sources)</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`News:        2.0x  ← highest signal quality
X/Twitter:   1.5x  ← social buzz indicator
YouTube Comments: 1.5x  ← direct fan engagement
TikTok:      1.4x  ← viral momentum
Naver:       1.3x  ← Korean media coverage
Reddit:      1.2x  ← community discussion
Ext Videos:  1.2x  ← external channel appearances`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">Naver News collection runs before Buzz to ensure Korean media data is available for aggregation.</p>
      </Card>

      {/* ── Album Sales ── */}
      <SectionHeader icon={BarChart3} title="Album Sales Score" color="bg-emerald-600" />
      <p className="text-xs text-muted-foreground">Album/physical sales data sourced from <strong>Hanteo Chart API</strong>.</p>

      {/* ── Music Score ── */}
      <SectionHeader icon={Music} title="Music Score (v2 Delta-over-Delta)" color="bg-purple-600" />
      <FormulaCard title="Formula" formula={`MusicScore = baseScore × 0.30 + deltaScore × 0.70

baseScore = log10(playcount)×10 + log10(listeners)×8
          + log10(fans)×8 + log10(topicViews+1)×10
          + log10(topicSubs+1)×8 + log10(mvViews+1)×12

deltaScore = Σ incrementDeltaScore(metric, prev24h, prev48h, scale)
  └─ Last.fm playcount (scale=30)
  └─ Deezer fans (scale=20)
  └─ YT Music topicViews (scale=40)
  └─ MV views (scale=50)`}
        description="All cumulative metrics use delta-over-delta: today's increment vs yesterday's increment ratio (acceleration 0.3x~5.0x). deltaScore clamped to max(baseScore × 5, 500)." />

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">incrementDeltaScore Function</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`increment = current − prev24h
prevIncrement = prev24h − prev48h

score = log10(increment) × scale
acceleration = increment / prevIncrement  // 1.0=same, 5.0=5x↑
multiplier = clamp(acceleration, 0.3, 5.0)
finalScore = score × multiplier`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">Example: topicViews 4.5B→4.52B→4.6B → today +80M / yesterday +20M = <strong>4.0x acceleration</strong></p>
      </Card>

      <VarTable rows={[
        { name: "playcount", desc: "Last.fm total play count", source: "Last.fm API" },
        { name: "listeners", desc: "Last.fm unique listeners", source: "Last.fm API" },
        { name: "fans", desc: "Deezer fan count", source: "Deezer API" },
        { name: "topicTotalViews", desc: "YT Topic channel total views", source: "YouTube Data API v3" },
        { name: "topicSubscribers", desc: "YT Topic channel subscribers", source: "YouTube Data API v3" },
        { name: "musicVideoViews", desc: "MV category video views", source: "YouTube Data API v3" },
      ]} />

      {/* ── Social Score (NEW in v5.4) ── */}
      <SectionHeader icon={Users} title="Social Score (v5.4)" color="bg-pink-600" />
      <p className="text-xs text-muted-foreground">Cross-platform follower data scraped from <strong>kpop-radar.com</strong> (4 Firecrawl credits per run). Uses 30% base (log-scale) + 70% delta model.</p>
      <FormulaCard title="Formula" formula={`SocialScore = avg(platformScores)

platformScore = (baseScore × 0.3 + deltaScore × 0.7) × weight
  baseScore  = log10(followers) × 100
  deltaScore = max(growthRate × 1000, baseScore × 0.1)
  growthRate = (current − prev24h) / prev24h`} description="If no previous snapshot exists, deltaScore falls back to 10% of baseScore as minimum momentum." />
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">Platform Weights</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Spotify:   1.5x  ← streaming relevance
TikTok:    1.3x  ← viral reach
Instagram: 1.2x  ← visual engagement
Twitter/X: 1.0x  ← baseline`}</code>
      </Card>
      <VarTable rows={[
        { name: "instagram_followers", desc: "Instagram follower count", source: "kpop-radar.com" },
        { name: "tiktok_followers", desc: "TikTok follower count", source: "kpop-radar.com" },
        { name: "spotify_followers", desc: "Spotify follower count", source: "kpop-radar.com" },
        { name: "twitter_followers", desc: "X/Twitter follower count", source: "kpop-radar.com" },
      ]} />

      {/* ── Fan Activity Score ── */}
      <SectionHeader icon={Heart} title="Fan Activity Score" color="bg-blue-600" />
      <p className="text-xs text-muted-foreground">Internal platform user engagement aggregated over a rolling 24h window.</p>
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">Event Weights</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`External Link Click: 1.5x  ← highest intent signal
Agent Chat:          1.0x  ← active engagement
Artist Detail View:  0.5x  ← passive interest
Treemap Click:       0.3x  ← casual browse
List Click:          0.3x  ← casual browse`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">Events collected from ktrenz_user_events table. Fan score = Σ(event_weight) per artist over 24h.</p>
      </Card>

      {/* ── FES v5.4 ── */}
      <SectionHeader icon={Flame} title="Fan Energy Score (FES) v5.4" color="bg-red-600" />
      <p className="text-xs text-muted-foreground">6-category weighted energy with independent Velocity/Intensity per category. <Badge variant="outline" className="text-[9px] ml-1">Min 10 · Max 250</Badge></p>

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">v5.4 Architecture</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">6 Categories:</strong> YouTube 37% | Buzz 23% | Music 18% | Album 14% | Social 5% | Fan 3%</li>
          <li><strong className="text-foreground">Per-Category Velocity/Intensity:</strong> Each category independently scored, then weighted sum</li>
          <li><strong className="text-foreground">Energy = Velocity 60% + Intensity 40%:</strong> Growth momentum vs absolute standing</li>
          <li><strong className="text-foreground">Percentile Intensity:</strong> Rank among all tier-1 artists → 0~250 scale</li>
          <li><strong className="text-foreground">Sigmoid Velocity:</strong> 24h % change → sigmoid(x/100×3) → 20~250 scale</li>
          <li><strong className="text-foreground">Social (5%):</strong> kpop-radar.com follower data (Instagram, TikTok, Spotify, Twitter)</li>
          <li><strong className="text-foreground">Fan Activity (3%):</strong> Platform user events (link clicks 1.5x, chat 1.0x, views 0.5x) — reduced from 8% after Social introduction</li>
          <li><strong className="text-foreground">Rolling Window:</strong> Compares against closest valid snapshot before now-24h</li>
          <li><strong className="text-foreground">Zero Penalty:</strong> Categories with score 0 keep their weight but contribute energy 0, penalizing data gaps</li>
        </ul>
      </Card>

      <FormulaCard title="Core Formula (v5.4)" formula={`energy_score = Σ(category_energy × weight) / Σ(weights)

category_energy =
  velocity × 0.60 + intensity × 0.40  (when velocity available)
  intensity                             (when no 24h comparison)

velocity  = sigmoid(change_24h / 100 × 3) → 20~250
intensity = percentile_rank × 250 → 0~250
change_24h = (current − prev24h) / prev24h × 100

Weights: yt=0.37, buzz=0.23, music=0.18, album=0.14, social=0.05, fan=0.03`}
        description="Null changes (no valid 24h comparison) exclude that category from velocity but still include intensity. Zero-score categories contribute energy 0 with full weight." />

      <div className="grid grid-cols-6 gap-1.5">
        <Card className="p-2 bg-card border-border/50 text-center"><Youtube className="w-3.5 h-3.5 mx-auto text-destructive" /><p className="text-[10px] font-bold text-foreground mt-1">37%</p><p className="text-[8px] text-muted-foreground">YouTube</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Zap className="w-3.5 h-3.5 mx-auto text-amber-500" /><p className="text-[10px] font-bold text-foreground mt-1">23%</p><p className="text-[8px] text-muted-foreground">Buzz</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Music className="w-3.5 h-3.5 mx-auto text-purple-500" /><p className="text-[10px] font-bold text-foreground mt-1">18%</p><p className="text-[8px] text-muted-foreground">Music</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Disc3 className="w-3.5 h-3.5 mx-auto text-emerald-500" /><p className="text-[10px] font-bold text-foreground mt-1">14%</p><p className="text-[8px] text-muted-foreground">Album</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Users className="w-3.5 h-3.5 mx-auto text-pink-500" /><p className="text-[10px] font-bold text-foreground mt-1">5%</p><p className="text-[8px] text-muted-foreground">Social</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Heart className="w-3.5 h-3.5 mx-auto text-blue-500" /><p className="text-[10px] font-bold text-foreground mt-1">3%</p><p className="text-[8px] text-muted-foreground">Fan</p></Card>
      </div>

      <FormulaCard title="energy_change_24h (Rolling Window)" formula={`overallChange = Σ(change_i × weight_i) / Σ(weight_i)
  (only categories with valid 24h comparison included)

Comparison target: most recent valid snapshot before now − 24h`}
        description="Like crypto exchange leaderboards — continuous 24h rolling change without resets." />

      <FormulaCard title="EMA Baseline Update" formula={`avg_7d  = avg_7d  × (1 − 0.15) + current × 0.15
avg_30d = avg_30d × (1 − 0.05) + current × 0.05`} description="Baselines managed via EMA for long-term trend tracking in energy snapshots." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💤</span><p className="text-xs font-bold text-foreground mt-1">&lt; 80</p><p className="text-[10px] text-muted-foreground">Low</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💫</span><p className="text-xs font-bold text-foreground mt-1">80–150</p><p className="text-[10px] text-muted-foreground">Normal</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">⚡</span><p className="text-xs font-bold text-foreground mt-1">150–200</p><p className="text-[10px] text-muted-foreground">Active</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">🔥</span><p className="text-xs font-bold text-foreground mt-1">200+</p><p className="text-[10px] text-muted-foreground">Explosive</p></Card>
      </div>

      {/* ── Geographic Detection Engine ── */}
      <SectionHeader icon={Globe} title="Geographic Detection Engine" color="bg-teal-600" />
      <p className="text-xs text-muted-foreground">Identifies <strong>where fan reactions are heating up</strong> by tracking regional signals across 4 independent sources with change-rate detection.</p>

      <Card className="p-3 bg-teal-500/5 border-teal-500/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">Architecture</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">Source-Specific Tracking:</strong> Each source tracked independently — no unified score, agencies see per-source signals</li>
          <li><strong className="text-foreground">Change Detection:</strong> 24h rolling window comparison, ±30% threshold → flagged as <code className="text-primary">surge</code> or <code className="text-primary">drop</code></li>
          <li><strong className="text-foreground">Dual Trigger:</strong> Runs after every 6h pipeline (YouTube Comments + Last.fm) AND after daily geo-trends-cron (Google Trends)</li>
          <li><strong className="text-foreground">Disappearance Detection:</strong> Countries present in previous window but absent in current → automatically flagged as -100% drop</li>
        </ul>
      </Card>

      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">4 Data Sources</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Google Trends (SerpAPI)  — Search interest 0-100 by country
  └ Schedule: 1x/day via geo-trends-cron
  └ Data: interest_by_region (GEO_MAP_0)

Last.fm                 — Listener count by country
  └ Schedule: Every 6h (collect-geo-fans)
  └ Data: top listeners by country ranking

YouTube Comments        — Language detection → country mapping
  └ Schedule: Every 6h (ktrenz-yt-sentiment)
  └ Data: Unicode range analysis (KR/JP/TH/ID/VN/...)
  └ Cost: Zero additional API calls

Deezer                  — Fan count by country
  └ Schedule: Every 6h (collect-geo-deezer)
  └ Data: Geographic fan distribution`}</code>
      </Card>

      <FormulaCard title="Change Detection Logic" formula={`changeRate = (currentValue − previousValue) / previousValue × 100

isSpike = |changeRate| ≥ 30%  (SPIKE_THRESHOLD)
spikeDirection = changeRate > 0 ? "surge" : "drop"

Window: current (now − 24h ~ now) vs previous (now − 48h ~ now − 24h)
Each source × country pair compared independently`} description="Signals stored in ktrenz_geo_change_signals table with full history for trend analysis." />

      <VarTable rows={[
        { name: "ktrenz_geo_fan_data", desc: "Raw geographic data per source × country × artist", source: "Supabase" },
        { name: "ktrenz_geo_change_signals", desc: "Change rate signals with spike flags", source: "Supabase" },
        { name: "interest_score", desc: "Google Trends interest value (0-100)", source: "SerpAPI" },
        { name: "listeners", desc: "Last.fm listener count per country", source: "Last.fm API" },
        { name: "country_code", desc: "ISO country code (2-letter)", source: "All sources" },
      ]} />

      {/* ── API & Data Sources ── */}
      <SectionHeader icon={Server} title="API & Data Sources" color="bg-slate-600" />
      <div className="space-y-2">
        <ApiCard method="POST" endpoint="data-engine" description="Orchestrates the full pipeline. Triggers each module sequentially via fire-and-forget chaining. Includes detect_geo_changes as final step." params={["module: 'all' | module name", "wikiEntryId?", "triggerSource?"]} />
        <ApiCard method="POST" endpoint="ktrenz-data-collector" description="Collects YouTube + Music + Hanteo + Buzz data per source." params={["source: 'youtube' | 'music' | 'hanteo' | 'buzz'", "wikiEntryId?"]} />
        <ApiCard method="POST" endpoint="collect-social-followers" description="Scrapes kpop-radar.com for Instagram/TikTok/Spotify/Twitter follower data. ~4 Firecrawl credits." params={["— (all tier-1 artists)"]} />
        <ApiCard method="POST" endpoint="calculate-energy-score" description="Calculates FES v5.4 using percentile + sigmoid model across 6 categories." params={["isBaseline?"]} />
        <ApiCard method="POST" endpoint="query-artist-energy" description="Realtime per-artist energy query endpoint (user-facing)." params={["wiki_entry_id", "sources?"]} />
        <ApiCard method="POST" endpoint="crawl-naver-news" description="Collects Naver news articles for Korean media coverage." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="geo-trends-cron" description="Daily orchestrator: collect-geo-trends → detect-geo-changes. Chains Google Trends collection with spike detection." params={["wiki_entry_id?"]} />
        <ApiCard method="POST" endpoint="collect-geo-trends" description="Fetches Google Trends interest_by_region data via SerpAPI for all tier 1-3 artists." params={["wiki_entry_id?"]} />
        <ApiCard method="POST" endpoint="detect-geo-changes" description="Compares 24h windows to detect ±30% regional spikes across all geo sources." params={["wiki_entry_id?"]} />
      </div>

      <VarTable rows={[
        { name: "v3_scores_v2", desc: "Latest total score + FES + social/fan scores per artist", source: "Supabase" },
        { name: "v3_energy_snapshots_v2", desc: "FES history (velocity, intensity per category, social, fan)", source: "Supabase" },
        { name: "v3_energy_baselines_v2", desc: "EMA baselines for FES calculation", source: "Supabase" },
        { name: "ktrenz_data_snapshots", desc: "Raw platform collection data (all sources)", source: "Supabase" },
        { name: "ktrenz_user_events", desc: "User activity events for fan score", source: "Supabase" },
        { name: "ktrenz_geo_fan_data", desc: "Geographic fan data per source × country", source: "Supabase" },
        { name: "ktrenz_geo_change_signals", desc: "Regional change signals with spike detection", source: "Supabase" },
        { name: "wiki_entries.metadata", desc: "Cached raw data (YouTube/Buzz/Music)", source: "Supabase JSONB" },
      ]} />

      {/* ── Energy Map ── */}
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

      <p className="text-[10px] text-muted-foreground text-center mt-6">Last updated: Mar 11, 2026 · KTRENDZ FES Engine v5.4 (6-Category Weighted Energy)</p>
    </div>
  );

  if (isMobile) {
    return (
      <><SEO title="FES Scoring Engine – KTrenZ" description="How KTrenZ calculates K-Pop energy scores using YouTube, Buzz, Music, Album, Social followers, and fan activity data." path="/fes-engine" />
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
    <><SEO title="FES Scoring Engine – KTrenZ" description="How KTrenZ calculates K-Pop energy scores using YouTube, Buzz, Music, Album, Social followers, and fan activity data." path="/fes-engine" />
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
