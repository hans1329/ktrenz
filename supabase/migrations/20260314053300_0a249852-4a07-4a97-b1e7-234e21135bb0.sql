
-- Guard 로그 테이블
CREATE TABLE ktrenz_guard_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  wiki_entry_id uuid REFERENCES wiki_entries(id) ON DELETE CASCADE,
  guard_rule text NOT NULL,
  action text NOT NULL CHECK (action IN ('warn', 'block')),
  current_value jsonb NOT NULL DEFAULT '{}',
  previous_value jsonb DEFAULT '{}',
  delta_pct numeric,
  resolved boolean NOT NULL DEFAULT false,
  engine_run_id text,
  snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guard_logs_module ON ktrenz_guard_logs(module);
CREATE INDEX idx_guard_logs_action ON ktrenz_guard_logs(action);
CREATE INDEX idx_guard_logs_created ON ktrenz_guard_logs(created_at DESC);
CREATE INDEX idx_guard_logs_unresolved ON ktrenz_guard_logs(resolved) WHERE resolved = false;
CREATE INDEX idx_guard_logs_wiki_entry ON ktrenz_guard_logs(wiki_entry_id);

ALTER TABLE ktrenz_data_snapshots ADD COLUMN IF NOT EXISTS guard_flagged boolean NOT NULL DEFAULT false;
ALTER TABLE ktrenz_data_snapshots ADD COLUMN IF NOT EXISTS guard_log_id uuid REFERENCES ktrenz_guard_logs(id);

ALTER TABLE ktrenz_guard_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on guard_logs"
  ON ktrenz_guard_logs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated read guard_logs"
  ON ktrenz_guard_logs FOR SELECT
  TO authenticated
  USING (true);
