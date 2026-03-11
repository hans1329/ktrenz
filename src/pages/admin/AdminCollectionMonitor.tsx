import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Database, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
  Youtube, Music, Newspaper, MessageSquare, Globe, Users, Disc3,
  TrendingUp, Activity, Zap, MonitorPlay, BarChart3,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

// ── Data source registry ──
const DATA_SOURCES = [
  {
    id: 'youtube',
    name: 'YouTube (Official)',
    icon: Youtube,
    color: '#ef4444',
    platform: 'youtube',
    edgeFunction: 'ktrenz-data-collector',
    apiProvider: 'YouTube Data API v3',
    description: 'MV 조회수, 구독자, 좋아요, 댓글 수 수집',
    usedIn: ['YouTube Score (37%)', 'FES Velocity/Intensity'],
    collectFrequency: '6h (00:05, 06:05, 12:05, 18:05 UTC)',
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music (Topic)',
    icon: Music,
    color: '#ef4444',
    platform: 'youtube_music',
    edgeFunction: 'ktrenz-data-collector',
    apiProvider: 'YouTube Data API v3',
    description: 'Topic 채널의 자동 생성 MV/리릭 비디오 조회수',
    usedIn: ['Music Score (18%)'],
    collectFrequency: '6h',
  },
  {
    id: 'buzz_multi',
    name: 'Buzz (Multi-source)',
    icon: MessageSquare,
    color: '#8b5cf6',
    platform: 'buzz_multi',
    edgeFunction: 'ktrenz-data-collector',
    apiProvider: 'Firecrawl Search + AI',
    description: 'X, Reddit, TikTok, News 멘션 + YT댓글/네이버 뉴스 합산',
    usedIn: ['Buzz Score (23%)', 'Sentiment Analysis'],
    collectFrequency: '6h',
    subSources: [
      { name: 'X (Twitter)', weight: '1.5x', icon: '𝕏' },
      { name: 'Reddit', weight: '1.2x', icon: '🟠' },
      { name: 'TikTok', weight: '1.4x', icon: '🎵' },
      { name: 'News', weight: '2.0x', icon: '📰' },
      { name: 'YT Comments', weight: '1.5x', icon: '💬' },
      { name: 'Naver News', weight: '1.3x', icon: '🇰🇷' },
      { name: 'External Videos', weight: '1.2x', icon: '📺' },
    ],
  },
  {
    id: 'naver_news',
    name: 'Naver News',
    icon: Newspaper,
    color: '#03C75A',
    platform: 'naver_news',
    edgeFunction: 'crawl-naver-news',
    apiProvider: 'Naver Search API',
    description: '네이버 뉴스 검색 기사 건수 및 상위 기사 수집',
    usedIn: ['Buzz Score (1.3x 가중치)', 'Artist Detail 뉴스 탭'],
    collectFrequency: '6h',
  },
  {
    id: 'external_videos',
    name: 'External Videos',
    icon: MonitorPlay,
    color: '#8b5cf6',
    platform: 'external_videos',
    edgeFunction: 'scan-external-videos',
    apiProvider: 'YouTube Data API v3',
    description: 'Reference YouTube 채널에서 아티스트 출연 영상 스캔',
    usedIn: ['Buzz Score (1.2x 가중치)'],
    collectFrequency: '6h',
  },
  {
    id: 'hanteo_daily',
    name: 'Hanteo (Album Sales)',
    icon: Disc3,
    color: '#f59e0b',
    platform: 'hanteo_daily',
    edgeFunction: 'ktrenz-data-collector',
    apiProvider: 'Hanteo Chart API',
    description: '일간/주간 앨범 판매량',
    usedIn: ['Album Score (14%)'],
    collectFrequency: '6h',
  },
  {
    id: 'apple_music_chart',
    name: 'Apple Music Charts',
    icon: Music,
    color: '#fc3c44',
    platform: 'apple_music_chart',
    edgeFunction: 'collect-apple-music-charts',
    apiProvider: 'Apple Music RSS (Free)',
    description: '10개국 앨범 차트 Top 100 (KR, US, JP, GB 등)',
    usedIn: ['Album Score (보강)', 'Global Chart Presence'],
    collectFrequency: '6h',
  },
  {
    id: 'billboard_chart',
    name: 'Billboard Charts',
    icon: BarChart3,
    color: '#000000',
    platform: 'billboard_chart',
    edgeFunction: 'collect-billboard-charts',
    apiProvider: 'Firecrawl Scrape (billboard.com)',
    description: 'Billboard 200, Hot 100, Global 200 차트 진입 여부',
    usedIn: ['Album Score (보강)', 'Global Chart Presence'],
    collectFrequency: '6h',
  },
  {
    id: 'social_followers',
    name: 'Social Followers',
    icon: Users,
    color: '#ec4899',
    platform: 'social_followers',
    edgeFunction: 'collect-social-followers',
    apiProvider: 'Firecrawl Scrape (kpop-radar.com)',
    description: 'Instagram, TikTok, X, Spotify 팔로워 수',
    usedIn: ['Social Score (5%)'],
    collectFrequency: '6h',
  },
  {
    id: 'yt_sentiment',
    name: 'YT Sentiment',
    icon: BarChart3,
    color: '#06b6d4',
    platform: 'yt_sentiment',
    edgeFunction: 'ktrenz-yt-sentiment',
    apiProvider: 'YouTube Data API + OpenAI',
    description: 'YouTube 댓글 감성분석 (긍정/중립/부정)',
    usedIn: ['Artist Detail Sentiment 표시', 'Buzz Sentiment'],
    collectFrequency: 'On-demand / 6h',
  },
  {
    id: 'google_trends',
    name: 'Google Trends',
    icon: TrendingUp,
    color: '#4285f4',
    platform: null, // stored in ktrenz_geo_fan_data
    geoSource: 'google_trends',
    edgeFunction: 'collect-geo-trends',
    apiProvider: 'SerpAPI (Google Trends)',
    description: '60개국 검색 관심도 (0–100 상대 지수)',
    usedIn: ['Global Fan Reach 히트맵', 'Geo Spike Detection'],
    collectFrequency: 'Daily 04:00 UTC',
  },
  {
    id: 'lastfm',
    name: 'Last.fm',
    icon: Music,
    color: '#d51007',
    platform: null,
    geoSource: 'lastfm',
    edgeFunction: 'collect-geo-fans',
    apiProvider: 'Last.fm API',
    description: '국가별 리스너 수 및 랭킹',
    usedIn: ['Global Fan Reach', 'Geo Spike Detection'],
    collectFrequency: '6h',
  },
  {
    id: 'deezer',
    name: 'Deezer',
    icon: Music,
    color: '#a238ff',
    platform: 'deezer',
    edgeFunction: 'collect-geo-deezer',
    apiProvider: 'Deezer API',
    description: '글로벌 팬 수 (국가별 세분화 불가)',
    usedIn: ['Global Fan Reach'],
    collectFrequency: '6h',
  },
  {
    id: 'blip_schedule',
    name: 'Blip Schedule',
    icon: Activity,
    color: '#10b981',
    platform: null,
    edgeFunction: 'crawl-blip-schedule',
    apiProvider: 'Firecrawl Scrape (blip.kr)',
    description: '아티스트 스케줄 (방송/행사/컴백 등)',
    usedIn: ['Artist Detail 스케줄', 'Agency 일정×FES 연계'],
    collectFrequency: 'Daily',
  },
] as const;

