UPDATE public.ktrenz_stars
SET social_handles = jsonb_set(
  jsonb_set(
    social_handles::jsonb,
    '{instagram}',
    '"aespa_official"'
  ),
  '{instagram_checked_at}',
  to_jsonb(now()::text)
)
WHERE id = '343998ab-826b-4e17-b0a4-69d0f7798ec2';