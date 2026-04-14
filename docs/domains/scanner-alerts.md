# Domain: Scanner & Alerts

## Goal

Define scanner detection and alert lifecycle contracts used by Day-1 surfaces (`/terminal`, `/lab`, optional dashboard alerts section).

## Scope

- periodic and on-demand market scan orchestration
- pattern matching against saved challenge/pattern conditions
- alert fanout and dedup policy
- manual and automatic feedback capture

## Boundary

- Owns scan/alert lifecycle semantics.
- Does not own terminal/lab/dashboard presentation composition.
- Uses contract-safe payloads for all app-facing alert rendering.

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

## Surface Integration

- Terminal: alert context and evidence drilldown
- Lab: deploy/activate pattern monitoring handoff
- Dashboard: optional signal-alert inbox section

## Non-Goals

- surface-specific UI layout rules
- model-training internals
- ad-hoc client-side score calculation

## Acceptance Checks

- dedup policy is deterministic and documented
- feedback state transitions are explicit and auditable
- app surfaces consume scanner output without schema drift
