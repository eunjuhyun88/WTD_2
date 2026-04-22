# W-0086 Core Loop UX Concretization

## Goal

Turn the Cogochi core-loop product thesis into a concrete, build-ready UX specification across `/terminal`, `/lab`, `/dashboard`, and `/` so every future surface change can be measured against one canonical standard. This work item supersedes ad-hoc UX patches by establishing the four-layer chart architecture, the range-based Save Setup interaction, cross-surface handoff contracts, and the activation funnel targets.

## Owner

app (UX + product surface). Depends on engine capture/ledger contracts but does not modify engine internals.

## Scope

- codify the 4-layer chart architecture that preserves Lightweight Charts native interactions while allowing our primitives/overlays
- define the Save Setup range-mode interaction (click-click range selection, ESC exit, pan/zoom preserved)
- define per-surface UX spec for Terminal, Lab, Dashboard, Home aligned to capture-first core loop
- define cross-surface handoff event contract (5 events only)
- define the activation funnel (A0-A6) and the single Aha target (A3 = first Save Setup in 3 min)
- define the GTM positioning line that makes drawing-tool absence coherent
- reconcile the three unstaged surface groups (terminal follow-up, home/lab, engine server boundary) against this spec so future refactor order is clear

## Non-Goals

- replacing Lightweight Charts with the full TradingView Advanced Charts widget
- building a minimum-viable drawing toolset (trend lines, fib, rectangles) in this work item
- redesigning the Home surface beyond the single 3-step loop visualization adjustment
- implementing pattern/state-machine engine logic (separate work items W-0085 and onward)
- reopening W-0078 shell ownership decisions

## Canonical Files

- `docs/product/core-loop.md`
- `docs/product/pages/01-home.md`
- `docs/product/pages/02-terminal.md`
- `docs/product/pages/03-lab.md`
- `docs/product/pages/04-dashboard.md`
- `work/active/W-0078-terminal-core-loop-ux-overhaul.md`
- `work/active/W-0056-core-loop-ux-agent-execution-blueprint.md`
- `work/active/W-0086-core-loop-ux-concretization.md`

## Persona Model

Three personas are recognized, but they are understood as one user in three temporal modes:

- `P1 Replay Trader`
  triggered by a just-closed trade or a reviewed historical segment
  job-to-be-done: mark the exact chart range and preserve it as durable evidence
  first home surface: `/terminal`

- `P2 Hypothesis Operator`
  triggered by accumulated captures and a general hypothesis
  job-to-be-done: turn multiple captures into one evaluable challenge, test generalization, gate a live watch
  first home surface: `/lab`

- `P3 Live Judge`
  triggered by a daily return to pending signals
  job-to-be-done: judge pending alerts (`agree / disagree` with reason), feed refinement
  first home surface: `/dashboard`

## Core Loop UX Principles

1. capture-first always; AI response must never displace the chart review surface
2. one-owner-per-function per W-0078 (symbol=top bar, timeframe=chart header, verdict=right rail, prompt=footer, handoff=save surface)
3. deterministic authority on entry/exit lives in engine/ML; LLM roles are parsing, summarizing, translating
4. state machine phases must be visible as first-class UI language, not hidden tags
5. loop closure is a UI job; `agree/disagree + reason` on pending alerts is a primary CTA on `/dashboard`
6. cross-surface state transfer uses only persisted records or URL parameters; no hidden local-store handoffs

## Chart Architecture (4-Layer Contract)

Terminal chart is structured as four strictly separated layers so Lightweight Charts native behavior remains unmodified.

- `Layer 0 · LWC canvas`
  owns: crosshair, mouse pan, wheel zoom, pinch zoom, series rendering, timeframe reload, touch gestures
  rule: no application DOM is placed on top of this canvas; no event handler overrides native LWC pointer behavior

- `Layer 1 · LWC primitives`
  owns: range-selection rectangle, phase zone backgrounds, markers anchored to time coordinates
  rule: primitives must re-anchor via `timeScale.subscribeVisibleTimeRangeChange`; they must survive timeframe switching without re-drawing

