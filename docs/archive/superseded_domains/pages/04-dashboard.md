# Surface Spec: Dashboard (`/dashboard`)

## Role

Day-1 return inbox for user workflow continuity.
Dashboard summarizes state and owns the feedback queue that closes the AutoResearch loop; it does not replace terminal or lab.

Implementation detail for inbox priority, user-facing labels, and agent execution split lives in `docs/product/core-loop-agent-execution-blueprint.md`.
Surface layout and CTA hierarchy detail lives in `docs/product/core-loop-surface-wireframes.md`.

## Core Contract

Exactly four sections:

1. Signal Alerts
2. Watching
3. Saved Setups
4. My Adapters (placeholder)

## Section 1: Signal Alerts

Purpose: surface AutoResearch-generated live alerts and collect the fastest manual judgment signal.

Row requirements:

- alert identity and linked challenge/pattern context
- symbol/timeframe/detected direction or phase summary
- pending/manual/auto judgment state
- open-terminal drilldown action

Row action:

- open the alert in terminal chart context
- record manual feedback (`agree` / `disagree` or equivalent)

Design rules:

- feedback-pending alerts must sort above already judged alerts
- manual feedback and auto outcome must stay distinguishable
- alert review is a core dashboard job, not an optional extension

## Section 2: Watching

Purpose: return to saved terminal contexts.

Row requirements:

- query/context label
- optional symbol/timeframe hints
- live/paused state if available

Row action:

- open terminal with query/replay context

## Section 3: Saved Setups

Purpose: lightweight summary of lab-owned evaluated setup state.

Row requirements:

- setup label or challenge slug/name
- score/last run summary
- status text (recent/never-run)

Row actions:

- open selected setup in lab: `/lab?slug=<challenge>`

## Section 4: My Adapters (Placeholder)

Purpose: reserve Phase-2+ training surface visibility without fake functionality.

Requirements:

- explicit "not available in Day-1" copy
- no fake metrics or non-functional controls

## Data Contracts (Day-1)

- Signal Alerts: scanner/alerts contract with explicit manual vs auto feedback fields
- Watching: client/app storage contract
- Saved Setups: sourced from same challenge summary domain as lab
- Adapters: empty payload + placeholder copy

## Required States

- section with data
- section empty
- section error/degraded (if upstream fetch fails)

Dashboard should remain usable even if one section fails.

## Non-Goals

- No character greeting layer
- No synthetic recap generation without stable pipeline
- No duplicate analysis page behavior from terminal/lab

## Acceptance Checks

- [ ] All four sections render with stable labels and expected order
- [ ] Signal Alerts support feedback-pending prioritization and terminal drilldown
- [ ] Watching rows return to terminal context
- [ ] Saved setup rows route to `/lab?slug=<...>`
- [ ] Adapters section is explicit placeholder, not pseudo-feature
- [ ] Dashboard acts as inbox and preserves return flow actions

## Section Order and Density Rules

- Single-column stacked sections only for Day-1.
- No dense analytics panels that duplicate lab/terminal.
- Keep fast-scan readability over depth.

## Watching Storage Contract (Day-1)

Recommended client key shape:

- storage key: `cogochi.watches`
- item fields: `slug`, `query`, `createdAt`, `lastEvaluatedAt`, `status`

Migration target (Day-2+): promote to shared filesystem/app persistence.

## Empty State Copy Rules

- Signal Alerts empty: explain that alerts appear after lab activation / live monitoring.
- Watching empty: explain how to save from terminal.
- Saved Setups empty: route users to terminal review/capture flow.
- My Adapters empty: explicitly mark Phase-2+ scope.

## Non-Functional Expectations

- Dashboard loads even when one section source fails.
- Section-level fallback UI is preferable to full-page hard failure.

## Settings and Notification Entry (Optional)

Dashboard may expose:

- notification/settings entry
- telegram/notification channel connection status
- alert threshold preferences

These controls are optional in Day-1 and must degrade safely if integrations are unavailable.

## Current Implementation Snapshot

Implemented now:

- dashboard header/workbar with quick actions
- challenge cards populated from local strategy store results
- watching section UI present
- adapters placeholder section present

Partially implemented:

- watching section currently uses hardcoded/static list, not canonical persisted watch contract
- challenge summary behavior is real but sourced from strategy store, not canonical challenge summary API
- signal alert feedback flow exists conceptually in docs/download designs, but is not mounted here as the canonical dashboard queue

Not yet aligned with page contract:

- strict Day-1 four-section contract is not yet met
- data ownership does not fully match lab challenge contracts or scanner alert contracts

## Button Action -> Outcome Contract

### Header / Global Actions

1. `Open Terminal`
   - action: navigate to `/terminal`
   - expected result: terminal opens immediately
   - failure result: navigation failure notice

2. `Open Lab`
   - action: navigate to `/lab`
   - expected result: lab opens immediately
   - failure result: navigation failure notice

### Signal Alerts Actions

1. `Alert row / Open chart`
   - action: navigate to terminal replay/live chart context for the selected alert
   - expected result: user lands in terminal with enough context to inspect the alert
   - failure result: route error notice and dashboard state remains intact

2. `Agree / Disagree`
   - action: persist manual alert feedback
   - expected result: alert state updates from pending to judged without ambiguity
   - failure result: action rolls back with explicit feedback-save error

3. `Filter tab` (if enabled)
   - action: switch between feedback-pending and judged histories
   - expected result: alert list reorders deterministically by selected state
   - failure result: filter resets to last valid state

### Watching Actions

1. `Watch item open`
   - action: navigate to terminal query context
   - expected result: terminal opens seeded context
   - failure result: route error notice

2. `Pause/Resume` (if enabled)
   - action: toggle watch status field
   - expected result: badge/status text updates and persistence updates
   - failure result: toggle rollback with status-save error

3. `Delete watch` (if enabled)
   - action: remove watch item from persistence
   - expected result: row disappears and empty state appears if none remain
   - failure result: deletion error with row restored

### Saved Setups Actions

1. `Setup card/row click`
   - action: navigate to lab with selected context (`/lab?slug=<challenge>` target contract)
   - expected result: selected setup opens in lab detail
   - failure result: route failure notice and dashboard state remains intact

2. `New Setup`
   - action: navigate to `/terminal`
   - expected result: review/capture flow starts in terminal
   - failure result: navigation error notice

### My Adapters Actions

1. `Placeholder CTA` (if present)
   - action: navigate to allowed next-step surface (usually lab or info)
   - expected result: clear expectation setting for Phase-2 scope
   - failure result: no fake success state
