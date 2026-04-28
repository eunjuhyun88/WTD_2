# Cogochi Protocol — Epics And Tickets

**Version**: 1.0  
**Date**: 2026-04-23  
**Status**: Draft execution backlog  
**Owner**: research

## Purpose

Translate the protocol MVP PRD into a concrete build order that can later be assigned to `contract`, `engine`, `app`, and `research` work items.

This document does not claim the protocol is already implemented. It defines the backlog required to make the protocol real.

## Milestone Map

| Milestone | Outcome | Why It Exists |
|---|---|---|
| M0 | protocol contract grounding | lock interfaces, states, and demo path before implementation |
| M1 | verified engine marketplace | prove engine identity, signal attestation, and ranking |
| M2 | shadow router | prove that ranking can become deterministic capital weights |
| M3 | live vault execution | prove end-to-end routing, execution, and settlement |

## M0 — Protocol Contract Grounding

### Epic M0-E1: Canonical Object Model

**Goal**
Define the minimum protocol objects and their state transitions.

**Tickets**

- M0-T1: define `Engine` object schema
- M0-T2: define `SignalCommit` and `SignalReveal` schema
- M0-T3: define `SignalOutcome` schema
- M0-T4: define `EnginePerformance` schema
- M0-T5: define `EngineEligibility` schema
- M0-T6: define `VaultAllocation` schema

### Epic M0-E2: State Machine Definitions

**Goal**
Make the protocol lifecycle explicit before implementation.

**Tickets**

- M0-T7: define engine status state machine
- M0-T8: define signal lifecycle state machine
- M0-T9: define eligibility transition rules
- M0-T10: define vault execution lifecycle

### Epic M0-E3: Demo Contract

**Goal**
Specify the one end-to-end flow that must work for MVP sign-off.

**Tickets**

- M0-T11: define MVP demo path
- M0-T12: define acceptance checks
- M0-T13: define failure-path checks

## M1 — Verified Engine Marketplace

### Epic M1-E1: Engine Registry

**Owner lane**
`contract`

**Goal**
Give each engine a canonical identity and status.

**Tickets**

- M1-T1: implement engine registration interface
- M1-T2: implement operator ownership rules
- M1-T3: implement engine metadata storage
- M1-T4: implement engine status transitions
- M1-T5: implement heartbeat recording
- M1-T6: expose engine query/read endpoints

### Epic M1-E2: Signal Attestation

**Owner lane**
`contract`

**Goal**
Verify that a signal was published by a valid engine at a specific time.

**Tickets**

- M1-T7: finalize standard signal payload
- M1-T8: implement signal ID / hash rules
- M1-T9: implement commit submission path
- M1-T10: implement reveal submission path
- M1-T11: implement reveal verification logic
- M1-T12: reject duplicate or malformed signals

### Epic M1-E3: Outcome Resolution

**Owner lane**
`contract`

**Goal**
Resolve verified signals into outcomes and measurable PnL.

**Tickets**

- M1-T13: define entry price fixation policy
- M1-T14: define TP / SL / timeout logic
- M1-T15: integrate price source abstraction
- M1-T16: implement signal resolver
- M1-T17: record outcome and realized PnL

### Epic M1-E4: Scoreboard And Ranking

**Owner lane**
`engine` or `contract`, depending on final architecture

**Goal**
Convert signal outcomes into engine-level performance.

**Tickets**

- M1-T18: aggregate wins / losses / timeouts
- M1-T19: aggregate cumulative PnL
- M1-T20: compute rolling Sharpe
- M1-T21: compute max drawdown
- M1-T22: compute uptime / inactivity score
- M1-T23: expose leaderboard read model

### Epic M1-E5: Eligibility Gate

**Owner lane**
`engine`

**Goal**
Decide which engines are routeable.

**Tickets**

- M1-T24: define qualification thresholds
- M1-T25: implement warming-up state
- M1-T26: implement eligible / ineligible transitions
- M1-T27: exclude inactive engines
- M1-T28: exclude slashed engines
- M1-T29: expose eligibility reason surface

### Epic M1-E6: Marketplace Visibility

**Owner lane**
`app`

**Goal**
Make the marketplace legible to users and operators.

**Tickets**

- M1-T30: engine profile screen
- M1-T31: signal history view
- M1-T32: verification state badges
- M1-T33: leaderboard page
- M1-T34: eligibility explanation UI

## M2 — Shadow Router

### Epic M2-E1: Routing Policy

**Owner lane**
`engine`

**Goal**
Turn qualification and performance into weights.

**Tickets**

- M2-T1: implement eligible engine selection
- M2-T2: implement Sharpe-based weight calculation
- M2-T3: implement max-engine cap
- M2-T4: implement single-engine fallback
- M2-T5: implement no-engine fallback
- M2-T6: implement rebalance trigger rules

### Epic M2-E2: Shadow Allocation

**Owner lane**
`engine`

**Goal**
Prove routing logic before risking live capital.

**Tickets**

- M2-T7: simulate vault capital allocation
- M2-T8: simulate per-signal sizing
- M2-T9: record hypothetical fills and PnL
- M2-T10: compare engine-only vs routed portfolio

### Epic M2-E3: Router Visibility

**Owner lane**
`app`

**Goal**
Explain why the router is allocating the way it is.

**Tickets**

- M2-T11: allocation weights view
- M2-T12: rebalance history view
- M2-T13: qualification-to-weight trace
- M2-T14: shadow performance dashboard

## M3 — Live Vault Execution

### Epic M3-E1: Vault Accounting

**Owner lane**
`contract`

**Goal**
Manage deposits, shares, and user accounting.

**Tickets**

- M3-T1: implement deposit flow
- M3-T2: implement redeem flow
- M3-T3: implement share accounting
- M3-T4: implement HWM accounting policy

### Epic M3-E2: Execution Adapter

**Owner lane**
`engine` plus integration lane

**Goal**
Turn routed signals into executed positions on the target venue.

**Tickets**

- M3-T5: define order payload mapping
- M3-T6: implement venue adapter client
- M3-T7: implement order submit / retry logic
- M3-T8: implement fill tracking
- M3-T9: implement close logic
- M3-T10: implement execution failure handling

### Epic M3-E3: Settlement And Fee Split

**Owner lane**
`contract`

**Goal**
Close the economic loop after a trade exits.

**Tickets**

- M3-T11: compute realized PnL
- M3-T12: compute performance fee
- M3-T13: split fees across engine / protocol
- M3-T14: update balances and settlement records
- M3-T15: expose settlement history

## Priority Filters

### Must land before M1 demo

- M0-T1 through M0-T13
- M1-T1 through M1-T29

### Must land before M2 demo

- all M1 tickets
- M2-T1 through M2-T14

### Must land before M3 demo

- all M2 tickets
- M3-T1 through M3-T15

## Definition Of Done

### Marketplace MVP done when

- at least one engine can register
- that engine can publish verified signals
- those signals can resolve into measurable outcomes
- the engine can appear on a scoreboard
- the engine can become `eligible`

### Shadow Router done when

- the system can convert live engine stats into deterministic weights
- the shadow portfolio can be tracked over time
- users can inspect why weights changed

### Live Vault done when

- deposits can be routed into executed positions
- positions can settle
- fees can be split and recorded
- the full trace is visible in the product
