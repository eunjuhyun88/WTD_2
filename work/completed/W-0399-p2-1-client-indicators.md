# W-0399-P2.1 — clientIndicators.ts + RSI/MACD/EMA Multi-Instance

> Wave: 6 | Priority: P1 | Effort: M (1 PR)
> Charter: In-Scope (TV feature parity)
> Issue: #1019
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Parent: W-0399-P2 (#975) — TV Indicator Catalog Phase 2
> Depends on: W-0399 Phase 1 (PR #970 merged)

## Goal
사용자가 RSI 2개(period=14, period=21)와 MACD 2개, EMA 5개를 동시에 차트에 띄우고, × 버튼으로 100ms 내 개별 제거하며, 인라인 편집으로 250ms 내 차트 갱신을 본다 — TradingView 멀티 인스턴스 패리티 1차 발사.

## Owner
app

## Scope

**포함:**
- 신규 `app/src/lib/chart/clientIndicators.ts` — RSI(period), MACD(fast,slow,signal), EMA(period) 클라이언트 계산 함수 (klines → `{time, value}[]`)
- `mountIndicatorPanes.ts` 확장 — `mountSecondaryIndicator(chart, kind, klines, params, paneIndex, instanceId)` 범용 함수 (RSI/MACD/EMA)
- `ChartBoard.svelte` — `renderCharts()` 내 `indicatorInstances` 순회, RSI/MACD = sub-pane, EMA = pane 0 overlay
- `PaneInfoBar.svelte` — `instanceId` prop, secondary pane만 closable=true
- `IndicatorLibrary.svelte` Saved 탭 row — `▾ Edit` 토글, period 인라인 편집, debounce 250ms
- unit tests ≥18: clientIndicators RSI/MACD/EMA 수치 ±0.1 백엔드 일치 (n=200, 3심볼)

**파일:**
- `app/src/lib/chart/clientIndicators.ts` (신규, ≤2KB gzip)
- `app/src/lib/chart/mountIndicatorPanes.ts` (확장)
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` (instance loop 추가)
- `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte` (instanceId wiring)
- `app/src/lib/hubs/terminal/workspace/IndicatorLibrary.svelte` (인라인 편집 폼)
- `app/src/lib/chart/clientIndicators.test.ts` (신규)

## Facts
- Issue: #1019
- Parent: W-0399-P2 (#975)
- Depends on: W-0399 Phase 1 (PR #970 merged) — indicatorInstances store 존재
- No new migration needed
- No new npm dependencies

## Canonical Files
- `app/src/lib/chart/clientIndicators.ts`
- `app/src/lib/chart/clientIndicators.test.ts`
- `app/src/lib/chart/mountIndicatorPanes.ts`
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`
- `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte`
- `app/src/lib/hubs/terminal/workspace/IndicatorLibrary.svelte`

## Assumptions
- `indicatorInstances` store (W-0399 Phase 1, PR #970 merged) 존재 ✅
- `indicatorInstances.ts`에 `defaultParams`, `add`, `remove`, `updateParams` API 존재
- `mountIndicatorPanes.ts` 558줄 — 기존 단일 RSI/MACD 마운트 로직 추출 후 범용화
- 새 DB migration 불필요
- 외부 TA 라이브러리 사용 안 함 (순수 JS)

## Non-Goals
- BB / VWAP / ATR_bands overlay (P2.2)
- OI / CVD / derivatives 서버 raw + windowing (P2.3)
- 라이브러리 배지 총합 (P2.3)
- Drag reorder / preset 저장 (Phase 3)
- 100+ engine API (W-0400)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| RSI/MACD 클라이언트 계산 정밀도 차이 | 중 | 중 | Wilder's RMA 수식 백엔드 일치, unit test ±0.1 검증 |
| EMA period=21 5개 동시 → pane 0 series 폭발 | 중 | 중 | MAX_INSTANCES_PER_DEF=5 |
| debounce 250ms 중 chart jank | 저 | 저 | requestAnimationFrame batching |
| clientIndicators.ts 번들 크기 | 저 | 저 | 순수 JS, ≤2KB gzip CI gate |
| RSI warm-up 구간 NaN | 저 | 저 | `filter(isFinite)`, period+1 시점부터 표시 |

### Dependencies / Rollback
- W-0399 Phase 1 (PR #970 merged) ✅ — indicatorInstances store
- 새 migration 없음
- 새 npm dependency 없음
- Rollback: 단일 PR revert (5파일 수정 + 1 신규)

## AI Researcher 관점

### 정확도 검증
- RSI(14) 클라이언트 vs `engine/.../rsi14` 백엔드: |err| 평균 ≤ 0.05, max ≤ 0.1 (n=200, BTC/ETH/SOL)
- MACD(12,26,9): 동일 기준
- EMA(21): 동일 기준

### Failure Modes
- **F1**: 같은 period 중복 (RSI 14 + RSI 14) → 허용 (TV 동작 일치, instanceId로 구분)
- **F2**: klines 200개 미만 → MACD slow=26 warm-up 부족 시 UI에 "데이터 부족" hint
- **F3**: 차트 줌 변경 시 재계산 → klines 변경 시에만 재계산 (memoize by klines hash)
- **F4**: 편집 중 이탈 → params는 indicatorInstances store에 즉시 persist (localStorage)

## Decisions
- [D-1] RSI = Wilder's RMA (alpha = 1/period, 백엔드 일치)
- [D-2] MACD = EMA(fast) - EMA(slow), signal = EMA(MACD, 9)
- [D-3] EMA = standard exponential, alpha = 2/(period+1)
- [D-4] 클라이언트 계산만 — period 변경 시 서버 API 호출 없음
- [D-5] EMA overlay × 버튼은 IndicatorLibrary Saved 탭에서만 (price pane PaneInfoBar non-closable)
- [D-6] MAX_INSTANCES_PER_DEF = 5
- [D-7] memoize key = `${symbol}:${interval}:${klines.length}:${klines[last].time}`

### 거절 옵션
- **서버 RSI/MACD param 요청**: 거절 — 매 period 변경마다 API 라운드트립, 클라이언트 계산으로 충분
- **price pane PaneInfoBar × 버튼**: 거절 — pane 자체 삭제 오인 UX
- **외부 TA 라이브러리 (technicalindicators 등)**: 거절 — 50KB+ gzip, 자체 수식 ≤2KB로 충분

## Open Questions
- [ ] [Q-1] EMA 같은 period 중복 허용? (기본: 허용, TV 동작 일치)

## Implementation Plan
1. **clientIndicators.ts 신규**: `rsi(klines, period)`, `macd(klines, fast, slow, signal)`, `ema(klines, period)` — 입력 `{time, close}[]`, 출력 `{time, value}[]` (MACD는 `{time, macd, signal, hist}[]`)
2. **mountIndicatorPanes.ts 확장**: `mountSecondaryIndicator(chart, kind, klines, params, paneIndex, instanceId)` — kind in `['rsi','macd','ema']` 분기, series factory 반환, EMA는 pane 0 addSeries
3. **ChartBoard.svelte**: `renderCharts()` 내 `indicatorInstances.instances.forEach(...)` 루프 추가, RSI/MACD = next sub-pane auto-assign, EMA = pane 0
4. **PaneInfoBar.svelte**: `instanceId` prop, `closable` derived (instanceId != null), × 클릭 → `indicatorInstances.remove(instanceId)` + `renderCharts()` re-trigger
5. **IndicatorLibrary.svelte**: Saved 탭 row마다 `▾ Edit` 토글 → kind별 input 렌더링 (RSI: period, MACD: fast/slow/signal, EMA: period), debounce 250ms → `updateParams(instanceId, params)`
6. **clientIndicators.test.ts**: 18+ 케이스 (RSI/MACD/EMA 백엔드 일치, warm-up NaN, 빈 입력, 단조 증가/감소)

## Next Steps
1. `clientIndicators.ts` 신규 작성 + 테스트
2. `mountIndicatorPanes.ts` `mountSecondaryIndicator` 추가
3. `ChartBoard.svelte` instance loop + pane auto-assign
4. `PaneInfoBar.svelte` instanceId + closable
5. `IndicatorLibrary.svelte` 인라인 편집 폼
6. PR 생성

## Handoff Checklist
- [ ] clientIndicators.ts 신규 + unit tests ≥18 pass (AC7)
- [ ] RSI/MACD/EMA multi-instance 동시 표시 (AC1)
- [ ] × 버튼 100ms 내 제거 (AC2)
- [ ] 편집 debounce 250±50ms (AC3)
- [ ] clientIndicators.ts ≤2KB gzip (AC5)
- [ ] svelte-check 0 errors (AC8)
- [ ] CI green / PR merged

## Exit Criteria
- [ ] AC1: RSI 2개 + MACD 2개 + EMA 5개 동시 표시 (수동 QA)
- [ ] AC2: × 버튼 클릭 → 100ms 이내 instance pane/series 제거
- [ ] AC3: period 변경 → 250±50ms 내 차트 갱신
- [ ] AC4: 클라이언트 RSI(14)/MACD/EMA 값이 백엔드 ±0.1 이내 (unit test, n=200, 3심볼)
- [ ] AC5: clientIndicators.ts ≤2KB gzip (CI gate)
- [ ] AC6: price pane × 버튼 미노출 (closable=false)
- [ ] AC7: 18+ unit tests PASS
- [ ] AC8: svelte-check 0 errors
- [ ] CI green / PR merged / CURRENT.md SHA 업데이트
