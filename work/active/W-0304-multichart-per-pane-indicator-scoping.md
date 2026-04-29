# W-0304 — Multichart Per-Pane Indicator Scoping

> **Status**: REDESIGNED 2026-04-30 — SSE chart_action routing 결정 lock-in. 기존 설계는 SSE handling 미포함이었음.
>
> **Issue**: #619 (primary)
> **Duplicate**: #617 (close 권고)
> **Charter**: 베타 멀티차트 UX (W-0287/0288/0289 follow-up)
> **Depends on**: W-0102 (SSE chart_action 공유 store 결정 — 본 W-item 이 그 결정 partial revisit)
> **D-axis**: D-D (UX), D-A (store architecture)

---

## 1. 기존 설계 문제점

| # | 문제 | 실측 |
|---|---|---|
| P1 | "global store → per-pane store" 만 적시. SSE chart_action 라우팅 미정의 | `chartIndicators` store 가 SSE `add_indicator`/`remove_indicator` action 의 sink. per-pane 분리 시 어느 pane 에 적용? — 미결 |
| P2 | `createPaneIndicatorStore()` factory 만 명시. ChartPane 의 setContext/getContext 패턴 미설계 | `ChartPane.svelte` 가 global `chartIndicators` 직접 import 중. setContext 패턴 부재 |
| P3 | W-0102 결정 (SSE 공유 store) 과의 정합성 unresolved | 직접 충돌 |
| P4 | localStorage persistence 가 per-pane 인지 single 인지 미정의 | 사용자 멀티차트 토글 후 reload 시 복원 동작 모호 |
| P5 | activePane 정의 누락 | "activePane" 용어 사용 가능, 실측 시 terminal page 에 `activePaneId` state 미존재 → 신규 도입 |

---

## 2. 핵심 설계 결정 (lock-in)

### 2.1 SSE chart_action 라우팅 → **activePane 에만 적용**

| 옵션 | 판단 |
|---|---|
| A. 모든 pane 에 적용 (현 동작) | ❌ 사용자 의도 위반. pane 1 에 BTC 보면서 pane 2 에 ETH 만 indicator 켜고 싶은 경우 불가 |
| B. activePane 에만 적용 | ✅ **채택**. 자연스러운 멘탈 모델 ("선택한 차트에 적용") |
| C. SSE payload 에 `pane_id` 추가 | ⏳ 미래 확장 옵션. 지금은 server 가 pane 인식 안 함. B 로 시작 후 필요시 C 로 진화 |

→ **D-Decision**: SSE chart_action 은 `activePaneId` 의 store 에만 dispatch. server-side payload 변경 없음 (W-0102 호환).

### 2.2 localStorage persistence → **per-pane**

- 키: `chart_indicators::pane_${paneId}` (paneId 0~4)
- single chart 모드는 `paneId=0` 단일.
- 멀티차트 모드 첫 진입 시 `pane_0` 의 indicators 를 모든 신규 pane 에 복제 (UX 친화).

### 2.3 W-0102 정합성

W-0102 은 "SSE event chart_action 이 공유 store 를 토글한다" 까지만 결정. **어느 store 인지** 는 W-0304 에서 확정. → conflict 없음. W-0102 결정 유지, W-0304 가 routing layer 추가.

---

## 3. 아키텍처

### 3.1 Store 계층

```
┌─────────────────────────────────────────────────┐
│  paneIndicatorStores: Map<paneId, Writable>     │  (Map<number, Writable<IndicatorState>>)
│    pane_0 → {vwap, sma20, ...}                  │
│    pane_1 → {vwap, ...}                         │
│    ...                                          │
└─────────────────────────────────────────────────┘
        ↑                        ↑
        │ getIndicatorStore(0)   │ getIndicatorStore(1)
        │                        │
   ChartPane (paneId=0)     ChartPane (paneId=1)
        │                        │
        └────────── SSE handler ────┐
                                    │
                          activePaneId store (Writable<number>)
                                    │
                          chart_action SSE event → store of activePaneId
```

### 3.2 신규 파일

| Path | 역할 |
|---|---|
| `app/src/lib/stores/paneIndicators.ts` | factory + Map registry + activePaneId |
| (수정) `app/src/components/terminal/workspace/ChartPane.svelte` | global import 제거 → `paneId` prop + `getIndicatorStore(paneId)` |
| (수정) `app/src/routes/terminal/+page.svelte` | SSE handler 에서 `get(activePaneId)` 로 라우팅 |
| (deprecated, NOT delete) `app/src/lib/stores/chartIndicators.ts` | back-compat alias = `getIndicatorStore(0)`. W-0306 (다음 cleanup) 에서 제거 |

### 3.3 API 설계

