import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Youtube, ThumbsUp, ThumbsDown, Minus, RefreshCw, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

const SENTIMENT_COLORS = { positive: '#10b981', neutral: '#6b7280', negative: '#ef4444' };

const AdminAgencySample = () => {
  const [selectedArtistId, setSelectedArtistId] = useState<string>('');

  // Fetch all artists with YouTube channel
  const { data: artists } = useQuery({
    queryKey: ['agency-artists'],
    queryFn: async () => {
      const { data } = await supabase
        .from('v3_artist_tiers')
        .select('wiki_entry_id, display_name, name_ko, youtube_channel_id')
        .not('youtube_channel_id', 'is', null)
        .order('display_name');
      return (data ?? []).filter((a: any) => a.youtube_channel_id);
    },
  });

  // Fetch latest sentiment snapshot
  const { data: latestSnapshot, refetch: refetchSnapshot } = useQuery({
    queryKey: ['yt-sentiment-snapshot', selectedArtistId],
    queryFn: async () => {
      if (!selectedArtistId) return null;
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

  // Run sentiment analysis
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ktrenz-yt-sentiment', {
        body: { wikiEntryId: selectedArtistId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Analysis failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Sentiment analysis complete: ${data.overallLabel} (${data.overallScore})`);
      refetchSnapshot();
    },
    onError: (err: any) => {
      toast.error(`Analysis failed: ${err.message}`);
    },
  });

  const selectedArtist = artists?.find((a: any) => a.wiki_entry_id === selectedArtistId);
  const metrics = latestSnapshot?.metrics as any;
  const rawResponse = latestSnapshot?.raw_response as any;

  const pieData = metrics ? [
    { name: 'Positive', value: metrics.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: metrics.neutral, color: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: metrics.negative, color: SENTIMENT_COLORS.negative },
  ].filter(d => d.value > 0) : [];

  const videoBarData = rawResponse?.videos?.map((v: any) => ({
    title: v.title?.slice(0, 25) + (v.title?.length > 25 ? '...' : ''),
    positive: v.sentiment?.positive || 0,
    negative: v.sentiment?.negative || 0,
    neutral: v.sentiment?.neutral || 0,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agency Dashboard (Sample)</h1>
          <p className="text-sm text-muted-foreground">YouTube Comment Sentiment Analysis — Test Mode</p>
        </div>
        <Badge variant="outline" className="text-xs">🧪 Beta</Badge>
      </div>

      {/* Artist Selector */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground shrink-0">Artist:</span>
          <Select value={selectedArtistId} onValueChange={setSelectedArtistId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select an artist..." />
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
            <Button
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Analyze Comments
            </Button>
          )}
        </CardContent>
      </Card>

      {!selectedArtistId && (
        <div className="text-center py-20 text-muted-foreground">
          <Youtube className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select an artist above to view YouTube comment sentiment analysis</p>
        </div>
      )}

      {selectedArtistId && !metrics && !analyzeMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sentiment data yet. Click "Analyze Comments" to start.</p>
        </div>
      )}

      {analyzeMutation.isPending && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">Fetching and analyzing YouTube comments...</p>
          <p className="text-xs text-muted-foreground mt-1">This uses ~6 YouTube API units</p>
        </div>
      )}

      {metrics && (
        <>
          {/* Overview KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Overall Score</p>
                <p className="text-3xl font-bold">{metrics.overall_score}</p>
                <Badge className={`mt-1 text-xs ${
                  metrics.overall_label === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                  metrics.overall_label === 'negative' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {metrics.overall_label}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3 text-emerald-500" /> Positive
                </p>
                <p className="text-3xl font-bold text-emerald-600">{metrics.positive}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Minus className="w-3 h-3" /> Neutral
                </p>
                <p className="text-3xl font-bold">{metrics.neutral}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3 text-red-500" /> Negative
                </p>
                <p className="text-3xl font-bold text-red-600">{metrics.negative}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sentiment Distribution</CardTitle>
                <CardDescription className="text-xs">
                  {metrics.total_comments_analyzed} comments analyzed across {metrics.videos_analyzed} videos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
                <div className="flex justify-center gap-4 mt-2">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}: {d.value}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Per-video stacked bar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sentiment by Video</CardTitle>
                <CardDescription className="text-xs">Most recent videos analyzed</CardDescription>
              </CardHeader>
              <CardContent>
                {videoBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={videoBarData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="title" type="category" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="positive" stackId="a" fill={SENTIMENT_COLORS.positive} />
                      <Bar dataKey="neutral" stackId="a" fill={SENTIMENT_COLORS.neutral} />
                      <Bar dataKey="negative" stackId="a" fill={SENTIMENT_COLORS.negative} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Comments Table */}
          {rawResponse?.videos?.map((video: any) => (
            <Card key={video.videoId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  {video.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Watch on YouTube ↗
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* We don't store individual comments in snapshot raw_response to save space.
                    Show summary instead. */}
                <div className="px-4 pb-4 flex items-center gap-4 text-sm">
                  <span className="text-emerald-500 font-semibold">
                    ✓ {video.sentiment?.positive || 0} positive
                  </span>
                  <span className="text-muted-foreground">
                    {video.sentiment?.neutral || 0} neutral
                  </span>
                  <span className="text-red-500 font-semibold">
                    ✗ {video.sentiment?.negative || 0} negative
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Last analyzed */}
          {latestSnapshot?.collected_at && (
            <p className="text-xs text-muted-foreground text-center">
              Last analyzed: {new Date(latestSnapshot.collected_at).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminAgencySample;
