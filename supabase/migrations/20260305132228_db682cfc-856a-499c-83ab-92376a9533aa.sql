
-- Intent tracking table: stores structured user intents extracted from agent conversations
CREATE TABLE public.ktrenz_agent_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wiki_entry_id uuid REFERENCES public.wiki_entries(id) ON DELETE SET NULL,
  intent_category text NOT NULL DEFAULT 'general',
  sub_topic text,
  entities jsonb DEFAULT '{}',
  sentiment text DEFAULT 'neutral',
  source_query text NOT NULL,
  tools_used text[] DEFAULT '{}',
  agent_slot_id uuid REFERENCES public.ktrenz_agent_slots(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast aggregation (agency dashboard queries)
CREATE INDEX idx_ktrenz_intents_wiki_entry ON public.ktrenz_agent_intents(wiki_entry_id, created_at DESC);
CREATE INDEX idx_ktrenz_intents_category ON public.ktrenz_agent_intents(intent_category, created_at DESC);
CREATE INDEX idx_ktrenz_intents_user ON public.ktrenz_agent_intents(user_id, created_at DESC);

-- Daily aggregated intent summaries per artist (materialized by trigger)
CREATE TABLE public.ktrenz_agent_intent_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id uuid NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  intent_category text NOT NULL,
  summary_date date NOT NULL DEFAULT CURRENT_DATE,
  query_count integer DEFAULT 0,
  unique_users integer DEFAULT 0,
  sample_queries jsonb DEFAULT '[]',
  sentiment_distribution jsonb DEFAULT '{"positive":0,"neutral":0,"negative":0,"curious":0}',
  trending_score numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(wiki_entry_id, intent_category, summary_date)
);

CREATE INDEX idx_ktrenz_intent_summaries_date ON public.ktrenz_agent_intent_summaries(summary_date DESC);
CREATE INDEX idx_ktrenz_intent_summaries_wiki ON public.ktrenz_agent_intent_summaries(wiki_entry_id, summary_date DESC);

-- Trigger function: auto-aggregate intents into summaries
CREATE OR REPLACE FUNCTION public.ktrenz_aggregate_intent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.wiki_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ktrenz_agent_intent_summaries (wiki_entry_id, intent_category, summary_date, query_count, unique_users, sample_queries, sentiment_distribution)
  VALUES (
    NEW.wiki_entry_id,
    NEW.intent_category,
    CURRENT_DATE,
    1,
    1,
    jsonb_build_array(left(NEW.source_query, 100)),
    jsonb_build_object(COALESCE(NEW.sentiment, 'neutral'), 1)
  )
  ON CONFLICT (wiki_entry_id, intent_category, summary_date)
  DO UPDATE SET
    query_count = ktrenz_agent_intent_summaries.query_count + 1,
    unique_users = (
      SELECT COUNT(DISTINCT user_id) 
      FROM ktrenz_agent_intents 
      WHERE wiki_entry_id = NEW.wiki_entry_id 
        AND intent_category = NEW.intent_category 
        AND created_at::date = CURRENT_DATE
    ),
    sample_queries = CASE 
      WHEN jsonb_array_length(ktrenz_agent_intent_summaries.sample_queries) < 10 
      THEN ktrenz_agent_intent_summaries.sample_queries || jsonb_build_array(left(NEW.source_query, 100))
      ELSE ktrenz_agent_intent_summaries.sample_queries
    END,
    sentiment_distribution = jsonb_set(
      ktrenz_agent_intent_summaries.sentiment_distribution,
      ARRAY[COALESCE(NEW.sentiment, 'neutral')],
      to_jsonb(COALESCE((ktrenz_agent_intent_summaries.sentiment_distribution->>COALESCE(NEW.sentiment, 'neutral'))::int, 0) + 1)
    ),
    trending_score = ktrenz_agent_intent_summaries.query_count + 1 + 
      (SELECT COUNT(DISTINCT user_id) FROM ktrenz_agent_intents WHERE wiki_entry_id = NEW.wiki_entry_id AND intent_category = NEW.intent_category AND created_at::date = CURRENT_DATE) * 2,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ktrenz_aggregate_intent
  AFTER INSERT ON public.ktrenz_agent_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.ktrenz_aggregate_intent();

-- RLS
ALTER TABLE public.ktrenz_agent_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktrenz_agent_intent_summaries ENABLE ROW LEVEL SECURITY;

-- Intents: users can read their own, service role writes
CREATE POLICY "Users can read own intents" ON public.ktrenz_agent_intents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Summaries: readable by authenticated (for future agency dashboards)
CREATE POLICY "Authenticated can read intent summaries" ON public.ktrenz_agent_intent_summaries
  FOR SELECT TO authenticated USING (true);
