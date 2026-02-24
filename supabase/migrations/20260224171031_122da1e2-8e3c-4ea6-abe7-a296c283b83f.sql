UPDATE public.wiki_entries 
SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{youtube_channel_id}', '"UCTcEu0jaf3DrsTjnGwwvsvA"') 
WHERE id = 'c47c4daa-f3c4-4c66-a410-9d7399d91cbf';