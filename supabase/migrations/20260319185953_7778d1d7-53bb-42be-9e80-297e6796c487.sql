-- Fix misclassified song/album keywords from 'product' to 'media'
-- Keep MacBook, iPhone, Logic Pro as 'product' (they are actual products)
UPDATE ktrenz_trend_triggers 
SET keyword_category = 'media' 
WHERE keyword_category = 'product' 
AND id NOT IN (
  '958d282f-c1d0-4058-88e2-b2d4263fc65f',
  '920bb17e-8318-4210-bbaa-275e8d7c4312',
  '3a9d2bae-599a-4408-aef0-d4b7ef176632'
);