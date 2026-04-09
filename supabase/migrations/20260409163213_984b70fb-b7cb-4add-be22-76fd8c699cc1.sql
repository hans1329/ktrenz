
-- Create battle predictions table
CREATE TABLE public.b2_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  picked_run_id UUID NOT NULL,
  opponent_run_id UUID NOT NULL,
  band TEXT NOT NULL CHECK (band IN ('steady', 'rising', 'surge')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'won', 'lost')),
  reward_amount NUMERIC DEFAULT 0,
  battle_date DATE NOT NULL DEFAULT CURRENT_DATE,
  settled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_b2_predictions_user_id ON public.b2_predictions (user_id);
CREATE INDEX idx_b2_predictions_status ON public.b2_predictions (status);
CREATE INDEX idx_b2_predictions_created_at ON public.b2_predictions (created_at DESC);

-- Prevent duplicate predictions per battle pair per day
CREATE UNIQUE INDEX idx_b2_predictions_unique_daily ON public.b2_predictions (
  user_id, picked_run_id, opponent_run_id, battle_date
);

-- Enable RLS
ALTER TABLE public.b2_predictions ENABLE ROW LEVEL SECURITY;

-- Users can view their own predictions
CREATE POLICY "Users can view own predictions"
ON public.b2_predictions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own predictions
CREATE POLICY "Users can create own predictions"
ON public.b2_predictions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
