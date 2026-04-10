-- ktrenz_stars에 검색 수식어 컬럼 추가
ALTER TABLE public.ktrenz_stars
ADD COLUMN search_qualifier TEXT DEFAULT '가수';

-- 기존 활성 스타 중 star_category 기반 기본값 설정
UPDATE public.ktrenz_stars SET search_qualifier = '가수' WHERE star_category = 'kpop';
