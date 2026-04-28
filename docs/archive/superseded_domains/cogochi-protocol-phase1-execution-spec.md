# Cogochi Protocol — Phase 1 Execution Spec

**Version**: 1.0  
**Date**: 2026-04-23  
**Status**: Draft  
**Owner**: research

## 1. Phase 1 Purpose

Phase 1 is not "the full protocol."  
Phase 1 is the smallest version of Cogochi that proves:

- engines can be identified
- signals can be attested
- outcomes can be resolved objectively
- engines can be ranked by protocol-owned logic

If Phase 1 fails, later vault and token layers should not ship.

## 2. Phase 1 Product Definition

Phase 1 is a **verified engine marketplace**.

It is not yet:

- a full capital product
- a multi-vault allocator
- a governance product
- an institution-facing wrapper

The question Phase 1 answers is:

`Can the protocol create trust around engine quality before it routes user capital?`

## 3. Required Components

Phase 1 includes six required components.

### 3.1 Engine Registry

The protocol must maintain a canonical engine record.

Required fields:

- `engineId`
- `operator`
- `metadata`
- `stakeStatus`
- `engineStatus`
- `registeredAt`
- `lastHeartbeatAt`

Minimum engine states:

- `active`
- `paused`
- `slashed`
- `deactivated`

### 3.2 Signal Attestation

The protocol must support a standard signal payload and a verifiable publish flow.

Required payload fields:

- `engineId`
- `asset`
- `direction`
- `tpBps`
- `slBps`
- `validUntil`
- `nonce`

Required lifecycle:

1. engine commits signal hash
2. engine reveals payload
3. protocol verifies payload against commit
4. signal becomes `verified`

Minimum signal states:

- `committed`
- `revealed`
- `verified`
- `invalid`
- `expired`
- `resolved`

### 3.3 Outcome Resolver

The protocol must transform verified signals into objective outcomes.

Required outcome fields:

- `signalId`
- `entryPrice`
- `exitPrice`
- `exitReason`
- `pnlBps`
- `resolvedAt`

Minimum exit reasons:

- `tp_hit`
- `sl_hit`
- `timeout`

### 3.4 Performance Scoreboard

The protocol must aggregate resolved signals into engine-level performance.

Required metrics:

- `totalSignals`
- `wins`
- `losses`
- `timeouts`
- `cumulativePnLBps`
- `rollingSharpe`
- `maxDrawdown`
- `uptimeScore`

### 3.5 Eligibility Service

Phase 1 should already decide whether an engine is potentially routeable later.

Minimum labels:

- `warming_up`
- `eligible`
- `ineligible`

Minimum qualification checks:

- minimum live history
- minimum signal count
- minimum quality threshold
- max drawdown threshold
- inactivity threshold

### 3.6 Marketplace Visibility

Users and operators must be able to inspect:

- engine profile
- signal history
- signal verification state
- scoreboard
- eligibility state

Without this surface, the marketplace does not build trust.

## 4. Phase 1 End-To-End Demo

Phase 1 is only considered real if the following flow works end-to-end.

1. operator registers Engine A
2. Engine A becomes `active`
3. Engine A submits a signal commit
4. Engine A reveals the signal
5. protocol verifies the reveal
6. signal entry price is fixed
7. signal reaches TP, SL, or timeout
8. outcome is resolved
9. Engine A scoreboard updates
10. Engine A eligibility state updates
11. product UI shows the engine, signal, outcome, and updated rank

This is the non-negotiable Phase 1 demo.

## 5. Contract Requirements

Even if early implementation uses shadow services or off-chain helpers, the interface should already be contract-shaped.

Required contract surfaces:

- `registerEngine`
- `pauseEngine`
- `heartbeatEngine`
- `commitSignal`
- `revealSignal`
- `resolveSignal`
- `getEngineStats`
- `getEligibilityState`

The implementation may be staged. The interface should not be ad hoc.

## 6. Data Requirements

Phase 1 requires durable records for:

- engines
- signal commits
- signal reveals
- signal outcomes
- engine performance snapshots
- eligibility snapshots

Recommended storage principle:

- protocol truth must be append-safe and auditable
- no critical state should exist only in process memory

## 7. Failure Modes

Phase 1 must explicitly handle the following failure cases.

### 7.1 Missing reveal

If commit occurs and reveal never happens:

- signal becomes `expired`
- signal cannot count as a successful verified record
- inactivity or reliability penalty may apply

### 7.2 Invalid reveal

If reveal does not match commit:

- signal becomes `invalid`
- event is recorded
- engine may be flagged for offense review

### 7.3 Unresolvable outcome

If price source is stale or unavailable:

- signal remains unresolved
- failure reason is explicit
- manual or fallback policy is defined

### 7.4 Engine inactivity

If heartbeat or publish cadence drops below threshold:

- engine becomes `ineligible`
- later router layers must not rely on it

## 8. Out Of Scope For Phase 1

Phase 1 does not need to include:

- live user deposits
- real capital routing
- Hyperliquid execution
- fee settlement
- token rewards
- DAO governance
- institutional wrapper

These belong to later phases.

## 9. Success Criteria

Phase 1 succeeds when:

1. at least one engine can build a trusted protocol-visible history
2. that history is based on attested and resolved signals, not self-reported screenshots
3. the protocol can produce a credible leaderboard
4. the protocol can classify an engine as eligible or not eligible for future routing

The output of Phase 1 is not TVL.  
The output of Phase 1 is **trustable engine quality data**.

## 10. Build Sequence

### Slice A — Engine Identity

- registry schema
- engine status transitions
- heartbeat

### Slice B — Signal Attestation

- payload schema
- commit path
- reveal path
- verification

### Slice C — Outcome Resolution

- price source abstraction
- TP / SL / timeout rules
- outcome persistence

### Slice D — Scoreboard

- aggregate metrics
- leaderboard read model

### Slice E — Eligibility

- qualification policy
- eligibility labels
- explanation surface

### Slice F — Product Visibility

- engine profile page
- signal history
- scoreboards
- eligibility UI

## 11. Exit Gate To Phase 2

Phase 2 should only begin when Phase 1 can answer all of these:

- Which engines exist?
- Which engines are active?
- Which signals were genuinely published?
- Which signals resolved profitably?
- Which engines are consistently strong enough to route capital to?

If Phase 1 cannot answer those questions reliably, the router should not exist yet.
