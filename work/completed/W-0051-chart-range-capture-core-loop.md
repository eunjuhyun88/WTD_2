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

- `ChartBoard.svelte` now exposes `getViewportForSave()` and `chartViewportCapture.ts` slices the visible range into a durable `ChartViewportSnapshot` with OHLCV plus rendered indicator series.
- `terminalPersistence.ts` now carries explicit viewport and similarity contracts, and `SaveSetupModal.svelte` writes viewport-backed pattern-capture records before forwarding `pattern_capture_id` into engine capture/challenge saves.
- the first similar-capture recall path now exists as an app-owned heuristic (`patternCaptureSimilarity.ts` + `/api/terminal/pattern-captures/similar`) that scores both note text and selected-range chart shape.
- product docs now frame `/terminal` as `trade review -> select range -> Save Setup`, but the current branch still mixes this lane with W-0048 chart UI and W-0054/W-0055 copy/doc work.
- targeted app tests for capture similarity/controller/session routes and `npm run check -- --fail-on-warnings` pass on the current branch.

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
- `/terminal` must be documented first as the trade-review and selected-range capture surface; query/challenge composition is secondary and must not redefine the core-loop start
- a capture must always carry a selected time range, even when the save originates from an engine candidate
- manual pattern seeds and candidate-linked captures share one substrate: selected-range evidence plus optional candidate/transition linkage
- the minimum saved evidence must include OHLCV range, rendered indicator slices, visible timeframe, symbol, and current pattern/runtime context when available
- free-form research notes belong with the same selected-range capture so later recall can use both narrative criteria and chart-shape evidence
- initial similar-capture recall may use app-owned heuristic matching over saved capture records before a dedicated engine retrieval plane exists
- the first concrete implementation is visible-range capture; brush/drag selection is a later enhancement on top of the same substrate
- the core loop starts from durable selected-range evidence, because that is the artifact future evaluation, labeling, and refinement can actually reuse
- this slice should merge as a product/contract unit separate from refinement methodology and separate from strategy-replication research artifacts
- branch split reason: commit `7b845a7` mixed chart-range core-loop spec changes with refinement/control-plane and replication-harness work, so this slice needs a separate product/contract PR
- viewport snapshot serialization belongs to the capture substrate even if the first data source is `ChartBoard.getViewportForSave()`
- chart metrics dock, MTF overlays, chart-focus mode, and structure-explain visuals are explicitly out of scope for this lane and stay in **W-0048**
- current root worktree contains large `ChartBoard.svelte` and `/terminal/+page.svelte` diffs from W-0048 plus copy/doc lanes, so W-0051 must reapply only the capture seam on top of `origin/main` instead of copying those files wholesale

## Next Steps

1. rebuild this lane on a clean `origin/main` branch using only `SaveSetupModal.svelte`, `chartViewportCapture.ts`, `terminalPersistence.ts`, the similar-capture route/helper, and the minimal `ChartBoard` / `+page.svelte` plumbing needed for viewport capture
2. keep the selected-range payload explicit in the product docs and contract docs; do not let W-0048 chart UI or W-0054 copy edits redefine the merge unit
3. decide whether the next implementation step is brush selection, richer indicator payloads, or capture-side annotation overlays

## Exit Criteria

- canonical docs define selected-range capture as the Save Setup contract
- the minimum capture payload is explicit enough for app and engine implementation
- manual pattern seeding and candidate capture are described as one coherent core-loop path
- the first app implementation can create viewport-backed captures and preview similar saved captures without re-deriving the loop from chat

## Handoff Checklist

- this slice is now product/contract plus the first app capture seam; it is not a full chart UI lane
- existing capture and candidate linkage work remains valid, but now sits under a stricter selected-range contract
- `CollectedMetricsDock.svelte`, `mtfAlign.ts`, `StructureExplainViz.svelte`, chart-focus toggles, and unrelated copy-only files should not be included when this lane is reconstructed
- clean design lane created:
  - branch: `codex/w-0051-chart-range-capture-design`
  - worktree: `/tmp/wtd-v2-w0051-capture-design`
  - doc-only seed commit: `ae0a5db`
- merged baseline already on `main` before this lane starts:
  - `#52` analyze contract consumer merged
  - `#53` save-setup capture link merged
  - `#55` terminal page integration merged
  - `#56` optional pattern seed scout lane merged
- do not duplicate `#52`; it is already merged and should be treated as baseline, not active work
- verification completed on the current mixed branch:
  - `npm test -- --run src/lib/terminal/terminalController.test.ts src/routes/api/terminal/session/session.test.ts src/routes/api/terminal/watchlist/watchlist.test.ts src/lib/terminal/patternCaptureSimilarity.test.ts`
  - `npm run check -- --fail-on-warnings`
