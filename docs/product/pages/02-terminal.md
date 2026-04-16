# Surface Spec: Terminal (`/terminal`)

## Role

Primary Day-1 decision cockpit for observe + compose.
Terminal is the starting point of the product loop.

## Core Contract

Search/query intent must become a saved `challenge` with minimal friction.
Terminal should support:

`find -> validate -> act -> save`

without requiring route changes.

## Layout Contract (Desktop)

1. Command bar (top)
2. Left rail (scan context)
3. Main board (cards/charts/workspace)
4. Right detail panel (5 tabs)
5. Bottom dock (command + event tape + execution strip)

## Layout Contract (Mobile)

Mode-based layout, not compressed desktop columns:

- Workspace
- Command
- Detail sheet

## Right Panel Contract

Five tabs only:

1. Summary
2. Entry
3. Risk
4. Catalysts
5. Metrics

Each tab should end with a visible conclusion strip:

`Bias / Action / Invalidation`

## Interaction Mapping (Deterministic)

- Card body -> Summary
- Entry action -> Entry
- Risk tags -> Risk
- News elements -> Catalysts
- OI/Funding/CVD elements -> Metrics

Do not introduce undocumented click behavior drift.

## Query/Compose Contract

Terminal query is the Day-1 composer surface:

- parse query/chips into structured challenge inputs
- show parse feedback (user-visible intent mapping)
- save as challenge through app route contract

No hidden local-only pseudo-pattern objects.

## Save Challenge Flow

1. User enters query or uses chips/actions
2. UI resolves symbol/timeframe/context
3. Parser returns structured block intent
4. Save action writes challenge artifact through contract route
5. Success state exposes deep link to `/lab?slug=<challenge>`

## Save Setup Flow

`Save Setup` is the chart-range capture path.

It should support:

`inspect -> select range -> auto-capture context -> save`

Minimum contract:

1. User inspects the active chart in `/terminal`
2. User marks the exact chart segment they mean
3. Terminal captures the selected range plus visible chart context
4. Terminal saves a canonical capture record
5. Success state exposes the saved capture or the downstream lab/deep-link

Selected-range payload must include:

- symbol
- timeframe
- selected range start/end
- OHLCV slice for the selected range
- rendered indicator slices for the selected range
- visible pattern context when available
- candidate/transition linkage when the save came from a surfaced pattern candidate

## Data Dependencies

- Analysis/market orchestration endpoints for board + panel data
- Challenge creation route (`wizard`/challenge contract)
- Watching persistence for dashboard handoff

## Required States

- Loading: explicit panel/card placeholders
- Empty: actionable prompts ("start with symbol/query")
- Error/degraded: clear, non-silent fallback
- Stale: freshness indicator when applicable

## Deep Link Contract

- Query seed: `/terminal?symbol=<symbol>&tf=<tf>&q=<query>`
- Replay context: `/terminal?slug=<challenge>&instance=<timestamp>`

## Non-Goals (Day-1)

- No character progression systems
- No detached scanner cockpit route ownership
- No engine scoring/feature logic duplicated in Svelte components

## Acceptance Checks

- [ ] Query -> parse -> save challenge works end-to-end
- [ ] All major card/tag/chart interactions update right panel deterministically
- [ ] Right panel tabs render contract-backed data (not placeholder-only)
- [ ] Conclusion strip is present on all tabs
- [ ] Saved watching context is visible to dashboard

## Board Layout Ratios (Reference)

Desktop target proportions:

- Left rail: ~19% (280-320px)
- Main board: ~56%
- Right panel: ~25% (380-420px)

Main board layouts:

1. Focus (single deep asset)
2. 2x2 Compare (four assets)
3. Hero+3 (one deep + three standard)

## Search System Requirements

Two-tier search must be supported:

1. Quick keyword presets (intent-first)
2. Metric search (indicator-first)

Both must return a unified output shape:

- Summary
- Matches
- Why
- Action
- Risk

## Timeframe Alignment Requirements

Default ladder:

- 15m: execution
- 1H: decision
- 4H: structure
- 1D: background

Rule: do not mix timeframe semantics in one metric row without explicit labels.

## Source-Native Evidence Requirements

Terminal decisions should expose:

- VerdictHeader
- ActionStrip
- EvidenceGrid
- WhyPanel
- CounterEvidenceBlock
- SourceRow
- CitationDrawer

Source categories should remain fixed:

- Market Data
- Derived Metrics
- News
- AI Inference

Selected-range evidence belongs under the same source-native rule:

- save what the user actually inspected on the chart
- do not reduce capture to symbol-only state

## Mobile Requirements

- Terminal mobile uses mode switching, not desktop column compression.
- Detail appears as bottom sheet with same 5-tab contract.
- Terminal-specific command dock remains primary interaction footer.

## Day-1 P0/P1 Alignment Targets

P0:

1. remove synthetic/derived fake percent changes used as substitutes
2. ensure timeframe switch actually triggers store + reload behavior

P1:

1. Entry/Risk/Metrics tabs render real data fields
2. Left-rail movers mapping is connected
3. OI/Funding panels are visible in metrics

## Current Implementation Snapshot

Implemented now:

- desktop shell with left rail + main board + right analysis rail + bottom dock
- mobile active board + command dock + detail sheet
- streaming assistant responses via SSE
- symbol/timeframe driven reload behavior
- analysis/evidence rendering and source pills
- pattern transition/status widgets
- save setup modal mounted in terminal
- `ChartBoard` already exposes a visible-range snapshot helper for save payload generation

