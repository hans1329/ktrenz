import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider } from "@/components/ui/sidebar";
import V3Sidebar from "@/components/v3/V3Sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Home, Flame, Youtube, Zap, Music, TrendingUp, Activity, Gauge, Server, Headphones, Disc3, BarChart3, Users, Heart, Globe, MapPin, Brain, FlaskConical, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const SectionHeader = ({ icon: Icon, title, color }: { icon: any; title: string; color: string }) => (
  <div className="flex items-center gap-2 mt-6 mb-3">
    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}><Icon className="w-4.5 h-4.5 text-white" /></div>
    <h2 className="text-lg font-black text-foreground">{title}</h2>
  </div>
);

const FormulaCard = ({ title, formula, description }: { title: string; formula: string; description?: string }) => (
  <Card className="p-4 bg-card border-border/50">
    <p className="text-sm text-muted-foreground font-medium mb-1.5">{title}</p>
    <code className="block text-sm font-mono font-bold text-primary bg-primary/5 rounded px-2.5 py-2 whitespace-pre-wrap">{formula}</code>
    {description && <p className="text-xs text-muted-foreground mt-2">{description}</p>}
  </Card>
);

const VarTable = ({ rows }: { rows: { name: string; desc: string; source: string }[] }) => (
  <div className="rounded-lg border border-border overflow-hidden">
    <table className="w-full text-sm">
      <thead><tr className="bg-muted/50"><th className="text-left p-2.5 font-semibold text-foreground">변수</th><th className="text-left p-2.5 font-semibold text-foreground">설명</th><th className="text-left p-2.5 font-semibold text-foreground">소스</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (<tr key={i} className="border-t border-border"><td className="p-2.5 font-mono text-primary text-sm">{r.name}</td><td className="p-2.5 text-muted-foreground">{r.desc}</td><td className="p-2.5"><Badge variant="outline" className="text-xs">{r.source}</Badge></td></tr>))}
      </tbody>
    </table>
  </div>
);

const ApiCard = ({ method, endpoint, description, params }: { method: string; endpoint: string; description: string; params?: string[] }) => (
  <Card className="p-4 bg-card border-border/50">
    <div className="flex items-center gap-2 mb-1.5"><Badge className="text-xs bg-primary/20 text-primary border-0 rounded">{method}</Badge><code className="text-sm font-mono font-bold text-foreground">{endpoint}</code></div>
    <p className="text-xs text-muted-foreground">{description}</p>
    {params && params.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{params.map((p, i) => <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>)}</div>}
  </Card>
);

