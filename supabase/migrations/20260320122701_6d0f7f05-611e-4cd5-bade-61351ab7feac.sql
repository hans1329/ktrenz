-- Reset: expire all recent active/pending triggers so we can re-collect cleanly
UPDATE ktrenz_trend_triggers 
SET status = 'expired', expired_at = now()
WHERE status IN ('active', 'pending') 
  AND detected_at > now() - interval '7 days';
