# W-0347 — Sector Momentum / MTF Confluence Surface

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (기존 sector/MTF 컴퓨트 노출 — 신규 데이터 수집 아님)
> Status: 🟡 Design Draft
> Created: 2026-04-30
> Issue: #738

## Goal
Jin이 opportunity scan을 보면 각 후보의 sector momentum과 MTF confluence를 한눈에 보고, CoGochi에서 "강한 섹터" 또는 "MTF 정렬" 필터로 좁힐 수 있다.

## Scope
- 포함:
  - opportunity scan response payload에 `sector_score_norm`, `mtf_confluence` 필드 추가
  - CoGochi QuickPanel에 SECTOR 필터 탭 추가 (기존 MTF 탭 옆)
  - `SingleAssetBoard.svelte`에 sector 배지 (우상단, MTF 행 옆)
  - `WorkspaceCompareBlock.svelte`는 mtf_confluence 칩 이미 있음 — 변경 없음
- 파일:
  - `engine/research/pattern_scan/scanner.py` (sector/MTF 값 응답에 포함)
  - `app/src/routes/api/terminal/opportunity-scan/+server.ts` (payload 확장)
  - `app/src/components/terminal/SingleAssetBoard.svelte` (sector 배지)
  - `app/src/components/cogochi/QuickPanel.svelte` (SECTOR 필터 탭)
- API:
  - `GET/POST /api/terminal/opportunity-scan` response 확장 (additive only, optional fields)

## Non-Goals
- 새 sector 분류 체계 (기존 `_inject_sector_scores` 재사용)
- 신규 MTF timeframe (기존 1h/4h/1d 유지)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| API payload 크기 증가 | 저 | 저 | 필드 2개 (float)만 추가, ≤16 bytes/row |
| sector 데이터 stale (cache 만료) | 중 | 저 | sector_score_norm에 `as_of_ts` 동봉, 6h+ stale면 UI dim |
| QuickPanel 필터 조합 폭증 (MTF×SECTOR) | 중 | 저 | AND 조건으로 단순 결합, OR 조합 없음 |

### Dependencies
- W-0324~0330 (sector/MTF infra) — merged ✅
- W-0341 (dual opportunity scan) — merged ✅
- 독립: A/B/C와 병렬 가능

### Rollback
- payload 필드는 optional (Zod schema `.optional()`) → 응답에서 제거하면 UI는 배지/필터 숨김

### Files Touched
- 수정: `scanner.py` (research/pattern_scan), `opportunity-scan/+server.ts`, `SingleAssetBoard.svelte`, `QuickPanel.svelte`
- 신규: 테스트 (scanner output 스키마 + UI 렌더)

## AI Researcher 관점

### Data Impact
- 응답 필드 2종 추가 — 데이터 생성은 이미 존재, 단순 surface
- 사용자 행동 telemetry 신규: SECTOR 필터 클릭 → 필터 효용 측정 (선택율 / hit-rate)

### Statistical Validation
- sector_score_norm 분포 sanity: scan 결과 100개 sample에서 [0,1] 범위, mean ≈ 0.5 ± 0.15
- MTF confluence 정합성: `WorkspaceCompareBlock`이 표시하던 값과 신규 payload 값 일치

### Failure Modes
- F1: sector_score_norm null (소형 알트 sector 미정의) → UI는 "—" 표시, 필터에서 제외
- F2: as_of_ts 6h+ stale → 회색 배지

## Decisions
- [D-0347-01] payload field name: `sector_score_norm`, `mtf_confluence` (기존 engine 키 재사용)
- [D-0347-02] SECTOR 필터 임계값 3-tier: `weak (<0.4)`, `mid (0.4-0.7)`, `strong (≥0.7)`
- [D-0347-03] MTF 필터와 SECTOR 필터는 AND 결합

## Open Questions
- [ ] [Q-0347-01] sector cron 주기? (sector_score_norm 6h stale 기준 적절한지 확인 필요)
- [ ] [Q-0347-02] QuickPanel SECTOR 탭에서 null sector_score_norm 항목 표시할지?

## Implementation Plan
1. `engine/research/pattern_scan/scanner.py` 응답 dict에 `sector_score_norm`, `mtf_confluence` 포함 (이미 계산됨 — forward만)
2. `opportunity-scan/+server.ts` Zod schema 확장 (optional fields)
3. `SingleAssetBoard.svelte`에 sector 배지 컴포넌트 추가 (3-tier 색상)
4. `QuickPanel.svelte` SECTOR 탭 추가 — MTF 탭 코드 패턴 미러링
5. 테스트: scanner output schema 검증, SingleAssetBoard sector 배지 렌더, QuickPanel SECTOR 필터 동작

## Exit Criteria
- [ ] AC1: opportunity-scan 응답 100% rows에 `sector_score_norm` (or null) + `mtf_confluence` (or null) 키 포함
- [ ] AC2: SingleAssetBoard sector 배지 3-tier 색상 (≥3 assertions)
- [ ] AC3: CoGochi QuickPanel SECTOR 필터 클릭 시 strong tier만 남으면 결과 행 수 감소 (테스트 fixture 기반)
- [ ] AC4: 기존 mtf_confluence 칩(WorkspaceCompareBlock)과 신규 payload 값이 동일 symbol/tf에서 일치
- [ ] CI green (engine pytest + app vitest + svelte-check)
- [ ] PR merged + CURRENT.md SHA 업데이트
