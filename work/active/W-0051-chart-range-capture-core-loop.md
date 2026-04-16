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
- `engine/capture/types.py`
- `engine/api/routes/captures.py`

## Facts

- the current core-loop spec treats capture as chart-context aware, but it does not yet define selected-range capture as the canonical Day-1 input artifact
- `ChartBoard.svelte` already has `getViewportForSave()` that slices the visible chart range into a save payload candidate
- existing candidate capture flow already persists chart context, feature snapshots, block scores, and transition linkage
- current `Save Setup` behavior is partly challenge-like and partly pattern-capture-like, which leaves the true loop input underspecified
- the user-facing product intent is to save exactly the chart segment being inspected, not an abstract symbol bookmark detached from visible evidence
- the old `task/w-0051-chart-range-core-loop` branch diverges too far from `main`; this slice is being rebuilt as a docs-only merge unit on top of current `origin/main`

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

## Next Steps

1. Publish this docs-only merge unit from the rebuilt main-based branch.
2. Define the concrete capture payload shape for selected-range evidence and candidate linkage.
3. Implement the first `/terminal` slice using visible-range capture, then add richer brush selection after the contract is stable.

## Exit Criteria

- canonical docs define selected-range capture as the Save Setup contract
- the minimum capture payload is explicit enough for app and engine implementation
- manual pattern seeding and candidate capture are described as one coherent core-loop path
- future implementation can proceed without re-deriving the loop from chat

## Handoff Checklist

- this slice is design/contract work, not the UI implementation itself
- existing capture and candidate linkage work remains valid, but now sits under a stricter selected-range contract
- next implementation should start from `ChartBoard.getViewportForSave()` rather than inventing a parallel save primitive
- rebuilt merge unit:
  - branch: `codex/w-0051-chart-range-capture-design`
  - worktree: `/private/tmp/wtd-w0051-clean`
  - verification: docs-only scope; no runtime test required
