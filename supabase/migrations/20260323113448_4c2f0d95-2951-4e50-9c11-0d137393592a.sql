-- 키워드 팔로우 알림 테이블
CREATE TABLE public.ktrenz_keyword_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  follow_id uuid NOT NULL,
  trigger_id uuid NOT NULL,
  keyword text NOT NULL,
  artist_name text,
  notification_type text NOT NULL DEFAULT 'influence_change',
  old_value numeric,
  new_value numeric,
  delta_pct numeric,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_keyword_notif_user ON public.ktrenz_keyword_notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_keyword_notif_follow ON public.ktrenz_keyword_notifications(follow_id);

ALTER TABLE public.ktrenz_keyword_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.ktrenz_keyword_notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.ktrenz_keyword_notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service can insert notifications"
ON public.ktrenz_keyword_notifications FOR INSERT
TO service_role
WITH CHECK (true);