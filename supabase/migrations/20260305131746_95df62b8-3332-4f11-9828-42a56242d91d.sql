
-- Structured knowledge cache for Perplexity responses
CREATE TABLE public.ktrenz_agent_knowledge_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  topic_type TEXT NOT NULL DEFAULT 'general',  -- 'news', 'activity', 'streaming', 'schedule', 'general'
  query_hash TEXT NOT NULL,                     -- MD5 of normalized query for dedup
  query_text TEXT NOT NULL,                     -- original query string
  content_structured JSONB NOT NULL DEFAULT '{}',  -- structured extracted data
  content_raw TEXT,                             -- raw Perplexity response text
  citations TEXT[] DEFAULT '{}',               -- source URLs
  recency_filter TEXT DEFAULT 'week',          -- Perplexity recency used
  hit_count INT NOT NULL DEFAULT 1,            -- how many times this cache was used
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_knowledge_cache_wiki_topic ON public.ktrenz_agent_knowledge_cache(wiki_entry_id, topic_type);
CREATE INDEX idx_knowledge_cache_hash ON public.ktrenz_agent_knowledge_cache(query_hash);
CREATE INDEX idx_knowledge_cache_expires ON public.ktrenz_agent_knowledge_cache(expires_at);

-- Unique constraint: same query_hash + topic_type = one cache entry
CREATE UNIQUE INDEX idx_knowledge_cache_unique ON public.ktrenz_agent_knowledge_cache(query_hash, topic_type);

-- RLS: only service role can read/write (edge function uses adminClient)
ALTER TABLE public.ktrenz_agent_knowledge_cache ENABLE ROW LEVEL SECURITY;

-- Cleanup function for expired entries (called periodically)
CREATE OR REPLACE FUNCTION ktrenz_cleanup_knowledge_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM ktrenz_agent_knowledge_cache WHERE expires_at < now();
$$;
