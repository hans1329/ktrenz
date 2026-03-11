import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Link2, Brain, FileText, ChevronDown, ChevronRight, RefreshCw, Archive, TrendingUp } from 'lucide-react';
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

const AdminIntentMonitor = () => {
  const [expandedIntent, setExpandedIntent] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Fetch intents that have knowledge_archive_ids
  const { data: intents, isLoading, refetch } = useQuery({
    queryKey: ['intent-monitor-linked', categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('ktrenz_agent_intents')
        .select('*')
        .not('knowledge_archive_ids', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (categoryFilter !== 'all') {
        query = query.eq('intent_category', categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      // Filter to only those with actual archive IDs
      return (data ?? []).filter(i => (i.knowledge_archive_ids as string[] | null)?.length);
    },
  });

  // Fetch all knowledge archives referenced by visible intents
  const archiveIds = [...new Set(intents?.flatMap(i => (i.knowledge_archive_ids as string[]) || []) ?? [])];

  const { data: archives } = useQuery({
    queryKey: ['intent-monitor-archives', archiveIds],
    queryFn: async () => {
      if (!archiveIds.length) return [];
      const { data, error } = await supabase
        .from('ktrenz_agent_knowledge_archive')
        .select('*')
        .in('id', archiveIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: archiveIds.length > 0,
  });

  const archiveMap = new Map(archives?.map(a => [a.id, a]) ?? []);

  // Stats
  const totalLinked = intents?.length ?? 0;
  const totalArchives = archiveIds.length;
  const topicTypes = archives?.reduce((acc, a) => {
    acc[a.topic_type] = (acc[a.topic_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Link2 className="w-6 h-6" /> 인텐트 ↔ 지식 모니터
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Intent와 Knowledge Archive 간의 관계를 시각화합니다
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Brain className="w-3.5 h-3.5" /> Linked Intents
            </div>
            <p className="text-2xl font-bold text-foreground">{totalLinked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Archive className="w-3.5 h-3.5" /> Unique Archives
            </div>
            <p className="text-2xl font-bold text-foreground">{totalArchives}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Database className="w-3.5 h-3.5" /> Topic Types
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(topicTypes).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px]">
                  {type}: {count}
                </Badge>
              ))}
              {Object.keys(topicTypes).length === 0 && <span className="text-sm text-muted-foreground">-</span>}
            </div>
          </CardContent>
        </Card>
      </div>

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
        <span className="text-xs text-muted-foreground">Knowledge가 연결된 intent만 표시</span>
      </div>

      {/* Intent ↔ Knowledge Relationship List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>
          ) : !intents?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Link2 className="w-8 h-8 mb-2 opacity-50" />
              <p>아직 Knowledge와 연결된 intent가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {intents.map((intent) => {
                const isExpanded = expandedIntent === intent.id;
                const linkedArchives = ((intent.knowledge_archive_ids as string[]) || [])
                  .map(id => archiveMap.get(id))
                  .filter(Boolean);

                return (
                  <div key={intent.id} className="group">
                    {/* Intent Row */}
                    <button
                      onClick={() => setExpandedIntent(isExpanded ? null : intent.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap w-28">
                        {format(new Date(intent.created_at!), 'MM/dd HH:mm')}
                      </span>
                      <Badge variant="outline" className={`${INTENT_COLORS[intent.intent_category] || INTENT_COLORS.general} text-[10px] shrink-0`}>
                        {intent.intent_category}
                      </Badge>
                      <span className="text-sm truncate flex-1">{intent.source_query}</span>
                      <span title={intent.sentiment || 'neutral'} className="shrink-0 text-2xl">
                        {SENTIMENT_EMOJI[intent.sentiment || 'neutral'] || '😐'}
                      </span>
                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20 text-[10px] shrink-0">
                        📚 {linkedArchives.length}
                      </Badge>
                    </button>

                    {/* Expanded: Knowledge Archive Details */}
                    {isExpanded && (
                      <div className="bg-muted/30 px-6 py-4 space-y-3 border-t border-border/50">
                        <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Linked Knowledge Archives ({linkedArchives.length})
                        </div>
                        {linkedArchives.map((archive: any) => (
                          <Card key={archive.id} className="bg-background/50">
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px]">{archive.topic_type}</Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  Fetched: {format(new Date(archive.fetched_at), 'MM/dd HH:mm')}
                                </span>
                                {archive.recency_filter && (
                                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                                    {archive.recency_filter}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                                  {archive.id.slice(0, 8)}...
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Query:</span> {archive.query_text}
                              </div>
                              {archive.content_raw && (
                                <ScrollArea className="max-h-32">
                                  <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed">
                                    {archive.content_raw.slice(0, 500)}
                                    {archive.content_raw.length > 500 && '...'}
                                  </p>
                                </ScrollArea>
                              )}
                              {archive.citations && (archive.citations as string[]).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(archive.citations as string[]).slice(0, 3).map((url: string, i: number) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-primary hover:underline truncate max-w-[200px]"
                                    >
                                      🔗 {new URL(url).hostname}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                        {intent.sub_topic && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Sub-topic:</span> {intent.sub_topic}
                          </div>
                        )}
                        {intent.entities && Object.keys(intent.entities as Record<string, unknown>).length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Entities:</span> {JSON.stringify(intent.entities)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminIntentMonitor;
