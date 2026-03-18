import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Users, User, Star, Pencil, Trash2, Loader2, Link as LinkIcon, ExternalLink, Globe,
} from "lucide-react";

/* ───── types ───── */
interface StarRow {
  id: string;
  display_name: string;
  name_ko: string | null;
  star_type: string;
  is_active: boolean | null;
  wiki_entry_id: string | null;
  group_star_id: string | null;
  social_handles: Record<string, string> | null;
  influence_categories: string[] | null;
  musicbrainz_id: string | null;
  namuwiki_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ParsedArtist {
  display_name: string;
  name_ko: string;
  star_type: string;
  group_name: string | null;
  members: string[];
  debut_date: string | null;
  agency: string | null;
  social_handles: Record<string, string | null>;
}

const STAR_TYPE_OPTIONS = [
  { value: "group", label: "그룹", icon: Users },
  { value: "member", label: "멤버", icon: User },
  { value: "solo", label: "솔로", icon: Star },
];

const typeColor: Record<string, string> = {
  group: "bg-primary/10 text-primary",
  member: "bg-blue-500/10 text-blue-500",
  solo: "bg-amber-500/10 text-amber-500",
};

/* ───── page ───── */
const AdminStars = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStar, setEditingStar] = useState<StarRow | null>(null);

  /* form state */
  const [form, setForm] = useState({
    display_name: "",
    name_ko: "",
    star_type: "group" as string,
    wiki_entry_id: "",
    group_star_id: "",
    namuwiki_url: "",
    is_active: true,
  });
  const [namuUrl, setNamuUrl] = useState("");
  const [namuLoading, setNamuLoading] = useState(false);
  const [namuResult, setNamuResult] = useState<ParsedArtist | null>(null);

  /* ───── queries ───── */
  const { data: stars, isLoading } = useQuery({
    queryKey: ["admin-stars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_stars")
        .select("*")
        .order("star_type")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as StarRow[];
    },
  });

  const groups = useMemo(
    () => (stars ?? []).filter((s) => s.star_type === "group"),
    [stars],
  );

  const groupMap = useMemo(() => {
    const m: Record<string, string> = {};
    groups.forEach((g) => (m[g.id] = g.display_name));
    return m;
  }, [groups]);

  /* ───── namuwiki parse ───── */
  const parseNamuwiki = async () => {
    const url = namuUrl.trim();
    if (!url || !url.includes("namu.wiki")) {
      toast.error("유효한 나무위키 URL을 입력하세요");
      return;
    }
    setNamuLoading(true);
    setNamuResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("parse-namuwiki", {
        body: { namuwiki_url: url },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "파싱 실패");

      const parsed = data.data as ParsedArtist;
      setNamuResult(parsed);

      // Auto-fill form
      setForm((prev) => ({
        ...prev,
        display_name: parsed.display_name || prev.display_name,
        name_ko: parsed.name_ko || prev.name_ko,
        star_type: parsed.star_type || prev.star_type,
        namuwiki_url: url,
      }));

      // Try to find group_star_id if member
      if (parsed.star_type === "member" && parsed.group_name) {
        const matchedGroup = groups.find(
          (g) =>
            g.display_name.toLowerCase() === parsed.group_name!.toLowerCase() ||
            (g.name_ko && g.name_ko === parsed.group_name),
        );
        if (matchedGroup) {
          setForm((prev) => ({ ...prev, group_star_id: matchedGroup.id }));
        }
      }

      toast.success(`파싱 완료: ${parsed.display_name || parsed.name_ko}`);
    } catch (err: any) {
      toast.error(`파싱 실패: ${err.message}`);
    } finally {
      setNamuLoading(false);
    }
  };

  /* ───── mutations ───── */
  const saveMutation = useMutation({
    mutationFn: async (isEdit: boolean) => {
      const payload: any = {
        display_name: form.display_name,
        name_ko: form.name_ko || null,
        star_type: form.star_type,
        wiki_entry_id: form.wiki_entry_id || null,
        group_star_id: form.group_star_id || null,
        namuwiki_url: form.namuwiki_url || null,
        is_active: form.is_active,
      };
      if (isEdit && editingStar) {
        const { error } = await supabase
          .from("ktrenz_stars")
          .update(payload)
          .eq("id", editingStar.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ktrenz_stars")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingStar ? "수정 완료" : "등록 완료");
      qc.invalidateQueries({ queryKey: ["admin-stars"] });
      closeDialog();
    },
    onError: (err) => toast.error(`저장 실패: ${(err as Error).message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ktrenz_stars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("삭제 완료");
      qc.invalidateQueries({ queryKey: ["admin-stars"] });
    },
    onError: (err) => toast.error(`삭제 실패: ${(err as Error).message}`),
  });

  /* ───── helpers ───── */
  const openCreate = () => {
    setEditingStar(null);
    setForm({ display_name: "", name_ko: "", star_type: "group", wiki_entry_id: "", group_star_id: "", namuwiki_url: "", is_active: true });
    setNamuUrl("");
    setNamuResult(null);
    setDialogOpen(true);
  };

  const openEdit = (s: StarRow) => {
    setEditingStar(s);
    setForm({
      display_name: s.display_name,
      name_ko: s.name_ko ?? "",
      star_type: s.star_type,
      wiki_entry_id: s.wiki_entry_id ?? "",
      group_star_id: s.group_star_id ?? "",
      namuwiki_url: (s as any).namuwiki_url ?? "",
      is_active: s.is_active ?? true,
    });
    setNamuUrl((s as any).namuwiki_url ?? "");
    setNamuResult(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingStar(null);
    setNamuResult(null);
  };

  /* ───── filtered list ───── */
  const filtered = useMemo(() => {
    if (!stars) return [];
    return stars.filter((s) => {
      if (typeFilter !== "all" && s.star_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.display_name.toLowerCase().includes(q) ||
          (s.name_ko ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stars, search, typeFilter]);

  const counts = useMemo(() => {
    const c = { group: 0, member: 0, solo: 0 };
    (stars ?? []).forEach((s) => {
      if (s.star_type in c) c[s.star_type as keyof typeof c]++;
    });
    return c;
  }, [stars]);

  /* ───── render ───── */
  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">스타 관리</h1>
          <p className="text-xs text-muted-foreground">
            그룹 {counts.group} · 멤버 {counts.member} · 솔로 {counts.solo}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> 등록
        </Button>
      </div>

      {/* filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="이름 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="group">그룹</SelectItem>
            <SelectItem value="member">멤버</SelectItem>
            <SelectItem value="solo">솔로</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">이름</th>
                  <th className="text-left px-3 py-2 font-medium">한글명</th>
                  <th className="text-left px-3 py-2 font-medium">타입</th>
                  <th className="text-left px-3 py-2 font-medium">소속 그룹</th>
                  <th className="text-left px-3 py-2 font-medium">나무위키</th>
                  <th className="text-left px-3 py-2 font-medium">상태</th>
                  <th className="text-right px-3 py-2 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{s.display_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.name_ko ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={cn("text-[10px]", typeColor[s.star_type])}>
                        {s.star_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {s.group_star_id ? groupMap[s.group_star_id] ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {(s as any).namuwiki_url ? (
                        <a
                          href={(s as any).namuwiki_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline text-xs flex items-center gap-1"
                        >
                          <Globe className="w-3 h-3" /> 연결됨
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">미연결</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block w-2 h-2 rounded-full", s.is_active ? "bg-green-500" : "bg-muted-foreground/40")} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`"${s.display_name}" 삭제?`)) deleteMutation.mutate(s.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      검색 결과 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ───── 등록/수정 다이얼로그 ───── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingStar ? "스타 수정" : "스타 등록"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* namuwiki URL lookup */}
            <div>
              <label className="text-xs font-medium mb-1 block">🌿 나무위키 URL로 자동 파싱</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://namu.wiki/w/아티스트명"
                  value={namuUrl}
                  onChange={(e) => setNamuUrl(e.target.value)}
                  className="h-9 text-xs"
                />
                <Button size="sm" variant="outline" onClick={parseNamuwiki} disabled={namuLoading}>
                  {namuLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {namuResult && (
                <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border text-xs space-y-1">
                  <p className="font-semibold">{namuResult.display_name} / {namuResult.name_ko}</p>
                  <p className="text-muted-foreground">
                    타입: {namuResult.star_type}
                    {namuResult.group_name && ` · 그룹: ${namuResult.group_name}`}
                    {namuResult.agency && ` · 소속사: ${namuResult.agency}`}
                  </p>
                  {namuResult.members && namuResult.members.length > 0 && (
                    <p className="text-muted-foreground">멤버: {namuResult.members.join(", ")}</p>
                  )}
                  {namuResult.social_handles && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(namuResult.social_handles)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <Badge key={k} variant="outline" className="text-[9px]">
                            {k}: {v}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* display name */}
            <div>
              <label className="text-xs font-medium mb-1 block">표시명 (영문)</label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="h-9"
              />
            </div>

            {/* korean name */}
            <div>
              <label className="text-xs font-medium mb-1 block">한글명</label>
              <Input
                value={form.name_ko}
                onChange={(e) => setForm({ ...form, name_ko: e.target.value })}
                className="h-9"
              />
            </div>

            {/* star type */}
            <div>
              <label className="text-xs font-medium mb-1 block">타입</label>
              <Select value={form.star_type} onValueChange={(v) => setForm({ ...form, star_type: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAR_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* group (for members) */}
            {form.star_type === "member" && (
              <div>
                <label className="text-xs font-medium mb-1 block">소속 그룹</label>
                <Select
                  value={form.group_star_id || "none"}
                  onValueChange={(v) => setForm({ ...form, group_star_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* wiki_entry_id */}
            <div>
              <label className="text-xs font-medium mb-1 block">wiki_entry_id</label>
              <Input
                value={form.wiki_entry_id}
                onChange={(e) => setForm({ ...form, wiki_entry_id: e.target.value })}
                className="h-9 text-xs font-mono"
                placeholder="내부 위키 연결 (선택)"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button
              onClick={() => saveMutation.mutate(!!editingStar)}
              disabled={!form.display_name || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              {editingStar ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStars;
