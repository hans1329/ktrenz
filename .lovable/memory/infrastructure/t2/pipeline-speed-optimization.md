# Memory: infrastructure/t2/pipeline-speed-optimization
Updated: now

K2 파이프라인의 수집 속도와 퀴즈 주기(24시간) 정산 효율을 높이기 위해 'Smart Skip' 로직을 detect 단계에 적용 완료함. 최근 18시간 내에 키워드 감지 결과(`last_detect_result.status === 'found'`)가 있는 스타는 수집 대상에서 제외하여 전체 처리 대상을 압축함(예: 605명 → 514명). 감지 실패(에러, 타임아웃, no_keywords, no_sources)한 스타는 스킵하지 않고 다음 주기에서 즉시 재시도함. 응답에 `smartSkipped`, `totalRaw` 필드를 포함하여 스킵 현황을 모니터링 가능하게 함.