Partially implemented:

- query/deep-link hydration from URL (`symbol` works; other query contracts are inconsistent)
- deterministic click-to-tab mapping exists in parts of board/actions but is not fully contract-audited
- watchers handoff to dashboard exists at navigation level but not fully canonicalized via shared watch contract

Not yet aligned with page contract:

- full query composer semantics (`q` seed + parser-hint + save flow parity) are not end-to-end canonical
- wallet intel mode is not yet a complete contract-grade flow in this page
- some right-panel tab data remains mixed between deep data and fallback/derived placeholders
- Save Setup is not yet fully enforced as selected-range capture with auto-collected OHLCV/indicator evidence

## Prompt-Triggered GUI Contract

Terminal input acts as a prompt-triggered GUI:

- token/timeframe/indicator/action chips can inject normalized query tokens
- parser hint line should expose resolved symbol/TF/trigger/confirm intent
- unresolved tokens should be visibly flagged before save/evaluate actions

## Wallet Intel Mode (Scoped)

When wallet-like input is detected (e.g. `0x...`), terminal may enter wallet investigation mode.
Day-1 scope keeps this mode contextual (panel-level) and non-blocking for default terminal flow.

Mode expectations:

- clear mode indicator (`DEFAULT` vs wallet context)
- explicit return path to chart-first mode
- no route ownership split required in Day-1

## Interaction Reliability Requirements

- Starting a new query during active stream should cancel prior stream cleanly.
- On market websocket degradation, UI should show delayed-data status and fallback behavior.
- Save action must prevent invalid parse state and duplicate slug collisions with actionable guidance.

## Keyboard and Power-User Expectations

Recommended baseline shortcuts:

- focus query input
- execute query
- save challenge
- close autocomplete/modal

## Button Action -> Outcome Contract

Define each primary button as:

- trigger (what user clicks)
- action (state/API/navigation)
- expected result (what user sees next)
- failure result (what user sees if it fails)

### Top Command / Header Buttons

1. `Quick intent chip`
   - action: populate/dispatch query intent into terminal command flow
   - expected result: new analysis stream starts, board/rail context updates
   - failure result: inline error ribbon with retry guidance

2. `Layout switch` (`Focus`, `2x2`, `Hero+3`)
   - action: update layout state only (no route change)
   - expected result: main board arrangement switches immediately
   - failure result: previous layout remains; no silent partial state

3. `Clear board`
   - action: clear board assets/verdict/evidence state, reload active symbol baseline
   - expected result: board resets to single-symbol context
   - failure result: visible toast/ribbon; stale cards must not remain mixed

4. `Capture / Save setup` entry
   - action: open save modal seeded with current symbol/timeframe/context
   - expected result: user can confirm metadata and save challenge
   - failure result: modal error message with actionable fix

### Left Rail Buttons

1. `Trending / watch / alert row click`
   - action: select symbol and trigger analysis load
   - expected result: center chart + right rail move to selected symbol context
   - failure result: row remains selectable with explicit load error state

2. `Query chip in left rail`
   - action: dispatch predefined query
   - expected result: same as command submit (new stream + refreshed evidence)
   - failure result: chip-level feedback or top assistant ribbon error

### Main Board Action Buttons

1. `Mini asset card click`
   - action: set active symbol
   - expected result: chart, verdict, evidence, sources switch to that symbol
   - failure result: active highlight does not change; user sees load failure copy

2. `Decision strip cells`
   - action:
     - `Verdict` -> open summary tab
     - `Action` -> open entry tab
     - `Invalidation` -> open risk tab
     - `Confidence` -> open summary tab
   - expected result: right analysis rail opens and lands on mapped tab
   - failure result: tab mapping must never silently drift; fallback to summary

3. `Source pill`
   - action: focus source-aware detail context (summary tab baseline)
   - expected result: user sees source-linked explanation in right rail
   - failure result: source area still visible with degraded placeholder values

### Right Analysis Rail Buttons

1. `Scan-mode asset row`
   - action: set active symbol
   - expected result: detail panel updates to selected symbol verdict/context
   - failure result: row state remains selectable with explicit load error

2. `Back` (scan mode)
   - action: clear multi-asset scan board context
   - expected result: return to baseline focus board state
   - failure result: old scan rows should not remain partially mounted

3. `Rail collapse toggle`
   - action: show/hide right analysis rail
   - expected result: center board expands when hidden and restores when reopened
   - failure result: no broken grid widths or invisible interactive layer

### Bottom Dock Buttons

1. `Send` (command submit)
   - action: submit message/query to terminal message API
   - expected result: SSE stream begins, assistant ribbon/analysis updates progressively
   - failure result: user-visible request failure message (not console-only)

2. `Dock quick chip`
   - action: dispatch chip text as command
   - expected result: identical to manual command submit
   - failure result: chip interaction remains available after error

### Modal Buttons (Save Setup Modal)

1. `Save`
   - action: persist selected-range capture; attach candidate linkage when present and challenge/create fallback only when canonical capture is unavailable
   - expected result: success confirmation + close modal + expose saved capture or downstream lab deep link
   - failure result: field-level or global modal error with retry

2. `Cancel / Close`
   - action: close modal without mutation
   - expected result: return to same terminal board state
   - failure result: no partial save side effects
