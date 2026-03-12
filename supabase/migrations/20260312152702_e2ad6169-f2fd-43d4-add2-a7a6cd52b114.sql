-- Fix BTS Deezer ID: wrong artist (indie band 67158302) → correct BTS (6982223)
UPDATE public.v3_artist_tiers 
SET deezer_artist_id = '6982223'
WHERE wiki_entry_id = '7ed1a3cc-2fd7-42dc-9bba-2c2f1d89f5be'
AND deezer_artist_id = '67158302';
