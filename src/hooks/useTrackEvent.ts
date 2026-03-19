import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TrackEventType =
  | "treemap_click"
  | "list_click"
  | "modal_category_click"
  | "artist_detail_view"
  | "artist_detail_section"
  | "external_link_click"
  | "agent_chat"
  | "agent_mode_switch"
  | "t2_treemap_click"
  | "t2_list_click"
  | "t2_artist_click"
  | "t2_artist_view"
  | "t2_keyword_detail_view"
  | "t2_external_link_click"
  | "t2_detail_open"
  | "t2_share";

interface EventData {
  artist_slug?: string;
  artist_name?: string;
  section?: string;
  category?: string;
  url?: string;
  mode?: string;
  [key: string]: any;
}

export function useTrackEvent() {
  const queueRef = useRef<Array<{ event_type: string; event_data: EventData }>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const batch = queueRef.current.splice(0, queueRef.current.length);
    const rows = batch.map(e => ({
      user_id: user.id,
      event_type: e.event_type,
      event_data: e.event_data,
    }));

    await supabase.from("ktrenz_user_events" as any).insert(rows);
  }, []);

  const track = useCallback((eventType: TrackEventType, eventData: EventData = {}) => {
    queueRef.current.push({ event_type: eventType, event_data: eventData });

    // 디바운스: 500ms 내 여러 이벤트를 배치 처리
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  return track;
}
