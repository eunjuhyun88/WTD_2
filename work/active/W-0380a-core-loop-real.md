# W-0380a — Sub-PR D-7a: Core Loop Real

> Parent: W-0380 | sub-PR: 1/3 | Effort: 2일
> Status: 🟡 Ready to Implement
> Branch: claude/sad-shirley-1b5068 (현재 branch, 이미 8 commits ahead)
> PR target: main

## Goal

차트 드래그 → SendToAI → 1초 이내 Pattern tab에 매칭 카드 + 차트에 AIRangeBox 표시.
⌘L로 IndicatorLibrary open. ChartToolbar TypeScript 오류 제거.

## 실측 기반 파일 목록

| 파일 | 역할 | 변경 유형 |
|---|---|---|
| `engine/api/routes/patterns.py` | recall endpoint 신설 | 추가 (~40줄) |
| `app/src/lib/stores/chartAIOverlay.ts` | AIRangeBox 타입 + setAIRanges | 추가 |
| `app/src/lib/cogochi/shell.store.ts` | TabState aiOverlay 필드 | 추가 |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | handleRangeSendToAI real + handleRangeSaveCapture Pattern card + ⌘L keydown | 수정 |
| `app/src/components/terminal/workspace/ChartToolbar.svelte` | indicatorLibraryOpen prop 추가 | 수정 |
| `app/src/lib/cogochi/components/IndicatorLibrary.svelte` | findIndicatorByQuery import + $state Set mutate fix | 수정 |

## Step 1 — Backend: patterns recall endpoint

**파일**: `engine/api/routes/patterns.py`

`search_pattern_state_similarity`가 `engine/research/live_monitor.py:685`에 이미 존재하므로, 그걸 직접 사용하지 말고 캡처 범위 기반 유사도 검색을 위한 심플한 endpoint를 신설한다. 복잡한 ML similarity 대신 1차는 `captures` 테이블에서 시간 범위 오버랩 패턴을 반환하는 stub-then-real 방식.

`patterns.py` 맨 끝 (`@router.post("/draft-from-range")` 블록 이후)에 추가:

```python
class PatternRecallRequest(BaseModel):
    symbol: str
    tf: str
    start_ts: int   # unix seconds (anchorA)
    end_ts: int     # unix seconds (anchorB)
    k: int = 5      # 최대 반환 수

class PatternRecallMatch(BaseModel):
    capture_id: str
    pattern_id: str | None
    similarity: float
    start_ts: int
    end_ts: int
    outcome: str | None  # 'WIN'|'LOSS'|'PENDING'|None
    label: str | None

@router.post("/recall")
async def recall_patterns(
    req: PatternRecallRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    """
    1차 구현: captures 테이블에서 같은 symbol+tf 캡처를 반환 (기간 무관).
    similarity는 임시로 1.0 고정 → Phase D-9에서 벡터 유사도로 교체.
    """
    from sqlalchemy import select, and_
    from engine.db.models import Capture  # 실제 model path 확인 필요

    stmt = (
        select(Capture)
        .where(
            and_(
                Capture.symbol == req.symbol,
                Capture.tf == req.tf,
            )
        )
        .order_by(Capture.created_at.desc())
        .limit(req.k)
    )
    rows = (await db.execute(stmt)).scalars().all()

    matches = [
        PatternRecallMatch(
            capture_id=str(r.id),
            pattern_id=str(r.pattern_id) if r.pattern_id else None,
            similarity=1.0,  # placeholder — Phase D-9에서 real similarity
            start_ts=int(r.anchor_a) if r.anchor_a else req.start_ts,
            end_ts=int(r.anchor_b) if r.anchor_b else req.end_ts,
            outcome=r.outcome,
            label=r.label,
        )
        for r in rows
    ]

    return {"matches": [m.model_dump() for m in matches], "total": len(matches)}
```

> **주의**: `Capture` 모델 import 경로는 `engine/db/models.py` 또는 `engine/models/` 실제 경로 확인 후 수정. `anchor_a`, `anchor_b`, `outcome`, `label` 컬럼명도 실제 스키마와 대조.