const FesEngine = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => { document.documentElement.classList.add("v3-theme"); return () => { document.documentElement.classList.remove("v3-theme"); }; }, []);

  const PageContent = () => (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 space-y-4">
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center"><Gauge className="w-7 h-7 text-primary" /></div>
          <div><h1 className="text-xl font-black text-foreground">KTRENDZ 스코어링 엔진</h1><p className="text-sm text-muted-foreground mt-0.5">FES v5.4 — 아티스트 트렌드 점수 및 팬 에너지 산출 방식</p></div>
        </div>
      </Card>

      {/* ── 데이터 파이프라인 ── */}
      <SectionHeader icon={Server} title="데이터 파이프라인 & 수집 주기" color="bg-slate-600" />
      <p className="text-sm text-muted-foreground"><strong>6시간</strong> 주기 (00:05, 06:05, 12:05, 18:05 UTC)로 의존성 순서에 따라 실행됩니다:</p>
      <FormulaCard title="파이프라인 실행 순서" formula={`youtube → external_videos → music → hanteo
→ apple_music_charts → billboard_charts
→ naver_news → buzz → social → fan_activity
→ energy → detect_geo_changes
→ fes_analyst → fes_predictor`} description="각 모듈은 독립 Edge Function으로 실행되어 60초 타임아웃을 회피합니다. 의존성은 순차 실행으로 해소됩니다. 마지막 단계에서 정규화 분석 및 AI 예측이 자동 실행됩니다." />
      <FormulaCard title="일일 글로벌 트렌드 파이프라인 (04:00 UTC)" formula={`geo-trends-cron (1회/일):
  collect-geo-trends (SerpAPI) → detect-geo-changes`} description="Google Trends 데이터는 일일 갱신이므로 별도 크론이 실행되어 interest_by_region 데이터를 수집하고 즉시 지역 급증을 감지합니다." />

      {/* ── 토탈 트렌드 스코어 ── */}
      <SectionHeader icon={TrendingUp} title="토탈 트렌드 스코어" color="bg-primary" />
      <p className="text-sm text-muted-foreground">메인 랭킹 점수입니다. 각 하위 점수는 <strong>0–100으로 정규화</strong>된 후 가중 합산됩니다 (최대 10,000).</p>
      <FormulaCard title="정규화 가중 합산" formula={`TotalTrendScore =
  min(ytScore / 310, 100) × 30   ← YouTube 30%
+ min(buzzScore / 15, 100) × 25  ← Buzz 25%
+ min(albumScore / 40, 100) × 25 ← Album Sales 25%
+ min(musicScore / 2, 100) × 20  ← Music 20%`} description="각 구성 요소는 정규화 상수로 나눈 후 100으로 제한됩니다. 최종 점수는 DB의 GENERATED 컬럼으로, 하위 점수 업데이트 시 자동 재계산됩니다." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><Youtube className="w-5 h-5 mx-auto text-destructive" /><p className="text-sm font-bold text-foreground mt-1">30%</p><p className="text-xs text-muted-foreground">YouTube</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><Zap className="w-5 h-5 mx-auto text-amber-500" /><p className="text-sm font-bold text-foreground mt-1">25%</p><p className="text-xs text-muted-foreground">Buzz</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><BarChart3 className="w-5 h-5 mx-auto text-emerald-500" /><p className="text-sm font-bold text-foreground mt-1">25%</p><p className="text-xs text-muted-foreground">Album Sales</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><Music className="w-5 h-5 mx-auto text-purple-500" /><p className="text-sm font-bold text-foreground mt-1">20%</p><p className="text-xs text-muted-foreground">Music</p></Card>
      </div>

      {/* ── YouTube 스코어 ── */}
      <SectionHeader icon={Youtube} title="YouTube 스코어 (v2 델타 모델)" color="bg-destructive" />
      <p className="text-sm text-muted-foreground">30% 절대 규모 (로그 스케일) + 70% 24시간 델타. 누적 지표는 <strong>델타-오버-델타 (가속도)</strong>를 사용합니다.</p>
      <FormulaCard title="공식" formula={`YouTubeScore = baseScore × 0.30 + deltaScore × 0.70

baseScore  = log10(subscribers) × 50 + log10(totalViews) × 30
deltaScore = recentViewsDelta + likesDelta + totalViewDelta

recentViewsDelta = (현재 − 24시간전) / 100K × 100
totalViewDelta   = incrementDeltaScore(현재, 24시간전, 48시간전, scale=50)
                 → log10(증분) × scale × 가속도`}
        description="totalViewCount는 누적이므로 가속도 = 오늘 증분 / 어제 증분 (0.3x~5.0x). deltaScore는 max(baseScore × 5, 500)으로 제한하여 스파이크를 방지합니다." />
      <VarTable rows={[
        { name: "subscriberCount", desc: "채널 구독자 수", source: "YouTube Data API v3" },
        { name: "totalViewCount", desc: "채널 총 조회수 (누적)", source: "YouTube Data API v3" },
        { name: "recentTotalViews", desc: "최근 10개 영상 조회수 합계", source: "YouTube Data API v3" },
        { name: "musicVideoViews", desc: "Music 카테고리(ID=10) 영상 총 조회수", source: "YouTube Data API v3" },
        { name: "prev48hSnapshot", desc: "가속도 계산용 48시간 전 스냅샷", source: "ktrenz_data_snapshots" },
      ]} />

      {/* ── YouTube Music ── */}
      <SectionHeader icon={Headphones} title="YouTube Music (토픽 채널)" color="bg-rose-600" />
      <p className="text-sm text-muted-foreground">YouTube의 자동 생성 <strong>"아티스트 - Topic"</strong> 채널에서 수집된 공식 오디오/스트리밍 데이터입니다.</p>
      <FormulaCard title="데이터 수집" formula={`1. 최초: "Artist - Topic" 검색 → 채널 ID 저장 (100 유닛, 1회)
2. 이후:  playlistItems + channels API만 사용 (3 유닛/호출)
3. ID는 v3_artist_tiers.youtube_topic_channel_id에 저장`} description="토픽 채널 ID는 최초 검색 후 자동 저장되어, 이후 호출 시 비용이 높은 검색 API를 건너뜁니다." />
      <FormulaCard title="Music 스코어 기여" formula={`topicViewScore = log10(topicTotalViews + 1) × 10
topicSubScore  = log10(topicSubscribers + 1) × 8
mvViewScore    = log10(musicVideoViews + 1) × 12`} description="토픽 채널 조회수/구독자 및 MV 전용 조회수는 log10을 통해 전체 music_score에 가중 반영됩니다." />

      {/* ── Buzz 스코어 ── */}
      <SectionHeader icon={Zap} title="Buzz 스코어 (멀티 소스)" color="bg-amber-500" />
      <p className="text-sm text-muted-foreground">7개 소스의 가중 멘션을 집계합니다. Firecrawl Search로 X, Reddit, TikTok, News를 크롤링하고, YouTube 댓글과 네이버 뉴스는 별도 수집합니다.</p>
      <FormulaCard title="공식" formula={`BuzzScore = mentionScore + sentimentBonus

mentionScore   = min(800, log10(totalWeightedMentions) × 200)
sentimentBonus = (sentimentScore − 50) × 4`} />
      <Card className="p-4 bg-card border-border/50">
        <p className="text-sm text-muted-foreground font-medium mb-1.5">소스별 가중치 (7개 소스)</p>
        <code className="block text-sm font-mono text-primary bg-primary/5 rounded px-2.5 py-2 whitespace-pre-wrap">{`News:             2.0x  ← 가장 높은 시그널 품질
X/Twitter:        1.5x  ← 소셜 버즈 지표
YouTube 댓글:     1.5x  ← 직접적 팬 참여
TikTok:           1.4x  ← 바이럴 모멘텀
Naver:            1.3x  ← 한국 미디어 커버리지
Reddit:           1.2x  ← 커뮤니티 토론
External Videos:  1.2x  ← 외부 채널 출연`}</code>
        <p className="text-xs text-muted-foreground mt-2">네이버 뉴스 수집이 Buzz보다 먼저 실행되어 한국 미디어 데이터가 집계에 포함됩니다.</p>
      </Card>

      {/* ── 앨범 판매 스코어 ── */}
      <SectionHeader icon={BarChart3} title="앨범 판매 스코어 (멀티 소스)" color="bg-emerald-600" />
      <p className="text-xs text-muted-foreground"><strong>한터 차트</strong>의 앨범/실물 판매량 + <strong>Apple Music RSS</strong> 및 <strong>Billboard</strong> (Firecrawl 스크래핑)의 글로벌 차트 성적을 결합합니다.</p>
      <FormulaCard title="공식" formula={`AlbumScore = baseScore × 0.30 + deltaScore × 0.70 + chartBonus

baseScore  = log10(dailySales) × 200
deltaScore = (dailySales − prevDailySales) / 10K × 500
chartBonus = appleBonus + billboardBonus`} description="차트 보너스는 가산식입니다 — 글로벌 차트에 진입한 아티스트는 한터 판매 데이터가 없어도 차트 성적만으로 점수를 받을 수 있습니다." />
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">차트 보너스 포인트</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Apple Music (국가별, 10개국):
  Top 10:  +150pt    Top 50:  +80pt    Top 100: +30pt

Billboard (차트별: 200, Hot 100, Global 200, Global Excl. US):
  Top 10:  +300pt    Top 50:  +150pt
  Top 100: +60pt     Top 200: +20pt`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">예시: Apple Music KR #3 + US #45 + Billboard Global 200 #80 → 150 + 80 + 60 = +290pt 차트 보너스</p>
      </Card>
      <VarTable rows={[
        { name: "dailySales", desc: "한터 일일 앨범 판매량", source: "한터 차트 API" },
        { name: "appleChartPos", desc: "국가별 앨범 차트 순위 (10개국)", source: "Apple Music RSS" },
        { name: "billboardPos", desc: "4개 Billboard 차트 순위", source: "Firecrawl (billboard.com)" },
        { name: "prevDailySales", desc: "델타 계산용 24시간 전 판매량", source: "ktrenz_data_snapshots" },
      ]} />

      {/* ── Music 스코어 ── */}
      <SectionHeader icon={Music} title="Music 스코어 (v2 델타-오버-델타)" color="bg-purple-600" />
      <FormulaCard title="공식" formula={`MusicScore = baseScore × 0.30 + deltaScore × 0.70

baseScore = log10(playcount)×10 + log10(listeners)×8
          + log10(fans)×8 + log10(topicViews+1)×10
          + log10(topicSubs+1)×8 + log10(mvViews+1)×12

deltaScore = Σ incrementDeltaScore(metric, 24시간전, 48시간전, scale)
  └─ Last.fm playcount (scale=30)
  └─ Deezer fans (scale=20)
  └─ YT Music topicViews (scale=40)
  └─ MV views (scale=50)`}
        description="모든 누적 지표는 델타-오버-델타를 사용합니다: 오늘 증분 대 어제 증분의 비율 (가속도 0.3x~5.0x). deltaScore는 max(baseScore × 5, 500)으로 제한됩니다." />

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">incrementDeltaScore 함수</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`increment = 현재 − 24시간전
prevIncrement = 24시간전 − 48시간전

score = log10(increment) × scale
acceleration = increment / prevIncrement  // 1.0=동일, 5.0=5배↑
multiplier = clamp(acceleration, 0.3, 5.0)
finalScore = score × multiplier`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">예시: topicViews 4.5B→4.52B→4.6B → 오늘 +80M / 어제 +20M = <strong>4.0x 가속도</strong></p>
      </Card>

      <VarTable rows={[
        { name: "playcount", desc: "Last.fm 총 재생 횟수", source: "Last.fm API" },
        { name: "listeners", desc: "Last.fm 고유 리스너 수", source: "Last.fm API" },
        { name: "fans", desc: "Deezer 팬 수", source: "Deezer API" },
        { name: "topicTotalViews", desc: "YT Topic 채널 총 조회수", source: "YouTube Data API v3" },
        { name: "topicSubscribers", desc: "YT Topic 채널 구독자 수", source: "YouTube Data API v3" },
        { name: "musicVideoViews", desc: "MV 카테고리 영상 조회수", source: "YouTube Data API v3" },
      ]} />

      {/* ── 소셜 스코어 ── */}
      <SectionHeader icon={Users} title="소셜 스코어 (v5.4)" color="bg-pink-600" />
      <p className="text-xs text-muted-foreground"><strong>kpop-radar.com</strong>에서 스크래핑한 크로스 플랫폼 팔로워 데이터 (실행당 Firecrawl 4 크레딧). 30% 베이스 (로그 스케일) + 70% 델타 모델을 사용합니다.</p>
      <FormulaCard title="공식" formula={`SocialScore = avg(platformScores)

platformScore = (baseScore × 0.3 + deltaScore × 0.7) × weight
  baseScore  = log10(followers) × 100
  deltaScore = max(growthRate × 1000, baseScore × 0.1)
  growthRate = (현재 − 24시간전) / 24시간전`} description="이전 스냅샷이 없는 경우, deltaScore는 baseScore의 10%를 최소 모멘텀으로 사용합니다." />
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">플랫폼 가중치</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Spotify:   1.5x  ← 스트리밍 연관성
TikTok:    1.3x  ← 바이럴 도달
Instagram: 1.2x  ← 시각적 참여
Twitter/X: 1.0x  ← 기준선`}</code>
      </Card>
      <VarTable rows={[
        { name: "instagram_followers", desc: "Instagram 팔로워 수", source: "kpop-radar.com" },
        { name: "tiktok_followers", desc: "TikTok 팔로워 수", source: "kpop-radar.com" },
        { name: "spotify_followers", desc: "Spotify 팔로워 수", source: "kpop-radar.com" },
        { name: "twitter_followers", desc: "X/Twitter 팔로워 수", source: "kpop-radar.com" },
      ]} />

      {/* ── 팬 활동 스코어 ── */}
      <SectionHeader icon={Heart} title="팬 활동 스코어" color="bg-blue-600" />
      <p className="text-xs text-muted-foreground">플랫폼 내 사용자 참여를 롤링 24시간 윈도우로 집계합니다.</p>
      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">이벤트 가중치</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`외부 링크 클릭: 1.5x  ← 가장 높은 의도 시그널
