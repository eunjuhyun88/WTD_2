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
- define how free-form research notes on a selected chart segment can be reused for later similar-capture recall

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

- the current core-loop spec treats capture as chart-context aware, but it does not yet define selected-range capture as the canonical Day-1 input artifact
- `ChartBoard.svelte` already has `getViewportForSave()` that slices the visible chart range into a save payload candidate
- existing candidate capture flow already persists chart context, feature snapshots, block scores, and transition linkage
- current `Save Setup` behavior is partly challenge-like and partly pattern-capture-like, which leaves the true loop input underspecified
- the user-facing product intent is to save exactly the chart segment being inspected, not an abstract symbol bookmark detached from visible evidence
- traders also need to paste thesis-like narrative criteria into Save Setup and later retrieve prior captures that look structurally similar on-chart
- the chart-range core-loop contract is already merged on `main` via `#66`; the remaining slice here is the recall/reuse behavior on top of that contract
- the stale `codex/w-0051-chart-range-capture-clean` branch mixed similarity recall with unrelated deletions, so this slice is being rebuilt on top of current `origin/main`

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
- free-form research notes belong with the same selected-range capture so later recall can use both narrative criteria and chart-shape evidence
- initial similar-capture recall may use app-owned heuristic matching over saved capture records before a dedicated engine retrieval plane exists
- the core loop starts from durable selected-range evidence, because that is the artifact future evaluation, labeling, and refinement can actually reuse
- this slice should merge as a product/contract unit separate from refinement methodology and separate from strategy-replication research artifacts
- branch split reason: commit `7b845a7` mixed chart-range core-loop spec changes with refinement/control-plane and replication-harness work, so this slice needs a separate product/contract PR
- viewport snapshot serialization belongs to the capture substrate even if the first data source is `ChartBoard.getViewportForSave()`
- chart metrics dock, MTF overlays, chart-focus mode, and structure-explain visuals are explicitly out of scope for this lane and stay in **W-0048**
- this rebuild must carry only similarity-recall files plus the minimum terminal page/work-item updates required after `#66`

## Next Steps

1. publish the rebuilt similarity-recall merge unit on top of current `origin/main`
2. keep this slice limited to `SaveSetupModal`, terminal persistence contract/api, similarity ranking logic, and the similar-captures route
3. leave richer retrieval/backfill logic for follow-up work after this clean merge lands

## Exit Criteria

- canonical docs define selected-range capture as the Save Setup contract
- the minimum capture payload is explicit enough for app and engine implementation
- manual pattern seeding and candidate capture are described as one coherent core-loop path
- future implementation can proceed without re-deriving the loop from chat

## Handoff Checklist

- this slice is design/contract work, not the UI implementation itself
- existing capture and candidate linkage work remains valid, but now sits under a stricter selected-range contract
- next implementation should start from `ChartBoard.getViewportForSave()` rather than inventing a parallel save primitive
- rebuilt similarity lane:
  - source branch: `codex/w-0051-chart-range-capture-clean`
  - rebuild worktree: `/private/tmp/wtd-pr68-rebased`
  - verification target: app check plus targeted similarity unit test
- do not mix `engine/ops`, `W-0052`, or other unrelated deletions into this branch
