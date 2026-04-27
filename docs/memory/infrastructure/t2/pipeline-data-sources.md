# Memory: infrastructure/t2/pipeline-data-sources
Updated: now

K2 트렌드 수집 파이프라인은 감지(Detection)와 추적(Tracking) 단계로 구분됨. **감지는 네이버(뉴스/블로그) 1소스만 사용**하며, YouTube/Instagram/TikTok은 감지 단계에서 제외됨. 추적 단계에서는 5개 소스에 가중치를 부여하여 통합 점수를 산출함: 네이버 뉴스/블로그(25%), 유튜브(25%), 틱톡(20%), 인스타그램(15%), 네이버 데이터랩(15%). 파이프라인 순서: `detect → track` (collect_social, detect_youtube 단계 제거됨).
