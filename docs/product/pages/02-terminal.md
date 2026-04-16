# Surface Spec: Terminal (`/terminal`)

## Role

Primary Day-1 trade-review and capture cockpit.
Terminal is the starting point of the product loop because the trader inspects the real chart here, marks the exact segment they mean, and turns that review into durable saved evidence.

Implementation detail for component priority, action-state contracts, and multi-agent work split lives in `docs/product/core-loop-agent-execution-blueprint.md`.
Surface layout and CTA hierarchy detail lives in `docs/product/core-loop-surface-wireframes.md`.

## Core Contract

Terminal owns the first human action in the loop:

`review -> inspect -> select range -> Save Setup`

This is the canonical path that turns trader judgment into reusable product data.

Terminal may also support a secondary query/composer path:

`find -> validate -> act -> save challenge`

The query/challenge path must not redefine the primary job of the page.

## Trade Review Contract

The canonical Terminal use case starts from a real trade review or a live chart segment under inspection.

Minimum user-visible flow:

1. User opens the symbol and timeframe they are reviewing
2. User inspects chart structure together with OI, funding, volume, and other context
3. User marks the exact chart segment that expresses the setup thesis
4. User optionally writes a short note describing why that range matters
5. User presses `Save Setup`
6. Terminal persists a canonical capture record that can later drive pattern definition, similar-capture recall, and labeling

Design rule:

- the saved artifact is the reviewed chart segment, not a generic symbol bookmark
- `Save Setup` is the core-loop entry event, not a secondary convenience action
- if the user cannot identify and save the exact range they mean, the product has not captured the review correctly

## Pattern Registration Modes

Day-1 Terminal must support three ways to start the loop:

1. `Replay capture`
   - user opens a symbol/timeframe and reviews a known historical or live segment
   - user selects the exact range and saves it as a capture
   - this is the primary Day-1 path

2. `Replay + hint`
   - user starts from a reviewed range plus a short thesis note
   - example: "OI spike + funding flip + higher lows"
   - terminal stores the range and the hint together so later retrieval/refinement has both structure and narrative

3. `Explicit condition/query`
   - user types a query/chip sequence that can be parsed into challenge conditions
   - example: `btc 4h recent_rally + bollinger_expansion`
   - this remains supported, but it is secondary to reviewed-range capture

Design rule:

- the first two modes begin from trader memory and chart evidence
- the third mode begins from structured intent
- all three may converge on the same downstream challenge/pattern artifact, but only the capture-first modes are canonical loop entry

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

## Secondary Query/Compose Contract

Terminal query is the Day-1 composer surface:

- parse query/chips into structured challenge inputs
- show parse feedback (user-visible intent mapping)
- save as challenge through app route contract

No hidden local-only pseudo-pattern objects.

## LLM and Decision Boundary

Terminal may use AI to help the user understand and structure what they are seeing, but it must not pretend the AI is the final trading judge.

Allowed LLM roles:

- parse natural language into structured challenge intent
- summarize why a reviewed chart range may matter
- explain engine/ML output in trader language

Disallowed LLM roles:

- final entry/exit scoring authority
- non-deterministic replacement for engine pattern matching
- hidden client-side rule generation that bypasses canonical contracts

Day-1 rule:

- deterministic scoring, pattern matching, and evaluation authority stay in engine/ML contracts
- terminal is the place where those results are inspected, challenged, and captured

## Secondary Save Challenge Flow

1. User enters query or uses chips/actions
2. UI resolves symbol/timeframe/context
3. Parser returns structured block intent
4. Save action writes challenge artifact through contract route
5. Success state exposes deep link to `/lab?slug=<challenge>`

## Save Setup Flow

`Save Setup` is the chart-range capture path.
It is the primary Day-1 entry path of the core loop.

It should support:

`inspect -> select range -> auto-capture context -> save`

Minimum contract:

1. User inspects the active chart in `/terminal` from a real trade review, replay, or live surfaced candidate
2. User marks the exact chart segment they mean
3. Terminal captures the selected range plus visible chart context
4. Terminal may attach a free-form research note describing the thesis for that exact range
5. Terminal may preview similar saved captures using both chart-shape evidence and note overlap
6. Terminal saves a canonical capture record that becomes durable ground truth for future retrieval, judgment, and refinement
7. Success state exposes the saved capture or the downstream lab/deep-link

Terminal should also make the downstream use of the capture legible:

- what reviewed range was saved
- what note/thesis was attached
- whether similar captures already exist
- whether the save can be projected into a challenge for lab evaluation

Selected-range payload must include:

- symbol
- timeframe
- selected range start/end
- OHLCV slice for the selected range
- rendered indicator slices for the selected range
- visible pattern context when available
- candidate/transition linkage when the save came from a surfaced pattern candidate
- optional free-form research note authored against that exact chart segment

## AutoResearch Preview Contract

Terminal is not the primary place for full evaluation or long-running monitoring setup, but it should preview what AutoResearch can do with a saved setup.

Expected preview behaviors:

- show similar saved captures for the current reviewed range
- show whether the reviewed setup maps to known pattern/runtime context
- show lightweight "next step" hints such as:
  - `open in lab for evaluation`
  - `already active in watching`
  - `candidate-linked capture`

Non-goals for the preview:

- no fake backtest metrics rendered without lab evaluation
- no hidden auto-activation of live monitoring
- no local-only similarity logic that diverges from the canonical capture substrate
## Data Dependencies

- Analysis/market orchestration endpoints for board + panel data
- Capture creation route for canonical selected-range saves
- Challenge creation route (`wizard`/challenge contract)
- Similar-capture lookup for preview and recall
- Watching persistence for dashboard handoff

## Required States

- Loading: explicit panel/card placeholders
- Empty: actionable prompts ("start with symbol/query or replay a reviewed setup")
- Error/degraded: clear, non-silent fallback
- Stale: freshness indicator when applicable

## Deep Link Contract

- Query seed: `/terminal?symbol=<symbol>&tf=<tf>&q=<query>`
- Replay context: `/terminal?slug=<challenge>&instance=<timestamp>`
- Reviewed-range replay may later add explicit range query params, but the canonical Day-1 replay contract remains challenge + instance based

## Non-Goals (Day-1)

- No character progression systems
- No detached scanner cockpit route ownership
- No engine scoring/feature logic duplicated in Svelte components

## Acceptance Checks

- [ ] Review -> inspect -> select range -> Save Setup works end-to-end
- [ ] Replay capture, replay + hint, and explicit query modes are all understandable without redefining the primary job of the page
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

Search may also start from historical example intent:

- symbol + reviewed date/time
- symbol + reviewed date/time + hint
- saved challenge replay

The UI should treat these as valid seeds, not only free-form keyword queries.

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
- `Save Setup` can reuse saved chart-range evidence plus note text to preview similar captures before save

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
- Save action must prevent missing range selection, invalid parse state, and duplicate slug collisions with actionable guidance.

## Keyboard and Power-User Expectations

Recommended baseline shortcuts:

- focus query input
- execute query
- save setup / save challenge depending on current mode
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
   - expected result: user can confirm selected range and context, then save a canonical capture
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
