import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, Star, ArrowUpDown, TrendingUp, TrendingDown, Minus, AlertTriangle, X, Play, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
      const { data, error } = await supabase.functions.invoke('ktrenz-data-collector', {
        body: { source },
      });
      if (error) throw error;
      toast.success(`${source} 수집 완료`, { description: JSON.stringify(data).slice(0, 100) });
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
    } catch (err: any) {
      toast.error(`${source} 수집 실패: ${err.message}`);
    } finally {
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
        .select('velocity_score, intensity_score, energy_score, snapshot_at')
        .eq('wiki_entry_id', detailArtist.wiki_entry_id)
        .order('snapshot_at', { ascending: false })
        .limit(10);
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

  const tier1 = artists.filter(a => a.tier === 1).sort((a, b) => (b.scores?.total_score ?? 0) - (a.scores?.total_score ?? 0));
  const tier2 = artists.filter(a => a.tier === 2).sort((a, b) => b.trending_score - a.trending_score);

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
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">No artists in this tier</TableCell>
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
          {staleCount > 0 && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-600 gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              수집 지연 {staleCount}개
            </Badge>
          )}
          {['all', 'youtube', 'hanteo', 'music', 'buzz'].map((src) => (
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
              {src === 'all' ? '전체 수집' : src.charAt(0).toUpperCase() + src.slice(1)}
            </Button>
          ))}
        </div>
      </div>

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

      {/* Energy Detail Dialog */}
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
                const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const prev = energySnapshots.find(s => new Date(s.snapshot_at) <= cutoff) || energySnapshots[energySnapshots.length - 1];
                const velDiff = (latest.velocity_score ?? 0) - (prev.velocity_score ?? 0);
                const intDiff = (latest.intensity_score ?? 0) - (prev.intensity_score ?? 0);
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
                      최근 vs ~{Math.round(getHoursAgo(prev.snapshot_at))}시간 전
                    </p>
                    <DiffRow label="Velocity" current={latest.velocity_score} diff={velDiff} desc="Buzz 멘션 60% + YouTube 조회 40%" />
                    <DiffRow label="Intensity" current={latest.intensity_score} diff={intDiff} desc="참여도 50% + 감성 가중 멘션 50%" />
                    <DiffRow label="Energy Score" current={latest.energy_score} diff={enDiff} desc="종합 에너지 (백분위 매핑)" />
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
                        <span>V:{s.velocity_score}</span>
                        <span>I:{s.intensity_score}</span>
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