에이전트 채팅:   1.0x  ← 적극적 참여
아티스트 상세:   0.5x  ← 수동적 관심
트리맵 클릭:     0.3x  ← 캐주얼 탐색
리스트 클릭:     0.3x  ← 캐주얼 탐색`}</code>
        <p className="text-[10px] text-muted-foreground mt-1.5">ktrenz_user_events 테이블에서 수집. 팬 스코어 = Σ(event_weight) / 아티스트 / 24시간</p>
      </Card>

      {/* ── FES v5.4 ── */}
      <SectionHeader icon={Flame} title="Fan Energy Score (FES) v5.4" color="bg-red-600" />
      <p className="text-xs text-muted-foreground">카테고리별 독립 Velocity/Intensity를 포함한 6개 카테고리 가중 에너지. <Badge variant="outline" className="text-[9px] ml-1">최소 10 · 최대 250</Badge></p>

      <Card className="p-3 bg-primary/5 border-primary/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">v5.4 아키텍처</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">6개 카테고리:</strong> YouTube 37% | Buzz 23% | Music 18% | Album 14% | Social 5% | Fan 3%</li>
          <li><strong className="text-foreground">카테고리별 Velocity/Intensity:</strong> 각 카테고리가 독립적으로 점수화된 후 가중 합산</li>
          <li><strong className="text-foreground">Energy = Velocity 60% + Intensity 40%:</strong> 성장 모멘텀 vs 절대적 위상</li>
          <li><strong className="text-foreground">퍼센타일 Intensity:</strong> 전체 tier-1 아티스트 중 순위 → 0~250 스케일</li>
          <li><strong className="text-foreground">시그모이드 Velocity:</strong> 24시간 변동률 → sigmoid(x/100×3) → 20~250 스케일</li>
          <li><strong className="text-foreground">Social (5%):</strong> kpop-radar 팔로워 데이터 (Instagram, TikTok, Spotify, Twitter)</li>
          <li><strong className="text-foreground">Fan Activity (3%):</strong> 플랫폼 사용자 이벤트 (링크 클릭 1.5x, 채팅 1.0x, 조회 0.5x)</li>
          <li><strong className="text-foreground">롤링 윈도우:</strong> 현재 시간 -24h 이전의 가장 가까운 유효 스냅샷과 비교</li>
          <li><strong className="text-foreground">Zero 페널티:</strong> 스코어 0인 카테고리는 가중치를 유지하되 에너지 0을 기여하여 데이터 공백에 불이익</li>
        </ul>
      </Card>

      <FormulaCard title="핵심 공식 (v5.4)" formula={`energy_score = Σ(category_energy × weight) / Σ(weights)

