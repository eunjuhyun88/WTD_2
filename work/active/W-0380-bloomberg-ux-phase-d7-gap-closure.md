# W-0380 — Bloomberg UX Phase D-7 + D-4/D-6 Gap Closure

> Wave: 5 | Priority: P1 | Effort: M (5-7일, 3 sub-PR)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Issue: #863
> Created: 2026-05-02
> Parent: W-0374 Phase D 연속

## Goal

차트에서 범위를 드래그하면 1초 이내에 AI Agent 패널이 유사 패턴 매칭을 카드로 표시하고, ⌘L로 IndicatorLibrary를 열어 인디케이터를 즉시 추가할 수 있다 — D-6 placeholder 4개를 real API call로, D-4 IndicatorLibrary 주요 gap 3개를 사용 가능 수준까지 끌어올린다.

## Owner

app (frontend)

## Facts

- `/api/patterns/recall` 백엔드 미존재 — 신설 필요
- `/api/cogochi/analyze` 존재, `?symbol&tf&from&to` 패턴 확립 (AIPanel.svelte:302)
- `findIndicatorByQuery` 존재 (`app/src/lib/indicators/search.ts`), aiSynonyms 포함
- `DraftFromRangePanel.svelte` 존재 (`app/src/components/terminal/workspace/`)
- ChartToolbar props silent ignore (indicatorLibraryOpen, onToggleIndicatorLibrary 선언 없음)
- D-4 `pinnedIds` — Svelte 5 `$state` Set 직접 mutate (reactivity 불명확)

## Canonical Files

- `app/src/lib/cogochi/components/IndicatorLibrary.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/workspace/ChartToolbar.svelte`
- `app/src/components/terminal/chart/overlay/RangeModeToast.svelte`
- `app/src/lib/cogochi/AIAgentPanel.svelte`
- `app/src/lib/cogochi/stores/chartAIOverlay.ts`
- `app/src/lib/cogochi/shell.store.ts`
- 신규: `app/src/lib/cogochi/aiQueryRouter.ts`
- 신규: `app/src/lib/components/shell/DrawerSlide.svelte`
- 신규: `engine/api/routes/patterns_recall.py`

## Assumptions

- W-0304 (per-pane indicator scope) 미완 → IndicatorPaneStack append는 이 PR scope 제외
- recall API p95 latency < 800ms (engine 측 PatternObject store에서 similarity search)
- `cogochi.indicator.favorites` localStorage 키 신규 — migration 불필요

## Scope

**포함**:
- D-6 SendToAI → real `POST /api/patterns/recall` call + Pattern tab card + AIRangeBox 차트 표시
- D-6 Save 성공 후 Pattern tab card append (현재 빈 if 블록)
- D-6 Analyze → DraftFromRangePanel slide-out 연결
- D-4 ⌘L 단축키 + `findIndicatorByQuery` 재사용 + localStorage pin 영구화 + debounce 100ms
- `chartAIOverlay.ts` AIRangeBox 타입 + `setAIRanges()` 추가
- `shell.store.ts` TabState `aiOverlay.ranges` 필드
- 코드 품질 3개: ChartToolbar props, 빈 if 블록, $state Set mutate
- AIAgentPanel 5탭 통합 (chat/tools/patterns/analysis/settings)
- `DrawerSlide.svelte` (PeekDrawer 일반화)
- `aiQueryRouter.ts` — hybrid dispatch

**Non-Goals**:
- D-4 accordion / 2-mode add (W-0304 완성 전 New Pane 동작 안 함, scope out)
- D-4 IndicatorPaneStack append (W-0304 의존, 별도)
- D-5 crosshair rAF throttle (lightweight-charts 내장 sync 충분)
- AIArrow / AIAnnotation overlay (사용처 없음, Phase D-9)
- aiQueryRouter LLM intent classification (over-engineering, Phase 2)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| recall backend 신설이 W-0377 파이프라인 작업과 충돌 | 중 | 고 | W-0377 owner와 namespace 사전 조율, route `/api/patterns/recall` 독립 |
| AIAgentPanel 5탭이 기존 AIPanel.svelte 회귀 유발 | 중 | 중 | shell 컨텍스트에서만 AIAgentPanel, `/cogochi`는 기존 유지 |
| aiQueryRouter 분기가 D-6 핸들러 중복 | 고 | 중 | RangeModeToast 핸들러 → aiQueryRouter.dispatch 단일 진입점으로 통일 |
| localStorage pin 직렬화 schema 변경 필요 시 migration 필요 | 저 | 저 | 신규 키, `Set<string>` JSON 직렬화, 향후 `{id, addedAt}[]` 업그레이드 가능 |
| ChartToolbar props fix가 다른 toolbar 변형(BoardToolbar)에도 영향 | 중 | 저 | svelte-check strict sweep 선행 |
| D-7a–D-7c 3 sub-PR 순서 의존성 — D-7c는 D-7a recall 없으면 카드 비어있음 | 고 | 저 | sub-PR 순서 보장 (D-7a merge 후 D-7b, D-7c) |

