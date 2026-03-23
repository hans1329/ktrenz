# Memory: features/t2/social-media-integration
Updated: now

## TikTok 수집 구현 완료
- Edge Function: `collect-tiktok-trends` — RapidAPI `tiktok-api23`의 `/api/search/general` 엔드포인트 사용
- 수집 데이터: 아티스트명 키워드 검색 → 영상별 조회수/좋아요/댓글/공유 + 상위 5개 콘텐츠 상세
- 저장 테이블: `ktrenz_social_snapshots` (star_id, wiki_entry_id, platform, keyword, metrics, top_posts)
- 점수 반영: `v3_scores_v2.social_score`에 TikTok activity score를 기존 팔로워 점수에 합산
- 파이프라인 통합: `data-engine`의 PIPELINE 배열에 `tiktok` 스텝 추가 (social 바로 뒤)
- API 키: `RAPIDAPI_KEY` (시크릿에 등록 완료)
- Rate limit: 아티스트 간 500ms 딜레이

## 인스타그램 (미구현)
RapidAPI에서 해시태그 게시물 수를 안정적으로 제공하는 API를 찾지 못함. 향후 Apify 등 대안 서비스로 추가 예정.

## UI
트리맵에 Social 카테고리(파란색 버튼)가 이미 존재하며, socialScore/socialChange24h 데이터가 자동 반영됨.
