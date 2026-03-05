import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, Users, MessageSquare, Brain, Sparkles, ArrowRight, Lock, Eye, GitCompareArrows, Clock, AlertTriangle, Lightbulb } from 'lucide-react';
import { format, subDays } from 'date-fns';
import logoImage from '@/assets/k-trenz-logo.webp';

const INTENT_LABELS: Record<string, string> = {
  news: '📰 News & Updates',
  schedule: '📅 Schedule & Events',
  streaming: '🎧 Streaming Strategy',
  music_performance: '🎵 Music Performance',
  sns: '📱 Social Media',
  comparison: '⚔️ Artist Comparison',
  fan_activity: '💪 Fan Activities',
  general: '💬 General',
};

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#f97316', '#6b7280'];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
  curious: '#8b5cf6',
};

const AgencyDashboardSample = () => {
  const [period, setPeriod] = useState('7');
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all');
  const [compareArtistId, setCompareArtistId] = useState<string>('none');

  // Fetch Tier 1 artists for dropdown
  const { data: tier1Artists } = useQuery({
    queryKey: ['agency-tier1-artists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v3_artist_tiers')
        .select('wiki_entry_id, display_name, name_ko')
        .eq('tier', 1)
        .order('display_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch summaries filtered by selected artist
  const { data: summaries } = useQuery({
    queryKey: ['agency-summaries', period, selectedArtistId],
    queryFn: async () => {
      const fromDate = format(subDays(new Date(), parseInt(period)), 'yyyy-MM-dd');
      let query = supabase
        .from('ktrenz_agent_intent_summaries')
        .select('*')
        .gte('summary_date', fromDate)
        .order('summary_date', { ascending: true });

      if (selectedArtistId !== 'all') {
        query = query.eq('wiki_entry_id', selectedArtistId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch raw intents for the selected artist (for richer data)
  const { data: rawIntents } = useQuery({
    queryKey: ['agency-raw-intents', period, selectedArtistId],
    queryFn: async () => {
      const fromDate = new Date(Date.now() - parseInt(period) * 86400000).toISOString();
      let query = supabase
        .from('ktrenz_agent_intents')
        .select('*')
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(200);

      if (selectedArtistId !== 'all') {
        query = query.eq('wiki_entry_id', selectedArtistId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedArtistName = selectedArtistId === 'all'
    ? 'All Tier 1 Artists'
    : tier1Artists?.find(a => a.wiki_entry_id === selectedArtistId)?.display_name ?? 'Unknown';

  // Aggregate by category
  const categoryStats = summaries?.reduce((acc, s) => {
    acc[s.intent_category] = (acc[s.intent_category] || 0) + (s.query_count || 0);
    return acc;
  }, {} as Record<string, number>) ?? {};

  const categoryChartData = Object.entries(categoryStats)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({
      name: INTENT_LABELS[cat]?.replace(/^.{2}\s/, '') || cat,
      fullName: INTENT_LABELS[cat] || cat,
      count,
    }));

  const pieData = categoryChartData.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] }));

  // Total stats (from raw intents for accuracy)
  const totalQueries = rawIntents?.length ?? 0;
  const uniqueUserIds = new Set(rawIntents?.map(i => i.user_id));
  const totalUniqueUsers = uniqueUserIds.size;

  // Sub-topic breakdown
  const subTopicStats = rawIntents?.reduce((acc, i) => {
    const key = i.sub_topic || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};
  const topSubTopics = Object.entries(subTopicStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Sentiment aggregation
  const sentimentTotals: Record<string, number> = { positive: 0, neutral: 0, negative: 0, curious: 0 };
  rawIntents?.forEach(i => {
    const s = i.sentiment || 'neutral';
    sentimentTotals[s] = (sentimentTotals[s] || 0) + 1;
  });
  const sentimentChartData = Object.entries(sentimentTotals)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: SENTIMENT_COLORS[name] || '#6b7280' }));

  // Daily trend
  const dailyTrend = rawIntents?.reduce((acc, i) => {
    const day = i.created_at.slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};
  const dailyChartData = Object.entries(dailyTrend)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date: date.slice(5), count }));

  // Top trending from summaries
  const topTrending = [...(summaries ?? [])]
    .sort((a, b) => Number(b.trending_score ?? 0) - Number(a.trending_score ?? 0))
    .slice(0, 5);

  // Recent queries
  const recentQueries = rawIntents?.slice(0, 10) ?? [];

  // ── Comparison artist data ──
  const { data: compareIntents } = useQuery({
    queryKey: ['agency-compare-intents', period, compareArtistId],
    queryFn: async () => {
      if (compareArtistId === 'none') return [];
      const fromDate = new Date(Date.now() - parseInt(period) * 86400000).toISOString();
      const { data, error } = await supabase
        .from('ktrenz_agent_intents')
        .select('*')
        .eq('wiki_entry_id', compareArtistId)
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: compareArtistId !== 'none',
  });

  const compareArtistName = compareArtistId === 'none'
    ? ''
    : tier1Artists?.find(a => a.wiki_entry_id === compareArtistId)?.display_name ?? 'Unknown';

  // Build comparison chart data
  const comparisonChartData = (() => {
    if (compareArtistId === 'none' || selectedArtistId === 'all') return [];
    const allCats = Object.keys(INTENT_LABELS);
    const aCats = rawIntents?.reduce((acc, i) => { acc[i.intent_category] = (acc[i.intent_category] || 0) + 1; return acc; }, {} as Record<string, number>) ?? {};
    const bCats = compareIntents?.reduce((acc, i) => { acc[i.intent_category] = (acc[i.intent_category] || 0) + 1; return acc; }, {} as Record<string, number>) ?? {};
    return allCats.map(cat => ({
      category: INTENT_LABELS[cat]?.replace(/^.{2}\s/, '') || cat,
      [selectedArtistName]: aCats[cat] || 0,
      [compareArtistName]: bCats[cat] || 0,
    })).filter(d => (d[selectedArtistName] as number) > 0 || (d[compareArtistName] as number) > 0);
  })();

  // ── Hourly Heatmap ──
  const hourlyData = (() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    rawIntents?.forEach(intent => {
      const h = new Date(intent.created_at).getHours();
      hours[h].count++;
    });
    return hours;
  })();
  const maxHourCount = Math.max(...hourlyData.map(h => h.count), 1);

  // ── Gap Analysis ──
  const allCategories = Object.keys(INTENT_LABELS);
  const activeCategories = new Set(rawIntents?.map(i => i.intent_category) ?? []);
  const gapCategories = allCategories.filter(c => !activeCategories.has(c));
  const lowCategories = Object.entries(categoryStats)
    .filter(([, count]) => count <= 2)
    .map(([cat]) => cat);

  // ── AI Action Items (rule-based from intent patterns) ──
  const actionItems = (() => {
    const items: { icon: string; priority: 'high' | 'medium' | 'low'; title: string; description: string }[] = [];

    // High negative sentiment
    const negRatio = sentimentTotals.negative / Math.max(totalQueries, 1);
    if (negRatio > 0.2) {
      items.push({ icon: '🚨', priority: 'high', title: 'Rising Negative Sentiment', description: `${(negRatio * 100).toFixed(0)}% of fan queries show negative sentiment. Investigate recent controversies or unmet expectations.` });
    }

    // High curiosity = information gap
    const curiousRatio = sentimentTotals.curious / Math.max(totalQueries, 1);
    if (curiousRatio > 0.4) {
      items.push({ icon: '💡', priority: 'high', title: 'Fans Want More Information', description: `${(curiousRatio * 100).toFixed(0)}% of queries are curiosity-driven. Consider releasing official updates or teasers.` });
    }

    // Schedule is top category
    if (categoryStats['schedule'] && categoryStats['schedule'] === Math.max(...Object.values(categoryStats))) {
      items.push({ icon: '📅', priority: 'high', title: 'High Schedule Demand', description: 'Schedule-related queries dominate. Fans are eagerly awaiting event/comeback announcements.' });
    }

    // Streaming interest
    if (categoryStats['streaming'] && categoryStats['streaming'] >= 3) {
      items.push({ icon: '🎧', priority: 'medium', title: 'Streaming Campaign Opportunity', description: `${categoryStats['streaming']} streaming-related queries detected. Coordinate a fan streaming campaign.` });
    }

    // Gap categories
    if (gapCategories.length >= 3) {
      items.push({ icon: '📊', priority: 'medium', title: 'Untapped Content Areas', description: `No fan queries in: ${gapCategories.map(c => INTENT_LABELS[c]?.replace(/^.{2}\s/, '') || c).join(', ')}. Create content to fill these gaps.` });
    }

    // Peak hour insight
    const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, hourlyData[0]);
    if (peakHour.count >= 3) {
      items.push({ icon: '⏰', priority: 'low', title: `Peak Fan Activity: ${peakHour.hour}:00`, description: `Most fan queries happen at ${peakHour.hour}:00. Schedule content drops and announcements around this time.` });
    }

    // Sub-topic trend
    if (topSubTopics.length > 0) {
      const topTopic = topSubTopics[0];
      items.push({ icon: '🔥', priority: 'medium', title: `Trending Topic: ${topTopic[0]}`, description: `"${topTopic[0]}" is the most discussed sub-topic with ${topTopic[1]} mentions. Leverage this in marketing.` });
    }

    if (items.length === 0) {
      items.push({ icon: '✅', priority: 'low', title: 'All Looking Good', description: 'No urgent action items detected. Keep monitoring fan sentiment and engagement.' });
    }

    return items.sort((a, b) => { const p = { high: 0, medium: 1, low: 2 }; return p[a.priority] - p[b.priority]; });
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#0f0f2e] to-[#1a0a2e] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="K-Trendz" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-bold text-white">Agency Intelligence Dashboard</h1>
              <p className="text-xs text-white/50">Fan Intent Analytics — Powered by K-Trendz AI</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <Eye className="w-3 h-3 mr-1" /> Sample Preview
            </Badge>
          </div>
        </div>
      </div>

      {/* Artist Selector Bar */}
      <div className="border-b border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-xs text-white/40 shrink-0">Artist:</span>
          <Select value={selectedArtistId} onValueChange={setSelectedArtistId}>
            <SelectTrigger className="w-64 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select artist..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tier 1 Artists</SelectItem>
              {tier1Artists?.map(a => (
                <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                  {a.display_name} {a.name_ko ? `(${a.name_ko})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Today</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          {selectedArtistId !== 'all' && (
            <span className="text-sm font-semibold text-purple-300 ml-auto">
              📊 {selectedArtistName}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { icon: MessageSquare, label: 'Total Fan Queries', value: totalQueries, color: 'text-blue-400' },
            { icon: Users, label: 'Active Fans', value: totalUniqueUsers, color: 'text-emerald-400' },
            { icon: Brain, label: 'Intent Categories', value: Object.keys(categoryStats).length, color: 'text-purple-400' },
            { icon: TrendingUp, label: 'Sub-topics Found', value: Object.keys(subTopicStats).length, color: 'text-yellow-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-white/50 text-xs mb-2">
                  <Icon className={`w-4 h-4 ${color}`} /> {label}
                </div>
                <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-6">
          {/* Intent Distribution Pie */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/80">Fan Interest Distribution</CardTitle>
              <CardDescription className="text-xs text-white/40">What fans are asking about</CardDescription>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-white/30 text-sm">No data yet</div>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs text-white/60">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Daily Trend Line */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/80">Fan Engagement Trend</CardTitle>
              <CardDescription className="text-xs text-white/40">Daily query volume</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
                    <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-white/30 text-sm">No data yet</div>
              )}
            </CardContent>
          </Card>

          {/* Sentiment Breakdown */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/80">Fan Sentiment</CardTitle>
              <CardDescription className="text-xs text-white/40">How fans feel when asking</CardDescription>
            </CardHeader>
            <CardContent>
              {sentimentChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sentimentChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} width={60} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {sentimentChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-white/30 text-sm">No data yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sub-topics + Category Bar side by side */}
        <div className="grid grid-cols-2 gap-6">
          {/* Sub-topic Breakdown */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/80">Top Sub-topics</CardTitle>
              <CardDescription className="text-xs text-white/40">Specific interests fans have</CardDescription>
            </CardHeader>
            <CardContent>
              {topSubTopics.length > 0 ? (
                <div className="space-y-2">
                  {topSubTopics.map(([topic, count], i) => {
                    const maxCount = topSubTopics[0][1] as number;
                    const pct = (count as number) / (maxCount as number) * 100;
                    return (
                      <div key={topic} className="flex items-center gap-3">
                        <span className="text-xs text-white/30 w-4">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-white/70">{topic}</span>
                            <span className="text-xs text-white/40">{count}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[180px] text-white/30 text-sm">No data yet</div>
              )}
            </CardContent>
          </Card>

          {/* Category Bar Chart */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/80">Query Volume by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-white/30 text-sm">No data yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Queries + Trending */}
        <div className="grid grid-cols-2 gap-6">
          {/* Recent Queries */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm text-white/80 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" /> Recent Fan Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentQueries.length > 0 ? (
                <div className="space-y-2">
                  {recentQueries.map((q) => (
                    <div key={q.id} className="p-2.5 rounded-lg bg-white/5 flex items-start gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5 border-white/10 text-white/50">
                        {q.intent_category}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/70 truncate">{q.source_query}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {q.sub_topic && <span className="text-purple-300">{q.sub_topic}</span>}
                          {' · '}
                          {format(new Date(q.created_at), 'MM/dd HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-white/30 text-sm py-8">No queries yet</div>
              )}
            </CardContent>
          </Card>

          {/* Top Trending Topics */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-sm text-white/80 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" /> Trending Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topTrending.length > 0 ? (
                <div className="space-y-3">
                  {topTrending.map((t, i) => {
                    const samples = (t.sample_queries as string[] | null) ?? [];
                    return (
                      <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                        <span className="text-lg font-bold text-white/30 w-6">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                              {INTENT_LABELS[t.intent_category]?.slice(0, 2)} {t.intent_category}
                            </Badge>
                            <span className="text-xs text-white/40">{t.summary_date}</span>
                            <span className="text-xs text-yellow-400 ml-auto">
                              Score: {Number(t.trending_score).toFixed(0)}
                            </span>
                          </div>
                          <p className="text-xs text-white/50">
                            {t.query_count} queries · {t.unique_users} unique fans
                          </p>
                          {samples.length > 0 && (
                            <p className="text-xs text-white/30 mt-1 truncate">
                              Sample: "{samples[0]}"
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-white/30 text-sm py-8">No trending topics yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══════ Section: Artist Comparison ══════ */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-cyan-400" /> Artist Comparison
            </CardTitle>
            <CardDescription className="text-xs text-white/40">
              Compare fan interest distribution between two artists
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedArtistId === 'all' ? (
              <div className="text-center text-white/30 text-sm py-8">
                Select a specific artist above to enable comparison
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-white/50">Compare with:</span>
                  <Select value={compareArtistId} onValueChange={setCompareArtistId}>
                    <SelectTrigger className="w-56 bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select artist..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {tier1Artists?.filter(a => a.wiki_entry_id !== selectedArtistId).map(a => (
                        <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                          {a.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {compareArtistId !== 'none' && comparisonChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={comparisonChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="category" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white' }} />
                      <Bar dataKey={selectedArtistName} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={compareArtistName} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : compareArtistId !== 'none' ? (
                  <div className="text-center text-white/30 text-sm py-8">No comparison data available yet</div>
                ) : (
                  <div className="text-center text-white/30 text-sm py-8">Select a comparison artist to see side-by-side analysis</div>
                )}
                {compareArtistId !== 'none' && (
                  <div className="flex items-center gap-4 mt-3 justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-white/60"><div className="w-3 h-3 rounded bg-purple-500" />{selectedArtistName}</div>
                    <div className="flex items-center gap-1.5 text-xs text-white/60"><div className="w-3 h-3 rounded bg-blue-500" />{compareArtistName}</div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ══════ Section: Hourly Activity Heatmap ══════ */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Fan Activity Heatmap
            </CardTitle>
            <CardDescription className="text-xs text-white/40">
              When are fans most active? (hours in KST)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalQueries > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-24 gap-0.5">
                  {hourlyData.map(h => {
                    const intensity = h.count / maxHourCount;
                    const bg = h.count === 0
                      ? 'bg-white/5'
                      : intensity > 0.75 ? 'bg-purple-500' : intensity > 0.5 ? 'bg-purple-500/70' : intensity > 0.25 ? 'bg-purple-500/40' : 'bg-purple-500/20';
                    return (
                      <div
                        key={h.hour}
                        className={`aspect-square rounded-sm ${bg} flex items-center justify-center group relative cursor-default`}
                        title={`${h.hour}:00 — ${h.count} queries`}
                      >
                        <span className="text-[8px] text-white/40">{h.hour}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/30">
                  <span>0:00</span>
                  <span>6:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>23:00</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/40 justify-end">
                  <span>Low</span>
                  <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-white/5" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500/20" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500/40" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500/70" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500" />
                  </div>
                  <span>High</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[100px] text-white/30 text-sm">No data yet</div>
            )}
          </CardContent>
        </Card>

        {/* ══════ Section: Gap Analysis ══════ */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" /> Content Gap Analysis
            </CardTitle>
            <CardDescription className="text-xs text-white/40">
              What fans want but you're not addressing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalQueries > 0 ? (
              <div className="space-y-4">
                {gapCategories.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-orange-400 mb-2">🔴 No Fan Interest Detected</h4>
                    <div className="flex flex-wrap gap-2">
                      {gapCategories.map(cat => (
                        <Badge key={cat} variant="outline" className="border-orange-500/30 text-orange-300 text-xs">
                          {INTENT_LABELS[cat] || cat}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-white/30 mt-1">These areas have zero fan queries — consider creating content to stimulate interest.</p>
                  </div>
                )}
                {lowCategories.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-yellow-400 mb-2">🟡 Low Engagement Areas</h4>
                    <div className="flex flex-wrap gap-2">
                      {lowCategories.map(cat => (
                        <Badge key={cat} variant="outline" className="border-yellow-500/30 text-yellow-300 text-xs">
                          {INTENT_LABELS[cat] || cat} ({categoryStats[cat]})
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-white/30 mt-1">Low query volume suggests fans aren't engaging with these topics yet.</p>
                  </div>
                )}
                {gapCategories.length === 0 && lowCategories.length === 0 && (
                  <div className="text-center py-4">
                    <span className="text-emerald-400 text-sm">✅ Great coverage!</span>
                    <p className="text-xs text-white/40 mt-1">Fans are actively engaging across all content categories.</p>
                  </div>
                )}
                {/* Category coverage bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                    <span>Category Coverage</span>
                    <span>{activeCategories.size}/{allCategories.length} categories</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 via-yellow-500 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${(activeCategories.size / allCategories.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[100px] text-white/30 text-sm">No data yet — gap analysis requires fan query data</div>
            )}
          </CardContent>
        </Card>

        {/* ══════ Section: AI Action Items ══════ */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" /> AI-Powered Action Items
            </CardTitle>
            <CardDescription className="text-xs text-white/40">
              Recommendations based on fan intent patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {actionItems.map((item, i) => {
                const priorityColors = {
                  high: 'border-l-red-500 bg-red-500/5',
                  medium: 'border-l-yellow-500 bg-yellow-500/5',
                  low: 'border-l-emerald-500 bg-emerald-500/5',
                };
                const priorityBadge = {
                  high: 'bg-red-500/20 text-red-300 border-red-500/30',
                  medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
                  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                };
                return (
                  <div key={i} className={`p-4 rounded-lg border-l-4 ${priorityColors[item.priority]}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{item.icon}</span>
                      <span className="text-sm font-semibold text-white/90">{item.title}</span>
                      <Badge variant="outline" className={`text-[10px] ml-auto ${priorityBadge[item.priority]}`}>
                        {item.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/50 pl-6">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* CTA / Paywall Teaser */}
        <Card className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 border-purple-500/20 backdrop-blur-sm">
          <CardContent className="p-8 text-center">
            <Lock className="w-10 h-10 text-purple-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">
              Unlock Full Agency Intelligence
            </h3>
            <p className="text-sm text-white/60 max-w-md mx-auto mb-4">
              Get real-time fan intent analytics, sentiment trends, competitive insights, and actionable recommendations for your artists.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" disabled>
                Contact Sales <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <span className="text-xs text-white/40">Coming Soon</span>
            </div>
          </CardContent>
        </Card>

        <Separator className="bg-white/5" />
        <p className="text-center text-xs text-white/20 pb-8">
          K-Trendz Agency Intelligence — Sample Dashboard Preview
        </p>
      </div>
    </div>
  );
};

export default AgencyDashboardSample;
