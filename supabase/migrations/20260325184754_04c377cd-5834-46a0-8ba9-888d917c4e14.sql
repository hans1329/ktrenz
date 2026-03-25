-- ktrenz_data_snapshots에 star_id 컬럼 추가
ALTER TABLE ktrenz_data_snapshots
ADD COLUMN IF NOT EXISTS star_id uuid REFERENCES ktrenz_stars(id);

-- star_id 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_data_snapshots_star_platform_time
ON ktrenz_data_snapshots (star_id, platform, collected_at DESC);