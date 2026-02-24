
CREATE OR REPLACE FUNCTION public.v3_calculate_energy_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  velocity numeric;
  intensity numeric;
  new_energy numeric;
  prev_energy numeric;
  prev_velocity numeric;
  calculated_total numeric;
  old_total numeric;
  change_pct numeric;
BEGIN
  calculated_total := COALESCE(NEW.youtube_score, 0) + COALESCE(NEW.buzz_score, 0) + COALESCE(NEW.music_score, 0) + COALESCE(NEW.album_sales_score, 0);
  old_total := COALESCE(OLD.youtube_score, 0) + COALESCE(OLD.buzz_score, 0) + COALESCE(OLD.music_score, 0) + COALESCE(OLD.album_sales_score, 0);

  -- 직전 유효 velocity 조회 (fallback용)
  SELECT es.velocity_score INTO prev_velocity
  FROM v3_energy_snapshots es
  WHERE es.wiki_entry_id = NEW.wiki_entry_id
    AND es.velocity_score > 10
  ORDER BY es.snapshot_at DESC
  LIMIT 1;

  -- 1) Velocity
  IF TG_OP = 'UPDATE' AND old_total > 0 THEN
    change_pct := (calculated_total - old_total)::numeric / old_total * 100;
    velocity := ABS(change_pct) * 20;
    IF change_pct > 0 THEN
      velocity := velocity * 1.5;
    END IF;
    velocity := LEAST(velocity, 250);
  ELSE
    velocity := 50;
  END IF;

  velocity := COALESCE(velocity, 50);

  -- Velocity fallback: 순차 업데이트로 velocity < 10이면 직전 유효값의 85% 사용
  IF velocity < 10 AND prev_velocity IS NOT NULL AND prev_velocity > 10 THEN
    velocity := prev_velocity * 0.85;
  END IF;

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

  -- 4) 24h 변화
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

  -- 6) snapshot 기록
  INSERT INTO v3_energy_snapshots (wiki_entry_id, velocity_score, intensity_score, energy_score)
  VALUES (NEW.wiki_entry_id, ROUND(velocity), ROUND(intensity), new_energy)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
