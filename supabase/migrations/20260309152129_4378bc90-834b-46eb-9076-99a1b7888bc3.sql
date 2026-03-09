INSERT INTO ktrenz_schedules (artist_name, title, event_date, event_time, category, wiki_entry_id, source, source_url)
VALUES
-- TXT
('TOMORROW X TOGETHER', 'M COUNTDOWN Stage', '2026-03-13', '6:00 PM', 'broadcast', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
('TOMORROW X TOGETHER', 'Music Bank Stage', '2026-03-14', '5:00 PM', 'broadcast', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
('TOMORROW X TOGETHER', 'HAPPY BEOMGYU DAY!', '2026-03-13', NULL, 'celebration', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
('TOMORROW X TOGETHER', '<CHASING> Concept Photo', '2026-03-16', '11:00 AM', 'release', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
('TOMORROW X TOGETHER', '<CHASING> MV Teaser', '2026-03-20', NULL, 'release', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
('TOMORROW X TOGETHER', '<CHASING> Release', '2026-03-24', NULL, 'release', '773a2694-cb18-4046-ae3c-e98a4ccb3347', 'blip', 'https://blip.kr/en/schedule'),
-- Babymonster
('BABYMONSTER', 'Inkigayo Stage', '2026-03-09', '3:40 PM', 'broadcast', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule'),
('BABYMONSTER', 'M COUNTDOWN Stage', '2026-03-13', '6:00 PM', 'broadcast', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule'),
('BABYMONSTER', 'HAPPY AHYEON DAY!', '2026-03-10', NULL, 'celebration', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule'),
('BABYMONSTER', '<RUSH HOUR> Concept Film', '2026-03-15', NULL, 'release', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule'),
('BABYMONSTER', '<RUSH HOUR> MV Teaser', '2026-03-18', NULL, 'release', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule'),
('BABYMONSTER', '<RUSH HOUR> Release', '2026-03-22', NULL, 'release', '5eb9c33f-8d02-4f60-be60-9f15318ec01a', 'blip', 'https://blip.kr/en/schedule')
ON CONFLICT (artist_name, title, event_date) DO NOTHING;