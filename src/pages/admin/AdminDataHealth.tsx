import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, ExternalLink, Wand2, Music } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface ArtistHealth {
  id: string;
  wiki_entry_id: string;
  tier: number;
  display_name: string | null;
  name_ko: string | null;
  image_url: string | null;
  youtube_channel_id: string | null;
  lastfm_artist_name: string | null;
  deezer_artist_id: string | null;
  wiki_title: string;
  wiki_image: string | null;
}

const AdminDataHealth = () => {
  const queryClient = useQueryClient();

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-data-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v3_artist_tiers')
        .select('id, wiki_entry_id, tier, display_name, name_ko, image_url, youtube_channel_id, lastfm_artist_name, deezer_artist_id, wiki_entries!inner(title, image_url)')
        .order('tier', { ascending: true }) as any;
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        wiki_entry_id: row.wiki_entry_id,
        tier: row.tier,
        display_name: row.display_name,
        name_ko: row.name_ko,
        image_url: row.image_url,
        youtube_channel_id: row.youtube_channel_id,
        lastfm_artist_name: row.lastfm_artist_name,
        deezer_artist_id: row.deezer_artist_id,
        wiki_title: row.wiki_entries.title,
        wiki_image: row.wiki_entries.image_url,
      })) as ArtistHealth[];
    },
  });

  const bulkFillLastfm = useMutation({
    mutationFn: async () => {
      const targets = artists.filter(a => !a.lastfm_artist_name && a.display_name);
      if (targets.length === 0) throw new Error('채울 대상이 없습니다');
      
      let filled = 0;
      for (const a of targets) {
        const { error } = await supabase
          .from('v3_artist_tiers')
          .update({ lastfm_artist_name: a.display_name } as any)
          .eq('id', a.id);
        if (!error) filled++;
      }
      return filled;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['admin-data-health'] });
      toast.success(`${count}명의 Last.fm 아티스트명이 채워졌습니다`);
    },
    onError: (err: any) => toast.error('실패: ' + err.message),
  });

  const bulkFillDeezer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fill-deezer-ids');
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-data-health'] });
      toast.success(`${data.filled}/${data.total}명의 Deezer ID가 채워졌습니다`);
      if (data.errors?.length > 0) {
        toast.info(`${data.errors.length}건 실패: ${data.errors.slice(0, 3).join(', ')}`);
      }
    },
    onError: (err: any) => toast.error('실패: ' + err.message),
  });

  const missing = artists.filter(a =>
    !a.youtube_channel_id || !a.lastfm_artist_name || !a.deezer_artist_id
  );

  const tier1Missing = missing.filter(a => a.tier === 1);
  const tier2Missing = missing.filter(a => a.tier === 2);

  const total = artists.length;
  const ytMissing = artists.filter(a => !a.youtube_channel_id).length;
  const lastfmMissing = artists.filter(a => !a.lastfm_artist_name).length;
  const deezerMissing = artists.filter(a => !a.deezer_artist_id).length;

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">데이터 헬스 체크</h1>
          <p className="text-sm text-muted-foreground mt-1">
            엔드포인트 ID가 누락된 아티스트를 확인하고 수정합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {lastfmMissing > 0 && (
            <Button
              size="sm"
              className="h-9 gap-1.5"
              disabled={bulkFillLastfm.isPending}
              onClick={() => {
                if (confirm(`Last.fm 누락 ${lastfmMissing}명에 display_name을 자동 채우시겠습니까?`)) {
                  bulkFillLastfm.mutate();
                }
              }}
            >
              {bulkFillLastfm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Last.fm 일괄 채우기
            </Button>
          )}
          {deezerMissing > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              disabled={bulkFillDeezer.isPending}
              onClick={() => {
                if (confirm(`Deezer 누락 ${deezerMissing}명의 ID를 API로 자동 검색하시겠습니까?`)) {
                  bulkFillDeezer.mutate();
                }
              }}
            >
              {bulkFillDeezer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
              Deezer 일괄 채우기
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="전체 아티스트" value={total} />
        <SummaryCard label="YouTube ID 누락" value={ytMissing} warn={ytMissing > 0} />
        <SummaryCard label="Last.fm 누락" value={lastfmMissing} warn={lastfmMissing > 0} />
        <SummaryCard label="Deezer ID 누락" value={deezerMissing} warn={deezerMissing > 0} />
      </div>

      {missing.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">✅ 모든 아티스트의 엔드포인트 ID가 설정되어 있습니다.</p>
        </div>
      ) : (
        <>
          {[
            { label: 'Tier 1 누락', items: tier1Missing },
            { label: 'Tier 2 누락', items: tier2Missing },
          ].map(({ label, items }) => items.length > 0 && (
            <div key={label} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                {label} ({items.length})
              </h2>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>아티스트</TableHead>
                      <TableHead className="text-center">YouTube</TableHead>
                      <TableHead className="text-center">Last.fm</TableHead>
                      <TableHead className="text-center">Deezer</TableHead>
                      <TableHead className="text-center w-20">수정</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a, idx) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8 rounded-lg">
                              <AvatarImage src={a.image_url || a.wiki_image || undefined} className="object-cover" />
                              <AvatarFallback className="rounded-lg text-[10px]">{(a.display_name || a.wiki_title).slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{a.display_name || a.wiki_title}</p>
                              {a.name_ko && <p className="text-[11px] text-muted-foreground">{a.name_ko}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge ok={!!a.youtube_channel_id} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge ok={!!a.lastfm_artist_name} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge ok={!!a.deezer_artist_id} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                            <Link to="/admin/v3-artists">
                              <ExternalLink className="w-3 h-3" /> 수정
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, warn }: { label: string; value: number; warn?: boolean }) => (
  <div className={`rounded-lg border p-4 ${warn ? 'border-orange-500/30 bg-orange-500/5' : 'bg-card'}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${warn ? 'text-orange-500' : 'text-foreground'}`}>{value}</p>
  </div>
);

const StatusBadge = ({ ok }: { ok: boolean }) => (
  <Badge variant={ok ? 'secondary' : 'destructive'} className="text-[10px]">
    {ok ? '✓' : '누락'}
  </Badge>
);

export default AdminDataHealth;