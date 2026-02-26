import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface KtrenzUser {
  user_id: string;
  agent_avatar: string | null;
  agent_created_at: string;
  username: string | null;
  display_name: string | null;
  profile_avatar: string | null;
  points: number;
  lifetime_points: number;
}

const AdminUsers = () => {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-ktrenz-users'],
    queryFn: async () => {
      // ktrenz_agent_profiles 기준으로 유저 조회
      const { data: agents, error: agentErr } = await supabase
        .from('ktrenz_agent_profiles')
        .select('user_id, avatar_url, created_at')
        .order('created_at', { ascending: false });
      if (agentErr) throw agentErr;
      if (!agents || agents.length === 0) return [];

      const userIds = agents.map(a => a.user_id);

      // profiles & ktrenz_user_points 병렬 조회
      const [profilesRes, pointsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds),
        supabase
          .from('ktrenz_user_points')
          .select('user_id, points, lifetime_points')
          .in('user_id', userIds),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
      const pointsMap = new Map((pointsRes.data || []).map(p => [p.user_id, p]));

      return agents.map((a): KtrenzUser => {
        const profile = profileMap.get(a.user_id);
        const pts = pointsMap.get(a.user_id);
        return {
          user_id: a.user_id,
          agent_avatar: a.avatar_url,
          agent_created_at: a.created_at,
          username: profile?.username ?? null,
          display_name: profile?.display_name ?? null,
          profile_avatar: profile?.avatar_url ?? null,
          points: pts?.points ?? 0,
          lifetime_points: pts?.lifetime_points ?? 0,
        };
      });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">KTrenZ Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          KTrenZ 에이전트 등록 유저만 표시 · 총 {users.length}명
        </p>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">누적</TableHead>
              <TableHead>가입일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={u.profile_avatar || undefined} />
                      <AvatarFallback className="text-xs">{u.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{u.display_name || u.username || 'Unknown'}</p>
                      {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {u.agent_avatar && (
                    <Avatar className="w-7 h-7 rounded-lg">
                      <AvatarImage src={u.agent_avatar} className="object-cover" />
                      <AvatarFallback className="rounded-lg text-[10px]">AG</AvatarFallback>
                    </Avatar>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{u.points.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{u.lifetime_points.toLocaleString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(u.agent_created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">등록된 KTrenZ 유저가 없습니다</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminUsers;
