
-- Fix v3_calculate_energy_score to use OLD values on UPDATE instead of querying by id
CREATE OR REPLACE FUNCTION v3_calculate_energy_score()
RETURNS TRIGGER AS $$
DECLARE
  velocity numeric;
  intensity numeric;
  new_energy numeric;
  prev_energy numeric;
BEGIN
  -- 1) Velocity: UPDATE시 OLD.total_score 사용, INSERT시 50 기본값
  IF TG_OP = 'UPDATE' AND OLD.total_score IS NOT NULL AND OLD.total_score > 0 THEN
    velocity := ABS(NEW.total_score - OLD.total_score) / OLD.total_score * 100;
    IF NEW.total_score > OLD.total_score THEN
      velocity := velocity * 1.5;
    END IF;
  ELSE
    velocity := 50;
  END IF;

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

  -- 3) Energy = velocity + intensity, 최대 500
  new_energy := LEAST(ROUND(velocity + intensity), 500);

  -- 4) 24h 변화: 약 24시간 전 스냅샷과 비교
  SELECT energy_score INTO prev_energy
  FROM v3_energy_snapshots
  WHERE wiki_entry_id = NEW.wiki_entry_id
    AND snapshot_at <= NOW() - INTERVAL '20 hours'
  ORDER BY snapshot_at DESC
  LIMIT 1;

  -- 5) 값 설정
  NEW.energy_score := new_energy;
  NEW.energy_change_24h := CASE 
    WHEN prev_energy IS NOT NULL AND prev_energy > 0 THEN ROUND((new_energy - prev_energy)::numeric / prev_energy * 100, 1)
    ELSE 0
  END;

  -- 6) energy_snapshots 기록
  INSERT INTO v3_energy_snapshots (wiki_entry_id, velocity_score, intensity_score, energy_score)
  VALUES (NEW.wiki_entry_id, ROUND(velocity), ROUND(intensity), new_energy)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