category_energy =
  velocity × 0.60 + intensity × 0.40  (velocity 가용 시)
  intensity                             (24h 비교 불가 시)

velocity  = sigmoid(change_24h / 100 × 3) → 20~250
intensity = percentile_rank × 250 → 0~250
change_24h = (현재 − 24시간전) / 24시간전 × 100

가중치: yt=0.37, buzz=0.23, music=0.18, album=0.14, social=0.05, fan=0.03`}
        description="Null 변동 (유효한 24h 비교 없음)은 해당 카테고리를 velocity에서 제외하지만 intensity는 포함합니다. Zero 스코어 카테고리는 전체 가중치로 에너지 0을 기여합니다." />

      <div className="grid grid-cols-6 gap-1.5">
        <Card className="p-2 bg-card border-border/50 text-center"><Youtube className="w-3.5 h-3.5 mx-auto text-destructive" /><p className="text-[10px] font-bold text-foreground mt-1">37%</p><p className="text-[8px] text-muted-foreground">YouTube</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Zap className="w-3.5 h-3.5 mx-auto text-amber-500" /><p className="text-[10px] font-bold text-foreground mt-1">23%</p><p className="text-[8px] text-muted-foreground">Buzz</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Music className="w-3.5 h-3.5 mx-auto text-purple-500" /><p className="text-[10px] font-bold text-foreground mt-1">18%</p><p className="text-[8px] text-muted-foreground">Music</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Disc3 className="w-3.5 h-3.5 mx-auto text-emerald-500" /><p className="text-[10px] font-bold text-foreground mt-1">14%</p><p className="text-[8px] text-muted-foreground">Album</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Users className="w-3.5 h-3.5 mx-auto text-pink-500" /><p className="text-[10px] font-bold text-foreground mt-1">5%</p><p className="text-[8px] text-muted-foreground">Social</p></Card>
        <Card className="p-2 bg-card border-border/50 text-center"><Heart className="w-3.5 h-3.5 mx-auto text-blue-500" /><p className="text-[10px] font-bold text-foreground mt-1">3%</p><p className="text-[8px] text-muted-foreground">Fan</p></Card>
      </div>

      <FormulaCard title="energy_change_24h (롤링 윈도우)" formula={`overallChange = Σ(change_i × weight_i) / Σ(weight_i)
  (유효한 24h 비교가 있는 카테고리만 포함)

