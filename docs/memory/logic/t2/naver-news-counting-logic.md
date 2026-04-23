# Memory: logic/t2/naver-news-counting-logic
Updated: now

가점수(Prescore) 산출을 위한 네이버 뉴스 카운트는 **최근 48시간 이내 기사만** 대상으로 함. pubDate 기준으로 48시간 이내인 기사만 카운팅하며, 날짜순(sort=date) 정렬 후 48시간 이전 기사가 나오면 즉시 탐색을 중단함. API의 start 파라미터 제한(최대 1000)이 있으나, 48시간 윈도우에서는 대부분의 아티스트가 이 한도에 도달하지 않음. 검색 쿼리는 한글명과 영문명을 파이프(|) 연산자로 결합하며, 그룹형 스타는 search_qualifier를 포함함. 429 API 제한 방지를 위해 배치 처리(Batch Size 3) 및 재시도 로직이 적용됨.
