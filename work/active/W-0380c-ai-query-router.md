# W-0380c — Sub-PR D-7c: aiQueryRouter + Pattern Tab Wiring

> Parent: W-0380 | sub-PR: 3/3 | Effort: 2일
> Status: 🟡 Ready to Implement
> Branch: claude/sad-shirley-1b5068 (D-7b merge 후 시작)
> PR target: main

## Goal

aiQueryRouter.ts 신설 — RangeModeToast 4 action + AI Search 자유 텍스트를 단일 진입점으로 통일.
Pattern tab "recall 결과 → capture로 저장" CTA 추가.
DrawerSlide.svelte 신설 (PeekDrawer 기능을 shell 컨텍스트용으로 일반화).

## 실측 발견 (D-7b 이후 확인)

- **AIAgentPanel.svelte 5탭은 이미 존재** (decision/analyze/scan/judge/pattern) — 신규 탭 빌드 불필요.
- **Pattern tab HTML** (line 280-336): capture history list + keyboard nav 완성.
- **D-7a/b에서 추가된 recall 섹션**이 Pattern tab 상단에 표시됨.
- **`shellStore.setRightPanelTab`** 이미 존재 — tab 전환 API 있음.
- **DrawerSlide**: PeekDrawer (shell 컨텍스트)에서 일반화가 필요한지 재검토 → 이 PR scope에서 평가.

## 파일 목록

| 파일 | 역할 | 변경 유형 |
|---|---|---|
| `app/src/lib/cogochi/aiQueryRouter.ts` | 신규 dispatch + classifyText | 신규 |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | RangeModeToast 핸들러 → router dispatch | 수정 |
| `app/src/lib/cogochi/AIAgentPanel.svelte` | Pattern tab recall → capture CTA | 수정 |
| `app/src/lib/components/shell/DrawerSlide.svelte` | 신규 (scope 평가 후 결정) | 신규 or skip |

---

## Step 1 — aiQueryRouter.ts 신설

**파일 위치**: `app/src/lib/cogochi/aiQueryRouter.ts`

```typescript
/**
 * aiQueryRouter — single dispatch entry point for all AI actions.
 *
 * Phase 1: explicit intents (button-triggered, no classification needed).
 * Phase 2: classifyText() for freeform natural language queries.
 *
 * Keep this file thin — routing only, no business logic.
 */
import { setAIRanges } from '$lib/stores/chartAIOverlay';
import type { RecallMatch } from './shell.store';

// ── Intent types ─────────────────────────────────────────────────────────────

export type AIIntent =
  | { kind: 'recall';            range: RangeCtx }
  | { kind: 'analyze';           range: RangeCtx; question?: string }
  | { kind: 'capture';           range: RangeCtx; label?: string }
  | { kind: 'indicator-search';  query: string }
  | { kind: 'freeform';          text: string };

export interface RangeCtx {
  symbol: string;
  tf: string;
  startTs: number;   // unix seconds
  endTs: number;
}

export interface DispatchResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatch(
  intent: AIIntent,
  callbacks: {
    updateTabState: (updater: (ts: any) => any) => void;
    setRightPanelTab: (tab: string) => void;
    openDraftPanel?: (startTs: number, endTs: number) => void;
  }
): Promise<DispatchResult> {
  switch (intent.kind) {
    case 'recall':
      return _handleRecall(intent.range, callbacks);

    case 'analyze':
      if (callbacks.openDraftPanel) {
        callbacks.openDraftPanel(intent.range.startTs, intent.range.endTs);
      }
      return { ok: true };

    case 'capture':
      // capture는 chartSaveMode.save()가 직접 처리 — router는 탭 전환만
      callbacks.setRightPanelTab('pattern');
      return { ok: true };

    case 'indicator-search': {
      const { findIndicatorByQuery } = await import('$lib/indicators/search');
      const match = findIndicatorByQuery(intent.query);
      return { ok: true, data: match };
    }

    case 'freeform':
      // Phase 1: analyze 탭으로 보내고 chat에 push
      callbacks.setRightPanelTab('analyze');
      callbacks.updateTabState((ts: any) => ({
        ...ts,
        chat: [...(ts.chat ?? []), { role: 'user', text: intent.text }],
      }));
      return { ok: true };
  }
}

// ── classifyText (Phase 1: keyword-based) ────────────────────────────────────

/**
 * 자유 텍스트 → AIIntent. 순서: indicator → freeform.
 * Phase 2에서 LLM 기반 intent로 교체 가능하도록 slot 유지.
 */
export async function classifyText(text: string): Promise<AIIntent> {
  const { findIndicatorByQuery } = await import('$lib/indicators/search');
  const indicatorMatch = findIndicatorByQuery(text);
  if (indicatorMatch) {
    return { kind: 'indicator-search', query: text };
  }
  return { kind: 'freeform', text };
}

// ── Private ───────────────────────────────────────────────────────────────────

async function _handleRecall(
  range: RangeCtx,
  callbacks: { updateTabState: (u: (ts: any) => any) => void; setRightPanelTab: (t: string) => void }
): Promise<DispatchResult> {
  callbacks.setRightPanelTab('pattern');

  let matches: RecallMatch[] = [];
  try {
    const res = await fetch('/api/patterns/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: range.symbol,
        tf: range.tf,
        start_ts: range.startTs,
        end_ts: range.endTs,
        k: 5,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    matches = (data.matches ?? []).map((m: any): RecallMatch => ({
      captureId: m.capture_id,
      similarity: m.similarity,
      startTs: m.start_ts,
      endTs: m.end_ts,
      outcome: m.outcome,
      label: m.label,
    }));
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  // AIRangeBox 차트 표시
  setAIRanges(
    matches.map((m) => ({
      id: m.captureId,
      startTs: m.startTs,
      endTs: m.endTs,
      color: '#3b82f6',
      label: m.label ?? undefined,
      opacity: 0.15,
    }))
  );

  // TabState recallResults 갱신
  callbacks.updateTabState((ts: any) => ({ ...ts, recallResults: matches }));

  return { ok: true, data: matches };
}
```

