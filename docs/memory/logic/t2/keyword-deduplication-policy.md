# Memory: logic/t2/keyword-deduplication-policy
Updated: now

트렌드 후처리 단계에서 동일 소스 URL 중복 제거와 더불어, GPT-4o-mini 기반의 의미적 유사도 클러스터링(Semantic Clustering)을 수행함. 동일 아티스트 내에서 같은 사건을 다루는 키워드를 하나로 통합하며, 동일 소스에서 그룹과 멤버 트렌드가 동시에 발생할 경우 멤버 우선(Member-first) 원칙에 따라 그룹 트렌드를 만료 처리함. **크로스 아티스트 동일 source_url 중복 제거 시 `source_title`에 아티스트명(한글/영문)이 포함되어 있는지 확인하여 실제 기사 주체에 해당하는 아티스트를 우선 유지함.** 클러스터링 시 신규 음반, 앨범, MV, 또는 서로 다른 브랜드 광고 등은 개별적인 이벤트로 취급하여 병합하지 않는 보수적인 규칙을 적용함. 파이프라인은 detect 직후 postprocess를 반드시 거치도록 구성됨.