비교 대상: 현재 − 24h 이전의 가장 최근 유효 스냅샷`}
        description="암호화폐 거래소 리더보드처럼 — 리셋 없는 연속 24시간 롤링 변동." />

      <FormulaCard title="EMA 베이스라인 업데이트" formula={`avg_7d  = avg_7d  × (1 − 0.15) + current × 0.15
avg_30d = avg_30d × (1 − 0.05) + current × 0.05`} description="에너지 스냅샷의 장기 트렌드 추적을 위해 EMA로 베이스라인을 관리합니다." />

      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💤</span><p className="text-xs font-bold text-foreground mt-1">&lt; 80</p><p className="text-[10px] text-muted-foreground">Low</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">💫</span><p className="text-xs font-bold text-foreground mt-1">80–150</p><p className="text-[10px] text-muted-foreground">Normal</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">⚡</span><p className="text-xs font-bold text-foreground mt-1">150–200</p><p className="text-[10px] text-muted-foreground">Active</p></Card>
        <Card className="p-3 bg-card border-border/50 text-center"><span className="text-lg">🔥</span><p className="text-xs font-bold text-foreground mt-1">200+</p><p className="text-[10px] text-muted-foreground">Explosive</p></Card>
      </div>

      {/* ── 정규화 분석 에이전트 (NEW) ── */}
      <SectionHeader icon={FlaskConical} title="FES 정규화 분석 에이전트 (v6)" color="bg-violet-600" />
      <p className="text-xs text-muted-foreground">YouTube 편중 문제를 해결하고, 카테고리별 기여도를 정량화하며, 독립적인 트렌드 추적을 수행하는 분석 에이전트입니다.</p>

      <Card className="p-3 bg-violet-500/5 border-violet-500/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">핵심 기능</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">Z-Score 정규화:</strong> 각 카테고리의 변동률을 전체 아티스트 분포 기준으로 표준화하여 YouTube의 절대 변동이 다른 카테고리를 마스킹하지 않도록 함</li>
          <li><strong className="text-foreground">기여도 분석:</strong> FES 변동에 각 카테고리가 얼마나 기여했는지 가중 |z-score| 비율로 계산</li>
          <li><strong className="text-foreground">독립 트렌드 추적:</strong> 7일/30일 롤링 통계로 카테고리별 방향, 표준편차, 모멘텀을 독립적으로 추적</li>
          <li><strong className="text-foreground">주도 카테고리 식별:</strong> 매 스냅샷마다 FES 변동을 이끈 카테고리를 자동 식별</li>
        </ul>
      </Card>

      <FormulaCard title="Z-Score 정규화" formula={`카테고리별 변동률:
  change_cat = (현재_스코어 − 24h전_스코어) / 24h전_스코어 × 100

전체 아티스트 분포 통계:
  mean_cat  = avg(모든 아티스트의 change_cat)
  stddev_cat = stddev(모든 아티스트의 change_cat)

정규화된 z-score:
  z_cat = (change_cat − mean_cat) / stddev_cat`}
        description="z-score를 통해 YouTube의 5% 변동과 Buzz의 50% 변동을 동일 스케일에서 비교할 수 있습니다." />

      <FormulaCard title="기여도 계산" formula={`가중 |z| = |z_cat| × weight_cat
기여도_cat = 가중|z|_cat / Σ(가중|z|_all) × 100%

정규화 FES = sigmoid(Σ(z_cat × weight_cat) × 0.5) → 10~250
주도 카테고리 = max(기여도_cat)`}
        description="예: YouTube z=0.5(기여 25%), Buzz z=2.1(기여 40%), Album z=-0.3(기여 5%) → 주도 카테고리: Buzz" />

      <FormulaCard title="독립 트렌드 (7d/30d)" formula={`카테고리별 롤링 통계:
  avg_7d   = 최근 7일 z-score 평균
  stddev_7d = 최근 7일 z-score 표준편차
  change_7d = z_최신 − z_7일전

모멘텀 = (avg_7d − avg_30d) / |avg_30d| × 100

