# W-0051 Chart Range Capture Core Loop

## Goal

Define chart-range capture as the canonical entry point of the product core loop so a user-selected chart segment becomes a durable capture record with auto-collected market context, indicator slices, and pattern evidence.

## Owner

contract

## Scope

- define the canonical meaning of a chart-range selection in `/terminal`
- define the minimum capture payload emitted when a user saves from a selected chart segment
- align `Save Setup`, `CaptureRecord`, and the core-loop stages around selected-range evidence instead of free-form bookmarking
- clarify how manual pattern seeds and pattern-candidate saves share the same capture substrate

## Non-Goals

- implementing chart brush/drag UI in this slice
- changing engine scoring logic or pattern-runtime semantics
- redesigning `/lab` evaluation UX
- replacing existing candidate transition linkage

## Canonical Files

- `AGENTS.md`
- `work/active/W-0051-chart-range-capture-core-loop.md`
- `docs/product/core-loop-system-spec.md`
- `docs/product/pages/02-terminal.md`
- `work/active/W-0037-pattern-capture-record.md`
- `work/active/W-0038-pattern-candidate-capture-contract.md`
- `work/active/W-0039-terminal-save-setup-capture-link.md`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/workspace/SaveSetupModal.svelte`
- `app/src/lib/terminal/chartViewportCapture.ts`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/routes/terminal/+page.svelte`
- `engine/capture/types.py`
- `engine/api/routes/captures.py`

## Facts

- `W-0036` persistence rollout is already merged on `main`, so selected-range capture now lands as a separate contract slice instead of reopening the persistence umbrella
- this lane now has the first implementation substrate on a clean branch: `terminalPersistence` pattern-capture contract, app API helpers, server persistence helpers, `chartViewportCapture.ts`, and `/api/terminal/pattern-captures`
- `SaveSetupModal.svelte` now creates a terminal pattern-capture record before engine save and forwards viewport metadata plus optional `pattern_capture_id`
- `ChartBoard.svelte` now provides visible-range viewport snapshots through `getViewportForSave()` without bringing in `W-0048` chart-surface changes
- targeted verification passed in the clean lane: `npm run check -- --fail-on-warnings` and vitest for contract plus `/api/terminal/pattern-captures`

## Assumptions

- selected-range capture should work for both manual pattern seeding and candidate-confirmation saves
- the first implementation may use visible-range capture before adding a richer brush/drag selection tool
- auto-collected context should be engine-owned or contract-owned fields, not ad hoc app-only blobs

## Open Questions

- whether the first explicit selection tool is visible-range only, drag-brush range, or both
- whether indicator collection should store only rendered indicators or the full engine-side feature bundle for the selected interval
- whether manual annotations drawn by the user belong in the same capture record or a sibling overlay record

## Decisions

- `Save Setup` is canonically a chart-range capture, not a generic save bookmark
- a capture must always carry a selected time range, even when the save originates from an engine candidate
- manual pattern seeds and candidate-linked captures share one substrate: selected-range evidence plus optional candidate/transition linkage
- the minimum saved evidence must include OHLCV range, rendered indicator slices, visible timeframe, symbol, and current pattern/runtime context when available
- the core loop starts from durable selected-range evidence, because that is the artifact future evaluation, labeling, and refinement can actually reuse
- this slice should merge as a product/contract unit separate from refinement methodology and separate from strategy-replication research artifacts
- branch split reason: commit `7b845a7` mixed chart-range core-loop spec changes with refinement/control-plane and replication-harness work, so this slice needs a separate product/contract PR
- viewport snapshot serialization belongs to the capture substrate even if the first data source is `ChartBoard.getViewportForSave()`
- chart metrics dock, MTF overlays, chart-focus mode, and structure-explain visuals are explicitly out of scope for this lane and stay in **W-0048**
- the first shipping slice uses visible-range capture only; brush or drag-range selection remains a later enhancement

## Next Steps

1. stage and commit the clean `W-0051` slice from `/tmp/wtd-v2-w0051-capture-design`
2. open a narrow PR for the selected-range capture substrate only
3. leave brush-selection UX and chart-surface elaboration for follow-up work after this contract lane lands

## Exit Criteria

- canonical docs define selected-range capture as the Save Setup contract
- the minimum capture payload is explicit enough for app and engine implementation
- manual pattern seeding and candidate capture are described as one coherent core-loop path
- future implementation can proceed without re-deriving the loop from chat

## Handoff Checklist

- first implementation slice now exists in the clean lane; do not re-open the dirty salvage branch for this work
- `ChartBoard.getViewportForSave()` is the only viewport source in scope for this PR
- `CollectedMetricsDock.svelte`, `mtfAlign.ts`, `StructureExplainViz.svelte`, chart-focus toggles, and other `W-0048` files stay out of this branch
- clean design lane created:
  - branch: `codex/w-0051-chart-range-capture-design`
  - worktree: `/tmp/wtd-v2-w0051-capture-design`
  - doc-only seed commit: `ae0a5db`
- current verification status:
  - `cd app && npm run check -- --fail-on-warnings`
  - `cd app && npm test -- --run src/lib/contracts/terminalPersistence.test.ts src/routes/api/terminal/pattern-captures/pattern-captures.test.ts`
- merged baseline already on `main` before this lane starts:
  - `#52` analyze contract consumer merged
  - `#53` save-setup capture link merged
  - `#55` terminal page integration merged
  - `#56` optional pattern seed scout lane merged
- do not duplicate `#52`; it is already merged and should be treated as baseline, not active work
