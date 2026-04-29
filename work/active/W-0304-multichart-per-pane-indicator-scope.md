# W-0304 — 멀티차트 per-pane 인디케이터 스코핑

> Wave: MM (Maintenance) | Priority: P2 | Effort: S (2일)
> Charter: In-Scope L5 (Chart UI surface, 기능 정합성 개선)
> Status: 🟡 Design Draft
> Issue: #619
> Created: 2026-04-29

---

## Goal

멀티차트 2x2/3+1 모드에서 pane A에서 EMA를 켜도 pane B에 영향을 주지 않도록,
`chartIndicators` 전역 store를 Svelte Context API로 per-pane 격리한다.

---

## Scope

- 포함:
  - `ChartPane.svelte` — `setContext('chartIndicators', writable(DEFAULT))` 주입
  - `ChartBoard.svelte` — `getContext('chartIndicators')` → global fallback 패턴
  - `chartIndicators.ts` — `createPaneIndicatorStore()` factory 함수 추가
- 파일/모듈:
  - `app/src/lib/stores/chartIndicators.ts` (186줄)
  - `app/src/components/terminal/workspace/ChartPane.svelte`
  - `app/src/components/terminal/workspace/ChartBoard.svelte` (or ChartBoardHeader.svelte)
- 테스트:
  - `app/src/components/terminal/workspace/__tests__/W0304_per_pane_indicators.test.ts`

---

## Non-Goals

- 단일 모드(`multiChartMode=false`) 동작 변경: global store 그대로 유지
- VWAP/ATR 등 개별 인디케이터 로직 변경: 스코핑만, 계산 로직 불변
- SSE chart_action 이벤트 per-pane 라우팅: 별도 work item

---

## Exit Criteria

- [ ] AC1: `ChartPane.svelte`에서 `setContext('chartIndicators', createPaneIndicatorStore())` 호출
- [ ] AC2: `ChartBoard.svelte`에서 `getContext('chartIndicators') ?? chartIndicators` (global fallback)
- [ ] AC3: vitest — pane A store와 pane B store가 독립 인스턴스임을 확인
- [ ] AC4: 기존 단일 모드 회귀 없음 (svelte-check 0 errors, 기존 테스트 통과)
- [ ] AC5: `chartIndicators.ts`에 `createPaneIndicatorStore()` 함수 export

**수치 기준**: 단일 모드 indicator toggle latency 영향 없음 (≤1ms, 현재와 동일)

---

## AI Researcher 리스크

**훈련 데이터 영향**: 없음. 인디케이터 UI 스코핑은 chart_action SSE 시그널과 무관.
**통계적 유효성**: N/A (UI 격리, 모델 학습 신호 불변)
**실데이터**: 멀티차트 모드에서 EMA 5/20/60은 항상 표시됨 — 이 변경 후 단일 모드에서 동일하게 항상 표시 유지 필요.

---

## CTO 설계 결정

**Svelte Context API 선택 이유**:
- `setContext` / `getContext`는 컴포넌트 트리 내에서만 동작 → pane 격리 자연스럽게 달성
- global store instance는 단일 모드에서 그대로 재사용 → 기존 코드 변경 최소화
- 대안 (prop drilling): ChartBoard→ChartBoardHeader → 2단계 prop 추가 → 인터페이스 오염

**Fallback 패턴**:
```ts
// ChartBoard.svelte
import { getContext } from 'svelte';
import { chartIndicators as globalIndicators } from '$lib/stores/chartIndicators';

const indicators = getContext<Readable<ChartIndicatorState>>('chartIndicators')
                ?? globalIndicators;
```

**Factory 함수**:
```ts
// chartIndicators.ts 에 추가
export function createPaneIndicatorStore(): Writable<ChartIndicatorState> {
  return writable(DEFAULT_INDICATOR_STATE);
}
```

---

## Facts (코드 실측)

```
chartIndicators.ts:
  - 186줄, global singleton writable
  - export { chartIndicators, toggleIndicator, addIndicator, removeIndicator }
  - snapshotIndicators() / resetIndicators() 유틸 존재

ChartPane.svelte:
  - W-0288에서 신규 생성
  - ChartBoard를 wrapping, setContext 없음

ChartBoard.svelte:
  - chartIndicators store를 직접 subscribe
  - multiChartMode 시 동일 store 공유
```

---

## Assumptions

- Svelte 5 runes + `svelte/store` compatible: setContext/getContext는 Svelte 5에서도 동작
- 단일 모드(`multiChartMode=false`)에서 ChartBoard는 global store 사용 (Context 없음)
- 멀티모드에서 ChartPane이 항상 ChartBoard를 wrapping하는 구조 유지 (W-0288 구조)

---

## Canonical Files

| 파일 | 변경 내용 |
|---|---|
| `app/src/lib/stores/chartIndicators.ts` | `createPaneIndicatorStore()` export 추가 |
| `app/src/components/terminal/workspace/ChartPane.svelte` | `setContext('chartIndicators', createPaneIndicatorStore())` 주입 |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | `getContext ?? globalIndicators` fallback 패턴 적용 |
| `app/src/components/terminal/workspace/__tests__/W0304_per_pane_indicators.test.ts` | per-pane 격리 vitest |

---

## Implementation Plan

1. `chartIndicators.ts`에 `createPaneIndicatorStore()` factory 추가 (5줄)
2. `ChartPane.svelte`에서 onMount 전 `setContext` 호출
3. `ChartBoard.svelte`에서 `getContext ?? global` fallback 적용
4. 테스트 작성 (AC1~AC5)
5. `svelte-check` 0 errors 확인

---

## References

- Issue #617 (tech debt), Issue #619 (이 work item)
- W-0288 PR #600 (ChartGridLayout + ChartPane 구현)
- spec/PRIORITIES.md — L5 갭 (UI surface 정합성)
