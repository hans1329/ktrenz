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
  Trophy, Calendar, Sparkles, Brain,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area,
} from 'recharts';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SENTIMENT_COLORS = { positive: '#10b981', neutral: '#6b7280', negative: '#ef4444' };
const CATEGORY_COLORS: Record<string, string> = {
  youtube: '#ef4444', buzz: '#8b5cf6', music: '#3b82f6', album: '#f59e0b', fan: '#ec4899',
};
const BUZZ_SOURCE_COLORS: Record<string, string> = {
  x_twitter: '#1DA1F2', news: '#f59e0b', reddit: '#FF4500', tiktok: '#00f2ea',
  yt_comments: '#ef4444', naver: '#03C75A', ext_videos: '#8b5cf6',
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

  // ── Energy Score ──
  const { data: energyData } = useQuery({
    queryKey: ['agency-energy', selectedArtistId],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_energy_snapshots_v2' as any)
        .select('*')
        .eq('wiki_entry_id', selectedArtistId)
        .order('snapshot_date', { ascending: false })
        .limit(14);
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

  // ── Competitor scores ──
  const { data: compareScoreData } = useQuery({
    queryKey: ['agency-compare-scores', compareArtistId],
    queryFn: async () => {
      if (compareArtistId === 'none') return null;
      const [scoresRes, energyRes] = await Promise.all([
        supabase.from('v3_scores_v2' as any).select('*').eq('wiki_entry_id', compareArtistId).maybeSingle(),
        supabase.from('v3_energy_snapshots_v2' as any).select('*').eq('wiki_entry_id', compareArtistId).order('snapshot_date', { ascending: false }).limit(1),
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
    { cat: 'YouTube', value: latestEnergy?.yt_velocity != null ? Math.round((latestEnergy.yt_velocity * 0.6 + (latestEnergy.yt_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Buzz', value: latestEnergy?.buzz_velocity != null ? Math.round((latestEnergy.buzz_velocity * 0.6 + (latestEnergy.buzz_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Music', value: latestEnergy?.music_velocity != null ? Math.round((latestEnergy.music_velocity * 0.6 + (latestEnergy.music_intensity ?? 0) * 0.4) * 100) : 0 },
    { cat: 'Album', value: latestEnergy?.album_velocity != null ? Math.round((latestEnergy.album_velocity * 0.6 + (latestEnergy.album_intensity ?? 0) * 0.4) * 100) : 0 },
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
    date: e.snapshot_date?.slice(5) ?? '',
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

      const { data, error } = await supabase.functions.invoke('ktrenz-fan-agent', {
        body: {
          message: `You are an entertainment agency analyst. Based on the following K-pop artist data, provide a concise strategic insight report (3-5 bullet points) in English. Focus on actionable recommendations for the agency.

Artist: ${context.artist}
- FES Score: ${context.fesScore} (${context.fesDelta >= 0 ? '+' : ''}${context.fesDelta} vs yesterday)
- Ranking: #${context.rank} of ${context.totalArtists}
- Buzz Score: ${context.buzzScore} (${context.buzzMentions} mentions)
- YouTube Subscribers: ${context.ytSubscribers ? (context.ytSubscribers / 1e6).toFixed(2) + 'M' : 'N/A'}
- Naver News (24h): ${context.naverArticles ?? 0} articles
- Fan Sentiment: ${context.sentimentLabel ?? 'unknown'} (score: ${context.sentimentScore ?? 'N/A'})
- Fan Queries (7d): ${context.fanIntentCount} queries, top categories: ${context.topIntentCategories.join(', ')}
- Recent Milestones: ${context.recentMilestones?.join(', ') || 'none'}

Provide strategic insights and action items for the agency managing this artist.`,
          skipSave: true,
        },
      });
      if (error) throw error;
      setAiInsight(data?.reply || data?.message || 'No insight generated.');
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
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3 text-amber-500" /> FES Score</p>
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
                <p className="text-[11px] text-muted-foreground">Ranking</p>
                <p className="text-2xl font-bold mt-1">#{rankingData?.rank ?? '-'}</p>
                <p className="text-[11px] text-muted-foreground">of {rankingData?.total ?? '-'}</p>
              </CardContent>
            </Card>
            {/* Buzz */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3 text-purple-500" /> Buzz Score</p>
                <p className="text-2xl font-bold mt-1">{scoreData?.buzz_score?.toLocaleString() ?? '-'}</p>
                <p className="text-[11px] text-muted-foreground">{latestBuzz?.total_mentions ?? 0} mentions</p>
              </CardContent>
            </Card>
            {/* YouTube */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Youtube className="w-3 h-3 text-red-500" /> YouTube</p>
                <p className="text-2xl font-bold mt-1">{latestYt?.subscriberCount ? (latestYt.subscriberCount / 1e6).toFixed(2) + 'M' : '-'}</p>
                <p className="text-[11px] text-muted-foreground">subscribers</p>
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
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 5: Sentiment Analysis ═══ */}
          <Separator />
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ThumbsUp className="w-5 h-5" /> YouTube Comment Sentiment
            {sentimentSnapshot?.collected_at && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                Last: {format(new Date(sentimentSnapshot.collected_at), 'yyyy-MM-dd HH:mm')}
              </span>
            )}
          </h2>
          {sentimentMetrics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Comment Sentiment Distribution</CardTitle>
                  <CardDescription className="text-xs">{sentimentMetrics.total_comments_analyzed} comments from {sentimentMetrics.videos_analyzed} videos</CardDescription>
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
                  <CardTitle className="text-sm">Sentiment by Video</CardTitle>
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
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No video data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p className="text-sm">No sentiment data yet. Click "Analyze YT Comments" above.</p>
              </CardContent>
            </Card>
          )}

          {/* ═══ Row 6: Naver News + External Videos ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Naver News */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Newspaper className="w-4 h-4 text-green-500" /> Naver News</CardTitle>
                <CardDescription className="text-xs">{naverData?.metrics?.article_count_24h ?? naverData?.metrics?.mention_count ?? 0} articles (24h)</CardDescription>
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
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No recent articles</div>
                )}
              </CardContent>
            </Card>

            {/* External Videos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Disc3 className="w-4 h-4 text-purple-500" /> External Channel Appearances</CardTitle>
                <CardDescription className="text-xs">
                  {extVideoData?.metrics?.total_views ? `${(extVideoData.metrics.total_views / 1e3).toFixed(0)}K views` : 'No data'} across reference channels
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
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No external appearances</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══ Row 7: Fan Intent Summary ═══ */}
          {fanIntents && fanIntents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-500" /> Fan Intent Snapshot (7 days)</CardTitle>
                <CardDescription className="text-xs">{fanIntents.length} fan queries analyzed</CardDescription>
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

          {/* ═══ Row 8: Competitor Comparison ═══ */}
          <Separator />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-cyan-500" /> Competitor Comparison
              </CardTitle>
              <CardDescription className="text-xs">Compare key metrics side-by-side</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-muted-foreground">Compare with:</span>
                <Select value={compareArtistId} onValueChange={setCompareArtistId}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
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
                  {compareArtistId === 'none' ? 'Select a competitor to compare' : 'Loading comparison data...'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 9: Milestone Timeline ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Milestone Timeline
              </CardTitle>
              <CardDescription className="text-xs">Key achievements and records</CardDescription>
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
                <div className="text-center py-8 text-muted-foreground text-sm">No milestones recorded yet</div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Row 10: AI Strategic Insights ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-500" /> AI Strategic Insights
                  </CardTitle>
                  <CardDescription className="text-xs">GPT-powered analysis based on all collected data</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={generateInsight} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Generate
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {aiLoading && (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                  <p className="text-sm text-muted-foreground">Analyzing all data points...</p>
                </div>
              )}
              {!aiLoading && aiInsight && (
                <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap bg-muted/40 rounded-lg p-4">
                  {aiInsight}
                </div>
              )}
              {!aiLoading && !aiInsight && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Click "Generate" to get AI-powered strategic recommendations
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />
          <p className="text-center text-xs text-muted-foreground pb-4">
            K-Trendz Agency Intelligence — Sample Dashboard Preview
          </p>
        </>
      )}
    </div>
  );
};

export default AdminAgencySample;
