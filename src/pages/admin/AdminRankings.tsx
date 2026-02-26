import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, Star, ArrowUpDown, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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

  const tier1 = artists.filter(a => a.tier === 1).sort((a, b) => (b.scores?.total_score ?? 0) - (a.scores?.total_score ?? 0));
  const tier2 = artists.filter(a => a.tier === 2).sort((a, b) => b.trending_score - a.trending_score);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const ChangeIndicator = ({ value }: { value: number | null | undefined }) => {
    if (value == null) return <span className="text-muted-foreground">—</span>;
    if (value >= 10) return <span className="text-emerald-500 flex items-center gap-0.5 text-xs font-medium"><TrendingUp className="w-3 h-3" />+{value.toFixed(1)}%</span>;
    if (value > -5) return <span className="text-muted-foreground flex items-center gap-0.5 text-xs"><Minus className="w-3 h-3" />{value.toFixed(1)}%</span>;
    return <span className="text-red-500 flex items-center gap-0.5 text-xs font-medium"><TrendingDown className="w-3 h-3" />{value.toFixed(1)}%</span>;
  };

  const CollectionBadge = ({ label, dateStr }: { label: string; dateStr?: string }) => {
    if (!dateStr) {
      return (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />{label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{label} 데이터 수집 기록 없음</p></TooltipContent>
        </Tooltip>
      );
    }
    const stale = getHoursAgo(dateStr) > STALE_HOURS;
    if (!stale) return null;
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5 border-yellow-500/50 text-yellow-600">
            <AlertTriangle className="w-2.5 h-2.5" />{label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent><p>{label} 마지막 수집: {formatAgo(dateStr)}</p></TooltipContent>
      </Tooltip>
    );
  };

  const DataStatus = ({ collection }: { collection: CollectionStatus }) => {
    const badges = [
      { label: 'YT', dateStr: collection.youtube },
      { label: 'Buzz', dateStr: collection.buzz_multi },
      { label: 'Music', dateStr: collection.music },
    ];
    const issues = badges.filter(b => !b.dateStr || getHoursAgo(b.dateStr) > STALE_HOURS);
    if (issues.length === 0) return <span className="text-xs text-emerald-500">✓</span>;
    return (
      <div className="flex gap-0.5 flex-wrap justify-center">
        {issues.map(b => <CollectionBadge key={b.label} label={b.label} dateStr={b.dateStr} />)}
      </div>
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
              <TableCell className="text-center"><ChangeIndicator value={a.scores?.energy_change_24h} /></TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{a.scores?.youtube_score?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{a.scores?.buzz_score?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{a.scores?.album_sales_score?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{a.scores?.music_score?.toLocaleString() ?? '—'}</TableCell>
              <TableCell className="text-center"><DataStatus collection={a.collection} /></TableCell>
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
    return !c.youtube || !c.buzz_multi || !c.music ||
      getHoursAgo(c.youtube!) > STALE_HOURS ||
      getHoursAgo(c.buzz_multi!) > STALE_HOURS ||
      getHoursAgo(c.music!) > STALE_HOURS;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Artist Rankings</h1>
          <p className="text-sm text-muted-foreground mt-1">데이터 엔진에 연결된 아티스트 티어 및 스코어 관리</p>
        </div>
        {staleCount > 0 && (
          <Badge variant="outline" className="border-yellow-500/50 text-yellow-600 gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            수집 지연 {staleCount}개
          </Badge>
        )}
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
    </div>
  );
};

export default AdminRankings;
