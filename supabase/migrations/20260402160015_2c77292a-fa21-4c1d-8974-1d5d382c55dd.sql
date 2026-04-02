
-- Add name_ko and max_level columns
ALTER TABLE public.levels ADD COLUMN IF NOT EXISTS name_ko TEXT;
ALTER TABLE public.levels ADD COLUMN IF NOT EXISTS max_level INT;

-- Delete existing levels
DELETE FROM public.levels;

-- Insert new 4-tier structure
INSERT INTO public.levels (id, name, name_ko, required_points, max_level, icon, color, max_daily_votes, token_reward) VALUES
(1, 'Beginner',  '입문',   0,     5,    '🌱', '#10b981', 13, 10),
(2, 'Explorer',  '탐색가', 500,   15,   '🔍', '#3b82f6', 13, 15),
(3, 'Analyst',   '분석가', 3000,  30,   '📊', '#8b5cf6', 13, 25),
(4, 'Expert',    '전문가', 10000, NULL, '🏆', '#f59e0b', 13, 40);

-- Downgrade any users at level 5 to level 4
UPDATE public.profiles SET current_level = 4 WHERE current_level > 4;
