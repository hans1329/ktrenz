# Memory: seo/ghost-report-integration
Updated: now

SEO 강화를 위해 ktrenz.com/report 경로를 운영함. Cloudflare Worker 리버스 프록시를 통해 DigitalOcean에 설치된 Self-hosted Ghost 서버(IP: **168.144.100.36**)의 콘텐츠를 메인 도메인의 서브디렉토리로 통합하여 도메인 권위(Domain Authority)를 집중시킴. 아티스트 랭킹을 제외한 트렌드 분석 리포트는 Supabase 에지 함수(ktrenz-ghost-publish)와 Ghost Admin API를 통해 자동 발행되며, 게시물 내에 메인 서비스로의 딥링크와 JSON-LD 구조화 데이터를 포함함.
