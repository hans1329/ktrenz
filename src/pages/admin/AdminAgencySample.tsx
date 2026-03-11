import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Youtube, ThumbsUp, ThumbsDown, Minus, RefreshCw,
  TrendingUp, TrendingDown, Zap, Music, Disc3, Newspaper,
  MessageSquare, BarChart3, Building2, ExternalLink, GitCompareArrows,
  Trophy, Calendar, Sparkles, Brain, Activity, Globe, MapPin,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, ReferenceLine, ComposedChart,
  Scatter,
} from 'recharts';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

const SENTIMENT_COLORS = { positive: '#10b981', neutral: '#6b7280', negative: '#ef4444' };
const CATEGORY_COLORS: Record<string, string> = {
  youtube: '#ef4444', buzz: '#8b5cf6', music: '#3b82f6', album: '#f59e0b', fan: '#ec4899',
};
const BUZZ_SOURCE_COLORS: Record<string, string> = {
  x_twitter: '#1DA1F2', news: '#f59e0b', reddit: '#FF4500', tiktok: '#00f2ea',
  yt_comments: '#ef4444', naver: '#03C75A', ext_videos: '#8b5cf6',
};

// Convert country code to flag emoji
const countryFlag = (code: string) => {
  if (!code || code.length !== 2) return '🏳️';
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
};

