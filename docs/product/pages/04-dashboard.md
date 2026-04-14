# Surface Spec: Dashboard (`/dashboard`)

## Role

Day-1 return inbox for user workflow continuity.
Dashboard summarizes state; it does not replace terminal or lab.

## Core Contract

Exactly three sections:

1. My Challenges
2. Watching
3. My Adapters (placeholder)

## Section 1: My Challenges

Purpose: lightweight summary of lab-owned challenge state.

Row requirements:

- challenge slug/name
- score/last run summary
- status text (recent/never-run)

Row action:

- open selected challenge in lab: `/lab?slug=<challenge>`

## Section 2: Watching

Purpose: return to saved terminal contexts.

Row requirements:

- query/context label
- optional symbol/timeframe hints
- live/paused state if available

Row action:

- open terminal with query/replay context

## Section 3: My Adapters (Placeholder)

Purpose: reserve Phase-2+ training surface visibility without fake functionality.

Requirements:

- explicit "not available in Day-1" copy
- no fake metrics or non-functional controls

## Data Contracts (Day-1)

- Challenges: sourced from same challenge summary domain as lab
- Watching: client/app storage contract
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

- [ ] All three sections render with stable labels and expected order
- [ ] Challenge rows route to `/lab?slug=<...>`
- [ ] Watching rows return to terminal context
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

- My Challenges empty: route users to terminal compose flow.
- Watching empty: explain how to save from terminal.
- My Adapters empty: explicitly mark Phase-2+ scope.

## Non-Functional Expectations

- Dashboard loads even when one section source fails.
- Section-level fallback UI is preferable to full-page hard failure.

## Optional Section Extension: Signal Alerts

Day-1 baseline remains three sections.
If alert backend and feedback workflow are available, a fourth section may be enabled:

4. Signal Alerts

Signal Alerts section contract (optional):

- prioritize feedback-pending alerts
- provide explicit manual feedback actions (`agree`/`disagree` or equivalent)
- support chart/open-terminal drilldown
- distinguish manual vs auto-judged outcomes

If not enabled, dashboard must not imply missing alert functionality.

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

Not yet aligned with page contract:

- strict Day-1 three-section contract is visually close, but data ownership does not fully match lab challenge contracts
- optional Signal Alerts section is not mounted as canonical section in this page

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

### My Challenges Actions

1. `Challenge card/row click`
   - action: navigate to lab with selected context (`/lab?slug=<challenge>` target contract)
   - expected result: selected challenge opens in lab detail
   - failure result: route failure notice and dashboard state remains intact

2. `New Challenge`
   - action: navigate to `/terminal`
   - expected result: compose flow starts in terminal
   - failure result: navigation error notice

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

### My Adapters Actions

1. `Placeholder CTA` (if present)
   - action: navigate to allowed next-step surface (usually lab or info)
   - expected result: clear expectation setting for Phase-2 scope
   - failure result: no fake success state