트렌드 방향:
  rising  — change_7d > 0.5
  falling — change_7d < -0.5
  spike   — |change_7d| > 2.0
  flat    — 그 외`}
        description="모멘텀이 양수면 7일 평균이 30일 평균을 상회하는 상승 추세, 음수면 하락 추세를 나타냅니다." />

      <VarTable rows={[
        { name: "ktrenz_fes_contributions", desc: "카테고리별 z-score + 기여도 + 정규화 FES (스냅샷당)", source: "Supabase" },
        { name: "ktrenz_category_trends", desc: "카테고리별 7d/30d 독립 트렌드 통계", source: "Supabase" },
        { name: "ktrenz_normalization_stats", desc: "전체 아티스트 분포 기준 통계 (평균/σ/중앙값)", source: "Supabase" },
      ]} />

      {/* ── AI 예측 에이전트 (NEW) ── */}
      <SectionHeader icon={Brain} title="AI 예측 에이전트 (v1)" color="bg-orange-600" />
      <p className="text-xs text-muted-foreground">정규화된 기여도 및 트렌드 데이터를 기반으로 GPT-4o-mini가 24–48시간 FES 변동을 예측하고, 과거 예측을 자동 검증하여 정확도를 추적합니다.</p>

      <Card className="p-3 bg-orange-500/5 border-orange-500/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">예측 에이전트 아키텍처</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">입력 피처:</strong> 최근 5개 스냅샷의 카테고리별 z-score, 트렌드 방향/모멘텀, 시계열 패턴</li>
          <li><strong className="text-foreground">구조화 출력:</strong> OpenAI Tool Calling으로 FES 방향, 신뢰도, 주도 카테고리, 크로스 카테고리 패턴을 구조적으로 추출</li>
          <li><strong className="text-foreground">자동 검증:</strong> 24시간 후 예측과 실제 결과를 비교하여 정확도 스코어 (0–1) 자동 산정</li>
          <li><strong className="text-foreground">패턴 학습:</strong> Buzz 급등 → Album 스파이크 등의 크로스 카테고리 선행 시그널 탐지</li>
          <li><strong className="text-foreground">비용 최적화:</strong> GPT-4o-mini 사용, tier-1 아티스트만 대상 (최대 10명/실행)</li>
        </ul>
      </Card>

      <FormulaCard title="예측 출력 구조" formula={`{
  fes_direction:        "rising" | "falling" | "flat" | "spike_up" | "spike_down"
  confidence:           0.0 ~ 1.0
  leading_category_next: "youtube" | "buzz" | "album" | "music" | "social"
  category_predictions: { youtube: "up", buzz: "down", ... }
  cross_category_pattern: "Buzz 급등이 Album 스파이크 선행 패턴"
  reasoning:            "자연어 분석 근거"
}`}
        description="Tool Calling으로 구조화된 JSON을 강제하여 파싱 오류를 방지합니다." />

      <FormulaCard title="자동 검증 로직" formula={`예측 24h 후:
  actual_delta = 최신_normalized_fes − 예측시점_normalized_fes
  actual_direction = delta > 5 ? "rising" : delta < -5 ? "falling" : "flat"

정확도 = 방향일치(0.0 or 0.7 or 1.0) + 주도카테고리일치(+0.3)
  max 1.0`}
        description="누적 정확도를 추적하여 모델 성능 모니터링 및 향후 프롬프트 개선에 활용합니다." />

      <VarTable rows={[
        { name: "ktrenz_prediction_logs", desc: "예측 기록 + 피처 스냅샷 + 검증 결과", source: "Supabase" },
        { name: "prediction", desc: "구조화된 예측 JSON (방향/신뢰도/근거)", source: "GPT-4o-mini" },
        { name: "features_used", desc: "예측에 사용된 입력 피처 스냅샷", source: "Supabase" },
        { name: "accuracy_score", desc: "자동 검증 정확도 (0~1)", source: "자동 산정" },
      ]} />

      {/* ── 지리적 감지 엔진 ── */}
      <SectionHeader icon={Globe} title="지리적 감지 엔진" color="bg-teal-600" />
      <p className="text-xs text-muted-foreground">6개 독립 소스에서 지역별 시그널을 추적하고 변동률 감지를 통해 <strong>팬 반응이 뜨거워지는 지역</strong>을 식별합니다.</p>

      <Card className="p-3 bg-teal-500/5 border-teal-500/20">
        <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">아키텍처</p>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-4">
          <li><strong className="text-foreground">소스별 독립 추적:</strong> 각 소스가 독립적으로 추적됨 — 통합 점수 없이 에이전시에게 소스별 시그널 제공</li>
          <li><strong className="text-foreground">변동 감지:</strong> 24시간 롤링 윈도우 비교, ±30% 임계값 → <code className="text-primary">surge</code> 또는 <code className="text-primary">drop</code>으로 플래그</li>
          <li><strong className="text-foreground">이중 트리거:</strong> 6시간 파이프라인 후 (YouTube 댓글 + Last.fm + Apple Music + Billboard) 및 일일 geo-trends-cron (Google Trends) 후 실행</li>
          <li><strong className="text-foreground">차트 → 지리 변환:</strong> Apple Music & Billboard 차트 스냅샷이 급증 감지 전에 자동으로 지리 시그널로 변환</li>
          <li><strong className="text-foreground">소멸 감지:</strong> 이전 윈도우에 있었지만 현재에 없는 국가 → 자동으로 -100% 하락으로 플래그</li>
        </ul>
      </Card>

      <Card className="p-3 bg-card border-border/50">
        <p className="text-[11px] text-muted-foreground font-medium mb-1">6개 데이터 소스</p>
        <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 whitespace-pre-wrap">{`Google Trends (SerpAPI)  — 국가별 검색 관심도 0-100
  └ 스케줄: 1회/일 (geo-trends-cron)
  └ 데이터: interest_by_region (GEO_MAP_0)

Last.fm                 — 국가별 리스너 수
  └ 스케줄: 6시간마다 (collect-geo-fans)
  └ 데이터: 국가별 상위 리스너 랭킹