const AdminAgencySample = () => {
  const [selectedArtistId, setSelectedArtistId] = useState<string>('');
  const [compareArtistId, setCompareArtistId] = useState<string>('none');
  const [aiInsight, setAiInsight] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── Artists list ──
  const { data: artists } = useQuery({
    queryKey: ['agency-artists'],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_artist_tiers')
        .select('wiki_entry_id, display_name, name_ko, youtube_channel_id, tier')
        .not('youtube_channel_id', 'is', null)
        .order('display_name');
      return (data ?? []).filter((a: any) => a.youtube_channel_id);
    },
  });

  // ── Real-time Energy Coordinates ──
  const { data: coordData, isLoading: coordLoading } = useQuery({
    queryKey: ['agency-coordinates', selectedArtistId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('query-artist-energy', {
        body: { wiki_entry_id: selectedArtistId },
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!selectedArtistId,
    refetchInterval: 5 * 60 * 1000,
  });

  // ── Energy Score (30 days for correlation) ──
  const { data: energyData } = useQuery({
    queryKey: ['agency-energy', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_energy_snapshots_v2' as any)
        .select('*')
        .eq('wiki_entry_id', selectedArtistId)
        .order('snapshot_at', { ascending: false })
        .limit(30);
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Calendar events for correlation (past 30d + future) ──
  const { data: correlationEvents } = useQuery({
    queryKey: ['agency-correlation-events', selectedArtistId],
    queryFn: async () => {
      const from = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('calendar_events')
        .select('event_date, event_type, title')
        .eq('wiki_entry_id', selectedArtistId)
        .gte('event_date', from)
        .order('event_date', { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Score data ──
  const { data: scoreData } = useQuery({
    queryKey: ['agency-scores', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_scores_v2' as any)
        .select('*')
        .eq('wiki_entry_id', selectedArtistId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!selectedArtistId,
  });

  // ── Buzz snapshots (last 7 days) ──
  const { data: buzzSnapshots } = useQuery({
    queryKey: ['agency-buzz-history', selectedArtistId],
    queryFn: async () => {
      const fromDate = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from('ktrenz_data_snapshots' as any)
        .select('metrics, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('platform', 'buzz_multi')
        .gte('collected_at', fromDate)
        .order('collected_at', { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── YouTube snapshots (last 7 days) ──
  const { data: ytSnapshots } = useQuery({
    queryKey: ['agency-yt-history', selectedArtistId],
    queryFn: async () => {
      const fromDate = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from('ktrenz_data_snapshots' as any)
        .select('metrics, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('platform', 'youtube')
        .gte('collected_at', fromDate)
        .order('collected_at', { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Naver news latest ──
  const { data: naverData } = useQuery({
    queryKey: ['agency-naver', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_data_snapshots' as any)
        .select('metrics, raw_response, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('platform', 'naver_news')
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    enabled: !!selectedArtistId,
  });

  // ── External videos latest ──
  const { data: extVideoData } = useQuery({
    queryKey: ['agency-ext-videos', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_data_snapshots' as any)
        .select('metrics, raw_response, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('platform', 'external_videos')
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    enabled: !!selectedArtistId,
  });

  // ── Sentiment snapshot ──
  const { data: sentimentSnapshot, refetch: refetchSentiment } = useQuery({
    queryKey: ['agency-sentiment', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_data_snapshots' as any)
        .select('metrics, raw_response, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('platform', 'yt_sentiment')
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    enabled: !!selectedArtistId,
  });

  // ── Fan intents ──
  const { data: fanIntents } = useQuery({
    queryKey: ['agency-intents', selectedArtistId],
    queryFn: async () => {
      const fromDate = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from('ktrenz_agent_intents' as any)
        .select('intent_category, sentiment, source_query, sub_topic, created_at')
        .eq('wiki_entry_id', selectedArtistId)
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(100);
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Ranking position ──
  const { data: rankingData } = useQuery({
    queryKey: ['agency-ranking', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_scores_v2' as any)
        .select('wiki_entry_id, total_score')
        .order('total_score', { ascending: false });
      const all = (data ?? []) as any[];
      const idx = all.findIndex((a: any) => a.wiki_entry_id === selectedArtistId);
      return { rank: idx + 1, total: all.length };
    },
    enabled: !!selectedArtistId,
  });

  // ── Milestones ──
  const { data: milestones } = useQuery({
    queryKey: ['agency-milestones', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_artist_milestones' as any)
        .select('*')
        .eq('wiki_entry_id', selectedArtistId)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Geo Fan Data (Last.fm) ──
  const { data: geoFanData, refetch: refetchGeo, isLoading: geoLoading } = useQuery({
    queryKey: ['agency-geo-fans', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_geo_fan_data' as any)
        .select('country_code, country_name, source, rank_position, listeners, interest_score, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('source', 'lastfm')
        .order('collected_at', { ascending: false })
        .limit(100);
      const seen = new Set<string>();
      const unique = (data ?? []).filter((d: any) => {
        if (seen.has(d.country_code)) return false;
        seen.add(d.country_code);
        return true;
      });
      return unique.sort((a: any, b: any) => (b.listeners ?? 0) - (a.listeners ?? 0)) as any[];
    },
    enabled: !!selectedArtistId,
  });

  // ── Geo Fan Data (Google Trends) ──
  const { data: geoTrendsData, refetch: refetchGeoTrends, isLoading: geoTrendsLoading } = useQuery({
    queryKey: ['agency-geo-trends', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ktrenz_geo_fan_data' as any)
        .select('country_code, country_name, source, rank_position, listeners, interest_score, collected_at')
        .eq('wiki_entry_id', selectedArtistId)
        .eq('source', 'google_trends')
        .order('collected_at', { ascending: false })
        .limit(100);
      const seen = new Set<string>();
      const unique = (data ?? []).filter((d: any) => {
        if (seen.has(d.country_code)) return false;
        seen.add(d.country_code);
        return true;
      });
      return unique.sort((a: any, b: any) => (b.interest_score ?? 0) - (a.interest_score ?? 0)) as any[];
    },
    enabled: !!selectedArtistId,
  });

  const geoCollectMutation = useMutation({
    mutationFn: async () => {
      // Collect both Last.fm and Google Trends in parallel
      const [lastfmRes, trendsRes] = await Promise.allSettled([
        supabase.functions.invoke('collect-geo-fans', { body: { wiki_entry_id: selectedArtistId } }),
        supabase.functions.invoke('collect-geo-trends', { body: { wiki_entry_id: selectedArtistId } }),
      ]);
      const lastfmData = lastfmRes.status === 'fulfilled' ? lastfmRes.value.data : null;
      const trendsData = trendsRes.status === 'fulfilled' ? trendsRes.value.data : null;
      return { lastfm: lastfmData, trends: trendsData };
    },
    onSuccess: (d) => {
      const lastfmCount = d.lastfm?.matches_found ?? 0;
      const trendsCount = d.trends?.matches_found ?? 0;
      toast.success(`Last.fm ${lastfmCount}개국 + Google Trends ${trendsCount}개국 수집 완료`);
      refetchGeo();
      refetchGeoTrends();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Competitor schedule monitoring ──
  const [scheduleCompareIds, setScheduleCompareIds] = useState<string[]>([]);
  const allScheduleIds = [selectedArtistId, ...scheduleCompareIds].filter(Boolean);

  const { data: competitorSchedules } = useQuery({
    queryKey: ['agency-competitor-schedules', allScheduleIds],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('calendar_events')
        .select('*')
        .in('wiki_entry_id', allScheduleIds)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(50);
      return (data ?? []) as any[];
    },
    enabled: allScheduleIds.length > 0,
  });

  // ── Competitor scores ──
  const { data: compareScoreData } = useQuery({
    queryKey: ['agency-compare-scores', compareArtistId],
    queryFn: async () => {
      if (compareArtistId === 'none') return null;
      const [scoresRes, energyRes] = await Promise.all([
        supabase.from('v3_scores_v2' as any).select('*').eq('wiki_entry_id', compareArtistId).maybeSingle(),
        supabase.from('v3_energy_snapshots_v2' as any).select('*').eq('wiki_entry_id', compareArtistId).order('snapshot_at', { ascending: false }).limit(1),
      ]);
      return {
        scores: scoresRes.data as any,
        energy: (energyRes.data as any)?.[0],
      };
    },
    enabled: compareArtistId !== 'none',
  });

  // ── Analyze mutation ──
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ktrenz-yt-sentiment', {
        body: { wikiEntryId: selectedArtistId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed');
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Sentiment: ${d.overallLabel} (${d.overallScore})`);
      refetchSentiment();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedArtist = artists?.find((a: any) => a.wiki_entry_id === selectedArtistId);

  // ── Derived data ──
  const latestEnergy = energyData?.[0];
  const fesScore = latestEnergy?.energy_score ?? 0;
  const prevFes = energyData?.[1]?.energy_score ?? fesScore;
  const fesDelta = fesScore - prevFes;

  const buzzTrend = buzzSnapshots?.map((s: any) => ({
    date: format(new Date(s.collected_at), 'MM/dd HH:mm'),
    score: s.metrics?.buzz_score ?? 0,
    mentions: s.metrics?.total_mentions ?? 0,
  })) ?? [];

  const latestBuzz = buzzSnapshots?.[buzzSnapshots.length - 1]?.metrics;
  const buzzBreakdown = latestBuzz?.source_breakdown ?? [];

  const ytTrend = ytSnapshots?.map((s: any) => ({
    date: format(new Date(s.collected_at), 'MM/dd'),
    views: s.metrics?.recentTotalViews ?? 0,
    subs: s.metrics?.subscriberCount ?? 0,
  })) ?? [];
  const latestYt = ytSnapshots?.[ytSnapshots.length - 1]?.metrics;

  const radarData = [
    { cat: 'YouTube', value: latestEnergy?.youtube_velocity != null ? Math.round((latestEnergy.youtube_velocity * 0.6 + (latestEnergy.youtube_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Buzz', value: latestEnergy?.buzz_velocity != null ? Math.round((latestEnergy.buzz_velocity * 0.6 + (latestEnergy.buzz_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Music', value: latestEnergy?.music_velocity != null ? Math.round((latestEnergy.music_velocity * 0.6 + (latestEnergy.music_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Album', value: latestEnergy?.album_velocity != null ? Math.round((latestEnergy.album_velocity * 0.6 + (latestEnergy.album_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Social', value: latestEnergy?.social_velocity != null ? Math.round((latestEnergy.social_velocity * 0.6 + (latestEnergy.social_intensity ?? 0) * 0.4) * 100) : 0 },
  ];

  const naverArticles = naverData?.raw_response?.top_items ?? [];
  const extVideos = extVideoData?.raw_response?.videos ?? [];

  const sentimentMetrics = sentimentSnapshot?.metrics as any;
  const sentimentVideos = sentimentSnapshot?.raw_response?.videos ?? [];
  const sentimentPie = sentimentMetrics ? [
    { name: 'Positive', value: sentimentMetrics.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: sentimentMetrics.neutral, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: sentimentMetrics.negative, color: SENTIMENT_COLORS.negative },
  ].filter((d: any) => d.value > 0) : [];

  // Fan intent sentiment
  const intentSentiment = fanIntents?.reduce((acc: any, i: any) => {
    acc[i.sentiment || 'neutral'] = (acc[i.sentiment || 'neutral'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const fesTrendData = energyData?.slice().reverse().map((e: any) => ({
    date: e.snapshot_at?.slice(5, 10) ?? '',
    score: Math.round(e.energy_score ?? 0),
  })) ?? [];

  // Competitor derived data
  const compareArtistName = compareArtistId === 'none'
    ? '' : artists?.find((a: any) => a.wiki_entry_id === compareArtistId)?.display_name ?? '';
  const compareEnergy = compareScoreData?.energy?.energy_score ?? 0;
  const comparisonData = compareArtistId !== 'none' && selectedArtistId && compareScoreData ? [
    { metric: 'FES Score', [selectedArtist?.display_name ?? 'A']: Math.round(fesScore), [compareArtistName]: Math.round(compareEnergy) },
    { metric: 'Buzz', [selectedArtist?.display_name ?? 'A']: scoreData?.buzz_score ?? 0, [compareArtistName]: compareScoreData.scores?.buzz_score ?? 0 },
    { metric: 'YouTube', [selectedArtist?.display_name ?? 'A']: scoreData?.youtube_score ?? 0, [compareArtistName]: compareScoreData.scores?.youtube_score ?? 0 },
    { metric: 'Music', [selectedArtist?.display_name ?? 'A']: scoreData?.music_score ?? 0, [compareArtistName]: compareScoreData.scores?.music_score ?? 0 },
    { metric: 'Album', [selectedArtist?.display_name ?? 'A']: scoreData?.album_score ?? 0, [compareArtistName]: compareScoreData.scores?.album_score ?? 0 },
  ] : [];

  // Milestone icons
  const milestoneIcon = (type: string) => {
    if (type.includes('rank_1')) return '🥇';
    if (type.includes('rank_3')) return '🏆';
    if (type.includes('tier')) return '⭐';
    if (type.includes('energy') || type.includes('fes')) return '⚡';
    if (type.includes('buzz')) return '📢';
    return '🎯';
  };

  // ── AI Insight generation ──
  const generateInsight = useCallback(async () => {
    if (!selectedArtistId || !selectedArtist) return;
    setAiLoading(true);
    setAiInsight('');
    try {
      const context = {
        artist: selectedArtist.display_name,
        fesScore: Math.round(fesScore),
        fesDelta: Math.round(fesDelta),
        rank: rankingData?.rank,
        totalArtists: rankingData?.total,
        buzzScore: scoreData?.buzz_score,
        buzzMentions: latestBuzz?.total_mentions,
        sentimentLabel: sentimentMetrics?.overall_label,
        sentimentScore: sentimentMetrics?.overall_score,
        ytSubscribers: latestYt?.subscriberCount,
        naverArticles: naverData?.metrics?.article_count_24h ?? naverData?.metrics?.mention_count,
        recentMilestones: milestones?.slice(0, 5).map((m: any) => m.milestone_type),
        fanIntentCount: fanIntents?.length,
        topIntentCategories: Object.entries(
          fanIntents?.reduce((a: any, i: any) => { a[i.intent_category] = (a[i.intent_category] || 0) + 1; return a; }, {}) ?? {}
        ).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
      };

      const prompt = `You are a senior K-pop entertainment agency strategist. Based on the following artist data, provide exactly 5 strategic insights as a JSON array. Each item must have: "emoji" (single emoji), "title" (short Korean title, max 20 chars), "body" (detailed actionable insight in Korean, 3-5 sentences including specific numbers from the data, root cause analysis, and concrete action items with expected outcomes), "priority" ("high"|"medium"|"low"). Be data-driven: reference exact metrics, compare trends, and suggest specific campaigns or strategies. Return ONLY the JSON array, no markdown.

Artist: ${context.artist}
- FES Score: ${context.fesScore} (${context.fesDelta >= 0 ? '+' : ''}${context.fesDelta} vs yesterday)
- Ranking: #${context.rank} of ${context.totalArtists}
- Buzz Score: ${context.buzzScore} (${context.buzzMentions} mentions)
- YouTube Subscribers: ${context.ytSubscribers ? (context.ytSubscribers / 1e6).toFixed(2) + 'M' : 'N/A'}
- Naver News (24h): ${context.naverArticles ?? 0} articles
- Fan Sentiment: ${context.sentimentLabel ?? 'unknown'} (score: ${context.sentimentScore ?? 'N/A'})
- Fan Queries (7d): ${context.fanIntentCount} queries, top categories: ${context.topIntentCategories.join(', ')}
- Recent Milestones: ${context.recentMilestones?.join(', ') || 'none'}`;

      const { data, error } = await supabase.functions.invoke('ktrenz-agency-insight', {
        body: { prompt },
      });
      if (error) throw error;
      setAiInsight(data?.reply || 'No insight generated.');
    } catch (err: any) {
      toast.error(`AI insight failed: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }, [selectedArtistId, selectedArtist, fesScore, fesDelta, rankingData, scoreData, latestBuzz, sentimentMetrics, latestYt, naverData, milestones, fanIntents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" /> 에이전시 대시보드
          </h1>
          <p className="text-sm text-muted-foreground">종합 아티스트 인텔리전스 — 샘플 모드</p>
        </div>
        <Badge variant="outline" className="text-xs">🧪 Beta</Badge>
      </div>

      {/* Artist Selector */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground shrink-0">아티스트:</span>
          <Select value={selectedArtistId} onValueChange={setSelectedArtistId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="아티스트를 선택하세요..." />
            </SelectTrigger>
            <SelectContent>
              {artists?.map((a: any) => (
                <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                  {a.display_name} {a.name_ko ? `(${a.name_ko})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedArtistId && (
            <Button size="sm" variant="outline" onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
              {analyzeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              YT 댓글 분석
            </Button>
          )}
          {selectedArtist && (
            <Badge className="ml-auto" variant="secondary">Tier {selectedArtist.tier}</Badge>
          )}
        </CardContent>
      </Card>

      {!selectedArtistId && (
        <div className="text-center py-24 text-muted-foreground">
          <BarChart3 className="w-14 h-14 mx-auto mb-4 opacity-20" />
          <p>아티스트를 선택하면 전체 인텔리전스 대시보드를 확인할 수 있습니다</p>
        </div>
      )}

      {selectedArtistId && (
        <>
          {/* ═══ Row 1: Key Metrics ═══ */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* FES */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> FES 점수</p>
                <p className="text-2xl font-bold mt-1">{Math.round(fesScore).toLocaleString()}</p>
                <div className={`text-xs mt-0.5 flex items-center gap-0.5 ${fesDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {fesDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {fesDelta >= 0 ? '+' : ''}{Math.round(fesDelta)}
                </div>
              </CardContent>
            </Card>
            {/* Rank */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">순위</p>
                <p className="text-2xl font-bold mt-1">#{rankingData?.rank ?? '-'}</p>
                <p className="text-[11px] text-muted-foreground">{rankingData?.total ?? '-'}명 중</p>
              </CardContent>
            </Card>
            {/* Buzz */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3 text-purple-500" /> 버즈 점수</p>
                <p className="text-2xl font-bold mt-1">{scoreData?.buzz_score?.toLocaleString() ?? '-'}</p>
                <p className="text-[11px] text-muted-foreground">{latestBuzz?.total_mentions ?? 0}건 언급</p>
              </CardContent>
            </Card>
            {/* YouTube */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Youtube className="w-3 h-3 text-red-500" /> YouTube</p>
                <p className="text-2xl font-bold mt-1">{latestYt?.subscriberCount ? (latestYt.subscriberCount / 1e6).toFixed(2) + 'M' : '-'}</p>
                <p className="text-[11px] text-muted-foreground">구독자</p>
              </CardContent>
            </Card>
            {/* Sentiment */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3 text-emerald-500" /> 감성</p>
                <p className="text-2xl font-bold mt-1">{sentimentMetrics?.overall_score ?? '-'}</p>
                {sentimentMetrics?.overall_label && (
                  <Badge className={`text-[10px] mt-0.5 ${
                    sentimentMetrics.overall_label === 'positive' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                    sentimentMetrics.overall_label === 'negative' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                    'bg-muted text-muted-foreground'
                  }`} variant="outline">{sentimentMetrics.overall_label}</Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══ 🔥 Hot Coordinates — 지금 어디서 터지고 있나? ═══ */}
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> 🔥 Hot Coordinates — 지금 어디서 터지고 있나?
              </CardTitle>
              <CardDescription className="text-xs">실시간 채널별 활동 강도 · 24h 변동률 기준</CardDescription>
            </CardHeader>
            <CardContent>
              {coordLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 좌표 분석 중...
                </div>
              ) : coordData?.categories ? (() => {
                const cats = coordData.categories;
                const entries = [
                  { key: 'youtube', label: 'YouTube', icon: <Youtube className="w-4 h-4" />, color: '#ef4444', data: cats.youtube },
                  { key: 'buzz', label: 'Buzz / Social', icon: <MessageSquare className="w-4 h-4" />, color: '#8b5cf6', data: cats.buzz },
                  { key: 'music', label: 'Music Streaming', icon: <Music className="w-4 h-4" />, color: '#3b82f6', data: cats.music },
                  { key: 'album', label: 'Album Sales', icon: <Disc3 className="w-4 h-4" />, color: '#f59e0b', data: cats.album },
                ].filter(e => e.data);

                // Sort by absolute change to highlight hottest
                const sorted = [...entries].sort((a, b) => Math.abs(b.data.change_pct) - Math.abs(a.data.change_pct));
                const hottest = sorted[0];

                return (
                  <div className="space-y-3">
                    {/* Hottest alert */}
                    {hottest && Math.abs(hottest.data.change_pct) > 5 && (
                      <div className={`rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 ${
                        hottest.data.change_pct > 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {hottest.data.change_pct > 0 ? '🚀' : '⚠️'}
                        <span>
                          <strong>{hottest.label}</strong>에서 {hottest.data.change_pct > 0 ? '급등' : '급락'} 중!
                          {' '}({hottest.data.change_pct > 0 ? '+' : ''}{hottest.data.change_pct}% · 24h)
                          {hottest.data.percentile != null && ` — 상위 ${100 - hottest.data.percentile}%`}
                        </span>
                      </div>
                    )}

                    {/* Source bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {sorted.map(({ key, label, icon, color, data }) => {
                        const isHot = Math.abs(data.change_pct) > 5;
                        const isPositive = data.change_pct > 0;
                        const barWidth = Math.min(Math.abs(data.change_pct), 100);
                        return (
                          <div key={key} className={`rounded-lg border p-3 transition-all ${
                            isHot ? (isPositive ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5') : 'border-border/50 bg-card/50'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 text-sm font-medium" style={{ color }}>
                                {icon} {label}
                                {isHot && <span className="text-[10px] animate-pulse">{isPositive ? '🔥' : '📉'}</span>}
                              </div>
                              <div className="text-right">
                                <span className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : data.change_pct < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                  {isPositive ? '+' : ''}{data.change_pct}%
                                </span>
                              </div>
                            </div>
                            {/* Visual bar */}
                            <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden mb-1.5">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                  width: `${Math.max(barWidth, 2)}%`,
                                  backgroundColor: isPositive ? '#10b981' : data.change_pct < 0 ? '#ef4444' : '#6b7280',
                                }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Score: {data.current?.toLocaleString()}</span>
                              <span>Velocity: {data.velocity}</span>
                              <span>Top {100 - (data.percentile ?? 0)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Overall energy summary */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/30 pt-2">
                      <span>종합 Energy: <strong className="text-foreground">{coordData.energy_score}</strong> (Rank #{coordData.energy_rank})</span>
                      <span>24h 종합 변동: <strong className={coordData.change_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {coordData.change_24h >= 0 ? '+' : ''}{coordData.change_24h}%
                      </strong></span>
                      {coordData.prev_snapshot_at && (
                        <span>기준: {format(new Date(coordData.prev_snapshot_at), 'MM/dd HH:mm')}</span>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="text-center py-6 text-muted-foreground text-sm">좌표 데이터 없음</div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 2: FES Trend + Radar ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> FES 추이 (14일)</CardTitle>
              </CardHeader>
              <CardContent>
                {fesTrendData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={fesTrendData}>
                      <defs>
                        <linearGradient id="fesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" stroke="#f59e0b" fill="url(#fesFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">데이터 부족</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">에너지 카테고리 분석</CardTitle>
                <CardDescription className="text-xs">YouTube / Buzz / Music / Album</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="cat" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                    <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ═══ Row 3: Buzz Trend + Source Breakdown ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-purple-500" /> 버즈 점수 추이 (7일)</CardTitle>
              </CardHeader>
              <CardContent>
                {buzzTrend.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={buzzTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">버즈 소스 분포</CardTitle>
                <CardDescription className="text-xs">언급 출처 분석</CardDescription>
              </CardHeader>
              <CardContent>
                {buzzBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {buzzBreakdown.map((s: any) => {
                      const maxW = Math.max(...buzzBreakdown.map((b: any) => b.weighted || 0), 1);
                      const pct = ((s.weighted || 0) / maxW) * 100;
                      return (
                        <div key={s.source} className="flex items-center gap-2">
                          <span className="text-xs w-20 shrink-0 text-muted-foreground">{s.source}</span>
                          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                            <div
                              className="h-full rounded transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: BUZZ_SOURCE_COLORS[s.source] || '#6b7280',
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{s.mentions}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══ Row 4: YouTube Trend ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Youtube className="w-4 h-4 text-red-500" /> YouTube 성과 (7일)</CardTitle>
            </CardHeader>
            <CardContent>
              {ytTrend.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={ytTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="views" stroke="#ef4444" strokeWidth={2} name="Views" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 5: Sentiment Analysis ═══ */}
          <Separator />
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ThumbsUp className="w-5 h-5" /> YouTube 댓글 감성 분석
            {sentimentSnapshot?.collected_at && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                최근: {format(new Date(sentimentSnapshot.collected_at), 'yyyy-MM-dd HH:mm')}
              </span>
            )}
          </h2>
          {sentimentMetrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">댓글 감성 분포</CardTitle>
                  <CardDescription className="text-xs">{sentimentMetrics.videos_analyzed}개 영상의 {sentimentMetrics.total_comments_analyzed}개 댓글 분석</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={sentimentPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {sentimentPie.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4">
                    {sentimentPie.map((d: any) => (
                      <span key={d.name} className="flex items-center gap-1 text-xs">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                        {d.name}: {d.value}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">영상별 감성 분석</CardTitle>
                </CardHeader>
                <CardContent>
                  {sentimentVideos.length > 0 ? (
                    <div className="space-y-3">
                      {sentimentVideos.map((v: any) => (
                        <div key={v.videoId} className="p-3 rounded-lg bg-muted/50">
                          <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium hover:underline flex items-center gap-1">
                            <Youtube className="w-3 h-3 text-red-500" /> {v.title?.slice(0, 50)}{v.title?.length > 50 ? '...' : ''}
                            <ExternalLink className="w-3 h-3 ml-1 opacity-40" />
                          </a>
                          <div className="flex gap-3 mt-1.5 text-xs">
                            <span className="text-emerald-500">👍 {v.sentiment?.positive ?? 0}</span>
                            <span className="text-muted-foreground">😐 {v.sentiment?.neutral ?? 0}</span>
                            <span className="text-red-500">👎 {v.sentiment?.negative ?? 0}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">영상 데이터 없음</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="text-sm">감성 분석 데이터가 없습니다. 상단의 "YT 댓글 분석" 버튼을 클릭하세요.</p>
              </CardContent>
            </Card>
          )}

          {/* ═══ Row 6: Naver News + External Videos ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Naver News */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Newspaper className="w-4 h-4 text-green-500" /> 네이버 뉴스</CardTitle>
                <CardDescription className="text-xs">{naverData?.metrics?.article_count_24h ?? naverData?.metrics?.mention_count ?? 0}건 (24시간)</CardDescription>
              </CardHeader>
              <CardContent>
                {naverArticles.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {naverArticles.slice(0, 8).map((a: any, i: number) => (
                      <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                        className="block p-2 rounded bg-muted/40 hover:bg-muted transition-colors">
                        <p className="text-xs font-medium line-clamp-2">{a.title?.replace(/<[^>]+>/g, '')}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                          {a.description?.replace(/<[^>]+>/g, '')?.slice(0, 80)}
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">최근 기사 없음</div>
                )}
              </CardContent>
            </Card>

            {/* External Videos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Disc3 className="w-4 h-4 text-purple-500" /> 외부 채널 노출</CardTitle>
                <CardDescription className="text-xs">
                  레퍼런스 채널 기준 {extVideoData?.metrics?.total_views ? `${(extVideoData.metrics.total_views / 1e3).toFixed(0)}K 조회` : '데이터 없음'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {extVideos.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {extVideos.slice(0, 6).map((v: any, i: number) => (
                      <a key={i} href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer"
                        className="block p-2 rounded bg-muted/40 hover:bg-muted transition-colors">
                        <p className="text-xs font-medium line-clamp-1">{v.title}</p>
                        <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{v.channelTitle}</span>
                          {v.viewCount && <span>{Number(v.viewCount).toLocaleString()} views</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">외부 노출 없음</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══ Row 7: Fan Intent Summary ═══ */}
          {fanIntents && fanIntents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-500" /> 팬 의도 분석 (7일)</CardTitle>
                <CardDescription className="text-xs">{fanIntents.length}건의 팬 질의 분석</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {Object.entries(intentSentiment).map(([s, count]) => (
                    <div key={s} className="p-2 rounded bg-muted/40 text-center">
                      <p className="text-lg">
                        {s === 'positive' ? '😊' : s === 'negative' ? '😟' : s === 'curious' ? '🤔' : '😐'}
                      </p>
                      <p className="text-sm font-semibold">{count as number}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{s}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {fanIntents.slice(0, 10).map((q: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 text-xs">
                      <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">{q.intent_category}</Badge>
                      <span className="text-muted-foreground line-clamp-1 flex-1">{q.source_query}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(q.created_at), 'MM/dd')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ Row 7.5: Global Fan Reach — 어디서 반응이 일어나고 있는가? ═══ */}
          <Separator />
          <Card className="border-cyan-500/30 bg-gradient-to-r from-cyan-500/5 to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-500" /> 🌍 Global Fan Reach — 어디서 반응이 일어나고 있는가?
                  </CardTitle>
                  <CardDescription className="text-xs">Last.fm 국가별 리스너 데이터 기반</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => geoCollectMutation.mutate()} disabled={geoCollectMutation.isPending}>
                  {geoCollectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                  수집
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {geoLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 로딩 중...
                </div>
              ) : geoFanData && geoFanData.length > 0 ? (
                <div className="space-y-4">
                  {/* World Heatmap Grid */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">🗺️ Interest Heatmap</p>
                    <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
                      {geoFanData.map((g: any) => {
                        const maxListeners = geoFanData[0]?.listeners || 1;
                        const intensity = Math.max(0.15, (g.listeners || 0) / maxListeners);
                        const isTop3 = geoFanData.indexOf(g) < 3;
                        return (
                          <div
                            key={g.country_code}
                            className={`rounded-lg p-2 text-center transition-all cursor-default ${isTop3 ? 'ring-1 ring-cyan-500/50' : ''}`}
                            style={{
                              backgroundColor: `hsla(180, 80%, 50%, ${intensity * 0.6})`,
                            }}
                            title={`${g.country_name}: ${g.listeners?.toLocaleString()} listeners (Rank #${g.rank_position})`}
                          >
                            <p className="text-lg leading-none">{countryFlag(g.country_code)}</p>
                            <p className="text-[9px] font-bold mt-0.5 text-foreground">{g.country_code}</p>
                            <p className="text-[8px] text-muted-foreground">{g.listeners ? (g.listeners >= 1e6 ? (g.listeners / 1e6).toFixed(1) + 'M' : g.listeners >= 1e3 ? (g.listeners / 1e3).toFixed(0) + 'K' : g.listeners) : '-'}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Countries Bar Chart */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">📊 Top Countries by Listeners</p>
                    <div className="space-y-1.5">
                      {geoFanData.slice(0, 10).map((g: any, i: number) => {
                        const maxL = geoFanData[0]?.listeners || 1;
                        const pct = ((g.listeners || 0) / maxL) * 100;
                        return (
                          <div key={g.country_code} className="flex items-center gap-2">
                            <span className="text-sm w-5 text-center shrink-0">{countryFlag(g.country_code)}</span>
                            <span className="text-xs w-14 shrink-0 text-muted-foreground">{g.country_name}</span>
                            <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
                              <div
                                className="h-full rounded transition-all duration-500"
                                style={{
                                  width: `${Math.max(pct, 2)}%`,
                                  background: i < 3 ? 'linear-gradient(90deg, hsl(180, 70%, 40%), hsl(180, 80%, 55%))' : 'hsl(var(--muted-foreground) / 0.3)',
                                }}
                              />
                              <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-medium">
                                #{g.rank_position}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                              {g.listeners?.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div className="flex gap-4 text-xs text-muted-foreground border-t border-border/30 pt-2">
                    <span>총 {geoFanData.length}개국 진입</span>
                    <span>총 리스너: {geoFanData.reduce((s: number, g: any) => s + (g.listeners || 0), 0).toLocaleString()}</span>
                    {geoFanData[0] && <span>최다: {countryFlag(geoFanData[0].country_code)} {geoFanData[0].country_name}</span>}
                    {geoFanData[0]?.collected_at && <span className="ml-auto">수집: {format(new Date(geoFanData[0].collected_at), 'MM/dd HH:mm')}</span>}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>지역별 데이터가 없습니다. "수집" 버튼을 클릭하세요.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 8: Competitor Comparison ═══ */}
          <Separator />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-cyan-500" /> 경쟁 아티스트 비교
              </CardTitle>
              <CardDescription className="text-xs">주요 지표를 나란히 비교합니다</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-muted-foreground">비교 대상:</span>
                <Select value={compareArtistId} onValueChange={setCompareArtistId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="선택..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— 선택 안함 —</SelectItem>
                    {artists?.filter((a: any) => a.wiki_entry_id !== selectedArtistId).map((a: any) => (
                      <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                        {a.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {comparisonData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey={selectedArtist?.display_name ?? 'A'} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={compareArtistName} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 justify-center text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> {selectedArtist?.display_name}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> {compareArtistName}</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {compareArtistId === 'none' ? '비교할 아티스트를 선택하세요' : '비교 데이터 로딩 중...'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 9: Milestone Timeline ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> 마일스톤 타임라인
              </CardTitle>
              <CardDescription className="text-xs">주요 성과 및 기록</CardDescription>
            </CardHeader>
            <CardContent>
              {milestones && milestones.length > 0 ? (
                <div className="relative pl-6 space-y-3">
                  <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                  {milestones.slice(0, 12).map((m: any, i: number) => (
                    <div key={m.id || i} className="relative flex items-start gap-3">
                      <div className="absolute -left-4 top-0.5 w-3 h-3 rounded-full bg-background border-2 border-amber-500 z-10" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{milestoneIcon(m.milestone_type)}</span>
                          <span className="text-xs font-medium">{m.milestone_type?.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {m.created_at ? format(new Date(m.created_at), 'yyyy-MM-dd') : ''}
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.description}</p>
                        )}
                        {m.value != null && (
                          <Badge variant="secondary" className="text-[9px] mt-1">Score: {Math.round(m.value)}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">기록된 마일스톤이 없습니다</div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 9.5: Competitor Schedule Monitor ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" /> 경쟁 아티스트 일정 모니터링
              </CardTitle>
              <CardDescription className="text-xs">내 아티스트와 경쟁사의 예정 이벤트를 비교합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Competitor selector (multi) */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground shrink-0">비교 대상:</span>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (v && v !== selectedArtistId && !scheduleCompareIds.includes(v)) {
                      setScheduleCompareIds(prev => [...prev, v].slice(0, 4));
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="아티스트 추가..." />
                  </SelectTrigger>
                  <SelectContent>
                    {artists?.filter((a: any) => a.wiki_entry_id !== selectedArtistId && !scheduleCompareIds.includes(a.wiki_entry_id)).map((a: any) => (
                      <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                        {a.name_ko || a.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {scheduleCompareIds.map(id => {
                  const a = artists?.find((x: any) => x.wiki_entry_id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => setScheduleCompareIds(prev => prev.filter(x => x !== id))}
                    >
                      {a?.name_ko || a?.display_name || id.slice(0, 8)} ✕
                    </Badge>
                  );
                })}
              </div>

              {/* Schedule timeline */}
              {(() => {
                const events = competitorSchedules ?? [];
                if (events.length === 0) {
                  return <div className="text-center py-6 text-muted-foreground text-sm">예정된 일정이 없습니다</div>;
                }
                const eventTypeEmoji: Record<string, string> = {
                  release: '💿', celebration: '🎉', broadcast: '📡', purchase: '🛒',
                  event: '🎪', sns: '📱', others: '📌',
                };
                const grouped = events.reduce((acc: Record<string, any[]>, ev: any) => {
                  (acc[ev.event_date] ??= []).push(ev);
                  return acc;
                }, {});

                return (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([date, dayEvents]) => (
                      <div key={date}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">{date}</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="grid gap-1.5 pl-2">
                          {(dayEvents as any[]).map((ev: any) => {
                            const isOwn = ev.wiki_entry_id === selectedArtistId;
                            const artistInfo = artists?.find((a: any) => a.wiki_entry_id === ev.wiki_entry_id);
                            const artistLabel = artistInfo?.name_ko || artistInfo?.display_name || '—';
                            return (
                              <div key={ev.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border ${
                                isOwn ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
                              }`}>
                                <span className="text-sm">{eventTypeEmoji[ev.event_type] ?? '📌'}</span>
                                <span className={`font-medium shrink-0 ${isOwn ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {artistLabel}
                                </span>
                                <span className="truncate">{ev.title}</span>
                                {isOwn && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">MY</Badge>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* ═══ Row 9.7: Event × FES Correlation ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> 이벤트 × FES 점수 상관 분석
              </CardTitle>
              <CardDescription className="text-xs">컴백/이벤트 시점과 FES 변동을 시간축으로 연계합니다 (최근 30일)</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const trend = energyData?.slice().reverse().map((e: any) => ({
                  date: e.snapshot_at?.slice(0, 10) ?? '',
                  dateLabel: e.snapshot_at?.slice(5, 10) ?? '',
                  score: Math.round(e.energy_score ?? 0),
                })) ?? [];
                const events = correlationEvents ?? [];
                const eventTypeEmoji: Record<string, string> = {
                  release: '💿', celebration: '🎉', broadcast: '📡', purchase: '🛒',
                  event: '🎪', sns: '📱', others: '📌',
                };

                const eventDates = new Set(events.map((e: any) => e.event_date));
                const merged = trend.map((t: any) => ({
                  ...t,
                  hasEvent: eventDates.has(t.date),
                  eventScore: eventDates.has(t.date) ? t.score : null,
                }));

                if (trend.length === 0) {
                  return <div className="text-center py-6 text-muted-foreground text-sm">에너지 데이터가 부족합니다</div>;
                }

                const avgAll = trend.reduce((s: number, t: any) => s + t.score, 0) / trend.length;
                const eventDays = merged.filter((m: any) => m.hasEvent);
                const avgEvent = eventDays.length > 0
                  ? eventDays.reduce((s: number, d: any) => s + d.score, 0) / eventDays.length
                  : null;

                let maxSpike: { date: string; delta: number; event: string } | null = null;
                events.forEach((ev: any) => {
                  const idx = trend.findIndex((t: any) => t.date === ev.event_date);
                  if (idx > 0) {
                    const delta = trend[idx].score - trend[idx - 1].score;
                    if (!maxSpike || Math.abs(delta) > Math.abs(maxSpike.delta)) {
                      maxSpike = { date: ev.event_date, delta, event: ev.title };
                    }
                  }
                });

                return (
                  <div className="space-y-3">
                    <ResponsiveContainer width="100%" height={260}>
                      <ComposedChart data={merged}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={['dataMin - 20', 'dataMax + 20']} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload;
                            const dayEvents = events.filter((e: any) => e.event_date === d.date);
                            return (
                              <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
                                <p className="font-mono font-bold">{d.date}</p>
                                <p>FES: <span className="font-bold">{d.score}</span></p>
                                {dayEvents.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                                    {dayEvents.map((e: any, i: number) => (
                                      <p key={i}>{eventTypeEmoji[e.event_type] ?? '📌'} {e.title}</p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
                        {events.map((ev: any, i: number) => (
                          <ReferenceLine
                            key={i}
                            x={ev.event_date.slice(5, 10)}
                            stroke="#f59e0b"
                            strokeDasharray="4 2"
                            strokeWidth={1.5}
                            label={{ value: eventTypeEmoji[ev.event_type] ?? '📌', position: 'top', fontSize: 14 }}
                          />
                        ))}
                        <Scatter dataKey="eventScore" fill="#f59e0b" r={5} />
                      </ComposedChart>
                    </ResponsiveContainer>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground">평균 FES (전체)</p>
                        <p className="text-lg font-bold">{Math.round(avgAll)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground">평균 FES (이벤트일)</p>
                        <p className="text-lg font-bold">
                          {avgEvent != null ? Math.round(avgEvent) : '—'}
                          {avgEvent != null && (
                            <span className={`text-xs ml-1 ${avgEvent > avgAll ? 'text-emerald-500' : 'text-red-500'}`}>
                              ({avgEvent > avgAll ? '+' : ''}{Math.round(avgEvent - avgAll)})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground">최대 이벤트 영향</p>
                        {maxSpike ? (
                          <>
                            <p className={`text-lg font-bold ${maxSpike.delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {maxSpike.delta >= 0 ? '+' : ''}{Math.round(maxSpike.delta)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">{maxSpike.event}</p>
                          </>
                        ) : (
                          <p className="text-lg font-bold">—</p>
                        )}
                      </div>
                    </div>

                    {events.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium">이벤트 목록:</span>
                        {events.slice(0, 8).map((ev: any, i: number) => (
                          <span key={i} className="bg-muted px-1.5 py-0.5 rounded">
                            {ev.event_date.slice(5)} {eventTypeEmoji[ev.event_type] ?? '📌'} {ev.title}
                          </span>
                        ))}
                        {events.length > 8 && <span>+{events.length - 8}건</span>}
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* ═══ Row 10: AI Strategic Insights ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-500" /> AI 전략 인사이트
                  </CardTitle>
                  <CardDescription className="text-xs">수집된 전체 데이터 기반 AI 분석</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={generateInsight} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  생성
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {aiLoading && (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                  <p className="text-sm text-muted-foreground">전체 데이터 분석 중...</p>
                </div>
              )}
              {!aiLoading && aiInsight && (() => {
                let items: any[] = [];
                try { items = JSON.parse(aiInsight); } catch { items = []; }
                const priorityColors: Record<string, string> = {
                  high: 'border-l-red-500 bg-red-500/5',
                  medium: 'border-l-amber-500 bg-amber-500/5',
                  low: 'border-l-emerald-500 bg-emerald-500/5',
                };
                const priorityLabels: Record<string, string> = { high: '긴급', medium: '권장', low: '참고' };
                if (items.length === 0) {
                  return <div className="text-sm whitespace-pre-wrap bg-muted/40 rounded-lg p-4">{aiInsight}</div>;
                }
                return (
                  <div className="grid gap-3">
                    {items.map((item: any, i: number) => (
                      <div key={i} className={`border-l-4 rounded-lg p-3 ${priorityColors[item.priority] || priorityColors.medium}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{item.emoji}</span>
                          <span className="font-semibold text-sm">{item.title}</span>
                          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            item.priority === 'high' ? 'bg-red-500/10 text-red-600' :
                            item.priority === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                            'bg-emerald-500/10 text-emerald-600'
                          }`}>{priorityLabels[item.priority] || '참고'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {!aiLoading && !aiInsight && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  "생성" 버튼을 클릭하면 AI 기반 전략 추천을 받을 수 있습니다
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />
          <p className="text-center text-xs text-muted-foreground pb-4">
            K-Trendz 에이전시 인텔리전스 — 샘플 대시보드 미리보기
          </p>
        </>
      )}
    </div>
  );
};

export default AdminAgencySample;
