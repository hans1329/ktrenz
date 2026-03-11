import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Brain, TrendingUp, Users, MessageSquare, BarChart3, Eye } from 'lucide-react';
import { format } from 'date-fns';

const INTENT_COLORS: Record<string, string> = {
  news: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  schedule: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  streaming: 'bg-green-500/20 text-green-400 border-green-500/30',
  music_performance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  sns: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  comparison: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  fan_activity: 'bg-red-500/20 text-red-400 border-red-500/30',
  general: 'bg-muted text-muted-foreground border-border',
};

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  negative: '😟',
  curious: '🤔',
};

const AdminIntents = () => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'raw' | 'summary'>('raw');

  // Raw intents
  const { data: intents, isLoading: intentsLoading, refetch: refetchIntents } = useQuery({
    queryKey: ['admin-intents', categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('ktrenz_agent_intents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (categoryFilter !== 'all') {
        query = query.eq('intent_category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Summaries
  const { data: summaries, isLoading: summariesLoading, refetch: refetchSummaries } = useQuery({
    queryKey: ['admin-intent-summaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_agent_intent_summaries')
        .select('*')
        .order('summary_date', { ascending: false })
        .order('trending_score', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Stats
  const totalIntents = intents?.length ?? 0;
  const uniqueCategories = new Set(intents?.map(i => i.intent_category)).size;
  const uniqueUsers = new Set(intents?.map(i => i.user_id)).size;
  const topCategory = intents?.reduce((acc: Record<string, number>, i) => {
    acc[i.intent_category] = (acc[i.intent_category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCatName = topCategory ? Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0]?.[0] : '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6" /> Intent Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fan Agent 대화에서 추출된 사용자 의도 데이터를 실시간으로 확인합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'raw' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('raw')}
          >
            Raw Intents
          </Button>
          <Button
            variant={viewMode === 'summary' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('summary')}
          >
            <BarChart3 className="w-4 h-4 mr-1" /> Summaries
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchIntents(); refetchSummaries(); }}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MessageSquare className="w-3.5 h-3.5" /> 전체 인텐트
            </div>
            <p className="text-2xl font-bold text-foreground">{totalIntents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="w-3.5 h-3.5" /> 고유 유저
            </div>
            <p className="text-2xl font-bold text-foreground">{uniqueUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Brain className="w-3.5 h-3.5" /> 카테고리
            </div>
            <p className="text-2xl font-bold text-foreground">{uniqueCategories}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> 최다 카테고리
            </div>
            <p className="text-lg font-bold text-foreground">{topCatName}</p>
          </CardContent>
        </Card>
      </div>

      {viewMode === 'raw' ? (
        <>
          {/* Filter */}
          <div className="flex items-center gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="news">News</SelectItem>
                <SelectItem value="schedule">Schedule</SelectItem>
                <SelectItem value="streaming">Streaming</SelectItem>
                <SelectItem value="music_performance">Music Performance</SelectItem>
                <SelectItem value="sns">SNS</SelectItem>
                <SelectItem value="comparison">Comparison</SelectItem>
                <SelectItem value="fan_activity">Fan Activity</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">최근 100건</span>
          </div>

          {/* Raw Intents Table */}
          <Card>
            <CardContent className="p-0">
              {intentsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
              ) : !intents?.length ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Brain className="w-8 h-8 mb-2 opacity-50" />
                  <p>아직 수집된 intent가 없습니다</p>
                  <p className="text-xs mt-1">Fan Agent에서 대화를 시작하면 여기에 표시됩니다</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Time</TableHead>
                      <TableHead className="w-28">Category</TableHead>
                      <TableHead className="w-36">Sub-topic</TableHead>
                      <TableHead>Query</TableHead>
                      <TableHead className="w-20">Sentiment</TableHead>
                      <TableHead className="w-44">Entities</TableHead>
                      <TableHead className="w-32">Tools Used</TableHead>
                      <TableHead className="w-24">Knowledge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intents.map((intent) => (
                      <TableRow key={intent.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(intent.created_at), 'MM/dd HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={INTENT_COLORS[intent.intent_category] || INTENT_COLORS.general}>
                            {intent.intent_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{intent.sub_topic || '-'}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate" title={intent.source_query}>
                          {intent.source_query}
                        </TableCell>
                        <TableCell className="text-center">
                          <span title={intent.sentiment || 'neutral'} className="text-2xl">
                            {SENTIMENT_EMOJI[intent.sentiment || 'neutral'] || '😐'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          {intent.entities && Object.keys(intent.entities as Record<string, unknown>).length > 0
                            ? JSON.stringify(intent.entities)
                            : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(intent.tools_used as string[] | null)?.join(', ') || '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {intent.knowledge_archive_ids && (intent.knowledge_archive_ids as string[]).length > 0 ? (
                            <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">
                              📚 {(intent.knowledge_archive_ids as string[]).length}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* Summary View */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Intent Summaries (Auto-aggregated)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {summariesLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
            ) : !summaries?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                <p>집계 데이터가 아직 없습니다</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Artist (wiki_entry_id)</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Queries</TableHead>
                    <TableHead className="text-right">Unique Users</TableHead>
                    <TableHead className="text-right">Trending</TableHead>
                    <TableHead>Sentiment Dist.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((s) => {
                    const sentDist = s.sentiment_distribution as Record<string, number> | null;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.summary_date}
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[140px]">
                          {s.wiki_entry_id?.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={INTENT_COLORS[s.intent_category] || INTENT_COLORS.general}>
                            {s.intent_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{s.query_count}</TableCell>
                        <TableCell className="text-right">{s.unique_users}</TableCell>
                        <TableCell className="text-right">
                          <span className="text-primary font-semibold">{Number(s.trending_score).toFixed(0)}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {sentDist ? Object.entries(sentDist)
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => `${SENTIMENT_EMOJI[k] || k}: ${v}`)
                            .join(' ') : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminIntents;
