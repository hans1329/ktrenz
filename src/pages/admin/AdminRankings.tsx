import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Crown, Star, ArrowUpDown, TrendingUp, TrendingDown, Minus, AlertTriangle, X, Play, RefreshCw, Plus, Search, Trash2, ChevronDown, ChevronUp, Clock, Calendar, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface ScoreData {
  total_score: number;
  energy_score: number;
  energy_change_24h: number;
  youtube_score: number;
  buzz_score: number;
  album_sales_score: number;
  music_score: number;
  youtube_change_24h: number | null;
  buzz_change_24h: number | null;
  album_change_24h: number | null;
  music_change_24h: number | null;
  scored_at: string;
}

interface SnapshotMetrics {
  youtube?: { totalViewCount?: number; subscriberCount?: number; recentTotalViews?: number };
  youtube_music?: { topicSubscribers?: number; topicTotalViews?: number; topTracks?: Array<{ title: string; viewCount: number }> };
  buzz_multi?: { buzz_score?: number; total_mentions?: number; sentiment_score?: number; source_breakdown?: Array<{ source: string; mentions: number; weighted: number }> };
  hanteo?: Array<{ album: string; artist: string; first_week_sales: number }>;
  apple_music_charts?: { rank?: number; bonus?: number; [key: string]: any };
  billboard_charts?: { rank?: number; bonus?: number; [key: string]: any };
  lastfm?: { listeners?: number; playcount?: number };
  deezer?: { fans?: number; nb_album?: number };
}

interface CollectionStatus {
  youtube?: string;
  buzz_multi?: string;
  music?: string;
  lastfm?: string;
  deezer?: string;
  hanteo?: string;
  apple_music_charts?: string;
  billboard_charts?: string;
}

interface ArtistTier {
  tier: number;
  is_manual_override: boolean;
  wiki_entry_id: string;
  title: string;
  slug: string;
  image_url: string | null;
  schema_type: string;
  trending_score: number;
  scores: ScoreData | null;
  collection: CollectionStatus;
  metrics: SnapshotMetrics;
}

const STALE_HOURS = 26; // 26시간 이상이면 경고

function getHoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

