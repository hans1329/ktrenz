import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Youtube, Loader2, ExternalLink, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const CATEGORIES = [
  { value: "variety", label: "Variety / Entertainment" },
  { value: "music_show", label: "Music Show" },
  { value: "news", label: "News / Media" },
  { value: "reaction", label: "Reaction / Review" },
  { value: "other", label: "Other" },
];

type ResolvedChannel = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url: string | null;
};

const AdminWatchedChannels = () => {
  const queryClient = useQueryClient();
  const [handleInput, setHandleInput] = useState("");
  const [newCategory, setNewCategory] = useState("variety");
  const [resolved, setResolved] = useState<ResolvedChannel | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["admin-watched-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_watched_channels" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (input: string) => {
      const { data, error } = await supabase.functions.invoke("resolve-youtube-channel", {
        body: { input },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data as ResolvedChannel;
    },
    onSuccess: (data) => {
      setResolved(data);
      toast.success(`Found: ${data.channel_name}`);
    },
    onError: (e: any) => {
      setResolved(null);
      toast.error(e.message || "Channel not found");
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!resolved) throw new Error("Resolve a channel first");
      const { error } = await supabase
        .from("ktrenz_watched_channels" as any)
        .insert({
          channel_id: resolved.channel_id,
          channel_name: resolved.channel_name,
          channel_url: resolved.channel_url,
          category: newCategory,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-watched-channels"] });
      setHandleInput("");
      setResolved(null);
      toast.success("Channel added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("ktrenz_watched_channels" as any)
        .update({ is_active: isActive, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-watched-channels"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ktrenz_watched_channels" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-watched-channels"] });
      toast.success("Channel removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: matchStats } = useQuery({
    queryKey: ["admin-watched-match-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ktrenz_external_video_matches" as any)
        .select("channel_id, video_id")
        .order("collected_at", { ascending: false })
        .limit(500);
      if (error) return {};
      const stats: Record<string, number> = {};
      (data as any[]).forEach((m: any) => {
        stats[m.channel_id] = (stats[m.channel_id] || 0) + 1;
      });
      return stats;
    },
  });

  const handleResolve = () => {
    if (!handleInput.trim()) return;
    setResolved(null);
    resolveMutation.mutate(handleInput.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reference YouTube List</h1>
        <p className="text-sm text-muted-foreground mt-1">
          External YouTube channels to monitor for artist appearances (variety shows, music shows, etc.)
        </p>
      </div>

      {/* Add new channel */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Add Channel</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-[240px]">
            <label className="text-xs text-muted-foreground">YouTube Handle or URL</label>
            <div className="flex gap-1.5">
              <Input
                placeholder="@handle or youtube.com/@handle"
                value={handleInput}
                onChange={(e) => {
                  setHandleInput(e.target.value);
                  setResolved(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleResolve()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleResolve}
                disabled={resolveMutation.isPending || !handleInput.trim()}
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !resolved}
            size="sm"
          >
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>

        {/* Resolved preview */}
        {resolved && (
          <div className="mt-3 flex items-center gap-3 p-2.5 rounded-md bg-muted/50 border border-border">
            {resolved.thumbnail_url && (
              <img src={resolved.thumbnail_url} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{resolved.channel_name}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">{resolved.channel_id}</div>
            </div>
            <a
              href={resolved.channel_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </Card>

      {/* Channel list */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No channels added yet
                  </TableCell>
                </TableRow>
              )}
              {channels?.map((ch: any) => (
                <TableRow key={ch.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-red-500 shrink-0" />
                      <div>
                        <div className="font-medium text-sm">{ch.channel_name}</div>
                        <a
                          href={ch.channel_url || `https://www.youtube.com/channel/${ch.channel_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          {ch.channel_id}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORIES.find((c) => c.value === ch.category)?.label || ch.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {(matchStats as any)?.[ch.channel_id] || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={ch.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: ch.id, isActive: checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Remove this channel?")) deleteMutation.mutate(ch.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default AdminWatchedChannels;