```ts
// app/src/lib/stores/paneIndicators.ts
import { writable, get, type Writable } from 'svelte/store';

export type IndicatorState = {
  vwap: boolean;
  sma20: boolean;
  ema50: boolean;
  // ... existing fields
};

const DEFAULT_STATE: IndicatorState = {
  vwap: false, sma20: false, ema50: false,
};

const paneStores = new Map<number, Writable<IndicatorState>>();
export const activePaneId = writable<number>(0);

function loadFromStorage(paneId: number): IndicatorState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_STATE };
  const raw = localStorage.getItem(`chart_indicators::pane_${paneId}`);
  if (!raw) return { ...DEFAULT_STATE };
  try { return { ...DEFAULT_STATE, ...JSON.parse(raw) }; }
  catch { return { ...DEFAULT_STATE }; }
}

export function getIndicatorStore(paneId: number): Writable<IndicatorState> {
  if (!paneStores.has(paneId)) {
    const store = writable<IndicatorState>(loadFromStorage(paneId));
    store.subscribe((v) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`chart_indicators::pane_${paneId}`, JSON.stringify(v));
      }
    });
    paneStores.set(paneId, store);
  }
  return paneStores.get(paneId)!;
}

export function applyChartAction(action: 'add_indicator' | 'remove_indicator', name: keyof IndicatorState) {
  const id = get(activePaneId);
  const store = getIndicatorStore(id);
  store.update((s) => ({ ...s, [name]: action === 'add_indicator' }));
}
```

### 3.4 ChartPane 수정

```svelte
<script lang="ts">
  import { getIndicatorStore } from '$lib/stores/paneIndicators';
  export let paneId: number = 0;
  $: indicatorStore = getIndicatorStore(paneId);
  $: indicators = $indicatorStore;
</script>

{#if indicators.vwap}
  <VwapOverlay ... />
{/if}
```

### 3.5 ActivePane 트래킹

`+page.svelte` 의 멀티차트 컨테이너:

```svelte
<div role="grid">
  {#each panes as p, i}
    <ChartPane
      paneId={i}
      onfocus={() => activePaneId.set(i)}
      onclick={() => activePaneId.set(i)}
      class:active={$activePaneId === i}
    />
  {/each}
</div>
```

### 3.6 SSE handler 수정

기존 `chartIndicators.update(...)` 호출부를 `applyChartAction(...)` 호출로 교체.

---

## 4. Exit Criteria

| # | 기준 | 측정 |
|---|---|---|
| E1 | `paneIndicators.ts` factory + activePaneId + applyChartAction export | grep |
| E2 | `ChartPane.svelte` 가 global `chartIndicators` import 안 함 | grep + svelte-check |
| E3 | 멀티차트 mode 에서 pane 0 vwap toggle → pane 1 vwap 영향 없음 | playwright/vitest jsdom |
| E4 | activePaneId=1 일 때 SSE `add_indicator vwap` → pane 1 만 vwap=true | vitest |
| E5 | localStorage `chart_indicators::pane_0`, `chart_indicators::pane_1` 별도 키로 저장 | vitest |
| E6 | reload 후 per-pane state 복원 | vitest |
| E7 | back-compat alias: `chartIndicators` 가 `getIndicatorStore(0)` 와 같은 store 반환 | vitest |
| E8 | `chartIndicators.ts` 에 deprecation comment 추가 (W-0306 에서 제거 예정) | grep |
| E9 | svelte-check 0 errors | CI |
| E10 | terminal /workspace dual-pane 시각 확인 (스크린샷 1장) | manual |

---

## 5. Implementation Order

| 단계 | 작업 | 예상 |
|---|---|---|
| 1 | `paneIndicators.ts` 신규 작성 + vitest 5 케이스 (E1, E5, E6) | 1h |
| 2 | `chartIndicators.ts` deprecation alias | 15min |
| 3 | `ChartPane.svelte` paneId prop + store wire-up | 30min |
| 4 | 멀티차트 컨테이너 activePaneId 추적 + 시각 active 표시 | 30min |
| 5 | SSE handler `applyChartAction()` 로 교체 + vitest (E4) | 45min |
| 6 | E2E pane isolation 테스트 (E3) | 45min |
| 7 | screenshot + PR | 15min |

**총 예상: 4h** (factory 1h + UI 1h + SSE 45min + tests 45min + buffer 30min)

---

## 6. Open Questions

| # | 질문 | 후보 |
|---|---|---|
| Q1 | 멀티차트 → single chart 전환 시 pane_1~4 storage 처리? | **유지** (다음 멀티차트 진입 시 복원). delete 안 함. |
| Q2 | `chartIndicators` (legacy) 제거 시점? | W-0306 cleanup PR (미래) |
| Q3 | server-side `pane_id` SSE payload? | 본 PR 범위 외. 필요시 follow-up W-item |

---

## 7. 거절 옵션

| 거절 옵션 | 거절 이유 |
|---|---|
| Svelte 5 `setContext` 만 사용 (Map 없이) | localStorage persistence + 외부 SSE handler 접근 불가 |
| SSE payload 에 즉시 `pane_id` 추가 | server 변경 필요 + W-0102 deviation. B 옵션으로 시작 |
| 모든 pane 에 SSE 적용 (현 동작 유지) | per-pane scoping 의 핵심 가치 상실 |
| chartIndicators.ts 즉시 삭제 | 다른 컴포넌트 (terminal toolbar 등) import 가능성. 검색 후 cleanup PR 분리 |

---

## 8. Issue Action

- **#619 Update**: 본 설계문서 path 첨부, "SSE routing 결정 lock-in" 코멘트
- **#617 Close**: "duplicate of #619. 통합 설계는 W-0304 / #619."
- **PR description**: `Closes #619`, `Closes #617`

---

## 9. References

- `app/src/components/terminal/workspace/ChartPane.svelte` (현재 global store 직접 import)
- `app/src/lib/stores/chartIndicators.ts` (W-0102 결정 store)
- W-0102 (SSE chart_action 결정)
- W-0287/0288/0289 (멀티차트 base)
