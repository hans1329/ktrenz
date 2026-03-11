import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Coins } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface PointSetting {
  id: string;
  reward_type: string;
  reward_name: string;
  points: number;
  is_enabled: boolean;
  description: string | null;
  updated_at: string;
}

const AdminPoints = () => {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { points?: number; is_enabled?: boolean }>>({});

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['admin-point-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ktrenz_point_settings')
        .select('*')
        .order('reward_type');
      if (error) throw error;
      return data as PointSetting[];
    },
  });

  // 로컬 편집 상태 초기화
  useEffect(() => {
    if (settings.length > 0 && Object.keys(edits).length === 0) {
      const initial: Record<string, { points: number; is_enabled: boolean }> = {};
      settings.forEach(s => { initial[s.id] = { points: s.points, is_enabled: s.is_enabled }; });
      setEdits(initial);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, points, is_enabled }: { id: string; points: number; is_enabled: boolean }) => {
      const { error } = await supabase
        .from('ktrenz_point_settings')
        .update({ points, is_enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-point-settings'] });
      toast.success('설정이 저장되었습니다.');
    },
    onError: () => toast.error('저장에 실패했습니다.'),
  });

  const handleSave = (setting: PointSetting) => {
    const edit = edits[setting.id];
    if (!edit) return;
    updateMutation.mutate({
      id: setting.id,
      points: edit.points ?? setting.points,
      is_enabled: edit.is_enabled ?? setting.is_enabled,
    });
  };

  const isDirty = (s: PointSetting) => {
    const e = edits[s.id];
    if (!e) return false;
    return e.points !== s.points || e.is_enabled !== s.is_enabled;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Coins className="w-5 h-5" /> K-Tokens 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">토큰 보상 항목별 지급량과 활성 상태를 관리합니다.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">보상 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="text-right w-28">토큰</TableHead>
                <TableHead className="text-center w-20">활성</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map(s => {
                const edit = edits[s.id] ?? { points: s.points, is_enabled: s.is_enabled };
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.reward_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.description ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="w-24 ml-auto text-right"
                        value={edit.points}
                        onChange={e => setEdits(prev => ({
                          ...prev,
                          [s.id]: { ...prev[s.id], points: parseInt(e.target.value) || 0 },
                        }))}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={edit.is_enabled}
                        onCheckedChange={checked => setEdits(prev => ({
                          ...prev,
                          [s.id]: { ...prev[s.id], is_enabled: checked },
                        }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isDirty(s) || updateMutation.isPending}
                        onClick={() => handleSave(s)}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" /> 저장
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {settings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    등록된 보상 항목이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPoints;
