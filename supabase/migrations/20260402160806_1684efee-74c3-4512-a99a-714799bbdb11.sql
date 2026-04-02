
-- Add daily_prediction_tickets to levels table
ALTER TABLE public.levels ADD COLUMN IF NOT EXISTS daily_prediction_tickets INT NOT NULL DEFAULT 3;

UPDATE public.levels SET daily_prediction_tickets = 3 WHERE id = 1;
UPDATE public.levels SET daily_prediction_tickets = 5 WHERE id = 2;
UPDATE public.levels SET daily_prediction_tickets = 7 WHERE id = 3;
UPDATE public.levels SET daily_prediction_tickets = 10 WHERE id = 4;

-- Create prediction tickets table
CREATE TABLE public.ktrenz_prediction_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_tickets INT NOT NULL DEFAULT 3,
  used_tickets INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ticket_date)
);

ALTER TABLE public.ktrenz_prediction_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets"
  ON public.ktrenz_prediction_tickets FOR SELECT
  USING (auth.uid() = user_id);

-- Function to get remaining tickets (auto-initializes for today)
CREATE OR REPLACE FUNCTION public.ktrenz_get_prediction_tickets(_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _level INT;
  _max_tickets INT;
  _record ktrenz_prediction_tickets%ROWTYPE;
BEGIN
  -- Get user level
  SELECT current_level INTO _level FROM profiles WHERE id = _user_id;
  IF _level IS NULL THEN _level := 1; END IF;

  -- Get ticket allowance for this level
  SELECT daily_prediction_tickets INTO _max_tickets FROM levels WHERE id = _level;
  IF _max_tickets IS NULL THEN _max_tickets := 3; END IF;

  -- Get or create today's record
  SELECT * INTO _record FROM ktrenz_prediction_tickets
    WHERE user_id = _user_id AND ticket_date = CURRENT_DATE;

  IF NOT FOUND THEN
    INSERT INTO ktrenz_prediction_tickets (user_id, ticket_date, total_tickets, used_tickets)
    VALUES (_user_id, CURRENT_DATE, _max_tickets, 0)
    RETURNING * INTO _record;
  END IF;

  RETURN json_build_object(
    'remaining', _record.total_tickets - _record.used_tickets,
    'total', _record.total_tickets,
    'used', _record.used_tickets
  );
END;
$$;

-- Function to consume one ticket (returns success/fail)
CREATE OR REPLACE FUNCTION public.ktrenz_use_prediction_ticket(_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _level INT;
  _max_tickets INT;
  _record ktrenz_prediction_tickets%ROWTYPE;
  _remaining INT;
BEGIN
  -- Get user level
  SELECT current_level INTO _level FROM profiles WHERE id = _user_id;
  IF _level IS NULL THEN _level := 1; END IF;

  SELECT daily_prediction_tickets INTO _max_tickets FROM levels WHERE id = _level;
  IF _max_tickets IS NULL THEN _max_tickets := 3; END IF;

  -- Get or create today's record
  SELECT * INTO _record FROM ktrenz_prediction_tickets
    WHERE user_id = _user_id AND ticket_date = CURRENT_DATE;

  IF NOT FOUND THEN
    INSERT INTO ktrenz_prediction_tickets (user_id, ticket_date, total_tickets, used_tickets)
    VALUES (_user_id, CURRENT_DATE, _max_tickets, 0)
    RETURNING * INTO _record;
  END IF;

  _remaining := _record.total_tickets - _record.used_tickets;

  IF _remaining <= 0 THEN
    RETURN json_build_object('success', false, 'remaining', 0, 'total', _record.total_tickets, 'reason', 'no_tickets');
  END IF;

  UPDATE ktrenz_prediction_tickets
    SET used_tickets = used_tickets + 1, updated_at = now()
    WHERE id = _record.id;

  RETURN json_build_object('success', true, 'remaining', _remaining - 1, 'total', _record.total_tickets);
END;
$$;
