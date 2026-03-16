-- Fix Babymonster: replace fan channel (5 subs) with official channel (@BABYMONSTER_ → UCeRAB_0RrEOJ1AVkasdEeXg)
UPDATE v3_artist_tiers 
SET youtube_channel_id = 'UCeRAB_0RrEOJ1AVkasdEeXg'
WHERE id = 'd57eaee5-96a4-4f16-86de-956bf68c9957';
