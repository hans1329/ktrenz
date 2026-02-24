
-- v3_scores 업데이트 시 energy_score 자동 계산 트리거
CREATE OR REPLACE FUNCTION public.v3_calculate_energy_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prev_total numeric;
  velocity numeric;
  intensity numeric;
  new_energy numeric;
  prev_energy numeric;
BEGIN
  -- 1) Velocity: 이전 스냅샷 대비 점수 변화율
  SELECT total_score INTO prev_total
  FROM v3_scores
  WHERE wiki_entry_id = NEW.wiki_entry_id
    AND id != NEW.id
  ORDER BY scored_at DESC
  LIMIT 1;

  IF prev_total IS NOT NULL AND prev_total > 0 THEN
    -- 변화율 기반 velocity (변화량의 절대값 + 방향 보너스)
    velocity := ABS(NEW.total_score - prev_total) / prev_total * 100;
    -- 상승 시 보너스
    IF NEW.total_score > prev_total THEN
      velocity := velocity * 1.5;
    END IF;
  ELSE
    velocity := 50; -- 첫 데이터는 기본값
  END IF;

  -- 2) Intensity: 다양한 소스의 활성도
  intensity := 0;
  -- YouTube 활성도
  IF COALESCE(NEW.youtube_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.youtube_score / 3, 80);
  END IF;
  -- Buzz 활성도 (소셜 반응)
  IF COALESCE(NEW.buzz_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.buzz_score / 10, 80);
  END IF;
  -- Music 활성도
  IF COALESCE(NEW.music_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.music_score / 2, 40);
  END IF;
  -- Album 활성도
  IF COALESCE(NEW.album_sales_score, 0) > 0 THEN
    intensity := intensity + LEAST(NEW.album_sales_score / 2, 50);
  END IF;

  -- 3) Energy = Velocity + Intensity (0~500 범위)
  new_energy := LEAST(ROUND(velocity + intensity), 500);

  -- 4) 24h 변화 계산
  prev_energy := COALESCE(OLD.energy_score, 0);

  -- 5) 값 설정
  NEW.energy_score := new_energy;
  NEW.energy_change_24h := CASE 
    WHEN prev_energy > 0 THEN ROUND((new_energy - prev_energy) / prev_energy * 100, 1)
    ELSE 0
  END;

  -- 6) energy_snapshots에도 기록
  INSERT INTO v3_energy_snapshots (wiki_entry_id, velocity_score, intensity_score, energy_score)
  VALUES (NEW.wiki_entry_id, ROUND(velocity), ROUND(intensity), new_energy)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 트리거 생성: v3_scores UPDATE 시 자동 실행
DROP TRIGGER IF EXISTS trg_v3_calc_energy ON v3_scores;
CREATE TRIGGER trg_v3_calc_energy
  BEFORE UPDATE ON v3_scores
  FOR EACH ROW
  WHEN (
    OLD.youtube_score IS DISTINCT FROM NEW.youtube_score OR
    OLD.buzz_score IS DISTINCT FROM NEW.buzz_score OR
    OLD.music_score IS DISTINCT FROM NEW.music_score OR
    OLD.album_sales_score IS DISTINCT FROM NEW.album_sales_score
  )
  EXECUTE FUNCTION public.v3_calculate_energy_score();