const STALE_HOURS = 26;

const AdminCollectionMonitor = () => {
  // ── Snapshot stats per platform ──
  const { data: snapshotStats, isLoading: statsLoading } = useQuery({
    queryKey: ['collection-monitor-stats'],
    queryFn: async () => {
      // Get latest snapshot per platform
      const platforms = DATA_SOURCES.filter(s => s.platform).map(s => s.platform!);
      const results: Record<string, { total: number; artists: number; last: string | null; first: string | null }> = {};

      for (const platform of platforms) {
        const { data, count } = await supabase
          .from('ktrenz_data_snapshots' as any)
          .select('collected_at, wiki_entry_id', { count: 'exact' })
          .eq('platform', platform)
          .order('collected_at', { ascending: false })
          .limit(1);
        
        const uniqueArtists = new Set<string>();
        // Get artist count separately
        const { data: artistData } = await supabase
          .from('ktrenz_data_snapshots' as any)
          .select('wiki_entry_id')
          .eq('platform', platform);
        (artistData ?? []).forEach((r: any) => uniqueArtists.add(r.wiki_entry_id));

        results[platform] = {
          total: count ?? 0,
          artists: uniqueArtists.size,
          last: (data as any)?.[0]?.collected_at ?? null,
          first: null,
        };
      }
      return results;
    },
    staleTime: 60_000,
  });

  // ── Geo data stats ──
  const { data: geoStats } = useQuery({
    queryKey: ['collection-monitor-geo'],
    queryFn: async () => {
      const sources = ['google_trends', 'lastfm', 'youtube_comments'];
      const results: Record<string, { total: number; artists: number; last: string | null }> = {};
      for (const source of sources) {
        const { data, count } = await supabase
          .from('ktrenz_geo_fan_data' as any)
          .select('collected_at, wiki_entry_id', { count: 'exact' })
          .eq('source', source)
          .order('collected_at', { ascending: false })
          .limit(1);
        
        const { data: artistData } = await supabase
          .from('ktrenz_geo_fan_data' as any)
          .select('wiki_entry_id')
          .eq('source', source);
        const uniqueArtists = new Set<string>();
        (artistData ?? []).forEach((r: any) => uniqueArtists.add(r.wiki_entry_id));

        results[source] = {
          total: count ?? 0,
          artists: uniqueArtists.size,
          last: (data as any)?.[0]?.collected_at ?? null,
        };
      }
      return results;
    },
    staleTime: 60_000,
  });

  // ── Recent collection logs ──
  const { data: recentLogs } = useQuery({
    queryKey: ['collection-monitor-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_collection_log' as any)
        .select('*')
        .order('collected_at', { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });

  // ── Schedule entries count ──
  const { data: scheduleCount } = useQuery({
    queryKey: ['collection-monitor-schedules'],
    queryFn: async () => {
      const { count } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true });
      return count ?? 0;
    },
  });

  const getStatus = (lastCollected: string | null): 'ok' | 'stale' | 'never' => {
    if (!lastCollected) return 'never';
    const hoursAgo = (Date.now() - new Date(lastCollected).getTime()) / (1000 * 60 * 60);
    return hoursAgo <= STALE_HOURS ? 'ok' : 'stale';
  };

  const StatusIcon = ({ status }: { status: 'ok' | 'stale' | 'never' }) => {
    if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'stale') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const StatusBadge = ({ status }: { status: 'ok' | 'stale' | 'never' }) => {
    if (status === 'ok') return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">Active</Badge>;
    if (status === 'stale') return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px]">Stale</Badge>;
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px]">Never</Badge>;
  };

  const getSourceStats = (source: typeof DATA_SOURCES[number]) => {
    if (source.platform && snapshotStats?.[source.platform]) {
      const s = snapshotStats[source.platform];
      return { total: s.total, artists: s.artists, last: s.last };
    }
    if ('geoSource' in source && source.geoSource && geoStats?.[source.geoSource]) {
      const g = geoStats[source.geoSource];
      return { total: g.total, artists: g.artists, last: g.last };
    }
    // Special cases
    if (source.id === 'blip_schedule') {
      return { total: scheduleCount ?? 0, artists: null, last: null };
    }
    return null;
  };

  if (statsLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold flex items-center gap-2"><Database className="w-5 h-5" /> Data Collection Monitor</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Summary counts
  const totalSources = DATA_SOURCES.length;
  const activeSources = DATA_SOURCES.filter(s => {
    const stats = getSourceStats(s);
    return stats && getStatus(stats.last) === 'ok';
  }).length;
  const staleSources = DATA_SOURCES.filter(s => {
    const stats = getSourceStats(s);
    return stats && getStatus(stats.last) === 'stale';
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" /> Data Collection Monitor
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          전체 외부 데이터 소스 현황 · 수집 주기 · 사용처 · 성공/실패 상태
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Sources</p>
          <p className="text-2xl font-bold text-foreground">{totalSources}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Active (≤{STALE_HOURS}h)</p>
          <p className="text-2xl font-bold text-emerald-500">{activeSources}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{"Stale (>"}{STALE_HOURS}{"h)"}</p>
          <p className="text-2xl font-bold text-amber-500">{staleSources}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Never Collected</p>
          <p className="text-2xl font-bold text-red-500">{totalSources - activeSources - staleSources}</p>
        </Card>
      </div>

      {/* Source Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {DATA_SOURCES.map((source) => {
          const stats = getSourceStats(source);
          const status = getStatus(stats?.last ?? null);
          const Icon = source.icon;

          return (
            <Card key={source.id} className={`relative overflow-hidden ${status === 'ok' ? 'border-emerald-500/20' : status === 'stale' ? 'border-amber-500/20' : 'border-red-500/20'}`}>
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: source.color }} />
              <CardHeader className="pb-2 pl-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: source.color }} />
                    {source.name}
                  </CardTitle>
                  <StatusBadge status={status} />
                </div>
                <CardDescription className="text-[11px]">{source.description}</CardDescription>
              </CardHeader>
              <CardContent className="pl-5 space-y-3">
                {/* API & Edge Function */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[9px]">API: {source.apiProvider}</Badge>
                  <Badge variant="outline" className="text-[9px]">fn: {source.edgeFunction}</Badge>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{stats?.total?.toLocaleString() ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">Snapshots</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{stats?.artists ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">Artists</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-foreground">
                      {stats?.last ? formatDistanceToNow(new Date(stats.last), { addSuffix: true }) : 'Never'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Last Run</p>
                  </div>
                </div>

                {/* Frequency */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>수집 주기: {source.collectFrequency}</span>
                </div>

                {/* Used In */}
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">사용처:</p>
                  <div className="flex flex-wrap gap-1">
                    {source.usedIn.map((use, i) => (
                      <Badge key={i} variant="secondary" className="text-[9px] font-normal">{use}</Badge>
                    ))}
                  </div>
                </div>

                {/* Sub-sources for Buzz */}
                {'subSources' in source && (source as any).subSources && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">세부 소스:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {(source as any).subSources.map((sub: { name: string; weight: string; icon: string }, i: number) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] bg-muted/50 rounded px-1.5 py-0.5">
                          <span>{sub.icon}</span>
                          <span className="text-foreground font-medium truncate">{sub.name}</span>
                          <span className="text-muted-foreground ml-auto">{sub.weight}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Collection Logs */}
      {recentLogs && recentLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Recent Collection Logs
            </CardTitle>
            <CardDescription className="text-xs">최근 50건 수집 로그</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-40">Time</TableHead>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Artist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.collected_at), 'MM/dd HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{log.platform}</Badge>
                      </TableCell>
                      <TableCell>
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.wiki_entry_id ? log.wiki_entry_id.slice(0, 8) + '…' : 'Batch'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Architecture */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Pipeline Execution Order
          </CardTitle>
          <CardDescription className="text-xs">6시간 주기 수집 파이프라인 실행 순서 (데이터 의존성 기반)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { step: 'YouTube', color: '#ef4444' },
              { step: 'External Videos', color: '#8b5cf6' },
              { step: 'Music', color: '#3b82f6' },
              { step: 'Hanteo', color: '#f59e0b' },
              { step: 'Naver News', color: '#03C75A' },
              { step: 'Buzz', color: '#8b5cf6' },
              { step: 'Social', color: '#ec4899' },
              { step: 'Fan Activity', color: '#ec4899' },
              { step: 'Energy Score', color: '#f97316' },
              { step: 'Geo Changes', color: '#06b6d4' },
            ].map((item, i, arr) => (
              <span key={item.step} className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-medium" style={{ borderColor: item.color, color: item.color }}>
                  {i + 1}. {item.step}
                </Badge>
                {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Cron: 00:05, 06:05, 12:05, 18:05 UTC · Google Trends: 04:00 UTC (별도 daily cron)
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCollectionMonitor;
