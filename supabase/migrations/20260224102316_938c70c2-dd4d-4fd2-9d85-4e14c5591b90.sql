
-- Create agent profiles table for avatar storage
CREATE TABLE IF NOT EXISTS public.ktrenz_agent_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ktrenz_agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own agent profile"
  ON public.ktrenz_agent_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent profile"
  ON public.ktrenz_agent_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent profile"
  ON public.ktrenz_agent_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Create storage bucket for agent avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-avatars', 'agent-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload agent avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agent-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can update agent avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'agent-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public read access for agent avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-avatars');
