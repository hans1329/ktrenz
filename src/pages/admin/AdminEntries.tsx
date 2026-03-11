import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

const AdminEntries = () => {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wiki_entries')
        .select('id, title, slug, schema_type, votes, view_count, trending_score, created_at')
        .order('trending_score', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Wiki 항목</h1>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>유형</TableHead>
              <TableHead>투표</TableHead>
              <TableHead>조회수</TableHead>
              <TableHead>점수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium text-sm">{e.title}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs capitalize">{e.schema_type}</Badge></TableCell>
                <TableCell className="text-sm">{e.votes}</TableCell>
                <TableCell className="text-sm">{e.view_count?.toLocaleString()}</TableCell>
                <TableCell className="text-sm font-medium">{e.trending_score?.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminEntries;