YouTube 댓글            — 언어 감지 → 국가 매핑
  └ 스케줄: 6시간마다 (ktrenz-yt-sentiment)
  └ 데이터: 유니코드 범위 분석 (KR/JP/TH/ID/VN/...)
  └ 비용: 추가 API 호출 없음

Apple Music 차트        — 국가별 차트 순위 (10개국)
  └ 스케줄: 6시간마다 (collect-apple-music-charts)
  └ 데이터: 국가별 Top 100 앨범 → interest_score = 101 − position
  └ 국가: KR, US, JP, GB, DE, FR, ID, TH, PH, MX

Billboard 차트          — 차트 순위 (미국 + 글로벌)
  └ 스케줄: 6시간마다 (collect-billboard-charts)
  └ 데이터: Hot 100, Billboard 200, Global 200 → interest_score = 201 − position
  └ 매핑: Hot 100/200 → US, Global 200 → GL, Global Excl. US → GX

Deezer                  — 국가별 팬 수 (급증 감지에서 제외)
  └ 스케줄: 6시간마다 (collect-geo-deezer)
  └ 데이터: 지역별 팬 분포`}</code>
      </Card>

      <FormulaCard title="변동 감지 로직" formula={`changeRate = (현재값 − 이전값) / 이전값 × 100

isSpike = |changeRate| ≥ 30%  (SPIKE_THRESHOLD)
spikeDirection = changeRate > 0 ? "surge" : "drop"