- `Layer 2 · Canvas DOM overlay`
  owns: phase badge chip (top-right), range-mode hint toast
  rule: overlay container uses `pointer-events: none`; only interactive chips/buttons inside use `pointer-events: auto`; overlay never covers the main chart body

- `Layer 3 · Chart-external DOM`
  owns: chart header (timeframe, indicators, Save Setup button), right analysis rail, prompt footer, left market drawer
  rule: all non-chart UI lives here; no element in this layer visually overlaps the LWC canvas beyond the normal header/rail/footer frame

### Native Regression Tests (must pass after any UX change)

1. `crosshair test` — crosshair tracks the cursor pixel-for-pixel across the entire chart body
2. `pan test` — dragging empty chart space scrolls time; range mode is the only exception and must be explicitly entered
3. `zoom test` — wheel zoom, pinch zoom, and double-click fit-all behave identically to a stock LWC setup
4. `timeframe persistence test` — switching timeframe preserves Layer 1 primitives on their time-anchored positions

## Save Setup Range-Mode Interaction

Save Setup is the Day-1 Aha moment and must be reachable within three minutes of first `/terminal` entry.

Flow:

1. user clicks `Save Setup` in the chart header
2. chart enters `range mode`
   - cursor changes to crosshair-with-hint style
   - top-right toast appears: `2점 선택 · ESC 취소`
3. first click anchors the range start
4. second click anchors the range end and renders a Layer 1 rectangle with left/right drag handles for fine adjustment
5. slim strip appears below the chart: `[범위 확정] [Note input] [Save & Open in Lab]`
6. save success removes the strip and leaves a single `Saved ✓ · Open in Lab` line in the right rail
7. `ESC` at any point exits range mode, discards unsaved primitives, and returns the chart to native state

Parallel guarantees during range mode:

- pan (empty-space drag in non-anchor areas) still works
- wheel zoom and pinch zoom still work
- crosshair still tracks
- timeframe switch is allowed; the range rectangle stays anchored in time coordinates

## Surface Spec Summary

### `/terminal`

- chart dominant; phase badge chip visible top-right; range-mode Save as above
- right rail: `Verdict / Why / Risk / Sources` + bottom conclusion strip (`Bias / Action / Invalidation`)
- footer: single prompt input, send, latest AI line only
- left market drawer: opens only from top-bar market button; never a permanent column

### `/lab`

- 3-pane layout: capture/challenge list · challenge definition · evaluation output
- capture merge: shift-click multiple captures in left pane to merge into one challenge definition
- phase ordering in the definition pane is drag-reorderable
- `Evaluate ▶` streams results; `Activate Watch →` is gated by score threshold + explicit confirmation
- instance table rows deep-link back to `/terminal?slug=…&instance=…`

### `/dashboard`

- 4 sections: Signal Alerts, Watching, Saved Setups, My Adapters (placeholder)
- Signal Alerts sorts feedback-pending alerts above judged alerts; pending rows show a red dot badge
- each pending row exposes `agree / disagree` plus a reason chip (`valid / late / noisy / invalid / almost`)
- row click navigates to `/terminal` replay context

### `/` (frozen except one adjustment)

- hero thesis remains as implemented
- 3-step loop visualization below the hero must emphasize the `Judge` step as the product's differentiator (loop closure, not scanner output)

## Cross-Surface Handoff Events

Only these five events move state between surfaces; no other hidden synchronization is allowed.

- `capture.saved` — persisted capture record; consumed by `/lab` recent-captures list
- `challenge.created` — `/terminal?slug=…&instance=…` deep-link payload
- `watch.activated` — persisted watch record; consumed by `/dashboard` Watching section
- `alert.fired` — persisted alert record with feedback-pending state; consumed by `/dashboard` Signal Alerts
- `judgment.recorded` — `agree/disagree + reason` payload; consumed by engine refinement pipeline

## GTM Positioning

