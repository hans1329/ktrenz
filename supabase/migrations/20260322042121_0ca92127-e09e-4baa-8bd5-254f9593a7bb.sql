-- 잘못 귀속된 키워드 정리
-- 1) Han에 잘못 귀속된 까르띠에 (실제 현진 관련)
DELETE FROM ktrenz_trend_triggers 
WHERE star_id = 'c9e7e3b9-ea5d-4992-9268-a29bb1b027e1' 
  AND keyword_ko = '까르띠에';

-- 2) HIGHLIGHT에 잘못 귀속된 핫도그 (홍진경 관련 기사)
DELETE FROM ktrenz_trend_triggers 
WHERE star_id = '6972fe57-47c1-4771-a8bb-06b9113ece62' 
  AND keyword_ko = '핫도그';

-- 3) 설윤에 잘못 귀속된 하이라이트 (다른 그룹 기사)
DELETE FROM ktrenz_trend_triggers 
WHERE star_id = '5a6851c1-562f-412f-9672-645740e7bde1' 
  AND keyword_ko = '하이라이트';

-- 4) 엄!브렐라 에이전시 (TV 캠페인 노이즈)
DELETE FROM ktrenz_trend_triggers 
WHERE keyword_ko = '엄!브렐라 에이전시';

-- 파이프라인 리셋하여 재수집
UPDATE ktrenz_pipeline_state SET phase = 'idle', current_offset = 0, postprocess_done = false, updated_at = now();