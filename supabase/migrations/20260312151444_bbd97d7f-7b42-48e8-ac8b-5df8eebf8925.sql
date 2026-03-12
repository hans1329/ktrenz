
-- Data quality issues table: stores anomalies detected by the auditor
CREATE TABLE public.ktrenz_data_quality_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_entry_id UUID NOT NULL,
  artist_name TEXT,
  issue_type TEXT NOT NULL, -- 'missing_source', 'zero_score', 'unit_mismatch', 'new_collection_spike', 'stale_data', 'value_anomaly'
  platform TEXT, -- which platform has the issue
  severity TEXT NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
  title TEXT NOT NULL,
  description TEXT,
  expected_value TEXT,
  actual_value TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_dq_issues_unresolved ON public.ktrenz_data_quality_issues (resolved, severity) WHERE NOT resolved;
CREATE INDEX idx_dq_issues_artist ON public.ktrenz_data_quality_issues (wiki_entry_id);
CREATE INDEX idx_dq_issues_type ON public.ktrenz_data_quality_issues (issue_type);

-- Unique constraint to avoid duplicate issues
CREATE UNIQUE INDEX idx_dq_issues_unique ON public.ktrenz_data_quality_issues (wiki_entry_id, issue_type, platform) WHERE NOT resolved;

-- RLS: admin-only
ALTER TABLE public.ktrenz_data_quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.ktrenz_data_quality_issues
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
