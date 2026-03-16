import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, Search, Plus, Trash2, Upload, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';

interface V3Artist {
  id: string;
  wiki_entry_id: string;
  tier: number;
  display_name: string | null;
  name_ko: string | null;
  aliases: string[] | null;
  image_url: string | null;
  is_manual_override: boolean;
  updated_at: string;
  youtube_channel_id: string | null;
  youtube_topic_channel_id: string | null;
  lastfm_artist_name: string | null;
  deezer_artist_id: string | null;
  // from wiki_entries join
  wiki_title: string;
  wiki_image: string | null;
  wiki_schema_type: string;
}

const AdminV3Artists = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editArtist, setEditArtist] = useState<V3Artist | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addTier, setAddTier] = useState<1 | 2>(2);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editNameKo, setEditNameKo] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editYoutubeChannelId, setEditYoutubeChannelId] = useState('');
  const [editLastfmArtistName, setEditLastfmArtistName] = useState('');
  const [editDeezerArtistId, setEditDeezerArtistId] = useState('');
  const [editYoutubeTopicChannelId, setEditYoutubeTopicChannelId] = useState('');
  const [editSpotifyArtistName, setEditSpotifyArtistName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-v3-artists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v3_artist_tiers')
        .select('id, wiki_entry_id, tier, display_name, name_ko, aliases, image_url, is_manual_override, updated_at, youtube_channel_id, youtube_topic_channel_id, lastfm_artist_name, deezer_artist_id, spotify_artist_name, wiki_entries!inner(title, image_url, schema_type, metadata)')
        .order('tier', { ascending: true }) as any;
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        wiki_entry_id: row.wiki_entry_id,
        tier: row.tier,
        display_name: row.display_name,
        name_ko: row.name_ko,
        aliases: row.aliases || [],
        image_url: row.image_url,
        is_manual_override: row.is_manual_override,
        updated_at: row.updated_at,
        youtube_channel_id: row.youtube_channel_id,
        youtube_topic_channel_id: row.youtube_topic_channel_id,
        lastfm_artist_name: row.lastfm_artist_name,
        deezer_artist_id: row.deezer_artist_id,
        spotify_artist_name: row.spotify_artist_name,
        wiki_title: row.wiki_entries.title,
        wiki_image: row.wiki_entries.image_url || (row.wiki_entries.metadata as any)?.profile_image || null,
        wiki_schema_type: row.wiki_entries.schema_type,
      })) as V3Artist[];
    },
  });

  // Search wiki_entries for adding
  const { data: addResults = [], isLoading: addSearchLoading } = useQuery({
    queryKey: ['v3-add-search', addSearch],
    queryFn: async () => {
      if (addSearch.length < 2) return [];
      const existingIds = artists.map(a => a.wiki_entry_id);
      const { data, error } = await supabase
        .from('wiki_entries')
        .select('id, title, image_url, schema_type, trending_score')
        .ilike('title', `%${addSearch}%`)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .order('trending_score', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: addDialogOpen && addSearch.length >= 2,
  });

  // @handle → UC channel ID 변환
  const resolveYoutubeChannelId = async (input: string): Promise<string> => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.startsWith('UC')) return trimmed;
    // @handle 형식이면 YouTube API로 변환
    const handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    const { data, error } = await supabase.functions.invoke('fill-youtube-channels', {
      body: { resolveHandle: handle },
    });
    if (error || !data?.channelId) {
      throw new Error(`핸들 "${handle}" → Channel ID 변환 실패`);
    }
    return data.channelId;
  };

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; wiki_entry_id?: string; display_name: string; name_ko: string; aliases: string[]; image_url: string; youtube_channel_id: string; youtube_topic_channel_id: string; lastfm_artist_name: string; deezer_artist_id: string; spotify_artist_name: string }) => {
      let ytChannelId = payload.youtube_channel_id;
      if (ytChannelId && !ytChannelId.startsWith('UC')) {
        ytChannelId = await resolveYoutubeChannelId(ytChannelId);
      }
      const { error } = await supabase
        .from('v3_artist_tiers')
        .update({
          display_name: payload.display_name || null,
          name_ko: payload.name_ko || null,
          aliases: payload.aliases.length > 0 ? payload.aliases : [],
          image_url: payload.image_url || null,
          youtube_channel_id: ytChannelId || null,
          youtube_topic_channel_id: payload.youtube_topic_channel_id || null,
          lastfm_artist_name: payload.lastfm_artist_name || null,
          deezer_artist_id: payload.deezer_artist_id || null,
          spotify_artist_name: payload.spotify_artist_name || null,
        } as any)
        .eq('id', payload.id);
      if (error) throw error;
      // Also sync image_url to wiki_entries for consistency
      if (payload.image_url && payload.wiki_entry_id) {
        await supabase
          .from('wiki_entries')
          .update({ image_url: payload.image_url })
          .eq('id', payload.wiki_entry_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-v3-artists'] });
      toast.success('아티스트 정보가 수정되었습니다');
      setEditArtist(null);
    },
    onError: (err: any) => toast.error('수정 실패: ' + err.message),
  });

  const addMutation = useMutation({
    mutationFn: async ({ wiki_entry_id, tier }: { wiki_entry_id: string; tier: number }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .insert({ wiki_entry_id, tier, is_manual_override: true } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-v3-artists'] });
      toast.success('아티스트가 등록되었습니다');
    },
    onError: (err: any) => toast.error('등록 실패: ' + err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-v3-artists'] });
      toast.success('아티스트가 제거되었습니다');
    },
    onError: (err: any) => toast.error('제거 실패: ' + err.message),
  });

  const toggleTierMutation = useMutation({
    mutationFn: async ({ id, newTier }: { id: string; newTier: number }) => {
      const { error } = await supabase
        .from('v3_artist_tiers')
        .update({ tier: newTier, is_manual_override: true } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-v3-artists'] });
      queryClient.invalidateQueries({ queryKey: ['admin-artist-tiers'] });
      toast.success('티어가 변경되었습니다');
    },
    onError: (err: any) => toast.error('변경 실패: ' + err.message),
  });

  const openEdit = (artist: V3Artist) => {
    setEditArtist(artist);
    setEditDisplayName(artist.display_name || artist.wiki_title || '');
    setEditNameKo(artist.name_ko || '');
    setEditImageUrl(artist.image_url || artist.wiki_image || '');
    setEditAliases((artist.aliases || []).join(', '));
    setEditYoutubeChannelId(artist.youtube_channel_id || '');
    setEditYoutubeTopicChannelId(artist.youtube_topic_channel_id || '');
    setEditLastfmArtistName(artist.lastfm_artist_name || '');
    setEditDeezerArtistId(artist.deezer_artist_id || '');
    setEditSpotifyArtistName(artist.spotify_artist_name || '');
  };

  const filtered = search
    ? artists.filter(a =>
        (a.display_name || a.wiki_title || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.name_ko || '').includes(search)
      )
    : artists;

  const tier1 = filtered.filter(a => a.tier === 1);
  const tier2 = filtered.filter(a => a.tier === 2);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">V3 아티스트 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            총 {artists.length}명 · Tier 1: {artists.filter(a => a.tier === 1).length} · Tier 2: {artists.filter(a => a.tier === 2).length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="이름 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-52 h-9"
            />
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            아티스트 등록
          </Button>
        </div>
      </div>

      {/* Artist Table */}
      {[
        { label: 'Tier 1', items: tier1, tierNum: 1 },
        { label: 'Tier 2', items: tier2, tierNum: 2 },
      ].map(({ label, items, tierNum }) => (
        <div key={tierNum} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{label} ({items.length})</h2>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>이미지</TableHead>
                  <TableHead>영문명 (display_name)</TableHead>
                  <TableHead>한글명 (name_ko)</TableHead>
                  <TableHead>원본 (wiki)</TableHead>
                  <TableHead className="text-center">타입</TableHead>
                  
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center w-24">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a, idx) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Avatar className="w-9 h-9 rounded-lg">
                        <AvatarImage src={a.wiki_image || a.image_url || undefined} className="object-cover" />
                        <AvatarFallback className="rounded-lg text-[10px]">{(a.display_name || a.wiki_title || '').slice(0, 2)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{a.display_name || <span className="text-muted-foreground italic">미설정</span>}</TableCell>
                    <TableCell className="text-sm">{a.name_ko || <span className="text-muted-foreground italic">미설정</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.wiki_title}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px] capitalize">{a.wiki_schema_type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.tier === 1 ? 'default' : 'secondary'} className="text-xs">T{a.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] gap-0.5 px-1.5"
                          disabled={toggleTierMutation.isPending}
                          onClick={() => toggleTierMutation.mutate({ id: a.id, newTier: a.tier === 1 ? 2 : 1 })}
                        >
                          <ArrowUpDown className="w-3 h-3" />
                          T{a.tier === 1 ? 2 : 1}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (confirm(`${a.display_name || a.wiki_title}을(를) 제거하시겠습니까?`)) {
                              removeMutation.mutate({ id: a.id });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">해당 티어에 아티스트 없음</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {/* Edit Dialog */}
      <Dialog open={!!editArtist} onOpenChange={(open) => !open && setEditArtist(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>아티스트 정보 수정</DialogTitle>
            <DialogDescription>표시 이름, 한글명, 이미지를 수정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="w-12 h-12 rounded-lg">
                <AvatarImage src={editImageUrl || undefined} className="object-cover" />
                <AvatarFallback className="rounded-lg">{editDisplayName.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{editArtist?.wiki_title}</p>
                <p className="text-xs text-muted-foreground">wiki 원본명</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">영문 표시명</Label>
              <Input id="display_name" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} placeholder="English name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name_ko">한글명</Label>
              <Input id="name_ko" value={editNameKo} onChange={(e) => setEditNameKo(e.target.value)} placeholder="한글 이름" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aliases">별칭 (쉼표 구분)</Label>
              <Input id="aliases" value={editAliases} onChange={(e) => setEditAliases(e.target.value)} placeholder="ALLDAY PROJECT, 올데이 프로젝트" />
              <p className="text-[10px] text-muted-foreground">차트 매칭에 사용되는 추가 이름들 (쉼표로 구분)</p>
            </div>
            <div className="space-y-2">
              <Label>프로필 이미지</Label>
              <div className="flex items-center gap-3">
                <Avatar className="w-16 h-16 rounded-lg border border-border">
                  <AvatarImage src={editImageUrl || undefined} className="object-cover" />
                  <AvatarFallback className="rounded-lg text-sm">{editDisplayName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !editArtist) return;
                      setUploading(true);
                      try {
                        // Convert to WebP
                        const webpBlob = await new Promise<Blob>((resolve, reject) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return reject(new Error('Canvas not supported'));
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob(
                              (blob) => blob ? resolve(blob) : reject(new Error('WebP conversion failed')),
                              'image/webp',
                              0.85
                            );
                          };
                          img.onerror = () => reject(new Error('Image load failed'));
                          img.src = URL.createObjectURL(file);
                        });
                        const filePath = `v3-artists/${editArtist.wiki_entry_id}.webp`;
                        const { error: uploadError } = await supabase.storage
                          .from('wiki-images')
                          .upload(filePath, webpBlob, { upsert: true, contentType: 'image/webp' });
                        if (uploadError) throw uploadError;
                        const { data: { publicUrl } } = supabase.storage
                          .from('wiki-images')
                          .getPublicUrl(filePath);
                        setEditImageUrl(publicUrl + '?t=' + Date.now());
                        toast.success('이미지 업로드 완료');
                      } catch (err: any) {
                        toast.error('업로드 실패: ' + err.message);
                      } finally {
                        setUploading(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    이미지 변경
                  </Button>
                  <p className="text-[10px] text-muted-foreground">Supabase Storage에 업로드됩니다</p>
                </div>
              </div>
            </div>
            {/* Endpoints */}
            <div className="border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-1">크롤링 엔드포인트</p>
              <p className="text-[10px] text-muted-foreground mb-2">
                비어있으면 <span className="font-medium text-foreground">"{editArtist?.wiki_title}"</span> 이름으로 검색합니다. 고정 ID 입력 시 해당 값을 우선 사용합니다.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">YouTube Channel ID</Label>
                  <Input value={editYoutubeChannelId} onChange={(e) => setEditYoutubeChannelId(e.target.value)} placeholder="UC... 또는 @handle" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Last.fm Artist Name</Label>
                  <Input value={editLastfmArtistName} onChange={(e) => setEditLastfmArtistName(e.target.value)} placeholder={`현재: "${editArtist?.wiki_title}" 검색`} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Deezer Artist ID</Label>
                  <Input value={editDeezerArtistId} onChange={(e) => setEditDeezerArtistId(e.target.value)} placeholder={`현재: "${editArtist?.wiki_title}" 검색`} className="h-8 text-xs" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[11px]">YT Music Topic Channel ID</Label>
                  <Input value={editYoutubeTopicChannelId} onChange={(e) => setEditYoutubeTopicChannelId(e.target.value)} placeholder="UC... (YouTube Music Topic 채널)" className="h-8 text-xs" />
                  <p className="text-[10px] text-muted-foreground">YouTube Music 스트리밍 데이터 수집용 Topic 채널 ID</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditArtist(null)}>취소</Button>
              <Button
                disabled={updateMutation.isPending}
                onClick={() => {
                  if (!editArtist) return;
                  updateMutation.mutate({
                    id: editArtist.id,
                    wiki_entry_id: editArtist.wiki_entry_id,
                    display_name: editDisplayName,
                    name_ko: editNameKo,
                    aliases: editAliases.split(',').map(s => s.trim()).filter(Boolean),
                    image_url: editImageUrl,
                    youtube_channel_id: editYoutubeChannelId,
                    youtube_topic_channel_id: editYoutubeTopicChannelId,
                    lastfm_artist_name: editLastfmArtistName,
                    deezer_artist_id: editDeezerArtistId,
                  });
                }}
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Artist Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setAddSearch(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>아티스트 등록</DialogTitle>
            <DialogDescription>wiki_entries에서 검색하여 V3 티어에 등록합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="아티스트 검색..." value={addSearch} onChange={(e) => setAddSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-1">
                <Button variant={addTier === 1 ? 'default' : 'outline'} size="sm" onClick={() => setAddTier(1)} className="h-9 text-xs">T1</Button>
                <Button variant={addTier === 2 ? 'default' : 'outline'} size="sm" onClick={() => setAddTier(2)} className="h-9 text-xs">T2</Button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {addSearchLoading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              {!addSearchLoading && addSearch.length >= 2 && addResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">검색 결과 없음</p>
              )}
              {addResults.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8 rounded-lg">
                      <AvatarImage src={entry.image_url || undefined} className="object-cover" />
                      <AvatarFallback className="rounded-lg text-[10px]">{entry.title.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{entry.title}</p>
                      <p className="text-[11px] text-muted-foreground">{entry.schema_type}</p>
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-xs gap-1" disabled={addMutation.isPending} onClick={() => addMutation.mutate({ wiki_entry_id: entry.id, tier: addTier })}>
                    <Plus className="w-3 h-3" /> T{addTier}
                  </Button>
                </div>
              ))}
              {addSearch.length < 2 && <p className="text-sm text-muted-foreground text-center py-4">2글자 이상 입력하세요</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminV3Artists;
