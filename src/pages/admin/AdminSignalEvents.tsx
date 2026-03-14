import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Trash2, Calendar, Tag } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "comeback", label: "컴백", emoji: "🎵" },
  { value: "mv_release", label: "MV 공개", emoji: "🎬" },
  { value: "album_release", label: "앨범 발매", emoji: "💿" },
  { value: "festival", label: "페스티벌", emoji: "🎪" },
  { value: "variety_show", label: "예능 출연", emoji: "📺" },
  { value: "award_show", label: "시상식", emoji: "🏆" },
  { value: "viral_moment", label: "바이럴", emoji: "🔥" },
  { value: "scandal", label: "이슈/스캔들", emoji: "⚡" },
  { value: "concert_tour", label: "콘서트/투어", emoji: "🎤" },
];

const EVENT_TYPE_MAP = Object.fromEntries(EVENT_TYPES.map(t => [t.value, t]));

interface EventForm {
  wiki_entry_id: string;
  event_type: string;
  event_date: string;
  event_title: string;
  source_url: string;
  impact_window_days: number;
}

const EMPTY_FORM: EventForm = {
  wiki_entry_id: "",
  event_type: "comeback",
  event_date: new Date().toISOString().split("T")[0],
  event_title: "",
  source_url: "",
  impact_window_days: 7,
};

const AdminSignalEvents = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  // 아티스트 목록
  const { data: artists } = useQuery({
    queryKey: ["signal-artists"],
    queryFn: async () => {
      const { data } = await supabase
        .from("v3_artist_tiers")
        .select("wiki_entry_id, display_name, wiki_entry:wiki_entries(title)")
        .in("tier", [1, 2])
        .order("tier", { ascending: true });
      return (data || []) as any[];
    },
  });

  // 이벤트 목록
  const { data: events, isLoading } = useQuery({
    queryKey: ["signal-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_artist_events" as any)
        .select("*, wiki_entry:wiki_entries(title)")
        .order("event_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: EventForm & { id?: string }) => {
      const { id, ...rest } = data;
      if (id) {
        const { error } = await supabase.from("ktrenz_artist_events" as any).update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ktrenz_artist_events" as any).insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-events"] });
      setDialogOpen(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      toast.success("이벤트 저장 완료");
    },
    onError: (err) => toast.error(`저장 실패: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ktrenz_artist_events" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-events"] });
      toast.success("삭제 완료");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ktrenz_artist_events" as any).update({ verified: true } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-events"] });
      toast.success("검증 완료");
    },
  });

  const openEdit = (ev: any) => {
    setEditId(ev.id);
    setForm({
      wiki_entry_id: ev.wiki_entry_id,
      event_type: ev.event_type,
      event_date: ev.event_date,
      event_title: ev.event_title,
      source_url: ev.source_url || "",
      impact_window_days: ev.impact_window_days,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">📅 이벤트 라벨링</h1>
          <p className="text-sm text-muted-foreground mt-1">Signal-A: 아티스트 이벤트 등록 및 관리</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          이벤트 등록
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {EVENT_TYPES.slice(0, 4).map(({ value, label, emoji }) => {
          const count = events?.filter((e: any) => e.event_type === value).length || 0;
          return (
            <Card key={value}>
              <CardContent className="py-3 text-center">
                <div className="text-lg">{emoji}</div>
                <div className="text-xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Event List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !events?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
            등록된 이벤트가 없습니다. 첫 이벤트를 등록해보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev: any) => {
            const typeInfo = EVENT_TYPE_MAP[ev.event_type] || { emoji: "📌", label: ev.event_type };
            return (
              <Card key={ev.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-base">{typeInfo.emoji}</span>
                        <span className="text-sm font-semibold truncate">{ev.event_title}</span>
                        {ev.verified && <Badge variant="default" className="text-[10px] h-4">✓ 검증</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">{ev.wiki_entry?.title}</span>
                        <span>·</span>
                        <span>{ev.event_date}</span>
                        <span>·</span>
                        <Badge variant="outline" className="text-[10px] h-4">{typeInfo.label}</Badge>
                        <span>·</span>
                        <span>영향 {ev.impact_window_days}일</span>
                        <span>·</span>
                        <Badge variant="secondary" className="text-[10px] h-4">{ev.labeled_by}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!ev.verified && (
                        <Button variant="ghost" size="sm" onClick={() => verifyMutation.mutate(ev.id)}>✓</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ev)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm("이 이벤트를 삭제하시겠습니까?")) deleteMutation.mutate(ev.id);
                      }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "이벤트 수정" : "새 이벤트 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>아티스트</Label>
              <Select value={form.wiki_entry_id} onValueChange={(v) => setForm(f => ({ ...f, wiki_entry_id: v }))}>
                <SelectTrigger><SelectValue placeholder="아티스트 선택" /></SelectTrigger>
                <SelectContent>
                  {(artists || []).map((a: any) => (
                    <SelectItem key={a.wiki_entry_id} value={a.wiki_entry_id}>
                      {a.display_name || a.wiki_entry?.title || a.wiki_entry_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>이벤트 유형</Label>
              <Select value={form.event_type} onValueChange={(v) => setForm(f => ({ ...f, event_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>이벤트 제목</Label>
              <Input value={form.event_title} onChange={(e) => setForm(f => ({ ...f, event_title: e.target.value }))} placeholder="SEVENTEEN 12th Mini Album" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>이벤트 날짜</Label>
                <Input type="date" value={form.event_date} onChange={(e) => setForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div>
                <Label>영향 기간 (일)</Label>
                <Input type="number" value={form.impact_window_days} onChange={(e) => setForm(f => ({ ...f, impact_window_days: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>출처 URL (선택)</Label>
              <Input value={form.source_url} onChange={(e) => setForm(f => ({ ...f, source_url: e.target.value }))} placeholder="https://..." />
            </div>
            <Button
              className="w-full"
              onClick={() => saveMutation.mutate({ ...form, ...(editId ? { id: editId } : {}) })}
              disabled={saveMutation.isPending || !form.wiki_entry_id || !form.event_title}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSignalEvents;
