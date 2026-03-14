import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, Wand2, Music, Youtube, Headphones, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface ArtistHealth {
  id: string;
  wiki_entry_id: string;
  tier: number;
  display_name: string | null;
  name_ko: string | null;
  image_url: string | null;
  youtube_channel_id: string | null;
  youtube_topic_channel_id: string | null;
  lastfm_artist_name: string | null;
  deezer_artist_id: string | null;
  wiki_title: string;
  wiki_image: string | null;
}

const AdminDataHealth = () => {
  const queryClient = useQueryClient();
  const [ytFillTier, setYtFillTier] = useState<number | null>(null);
  const [editArtist, setEditArtist] = useState<ArtistHealth | null>(null);
  const [editFields, setEditFields] = useState({
    youtube_channel_id: '',
    youtube_topic_channel_id: '',
    lastfm_artist_name: '',
    deezer_artist_id: '',
    instagram_handle: '',
    x_handle: '',
    tiktok_handle: '',
  });

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-data-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v3_artist_tiers')
        .select('id, wiki_entry_id, tier, display_name, name_ko, image_url, youtube_channel_id, youtube_topic_channel_id, lastfm_artist_name, deezer_artist_id, instagram_handle, x_handle, tiktok_handle, wiki_entries!inner(title, image_url)')
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
        youtube_topic_channel_id: row.youtube_topic_channel_id,
        lastfm_artist_name: row.lastfm_artist_name,
        deezer_artist_id: row.deezer_artist_id,
        instagram_handle: row.instagram_handle,
        x_handle: row.x_handle,
        tiktok_handle: row.tiktok_handle,
        wiki_title: row.wiki_entries.title,
        wiki_image: row.wiki_entries.image_url,
      })) as ArtistHealth[];
    },
  });

  const openEdit = (artist: ArtistHealth) => {
    setEditArtist(artist);
    setEditFields({
      youtube_channel_id: artist.youtube_channel_id || '',
      youtube_topic_channel_id: artist.youtube_topic_channel_id || '',
      lastfm_artist_name: artist.lastfm_artist_name || '',
      deezer_artist_id: artist.deezer_artist_id || '',
      instagram_handle: artist.instagram_handle || '',
      x_handle: artist.x_handle || '',
      tiktok_handle: artist.tiktok_handle || '',
    });
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editArtist) return;
      let ytChannelId = editFields.youtube_channel_id.trim();
      // @handle → UC channel ID 변환
      if (ytChannelId && !ytChannelId.startsWith('UC')) {
        const handle = ytChannelId.startsWith('@') ? ytChannelId : `@${ytChannelId}`;
        const { data, error } = await supabase.functions.invoke('fill-youtube-channels', {
          body: { resolveHandle: handle },
        });
        if (error || !data?.channelId) throw new Error(`핸들 "${handle}" → Channel ID 변환 실패`);
        ytChannelId = data.channelId;
      }
      const { error } = await supabase
        .from('v3_artist_tiers')
        .update({
          youtube_channel_id: ytChannelId || null,
          youtube_topic_channel_id: editFields.youtube_topic_channel_id.trim() || null,
          lastfm_artist_name: editFields.lastfm_artist_name.trim() || null,
          deezer_artist_id: editFields.deezer_artist_id.trim() || null,
          instagram_handle: editFields.instagram_handle.trim() || null,
          x_handle: editFields.x_handle.trim() || null,
          tiktok_handle: editFields.tiktok_handle.trim() || null,
        } as any)
        .eq('id', editArtist.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-data-health'] });
      toast.success('엔드포인트 ID가 수정되었습니다');
      setEditArtist(null);
    },
    onError: (err: any) => toast.error('수정 실패: ' + err.message),
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

  const bulkFillYoutube = useMutation({
    mutationFn: async ({ tier, target }: { tier: number; target: string }) => {
      setYtFillTier(tier);
      const body: any = { target, dryRun: false, limit: 200 };
      if (tier > 0) body.tier = tier;
      const { data, error } = await supabase.functions.invoke('fill-youtube-channels', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      setYtFillTier(null);
      queryClient.invalidateQueries({ queryKey: ['admin-data-health'] });
      const msgs: string[] = [];
      if (data.updatedOfficial > 0) msgs.push(`공식 ${data.updatedOfficial}명`);
      if (data.updatedTopic > 0) msgs.push(`Topic ${data.updatedTopic}명`);
      if (msgs.length > 0) {
        toast.success(`${msgs.join(', ')} YouTube ID가 채워졌습니다 (${data.totalProcessed}명 처리)`);
      } else {
        toast.info(`${data.totalProcessed}명 처리했으나 새로 채운 ID 없음`);
      }
      const officialMiss = data.results?.filter((r: any) => !r.officialChannelId)?.length || 0;
      const topicMiss = data.results?.filter((r: any) => !r.topicChannelId)?.length || 0;
      if (officialMiss > 0 || topicMiss > 0) {
        toast.info(`미발견: 공식 ${officialMiss}명, Topic ${topicMiss}명 — 수동 입력 필요`);
      }
    },
    onError: (err: any) => { setYtFillTier(null); toast.error('실패: ' + err.message); },
  });

  const missing = artists.filter(a =>
    !a.youtube_channel_id || !a.youtube_topic_channel_id || !a.lastfm_artist_name || !a.deezer_artist_id
  );
  const tier1Missing = missing.filter(a => a.tier === 1);
  const tier2Missing = missing.filter(a => a.tier === 2);

  const total = artists.length;
  const ytMissing = artists.filter(a => !a.youtube_channel_id).length;
  const topicMissing = artists.filter(a => !a.youtube_topic_channel_id).length;
  const lastfmMissing = artists.filter(a => !a.lastfm_artist_name).length;
  const deezerMissing = artists.filter(a => !a.deezer_artist_id).length;

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const getMissingFields = (a: ArtistHealth) => {
    const fields: string[] = [];
    if (!a.youtube_channel_id) fields.push('YouTube');
    if (!a.youtube_topic_channel_id) fields.push('YT Topic');
    if (!a.lastfm_artist_name) fields.push('Last.fm');
    if (!a.deezer_artist_id) fields.push('Deezer');
    return fields;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">데이터 헬스 체크</h1>
          <p className="text-sm text-muted-foreground mt-1">엔드포인트 ID가 누락된 아티스트를 확인하고 수정합니다.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="default" className="h-9 gap-1.5"
            disabled={bulkFillYoutube.isPending || (ytMissing === 0 && topicMissing === 0)}
            onClick={() => { if (confirm(`YouTube 누락 전체(공식 ${ytMissing}명 + Topic ${topicMissing}명)를 OpenAI+YouTube API로 검색하시겠습니까?`)) bulkFillYoutube.mutate({ tier: 0, target: 'both' }); }}>
            {bulkFillYoutube.isPending && ytFillTier === 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
            YT 전체 채우기 {(ytMissing + topicMissing) > 0 && `(${ytMissing + topicMissing})`}
          </Button>
          {[1, 2].map(tier => {
            const tierAnyMissing = artists.filter(a => a.tier === tier && (!a.youtube_channel_id || !a.youtube_topic_channel_id)).length;
            return (
              <Button key={`yt-tier-${tier}`} size="sm" variant="outline" className="h-9 gap-1.5"
                disabled={bulkFillYoutube.isPending || tierAnyMissing === 0}
                onClick={() => { if (confirm(`Tier ${tier} YouTube 누락 ${tierAnyMissing}명을 OpenAI+YouTube API로 검색하시겠습니까? (공식+Topic 동시)`)) bulkFillYoutube.mutate({ tier, target: 'both' }); }}>
                {bulkFillYoutube.isPending && ytFillTier === tier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
                YT T{tier} {tierAnyMissing > 0 && `(${tierAnyMissing})`}
              </Button>
            );
          })}
          <Button size="sm" className="h-9 gap-1.5" disabled={bulkFillLastfm.isPending || lastfmMissing === 0}
            onClick={() => { if (confirm(`Last.fm 누락 ${lastfmMissing}명에 display_name을 자동 채우시겠습니까?`)) bulkFillLastfm.mutate(); }}>
            {bulkFillLastfm.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Last.fm {lastfmMissing > 0 && `(${lastfmMissing})`}
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={bulkFillDeezer.isPending || deezerMissing === 0}
            onClick={() => { if (confirm(`Deezer 누락 ${deezerMissing}명의 ID를 API로 자동 검색하시겠습니까?`)) bulkFillDeezer.mutate(); }}>
            {bulkFillDeezer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
            Deezer {deezerMissing > 0 && `(${deezerMissing})`}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="전체 아티스트" value={total} />
        <SummaryCard label="YouTube ID 누락" value={ytMissing} warn={ytMissing > 0} />
        <SummaryCard label="YT Topic ID 누락" value={topicMissing} warn={topicMissing > 0} />
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
                      <TableHead className="text-center">YT Topic</TableHead>
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
                        <TableCell className="text-center"><StatusBadge ok={!!a.youtube_channel_id} /></TableCell>
                        <TableCell className="text-center"><StatusBadge ok={!!a.youtube_topic_channel_id} /></TableCell>
                        <TableCell className="text-center"><StatusBadge ok={!!a.lastfm_artist_name} /></TableCell>
                        <TableCell className="text-center"><StatusBadge ok={!!a.deezer_artist_id} /></TableCell>
                        <TableCell className="text-center">
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(a)}>
                            <Pencil className="w-3 h-3" /> 수정
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

      {/* Inline Edit Dialog */}
      <Dialog open={!!editArtist} onOpenChange={(open) => !open && setEditArtist(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="w-8 h-8 rounded-lg">
                <AvatarImage src={editArtist?.image_url || editArtist?.wiki_image || undefined} className="object-cover" />
                <AvatarFallback className="rounded-lg text-[10px]">{(editArtist?.display_name || editArtist?.wiki_title || '').slice(0, 2)}</AvatarFallback>
              </Avatar>
              {editArtist?.display_name || editArtist?.wiki_title}
            </DialogTitle>
            <DialogDescription>
              누락된 엔드포인트 ID를 입력하세요.
              {editArtist && (
                <span className="flex gap-1 mt-1 flex-wrap">
                  {getMissingFields(editArtist).map(f => (
                    <Badge key={f} variant="destructive" className="text-[10px]">{f} 누락</Badge>
                  ))}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Youtube className="w-3 h-3" /> YouTube Channel ID
                {!editArtist?.youtube_channel_id && <Badge variant="destructive" className="text-[8px] px-1 py-0">누락</Badge>}
              </Label>
              <Input value={editFields.youtube_channel_id} onChange={(e) => setEditFields(f => ({ ...f, youtube_channel_id: e.target.value }))} placeholder="UC... 또는 @handle" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Headphones className="w-3 h-3" /> YT Music Topic Channel ID
                {!editArtist?.youtube_topic_channel_id && <Badge variant="destructive" className="text-[8px] px-1 py-0">누락</Badge>}
              </Label>
              <Input value={editFields.youtube_topic_channel_id} onChange={(e) => setEditFields(f => ({ ...f, youtube_topic_channel_id: e.target.value }))} placeholder="UC... (Topic 채널)" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Music className="w-3 h-3" /> Last.fm Artist Name
                {!editArtist?.lastfm_artist_name && <Badge variant="destructive" className="text-[8px] px-1 py-0">누락</Badge>}
              </Label>
              <Input value={editFields.lastfm_artist_name} onChange={(e) => setEditFields(f => ({ ...f, lastfm_artist_name: e.target.value }))} placeholder={editArtist?.wiki_title || ''} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1">
                <Headphones className="w-3 h-3" /> Deezer Artist ID
                {!editArtist?.deezer_artist_id && <Badge variant="destructive" className="text-[8px] px-1 py-0">누락</Badge>}
              </Label>
              <Input value={editFields.deezer_artist_id} onChange={(e) => setEditFields(f => ({ ...f, deezer_artist_id: e.target.value }))} placeholder="숫자 ID" className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditArtist(null)}>취소</Button>
              <Button size="sm" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
