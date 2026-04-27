# Memory: logic/t2/detection-bottleneck-analysis
Updated: now

수집율 저하 원인이었던 'no_keywords'(72%) 해결을 위해 다단계 최적화 수행:
1. AI 추출 한도 확대 (7→15)
2. AI 프롬프트에서 "quality over quantity" 등 제한적 지시 제거
3. **ownership_confidence 필터 완전 제거**: detect 단계에서 차단하지 않고 값을 metadata에 저장만 함. 후처리(postprocess) 또는 등급(grade) 단계에서 활용하도록 위임.
   - 기존: commercial 카테고리 0.2, 일반 0.3 미만 차단 (2곳에서 중복 필터링)
   - 변경: 필터링 없이 통과, metadata.ownership_confidence / ownership_artist / ownership_reason 저장
4. 하이프로필 아티스트 타임아웃(7%) 문제는 향후 최적화 과제로 유지.
