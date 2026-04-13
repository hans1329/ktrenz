import { useState, useCallback, useEffect } from "react";
import { Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TicketInfoPopup from "@/components/TicketInfoPopup";

const CACHE_TTL = 30_000;
let cachedTicket: { remaining: number; total: number; used: number } | null = null;
let cachedTs = 0;

const HeaderTicketSlot = () => {
  const { user, profile } = useAuth();
  const [ticketInfo, setTicketInfo] = useState<{ remaining: number; total: number; used: number } | null>(cachedTicket);
  const [showPopup, setShowPopup] = useState(false);

  const load = useCallback(async () => {
    if (cachedTicket && Date.now() - cachedTs < CACHE_TTL) {
      setTicketInfo(cachedTicket);
      return;
    }
    if (!user) return;
    const { data } = await supabase.rpc("ktrenz_get_prediction_tickets" as any, { _user_id: user.id });
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    if (parsed) {
      cachedTicket = parsed;
      cachedTs = Date.now();
      setTicketInfo(parsed);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const remaining = ticketInfo?.remaining ?? 3;
  const total = ticketInfo?.total ?? 3;

  return (
    <>
      <button onClick={() => setShowPopup(true)} className="flex items-center gap-1 active:opacity-60 transition-opacity">
        <Ticket className="text-primary h-[16px] w-[18px]" />
        <span className="font-bold text-primary text-sm">{remaining}</span>
      </button>
      <TicketInfoPopup open={showPopup} onClose={() => setShowPopup(false)} remaining={remaining} total={total} totalPoints={profile?.total_points ?? 0} />
    </>
  );
};

export default HeaderTicketSlot;