---

## Step 2 — ChartBoard.svelte: RangeModeToast 핸들러 → router dispatch

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

**import 추가**:
```typescript
import { dispatch as aiDispatch } from '$lib/cogochi/aiQueryRouter';
import type { AIIntent } from '$lib/cogochi/aiQueryRouter';
```

**handleRangeSendToAI 교체** (D-7a에서 작성한 코드를 router로 통일):

```typescript
async function handleRangeSendToAI() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;
  const intent: AIIntent = {
    kind: 'recall',
    range: { symbol, tf, startTs: Math.round(state.anchorA), endTs: Math.round(state.anchorB) },
  };
  await aiDispatch(intent, {
    updateTabState: shellStore.updateTabState,
    setRightPanelTab: shellStore.setRightPanelTab,
  });
}
```

**handleRangeAnalyze 교체** (D-7b에서 작성한 코드를 router로):

```typescript
function handleRangeAnalyze() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;
  const intent: AIIntent = {
    kind: 'analyze',
    range: { symbol, tf, startTs: Math.round(state.anchorA), endTs: Math.round(state.anchorB) },
  };
  aiDispatch(intent, {
    updateTabState: shellStore.updateTabState,
    setRightPanelTab: shellStore.setRightPanelTab,
    openDraftPanel: (start, end) => {
      draftPanelStart = start;
      draftPanelEnd = end;
      draftPanelOpen = true;
    },
  });
}
```

---

## Step 3 — AIAgentPanel.svelte: recall → capture CTA

**파일**: `app/src/lib/cogochi/AIAgentPanel.svelte`

Pattern tab recall 섹션 (D-7b에서 추가)의 각 `recall-row`에 "Save" CTA 추가:

```svelte
{#each recallResults as m}
  <div class="recall-row">
    <span class="recall-sim">{(m.similarity * 100).toFixed(0)}%</span>
    <span class="recall-label-text">{m.label ?? m.captureId.slice(0, 8)}</span>
    <span class="recall-outcome" class:win={m.outcome === 'WIN'} class:loss={m.outcome === 'LOSS'}>
      {m.outcome ?? '—'}
    </span>
    <!-- CTA: 이 패턴을 현재 심볼로 다시 저장 -->
    <button
      class="recall-cta"
      onclick={() => openCapture({ symbol: '', timeframe: '', patternSlug: m.captureId, ...} as any)}
      title="Open this capture"
    >↗</button>
  </div>
{/each}
```

> `openCapture`는 line 77에 이미 존재. `m.captureId`로 실제 capture를 로드하는 패턴은
> 기존 `openCapture(r)` (PatternCaptureRecord 타입)과 맞춰야 함.
> 가장 단순한 방법: recall row 클릭 시 `shellStore.setRightPanelTab('decision')` + detail fetch.
> Phase D-9에서 capture detail drawer로 확장 예정.

CSS 추가:
```css
.recall-cta {
  background: none;
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: rgba(59, 130, 246, 0.7);
  cursor: pointer;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  transition: all 0.15s;
}
.recall-cta:hover { background: rgba(59, 130, 246, 0.1); color: rgba(59, 130, 246, 0.9); }
```

---

## Step 4 — DrawerSlide.svelte (scope 평가)

**결론**: D-7c에서 신규 컴포넌트로 만들 필요 없음.