Product promise line:

> `스캐너는 많다. 점점 더 정확해지는 스캐너는 없다. 네 복기가 데이터가 된다.`

Drawing-tool absence justification (GTM-facing):

> `TradingView로 그리세요. 저희는 학습시킵니다.`

Core differentiator: user judgment feeds back into the model. This is the only frame that survives competitive comparison with TradingView screeners, CryptoQuant alerts, and generic scanners.

## Activation Funnel

- `A0 landing` — home hero thesis + 3-step loop visualization
- `A1 /terminal entry` — target 80% of A0 within 30s, driven by home start bar
- `A2 chart interaction` — target 60% of A1 within 1m, driven by phase badge curiosity
- `A3 first Save Setup` — Aha; target 30% of A1 within 3m, driven by range-mode UX + sample gif
- `A4 open in lab` — target 10% same day
- `A5 first evaluate` — target 5% within 1 week
- `A6 first judgment` — target 3% within 2 weeks (loop closed)

`A3` is the single primary activation metric.

## Drawing Toolset Decision

This work item does not add drawing tools. Rationale:

- LWC 5.1 does not ship drawing UI; adding a partial set (trendlines only) creates a `half-TradingView` impression that hurts perceived quality
- the product's differentiator is the capture-judge loop, not the drawing editor
- users who need drawing already have TradingView open; our app augments that workflow rather than replacing it

Future decision gate (re-open after 6 months of retention data):

- if drawing is a confirmed retention blocker, choose one of:
  - (A) custom drawing layer on LWC primitives
  - (B) TradingView Charting Library (free with approval)
  - (C) TradingView Advanced Charts (commercial)
- architecture remains open to any of these because Layer 1-2 already reserves the extension surface

## Mapping to Current Branch Refactor

This spec pins down the UX standard; the branch split plan from the phase-0 design session remains the delivery order:

1. phase 1 (docs) already committed
2. phase 2 contracts commit — cross-surface handoff types land here
3. phase 3 engine routes
4. phase 4 app server adapters
5. phase 5 surface UX changes, evaluated against this spec as the Definition of Done

Any surface file touched in phase 5 must pass:

- W-0078 ownership matrix
- this work item's 4-layer chart contract
- the 4 native regression tests
- the handoff event list (no hidden synchronization)

## Exit Criteria

- `/terminal` implements the 4-layer chart architecture and the Save Setup range-mode flow end-to-end
- all 4 native regression tests pass on desktop 1440x900 / 1280x800 and mobile 390x844
- `/lab` supports capture merge, phase reorder, evaluate streaming, and gated watch activation
- `/dashboard` pending-alert feedback loop records a `judgment.recorded` event that reaches engine refinement
- cross-surface state transfer uses only the 5 defined events
- a first-time user can reach `A3` (first Save Setup) within 3 minutes in unassisted testing

## Open Questions

- whether the phase badge should show confidence alongside the phase name, or only the phase (confidence belongs in the conclusion strip)
- whether the range rectangle should snap to candle boundaries or support sub-candle granularity (default: snap to candle for Day-1)
- whether reason chips on `/dashboard` should be single-select or multi-select (default: single-select for refinement clarity)

## Handoff Checklist

- do not reopen this spec for small visual tweaks; route those through W-0078 addenda
- any new chart-adjacent UI must be placed in Layer 1 or Layer 2 per the contract
- any new cross-surface data transfer must either extend the 5-event list in this document or be rejected
- GTM copy updates must preserve the two positioning lines verbatim unless this work item is updated

## Implementation Plan

### Component Tree (Terminal desktop)

