# Memory: constraints/t2-v3-context-separation
Updated: now

## 핵심 규칙
- **모든 작업은 T2(Trend 2.0) 컨텍스트 기준**으로 진행한다.
- V3 컴포넌트/테이블/로직을 수정하거나 V3 데이터를 참조하지 않는다.
- 사용자가 "소셜", "트렌드", "데이터 수집" 등을 언급하면 **T2 트렌드맵(`T2TrendTreemap`, `ktrenz_trend_triggers`, `ktrenz_stars`)** 기준으로 작업한다.
- V3 에너지맵(`V3Treemap`, `v3_scores_v2`, `v3_artist_tiers`)은 건드리지 않는다.

## T2 vs V3 구분 가이드
| 항목 | T2 (작업 대상) | V3 (수정 금지) |
|------|---------------|---------------|
| 메인 컴포넌트 | `T2TrendTreemap`, `T2TrendList`, `T2ArtistList` | `V3Treemap`, `V3TrendRankings` |
| 데이터 테이블 | `ktrenz_trend_triggers`, `ktrenz_stars`, `ktrenz_social_snapshots` | `v3_scores_v2`, `v3_energy_snapshots_v2` |
| 라우트 | `/t2/*` | `/` (V3Home) |
| 점수 체계 | `influence_index`, `baseline_score`, `peak_score` | `energy_score`, `social_score`, `youtube_score` |
| 카테고리 | `keyword_category` (brand, product, social 등) | `EnergyCategory` (youtube, buzz, album 등) |

## 예외
- `V3Header`, `V3TabBar` 등 공통 레이아웃 컴포넌트는 T2에서도 사용하므로 필요시 수정 가능.
- 사용자가 **명시적으로** V3 작업을 요청한 경우에만 V3를 수정한다.
