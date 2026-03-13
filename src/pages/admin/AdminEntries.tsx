import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const SCHEMA_TYPES = ['artist', 'member', 'youtuber', 'actor', 'album', 'song', 'event'] as const;

interface AddForm {
  title: string;
  slug: string;
  schema_type: string;
  tier: number;
  display_name: string;
  name_ko: string;
  youtube_channel_id: string;
  instagram_handle: string;
  x_handle: string;
  tiktok_handle: string;
}

const emptyForm: AddForm = {
  title: '', slug: '', schema_type: 'artist', tier: 1,
  display_name: '', name_ko: '', youtube_channel_id: '',
  instagram_handle: '', x_handle: '', tiktok_handle: '',
};

const AdminEntries = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AddForm>(emptyForm);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wiki_entries')
        .select('id, title, slug, schema_type, votes, view_count, trending_score, created_at, image_url')
        .order('trending_score', { ascending: false })
        .limit(200);
      if (error) throw error;

      // Fetch tiers for all entries
      const ids = (data || []).map(e => e.id);
      const { data: tiers } = await supabase
        .from('v3_artist_tiers' as any)
        .select('wiki_entry_id, tier, display_name, name_ko, youtube_channel_id, instagram_handle, x_handle, tiktok_handle')
        .in('wiki_entry_id', ids);

      const tierMap = new Map((tiers || []).map((t: any) => [t.wiki_entry_id, t]));
      return (data || []).map(e => ({ ...e, tierInfo: tierMap.get(e.id) || null }));
    },
  });

  const filtered = entries.filter(e =>
    !search || e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.slug.toLowerCase().includes(search.toLowerCase())
  );

  const addMutation = useMutation({
    mutationFn: async (f: AddForm) => {
      if (!user?.id) throw new Error('로그인 필요');

      // 1) wiki_entries에 insert
      const { data: entry, error } = await supabase
        .from('wiki_entries')
        .insert({
          title: f.title,
          slug: f.slug,
          schema_type: f.schema_type as any,
          content: '',
          creator_id: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      // 2) v3_artist_tiers에 insert
      const { error: tierErr } = await supabase
        .from('v3_artist_tiers' as any)
        .insert({
          wiki_entry_id: entry.id,
          tier: f.tier,
          display_name: f.display_name || f.title,
          name_ko: f.name_ko || null,
          youtube_channel_id: f.youtube_channel_id || null,
          instagram_handle: f.instagram_handle || null,
          x_handle: f.x_handle || null,
          tiktok_handle: f.tiktok_handle || null,
        });
      if (tierErr) throw tierErr;

      return entry;
    },
    onSuccess: () => {
      toast.success('아티스트 등록 완료');
      qc.invalidateQueries({ queryKey: ['admin-entries'] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(`등록 실패: ${e.message}`),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: AddForm }) => {
      // Update wiki_entries
      const { error } = await supabase
        .from('wiki_entries')
        .update({ title: f.title, slug: f.slug, schema_type: f.schema_type as any })
        .eq('id', id);
      if (error) throw error;

      // Upsert v3_artist_tiers
      const { error: tierErr } = await supabase
        .from('v3_artist_tiers' as any)
        .upsert({
          wiki_entry_id: id,
          tier: f.tier,
          display_name: f.display_name || f.title,
          name_ko: f.name_ko || null,
          youtube_channel_id: f.youtube_channel_id || null,
          instagram_handle: f.instagram_handle || null,
          x_handle: f.x_handle || null,
          tiktok_handle: f.tiktok_handle || null,
        }, { onConflict: 'wiki_entry_id' });
      if (tierErr) throw tierErr;
    },
    onSuccess: () => {
      toast.success('수정 완료');
      qc.invalidateQueries({ queryKey: ['admin-entries'] });
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(`수정 실패: ${e.message}`),
  });

  const openEdit = (entry: any) => {
    const t = entry.tierInfo;
    setEditId(entry.id);
    setForm({
      title: entry.title,
      slug: entry.slug,
      schema_type: entry.schema_type,
      tier: t?.tier || 2,
      display_name: t?.display_name || entry.title,
      name_ko: t?.name_ko || '',
      youtube_channel_id: t?.youtube_channel_id || '',
      instagram_handle: t?.instagram_handle || '',
      x_handle: t?.x_handle || '',
      tiktok_handle: t?.tiktok_handle || '',
    });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.slug) {
      toast.error('제목과 슬러그는 필수입니다');
      return;
    }
    if (editId) {
      editMutation.mutate({ id: editId, f: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const autoSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  };

  const isPending = addMutation.isPending || editMutation.isPending;

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Wiki 항목</h1>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1" /> 새 아티스트 등록
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length}건</p>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>투표</TableHead>
              <TableHead>조회수</TableHead>
              <TableHead>점수</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium text-sm">{e.title}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs capitalize">{e.schema_type}</Badge></TableCell>
                <TableCell>
                  {e.tierInfo ? (
                    <Badge variant={e.tierInfo.tier === 1 ? "default" : "secondary"} className="text-xs">
                      T{e.tierInfo.tier}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{e.votes}</TableCell>
                <TableCell className="text-sm">{e.view_count?.toLocaleString()}</TableCell>
                <TableCell className="text-sm font-medium">{e.trending_score?.toLocaleString()}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? '항목 수정' : '새 아티스트 등록'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">제목 *</Label>
                <Input
                  value={form.title}
                  onChange={e => {
                    const title = e.target.value;
                    setForm(f => ({ ...f, title, slug: editId ? f.slug : autoSlug(title) }));
                  }}
                  placeholder="BLACKPINK"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">슬러그 *</Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="blackpink" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">유형</Label>
                <Select value={form.schema_type} onValueChange={v => setForm(f => ({ ...f, schema_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEMA_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tier</Label>
                <Select value={String(form.tier)} onValueChange={v => setForm(f => ({ ...f, tier: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Tier 1 (전체 수집)</SelectItem>
                    <SelectItem value="2">Tier 2 (기본 수집)</SelectItem>
                    <SelectItem value="3">Tier 3 (최소 수집)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">표시 이름 (EN)</Label>
                <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="BLACKPINK" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">한국어 이름</Label>
                <Input value={form.name_ko} onChange={e => setForm(f => ({ ...f, name_ko: e.target.value }))} placeholder="블랙핑크" />
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-xs font-bold text-muted-foreground mb-2">플랫폼 연결 (선택)</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">YouTube 채널 ID</Label>
                  <Input value={form.youtube_channel_id} onChange={e => setForm(f => ({ ...f, youtube_channel_id: e.target.value }))} placeholder="UC..." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Instagram</Label>
                    <Input value={form.instagram_handle} onChange={e => setForm(f => ({ ...f, instagram_handle: e.target.value }))} placeholder="@handle" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">X (Twitter)</Label>
                    <Input value={form.x_handle} onChange={e => setForm(f => ({ ...f, x_handle: e.target.value }))} placeholder="@handle" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">TikTok</Label>
                    <Input value={form.tiktok_handle} onChange={e => setForm(f => ({ ...f, tiktok_handle: e.target.value }))} placeholder="@handle" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editId ? '수정' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEntries;
