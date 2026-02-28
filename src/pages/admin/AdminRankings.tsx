import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Crown, Star, ArrowUpDown, TrendingUp, TrendingDown, Minus, AlertTriangle, X, Play, RefreshCw, Plus, Search, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ScoreData {
  total_score: number;
  energy_score: number;
  energy_change_24h: number;
  youtube_score: number;
  buzz_score: number;
  album_sales_score: number;
  music_score: number;
  scored_at: string;
}

interface CollectionStatus {
  youtube?: string;
  buzz_multi?: string;
  music?: string;
  lastfm?: string;
  deezer?: string;
  hanteo?: string;
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<1 | 2>(1);
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [pipelineStartTime, setPipelineStartTime] = useState<number | null>(null);
  // Elapsed time counter for pipeline
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!pipelineStartTime || !pipelineRunId) { setElapsed(0); return; }
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - pipelineStartTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pipelineStartTime, pipelineRunId]);

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-artist-tiers'],
    queryFn: async () => {
      const [tiersRes, scoresRes, snapshotsRes] = await Promise.all([
        supabase
          .from('v3_artist_tiers')
          .select('tier, is_manual_override, wiki_entry_id, wiki_entries!inner(title, slug, image_url, schema_type, trending_score)')
          .order('tier', { ascending: true }),
        supabase
          .from('v3_scores_v2')
          .select('wiki_entry_id, total_score, energy_score, energy_change_24h, youtube_score, buzz_score, album_sales_score, music_score, scored_at'),
        supabase
          .from('ktrenz_data_snapshots')
          .select('wiki_entry_id, platform, collected_at')
          .not('wiki_entry_id', 'is', null)
          .order('collected_at', { ascending: false }),
      ]);

      if (tiersRes.error) throw tiersRes.error;

      const scoreMap = new Map<string, ScoreData>();
      (scoresRes.data || []).forEach((s: any) => scoreMap.set(s.wiki_entry_id, s));

      // 아티스트별 플랫폼별 최신 수집 시각
      const collectionMap = new Map<string, CollectionStatus>();
      (snapshotsRes.data || []).forEach((s: any) => {
        if (!s.wiki_entry_id) return;
        const existing = collectionMap.get(s.wiki_entry_id) || {};
        const platform = s.platform as string;
        // 첫 번째(최신) 것만 사용
        if (!existing[platform as keyof CollectionStatus]) {
          existing[platform as keyof CollectionStatus] = s.collected_at;
          collectionMap.set(s.wiki_entry_id, existing);
        }
      });

      return (tiersRes.data || []).map((row: any) => ({
        tier: row.tier,
        is_manual_override: row.is_manual_override,
        wiki_entry_id: row.wiki_entry_id,
        title: row.wiki_entries.title,
        slug: row.wiki_entries.slug,
        image_url: row.wiki_entries.image_url,
        schema_type: row.wiki_entries.schema_type,
        trending_score: row.wiki_entries.trending_score ?? 0,
        scores: scoreMap.get(row.wiki_entry_id) || null,
        collection: collectionMap.get(row.wiki_entry_id) || {},
      })) as ArtistTier[];
    },
  });

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

  const triggerCollection = async (source: string) => {
    setRunningSource(source);
    try {
      if (source === 'all') {
        // 전체 수집: data-engine 오케스트레이터 사용
        const { data, error } = await supabase.functions.invoke('data-engine', {
          body: { module: 'all', triggerSource: 'admin' },
        });
        if (error) throw error;
        // Track pipeline run for progress polling
        if (data?.runId) {
          setPipelineRunId(data.runId);
          setPipelineStartTime(Date.now());
        }
        toast.success('전체 파이프라인 시작됨', {
          description: 'YouTube → Music → Album → Buzz → Energy 순서로 실행됩니다',
        });
        // Don't reset runningSource here - pipeline polling will handle it
      } else {
        // 개별 모듈: data-engine 개별 모듈 호출
        const moduleMap: Record<string, string> = { album: 'hanteo' };
        const mod = moduleMap[source] || source;
        const { data, error } = await supabase.functions.invoke('data-engine', {
          body: { module: mod },
        });
        if (error) throw error;
        toast.success(`${source} 수집 완료`, { description: JSON.stringify(data?.result).slice(0, 100) });
        setRunningSource(null);
      }
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
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
        .select('youtube_velocity, youtube_intensity, buzz_velocity, buzz_intensity, album_velocity, album_intensity, music_velocity, music_intensity, energy_score, snapshot_at')
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
    const inner = value >= 10
      ? <span className="text-emerald-500 flex items-center gap-0.5 text-xs font-medium"><TrendingUp className="w-3 h-3" />+{value.toFixed(1)}%</span>
      : value > -5
        ? <span className="text-muted-foreground flex items-center gap-0.5 text-xs"><Minus className="w-3 h-3" />{value.toFixed(1)}%</span>
        : <span className="text-red-500 flex items-center gap-0.5 text-xs font-medium"><TrendingDown className="w-3 h-3" />{value.toFixed(1)}%</span>;
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
      const { data, error } = await supabase.functions.invoke('ktrenz-data-collector', {
        body: { source, wikiEntryId },
      });
      if (error) throw error;
      toast.success(`${artistName} ${sourceLabel} 수집 완료`);
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
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

  const ScoreCell = ({ value, source, wikiEntryId, artistName }: { value?: number | null; source: string; wikiEntryId: string; artistName: string }) => {
    const key = `${wikiEntryId}-${source}`;
    const isRunning = recollecting === key;
    return (
      <button
        className="text-right font-mono text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors w-full disabled:opacity-50"
        disabled={isRunning}
        onClick={() => triggerSingleCollection(source, wikiEntryId, artistName)}
      >
        {isRunning ? <Loader2 className="w-3 h-3 animate-spin inline" /> : (value?.toLocaleString() ?? '—')}
      </button>
    );
  };

  const RankTable = ({ items, tierNum }: { items: ArtistTier[]; tierNum: number }) => (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={a.wiki_entry_id}>
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
              <TableCell><ScoreCell value={a.scores?.youtube_score} source="youtube" wikiEntryId={a.wiki_entry_id} artistName={a.title} /></TableCell>
              <TableCell><ScoreCell value={a.scores?.buzz_score} source="buzz" wikiEntryId={a.wiki_entry_id} artistName={a.title} /></TableCell>
              <TableCell><ScoreCell value={a.scores?.album_sales_score} source="hanteo" wikiEntryId={a.wiki_entry_id} artistName={a.title} /></TableCell>
              <TableCell><ScoreCell value={a.scores?.music_score} source="music" wikiEntryId={a.wiki_entry_id} artistName={a.title} /></TableCell>
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
            <TableRow>
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
          <h1 className="text-2xl font-bold">Artist Rankings</h1>
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
          {['all', 'youtube', 'album', 'music', 'buzz'].map((src) => (
            <Button
              key={src}
              variant={src === 'all' ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!!runningSource}
              onClick={() => triggerCollection(src)}
            >
              {runningSource === src ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : src === 'all' ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {src === 'all' ? '전체 수집' : src === 'album' ? 'Album' : src.charAt(0).toUpperCase() + src.slice(1)}
            </Button>
          ))}
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
                <span className="text-emerald-500 text-lg">✅</span>
              ) : pipelineRun.status === 'failed' ? (
                <span className="text-destructive text-lg">❌</span>
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
              <span className="text-sm font-semibold">
                {!pipelineRun ? '파이프라인 시작 중...' : pipelineRun.status === 'completed' ? '파이프라인 완료' : pipelineRun.status === 'failed' ? '파이프라인 실패' : `실행 중: ${pipelineRun.current_module?.toUpperCase() || '...'}`}
              </span>
              {pipelineStartTime && (
                <span className="text-xs text-muted-foreground">
                  ({elapsed}s 경과)
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
                const isDone = results && mod in results;
                const isFailed = pipelineRun.status === 'failed' && isCurrent;
                const isPending = !isDone && !isCurrent;
                const modResult = results?.[mod];

                const moduleLabel: Record<string, string> = {
                  youtube: 'YouTube 데이터',
                  music: 'Music (Last.fm / Deezer)',
                  hanteo: 'Album (한터차트)',
                  buzz: 'Buzz (소셜 멘션)',
                  energy: 'Energy Score 계산',
                };

                const getResultSummary = (mod: string, result: any): string => {
                  if (!result) return '';
                  if (result.error) return `오류: ${result.error}`;
                  if (mod === 'youtube') return result.status === 'launched' ? '수집 시작됨' : JSON.stringify(result).slice(0, 60);
                  if (mod === 'music') return result.status === 'launched' ? '수집 시작됨' : JSON.stringify(result).slice(0, 60);
                  if (mod === 'hanteo') return result.status === 'launched' ? '수집 시작됨' : JSON.stringify(result).slice(0, 60);
                  if (mod === 'buzz') return `${result.launched || 0}개 배치 × ${result.batchSize || 5} 아티스트`;
                  if (mod === 'energy') {
                    const scored = result.scored ?? result.processed ?? result.count;
                    if (scored != null) return `${scored}명 스코어 갱신`;
                    return JSON.stringify(result).slice(0, 60);
                  }
                  return JSON.stringify(result).slice(0, 60);
                };

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
                      {isDone ? <span className="text-emerald-500 text-sm">✓</span> :
                       isFailed ? <span className="text-destructive text-sm">✕</span> :
                       isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> :
                       <span className="text-[11px] text-muted-foreground">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${isDone ? 'text-emerald-600' : isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                        {moduleLabel[mod] || mod}
                      </p>
                      {(isDone || isFailed) && modResult && (
                        <p className={`text-[10px] mt-0.5 truncate ${isFailed ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {getResultSummary(mod, modResult)}
                        </p>
                      )}
                      {isCurrent && pipelineRun.status === 'running' && (
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
    </div>
  );
};

export default AdminRankings;
