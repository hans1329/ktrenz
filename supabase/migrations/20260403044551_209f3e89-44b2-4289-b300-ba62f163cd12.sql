
-- 파이프라인 시작 크론을 06:00 KST(21:00 UTC) → 00:00 KST(15:00 UTC)로 변경
SELECT cron.alter_job(339, schedule := '0 15 * * *');
