import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, Star, ArrowUpDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface ArtistTier {
  tier: number;
  is_manual_override: boolean;
  wiki_entry_id: string;
  title: string;
  slug: string;
  image_url: string | null;
  schema_type: string;
  trending_score: number;
}

const AdminRankings = () => {
  const queryClient = useQueryClient();

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['admin-artist-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v3_artist_tiers')
        .select(`
          tier,
          is_manual_override,
          wiki_entry_id,
          wiki_entries!inner(title, slug, image_url, schema_type, trending_score)
        `)
        .order('tier', { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        tier: row.tier,
        is_manual_override: row.is_manual_override,
        wiki_entry_id: row.wiki_entry_id,
        title: row.wiki_entries.title,
        slug: row.wiki_entries.slug,
        image_url: row.wiki_entries.image_url,
        schema_type: row.wiki_entries.schema_type,
        trending_score: row.wiki_entries.trending_score ?? 0,
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
    onError: (err: any) => {
      toast.error('변경 실패: ' + err.message);
    },
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
    onError: (err: any) => {
      toast.error('해제 실패: ' + err.message);
    },
  });

  const tier1 = artists.filter(a => a.tier === 1).sort((a, b) => b.trending_score - a.trending_score);
  const tier2 = artists.filter(a => a.tier === 2).sort((a, b) => b.trending_score - a.trending_score);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const RankTable = ({ items, tierNum }: { items: ArtistTier[]; tierNum: number }) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Trend Score</TableHead>
            <TableHead className="text-center">Override</TableHead>
            <TableHead className="text-center w-24">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a, idx) => (
            <TableRow key={a.wiki_entry_id}>
              <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 rounded-lg">
                    <AvatarImage src={a.image_url || undefined} className="object-cover" />
                    <AvatarFallback className="rounded-lg text-xs">{a.title.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-sm">{a.title}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs capitalize">{a.schema_type}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{a.trending_score.toLocaleString()}</TableCell>
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
                  onClick={() => toggleTierMutation.mutate({
                    wiki_entry_id: a.wiki_entry_id,
                    newTier: tierNum === 1 ? 2 : 1,
                  })}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  → Tier {tierNum === 1 ? 2 : 1}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No artists in this tier</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Artist Rankings</h1>
        <p className="text-sm text-muted-foreground mt-1">데이터 엔진에 연결된 아티스트 티어 관리</p>
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
          <p className="text-xs text-muted-foreground mb-3">YouTube/Buzz 데이터 수집 및 에너지 스코어 계산 대상 (일일 수집)</p>
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
