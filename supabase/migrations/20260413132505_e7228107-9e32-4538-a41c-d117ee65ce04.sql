
CREATE OR REPLACE FUNCTION public.ktrenz_prediction_leaderboard()
RETURNS TABLE(
  user_id uuid,
  total_bets bigint,
  wins bigint,
  losses bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    count(*) AS total_bets,
    count(*) FILTER (WHERE p.status = 'won') AS wins,
    count(*) FILTER (WHERE p.status = 'lost') AS losses
  FROM b2_predictions p
  GROUP BY p.user_id
  ORDER BY count(*) DESC
  LIMIT 50;
$$;
