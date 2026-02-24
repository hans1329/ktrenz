-- 1) 트리거 비활성화 (데이터 정리 중 충돌 방지)
DROP TRIGGER IF EXISTS trg_v3_calc_energy ON v3_scores;

-- 2) 트리거 함수 수정: INSERT 시 prev_total이 없으면 velocity를 안전하게 처리
CREATE OR REPLACE FUNCTION v3_calculate_energy_score()
RETURNS TRIGGER AS $$
DECLARE
  prev_total numeric;
  velocity numeric;
  intensity numeric;
  new_energy numeric;
  prev_energy numeric;
BEGIN
  -- 1) Velocity
  SELECT total_score INTO prev_total
  FROM v3_scores
  WHERE wiki_entry_id = NEW.wiki_entry_id
    AND id != NEW.id
  ORDER BY scored_at DESC
  LIMIT 1;

  IF prev_total IS NOT NULL AND prev_total > 0 THEN
    velocity := ABS(NEW.total_score - prev_total) / prev_total * 100;
    IF NEW.total_score > prev_total THEN
      velocity := velocity * 1.5;
    END IF;
  ELSE
    velocity := 50;
  END IF;

  -- velocity를 항상 유효한 값으로 보장
  velocity := COALESCE(velocity, 50);

  -- 2) Intensity
  intensity := 0;
  IF COALESCE(NEW.youtube_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.youtube_score / 3, 80);
  END IF;
  IF COALESCE(NEW.buzz_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.buzz_score / 10, 80);
  END IF;
  IF COALESCE(NEW.music_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.music_score / 2, 40);
  END IF;
  IF COALESCE(NEW.album_sales_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.album_sales_score / 2, 50);
  END IF;

  intensity := COALESCE(intensity, 0);

  -- 3) Energy
  new_energy := LEAST(ROUND(velocity + intensity), 500);

  -- 4) 24h 변화
  prev_energy := COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.energy_score ELSE 0 END, 0);

  -- 5) 값 설정
  NEW.energy_score := new_energy;
  NEW.energy_change_24h := CASE 
    WHEN prev_energy > 0 THEN ROUND((new_energy - prev_energy) / prev_energy * 100, 1)
    ELSE 0
  END;

  -- 6) energy_snapshots 기록
  INSERT INTO v3_energy_snapshots (wiki_entry_id, velocity_score, intensity_score, energy_score)
  VALUES (NEW.wiki_entry_id, ROUND(velocity), ROUND(intensity), new_energy)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) 중복 행 병합: 각 아티스트의 최신 행에 가장 높은 값 복사
WITH best_values AS (
  SELECT 
    wiki_entry_id,
    MAX(youtube_score) AS best_youtube,
    MAX(buzz_score) AS best_buzz,
    MAX(music_score) AS best_music,
    MAX(album_sales_score) AS best_album
  FROM v3_scores
  GROUP BY wiki_entry_id
),
latest AS (
  SELECT DISTINCT ON (wiki_entry_id) id, wiki_entry_id
  FROM v3_scores
  ORDER BY wiki_entry_id, scored_at DESC
)
UPDATE v3_scores s
SET 
  youtube_score = GREATEST(COALESCE(s.youtube_score, 0), COALESCE(bv.best_youtube, 0)),
  buzz_score = GREATEST(COALESCE(s.buzz_score, 0), COALESCE(bv.best_buzz, 0)),
  music_score = GREATEST(COALESCE(s.music_score, 0), COALESCE(bv.best_music, 0)),
  album_sales_score = GREATEST(COALESCE(s.album_sales_score, 0), COALESCE(bv.best_album, 0))
FROM latest l
JOIN best_values bv ON bv.wiki_entry_id = l.wiki_entry_id
WHERE s.id = l.id;

-- 4) 중복 행 삭제
DELETE FROM v3_scores
WHERE id NOT IN (
  SELECT DISTINCT ON (wiki_entry_id) id
  FROM v3_scores
  ORDER BY wiki_entry_id, scored_at DESC
);

-- 5) unique constraint
ALTER TABLE v3_scores ADD CONSTRAINT v3_scores_wiki_entry_id_unique UNIQUE (wiki_entry_id);

-- 6) 트리거 재생성 (INSERT + UPDATE 모두)
CREATE TRIGGER trg_v3_calc_energy
  BEFORE INSERT OR UPDATE ON v3_scores
  FOR EACH ROW
  EXECUTE FUNCTION v3_calculate_energy_score();