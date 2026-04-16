# Domain: Scanner & Alerts

## Goal

Define the AutoResearch scan, monitoring, alert, and feedback lifecycle used by the Day-1 surfaces (`/terminal`, `/lab`, `/dashboard`).

## Scope

- periodic and on-demand market scan orchestration
- pattern matching against saved capture/challenge/pattern conditions
- alert fanout and dedup policy
- manual and automatic feedback capture
- monitoring activation handoff from lab into live alert delivery

## Boundary

- Owns scan/alert lifecycle semantics.
- Does not own terminal/lab/dashboard presentation composition.
- Uses contract-safe payloads for all app-facing alert rendering.

## Capture-First Lifecycle

Day-1 scanner/alerts behavior must fit this sequence:

1. terminal saves durable capture evidence
2. lab evaluates the linked challenge/pattern and activates monitoring
3. scanner watches the market for matching structure
4. alerts surface back to dashboard/terminal
5. manual or automatic judgment is recorded
6. judged feedback becomes refinement input for AutoResearch

The scanner is not a standalone Day-1 cockpit.
It is the market-wide expansion engine for saved trader judgment.

## Core Contracts

### Signal Snapshot

Scanner output payloads should include:

- symbol/timeframe/timestamp
- alpha/regime-level summaries
- selected layer metrics required by downstream UI
- integrity/version metadata when available

### Scheduling

- periodic scan interval (default cadence)
- optional manual trigger with cooldown policy
- rate-limit-safe batching strategy

### Alert Dedup

- suppress repeated pattern+symbol alerts within configured cooldown window
- allow exception only when significant score/regime shift threshold is exceeded

### Alert Feedback

Required fields:

- alert identity
- manual response (`agree`/`disagree` or equivalent)
- auto judgment (`hit`/`miss`/`void` or equivalent)
- feedback source (`manual`/`auto`)

Manual feedback should override auto label when both exist.

### Monitoring Activation

Required inputs for live monitoring:

- challenge/pattern identity
- watch status (`live` / `paused`)
- delivery targets
- activation timestamp

Activation authority:

- lab is the canonical surface for starting monitoring from evaluated context
- dashboard may pause/resume or review results, but should not invent monitoring semantics client-side

## Surface Integration

- Terminal: alert context drilldown and capture-quality inspection
- Lab: evaluation plus monitoring activation handoff
- Dashboard: signal-alert inbox and fast feedback queue

## Non-Goals

- surface-specific UI layout rules
- model-training internals
- ad-hoc client-side score calculation

## Acceptance Checks

- dedup policy is deterministic and documented
- feedback state transitions are explicit and auditable
- monitoring activation and dashboard feedback ownership are explicit
- app surfaces consume scanner output without schema drift
