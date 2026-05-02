# W-0380b — Sub-PR D-7b: Polish

> Parent: W-0380 | sub-PR: 2/3 | Effort: 1.5일
> Status: 🟡 Ready to Implement
> Branch: claude/sad-shirley-1b5068 (D-7a merge 후 시작)
> PR target: main

## Goal

IndicatorLibrary localStorage pin 영구화 + debounce 100ms.
Analyze 핸들러 → DraftFromRangePanel slide-out 연결.
D-7a에서 chat push로 처리한 recall 결과를 TabState `recallResults` 필드로 격상 → Pattern tab 상단에 전용 섹션으로 표시.

## 실측 기반 파일 목록

| 파일 | 역할 | 변경 유형 |
|---|---|---|
| `app/src/lib/cogochi/components/IndicatorLibrary.svelte` | localStorage pin + debounce | 수정 |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | handleRangeAnalyze → DraftFromRangePanel | 수정 |
| `app/src/lib/cogochi/shell.store.ts` | TabState recallResults 필드 | 수정 |
| `app/src/lib/cogochi/AIAgentPanel.svelte` | Pattern tab recall 섹션 추가 | 수정 |

---

## Step 1 — shell.store.ts: recallResults 필드

**동기**: D-7a에서 handleRangeSendToAI가 chat 배열에 recall 결과를 text로 push했는데,
Pattern tab은 chat을 읽지 않는다 (Pattern tab은 `patternRecords` + `filteredPatterns` 사용).
recall 결과를 Pattern tab에 표시하려면 TabState에 전용 필드가 필요.

**파일**: `app/src/lib/cogochi/shell.store.ts`

`TabState` interface (line 20-48)에 추가 (`drawingMode: boolean;` 아래):

```typescript
  recallResults: RecallMatch[] | null;
```

RecallMatch 타입 선언 (TabState interface 바로 위에 추가):

```typescript
export interface RecallMatch {
  captureId: string;
  similarity: number;
  startTs: number;
  endTs: number;
  outcome: string | null;
  label: string | null;
}
```

**FRESH_TAB_STATE** (line ~155) 기본값:
```typescript
  recallResults: null,
```

**normalizeTabState** (line ~223):
```typescript
  recallResults: (raw as any)?.recallResults ?? null,
```

---

## Step 2 — ChartBoard.svelte: handleRangeSendToAI 수정 (D-7a 수정)

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

D-7a에서 작성한 `handleRangeSendToAI`의 Step 4 (chat push) 부분을 교체:

```typescript
// 기존 (D-7a):
shellStore.updateTabState((ts) => ({
  ...ts,
  chat: [...(ts.chat || []), { role: 'user', text: ... }, { role: 'assistant', text: summary }],
}));

// 교체 (D-7b):
shellStore.updateTabState((ts) => ({
  ...ts,
  recallResults: matches.map((m) => ({
    captureId: m.capture_id,
    similarity: m.similarity,
    startTs: m.start_ts,
    endTs: m.end_ts,
    outcome: m.outcome,
    label: m.label,
  })),
}));
```

> D-7b sub-PR에서 D-7a commit 위에 수정하므로, D-7a PR merge 후 D-7b 브랜치를 최신 main에서 checkout.

---

## Step 3 — AIAgentPanel.svelte: Pattern tab recall 섹션

**파일**: `app/src/lib/cogochi/AIAgentPanel.svelte`

**현재 Pattern tab** (line 280-336): 기존 capture history list (`filteredPatterns`).

**추가할 import** (파일 상단):
```typescript
import { shellStore, activeRightPanelTab, activeTabState } from './shell.store';
import type { RecallMatch } from './shell.store';
```

(RecallMatch는 이미 shell.store에서 export됨)

**recallResults derived 추가** (script 섹션 상단 부근):
```typescript
const recallResults = $derived($activeTabState.recallResults);
```

**Pattern tab HTML 수정** — `{:else if activeTab === 'pattern'}` 블록 안, `<div class="pat-panel">` 바로 시작에 recall 섹션 추가:

```svelte
{#if recallResults && recallResults.length > 0}
  <div class="recall-section">
    <div class="recall-header">
      <span class="recall-label">Recall Results</span>
      <button
        class="recall-clear"
        onclick={() => shellStore.updateTabState(ts => ({ ...ts, recallResults: null }))}
      >✕</button>
    </div>
    {#each recallResults as m}
      <div class="recall-row">
        <span class="recall-sim">{(m.similarity * 100).toFixed(0)}%</span>
        <span class="recall-label-text">{m.label ?? m.captureId.slice(0, 8)}</span>
        <span class="recall-outcome" class:win={m.outcome === 'WIN'} class:loss={m.outcome === 'LOSS'}>
          {m.outcome ?? '—'}
        </span>
      </div>
    {/each}
  </div>
  <div class="recall-divider"></div>
{:else if recallResults !== null}
  <div class="recall-empty">No similar patterns found.</div>
{/if}
```

**CSS 추가** (style 섹션):
```css
.recall-section {
  padding: 6px 8px;
  background: rgba(59, 130, 246, 0.05);
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}
.recall-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.recall-label { font-size: 10px; color: rgba(59, 130, 246, 0.9); font-weight: 600; letter-spacing: 0.05em; }
.recall-clear { background: none; border: none; color: rgba(177, 181, 189, 0.4); cursor: pointer; font-size: 10px; padding: 0; }
.recall-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 11px;
  color: rgba(177, 181, 189, 0.8);
}
.recall-sim { color: rgba(59, 130, 246, 0.9); font-weight: 600; min-width: 30px; }
.recall-label-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recall-outcome.win { color: rgba(34, 197, 94, 0.9); }
.recall-outcome.loss { color: rgba(239, 68, 68, 0.9); }
.recall-empty { padding: 8px; font-size: 11px; color: rgba(177, 181, 189, 0.4); text-align: center; }
.recall-divider { height: 1px; background: rgba(42, 46, 57, 0.6); }
```

---

## Step 4 — IndicatorLibrary.svelte: localStorage pin 영구화

**파일**: `app/src/lib/cogochi/components/IndicatorLibrary.svelte`

**현재** (line 18): `let pinnedIds = $state<Set<string>>(new Set());`

**교체**:
```typescript
const FAVORITES_KEY = 'cogochi.indicator.favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function saveFavorites(ids: Set<string>): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota exceeded — ignore */
  }
}

let pinnedIds = $state<Set<string>>(loadFavorites());
```

**togglePin 수정** (line ~59-61):

현재 (D-7a에서 이미 수정됨):
```typescript
function togglePin(id: string) {
  const next = new Set(pinnedIds);
  next.has(id) ? next.delete(id) : next.add(id);
  pinnedIds = next;
}
```

교체 (localStorage 저장 추가):
```typescript
function togglePin(id: string) {
  const next = new Set(pinnedIds);
  next.has(id) ? next.delete(id) : next.add(id);
  pinnedIds = next;
  saveFavorites(next);
}
```

---

## Step 5 — IndicatorLibrary.svelte: search debounce 100ms

**파일**: `app/src/lib/cogochi/components/IndicatorLibrary.svelte`

`searchQuery` 를 raw input value와 debounced query로 분리:

```typescript
let searchRaw = $state('');         // input bind 대상
let searchQuery = $state('');       // filteredIndicators에서 사용
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

$effect(() => {
  const val = searchRaw;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => { searchQuery = val; }, 100);
});
```

HTML input (line ~81): `bind:value={searchQuery}` → `bind:value={searchRaw}`

`filteredIndicators` derived는 그대로 `searchQuery` 사용 (이미 참조).

---

## Step 6 — ChartBoard.svelte: handleRangeAnalyze → DraftFromRangePanel

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

DraftFromRangePanel props (`app/src/components/terminal/workspace/DraftFromRangePanel.svelte:1`):
```typescript
interface Props {
  symbol: string;
  startTs: number | null;
  endTs: number | null;
  timeframe?: string;
  // ... (기타 props 파일 상단 확인)
}
```