**검증**: `pytest engine/tests/ -k "recall" -x` 또는 `curl -X POST http://localhost:8000/api/patterns/recall -H "Content-Type: application/json" -d '{"symbol":"BTCUSDT","tf":"1h","start_ts":1700000000,"end_ts":1700003600}'`

---

## Step 2 — chartAIOverlay.ts: AIRangeBox 타입 추가

**파일**: `app/src/lib/stores/chartAIOverlay.ts`

현재 파일 (31줄):
- `AIPriceLine` interface (lines 8-13)
- `AIOverlayState` interface with `lines: AIPriceLine[]` (lines 15-18)
- `setAIOverlay()`, `clearAIOverlay()` functions

**추가할 내용** — 파일 끝에 append:

```typescript
// ── Pattern Recall Range Boxes ─────────────────────────────────────────────

export interface AIRangeBox {
  id: string;           // capture_id
  startTs: number;      // unix seconds
  endTs: number;        // unix seconds
  color: string;        // '#3b82f6' for pattern-match
  label?: string;       // "sim=0.87" or capture label
  opacity?: number;     // default 0.15
}

const _rangesStore = writable<AIRangeBox[]>([]);

export const chartAIRanges = { subscribe: _rangesStore.subscribe };

export function setAIRanges(boxes: AIRangeBox[]): void {
  _rangesStore.set(boxes.slice(0, 5));  // max 5
}

export function clearAIRanges(): void {
  _rangesStore.set([]);
}
```

---

## Step 3 — shell.store.ts: TabState aiOverlay 필드

**파일**: `app/src/lib/cogochi/shell.store.ts`

**수정 위치**: `TabState` interface (line 20-48)

`drawingMode: boolean;` (line 47) 바로 아래에 추가:

```typescript
  aiOverlay: {
    ranges: import('$lib/stores/chartAIOverlay').AIRangeBox[];
  };
```

**FRESH_TAB_STATE** (line 155 부근) 기본값 추가:

```typescript
  aiOverlay: { ranges: [] },
```

**normalizeTabState** (line 223 부근)에 migration 추가:

```typescript
  aiOverlay: (raw as any)?.aiOverlay ?? { ranges: [] },
```

> shell store는 localStorage에 직렬화되므로, 기존 사용자 데이터와 호환 위해 `?? { ranges: [] }` 필수.

---

## Step 4 — ChartBoard.svelte: handleRangeSendToAI real

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

**현재 코드** (line 571-591):
```svelte
function handleRangeSendToAI() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;
  // ... chat push only (placeholder)
  shellStore.updateTabState((ts) => ({
    ...ts,
    chat: [...(ts.chat || []), { role: 'user' as const, text: rangeContext }],
  }));
}
```

**교체 코드**:
```typescript
async function handleRangeSendToAI() {
  const state = chartSaveMode.snapshot();
  if (!state.anchorA || !state.anchorB) return;

  // 1. Pattern tab으로 전환
  shellStore.setRightPanelTab('pattern');

  // 2. recall API 호출
  let matches: PatternRecallMatch[] = [];
  try {
    const res = await fetch('/api/patterns/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        tf,
        start_ts: Math.round(state.anchorA),
        end_ts: Math.round(state.anchorB),
        k: 5,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      matches = data.matches ?? [];
    }
  } catch {
    // silent fail — 빈 카드 표시
  }

  // 3. 차트에 AIRangeBox 표시
  setAIRanges(
    matches.map((m: PatternRecallMatch) => ({
      id: m.capture_id,
      startTs: m.start_ts,
      endTs: m.end_ts,
      color: '#3b82f6',
      label: m.label ?? (m.similarity < 1 ? `sim=${m.similarity.toFixed(2)}` : undefined),
      opacity: 0.15,
    }))
  );

  // 4. Pattern tab에 recall 결과 카드 추가 (chat message로 직렬화)
  const summary =
    matches.length > 0
      ? `Found ${matches.length} similar pattern(s) for ${symbol} ${tf} range.`
      : `No similar patterns found for this range. Consider saving it as a new pattern.`;

  shellStore.updateTabState((ts) => ({
    ...ts,
    chat: [
      ...(ts.chat || []),
      {
        role: 'user' as const,
        text: `[pattern-recall] ${JSON.stringify({ symbol, tf, start: state.anchorA, end: state.anchorB })}`,
      },
      { role: 'assistant' as const, text: summary },
    ],
  }));
}
```