### Dependencies
- W-0377 (backend): route namespace 조율만 필요, 구현 의존 없음
- W-0304 (per-pane): scope out 처리로 의존 없음

### Rollback
- 각 sub-PR revert 가능
- AIAgentPanel: feature flag `cogochi.shell.aiPanelV2` (boot toggle)
- localStorage pin: 키 제거만으로 무해

## AI Researcher 관점

### aiQueryRouter 설계

**결정: hybrid — 결정형 dispatch + classifyText slot**

```typescript
// app/src/lib/cogochi/aiQueryRouter.ts

export type AIIntent =
  | { kind: 'recall'; range: CapturedRange }
  | { kind: 'analyze'; range: CapturedRange; question?: string }
  | { kind: 'capture'; range: CapturedRange; label?: string }
  | { kind: 'indicator-search'; query: string }
  | { kind: 'freeform'; text: string };

export async function dispatch(intent: AIIntent, ctx: DispatchCtx): Promise<DispatchResult>;

// Phase 1: keyword + findIndicatorByQuery 재사용 (LLM 불필요)
export function classifyText(text: string): AIIntent;
```

**이유**: RangeModeToast 4 action은 사용자가 명시적으로 버튼 누름 → 분류 불필요. 자유 텍스트만 `classifyText` 통과. findIndicatorByQuery에 aiSynonyms 이미 있음. LLM intent classifier는 latency ~800ms + 비용 대비 가치 없음 (현재 5종 action).

### AIOverlay 타입 확장

```typescript
// chartAIOverlay.ts 추가
export interface AIRangeBox {
  id: string;
  startTs: number;
  endTs: number;
  color: string;       // 'pattern-match' = '#3b82f6'
  label?: string;      // "Pattern #42 sim=0.87"
  opacity?: number;    // default 0.15
}

// shell.store.ts TabState 추가
aiOverlay: { ranges: AIRangeBox[] };
```

AIArrow / AIAnnotation은 Phase D-9로 연기.

### Failure Modes

1. **recall 0 matches**: "유사 패턴 없음" 빈 카드 + "Save as new pattern" CTA
2. **recall latency > 3s**: 1초 시점 skeleton, 3초 timeout + "Try Analyze instead" 폴백
3. **localStorage 가득 참**: try/catch + 무시 (pin은 nice-to-have)
4. **DraftFromRangePanel 미마운트**: Promise queue → mount 후 dispatch
5. **차트 unmount 중 AIRangeBox 그리기**: dispose hook에서 overlay 제거

## Decisions

- **[D-D7-1]** D-7a 먼저 (D-6 gap 선처리). 거절: D-7c 안에서 자연 완성 — 거절 이유: 드래그→매칭이 placeholder인 채로 5탭 만들면 GTM 데모 불가, 핵심 가치가 마지막까지 미완성.

- **[D-D7-2]** D-4 gap 분류:
  - P0 (D-7a): ⌘L, findIndicatorByQuery 재사용, ChartToolbar props
  - P1 (D-7b): localStorage pin, debounce 100ms
  - P2 scope out: accordion, 2-mode add, IndicatorPaneStack append

- **[D-D7-3]** AIRangeBox만 D-7a 포함. AIArrow/AIAnnotation/crosshair rAF는 D-9. 거절: 전체 D-5 복원 — 사용처 없음, 지금 필요 없음.

- **[D-D7-4]** 3 sub-PR 분할. 거절: 단일 PR — review 부담, revert granularity 손실.

