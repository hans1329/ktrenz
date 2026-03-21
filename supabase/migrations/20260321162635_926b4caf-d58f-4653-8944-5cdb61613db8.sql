-- 스윔(BTS 노래)이 HIGHLIGHT에 잘못 귀속된 건 expired 처리
UPDATE ktrenz_trend_triggers
SET status = 'expired'
WHERE keyword_ko = '스윔' AND artist_name = 'HIGHLIGHT' AND status IN ('active', 'pending');