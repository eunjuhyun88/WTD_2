# Domain: Terminal

## Goal

Operate as the Day-1 decision cockpit for Observe + Compose:
find setups quickly, validate with evidence, and trigger next actions without leaving `/terminal`.

## Canonical Areas

- `app/src/routes/terminal`
- `app/src/routes/api/cogochi/terminal`
- `app/src/components/terminal`
- `app/src/routes/api/wizard`
- `docs/domains/contracts.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/02-terminal.md`

## Boundary

- Owns terminal presentation shell, interaction mapping, and streaming UX.
- Owns query-to-compose behavior and challenge-save initiation path.
- Owns evidence rendering order and source visibility rules.
- Does not own indicator math, scoring math, or block execution logic.
- Does not replace `/lab` challenge evaluation ownership.

## Inputs

- user query/command text
- route/query params (`q`, `slug`, `instance`, symbol, timeframe)
- contract-safe app API payloads for market/evidence/detail tabs
- saved watches/local state needed for return and continuity UX

## Outputs

- rendered board context (left rail, main board, right panel, bottom dock)
- deterministic right-panel tab updates from clicks/actions
- streamed explanation/analysis output
- challenge-create handoff requests and watch-save intents
- deep-link transitions to `/lab` and back-context handling

## Interaction Contract

Core flow is fixed:

1. Find (main board / quick scan)
2. Validate (right detail panel)
3. Act (bottom dock / save / open next surface)

Right panel must never be empty.
If no asset is selected, render market summary fallback.

## Layout Contract (Desktop)

Target zone model:

- Global header
- Terminal command bar
- Left rail
- Main board
- Right detail panel
- Bottom dock

Preferred proportions:

- left rail ~19%
- main board ~56%
- right panel ~25%

Main board layout modes:

- Focus
- 2x2 Compare
- Hero+3

## Right Panel Contract

Tabs are fixed:

- Summary
- Entry
- Risk
- Catalysts
- Metrics

Every tab includes a persistent conclusion strip:

- Bias
- Action
- Invalidation

If tab data is unavailable, show placeholder values, but do not remove the strip.

## Search Contract

Two-tier search must be supported:

1. Quick keyword presets
2. Metric/indicator search

Unified response shape:

- Summary
- Matches
- Why
- Action
- Risk

## Evidence Contract

Answer-first order is mandatory:

1. Verdict
2. Action
3. Evidence
4. Sources
5. Detail on demand

Source visibility is mandatory in-panel (not hidden behind final click).

## Timeframe Alignment Contract

Default ladder semantics:

- 15m execution
- 1H decision
- 4H structure
- 1D background

When timeframe changes, all relevant board widgets should refresh from the same selected context.

## Mobile Contract

Mobile terminal is mode-based, not desktop-column compression:

- Workspace mode
- Command mode
- Detail mode (bottom sheet with same 5 tabs)

## Related Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/api/wizard/+server.ts`
- `app/src/lib/contracts/challenge.ts`
- `app/src/lib/stores/terminalStore.ts`
- `app/src/components/terminal/TerminalShell.svelte`
- `app/src/components/terminal/DetailPanel.svelte`

## Non-Goals

- feature calculation
- block-level matcher execution
- score math and evaluation ownership
- training/adapter pipeline ownership

## Acceptance Checks

- query submit and deep-link hydration are deterministic
- card/button click-to-tab mapping is deterministic
- right panel never renders blank state
- conclusion strip remains visible across all tabs
- source/evidence ordering follows the terminal evidence contract