- **[D-D7-5]** `/api/patterns/recall` 신설. 거절: cogochi/analyze 재사용 — "분석"과 "유사 패턴 찾기"는 사용자 mental model 자체가 다름. 같은 endpoint 쓰면 버튼 의미가 모호해짐.

## Open Questions

- [ ] [Q-D7-1] recall backend 구현 — engine/patterns/recall.py 신설? PatternObject store search method 추가? W-0377 owner와 조율 필요
- [ ] [Q-D7-2] DrawerSlide — PeekDrawer 그대로 재사용 vs 신규 컴포넌트?
- [ ] [Q-D7-3] aiQueryRouter `freeform` fallback — cogochi/analyze? 도움말 표시?

## Implementation Plan

### Sub-PR D-7a: Core Loop Real (2일, ~9 files)
1. `engine/api/routes/patterns_recall.py` — POST `/api/patterns/recall` (또는 W-0377 조율 후 stub)
2. `chartAIOverlay.ts`: `AIRangeBox` 타입 + `setAIRanges(ranges)` 추가
3. `shell.store.ts` TabState: `aiOverlay: { ranges: AIRangeBox[] }` 필드 추가
4. `ChartBoard.svelte`: `handleRangeSendToAI` → fetch recall → `setAIRanges` + Pattern tab card append
5. `ChartBoard.svelte`: `handleRangeSaveCapture` 빈 if → Pattern tab card append
6. `IndicatorLibrary.svelte`: `findIndicatorByQuery` import + 사용
7. `ChartBoard.svelte`: `keydown` ⌘L → `indicatorLibraryOpen` toggle
8. `ChartToolbar.svelte`: props 선언 추가 (indicatorLibraryOpen, onToggleIndicatorLibrary)
9. 테스트: vitest — recall fetch mock + AIRangeBox set 확인

### Sub-PR D-7b: Polish (1.5일, ~3 files)
1. `IndicatorLibrary.svelte`: localStorage `cogochi.indicator.favorites` get/set
2. `IndicatorLibrary.svelte`: search debounce 100ms
3. `IndicatorLibrary.svelte`: `pinnedIds` → 새 Set 생성 ($state reactivity)
4. `ChartBoard.svelte`: `handleRangeAnalyze` → DraftFromRangePanel slide-out
5. 테스트: localStorage round-trip + debounce timing

### Sub-PR D-7c: AIAgentPanel + Router (2일, ~6 files)
1. `aiQueryRouter.ts` 신규 — types + dispatch + classifyText
2. `DrawerSlide.svelte` 신규 — PeekDrawer 일반화
3. `AIAgentPanel.svelte` 5탭 통합 (chat/tools/patterns/analysis/settings)
4. RangeModeToast 핸들러 → aiQueryRouter.dispatch 라우팅 통일
5. AI Search ⌘K → classifyText → dispatch
6. 테스트: dispatch matrix 5종 + 5탭 mount

## Exit Criteria

- [ ] **AC1**: ⌘L → IndicatorLibrary 200ms 이내 open
- [ ] **AC2**: 차트 range 드래그 → SendToAI → 1초 이내 첫 매칭 카드 표시
- [ ] **AC3**: SendToAI 결과 N개 패턴이 차트에 AIRangeBox로 동시 표시 (max 5)
- [ ] **AC4**: Save → Pattern tab 카드 자동 추가 + captureId로 detail drawer open
- [ ] **AC5**: localStorage pin 5개 → reload → 5개 복원
- [ ] **AC6**: IndicatorLibrary 검색 "rsi" → RSI + Stoch RSI 등 aiSynonyms 매칭
- [ ] **AC7**: AIAgentPanel 5탭 전환 < 50ms, 탭 상태 shell.store 영구화
- [ ] **AC8**: aiQueryRouter dispatch 단위 테스트 5/5 pass
- [ ] **AC9**: svelte-check strict 0 errors, ChartToolbar props 경고 0
- [ ] **AC10**: D-7a→D-7b→D-7c 순차 merge + CURRENT.md SHA 업데이트

## Next Steps

1. Q-D7-1 recall backend 조율 (W-0377 owner)
2. Q-D7-2 DrawerSlide scope 결정
3. Sub-PR D-7a 구현 시작

## Handoff Checklist

- [ ] Issue 번호 frontmatter 기입
- [ ] work-issue-map 등록
- [ ] CURRENT.md 활성 테이블 추가
