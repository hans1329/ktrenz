INSERT INTO public.ktrenz_point_settings (reward_type, reward_name, points, is_enabled, description)
VALUES ('welcome_bonus', '가입 축하 보너스', 1000, true, '신규 가입 시 지급되는 웰컴 캐쉬')
ON CONFLICT DO NOTHING;