**필요한 import 추가** (ChartBoard.svelte 상단 import 섹션):
```typescript
import { setAIRanges } from '$lib/stores/chartAIOverlay';
// PatternRecallMatch 타입 (inline 선언 or import from types)
interface PatternRecallMatch {
  capture_id: string;
  pattern_id: string | null;
  similarity: number;
  start_ts: number;
  end_ts: number;
  outcome: string | null;
  label: string | null;
}
```

---

## Step 5 — ChartBoard.svelte: handleRangeSaveCapture 빈 블록 채우기

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

**현재 코드** (line 559-569):
```typescript
async function handleRangeSaveCapture() {
  const captureId = await chartSaveMode.save({ symbol, tf, phase: 'GENERAL' });
  if (captureId) {
    // Range mode exits automatically after save succeeds
    // chartSaveMode listeners handle the UI reset
  }
}
```

**교체**:
```typescript
async function handleRangeSaveCapture() {
  const captureId = await chartSaveMode.save({ symbol, tf, phase: 'GENERAL' });
  if (captureId) {
    // Pattern tab으로 전환 + 저장 완료 메시지
    shellStore.setRightPanelTab('pattern');
    shellStore.updateTabState((ts) => ({
      ...ts,
      chat: [
        ...(ts.chat || []),
        {
          role: 'assistant' as const,
          text: `[pattern-saved] captureId=${captureId} symbol=${symbol} tf=${tf}`,
        },
      ],
    }));
  }
}
```

---

## Step 6 — ChartBoard.svelte: ⌘L 단축키

**파일**: `app/src/components/terminal/workspace/ChartBoard.svelte`

`indicatorLibraryOpen = $state(false)` 선언은 이미 line 178에 있음.

⌘L 처리를 위한 keydown 핸들러 추가 — `handleDrawingModeKeydown` 함수 근처 (line 1629 이후 블록):

현재 `window.addEventListener('keydown', handleDrawingModeKeydown)` 패턴을 따라 새 리스너 추가:

```typescript
function handleIndicatorLibraryKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
    e.preventDefault();
    indicatorLibraryOpen = !indicatorLibraryOpen;
  }
}
```

`$effect` 블록에서 등록/해제:
```typescript
// 기존 window.addEventListener('keydown', handleDrawingModeKeydown) 바로 아래에 추가
window.addEventListener('keydown', handleIndicatorLibraryKeydown);
// cleanup:
window.removeEventListener('keydown', handleIndicatorLibraryKeydown);
```

---

## Step 7 — ChartToolbar.svelte: props 선언 추가

**파일**: `app/src/components/terminal/workspace/ChartToolbar.svelte`

**현재 line 4**:
```svelte
let { tf = '1h', onTfChange, showExport = true, drawingMode = false, onToggleDrawing } = $props();
```

**교체**:
```svelte
let {
  tf = '1h',
  onTfChange,
  showExport = true,
  drawingMode = false,
  onToggleDrawing,
  indicatorLibraryOpen = false,
  onToggleIndicatorLibrary,
}: {
  tf?: string;
  onTfChange?: (tf: string) => void;
  showExport?: boolean;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  indicatorLibraryOpen?: boolean;
  onToggleIndicatorLibrary?: () => void;
} = $props();
```

`{#if showExport}` 블록 바로 앞에 indicator toggle 버튼 추가:
```svelte
<button
  class="indicator-btn"
  class:active={indicatorLibraryOpen}
  onclick={onToggleIndicatorLibrary}
  title="Indicators (⌘L)"
>
  📈
</button>
```

