import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCallback } from "react";
import { toast } from "sonner";

export interface AgentSlot {
  id: string;
  user_id: string;
  slot_index: number;
  artist_name: string | null;
  wiki_entry_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SlotLimit {
  tier: string;
  base_slots: number;
  purchased_slots: number;
  total_slots: number;
}

export function useAgentSlots() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["ktrenz-agent-slots", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("ktrenz_agent_slots")
        .select("*")
        .eq("user_id", user.id)
        .order("slot_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentSlot[];
    },
    enabled: !!user?.id,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: slotLimit } = useQuery({
    queryKey: ["ktrenz-agent-slot-limit", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("ktrenz_get_agent_slot_limit" as any, { _user_id: user.id });
      if (error) throw error;
      return data as SlotLimit | null;
    },
    enabled: !!user?.id,
  });

  const activeSlot = slots.find((s) => s.is_active) ?? slots[0] ?? null;
  const canAddSlot = slotLimit ? slots.length < slotLimit.total_slots : false;
  const canPurchaseSlot = true; // always possible with 1000 points

  const switchSlot = useCallback(async (slotId: string) => {
    if (!user?.id) return;
    // Optimistic update: mark the target slot active locally
    queryClient.setQueryData(["ktrenz-agent-slots", user.id], (old: AgentSlot[] | undefined) =>
      (old ?? []).map((s) => ({ ...s, is_active: s.id === slotId }))
    );
    // Single batch: deactivate all, then activate selected
    const { error: deactivateErr } = await (supabase as any)
      .from("ktrenz_agent_slots")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .neq("id", slotId);
    if (deactivateErr) console.error("deactivate error:", deactivateErr);

    const { error: activateErr } = await (supabase as any)
      .from("ktrenz_agent_slots")
      .update({ is_active: true })
      .eq("id", slotId);
    if (activateErr) console.error("activate error:", activateErr);

    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user.id] });
  }, [user?.id, queryClient]);

  const createSlot = useCallback(async (artistName: string, wikiEntryId?: string) => {
    if (!user?.id) return null;
    const nextIndex = slots.length;

    // First deactivate all existing slots
    if (slots.length > 0) {
      await (supabase as any)
        .from("ktrenz_agent_slots")
        .update({ is_active: false })
        .eq("user_id", user.id);
    }

    const { data, error } = await (supabase as any)
      .from("ktrenz_agent_slots")
      .upsert({
        user_id: user.id,
        slot_index: nextIndex,
        artist_name: artistName,
        wiki_entry_id: wikiEntryId || null,
        is_active: true,
      }, { onConflict: "user_id,slot_index", ignoreDuplicates: false })
      .select()
      .single();
    if (error) {
      // If duplicate, just refetch existing slots
      if (error.code === "23505") {
        queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user.id] });
        return null;
      }
      toast.error(error.message);
      return null;
    }
    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user.id] });
    return data as AgentSlot;
  }, [user?.id, slots.length, queryClient]);

  const purchaseSlot = useCallback(async () => {
    if (!user?.id) return false;
    const { data, error } = await supabase.rpc("ktrenz_purchase_agent_slot" as any, { _user_id: user.id });
    if (error) {
      toast.error(error.message);
      return false;
    }
    if (data && !data.success) {
      if (data.reason === "insufficient_points") {
        toast.error("Not enough points (1,000P required)");
      }
      return false;
    }
    toast.success("Agent slot purchased!");
    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slot-limit", user.id] });
    queryClient.invalidateQueries({ queryKey: ["ktrenz-user-points", user.id] });
    return true;
  }, [user?.id, queryClient]);

  const deleteSlot = useCallback(async (slotId: string) => {
    if (!user?.id) return;
    await (supabase as any)
      .from("ktrenz_agent_slots")
      .delete()
      .eq("id", slotId);
    // If deleted active slot, activate first remaining
    queryClient.invalidateQueries({ queryKey: ["ktrenz-agent-slots", user.id] });
  }, [user?.id, queryClient]);

  return {
    slots,
    slotsLoading,
    slotLimit,
    activeSlot,
    canAddSlot,
    canPurchaseSlot,
    switchSlot,
    createSlot,
    purchaseSlot,
    deleteSlot,
  };
}
