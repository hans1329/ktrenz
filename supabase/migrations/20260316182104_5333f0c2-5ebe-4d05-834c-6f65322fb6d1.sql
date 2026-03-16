
-- Fix GD: restore official YouTube channel ID (@xxxibgdrgn → UCeU5qTuBiqTU5z-hyL6WITQ)
UPDATE v3_artist_tiers 
SET youtube_channel_id = 'UCeU5qTuBiqTU5z-hyL6WITQ'
WHERE id = '94ce1b6c-30a6-43a3-b3aa-0a035ac2cbe9';
