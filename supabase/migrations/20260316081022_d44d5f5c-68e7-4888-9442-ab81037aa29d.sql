
-- Fix confirmed wrong channel IDs (3 artists with verified correct IDs)
UPDATE v3_artist_tiers SET youtube_channel_id = 'UC3SyT4_WLHzN7JmHQwKQZww' WHERE id = '482194d3-a350-45af-a725-311cc74b797c'; -- IU (10.2M subs)
UPDATE v3_artist_tiers SET youtube_channel_id = 'UCZqY2yIsAM9wh3vvMwKd27g' WHERE id = 'dabbc07d-ea58-4044-aa56-9de3442ef7bd'; -- ASTRO (5.52M subs)
UPDATE v3_artist_tiers SET youtube_channel_id = 'UCyPwRgc3gQGqhk6RoGS50Ug' WHERE id = 'f66a06a9-e1f9-4740-b696-054747e40617'; -- SHINee (2.61M subs)

-- Clear wrong channel IDs for remaining 6 (to be re-filled by fill-youtube-channels)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = '19915f69-1203-41cc-b075-965cd8abae1b'; -- EXID (was 2 subs)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = '45e8c176-c8f6-444d-b640-d5d85b798631'; -- OH MY GIRL (was 3 subs)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = 'cde60327-9dfe-4bda-9e2d-3d5ac152fd84'; -- CLC (was 27 subs)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = '94ce1b6c-30a6-43a3-b3aa-0a035ac2cbe9'; -- GD (was 46 subs)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = 'bda77b10-4659-46f2-80db-7f07096ee0a6'; -- Loco (was 79 subs)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL WHERE id = '8bf26192-74fa-4962-b73c-f94f399cfd3a'; -- P1Harmony (was 218 subs)

-- Fix duplicate topic channel IDs (clear topic where it equals official channel)
UPDATE v3_artist_tiers SET youtube_topic_channel_id = NULL 
WHERE tier = 1 AND youtube_channel_id = youtube_topic_channel_id AND youtube_channel_id IS NOT NULL;
