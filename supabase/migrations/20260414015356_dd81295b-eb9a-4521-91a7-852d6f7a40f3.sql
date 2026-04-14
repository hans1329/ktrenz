CREATE OR REPLACE FUNCTION public.mark_b2_predictions_seen(_prediction_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _updated_count integer := 0;
BEGIN
  _caller_id := auth.uid();

  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _prediction_ids IS NULL OR array_length(_prediction_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.b2_predictions
  SET seen_at = now()
  WHERE id = ANY(_prediction_ids)
    AND user_id = _caller_id
    AND status IN ('won', 'lost')
    AND settled_at IS NOT NULL
    AND seen_at IS NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;
  RETURN _updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_b2_predictions_seen(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_b2_predictions_seen(uuid[]) TO authenticated;