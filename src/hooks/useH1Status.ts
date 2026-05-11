// useH1Status — H1 wallet/slot/drip state for the current user.
//
// Backed by the `ktrenz_h1_my_status` RPC. Auto-claims the daily drip on
// mount (lazy server-side check; safe to call repeatedly). Caller refetches
// after each vouch via the returned `refetch()` so slot counters stay live.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConfidenceTier = "low" | "mid" | "high";

export type H1Slots = Record<ConfidenceTier, { used: number; cap: number }>;

export type H1AdUnlocks = {
  used: number;
  max_per_day: number;
  mid: number;
  high: number;
};

export type H1Status = {
  signed_in: boolean;
  balance: number;
  slots: H1Slots;
  ad_unlocks: H1AdUnlocks;
  drip: {
    claimed_today: boolean;
    eligible: boolean;
    amount: number;
  };
};

const EMPTY_STATUS: H1Status = {
  signed_in: false,
  balance: 0,
  slots: {
    low:  { used: 0, cap: 1 },
    mid:  { used: 0, cap: 4 },
    high: { used: 0, cap: 2 },
  },
  ad_unlocks: { used: 0, max_per_day: 2, mid: 0, high: 0 },
  drip: { claimed_today: false, eligible: false, amount: 10 },
};

export function useH1Status(
  userId: string | undefined,
  onDripGranted?: (amount: number) => void,
) {
  const [status, setStatus] = useState<H1Status>(EMPTY_STATUS);
  const [loading, setLoading] = useState(false);
  const dripClaimedRef = useRef(false);
  const onDripRef = useRef(onDripGranted);
  // Keep callback ref current without re-triggering the claim effect.
  useEffect(() => { onDripRef.current = onDripGranted; }, [onDripGranted]);

  const refetch = useCallback(async () => {
    if (!userId) {
      setStatus(EMPTY_STATUS);
      return;
    }
    setLoading(true);

    // Two parallel reads — keeps balance live even if the new H1 status RPC
    // hasn't been deployed yet (migration applied separately via Dashboard).
    // ktrenz_user_points is the authoritative wallet either way.
    const [pointsRes, statusRes] = await Promise.all([
      (supabase as any)
        .from("ktrenz_user_points")
        .select("points")
        .eq("user_id", userId)
        .maybeSingle(),
      (supabase as any).rpc("ktrenz_h1_my_status"),
    ]);
    setLoading(false);

    const directBalance = (pointsRes?.data?.points as number | undefined) ?? 0;

    if (!statusRes.error && statusRes.data) {
      // Full status path — slot caps + drip eligibility from server.
      // Older deploys may not return ad_unlocks; fill in defaults.
      const raw = statusRes.data as Partial<H1Status>;
      setStatus({
        ...EMPTY_STATUS,
        ...(raw as H1Status),
        ad_unlocks: (raw.ad_unlocks as H1AdUnlocks | undefined) ?? EMPTY_STATUS.ad_unlocks,
      });
      return;
    }

    // Fallback path — show balance and signed-in, default slots/drip.
    if (statusRes.error) {
      console.warn("[h1] my_status RPC unavailable, using points fallback:", statusRes.error?.message);
    }
    setStatus({
      ...EMPTY_STATUS,
      signed_in: true,
      balance: directBalance,
    });
  }, [userId]);

  // Initial fetch + drip auto-claim on user change
  useEffect(() => {
    if (!userId) {
      setStatus(EMPTY_STATUS);
      dripClaimedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      // Try claiming drip first — server enforces all guards. Then refetch.
      if (!dripClaimedRef.current) {
        dripClaimedRef.current = true;
        const { data: dripData, error: dripErr } = await (supabase as any)
          .rpc("ktrenz_h1_claim_drip");
        if (!dripErr && (dripData as any)?.granted && !cancelled) {
          const amount = (dripData as any).amount as number;
          onDripRef.current?.(amount);
        }
      }
      if (cancelled) return;
      await refetch();
    })();
    return () => { cancelled = true; };
  }, [userId, refetch]);

  // Local helpers used by the vouch UI to avoid pinging the server for state
  // it just displayed. Falls back to permissive when status not loaded.
  const canCall = useCallback((tier: ConfidenceTier): { ok: boolean; reason?: string } => {
    if (!status.signed_in) return { ok: true }; // anon flow uses localStorage; server rules don't apply
    const slot = status.slots[tier];
    if (slot.used >= slot.cap) return { ok: false, reason: "slot_full" };
    if (tier !== "low" && status.balance <= 0) return { ok: false, reason: "insufficient_balance" };
    return { ok: true };
  }, [status]);

  return { status, loading, refetch, canCall };
}
