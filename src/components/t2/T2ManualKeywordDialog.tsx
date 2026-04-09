import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, Search, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface StarResult {
  id: string;
  display_name: string;
  name_ko: string | null;
  image_url: string | null;
  star_type: string;
}

const CATEGORIES = [
  "brand", "product", "place", "restaurant", "food",
  "fashion", "beauty", "media", "music", "event", "social",
] as const;

const T2ManualKeywordDialog = () => {
  const [open, setOpen] = useState(false);
  const [starQuery, setStarQuery] = useState("");
  const [starResults, setStarResults] = useState<StarResult[]>([]);
  const [selectedStar, setSelectedStar] = useState<StarResult | null>(null);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string>("event");
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 스타 검색
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (starQuery.trim().length < 2) { setStarResults([]); return; }
      setIsSearching(true);
      try {
        const q = starQuery.trim();
        const { data } = await (supabase as any)
          .from("ktrenz_stars")
          .select("id, display_name, name_ko, image_url, star_type")
          .eq("is_active", true)
          .or(`display_name.ilike.%${q}%,name_ko.ilike.%${q}%`)
          .limit(10);
        setStarResults(data ?? []);
      } catch { setStarResults([]); }
      finally { setIsSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [starQuery]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStar || !keyword.trim()) throw new Error("스타와 키워드를 입력하세요");
      const { data, error } = await supabase.functions.invoke("ktrenz-manual-keyword", {
        body: {
          star_id: selectedStar.id,
          keyword: keyword.trim(),
          keyword_category: category,
        },
      });
      if (error) throw error;
      return typeof data === "string" ? JSON.parse(data) : data;
    },
    onSuccess: (data) => {
      toast({
        title: `키워드 등록 완료`,
        description: `${data.star} → "${data.keyword}" ${data.isNew ? "(신규)" : "(기존 키워드에 소스 추가)"}`,
      });
      setOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast({ title: `등록 실패: ${(err as Error).message}`, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setStarQuery("");
    setStarResults([]);
    setSelectedStar(null);
    setKeyword("");
    setCategory("event");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="w-full justify-start gap-2 text-xs h-8">
          <Plus className="w-3.5 h-3.5" /> 수동 키워드 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-4 rounded-2xl z-[9999]">
        <DialogHeader>
          <DialogTitle>수동 키워드 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 스타 선택 */}
          {selectedStar ? (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <Avatar className="w-10 h-10 rounded-lg">
                <AvatarImage src={selectedStar.image_url || undefined} className="object-cover" />
                <AvatarFallback className="rounded-lg text-xs">{selectedStar.display_name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{selectedStar.display_name}</p>
                <p className="text-xs text-muted-foreground">{selectedStar.name_ko}</p>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setSelectedStar(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">아티스트 검색</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  placeholder="이름으로 검색..."
                  value={starQuery}
                  onChange={(e) => setStarQuery(e.target.value)}
                  className="pl-9"
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {starResults.length > 0 && (
                <div className="border rounded-xl max-h-48 overflow-y-auto">
                  {starResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedStar(s); setStarQuery(""); setStarResults([]); }}
                      className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <Avatar className="w-8 h-8 rounded-lg">
                        <AvatarImage src={s.image_url || undefined} className="object-cover" />
                        <AvatarFallback className="rounded-lg text-[10px]">{s.display_name.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.display_name}</p>
                        <p className="text-xs text-muted-foreground">{s.name_ko} · {s.star_type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 키워드 입력 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">키워드</label>
            <Input
              placeholder="트렌드 키워드 입력..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          {/* 카테고리 선택 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">카테고리</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[10000]">
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 제출 */}
          <Button
            className="w-full"
            disabled={!selectedStar || !keyword.trim() || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 등록 중...</>
            ) : (
              <><Plus className="w-4 h-4 mr-2" /> 키워드 등록 및 수집 시작</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default T2ManualKeywordDialog;
