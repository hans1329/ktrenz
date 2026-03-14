import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const AdminListingRequests = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['admin-listing-requests', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('artist_listing_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') {
        q = q.eq('status', statusFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (req: any) => {
      if (!user?.id) throw new Error('로그인 필요');

      // 1) wiki_entries 생성
      const slug = req.artist_name
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      const { data: entry, error } = await supabase
        .from('wiki_entries')
        .insert({
          title: req.artist_name,
          slug,
          schema_type: 'artist' as any,
          content: '',
          creator_id: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;

      // 2) v3_artist_tiers 생성 (Tier 1)
      const { error: tierErr } = await supabase
        .from('v3_artist_tiers' as any)
        .insert({
          wiki_entry_id: entry.id,
          tier: 1,
          display_name: req.artist_name,
          name_ko: null,
          youtube_channel_id: req.youtube_url ? extractYoutubeChannelId(req.youtube_url) : null,
          instagram_handle: req.instagram_url ? extractHandle(req.instagram_url) : null,
          x_handle: req.x_url ? extractHandle(req.x_url) : null,
          tiktok_handle: req.tiktok_url ? extractHandle(req.tiktok_url) : null,
        });
      if (tierErr) throw tierErr;

      // 3) 요청 상태 업데이트
      const { error: updateErr } = await supabase
        .from('artist_listing_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', req.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast.success('승인 완료! Wiki 엔트리 및 Tier 1 등록됨');
      qc.invalidateQueries({ queryKey: ['admin-listing-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-entries'] });
    },
    onError: (e) => toast.error(`승인 실패: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('로그인 필요');
      const { error } = await supabase
        .from('artist_listing_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('거절 처리됨');
      qc.invalidateQueries({ queryKey: ['admin-listing-requests'] });
    },
    onError: (e) => toast.error(`거절 실패: ${e.message}`),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">대기</Badge>;
      case 'approved': return <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">승인</Badge>;
      case 'rejected': return <Badge variant="outline" className="text-red-500 border-red-500/30">거절</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const linkIcon = (url: string | null) => {
    if (!url) return <span className="text-muted-foreground">—</span>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
        <ExternalLink className="w-3 h-3" /> 링크
      </a>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">아티스트 등록 요청</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="approved">승인</SelectItem>
            <SelectItem value="rejected">거절</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">요청이 없습니다</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>아티스트명</TableHead>
              <TableHead>YouTube</TableHead>
              <TableHead>Instagram</TableHead>
              <TableHead>TikTok</TableHead>
              <TableHead>X</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>요청일</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">{req.artist_name}</TableCell>
                <TableCell>{linkIcon(req.youtube_url)}</TableCell>
                <TableCell>{linkIcon(req.instagram_url)}</TableCell>
                <TableCell>{linkIcon(req.tiktok_url)}</TableCell>
                <TableCell>{linkIcon(req.x_url)}</TableCell>
                <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">{req.note || '—'}</TableCell>
                <TableCell>{statusBadge(req.status)}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(req.created_at).toLocaleDateString('ko-KR')}
                </TableCell>
                <TableCell className="text-right">
                  {req.status === 'pending' && (
                    <div className="flex gap-1.5 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 h-7 text-xs"
                        onClick={() => approveMutation.mutate(req)}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="w-3 h-3 mr-1" /> 승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 border-red-500/30 hover:bg-red-500/10 h-7 text-xs"
                        onClick={() => rejectMutation.mutate(req.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <X className="w-3 h-3 mr-1" /> 거절
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

/** URL에서 핸들(username) 추출 */
function extractHandle(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '');
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1]?.replace('@', '') || url;
  } catch {
    return url;
  }
}

/** YouTube URL에서 채널 ID 또는 핸들 추출 */
function extractYoutubeChannelId(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    // /channel/UC... 형태
    const channelMatch = path.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) return channelMatch[1];
    // /@handle 또는 /c/name 형태 → 핸들 반환
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1]?.replace('@', '') || url;
  } catch {
    return url;
  }
}

export default AdminListingRequests;
