# W-0375 Phase 2 — Component Extraction Plan

> Parent: `W-0375-cogochi-ux-consolidation.md`
> Phase: 2 of 5 | Effort: 10h | Status: 🟡 Active

## Goal

TradeMode.svelte (4254 lines) → 3 panel components + TradeMode ≤2000 lines.
AIAgentPanel renders extracted panels under ANL / SCN / JDG tabs.

## Source Locations in TradeMode.svelte

| Panel | Approx lines | drawerTab key | Producer state |
|---|---|---|---|
| AnalyzePanel | ~1549–1760 | `'analyze'` | analyzeData (timeline / evidence / confidence) |
| ScanPanel    | ~1760–1900 | `'scan'`    | scanCandidates[] / scanLoading |
| JudgePanel   | ~1900–2000 | `'judge'`   | entryPlan / domLadderRows + EXECUTE placeholder |

## cogochi.data.store.ts (already exists, 128 lines)

Producer (TradeMode) → setters:
- `setAnalyzeData(data)` → consumers read derived `analyzeData`
- `setScanCandidates(items, loading)` → derived `scanCandidates` + `scanLoading`
- `setPhaseTimeline(nodes)` → derived `phaseTimeline`
- `setMicrostructure(dom, tape, fp, hm)` → derived `domLadderRows`, etc.

## Component Contracts

### AnalyzePanel.svelte
```ts
interface Props {
  symbol: string;
  timeframe: string;
  onUpdateAnalyze?: (...) => void;
}
```
Subscribes to `analyzeData`, `phaseTimeline` from cogochi.data.store.

### ScanPanel.svelte
```ts
interface Props {
  symbol: string;
  timeframe: string;
  onSelectCandidate?: (id: string) => void;
}
```
Subscribes to `scanCandidates`, `scanLoading`.

### JudgePanel.svelte
```ts
interface Props {
  symbol: string;
  timeframe: string;
  onExecute?: () => void;  // placeholder — wired in W-0376/0377
}
```
Subscribes to `domLadderRows`, future `entryPlan` derived store.

## Integration Order

1. Create `AnalyzePanel.svelte` — extract from TradeMode `drawerTab==='analyze'` block
2. Create `ScanPanel.svelte` — extract from TradeMode `drawerTab==='scan'` block
3. Create `JudgePanel.svelte` — extract from TradeMode `drawerTab==='judge'` block
4. Update TradeMode: import 3 components, replace inline blocks with component invocations
5. Move all panel-related local CSS rules into the new components' `<style>` blocks
6. Run `pnpm check` — target: 0 new svelte-check errors above the existing baseline

## Exit Criteria

- AC1: 3 new files exist in `app/src/lib/cogochi/modes/`
- AC2: TradeMode.svelte ≤ 2000 lines
- AC3: All 3 panels subscribe to cogochi.data.store correctly
- AC4: svelte-check passes (no new errors over current baseline of 6 cogochi errors)
- AC5: vitest run passes (no new test failures)

## Dependencies + Risks

- Depends on: cogochi.data.store.ts (✅ exists)
- Depends on: RightPanelTab type fix (Phase 3 prereq, done concurrently to unblock CI)
- Risk: Some inline state in TradeMode may cross-cut multiple panels — handle via store
- Risk: CSS scoping — Svelte's component-scoped CSS means moving rules is mostly safe

## Linked Decisions (from parent W-0375)

- D-0004: TradeMode → AnalyzePanel/ScanPanel/JudgePanel extraction confirmed
- D-0006: AIAgentPanel width 320→280px (Phase 5)

## Phase 3 Coupling

Type fix `RightPanelTab = 'decision'|'analyze'|'scan'|'judge'|'pattern'` must land
in this PR to unblock App CI. Migration logic v4 (verdict→judge, research→decision)
also lands here per Q-0001 confirmation.
