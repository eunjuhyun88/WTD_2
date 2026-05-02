# W-0380 — Bloomberg UX Phase D-7 + D-4/D-6 Real Gap Closure

> **Issue**: [#863](https://github.com/eunjuhyun88/WTD_2/issues/863)
> **Status**: 설계 (재작성 — 이전 설계의 `lib/cogochi/` 경로는 W-0382-D 머지 후 stale)
> **Date**: 2026-05-02
> **Author**: A104 (재설계)

---

## Goal

ChartBoard의 dead code (`handleRange*` 3종)를 제거하고, AI Search/Pattern Recall/IndicatorLibrary가 이미 구현된 모듈을 일관되게 쓰도록 wiring을 정리한다. **신규 기능 없음**, 단지 진짜 gap만 닫는 정리 작업.

---

## Scope

### In-Scope (실측 gap 4건)

1. **Dead range handlers 제거** — `ChartBoard.svelte:560-588` (`handleRangeSaveCapture` / `handleRangeSendToAI` / `handleRangeAnalyze` / `handleRangeCancel`) 와 `RangeModeToast` 마운트(라인 1865-1875). 진짜 동작은 `MultiPaneChartAdapter.svelte:281` 의 `RangeActionToast`가 함.
2. **`analyze_range` event listener 추가** — `RangeActionToast.svelte:99` 가 `cogochi:cmd { id: 'analyze_range', fromTime, toTime, symbol, timeframe }` dispatch 하지만 listener가 없음. `TerminalHub.svelte:194~` 의 `onCmd`에 case 추가하여 AI panel 열고 사전 정의 prompt 주입.
3. **Orphan IndicatorLibrary 제거** — `app/src/lib/hubs/terminal/workspace/cogochi-components/IndicatorLibrary.svelte` (360 lines) 는 import하는 곳 없음 (`grep -rn "cogochi-components/IndicatorLibrary"` → 0 hit). 삭제.
4. **`aiQueryRouter.ts` 단위 테스트** — 17 RULES 분기 정확성 보장. 현재 테스트 파일 부재 (`find ... aiQueryRouter*` → ts 파일 1개만).

### Out-of-Scope (별도 W-item 권장)

- **recall API → 진짜 engine 연결** (`/api/patterns/recall/+server.ts`는 명시적 mock — `// D-6 mock` 주석 + deterministic hash). 별도 spike 필요. → `W-0388 (가칭) recall API engine wiring` 으로 분리.
- IndicatorLibrary 2개 변형 통합 (`sheets/IndicatorLibrary.svelte` 438 vs `workspace/IndicatorLibrary.svelte` 599) — 둘 다 active 사용 중, 통합은 큰 리팩토링. 별도 항목.
- AIAgentPanel 5탭 (DEC/PAT/VER/RES/JDG) 콘텐츠 보강 — 본 spec은 wiring만.

---

## CTO Risk Matrix

| 위험 | 영향 | 확률 | 완화 |
|---|---|---|---|
| Dead handler 삭제 후 ChartBoard 단독 mount 경로 회귀 | range mode 동작 안 함 | 낮음 | 실측: `RangeActionToast` 는 `MultiPaneChartAdapter` 안에서만 마운트되며, ChartBoard는 `MultiPaneChartAdapter` 통해 그려지므로 `RangeModeToast`는 dual UI (이중 토스트). 삭제 안전. |
| `analyze_range` listener 추가가 기존 chat 흐름과 중복 | UX 혼란 | 중 | `cogochi:cmd { id: 'open_ai_detail' }` 재사용으로 단일 경로화. |
| orphan IndicatorLibrary 삭제 후 git history 잃음 | recovery 비용 | 낮음 | git에 보존됨. |
| aiQueryRouter 테스트 추가 → CI flake | merge 지연 | 낮음 | pure function (regex), no I/O — flake 위험 낮음. |

---

## Files Touched

### 수정
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` (라인 560-588 제거 ~28줄, 1865-1875 제거 ~10줄, `RangeModeToast` import 제거)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (라인 194~ `onCmd` 안에 `analyze_range` case 추가, ~12줄)

### 삭제
- `app/src/lib/hubs/terminal/workspace/cogochi-components/IndicatorLibrary.svelte` (orphan, 360줄)
- (만약 `RangeModeToast.svelte` 도 dead면 함께 삭제 — Step A1 검증 필요)

### 신규
- `app/src/lib/hubs/terminal/__tests__/aiQueryRouter.test.ts` (17 RULES 각각 1 case + edge cases ~20-25 it 블록)

---

## Decisions (사용자 확인 필요 3건)

### D1. recall API: mock 유지 vs 진짜 engine 연결?
- **추천: mock 유지**. 진짜 engine 연결은 W-0367 (Pattern Pathfinding Loop)와 결합돼 단일 PR 스코프 초과. 별도 W-item으로 분리.
- **거절**: 본 PR에 포함 — 이유: engine `engine/patterns/recall.py` 부재, 신규 모듈 작성+테스트 시 PR 크기 5x 폭발.

### D2. PR 전략: 1개 통합 PR vs 3 sub-PR?
- **추천: 1개 통합 PR**. 4건 모두 30~40줄 net change, 충돌 적음, 리뷰 부담 낮음. 3 sub-PR은 overhead 과잉.
- **거절**: 3 sub-PR — 이유: A) dead handler 제거 B) listener 추가 C) orphan + 테스트 — 각각 독립 commit으로 충분.

### D3. orphan IndicatorLibrary: 삭제 vs 보존?
- **추천: 삭제**. 360줄 dead code, 다른 변형 2개가 active. git history로 복구 가능.
- **거절**: 보존 — 이유: drift detector가 미래 통합 시 잘못된 reference로 끌어올 위험.

---

## Open Questions

1. `RangeModeToast.svelte` (ChartBoard에서 import) 와 `RangeActionToast.svelte` (MultiPaneChartAdapter) 가 동시에 화면에 떠 있는지? (둘 다 `position: absolute; top-right` 계열이면 시각 중복) → Step A1: 브라우저 미리보기 또는 코드 검증 필요.
2. `analyze_range` 받았을 때 AI panel 어느 탭으로 가야 하나? (DEC vs RES) → 기본 `research`로 가정, 사용자 확인 시 변경.
3. `peek/AIAgentPanel.svelte` (332줄) 와 `panels/AIAgentPanel/AIAgentPanel.svelte` (575줄) 통합 여부 — 본 spec out-of-scope이지만 미래 W-item으로 등록 권장.

---

## Implementation Plan

### Step 1 — Dead range handler 정리 (commit 1)
1. `ChartBoard.svelte:560-588` `handleRangeSaveCapture`/`handleRangeSendToAI`/`handleRangeAnalyze`/`handleRangeCancel` 4함수 삭제.
2. `ChartBoard.svelte:1865-1875` `<RangeModeToast .../>` 블록 제거.
3. `RangeModeToast` import 제거.
4. `RangeModeToast.svelte` 다른 import site 확인 → 없으면 파일 삭제.
5. `pnpm run check` (svelte-check) 0 errors 확인.

### Step 2 — `analyze_range` listener (commit 2)
1. `TerminalHub.svelte:194~` `onCmd` switch 안에 추가:
   ```ts
   else if (c.id === 'analyze_range') {
     shellStore.setRightPanelTab('research');
     shellStore.toggleAI(); // ensure AI panel open
     const fromIso = new Date(c.fromTime * 1000).toISOString();
     const toIso = new Date(c.toTime * 1000).toISOString();
     appendAIDetail(
       `Analyze ${c.symbol} ${c.timeframe} range ${fromIso} → ${toIso}`,
       ''
     );
   }
   ```
2. CustomEvent detail 타입 보강 — `c: any` 캐스팅 위치 식별 후 narrow type.

### Step 3 — Orphan IndicatorLibrary 삭제 (commit 3)
1. `git rm app/src/lib/hubs/terminal/workspace/cogochi-components/IndicatorLibrary.svelte`.
2. `cogochi-components/` 디렉토리에 다른 파일 있으면 보존, 비었으면 디렉토리도 삭제.
3. `pnpm run check` 재검증.

### Step 4 — aiQueryRouter 테스트 (commit 4)
1. `app/src/lib/hubs/terminal/__tests__/aiQueryRouter.test.ts` 생성.
2. `aiQueryRouter.ts` RULES 배열 각 entry당 매칭/비매칭 케이스 작성.
3. Edge: 빈 string, mixed lang, special chars.
4. `pnpm vitest run aiQueryRouter` PASS.

### Step 5 — PR
- 단일 PR `feat/W-0380-d7-gap-closure` (4 commits squash 가능).
- Description: 본 spec 링크 + Exit Criteria 체크리스트.

---

## Exit Criteria

- [ ] `ChartBoard.svelte` 라인 수 38줄 이상 감소 (handler+mount+import).
- [ ] `cogochi-components/IndicatorLibrary.svelte` 파일 부재 (`ls` → ENOENT).
- [ ] `RangeActionToast → analyze_range` 발사 후 AI panel `research` 탭 활성 + chat에 prompt 1건 추가 (수동 QA 또는 e2e).
- [ ] `aiQueryRouter.test.ts` 17+ test case PASS, coverage ≥ 95% (line).
- [ ] `pnpm run check` 0 errors, 0 warnings (이전 baseline 대비 회귀 없음).
- [ ] `pnpm vitest run` 전체 PASS.
- [ ] Issue #863 close.

---

## Non-Goals (재확인)

- recall API engine wiring (별도 W-item).
- IndicatorLibrary 2 active 변형 통합 (별도 W-item).
- AIAgentPanel 콘텐츠 기능 추가.
- Bloomberg UX 신규 단축키 (현재 ⌘L/⌘I 분리는 D-7로 이미 머지됨, `TerminalHub.svelte:182-192`).
