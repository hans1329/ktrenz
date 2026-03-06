
-- 1. Perplexity 검색 결과 누적 아카이브 테이블
CREATE TABLE public.ktrenz_agent_knowledge_archive (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  topic_type TEXT NOT NULL DEFAULT 'general',
  wiki_entry_id UUID REFERENCES public.wiki_entries(id) ON DELETE SET NULL,
  content_raw TEXT,
  content_structured JSONB DEFAULT '{}'::jsonb,
  citations TEXT[] DEFAULT '{}',
  recency_filter TEXT DEFAULT 'week',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: 아티스트별, 토픽별, 시간순 조회용
CREATE INDEX idx_knowledge_archive_wiki ON public.ktrenz_agent_knowledge_archive(wiki_entry_id, topic_type, fetched_at DESC);
CREATE INDEX idx_knowledge_archive_hash ON public.ktrenz_agent_knowledge_archive(query_hash, topic_type, fetched_at DESC);

-- RLS 활성화 (서비스 롤 전용)
ALTER TABLE public.ktrenz_agent_knowledge_archive ENABLE ROW LEVEL SECURITY;

-- 2. 인텐트 테이블에 knowledge_archive_ids 컬럼 추가
ALTER TABLE public.ktrenz_agent_intents
  ADD COLUMN knowledge_archive_ids UUID[] DEFAULT '{}';