```
routes/terminal/+page.svelte
  └ shell/TerminalShell.svelte                        (new; wraps top/chart/rail/footer)
      ├ workspace/SymbolPicker.svelte                 (existing; top bar owner)
      ├ workspace/MarketDrawer.svelte                 (new; left drawer, opens from top)
      ├ workspace/ChartBoard.svelte                   (existing; hosts Layer 0+1+2)
      │   ├ chart/CanvasHost.svelte                   (new; wraps LWC init, exposes api)
      │   ├ chart/primitives/RangePrimitive.ts        (new; Layer 1 range rect + handles)
      │   ├ chart/primitives/PhaseZonePrimitive.ts    (new; Layer 1 phase shading)
      │   ├ chart/overlay/PhaseBadge.svelte           (new; Layer 2 DOM chip)
      │   ├ chart/overlay/RangeModeToast.svelte       (new; Layer 2 hint)
      │   └ chart/ChartHeader.svelte                  (new; TF, indicators, Save button)
      ├ workspace/SaveStrip.svelte                    (new; slim strip below chart pane)
      ├ workspace/TerminalContextPanel.svelte         (existing; right rail)
      │   └ tabs: Verdict | Why | Risk | Sources
      │   └ ConclusionStrip.svelte                    (existing; bias/action/invalidation)
      └ workspace/TerminalBottomDock.svelte           (existing; prompt footer)
```

### State Shape (new store)

```ts
// app/src/lib/stores/chartSaveMode.ts (new)
interface ChartSaveModeState {
  active: boolean;                     // range-mode on/off
  anchorA: number | null;              // unix seconds, first click
  anchorB: number | null;              // unix seconds, second click
  noteDraft: string;
  submitting: boolean;
  lastSavedCaptureId: string | null;
}
```

Store API: `enterRangeMode() · exitRangeMode() · setAnchor(t) · adjustAnchor(which, t) · setNote(s) · save() -> Promise<CaptureId>`. Store never touches LWC directly; CanvasHost subscribes and drives primitives.

### File-Level Diff Plan

New files:
- `app/src/lib/stores/chartSaveMode.ts`
- `app/src/components/terminal/chart/CanvasHost.svelte`
- `app/src/components/terminal/chart/ChartHeader.svelte`
- `app/src/components/terminal/chart/primitives/RangePrimitive.ts`
- `app/src/components/terminal/chart/primitives/PhaseZonePrimitive.ts`
- `app/src/components/terminal/chart/overlay/PhaseBadge.svelte`
- `app/src/components/terminal/chart/overlay/RangeModeToast.svelte`
- `app/src/components/terminal/workspace/SaveStrip.svelte`
- `app/src/components/terminal/workspace/MarketDrawer.svelte`
- `app/src/components/terminal/shell/TerminalShell.svelte`

Modify:
- `app/src/components/terminal/workspace/ChartBoard.svelte` — extract canvas init into CanvasHost; wire Layer 1/2 mounts; keep viewport snapshot helper
- `app/src/components/terminal/workspace/SaveSetupModal.svelte` — retain only as mobile-only path; desktop routes Save flow through SaveStrip
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte` — collapse Metrics tab into Sources; ensure ConclusionStrip persistent
- `app/src/routes/terminal/+page.svelte` — replace ad-hoc layout with `<TerminalShell />`

Delete from default shell (keep files for archive path until W-0088 cleanup):
- `app/src/components/terminal/workspace/CollectedMetricsDock.svelte`
- `app/src/components/terminal/workspace/StructureExplainViz.svelte`
- `app/src/components/terminal/workspace/EvidenceStrip.svelte`
- `app/src/components/terminal/workspace/PatternStatusBar.svelte`

### Acceptance Checklist (DoD)

- range-mode: enter via ChartHeader Save, two clicks set range primitive, ESC exits; pan/zoom/crosshair unaffected during and after
- native regression tests (W-0086 Chart Architecture section) pass on 1440x900 and 1280x800
- SaveStrip appears below chart canvas only, never overlays chart body; `Save & Open in Lab` leads to `/lab?slug=...` with correct seed
- TerminalContextPanel has exactly 4 tabs; ConclusionStrip persistent at rail bottom
- phase badge chip renders with `pointer-events: none` on container and clickable only on chip itself
- primitives survive timeframe switching without re-drawing; verified via test in `terminalController.test.ts`