근거:
- DraftFromRangePanel은 D-7b에서 `div.draft-panel-overlay` 안에 절대 위치로 처리됨.
- PeekDrawer (`app/src/lib/terminal/peek/PeekDrawer.svelte`)는 이미 존재하며 범용 drawer.
- 새 컴포넌트를 만들면 미사용 코드가 됨.

**대신**: PeekDrawer를 AIAgentPanel expanded 모드에서 재사용할 수 있는지 확인.
확인 방법: `grep -n "PeekDrawer" app/src 2>/dev/null`

DrawerSlide가 실제로 필요한 시점 → Phase D-9 (AI overlay 정교화 + Search history).
이 PR에서는 파일 생성 하지 않음.

---

## Step 5 — AI Search ⌘K → classifyText → dispatch

**파일**: CommandBar.svelte 또는 AIPanel.svelte에서 search submit 지점 확인 후 추가.

```typescript
import { classifyText, dispatch as aiDispatch } from '$lib/cogochi/aiQueryRouter';

async function handleSearchSubmit(text: string) {
  const intent = await classifyText(text);
  await aiDispatch(intent, {
    updateTabState: shellStore.updateTabState,
    setRightPanelTab: shellStore.setRightPanelTab,
  });
}
```

> 실제 CommandBar submit 이벤트 이름은 파일 확인 후 맞춤.
> CommandBar.svelte 위치: `app/src/lib/cogochi/components/CommandBar.svelte` (추정).

---

## aiQueryRouter 단위 테스트

**파일**: `app/src/lib/cogochi/__tests__/aiQueryRouter.test.ts` (신규)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { dispatch, classifyText } from '../aiQueryRouter';

describe('aiQueryRouter', () => {
  const mockCallbacks = {
    updateTabState: vi.fn(),
    setRightPanelTab: vi.fn(),
  };

  it('recall → setRightPanelTab pattern', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    } as any);

    await dispatch(
      { kind: 'recall', range: { symbol: 'BTCUSDT', tf: '1h', startTs: 1000, endTs: 2000 } },
      mockCallbacks
    );

    expect(mockCallbacks.setRightPanelTab).toHaveBeenCalledWith('pattern');
  });

  it('analyze → openDraftPanel', async () => {
    const openDraftPanel = vi.fn();
    await dispatch(
      { kind: 'analyze', range: { symbol: 'BTCUSDT', tf: '1h', startTs: 1000, endTs: 2000 } },
      { ...mockCallbacks, openDraftPanel }
    );
    expect(openDraftPanel).toHaveBeenCalledWith(1000, 2000);
  });

  it('capture → setRightPanelTab pattern', async () => {
    await dispatch(
      { kind: 'capture', range: { symbol: 'BTCUSDT', tf: '1h', startTs: 1000, endTs: 2000 } },
      mockCallbacks
    );
    expect(mockCallbacks.setRightPanelTab).toHaveBeenCalledWith('pattern');
  });

  it('freeform → setRightPanelTab analyze + chat push', async () => {
    await dispatch({ kind: 'freeform', text: 'what is the trend?' }, mockCallbacks);
    expect(mockCallbacks.setRightPanelTab).toHaveBeenCalledWith('analyze');
    expect(mockCallbacks.updateTabState).toHaveBeenCalled();
  });

  it('classifyText: RSI → indicator-search', async () => {
    const intent = await classifyText('rsi');
    expect(intent.kind).toBe('indicator-search');
  });
});
```

---

## 검증 체크리스트

```bash
# 1. aiQueryRouter 단위 테스트
cd app && npx vitest run src/lib/cogochi/__tests__/aiQueryRouter.test.ts --reporter=verbose

# 2. 전체 vitest
cd app && npx vitest run 2>&1 | tail -10

# 3. TypeScript
cd app && npx svelte-check --tsconfig tsconfig.json 2>&1 | grep "Error" | head -10

# 4. 수동
# - 차트 drag → AI → Network: POST /api/patterns/recall 1번만 호출 (router 통일 확인)
# - 차트 drag → Analyze → DraftFromRangePanel open
# - CommandBar에서 "rsi" 입력 → indicator-search intent 경유 → IndicatorLibrary 검색 진입
```

## Exit Criteria (D-7c)

- [ ] AC1: aiQueryRouter dispatch 단위 테스트 5/5 pass
- [ ] AC2: RangeModeToast AI/Analyze 버튼 → 각각 router dispatch 경유 (단일 진입점)
- [ ] AC3: recall-row ↗ 클릭 → decision tab으로 전환 (capture detail 진입)
- [ ] AC4: CommandBar submit → classifyText → dispatch 경유 (Network/console 확인)
- [ ] AC5: vitest 전체 pass
- [ ] AC6: svelte-check 0 errors

## Commit 메시지

```
feat(W-0380c D-7c): aiQueryRouter dispatch + Pattern tab recall CTA + ⌘K classifyText wiring
```
