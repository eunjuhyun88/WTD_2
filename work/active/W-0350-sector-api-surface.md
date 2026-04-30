---
id: W-0350
title: Sector & MTF score API surface (sector_score_norm + mtf_confluence)
status: design
wave: 5
priority: P1
effort: M
owner: engine+app
issue: "#758"
created: 2026-04-30
---

# W-0350 — Sector & MTF score API surface

> Wave: 5 | Priority: P1 | Effort: M
> Owner: engine+app
> Status: 🟡 Design Draft
> Created: 2026-04-30

## Goal
Jin이 IntelPanel에서 코인 카드 상단에 "Sector +12%, MTF Bull 4/4" 같은 섹터·다중타임프레임 합치 정보를 즉시 보고 어떤 매크로 흐름 위에 올라타고 있는지 한눈에 판단한다.

## Scope
### Files
- `engine/api/schemas_opportunity.py` — `OpportunityScore` Pydantic 모델에 `sector_score_norm: float | None`, `sector_avg_pct: float | None`, `mtf_confluence_score: float | None`, `mtf_ema_bull_count: int | None`, `mtf_ema_bear_count: int | None` 추가 (실측: 11~33행, 현재 미노출)
- `engine/api/routes/opportunity.py` — scanner DataFrame에서 위 5개 컬럼 읽어 `OpportunityScore(...)` 생성 시 매핑 (실측: 14, 163~178행)
- `engine/research/pattern_scan/scanner.py` — `_inject_sector_features` (323행), `_inject_mtf_features` (310행) 출력이 누락되지 않도록 주석/검증 추가 (drop 컬럼 가드)
- `app/src/lib/contracts/generated/engine-openapi.d.ts` — openapi 재생성 시 자동 반영 (수동 변경 X)
- `app/src/lib/engine/opportunityScanner.ts` — 19행 `OpportunityScore` interface 5개 필드 추가
- `app/src/lib/server/engine-runtime/local/opportunity.ts` — local stub에서도 동일 필드 노출 (null safe)
- `app/src/components/terminal/IntelPanel.svelte` — 1234~1246행 pick-card 영역에 sector/mtf 작은 chip 2개 추가 (sector_avg_pct color, mtf_bull_count/4)

### API Changes
- `GET /opportunity/run` 응답 `OpportunityScore` 객체에 5개 optional 필드 추가 (backwards compatible — 모두 nullable)
- 새 엔드포인트 없음

### Schema Changes
- Pydantic: `OpportunityScore` 5 fields 추가 (모두 `float | None` / `int | None`)
- DB 변경 없음 (scanner DataFrame에 이미 존재)

## Non-Goals
- sector taxonomy 자체 변경 (별도 영역, charter scope 밖)
- MTF feature 계산 로직 변경 (이미 `compute_mtf_confluence` 동작 중)
- IntelPanel의 sort 기준 변경 (totalScore 유지)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| openapi 클라이언트 재생성 누락으로 타입 미스매치 | M | M | CI에서 `pnpm openapi:generate --check` step 추가 |
| scanner DataFrame에 컬럼 누락 시 KeyError | L | M | `df.get(col, None)` defensive read + None 직렬화 |
| IntelPanel 추가 chip이 좁은 화면에서 깨짐 | M | L | flex-wrap + `min-width: 0` 적용, 320px 모바일 스냅샷 추가 |
| 기존 frontend 캐시(`CachedOpportunityScan`) 호환성 | L | M | 새 필드 optional → 기존 캐시 entry 그대로 read 가능 |

### Dependencies
- 없음 (engine scanner는 이미 컬럼 생성, app 타입만 확장)

### Rollback
- API 5 필드 nullable이므로 backend revert 시 `null` 반환 → app 표시만 사라짐
- `git revert` 단일 PR 단위, DB 스키마 변경 없음

## AI Researcher 관점

### Data Impact
- scanner output → API 직렬화 라운드트립에서 컬럼 lossy → lossless 전환
- 다운스트림 personalization weights, hypothesis registry가 sector/mtf 필드를 활용 가능 (W-0351, W-0341 시너지)

### Statistical Validation
- 14일 A/B: sector_score_norm > 0.7 코인의 후속 24h 수익률이 random pick 대비 `Δμ ≥ 0` 확인 (Welch t-test, α=0.05)
- mtf_bull_count == 4 vs ≤ 2 그룹 hit_rate ≥ 5pp gap 확인

### Failure Modes
- scanner가 sector mapping 미존재 코인에 NaN 주입 → API 500. 가드: `pd.notna(...)` else None
- mtf 컬럼이 NaN → JSON 직렬화 무한루프 위험. 가드: `float(x) if pd.notna(x) else None`

## Implementation Plan
1. engine: `OpportunityScore` 5 필드 추가 + `routes/opportunity.py`에서 scanner df 읽어 채움 (defensive get)
2. engine 단위 테스트: `tests/test_opportunity_schema.py` 신규 — sector/mtf 필드 직렬화 확인 (3 case: full / partial NaN / 미존재)
3. openapi 재생성: `make openapi-export` → `pnpm openapi:generate`
4. app: `OpportunityScore` ts interface 확장 + IntelPanel pick-card chip 2개 추가
5. visual: 기존 IntelPanel snapshot test 갱신 (W-0287 lineage)

## Exit Criteria
- [ ] AC1: `GET /opportunity/run` 응답 sample에서 100% 코인이 5 필드 (값 또는 null) 포함, missing 0건
- [ ] AC2: IntelPanel pick-card에 sector chip + mtf chip 2개 렌더, viewport 320px에서 overflow 0
- [ ] AC3: pytest 신규 3 case + 기존 engine 테스트 0 regression (1955+ 유지)
- [ ] AC4: typecheck 0 errors (openapi 재생성 후 svelte-check green)
- [ ] CI green (pytest + typecheck)
- [ ] PR merged + CURRENT.md SHA 업데이트
