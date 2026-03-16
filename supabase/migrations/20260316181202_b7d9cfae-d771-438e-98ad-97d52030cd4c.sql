
-- ═══════════════════════════════════════════════════════
-- Fix youtube_channel_id: API-verified corrections
-- ═══════════════════════════════════════════════════════

-- 1. API-verified correct channel IDs (from web search + forHandle API)
UPDATE v3_artist_tiers SET youtube_channel_id = CASE id
  -- (G)I-DLE: was @G_I_DLE → "yuqi's bestie" (287 subs). Real: UCritGVo7pLJLUS8wEu32vow (from youtube.com/channel/ URL)
  WHEN '27e7ea7c-2d84-4e5a-8035-ddf985fc527e' THEN 'UCritGVo7pLJLUS8wEu32vow'
  -- Babymonster: was @BABYMONSTER_ → "백종원". Real: @BABYMONSTER_OFFICIAL (API verified)
  WHEN 'd57eaee5-96a4-4f16-86de-956bf68c9957' THEN 'UCiDxRnIaFk90SEDVLqfPFJQ'
  -- EXO: was @EXO → fan channel (256 subs). Real: @weareoneEXO (API verified)
  WHEN 'd31741f3-86ec-452a-8409-7d05b930e77e' THEN 'UCzCedBCSSltI1TFd3bKyN6g'
  -- ENHYPEN: was @ENHYPEN-OFFICIAL → fan (2 subs). Real: UCArLZtok93cO5R9RI4_Y5Jw (from youtube.com/channel/ URL)
  WHEN '4d6357e3-7831-4c9b-a99d-787b516ee6dd' THEN 'UCArLZtok93cO5R9RI4_Y5Jw'
  -- LE SSERAFIM: was UC-clMkTZa7k → Topic channel. Real: UCs-QBT4qkj_YiQw1ZntDO3g (from youtube.com/channel/ URL)
  WHEN '3cabe5d9-f7f7-4052-be38-e7e2d75e26c5' THEN 'UCs-QBT4qkj_YiQw1ZntDO3g'
  -- TREASURE: was @TREASURE_official → fan (12 subs). Real: @TREASURE (API verified)
  WHEN '3e586752-e650-4602-a978-322058f09622' THEN 'UCx9hXYOCvUYwrprEqe4ZQHA'
  -- TWS: was @TWSofficial → fan (43 subs). Real: @TWS_PLEDIS (API verified)
  WHEN '8da24d3f-8622-4cf7-ad47-cb8323f13278' THEN 'UC8C6QOPDVYwmuaSBZksefdg'
  ELSE youtube_channel_id
END
WHERE id IN (
  '27e7ea7c-2d84-4e5a-8035-ddf985fc527e',
  'd57eaee5-96a4-4f16-86de-956bf68c9957',
  'd31741f3-86ec-452a-8409-7d05b930e77e',
  '4d6357e3-7831-4c9b-a99d-787b516ee6dd',
  '3cabe5d9-f7f7-4052-be38-e7e2d75e26c5',
  '3e586752-e650-4602-a978-322058f09622',
  '8da24d3f-8622-4cf7-ad47-cb8323f13278'
);

-- 2. NULL out wrong fan channels (no confirmed official channel found)
UPDATE v3_artist_tiers SET youtube_channel_id = NULL
WHERE id IN (
  '166ca010-2e10-4be4-a282-c2f47839d10b',  -- BTS Jungkook: @JungKook → "jvngkvok" (598 subs), solo MVs on HYBE LABELS
  '94ce1b6c-30a6-43a3-b3aa-0a035ac2cbe9',  -- GD: @GDRAGON → fan (46 subs), OfficialGDRAGON handle unresolvable
  '088db5d0-57a8-4637-8e54-8649bf9b8d06',  -- Lisa: @LALALISAOFFICIAL → fan (1 sub), content on BLACKPINK/LLOUD
  'cfbe972f-b1c9-408b-962a-d71b936d1cc2'   -- Zero Base One: @ZEROBASEONE → "히히" (3 subs)
);

-- 3. NULL out Topic/wrong channels stored as official channel
-- Move Topic IDs to youtube_topic_channel_id if that field is currently NULL
UPDATE v3_artist_tiers SET 
  youtube_topic_channel_id = CASE 
    WHEN youtube_topic_channel_id IS NULL THEN youtube_channel_id 
    ELSE youtube_topic_channel_id 
  END,
  youtube_channel_id = NULL
WHERE id IN (
  '25826ef1-9cc7-460e-958f-66825f879d8e',  -- CNBLUE: "CNBLUE - Topic"
  '97a3bcfe-0607-4e4a-807b-52f1148620d8',  -- DPR LIVE: "DPR LIVE - Topic"
  'af1ae758-8778-42c3-9ea4-08775a04c410',  -- Hwa Sa: "HWASA - Topic"
  '714d39f5-82be-4aac-9d82-6f544845e038',  -- Wanna One: "Wanna One - Topic"
  '23e48ef5-6e48-4503-a228-3acecd281ab3'   -- H.O.T: "Hot News Entertainment" (not Topic but not official either)
);
