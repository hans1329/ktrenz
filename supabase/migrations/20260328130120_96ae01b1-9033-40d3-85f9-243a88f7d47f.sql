UPDATE ktrenz_trend_triggers 
SET baseline_score = 0, peak_score = 0, prev_api_total = 0, influence_index = 0 
WHERE status = 'active' 
AND trigger_source = 'naver_news' 
AND baseline_score > 0