
DELETE FROM ktrenz_trend_markets
WHERE status = 'open'
AND NOT EXISTS (SELECT 1 FROM ktrenz_trend_bets b WHERE b.market_id = ktrenz_trend_markets.id)
AND trigger_id IN (
  SELECT t.id FROM ktrenz_trend_triggers t
  WHERE (SELECT COUNT(*) FROM ktrenz_trend_tracking tt WHERE tt.trigger_id = t.id) < 2
);
