# Domain: Terminal

## Goal

Operate as the Day-1 trade-review and capture cockpit:
inspect setups in chart context, save the exact reviewed range, and hand off cleanly into downstream evaluation without leaving `/terminal`.

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
- Owns chart inspection, selected-range save initiation, and the secondary query-to-compose behavior.
- Owns the capture-first registration experience for reviewed examples and replayed instances.
- Owns evidence rendering order and source visibility rules.
- Does not own indicator math, scoring math, or block execution logic.
- Does not replace `/lab` challenge evaluation ownership.

## Inputs

- user query/command text
- reviewed symbol/timeframe/range context
- route/query params (`q`, `slug`, `instance`, symbol, timeframe)
- contract-safe app API payloads for market/evidence/detail tabs
- saved watches/local state needed for return and continuity UX

## Outputs

- rendered board context (left rail, main board, right panel, bottom dock)
- deterministic right-panel tab updates from clicks/actions
- streamed explanation/analysis output
- capture-create handoff requests, secondary challenge-create requests, and lab handoff intents
- preview signals about similar captures and downstream evaluation handoff
- deep-link transitions to `/lab` and back-context handling

## Interaction Contract

Core flow is fixed:

1. Review (main board / replay / surfaced candidate)
2. Validate (chart + right detail panel)
3. Save or hand off (`Save Setup`, `Open in Lab`, or open next surface)

Secondary query/compose behavior may still create a `challenge`, but it must not replace the primary review/capture path.

Terminal must accept three registration modalities:

1. reviewed range only
2. reviewed range + hint/note
3. explicit query/condition input

The first two are primary. The third is helper-oriented.

Right panel must never be empty.
If no asset is selected, render market summary fallback.

## Authority Contract

Terminal may host AI assistance, but authority is split:

- LLM/UI layer: parse and explain
- engine/ML layer: score, match, evaluate, and judge

Terminal must not blur those two roles in copy or contract behavior.
Terminal also must not create a new Day-1 `watch` directly; that activation remains lab-owned.

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

Search seeds may come from:

- free-form query
- reviewed timestamp/range replay
- saved challenge replay

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
- reviewed chart ranges can be captured through the primary save path
- capture-first registration modes are explicit and do not depend on hidden query state
- card/button click-to-tab mapping is deterministic
- right panel never renders blank state
- conclusion strip remains visible across all tabs
- source/evidence ordering follows the terminal evidence contract
