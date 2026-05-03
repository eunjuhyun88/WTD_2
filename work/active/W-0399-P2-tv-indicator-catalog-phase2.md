# W-0399-P2 — TV-parity Indicator Catalog Phase 2: Add/Remove/Edit UX (전체 인디케이터)

> Wave: 6 | Priority: P1 | Effort: L
> Charter: TV feature parity — In-Scope
> Issue: #975
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Depends on: W-0399 Phase 1 (PR #970 merged f9452455)

## Goal
모든 Tier-A 인디케이터(10종)를 트레이딩뷰처럼 여러 개 동시 표시하고, × 버튼으로 개별 제거하며, 파라미터(period 등)를 인라인으로 편집해 즉시 차트에 반영할 수 있다.

## Scope

**포함:**
- (1) PaneInfoBar × 버튼 → `indicatorInstances.remove(instanceId)` → `renderCharts()` re-render (전체 인디케이터)
- (2) 인라인 파라미터 편집 UI, debounce 250ms → 즉시 반영
- (3) `mountSecondaryIndicator(kind, params, paneIndex, instanceId)` 범용 함수로 일반화
- (4) 라이브러리 버튼 배지: 총 active 인스턴스 카운트

**인디케이터별 분류:**

| engineKey | 추가 위치 | 파라미터 | 연산 위치 |
|---|---|---|---|
| ema | price pane (overlay) | period | 클라이언트 (klines) |
| bb | price pane (overlay) | period, multiplier | 클라이언트 (klines) |
| vwap | price pane (overlay) | anchor | 클라이언트 (klines) |
| volume | price pane (overlay) | — | 클라이언트 (klines) |
| atr_bands | price pane (overlay) | period, multiplier | 클라이언트 (klines) |
| rsi | 신규 sub-pane | period | 클라이언트 계산 (klines → RMA) |
| macd | 신규 sub-pane | fast, slow, signal | 클라이언트 계산 |
| oi | 신규 sub-pane | MA window | 서버(raw) + 클라이언트(window) |
| cvd | 신규 sub-pane | MA window | 서버(raw) + 클라이언트(window) |
| derivatives | 신규 sub-pane | MA window | 서버(raw) + 클라이언트(window) |

**파일:**
- `app/src/lib/chart/mountIndicatorPanes.ts` — 범용 `mountSecondaryIndicator` + 오버레이 series 함수
- `app/src/lib/chart/clientIndicators.ts` (신규) — RSI/MACD/EMA/BB/VWAP/ATR 클라이언트 계산 (TA 로직)
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — instance loop 확장, hidePane 확장
- `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte` — instanceId wiring
- `app/src/lib/hubs/terminal/workspace/IndicatorLibrary.svelte` — 인라인 편집 폼 + 배지

## Non-Goals
- Tier B/C 인디케이터 multi-instance (→ W-0400)
- 인디케이터 drag reorder (Phase 3)
- Preset 저장/복원 (Phase 3)
- 서버 사이드 파라미터 변경 API (클라이언트 계산으로 충분)
- 100+ 인디케이터 엔진 API (→ W-0400)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| RSI/MACD 클라이언트 계산 정밀도 차이 | 중 | 중 | 백엔드와 동일 알고리즘 사용 (RMA/EMA 수식 일치), unit test로 검증 |
| 오버레이 인스턴스 N개 → pane 0 series 폭발 | 중 | 중 | MAX_INSTANCES_PER_DEF = 5 |
| price pane overlay × 버튼 위치 혼동 | 중 | 저 | 오버레이는 PaneInfoBar가 아닌 IndicatorLibrary Saved 탭에서만 × 삭제 |
| `clientIndicators.ts` 번들 크기 | 저 | 저 | 순수 JS TA 수식 (~3KB gzip), 외부 라이브러리 없음 |

### Dependencies
- Phase 1 (PR #970 merged) ✅
- 신규 migration 없음
- Rollback: 5파일 내 변경, `git revert` 단일 명령

## AI Researcher 관점

### UX Failure Modes
- **F1**: RSI 클라이언트 계산 warm-up 구간 NaN → `filter(isFinite)` 처리
- **F2**: EMA 같은 period 중복 허용 — 허용 (TV 동작 일치)
- **F3**: 오버레이 × 삭제 위치 불명확 → IndicatorLibrary Saved 탭 row에 × 명시
- **F4**: 편집 중 debounce 내 이탈 → `updateParams`는 localStorage 저장, 재진입 시 복원

## Decisions

- [D-1] × 즉시 삭제, undo 없음 (TV 동작 일치)
- [D-2] 파라미터 편집 = 인라인 폼 (모달 X)
- [D-3] debounce 250ms (keystroke별 re-render jank 방지)
- [D-4] RSI/MACD 파라미터 변경 시 클라이언트 재계산 (서버 API 호출 불필요)
- [D-5] 오버레이 × 버튼은 IndicatorLibrary Saved 탭에서만 (price pane PaneInfoBar는 non-closable)
- [D-6] MAX_INSTANCES_PER_DEF = 5

### 거절 옵션
- **서버 RSI/MACD param 요청** — 거절: 매 period 변경마다 API 라운드트립, 클라이언트 계산으로 충분
- **오버레이도 PaneInfoBar에 × 버튼** — 거절: price pane에 × 추가 시 price pane 자체 삭제 오인

## Open Questions
- [ ] [Q-1] EMA/BB 같은 period 중복 허용? (기본: 허용, TV 동작 일치)

## Implementation Plan

1. **`clientIndicators.ts` 신규** — RSI(period), MACD(fast,slow,signal), EMA(period), BB(period,mult), VWAP, ATR(period,mult) 클라이언트 계산 함수. klines 입력 → `{time, value}[]` 출력.
2. **`mountIndicatorPanes.ts` 확장** — `mountSecondaryIndicator(chart, kind, klines/rawBars, params, paneIndex, instanceId)` 범용 함수. 오버레이는 pane 0에 series 추가.
3. **`ChartBoard.svelte`** — `renderCharts()` 내 instance loop: 모든 `indicatorInstances.instances`를 순회해 kind별 분기. `hidePane` 확장: instanceId 있으면 remove+re-render.
4. **`PaneInfoBar.svelte`** — `instanceId` prop 추가, secondary pane에만 `closable=true`.
5. **`IndicatorLibrary.svelte`** — Saved 탭 instance row: `▾ Edit` toggle → kind별 파라미터 input, 배지 총합.
6. **테스트** — `clientIndicators.ts` unit tests (RSI/EMA 수치 검증, ±0.1 이내), PaneInfoBar × 클릭 테스트, IndicatorLibrary 편집 폼 테스트.

## Exit Criteria

- [ ] AC1: 모든 Tier-A 인디케이터 각각 2개 동시 표시 가능 (수동 QA 체크리스트)
- [ ] AC2: × 버튼 클릭 → 100ms 이내 해당 instance pane/series 제거
- [ ] AC3: RSI period 변경 → 250±50ms 내 차트 갱신
- [ ] AC4: 클라이언트 RSI(14) 값이 백엔드 `ind.rsi14` 값과 ±0.1 이내 일치 (unit test)
- [ ] AC5: 활성 인스턴스 0개 → 배지 hidden; N개 → 정확한 총합
- [ ] AC6: price pane × 버튼 미노출 (closable=false)
- [ ] AC7: `clientIndicators.ts` RSI/EMA/MACD unit tests PASS
- [ ] AC8: svelte-check 0 errors
- [ ] CI green / PR merged