**접근 방식**: DraftFromRangePanel을 `{#if draftPanelOpen}` 조건부로 ChartBoard 내부에 마운트.
`handleRangeAnalyze`에서 `draftPanelOpen = true` + props 세팅.

**변수 추가** (ChartBoard script 상단):
```typescript
let draftPanelOpen = $state(false);
let draftPanelStart = $state<number | null>(null);
let draftPanelEnd = $state<number | null>(null);
```

**handleRangeAnalyze 교체** (line 593-611):

현재 (chat push placeholder):
```typescript
function handleRangeAnalyze() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;
  // chat push ...
}
```

교체:
```typescript
function handleRangeAnalyze() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;
  draftPanelStart = state.anchorA;
  draftPanelEnd = state.anchorB;
  draftPanelOpen = true;
  // range mode 유지 (사용자가 패널 닫으면 cancel)
}
```

**HTML에 DraftFromRangePanel 추가** — IndicatorLibrary `{#if}` 블록(line 1840) 바로 아래:

먼저 import 추가 (script 상단):
```typescript
import DraftFromRangePanel from '../../components/terminal/workspace/DraftFromRangePanel.svelte';
```

> import 경로는 ChartBoard.svelte 위치(`app/src/components/terminal/workspace/`)에서 상대경로 확인:
> `DraftFromRangePanel.svelte`가 같은 디렉토리에 있으므로 `'./DraftFromRangePanel.svelte'`

HTML:
```svelte
{#if draftPanelOpen}
  <div class="draft-panel-overlay">
    <DraftFromRangePanel
      {symbol}
      {tf}
      startTs={draftPanelStart}
      endTs={draftPanelEnd}
      onClose={() => { draftPanelOpen = false; chartSaveMode.exitRangeMode(); }}
    />
  </div>
{/if}
```

> DraftFromRangePanel의 실제 props명 (특히 onClose)은 `DraftFromRangePanel.svelte` 상단 확인 후 맞춤.

CSS (ChartBoard style에 추가):
```css
.draft-panel-overlay {
  position: absolute;
  top: 40px;
  right: 16px;
  z-index: 120;
  width: 360px;
  max-height: 80%;
  overflow-y: auto;
  background: var(--g2, #1a1a1a);
  border: 1px solid var(--g4, #272320);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
```

---

## 검증 체크리스트

```bash
# 1. TypeScript
cd app && npx svelte-check --tsconfig tsconfig.json 2>&1 | grep -E "Error" | head -10

# 2. localStorage pin round-trip
# 브라우저: IndicatorLibrary 열고 RSI pin → reload → pin 유지 확인

# 3. debounce
# 브라우저: 검색창에 빠르게 타이핑 → 마지막 100ms 후에만 필터링

# 4. DraftFromRangePanel
# 브라우저: 차트 range drag → Analyze 버튼 → 오른쪽 패널 slide-in 확인

# 5. recallResults
# SendToAI 후 → Pattern tab 상단에 Recall Results 섹션 표시
# ✕ 버튼으로 섹션 닫기

# 6. vitest
cd app && npx vitest run 2>&1 | tail -10
```

## Exit Criteria (D-7b)

- [ ] AC1: localStorage pin 5개 → reload → 5개 복원 (FAVORITES_KEY round-trip)
- [ ] AC2: 검색 타이핑 중 100ms 이내 필터 미갱신 (debounce 동작)
- [ ] AC3: Analyze → DraftFromRangePanel 표시, symbol/tf/range 자동 채워짐
- [ ] AC4: SendToAI 결과 → Pattern tab 상단 Recall Results 섹션 (match 수 표시)
- [ ] AC5: Recall Results ✕ 클릭 → 섹션 사라짐 (recallResults = null)
- [ ] AC6: svelte-check 0 errors

## Commit 메시지

```
feat(W-0380b D-7b): polish — localStorage pin + debounce + Analyze→DraftFromRangePanel + recall results section
```
