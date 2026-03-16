
-- Fix critical cross-matching errors (verified from kprofiles.com)
UPDATE v3_artist_tiers SET youtube_channel_id = CASE id
  -- 🚨 Critical: wrong artist mapped
  WHEN '5e830b2a-8043-4fe3-bce9-5d305db10dba' THEN 'UC-Fnix71vRP64WXeo0ikd0Q'   -- Ive: was @LE_SSERAFIM → correct kprofiles channel ID
  WHEN '4de189b9-ec1c-486e-8ef4-8d3dd9056156' THEN '@inayommi'                    -- Nayeon: was @Kep1er_official → correct personal channel
  WHEN 'bda77b10-4659-46f2-80db-7f07096ee0a6' THEN NULL                           -- Loco: was @IVE → null (no confirmed channel)
  WHEN 'dd98a7f9-8433-444b-97e3-d42d1895ca37' THEN NULL                           -- Lovelyz: was @NCT127 → null (disbanded, old /user/ format)
  WHEN '99e9ac94-93df-44ae-bf84-2593fa18b5d4' THEN NULL                           -- NCT: was @MAMAMOO_official → null (no confirmed handle)
  WHEN '7ab4cc66-6135-4439-8a50-c6f7ce0ff580' THEN NULL                           -- NCT 127: was @NCTDREAM → null (no confirmed handle)

  -- ✅ Verified handles from kprofiles
  WHEN 'f7eff844-2a2d-49d2-9d7d-bd2b9828d98c' THEN '@KISSOFLIFE_official'         -- KISS OF LIFE
  WHEN 'c9fa0fa6-cd3e-4128-b9d0-e80ac218254b' THEN '@iKON'                        -- iKON
  WHEN 'ce08dd9f-33d2-4f47-98e7-1b50f90da068' THEN '@OFFICIALHIGHLIGHT'           -- Highlight
  WHEN 'c825661c-d18d-40fb-a879-5bd787f1b72d' THEN '@xg_official'                 -- XG

  ELSE youtube_channel_id
END
WHERE id IN (
  '5e830b2a-8043-4fe3-bce9-5d305db10dba',
  '4de189b9-ec1c-486e-8ef4-8d3dd9056156',
  'bda77b10-4659-46f2-80db-7f07096ee0a6',
  'dd98a7f9-8433-444b-97e3-d42d1895ca37',
  '99e9ac94-93df-44ae-bf84-2593fa18b5d4',
  '7ab4cc66-6135-4439-8a50-c6f7ce0ff580',
  'f7eff844-2a2d-49d2-9d7d-bd2b9828d98c',
  'c9fa0fa6-cd3e-4128-b9d0-e80ac218254b',
  'ce08dd9f-33d2-4f47-98e7-1b50f90da068',
  'c825661c-d18d-40fb-a879-5bd787f1b72d'
);