`.indicator-btn` CSS (`.export-btn` 스타일 복사해서 추가):
```css
.indicator-btn {
  background: none;
  border: none;
  color: rgba(177, 181, 189, 0.7);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  transition: all 0.2s;
  border-radius: 3px;
}
.indicator-btn:hover { color: rgba(177, 181, 189, 0.95); background: rgba(100, 150, 200, 0.1); }
.indicator-btn.active { color: rgba(100, 200, 255, 0.9); background: rgba(100, 150, 200, 0.2); }
```

---

## Step 8 — IndicatorLibrary.svelte: findIndicatorByQuery + $state fix

**파일**: `app/src/lib/cogochi/components/IndicatorLibrary.svelte`

**import 추가** (line 6 이후):
```typescript
import { findIndicatorByQuery } from '$lib/indicators/search';
```

**filteredIndicators $derived 교체** (line 30-57):

현재 search filter (`includes`)를:
```typescript
if (searchQuery.trim()) {
  const q = searchQuery.toLowerCase();
  result = result.filter(
    (ind) =>
      ind.name.toLowerCase().includes(q) ||
      ind.shortName.toLowerCase().includes(q) ||
      ind.description.toLowerCase().includes(q) ||
      ind.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}
```

교체:
```typescript
if (searchQuery.trim()) {
  // findIndicatorByQuery: aiSynonyms + example queries 매칭 포함
  const topMatch = findIndicatorByQuery(searchQuery);
  const q = searchQuery.toLowerCase();
  result = result.filter(
    (ind) =>
      ind.id === topMatch?.id ||  // aiSynonyms 히트를 맨 앞으로
      ind.name.toLowerCase().includes(q) ||
      ind.shortName.toLowerCase().includes(q) ||
      ind.description.toLowerCase().includes(q) ||
      ind.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}
```

**pinnedIds $state Set mutate fix** (line 59-61):

현재:
```typescript
function togglePin(id: string) {
  pinnedIds.has(id) ? pinnedIds.delete(id) : pinnedIds.add(id);
}
```

교체 (새 Set 생성으로 $state reactivity 보장):
```typescript
function togglePin(id: string) {
  const next = new Set(pinnedIds);
  next.has(id) ? next.delete(id) : next.add(id);
  pinnedIds = next;
}
```

---

## 검증 체크리스트

```bash
# 1. TypeScript
cd app && npx svelte-check --tsconfig tsconfig.json 2>&1 | grep -E "Error|Warning" | head -20

# 2. Unit tests
cd app && npx vitest run --reporter=verbose 2>&1 | tail -20

# 3. Backend
cd engine && python -m pytest tests/ -k "recall or capture" -x -v 2>&1 | tail -20

# 4. 수동 확인
# - 브라우저에서 /cogochi 진입
# - 차트에서 drag → RangeModeToast 표시 확인
# - "AI" 버튼 클릭 → Network tab에서 POST /api/patterns/recall 확인
# - Pattern tab으로 전환 + chat에 결과 메시지 확인
# - ⌘L → IndicatorLibrary 슬라이드인 확인
# - ChartToolbar에 📈 버튼 확인
```

## Exit Criteria (D-7a)

- [ ] AC1: ⌘L → IndicatorLibrary open (animation 포함 200ms)
- [ ] AC2: SendToAI → POST /api/patterns/recall 호출 확인 (Network tab)
- [ ] AC3: SendToAI → Pattern tab 전환 + chat 메시지 표시
- [ ] AC4: Save → Pattern tab 전환 + captureId 포함 chat 메시지
- [ ] AC5: svelte-check strict ChartToolbar props 오류 0
- [ ] AC6: IndicatorLibrary 검색 "rsi" → RSI 포함 결과 (aiSynonyms 경유)
- [ ] AC7: CI green (pytest + vitest)

## Commit 메시지

```
feat(W-0380a D-7a): core loop real — recall API + AIRangeBox + ⌘L + ChartToolbar props
```