function formatAgo(dateStr: string): string {
  const h = getHoursAgo(dateStr);
  if (h < 1) return `${Math.round(h * 60)}분 전`;
  if (h < 24) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

const AdminRankings = () => {
  const queryClient = useQueryClient();
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [recollecting, setRecollecting] = useState<string | null>(null);
  const [detailArtist, setDetailArtist] = useState<ArtistTier | null>(null);
  const [dataDetailOpen, setDataDetailOpen] = useState<{ wikiEntryId: string; source: string } | null>(null);
  const dataDetailWikiId = dataDetailOpen?.wikiEntryId || null;
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<1 | 2>(1);
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [pipelineStartTime, setPipelineStartTime] = useState<number | null>(null);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  // Elapsed time counter for pipeline
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (!pipelineStartTime || !pipelineRunId) { setElapsed(0); setFinalElapsed(null); return; }
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - pipelineStartTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pipelineStartTime, pipelineRunId]);

  // Schedule management state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleHour, setScheduleHour] = useState(5); // KST
  const [scheduleMinute, setScheduleMinute] = useState(5);

  // Hanteo URL config state
  const [hanteoConfigOpen, setHanteoConfigOpen] = useState(false);
  const [hanteoUrlInput, setHanteoUrlInput] = useState('');

  const { data: hanteoConfig, refetch: refetchHanteoConfig } = useQuery({
    queryKey: ['hanteo-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_collection_config' as any)
        .select('hanteo_chart_url, updated_at')
        .eq('id', 'default')
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const updateHanteoUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from('ktrenz_collection_config' as any)
        .update({ hanteo_chart_url: url, updated_at: new Date().toISOString() } as any)
        .eq('id', 'default');
      if (error) throw error;
    },
    onSuccess: () => {
      refetchHanteoConfig();
      toast.success('한터 차트 URL이 업데이트되었습니다');
      setHanteoConfigOpen(false);
    },
    onError: (err: any) => toast.error('URL 업데이트 실패: ' + err.message),
  });

  // Fetch current schedule
  const { data: scheduleData, refetch: refetchSchedule } = useQuery({
    queryKey: ['ktrenz-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ktrenz_schedule');
      if (error) throw error;
      return data as any;
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ action, hour, minute }: { action: string; hour?: number; minute?: number }) => {
      // Convert KST to UTC
      const utcHour = hour !== undefined ? (hour - 9 + 24) % 24 : undefined;
      const { data, error } = await supabase.rpc('manage_ktrenz_schedule', {
        p_action: action,
        p_hour: utcHour ?? 20,
        p_minute: minute ?? 5,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      refetchSchedule();
      if (vars.action === 'set') {
        toast.success(`스케줄 설정: 매일 ${String(vars.hour).padStart(2, '0')}:${String(vars.minute).padStart(2, '0')} (KST)`);
      } else {
        toast.success('스케줄이 해제되었습니다');
      }
    },
    onError: (err: any) => toast.error('스케줄 변경 실패: ' + err.message),
  });

  // Parse current schedule for display
  const isScheduled = scheduleData?.status === 'active';
  const currentSchedule = isScheduled && scheduleData?.schedule
    ? (() => {
        const parts = (scheduleData.schedule as string).split(' ');
        const utcMin = parseInt(parts[0]);
        const utcHour = parseInt(parts[1]);
        const kstHour = (utcHour + 9) % 24;
        return { kstHour, minute: utcMin };
      })()
    : null;

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-artist-tiers'],
    queryFn: async () => {
      const [tiersRes, scoresRes, snapshotsRes] = await Promise.all([
        supabase
          .from('v3_artist_tiers')
          .select('tier, is_manual_override, wiki_entry_id, image_url, wiki_entries!inner(title, slug, image_url, schema_type, trending_score)')
          .order('tier', { ascending: true }),
        supabase
          .from('v3_scores_v2')
          .select('wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, album_sales_score, music_score, youtube_change_24h, buzz_change_24h, album_change_24h, music_change_24h, scored_at'),
        // 최근 48시간 스냅샷만 로드 (1000행 제한 회피)
        (async () => {
          const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const platforms = ['youtube', 'buzz_multi', 'hanteo', 'apple_music_charts', 'billboard_charts', 'lastfm', 'deezer', 'social_followers'];
          const { data, error } = await supabase
            .from('ktrenz_data_snapshots')
            .select('wiki_entry_id, platform, collected_at, metrics')
            .not('wiki_entry_id', 'is', null)
            .in('platform', platforms)
            .gte('collected_at', since)
            .order('collected_at', { ascending: false })
            .limit(5000);
          return { data, error };
        })(),
      ]);

      if (tiersRes.error) throw tiersRes.error;

      const scoreMap = new Map<string, ScoreData>();
      (scoresRes.data || []).forEach((s: any) => scoreMap.set(s.wiki_entry_id, s));

      // 아티스트별 플랫폼별 최신 수집 시각 + 메트릭스
      const collectionMap = new Map<string, CollectionStatus>();
      const metricsMap = new Map<string, SnapshotMetrics>();
      (snapshotsRes.data || []).forEach((s: any) => {
        if (!s.wiki_entry_id) return;
        const existing = collectionMap.get(s.wiki_entry_id) || {};
        const platform = s.platform as string;
        // 첫 번째(최신) 것만 사용
        if (!existing[platform as keyof CollectionStatus]) {
          existing[platform as keyof CollectionStatus] = s.collected_at;
          collectionMap.set(s.wiki_entry_id, existing);

          // 메트릭스 저장
          const m = metricsMap.get(s.wiki_entry_id) || {};
          if (platform === 'hanteo') {
            // hanteo는 여러 앨범이 올 수 있으므로 배열로
            if (!m.hanteo) m.hanteo = [];
            if (s.metrics && s.wiki_entry_id) m.hanteo.push(s.metrics);
          } else {
            (m as any)[platform] = s.metrics;
          }
          metricsMap.set(s.wiki_entry_id, m);
        } else if (platform === 'hanteo' && s.wiki_entry_id) {
          // hanteo 추가 앨범
          const m = metricsMap.get(s.wiki_entry_id) || {};
          if (!m.hanteo) m.hanteo = [];
          if (s.metrics) m.hanteo.push(s.metrics);
          metricsMap.set(s.wiki_entry_id, m);
        }
      });

      return (tiersRes.data || []).map((row: any) => ({
        tier: row.tier,
        is_manual_override: row.is_manual_override,
        wiki_entry_id: row.wiki_entry_id,
        title: row.wiki_entries.title,
        slug: row.wiki_entries.slug,
        image_url: row.wiki_entries.image_url || row.image_url,
        schema_type: row.wiki_entries.schema_type,
        trending_score: row.wiki_entries.trending_score ?? 0,
        scores: scoreMap.get(row.wiki_entry_id) || null,
        collection: collectionMap.get(row.wiki_entry_id) || {},
        metrics: metricsMap.get(row.wiki_entry_id) || {},
      })) as ArtistTier[];
    },
  });

  // Load latest engine run on mount (persist across page navigations)
  const { data: latestRun } = useQuery({
    queryKey: ['latest-engine-run'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('ktrenz_engine_runs')
        .select('id, status, current_module, modules_requested, results, error_message, started_at, completed_at')
        .gte('started_at', today.toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    staleTime: 10_000,
  });

  // Auto-restore pipeline tracking from latest run on mount
  useEffect(() => {
    if (latestRun && !pipelineRunId) {
      setPipelineRunId(latestRun.id);
      if (latestRun.started_at) {
        setPipelineStartTime(new Date(latestRun.started_at).getTime());
      }
    }
  }, [latestRun]);

  // Pipeline progress polling
  const { data: pipelineRun } = useQuery({
    queryKey: ['pipeline-run', pipelineRunId],
    queryFn: async () => {
      if (!pipelineRunId) return null;
      const { data, error } = await supabase
        .from('ktrenz_engine_runs')
        .select('status, current_module, modules_requested, results, error_message, started_at, completed_at')
        .eq('id', pipelineRunId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!pipelineRunId,
    refetchInterval: pipelineRunId ? 3000 : false,
  });

  // Freeze elapsed time when pipeline completes/fails and compute actual duration
  useEffect(() => {
    if (pipelineRun?.status === 'completed' || pipelineRun?.status === 'failed') {
      if (pipelineRun.started_at && pipelineRun.completed_at) {
        const actual = Math.round((new Date(pipelineRun.completed_at).getTime() - new Date(pipelineRun.started_at).getTime()) / 1000);
        setFinalElapsed(actual);
      } else {
        setFinalElapsed(elapsed);
      }
    }
  }, [pipelineRun?.status]);

  const { data: liveStats } = useQuery({
    queryKey: ['pipeline-live-stats', pipelineStartTime],
    queryFn: async () => {
      if (!pipelineStartTime) return null;
      const since = new Date(pipelineStartTime).toISOString();

      // Fetch all snapshots with pagination to avoid 1000-row default limit
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('ktrenz_data_snapshots')
          .select('platform, wiki_entry_id, metrics')
          .gte('collected_at', since)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Count unique artists per platform
      const platformCounts: Record<string, number> = {};
      const buzzSources: Record<string, number> = {};
      const seenPerPlatform: Record<string, Set<string>> = {};

      allData.forEach((s: any) => {
        const p = s.platform;
        const wid = s.wiki_entry_id || 'unknown';
        if (!seenPerPlatform[p]) seenPerPlatform[p] = new Set();
        if (!seenPerPlatform[p].has(wid)) {
          seenPerPlatform[p].add(wid);
          platformCounts[p] = (platformCounts[p] || 0) + 1;
        }

        // Extract buzz source breakdown
        if (p === 'buzz_multi' && s.metrics?.source_breakdown) {
          (s.metrics.source_breakdown as any[]).forEach((src: any) => {
            if (src.mentions > 0) {
              buzzSources[src.source] = (buzzSources[src.source] || 0) + src.mentions;
            }
          });
        }
      });

      return { platformCounts, buzzSources, totalSnapshots: allData.length };
    },
    enabled: !!pipelineStartTime && !!pipelineRunId,
    refetchInterval: pipelineRunId ? 3000 : false,
  });

  // Auto-clear pipeline tracking when done
  useEffect(() => {
    if (pipelineRun && (pipelineRun.status === 'completed' || pipelineRun.status === 'failed')) {
      if (pipelineRun.status === 'completed') {
        toast.success('전체 수집 파이프라인 완료!');
        queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      } else {
        toast.error(`파이프라인 실패: ${pipelineRun.error_message || 'Unknown error'}`);
      }
      setRunningSource(null);
      // 배너는 수동으로 닫을 때까지 유지
    }
  }, [pipelineRun?.status]);

  const toggleTierMutation = useMutation({
    mutationFn: async ({ wiki_entry_id, newTier }: { wiki_entry_id: string; newTier: number }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .update({ tier: newTier, is_manual_override: true })
        .eq('wiki_entry_id', wiki_entry_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      toast.success('티어가 변경되었습니다');
    },
    onError: (err: any) => toast.error('변경 실패: ' + err.message),
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async ({ wiki_entry_id }: { wiki_entry_id: string }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .update({ is_manual_override: false })
        .eq('wiki_entry_id', wiki_entry_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      toast.success('오버라이드가 해제되었습니다');
    },
    onError: (err: any) => toast.error('해제 실패: ' + err.message),
  });

  const modulePlatforms: Record<string, string[]> = {
    youtube: ['youtube'],
    music: ['lastfm', 'deezer', 'youtube_music'],
    buzz: ['buzz_multi', 'naver_news'],
    hanteo: ['hanteo'],
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getLatestSnapshotTime = async (platforms: string[], wikiEntryId?: string) => {
    let query = supabase
      .from('ktrenz_data_snapshots')
      .select('collected_at')
      .in('platform', platforms)
      .order('collected_at', { ascending: false })
      .limit(1);

    if (wikiEntryId) {
      query = query.eq('wiki_entry_id', wikiEntryId);
    } else {
      query = query.not('wiki_entry_id', 'is', null);
    }

    const { data } = await query.maybeSingle();
    return data?.collected_at ?? '1970-01-01T00:00:00Z';
  };

  const waitForSnapshotUpdate = async ({
    platforms,
    beforeTime,
    wikiEntryId,
    timeoutMs = 30000,
    intervalMs = 2000,
  }: {
    platforms: string[];
    beforeTime: string;
    wikiEntryId?: string;
    timeoutMs?: number;
    intervalMs?: number;
  }) => {
    const pollStart = Date.now();
    while (Date.now() - pollStart < timeoutMs) {
      await sleep(intervalMs);
      const latest = await getLatestSnapshotTime(platforms, wikiEntryId);
      if (latest > beforeTime) return true;
    }
    return false;
  };

  const triggerCollection = async (source: string) => {
    setRunningSource(source);
    try {
      if (source === 'all') {
        // 전체 수집: data-engine 오케스트레이터 사용 (기준 스냅샷으로 마킹)
        const { data, error } = await supabase.functions.invoke('data-engine', {
          body: { module: 'all', triggerSource: 'admin', isBaseline: true },
        });
        if (error) throw error;
        // Track pipeline run for progress polling
        if (data?.runId) {
          setPipelineRunId(data.runId);
          setPipelineStartTime(Date.now());
        }
        toast.success('기준 스냅샷 수집 시작됨', {
          description: 'YouTube → Music → Album → Buzz → Energy (기준 스냅샷) 순서로 실행됩니다',
        });
        // Don't reset runningSource here - pipeline polling will handle it
      } else {
        // 개별 모듈: data-engine은 fire-and-forget이므로 실제 스냅샷 반영까지 대기
        const moduleMap: Record<string, string> = { album: 'hanteo' };
        const mod = moduleMap[source] || source;
        const watchPlatforms = modulePlatforms[mod] || [mod];
        const beforeTime = await getLatestSnapshotTime(watchPlatforms);

        const { error } = await supabase.functions.invoke('data-engine', {
          body: { module: mod },
        });
        if (error) throw error;

        const reflected = await waitForSnapshotUpdate({
          platforms: watchPlatforms,
          beforeTime,
          timeoutMs: 35000,
          intervalMs: 2000,
        });

        await queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
        await queryClient.refetchQueries({ queryKey: ['admin-artist-tiers'], type: 'active' });

        if (reflected) {
          toast.success(`${source} 수집 반영 완료`);
        } else {
          toast.success(`${source} 수집 실행됨`, { description: '백그라운드 처리 중입니다. 잠시 후 리스트에 반영됩니다.' });
        }
        setRunningSource(null);
      }
    } catch (err: any) {
      toast.error(`${source} 수집 실패: ${err.message}`);
      setRunningSource(null);
    }
  };

   // Energy detail dialog (state moved to top)

  const { data: energySnapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ['energy-snapshots', detailArtist?.wiki_entry_id],
    queryFn: async () => {
      if (!detailArtist) return [];
      const { data, error } = await supabase
        .from('v3_energy_snapshots_v2')
        .select('youtube_score, buzz_score, album_score, music_score, youtube_velocity, youtube_intensity, buzz_velocity, buzz_intensity, album_velocity, album_intensity, music_velocity, music_intensity, energy_score, is_baseline, snapshot_at')
        .eq('wiki_entry_id', detailArtist.wiki_entry_id)
        .order('snapshot_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!detailArtist,
  });

  const { data: energyBaseline } = useQuery({
    queryKey: ['energy-baseline', detailArtist?.wiki_entry_id],
    queryFn: async () => {
      if (!detailArtist) return null;
      const { data, error } = await supabase
        .from('v3_energy_baselines_v2')
        .select('avg_velocity_7d, avg_velocity_30d, avg_intensity_7d, avg_intensity_30d, avg_energy_7d, avg_energy_30d')
        .eq('wiki_entry_id', detailArtist.wiki_entry_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!detailArtist,
  });

  // Baseline snapshot for data detail modal
  const { data: dataDetailBaseline } = useQuery({
    queryKey: ['data-detail-baseline', dataDetailWikiId],
    queryFn: async () => {
      if (!dataDetailWikiId) return null;
      const { data, error } = await supabase
        .from('v3_energy_snapshots_v2' as any)
        .select('youtube_score, buzz_score, album_score, music_score, energy_score, snapshot_at')
        .eq('wiki_entry_id', dataDetailWikiId)
        .eq('is_baseline', true)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!dataDetailWikiId,
  });

  // Live metrics for data detail modal (fetch latest snapshots from DB directly)
  const { data: dataDetailMetrics } = useQuery({
    queryKey: ['data-detail-metrics', dataDetailWikiId],
    queryFn: async () => {
      if (!dataDetailWikiId) return null;
      const { data, error } = await supabase
        .from('ktrenz_data_snapshots')
        .select('platform, metrics, collected_at')
        .eq('wiki_entry_id', dataDetailWikiId)
        .order('collected_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const m: SnapshotMetrics = {};
      const seen = new Set<string>();
      for (const s of (data || [])) {
        const p = s.platform as string;
        if (p === 'hanteo') {
          if (!m.hanteo) m.hanteo = [];
          if (s.metrics) m.hanteo.push(s.metrics as any);
        } else if (!seen.has(p)) {
          seen.add(p);
          (m as any)[p] = s.metrics;
        }
      }
      return m;
    },
    enabled: !!dataDetailWikiId,
  });

  // Search wiki_entries not yet in v3_artist_tiers
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ['artist-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const existingIds = artists.map(a => a.wiki_entry_id);
      const { data, error } = await supabase
        .from('wiki_entries')
        .select('id, title, slug, image_url, schema_type, trending_score')
        .ilike('title', `%${searchQuery}%`)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .order('trending_score', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: addDialogOpen && searchQuery.length >= 2,
  });

  const addArtistMutation = useMutation({
    mutationFn: async ({ wiki_entry_id, tier }: { wiki_entry_id: string; tier: number }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .insert({ wiki_entry_id, tier, is_manual_override: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      toast.success('아티스트가 등록되었습니다');
    },
    onError: (err: any) => toast.error('등록 실패: ' + err.message),
  });

  const removeArtistMutation = useMutation({
    mutationFn: async ({ wiki_entry_id }: { wiki_entry_id: string }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .delete()
        .eq('wiki_entry_id', wiki_entry_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      toast.success('아티스트가 제거되었습니다');
    },
    onError: (err: any) => toast.error('제거 실패: ' + err.message),
  });

  const tier1 = artists.filter(a => a.tier === 1).sort((a, b) => (b.scores?.total_score ?? 0) - (a.scores?.total_score ?? 0));
  const tier2 = artists.filter(a => a.tier === 2).sort((a, b) => b.trending_score - a.trending_score);

  // 오늘의 YouTube API 토큰 소비량 추적
  const { data: ytQuota } = useQuery({
    queryKey: ['yt-quota-today'],
    queryFn: async () => {
      // YouTube API 쿼터는 PST 자정(UTC 08:00)에 리셋됨
      const now = new Date();
      const pstResetUTC = new Date(now);
      pstResetUTC.setUTCHours(8, 0, 0, 0);
      if (now.getUTCHours() < 8) {
        pstResetUTC.setUTCDate(pstResetUTC.getUTCDate() - 1);
      }
      const { count, error } = await supabase
        .from('ktrenz_data_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'youtube')
        .gte('collected_at', pstResetUTC.toISOString());
      if (error) throw error;
      const collections = count ?? 0;
      // 최적화 완료: 아티스트당 playlistItems(1) + videos.list(~2) = 3 units 고정
      const UNITS_PER_COLLECTION = 3;
      const estimatedQuota = collections * UNITS_PER_COLLECTION;
      return { collections, estimatedQuota, dailyLimit: 10000 };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const ChangeIndicator = ({ value, artist }: { value: number | null | undefined; artist: ArtistTier }) => {
    if (value == null) return <span className="text-muted-foreground">—</span>;
    const inner = value > 0
      ? <span className="text-emerald-500 flex items-center gap-0.5 text-xs font-medium"><TrendingUp className="w-3 h-3" />+{value.toFixed(1)}%</span>
      : value < 0
        ? <span className="text-red-500 flex items-center gap-0.5 text-xs font-medium"><TrendingDown className="w-3 h-3" />{value.toFixed(1)}%</span>
        : <span className="text-muted-foreground flex items-center gap-0.5 text-xs"><Minus className="w-3 h-3" />0%</span>;
    return (
      <button className="hover:underline cursor-pointer" onClick={() => setDetailArtist(artist)}>
        {inner}
      </button>
    );
  };



  const triggerSingleCollection = async (source: string, wikiEntryId: string, artistName: string) => {
    const sourceLabel = source === 'youtube' ? 'YouTube' : source === 'buzz' ? 'Buzz' : source === 'hanteo' ? 'Album' : 'Music';
    if (!confirm(`${artistName}의 ${sourceLabel} 데이터를 재수집하시겠습니까?`)) return;
    const key = `${wikiEntryId}-${source}`;
    setRecollecting(key);
    try {
      // 수집 전 최신 스냅샷 시각 기록 (소스별 관련 플랫폼 전체)
      const sourcePlatformMap: Record<string, string[]> = {
        youtube: ['youtube', 'youtube_music'],
        buzz: ['buzz_multi', 'naver_news'],
        hanteo: ['hanteo'],
        music: ['lastfm', 'deezer', 'youtube_music'],
      };
      const watchPlatforms = sourcePlatformMap[source] || [source];
      const beforeTime = await getLatestSnapshotTime(watchPlatforms, wikiEntryId);

      const { error } = await supabase.functions.invoke('ktrenz-data-collector', {
        body: { source, wikiEntryId },
      });
      if (error) throw error;

      const reflected = await waitForSnapshotUpdate({
        platforms: watchPlatforms,
        beforeTime,
        wikiEntryId,
        timeoutMs: 35000,
        intervalMs: 2000,
      });

      await queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      await queryClient.invalidateQueries({ queryKey: ['data-detail-metrics'] });
      await queryClient.refetchQueries({ queryKey: ['admin-artist-tiers'], type: 'active' });
      await queryClient.refetchQueries({ queryKey: ['data-detail-metrics'], type: 'active' });

      if (reflected) {
        toast.success(`${artistName} ${sourceLabel} 반영 완료`);
      } else {
        toast.success(`${artistName} ${sourceLabel} 수집 실행됨`, {
          description: '백그라운드 처리 중입니다. 잠시 후 리스트에 반영됩니다.',
        });
      }
    } catch (err: any) {
      toast.error(`수집 실패: ${err.message}`);
    } finally {
      setRecollecting(null);
    }
  };

  const CollectionBadge = ({ label, dateStr, wikiEntryId, artistName }: { label: string; dateStr?: string | null; wikiEntryId: string; artistName: string }) => {
    const sourceMap: Record<string, string> = { 'YT': 'youtube', 'Buzz': 'buzz', 'Music': 'music', 'Album': 'hanteo' };
    const source = sourceMap[label] || label;
    const key = `${wikiEntryId}-${source}`;
    const isRunning = recollecting === key;

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerSingleCollection(source, wikiEntryId, artistName);
    };

    if (!dateStr) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant="destructive"
              className="text-[10px] px-1 py-0 gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleClick}
            >
              {isRunning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <AlertTriangle className="w-2.5 h-2.5" />}{label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{label} 수집 기록 없음 · 클릭하여 재수집</p></TooltipContent>
        </Tooltip>
      );
    }
    const stale = getHoursAgo(dateStr) > STALE_HOURS;
    if (!stale) return null;
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 gap-0.5 border-yellow-500/50 text-yellow-600 cursor-pointer hover:bg-yellow-500/10 transition-colors"
            onClick={handleClick}
          >
            {isRunning ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <AlertTriangle className="w-2.5 h-2.5" />}{label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent><p>{label} 마지막: {formatAgo(dateStr)} · 클릭하여 재수집</p></TooltipContent>
      </Tooltip>
    );
  };

  const DataStatus = ({ collection, wikiEntryId, artistName }: { collection: CollectionStatus; wikiEntryId: string; artistName: string }) => {
    const badges = [
      { label: 'YT', dateStr: collection.youtube },
      { label: 'Buzz', dateStr: collection.buzz_multi },
      { label: 'Album', dateStr: collection.hanteo },
      { label: 'Music', dateStr: collection.lastfm || collection.deezer },
    ];
    const issues = badges.filter(b => !b.dateStr || getHoursAgo(b.dateStr) > STALE_HOURS);
    if (issues.length === 0) return <span className="text-xs text-emerald-500">✓</span>;
    return (
      <div className="flex gap-0.5 flex-wrap justify-center">
        {issues.map(b => <CollectionBadge key={b.label} label={b.label} dateStr={b.dateStr} wikiEntryId={wikiEntryId} artistName={artistName} />)}
      </div>
    );
  };

  const DetailScoreCell = ({ value, change, source, wikiEntryId, artistName, metrics, artist }: { 
    value?: number | null; change?: number | null; source: string; wikiEntryId: string; artistName: string; metrics?: SnapshotMetrics; artist: ArtistTier 
  }) => {
    const changeEl = change != null ? (
      <span className={`text-[9px] ${change > 0 ? 'text-emerald-500' : change < -5 ? 'text-red-500' : 'text-muted-foreground'}`}>
        {change > 0 ? '+' : ''}{change.toFixed(1)}%
      </span>
    ) : null;

    return (
      <button
        className="text-right font-mono text-xs text-muted-foreground cursor-pointer w-full"
        onClick={() => setDataDetailOpen({ wikiEntryId, source })}
      >
        <div className="flex flex-col items-end">
          <span>{value?.toLocaleString() ?? '—'}</span>
          {changeEl}
        </div>
      </button>
    );
  };

  const RankTable = ({ items, tierNum }: { items: ArtistTier[]; tierNum: number }) => (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent transition-none">
            <TableHead className="w-10">#</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Energy</TableHead>
            <TableHead className="text-center">24h</TableHead>
            <TableHead className="text-right">YT</TableHead>
            <TableHead className="text-right">Buzz</TableHead>
            <TableHead className="text-right">Album</TableHead>
            <TableHead className="text-right">Music</TableHead>
            <TableHead className="text-center">수집</TableHead>
            <TableHead className="text-center">Override</TableHead>
            <TableHead className="text-center w-20">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a, idx) => (
            <TableRow key={a.wiki_entry_id} className="hover:bg-transparent transition-none">
              <TableCell className="font-medium text-muted-foreground text-xs">{idx + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="w-7 h-7 rounded-lg">
                    <AvatarImage src={a.image_url || undefined} className="object-cover" />
                    <AvatarFallback className="rounded-lg text-[10px]">{a.title.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm truncate max-w-[120px]">{a.title}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold">{a.scores?.total_score?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-sm">{a.scores?.energy_score?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="text-center"><ChangeIndicator value={a.scores?.energy_change_24h} artist={a} /></TableCell>
              <TableCell><DetailScoreCell value={a.scores?.youtube_score} change={a.scores?.youtube_change_24h} source="youtube" wikiEntryId={a.wiki_entry_id} artistName={a.title} metrics={a.metrics} artist={a} /></TableCell>
              <TableCell><DetailScoreCell value={a.scores?.buzz_score} change={a.scores?.buzz_change_24h} source="buzz" wikiEntryId={a.wiki_entry_id} artistName={a.title} metrics={a.metrics} artist={a} /></TableCell>
              <TableCell><DetailScoreCell value={a.scores?.album_sales_score} change={a.scores?.album_change_24h} source="hanteo" wikiEntryId={a.wiki_entry_id} artistName={a.title} metrics={a.metrics} artist={a} /></TableCell>
              <TableCell><DetailScoreCell value={a.scores?.music_score} change={a.scores?.music_change_24h} source="music" wikiEntryId={a.wiki_entry_id} artistName={a.title} metrics={a.metrics} artist={a} /></TableCell>
              <TableCell className="text-center"><DataStatus collection={a.collection} wikiEntryId={a.wiki_entry_id} artistName={a.title} /></TableCell>
              <TableCell className="text-center">
                {a.is_manual_override ? (
                  <Badge
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-destructive/20 transition-colors"
                    onClick={() => removeOverrideMutation.mutate({ wiki_entry_id: a.wiki_entry_id })}
                    title="클릭하면 오버라이드 해제"
                  >
                    Manual ✕
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Auto</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={toggleTierMutation.isPending}
                  onClick={() => toggleTierMutation.mutate({ wiki_entry_id: a.wiki_entry_id, newTier: tierNum === 1 ? 2 : 1 })}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  T{tierNum === 1 ? 2 : 1}
                </Button>
              </TableCell>
              <TableCell className="text-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  disabled={removeArtistMutation.isPending}
                  onClick={() => {
                    if (confirm(`${a.title}을(를) 티어에서 제거하시겠습니까?`)) {
                      removeArtistMutation.mutate({ wiki_entry_id: a.wiki_entry_id });
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow className="hover:bg-transparent transition-none">
              <TableCell colSpan={13} className="text-center text-muted-foreground py-8">No artists in this tier</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  // 수집 이상 아티스트 수 카운트
  const staleCount = tier1.filter(a => {
    const c = a.collection;
    const musicDate = c.lastfm || c.deezer;
    return !c.youtube || !c.buzz_multi || !musicDate || !c.hanteo ||
      getHoursAgo(c.youtube!) > STALE_HOURS ||
      getHoursAgo(c.buzz_multi!) > STALE_HOURS ||
      getHoursAgo(musicDate!) > STALE_HOURS ||
      getHoursAgo(c.hanteo!) > STALE_HOURS;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">아티스트 랭킹</h1>
          <p className="text-sm text-muted-foreground mt-1">데이터 엔진에 연결된 아티스트 티어 및 스코어 관리</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ytQuota && (
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="outline"
                  className={`gap-1 text-xs ${
                    ytQuota.estimatedQuota > ytQuota.dailyLimit * 0.8
                      ? 'border-destructive/50 text-destructive'
                      : ytQuota.estimatedQuota > ytQuota.dailyLimit * 0.5
                        ? 'border-yellow-500/50 text-yellow-600'
                        : 'border-emerald-500/50 text-emerald-600'
                  }`}
                >
                  ▶ YT {ytQuota.estimatedQuota.toLocaleString()} / {ytQuota.dailyLimit.toLocaleString()}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>오늘 YouTube API 쿼터 (추정)</p>
                <p className="text-xs text-muted-foreground">수집 {ytQuota.collections}회 × ~{Math.round(ytQuota.estimatedQuota / (ytQuota.collections || 1))} units</p>
              </TooltipContent>
            </Tooltip>
          )}
          {staleCount > 0 && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-600 gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              수집 지연 {staleCount}개
            </Badge>
          )}
          {/* 전체 수집 + 스케줄 그룹 */}
          <div className="flex items-center gap-0">
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-r-none"
              disabled={!!runningSource}
              onClick={() => triggerCollection('all')}
            >
              {runningSource === 'all' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              전체 수집
            </Button>
            <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className={`h-8 text-xs px-2 rounded-l-none border-l border-primary-foreground/20 ${isScheduled ? '' : 'opacity-70'}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {isScheduled && currentSchedule && (
                    <span className="ml-1">{String(currentSchedule.kstHour).padStart(2, '0')}:{String(currentSchedule.minute).padStart(2, '0')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 space-y-3" align="end">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    일일 자동 수집
                  </span>
                  <Switch
                    checked={isScheduled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        scheduleMutation.mutate({ action: 'set', hour: scheduleHour, minute: scheduleMinute });
                      } else {
                        scheduleMutation.mutate({ action: 'clear' });
                      }
                    }}
                    disabled={scheduleMutation.isPending}
                  />
                </div>
                {isScheduled && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                    ✓ 매일 {currentSchedule ? `${String(currentSchedule.kstHour).padStart(2, '0')}:${String(currentSchedule.minute).padStart(2, '0')}` : '...'} KST 자동 실행
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Select
                    value={String(isScheduled && currentSchedule ? currentSchedule.kstHour : scheduleHour)}
                    onValueChange={(v) => setScheduleHour(parseInt(v))}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}시</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select
                    value={String(isScheduled && currentSchedule ? currentSchedule.minute : scheduleMinute)}
                    onValueChange={(v) => setScheduleMinute(parseInt(v))}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                        <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}분</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">KST</span>
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={scheduleMutation.isPending}
                  onClick={() => {
                    scheduleMutation.mutate({ action: 'set', hour: scheduleHour, minute: scheduleMinute });
                    setScheduleOpen(false);
                  }}
                >
                  {scheduleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  스케줄 저장
                </Button>
              </PopoverContent>
            </Popover>
          </div>
          {['youtube', 'album', 'music', 'buzz'].map((src) => (
            <Button
              key={src}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!!runningSource}
              onClick={() => triggerCollection(src)}
            >
              {runningSource === src ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {src === 'album' ? 'Album' : src.charAt(0).toUpperCase() + src.slice(1)}
            </Button>
          ))}
          {/* 한터 URL 설정 */}
          <Popover open={hanteoConfigOpen} onOpenChange={(open) => {
            setHanteoConfigOpen(open);
            if (open && hanteoConfig?.hanteo_chart_url) {
              setHanteoUrlInput(hanteoConfig.hanteo_chart_url);
            }
          }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs px-2">
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-3 space-y-3" align="end">
              <div className="space-y-1">
                <span className="text-sm font-semibold">한터 차트 수집 URL</span>
                <p className="text-[11px] text-muted-foreground">앨범 판매 데이터를 수집할 한터차트 URL을 입력하세요</p>
              </div>
              <Input
                value={hanteoUrlInput}
                onChange={(e) => setHanteoUrlInput(e.target.value)}
                placeholder="https://www.hanteochart.com/..."
                className="text-xs h-8"
              />
              {hanteoConfig?.updated_at && (
                <p className="text-[10px] text-muted-foreground">마지막 변경: {formatAgo(hanteoConfig.updated_at)}</p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  disabled={updateHanteoUrlMutation.isPending || !hanteoUrlInput}
                  onClick={() => updateHanteoUrlMutation.mutate(hanteoUrlInput)}
                >
                  {updateHanteoUrlMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  저장
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setHanteoUrlInput('https://www.hanteochart.com/honors/initial');
                  }}
                >
                  초기화
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            variant="outline"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            아티스트 등록
          </Button>
        </div>
      </div>

      {/* Pipeline Progress Banner */}
      {pipelineRunId && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!pipelineRun ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : pipelineRun.status === 'completed' ? (
                <span className="text-lg">✅</span>
              ) : pipelineRun.status === 'failed' ? (
                <span className="text-lg">❌</span>
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
              <span className="text-sm font-semibold">
                {!pipelineRun ? '파이프라인 시작 중...' : pipelineRun.status === 'completed' ? '파이프라인 완료' : pipelineRun.status === 'failed' ? '파이프라인 실패' : `실행 중: ${pipelineRun.current_module?.toUpperCase() || '...'}`}
              </span>
              {pipelineStartTime && (
                <span className="text-xs text-muted-foreground">
                  ({finalElapsed !== null ? `${finalElapsed}s 소요` : `${elapsed}s 경과`})
                </span>
              )}
              {pipelineRun?.started_at && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  · 시작: {new Date(pipelineRun.started_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setPipelineRunId(null); setPipelineStartTime(null); setRunningSource(null); }}>
              <X className="w-3 h-3" />
            </Button>
          </div>

          {/* Module progress steps */}
          {pipelineRun?.modules_requested ? (
            <div className="space-y-1.5">
              {(pipelineRun.modules_requested as string[]).map((mod: string, i: number) => {
                const isCurrent = pipelineRun.current_module === mod;
                const results = pipelineRun.results as Record<string, any> | null;
                const modResult = results?.[mod];
                const hasError = modResult && typeof modResult === 'object' && 'error' in modResult;
                const isDone = results && mod in results && !hasError;
                const isFailed = (pipelineRun.status === 'failed' && isCurrent) || hasError;

                const moduleLabel: Record<string, string> = {
                  youtube: 'YouTube 데이터',
                  music: 'Music (Last.fm / Deezer)',
                  hanteo: 'Album (한터차트)',
                  buzz: 'Buzz (소셜 멘션)',
                  energy: 'Energy Score 계산',
                };

                const getLiveCount = (mod: string): string => {
                  if (!liveStats?.platformCounts) return '';
                  const pc = liveStats.platformCounts;
                  if (mod === 'youtube') return pc['youtube'] ? `${pc['youtube']}개 아티스트 수집됨` : '';
                  if (mod === 'music') {
                    const lf = pc['lastfm'] || 0;
                    const dz = pc['deezer'] || 0;
                    if (lf || dz) return `Last.fm ${lf} · Deezer ${dz} 수집됨`;
                    return '';
                  }
                  if (mod === 'hanteo') return pc['hanteo'] ? `${pc['hanteo']}개 아티스트 수집됨` : '';
                  if (mod === 'buzz') return pc['buzz_multi'] ? `${pc['buzz_multi']}개 아티스트 수집됨` : '';
                  if (mod === 'energy') return '';
                  return '';
                };

                const getBuzzSourceDetail = (): string => {
                  if (mod !== 'buzz' || !liveStats?.buzzSources) return '';
                  const bs = liveStats.buzzSources;
                  const sourceLabels: Record<string, string> = {
                    x_twitter: 'X', news: 'News', reddit: 'Reddit',
                    youtube: 'YT', naver: 'Naver', tiktok: 'TikTok',
                  };
                  const parts = Object.entries(bs)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `${sourceLabels[k] || k} ${v}`);
                  return parts.length > 0 ? parts.join(' · ') : '';
                };

                const liveCount = getLiveCount(mod);
                const buzzDetail = getBuzzSourceDetail();

                return (
                  <div
                    key={mod}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      isDone ? 'bg-emerald-500/10 border-emerald-500/20' :
                      isFailed ? 'bg-destructive/10 border-destructive/20' :
                      isCurrent ? 'bg-primary/10 border-primary/30' :
                      'bg-card/30 border-border/30 opacity-50'
                    }`}
                  >
                    <div className="w-5 text-center shrink-0">
                      {isDone ? <span className="text-sm">✓</span> :
                       isFailed ? <span className="text-destructive text-sm">✕</span> :
                       isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> :
                       <span className="text-[11px] text-muted-foreground">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${isDone ? 'text-emerald-600' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                        {moduleLabel[mod] || mod}
                      </p>
                      {liveCount && (
                        <p className="text-[10px] mt-0.5 text-muted-foreground">📊 {liveCount}</p>
                      )}
                      {buzzDetail && (
                        <p className="text-[10px] mt-0.5 text-muted-foreground">🔍 {buzzDetail}</p>
                      )}
                      {hasError && modResult?.error && (
                        <p className="text-[10px] mt-0.5 text-destructive">⚠️ {String(modResult.error).slice(0, 120)}</p>
                      )}
                      {isCurrent && pipelineRun.status === 'running' && !liveCount && (
                        <p className="text-[10px] text-primary/70 mt-0.5 animate-pulse">처리 중...</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">모듈 정보 로딩 중...</div>
          )}

          {pipelineRun?.error_message && (
            <p className="text-xs text-destructive mt-1">{pipelineRun.error_message}</p>
          )}

          {/* Collapsible detailed results after completion */}
          {pipelineRun?.status === 'completed' && pipelineRun.results && (
            <Collapsible open={resultsExpanded} onOpenChange={setResultsExpanded}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline mt-2 w-full">
                  {resultsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  수집 결과 상세 보기
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {(() => {
                  const r = pipelineRun.results as Record<string, any>;
                  const moduleLabels: Record<string, string> = {
                    youtube: '📺 YouTube', music: '🎵 Music', hanteo: '💿 Album (Hanteo)',
                    buzz: '📢 Buzz', energy: '⚡ Energy',
                  };
                  return Object.entries(r).map(([mod, result]) => (
                    <div key={mod} className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1.5">
                      <p className="text-xs font-bold">{moduleLabels[mod] || mod}</p>
                      {/* YouTube result */}
                      {mod === 'youtube' && (
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>상태: <span className="text-foreground font-medium">{result.status || result.module || '—'}</span></p>
                          {liveStats?.platformCounts?.youtube && <p>수집 아티스트: <span className="text-foreground font-medium">{liveStats.platformCounts.youtube}개</span></p>}
                        </div>
                      )}
                      {/* Music result */}
                      {mod === 'music' && (
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>상태: <span className="text-foreground font-medium">{result.status || result.module || '—'}</span></p>
                          {liveStats?.platformCounts && (
                            <>
                              {liveStats.platformCounts.lastfm && <p>Last.fm: <span className="text-foreground font-medium">{liveStats.platformCounts.lastfm}개 아티스트</span></p>}
                              {liveStats.platformCounts.deezer && <p>Deezer: <span className="text-foreground font-medium">{liveStats.platformCounts.deezer}개 아티스트</span></p>}
                              {liveStats.platformCounts.youtube_music && <p>YouTube Music: <span className="text-foreground font-medium">{liveStats.platformCounts.youtube_music}개 아티스트</span></p>}
                            </>
                          )}
                        </div>
                      )}
                      {/* Hanteo result */}
                      {mod === 'hanteo' && (
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>상태: <span className="text-foreground font-medium">{result.status || result.module || '—'}</span></p>
                          {liveStats?.platformCounts?.hanteo && <p>수집 아티스트: <span className="text-foreground font-medium">{liveStats.platformCounts.hanteo}개</span></p>}
                        </div>
                      )}
                      {/* Buzz result */}
                      {mod === 'buzz' && (
                        <div className="text-[11px] text-muted-foreground space-y-1">
                          <p>배치: <span className="text-foreground font-medium">{result.totalBatches || '—'}개</span> · 발행: <span className="text-foreground font-medium">{result.launched || '—'}개</span> · 배치크기: <span className="text-foreground font-medium">{result.batchSize || '—'}</span></p>
                          {liveStats?.platformCounts?.buzz_multi && <p>수집 아티스트: <span className="text-foreground font-medium">{liveStats.platformCounts.buzz_multi}개</span></p>}
                          {liveStats?.buzzSources && Object.keys(liveStats.buzzSources).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {Object.entries(liveStats.buzzSources).map(([source, count]) => {
                                const labels: Record<string, string> = {
                                  x_twitter: '𝕏 Twitter', news: '📰 News', reddit: '💬 Reddit',
                                  naver: '🇰🇷 Naver', tiktok: '🎵 TikTok', yt_comments: '💬 YT댓글',
                                };
                                return (
                                  <span key={source} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium">
                                    {labels[source] || source}: <span className="text-foreground">{(count as number).toLocaleString()}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Energy result */}
                      {mod === 'energy' && (
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <p>처리: <span className="text-foreground font-medium">{result.processed || '—'}개 아티스트</span></p>
                          <p>성공: <span className="text-foreground font-medium">{result.success ? '✓' : '—'}</span></p>
                          {result.sample && Array.isArray(result.sample) && result.sample.length > 0 && (
                            <div className="mt-1">
                              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">샘플 (상위 {result.sample.length}개):</p>
                              <div className="flex flex-wrap gap-1">
                                {result.sample.map((s: any, idx: number) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px]">
                                    ⚡{s.energy || '—'}
                                    {s.change != null && <span className={s.change > 0 ? 'text-emerald-500' : s.change < 0 ? 'text-destructive' : ''}>({s.change > 0 ? '+' : ''}{s.change}%)</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Fallback for unknown modules */}
                      {!['youtube', 'music', 'hanteo', 'buzz', 'energy'].includes(mod) && (
                        <pre className="text-[10px] text-muted-foreground overflow-auto max-h-20">{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  ));
                })()}

                {/* Total snapshots summary */}
                {liveStats && (
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                    총 스냅샷: <span className="text-foreground font-medium">{liveStats.totalSnapshots}개</span>
                    {pipelineRun.started_at && pipelineRun.completed_at && (
                      <> · 소요시간: <span className="text-foreground font-medium">{Math.round((new Date(pipelineRun.completed_at).getTime() - new Date(pipelineRun.started_at).getTime()) / 1000)}초</span></>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      <Tabs defaultValue="tier1">
        <TabsList>
          <TabsTrigger value="tier1" className="gap-2">
            <Crown className="w-4 h-4" />
            Tier 1 ({tier1.length})
          </TabsTrigger>
          <TabsTrigger value="tier2" className="gap-2">
            <Star className="w-4 h-4" />
            Tier 2 ({tier2.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tier1" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">YouTube/Buzz 데이터 수집 및 에너지 스코어 계산 대상 · Total Score 순 정렬</p>
          <RankTable items={tier1} tierNum={1} />
        </TabsContent>
        <TabsContent value="tier2" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">데이터 수집 미대상 아티스트</p>
          <RankTable items={tier2} tierNum={2} />
        </TabsContent>
      </Tabs>

      {/* Add Artist Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setSearchQuery(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>아티스트 등록</DialogTitle>
            <DialogDescription>wiki_entries에서 아티스트를 검색하여 v3 티어에 등록합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="아티스트 이름 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={selectedTier === 1 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTier(1)}
                  className="h-9 text-xs"
                >
                  Tier 1
                </Button>
                <Button
                  variant={selectedTier === 2 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTier(2)}
                  className="h-9 text-xs"
                >
                  Tier 2
                </Button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {searchLoading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">검색 결과 없음</p>
              )}
              {searchResults.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8 rounded-lg">
                      <AvatarImage src={entry.image_url || undefined} className="object-cover" />
                      <AvatarFallback className="rounded-lg text-[10px]">{entry.title.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{entry.title}</p>
                      <p className="text-[11px] text-muted-foreground">{entry.schema_type} · score {entry.trending_score?.toLocaleString()}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={addArtistMutation.isPending}
                    onClick={() => addArtistMutation.mutate({ wiki_entry_id: entry.id, tier: selectedTier })}
                  >
                    <Plus className="w-3 h-3" />
                    T{selectedTier} 등록
                  </Button>
                </div>
              ))}
              {searchQuery.length < 2 && (
                <p className="text-sm text-muted-foreground text-center py-4">2글자 이상 입력하세요</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailArtist} onOpenChange={(open) => !open && setDetailArtist(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailArtist?.image_url && (
                <Avatar className="w-6 h-6 rounded-md">
                  <AvatarImage src={detailArtist.image_url} className="object-cover" />
                  <AvatarFallback className="rounded-md text-[9px]">{detailArtist?.title.slice(0, 2)}</AvatarFallback>
                </Avatar>
              )}
              {detailArtist?.title} — Energy 변동 분석
            </DialogTitle>
          </DialogHeader>

          {snapshotsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {/* Current vs 24h ago comparison */}
              {energySnapshots.length >= 2 && (() => {
                const latest = energySnapshots[0];
                // 어제(24h 전) 기준 스냅샷 — 없으면 표시하지 않음
                const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const prev = energySnapshots.find(s => new Date(s.snapshot_at) <= cutoff);
                if (!prev) return (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">24시간 이전 스냅샷이 없어 비교 불가</p>
                  </div>
                );
                const avgVelLatest = ((latest.youtube_velocity ?? 0) + (latest.buzz_velocity ?? 0) + (latest.album_velocity ?? 0) + (latest.music_velocity ?? 0)) / 4;
                const avgVelPrev = ((prev.youtube_velocity ?? 0) + (prev.buzz_velocity ?? 0) + (prev.album_velocity ?? 0) + (prev.music_velocity ?? 0)) / 4;
                const avgIntLatest = ((latest.youtube_intensity ?? 0) + (latest.buzz_intensity ?? 0) + (latest.album_intensity ?? 0) + (latest.music_intensity ?? 0)) / 4;
                const avgIntPrev = ((prev.youtube_intensity ?? 0) + (prev.buzz_intensity ?? 0) + (prev.album_intensity ?? 0) + (prev.music_intensity ?? 0)) / 4;
                const velDiff = avgVelLatest - avgVelPrev;
                const intDiff = avgIntLatest - avgIntPrev;
                const enDiff = (latest.energy_score ?? 0) - (prev.energy_score ?? 0);

                const DiffRow = ({ label, current, diff, desc }: { label: string; current: number; diff: number; desc: string }) => (
                  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm">{current}</p>
                      <p className={`text-xs font-medium ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} {Math.abs(diff).toFixed(1)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      최근 vs 어제 (~{Math.round(getHoursAgo(prev.snapshot_at))}h 전 스냅샷)
                    </p>
                    <DiffRow label="Avg Velocity" current={Math.round(avgVelLatest)} diff={velDiff} desc="카테고리별 변화 속도 평균" />
                    <DiffRow label="Avg Intensity" current={Math.round(avgIntLatest)} diff={intDiff} desc="카테고리별 절대 수준 평균" />
                    <DiffRow label="Energy Score" current={latest.energy_score} diff={enDiff} desc="종합 에너지 (가중 합산)" />
                  </div>
                );
              })()}

              {/* EMA Baselines */}
              {energyBaseline && (
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">EMA 베이스라인</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">구분</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">7일 EMA</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">30일 EMA</p>
                    </div>
                    {[
                      { label: 'Velocity', v7: energyBaseline.avg_velocity_7d, v30: energyBaseline.avg_velocity_30d },
                      { label: 'Intensity', v7: energyBaseline.avg_intensity_7d, v30: energyBaseline.avg_intensity_30d },
                      { label: 'Energy', v7: energyBaseline.avg_energy_7d, v30: energyBaseline.avg_energy_30d },
                    ].map(row => (
                      <div key={row.label} className="contents">
                        <p className="text-xs font-medium text-left">{row.label}</p>
                        <p className="font-mono text-xs">{Number(row.v7 ?? 0).toFixed(1)}</p>
                        <p className="font-mono text-xs">{Number(row.v30 ?? 0).toFixed(1)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent snapshots timeline */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">최근 스냅샷</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {energySnapshots.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                      <span className="text-muted-foreground">{formatAgo(s.snapshot_at)}</span>
                      <div className="flex gap-3 font-mono">
                        <span>YT-V:{s.youtube_velocity}</span>
                        <span>BZ-V:{s.buzz_velocity}</span>
                        <span className="font-medium">E:{s.energy_score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Data Detail Modal */}
      <Dialog open={!!dataDetailOpen} onOpenChange={(open) => !open && setDataDetailOpen(null)}>
        <DialogContent className="max-w-lg">
          {dataDetailOpen && (() => {
            const { wikiEntryId, source } = dataDetailOpen;
            const artist = artists.find((a) => a.wiki_entry_id === wikiEntryId);
            if (!artist) return null;
            const m = dataDetailMetrics || artist.metrics;
            const sourceLabels: Record<string, string> = { youtube: 'YouTube', buzz: 'Buzz (소셜)', hanteo: 'Album (한터+차트)', music: 'Music' };
            // Album은 hanteo + apple_music_charts + billboard_charts 중 가장 최근 것 사용
            const collectionDate = source === 'youtube' ? artist.collection.youtube
              : source === 'buzz' ? artist.collection.buzz_multi
              : source === 'hanteo' ? (
                  [artist.collection.hanteo, (artist.collection as any).apple_music_charts, (artist.collection as any).billboard_charts]
                    .filter(Boolean)
                    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null
                )
              : artist.collection.lastfm || artist.collection.deezer;
            const key = `${artist.wiki_entry_id}-${source}`;
            const isRunning = recollecting === key;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Avatar className="w-6 h-6 rounded-md">
                      <AvatarImage src={artist.image_url || undefined} className="object-cover" />
                      <AvatarFallback className="rounded-md text-[9px]">{artist.title.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    {artist.title} — {sourceLabels[source] || source}
                  </DialogTitle>
                  <DialogDescription>
                    {collectionDate ? `마지막 수집: ${formatAgo(collectionDate)} (${new Date(collectionDate).toLocaleString('ko-KR')})` : '수집 기록 없음'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Score summary with baseline */}
                  {(() => {
                    const currentScore = source === 'youtube' ? artist.scores?.youtube_score
                      : source === 'buzz' ? artist.scores?.buzz_score
                      : source === 'hanteo' ? artist.scores?.album_sales_score
                      : artist.scores?.music_score;
                    const baselineScore = dataDetailBaseline
                      ? (source === 'youtube' ? dataDetailBaseline.youtube_score
                        : source === 'buzz' ? dataDetailBaseline.buzz_score
                        : source === 'hanteo' ? dataDetailBaseline.album_score
                        : dataDetailBaseline.music_score)
                      : null;
                    const ch = source === 'youtube' ? artist.scores?.youtube_change_24h
                      : source === 'buzz' ? artist.scores?.buzz_change_24h
                      : source === 'hanteo' ? artist.scores?.album_change_24h
                      : artist.scores?.music_change_24h;

                    return (
                      <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">현재 스코어</p>
                            <p className="text-2xl font-bold font-mono">{currentScore?.toLocaleString() ?? '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">24h 변동 (vs 이전 스냅샷)</p>
                            {ch == null
                              ? <p className="text-lg font-mono text-muted-foreground">—</p>
                              : <p className={`text-lg font-mono font-bold ${ch > 0 ? 'text-emerald-500' : ch < -5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                  {ch > 0 ? '+' : ''}{ch.toFixed(1)}%
                                </p>
                            }
                          </div>
                        </div>
                        {/* Baseline info */}
                        <div className="border-t border-border/50 pt-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">📌 베이스라인</span>
                            <span className="font-mono font-medium">{baselineScore != null ? Number(baselineScore).toLocaleString() : '없음'}</span>
                          </div>
                          {dataDetailBaseline?.snapshot_at && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              기준 시점: {formatAgo(dataDetailBaseline.snapshot_at)} ({new Date(dataDetailBaseline.snapshot_at).toLocaleString('ko-KR')})
                            </p>
                          )}
                          {baselineScore != null && currentScore != null && Number(baselineScore) > 0 && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground">차이:</span>
                              <span className={`text-xs font-mono font-medium ${currentScore - Number(baselineScore) > 0 ? 'text-emerald-500' : currentScore - Number(baselineScore) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                {currentScore - Number(baselineScore) > 0 ? '+' : ''}{(currentScore - Number(baselineScore)).toLocaleString()}
                                {' '}({(((currentScore - Number(baselineScore)) / Number(baselineScore)) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* YouTube Details */}
                  {source === 'youtube' && m.youtube && (
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">YouTube 상세 데이터</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground">구독자</p>
                          <p className="text-sm font-mono font-medium">{(m.youtube.subscriberCount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">총 조회수</p>
                          <p className="text-sm font-mono font-medium">{(m.youtube.totalViewCount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">최근 영상 조회수 합</p>
                          <p className="text-sm font-mono font-medium">{(m.youtube.recentTotalViews || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {source === 'youtube' && !m.youtube && (
                    <p className="text-sm text-muted-foreground text-center py-4">YouTube 메트릭 데이터 없음</p>
                  )}

                  {/* Buzz Details */}
                  {source === 'buzz' && m.buzz_multi && (
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground">Buzz 상세 데이터</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground">총 멘션</p>
                          <p className="text-sm font-mono font-medium">{(m.buzz_multi.total_mentions || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">감성 점수</p>
                          <p className="text-sm font-mono font-medium">{m.buzz_multi.sentiment_score ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">버즈 스코어</p>
                          <p className="text-sm font-mono font-medium">{m.buzz_multi.buzz_score?.toLocaleString() ?? '—'}</p>
                        </div>
                      </div>
                      {m.buzz_multi.source_breakdown && m.buzz_multi.source_breakdown.length > 0 && (
                        <div className="space-y-1.5 border-t border-border/50 pt-2">
                          <p className="text-[10px] font-semibold text-muted-foreground">소스별 분포</p>
                          {(() => {
                            const labels: Record<string, string> = { x_twitter: '𝕏 Twitter', news: '📰 News', reddit: '💬 Reddit', naver: '🇰🇷 Naver', tiktok: '🎵 TikTok', yt_comments: '💬 YT댓글' };
                            return m.buzz_multi!.source_breakdown!.map((s: any) => (
                              <div key={s.source} className="flex items-center justify-between text-xs">
                                <span>{labels[s.source] || s.source}</span>
                                <div className="flex items-center gap-3 font-mono">
                                  <span className="text-muted-foreground">멘션 <span className="text-foreground font-medium">{s.mentions}</span></span>
                                  <span className="text-muted-foreground">가중 <span className="text-foreground font-medium">{s.weighted}</span></span>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                  {source === 'buzz' && !m.buzz_multi && (
                    <p className="text-sm text-muted-foreground text-center py-4">Buzz 메트릭 데이터 없음</p>
                  )}

                  {/* Album Details (Multi-source: Hanteo + Apple Music + Billboard) */}
                  {source === 'hanteo' && (
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground">앨범 스코어 구성</p>
                      <p className="text-[10px] text-muted-foreground">= Hanteo 실판매 + Apple Music 차트 + Billboard 차트 합산</p>

                      {/* Hanteo */}
                      {m.hanteo && m.hanteo.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">📦 한터차트</p>
                          <div className="space-y-1.5">
                            {m.hanteo.map((h: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{h.album || '—'}</p>
                                  <p className="text-[10px] text-muted-foreground">{h.artist || '—'}</p>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <p className="font-mono font-medium">{(h.first_week_sales || 0).toLocaleString()}</p>
                                  <p className="text-[10px] text-muted-foreground">초동</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">한터차트 데이터 없음</p>
                      )}

                      {/* Apple Music Charts */}
                      {(m as any).apple_music_charts ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">🍎 Music Charts</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(m as any).apple_music_charts.rank != null && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">순위</p>
                                <p className="text-sm font-mono font-medium">#{(m as any).apple_music_charts.rank}</p>
                              </div>
                            )}
                            {(m as any).apple_music_charts.bonus != null && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">보너스 점수</p>
                                <p className="text-sm font-mono font-medium">+{(m as any).apple_music_charts.bonus}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Apple Music 차트 데이터 없음</p>
                      )}

                      {/* Billboard Charts */}
                      {(m as any).billboard_charts ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">📊 Billboard Charts</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(m as any).billboard_charts.rank != null && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">순위</p>
                                <p className="text-sm font-mono font-medium">#{(m as any).billboard_charts.rank}</p>
                              </div>
                            )}
                            {(m as any).billboard_charts.bonus != null && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">보너스 점수</p>
                                <p className="text-sm font-mono font-medium">+{(m as any).billboard_charts.bonus}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Billboard 차트 데이터 없음</p>
                      )}

                      {/* Collection timestamps */}
                      <div className="border-t border-border/50 pt-2 space-y-0.5">
                        <p className="text-[10px] font-semibold text-muted-foreground">수집 시각</p>
                        {artist.collection.hanteo && <p className="text-[10px] text-muted-foreground">한터: {formatAgo(artist.collection.hanteo)}</p>}
                        {(artist.collection as any).apple_music_charts && <p className="text-[10px] text-muted-foreground">Apple Music: {formatAgo((artist.collection as any).apple_music_charts)}</p>}
                        {(artist.collection as any).billboard_charts && <p className="text-[10px] text-muted-foreground">Billboard: {formatAgo((artist.collection as any).billboard_charts)}</p>}
                        {!artist.collection.hanteo && !(artist.collection as any).apple_music_charts && !(artist.collection as any).billboard_charts && (
                          <p className="text-[10px] text-muted-foreground">수집 기록 없음</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Music Details */}
                  {source === 'music' && (
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground">Music 상세 데이터</p>
                      {/* YouTube Music */}
                      {m.youtube_music ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">▶ YouTube Music (Topic)</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground">구독자</p>
                              <p className="text-sm font-mono font-medium">{(m.youtube_music.topicSubscribers || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">총 조회수</p>
                              <p className="text-sm font-mono font-medium">{(m.youtube_music.topicTotalViews || 0).toLocaleString()}</p>
                            </div>
                          </div>
                          {m.youtube_music.topTracks && m.youtube_music.topTracks.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                              <p className="text-[10px] text-muted-foreground font-semibold">인기 트랙</p>
                              {m.youtube_music.topTracks.slice(0, 5).map((t: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="truncate flex-1 min-w-0">{i + 1}. {t.title}</span>
                                  <span className="font-mono text-muted-foreground ml-2 shrink-0">{(t.viewCount || 0).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">YouTube Music 데이터 없음</p>
                      )}
                      {/* Last.fm */}
                      {m.lastfm ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Last.fm</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground">리스너</p>
                              <p className="text-sm font-mono font-medium">{(m.lastfm.listeners || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">재생수</p>
                              <p className="text-sm font-mono font-medium">{(m.lastfm.playcount || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Last.fm 데이터 없음</p>
                      )}
                      {/* Deezer */}
                      {m.deezer ? (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Deezer</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground">팬</p>
                              <p className="text-sm font-mono font-medium">{(m.deezer.fans || 0).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">앨범 수</p>
                              <p className="text-sm font-mono font-medium">{m.deezer.nb_album || '—'}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Deezer 데이터 없음</p>
                      )}
                    </div>
                  )}

                  {/* Re-collect button */}
                  <Button
                    className="w-full gap-2"
                    disabled={isRunning}
                    onClick={() => {
                      triggerSingleCollection(source, artist.wiki_entry_id, artist.title);
                    }}
                  >
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {sourceLabels[source] || source} 재수집
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRankings;
