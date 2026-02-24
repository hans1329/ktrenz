
-- ============================================
-- KTRENZ Data Engine: 정규화된 데이터 수집 구조
-- ============================================

-- 1. 플랫폼별 원시 데이터 스냅샷 (시계열)
CREATE TABLE public.ktrenz_data_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'youtube', 'spotify', 'x', 'tiktok', 'melon', etc.
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}', -- 플랫폼별 수치 (구독자, 조회수, 스트리밍수 등)
  raw_response JSONB -- 원본 API 응답 (디버그용)
);

-- 인덱스: 아티스트+플랫폼별 시계열 조회 최적화
CREATE INDEX idx_ktrenz_data_snapshots_lookup 
  ON public.ktrenz_data_snapshots (wiki_entry_id, platform, collected_at DESC);

CREATE INDEX idx_ktrenz_data_snapshots_platform_time
  ON public.ktrenz_data_snapshots (platform, collected_at DESC);

-- RLS
ALTER TABLE public.ktrenz_data_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Data snapshots are readable by everyone"
  ON public.ktrenz_data_snapshots FOR SELECT USING (true);

-- 2. 스트리밍 가이드 결과 캐시 (관심 아티스트별)
CREATE TABLE public.ktrenz_streaming_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wiki_entry_id UUID NOT NULL REFERENCES public.wiki_entries(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  guide_data JSONB NOT NULL DEFAULT '{}',
  -- guide_data 구조 예시:
  -- {
  --   "current_rank": 5,
  --   "target_rank": 3,
  --   "platform_focus": [{"platform": "youtube", "priority": "high", "reason": "..."}],
  --   "timing_recommendations": [...],
  --   "gap_analysis": {"views_needed": 50000, "streams_needed": 10000},
  --   "momentum": "rising" | "stable" | "declining",
  --   "action_items": ["...", "..."]
  -- }
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '6 hours')
);

CREATE INDEX idx_ktrenz_streaming_guides_user
  ON public.ktrenz_streaming_guides (user_id, wiki_entry_id, generated_at DESC);

ALTER TABLE public.ktrenz_streaming_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own guides"
  ON public.ktrenz_streaming_guides FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own guides"
  ON public.ktrenz_streaming_guides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own guides"
  ON public.ktrenz_streaming_guides FOR DELETE USING (auth.uid() = user_id);

-- 3. 데이터 수집 작업 로그
CREATE TABLE public.ktrenz_collection_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  wiki_entry_id UUID REFERENCES public.wiki_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'error', 'partial'
  error_message TEXT,
  records_collected INTEGER DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ktrenz_collection_log_time
  ON public.ktrenz_collection_log (collected_at DESC);

ALTER TABLE public.ktrenz_collection_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collection logs are readable by everyone"
  ON public.ktrenz_collection_log FOR SELECT USING (true);