윈도우: 현재 (now−24h ~ now) vs 이전 (now−48h ~ now−24h)
각 소스 × 국가 쌍이 독립적으로 비교`} description="시그널은 ktrenz_geo_change_signals 테이블에 전체 이력으로 저장되어 트렌드 분석에 활용됩니다." />

      <VarTable rows={[
        { name: "ktrenz_geo_fan_data", desc: "소스 × 국가 × 아티스트별 원시 지리 데이터", source: "Supabase" },
        { name: "ktrenz_geo_change_signals", desc: "급증 플래그가 포함된 변동률 시그널", source: "Supabase" },
        { name: "interest_score", desc: "Google Trends (0-100) / Apple Music (101−pos) / Billboard (201−pos)", source: "멀티 소스" },
        { name: "listeners", desc: "국가별 Last.fm 리스너 수", source: "Last.fm API" },
        { name: "country_code", desc: "ISO 국가 코드 (2자리) + Billboard 글로벌용 GL/GX", source: "전체 소스" },
      ]} />

      {/* ── API & 데이터 소스 ── */}
      <SectionHeader icon={Server} title="API & 데이터 소스" color="bg-slate-600" />
      <div className="space-y-2">
        <ApiCard method="POST" endpoint="data-engine" description="전체 파이프라인을 오케스트레이션합니다. fire-and-forget 체이닝으로 각 모듈을 순차 실행하며, 마지막에 FES 분석/예측을 수행합니다." params={["module: 'all' | 모듈명", "wikiEntryId?", "triggerSource?"]} />
        <ApiCard method="POST" endpoint="ktrenz-data-collector" description="소스별 YouTube + Music + Hanteo + Buzz 데이터를 수집합니다." params={["source: 'youtube' | 'music' | 'hanteo' | 'buzz'", "wikiEntryId?"]} />
        <ApiCard method="POST" endpoint="collect-social-followers" description="kpop-radar.com에서 Instagram/TikTok/Spotify/Twitter 팔로워 데이터를 스크래핑합니다. ~4 Firecrawl 크레딧." params={["— (전체 tier-1 아티스트)"]} />
        <ApiCard method="POST" endpoint="calculate-energy-score" description="6개 카테고리에 걸쳐 퍼센타일 + 시그모이드 모델로 FES v5.4를 계산합니다." params={["isBaseline?"]} />
        <ApiCard method="POST" endpoint="ktrenz-fes-analyst" description="카테고리별 z-score 정규화, 기여도 분석, 7d/30d 독립 트렌드 추적을 수행합니다." params={["wiki_entry_ids?"]} />
        <ApiCard method="POST" endpoint="ktrenz-fes-predictor" description="GPT-4o-mini 기반 24-48h FES 방향 예측 및 과거 예측 자동 검증을 수행합니다." params={["wiki_entry_ids?", "mode: 'predict' | 'predict_only'"]} />
        <ApiCard method="POST" endpoint="query-artist-energy" description="유저용 개별 아티스트 실시간 에너지 조회 엔드포인트." params={["wiki_entry_id", "sources?"]} />
        <ApiCard method="POST" endpoint="crawl-naver-news" description="한국 미디어 커버리지를 위한 네이버 뉴스 기사를 수집합니다." params={["artistName", "wikiEntryId"]} />
        <ApiCard method="POST" endpoint="geo-trends-cron" description="일일 오케스트레이터: collect-geo-trends → detect-geo-changes. Google Trends 수집을 급증 감지와 체이닝합니다." params={["wiki_entry_id?"]} />
        <ApiCard method="POST" endpoint="detect-geo-changes" description="24시간 윈도우를 비교하여 전체 지리 소스에서 ±30% 지역 급증을 감지합니다." params={["wiki_entry_id?"]} />
      </div>

      <VarTable rows={[
        { name: "v3_scores_v2", desc: "아티스트별 최신 총점 + FES + 소셜/팬 스코어", source: "Supabase" },
        { name: "v3_energy_snapshots_v2", desc: "FES 이력 (카테고리별 velocity, intensity, social, fan)", source: "Supabase" },
        { name: "v3_energy_baselines_v2", desc: "FES 계산용 EMA 베이스라인", source: "Supabase" },
        { name: "ktrenz_data_snapshots", desc: "원시 플랫폼 수집 데이터 (전체 소스)", source: "Supabase" },
        { name: "ktrenz_user_events", desc: "팬 스코어용 사용자 활동 이벤트", source: "Supabase" },
        { name: "ktrenz_fes_contributions", desc: "카테고리별 z-score + 기여도 + 정규화 FES", source: "Supabase" },
        { name: "ktrenz_category_trends", desc: "카테고리별 7d/30d 독립 트렌드", source: "Supabase" },
        { name: "ktrenz_prediction_logs", desc: "AI 예측 기록 + 자동 검증 결과", source: "Supabase" },
        { name: "ktrenz_normalization_stats", desc: "전체 아티스트 분포 기준 통계", source: "Supabase" },
        { name: "ktrenz_geo_fan_data", desc: "소스 × 국가별 지리 팬 데이터", source: "Supabase" },
        { name: "ktrenz_geo_change_signals", desc: "급증 감지 포함 지역 변동 시그널", source: "Supabase" },
        { name: "wiki_entries.metadata", desc: "캐시된 원시 데이터 (YouTube/Buzz/Music)", source: "Supabase JSONB" },
      ]} />

      {/* ── 에너지 맵 ── */}
      <SectionHeader icon={Activity} title="에너지 맵 (트리맵) 구조" color="bg-emerald-600" />
      <p className="text-xs text-muted-foreground">홈 화면 <strong>⚡ 에너지 맵</strong>은 FES 상위 10명의 아티스트를 트리맵으로 시각화합니다.</p>

      <Card className="p-3 bg-card border-border/50 space-y-3">
        <div>
          <span className="text-xs font-bold text-foreground">📐 타일 면적 = Fan Energy Score</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">FES가 높을수록 면적이 큽니다. Squarify 알고리즘으로 가독성을 위한 정사각형에 가까운 타일을 생성합니다.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">🎨 타일 색상 = 24시간 에너지 변동률</span>
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(0,85%,50%,0.9)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">빨강</strong> — 상승 중 (Δ ≥ +5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(160,50%,40%,0.75)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">민트</strong> — 안정 (Δ -5% ~ +5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{background:"hsla(220,55%,35%,0.7)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">블루</strong> — 하락 중 (Δ ≤ -5%)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm border border-destructive/50 animate-pulse" style={{background:"hsla(0,85%,50%,0.9)"}}/><span className="text-[10px] text-muted-foreground"><strong className="text-foreground">네온 SURGE</strong> — 극단 급등 (Δ ≥ +25%) 발광 + 리플 애니메이션</span></div>
          </div>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">✨ 파티클 효과</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">각 타일에 동적 흰색 파티클이 적용됩니다. 파티클 속도는 에너지 변동률에, 밀도는 에너지 점유율에 비례합니다.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">📈 타일 내 스파크라인</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">중형+ 타일은 최근 점수 이력을 미니 라인 차트로 표시하여 직관적인 모멘텀 방향을 보여줍니다.</p>
        </div>
        <div>
          <span className="text-xs font-bold text-foreground">🏷️ 트렌드 라벨 분류</span>
          <code className="block text-[11px] font-mono text-primary bg-primary/5 rounded px-2 py-1.5 mt-1 whitespace-pre-wrap">{`🔥 SURGE  — Δ ≥ 30% 또는 가속도 ≥ 40%\n↑ Rising  — Δ ≥ 10%\n→ Stable  — Δ > -5%\n↘ Cooling — Δ > -15%\n↓ Falling — Δ ≤ -15%`}</code>
        </div>
      </Card>

      <FormulaCard title="Squarify 알고리즘 요약" formula={`1. 총 에너지 합산 → 아티스트별 면적 비율 계산\n2. 최악 종횡비를 최소화하며 행 배치\n3. 긴 축을 따라 반복적으로 분할\n4. 결과: 정사각형에 가까운 타일 레이아웃 → 가독성 ↑`} description="참조: finviz.com/map, kaito.ai 스타일 히트맵 레이아웃" />

      <p className="text-[10px] text-muted-foreground text-center mt-6">최종 업데이트: 2026년 3월 11일 · KTRENDZ FES Engine v5.4 + 정규화 분석 에이전트 v6 + AI 예측 에이전트 v1</p>
    </div>
  );

  if (isMobile) {
    return (
      <><SEO title="스코어링 엔진 – KTrenZ" description="KTrenZ가 YouTube, Buzz, Music, Album, Social, Fan 데이터를 활용하여 K-Pop 에너지 스코어를 계산하는 방법." path="/fes-engine" />
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
    <><SEO title="스코어링 엔진 – KTrenZ" description="KTrenZ가 YouTube, Buzz, Music, Album, Social, Fan 데이터를 활용하여 K-Pop 에너지 스코어를 계산하는 방법." path="/fes-engine" />
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <V3Sidebar activeTab="rankings" onTabChange={() => navigate('/')} />
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-[68px] border-b border-border/50 bg-background/60 backdrop-blur-xl sticky top-0 z-40 flex items-center px-4 gap-3">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
              <h1 className="text-lg font-bold text-foreground">스코어링 엔진</h1>
            </header>
            <main className="flex-1 overflow-auto"><PageContent /></main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default FesEngine;
