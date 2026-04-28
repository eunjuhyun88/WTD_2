# Cogochi Protocol MVP PRD

**Version**: 1.0  
**Date**: 2026-04-23  
**Status**: Draft  
**Owner**: research

## Product Definition

Cogochi Protocol is a `verified algorithmic engine marketplace` that:

- verifies engine-generated signals
- ranks engines by measured live performance
- qualifies engines for routing
- routes capital across qualified engines
- executes through an external execution rail

## Goal

Build the minimum working protocol layer that proves:

1. engines can publish verifiable signals
2. engine performance can be measured objectively
3. qualified engines can be ranked and routed
4. routing can be connected to execution and settlement

## Non-Goals

- token launch
- DAO governance
- multi-chain deployment
- institutional onboarding
- advanced privacy proofs
- full aggregator layer

## MVP Scope Table

| Module | Must Have | Output |
|---|---|---|
| Engine Registry | engine registration, engine ID, operator mapping, metadata, status, heartbeat | canonical engine identity |
| Signal Attestation | signal schema, commit/reveal or signed publish, timestamp, dedupe, verification | verifiable signal record |
| Outcome Resolution | entry price fixation, TP/SL/timeout rules, price source, outcome finalization | signal outcome + PnL |
| Performance Scoreboard | win/loss/timeout, cumulative PnL, hit rate, Sharpe, MDD, uptime | engine ranking base |
| Eligibility Gate | min history, min signals, quality threshold, inactivity cut, status labeling | engine qualification state |
| Routing Engine | eligible engine set, weight calculation, caps, fallback logic, rebalance trigger | engine allocation weights |
| Execution Adapter | signal -> order conversion, size calculation, order submit, fill tracking | executed position |
| Settlement | realized PnL, perf fee, split logic, accounting update | vault/user/engine balances |
| Visibility Layer | engine page, signal history, scoreboards, vault state, fee history | trust + operator visibility |

## Functional Requirements

### 1. Engine Registry

**Requirement**  
System must support engine identity and status as a first-class protocol object.

**Must support**

- register engine
- pause engine
- deactivate engine
- heartbeat update
- engine metadata retrieval
- engine status retrieval

**Done when**

- a new engine can be created and queried by `engineId`
- inactive engines are distinguishable from active ones
- operator ownership is explicit

### 2. Signal Attestation

**Requirement**  
System must verify that a signal was published by a registered engine at a specific time.

**Must support**

- standard signal payload
- signal ID generation
- commit submission
- reveal submission
- reveal verification
- duplicate rejection
- invalid reveal rejection

**Done when**

- a signal can move from `committed -> revealed -> verified`
- tampered or malformed reveals are rejected
- each signal has a stable ID

### 3. Outcome Resolution

**Requirement**  
System must resolve each verified signal into a measurable outcome.

**Must support**

- entry price snapshot
- valid-until logic
- TP hit detection
- SL hit detection
- timeout handling
- realized PnL computation

**Done when**

- each verified signal can be resolved into `win / loss / timeout`
- PnL is machine-computed, not operator-reported

### 4. Performance Scoreboard

**Requirement**  
System must aggregate signal outcomes into engine-level performance.

**Must support**

- total signals
- wins / losses / timeouts
- cumulative PnL
- hit rate
- rolling Sharpe
- max drawdown
- uptime score
- ranking query

**Done when**

- engines can be ordered by protocol-defined metrics
- engine history is reproducible from signal outcomes

### 5. Eligibility Gate

**Requirement**  
System must decide whether an engine is eligible for routing.

**Must support**

- minimum live history
- minimum signal count
- minimum quality threshold
- max drawdown threshold
- inactivity detection
- slashed engine exclusion

**Status labels**

- `warming_up`
- `eligible`
- `ineligible`

**Done when**

- the router can query an engine's eligibility state without manual judgment

### 6. Routing Engine

**Requirement**  
System must convert verified engine performance into allocation weights.

**Must support**

- eligible engine selection
- weight calculation
- engine cap
- rebalance trigger
- no-engine fallback
- single-engine fallback
- slashed engine zeroing

**Done when**

- a vault can request current target weights and receive a deterministic allocation map

### 7. Execution Adapter

**Requirement**  
System must translate routing decisions into executable orders.

**Must support**

- position sizing
- signal -> order payload mapping
- venue adapter integration
- order submit
- fill tracking
- close logic
- failure handling

**Done when**

- a qualified signal can result in a real or shadow position with execution records

### 8. Settlement

**Requirement**  
System must finalize economic results after a trade closes.

**Must support**

- realized PnL
- fee base calculation
- performance fee charge
- engine / protocol split
- user accounting update
- settlement event log

**Done when**

- closed positions update balances and fee records deterministically

### 9. Visibility Layer

**Requirement**  
System must make verification and routing legible to users and operators.

**Must support**

- engine profile
- signal history
- signal verification state
- performance dashboard
- eligibility reason
- vault allocation view
- execution history
- fee history

**Done when**

- users can answer:
  - which engines exist?
  - which are verified?
  - which are eligible?
  - why is capital routed this way?
  - what performance and fees were realized?

## User Stories

### Engine Operator

- As an operator, I want to register my engine so the protocol can track my signals and performance.
- As an operator, I want my signals to be verifiable so my track record is trusted.
- As an operator, I want eligibility and ranking to depend on measurable outcomes, not discretionary curation alone.

### Subscriber / Capital Provider

- As a user, I want to see which engines are actually verified before routing capital.
- As a user, I want the vault to allocate toward qualified engines automatically.
- As a user, I want fees charged only when value is actually created.

### Protocol Operator

- As a protocol admin, I want bad engines to be disqualified or slashed.
- As a protocol admin, I want routing policy and risk caps to be enforceable.
- As a protocol admin, I want transparent logs for disputes, audit, and analytics.

## MVP Acceptance Test

The MVP is considered working only if this full flow works end-to-end:

1. engine is registered
2. engine stake/status is active
3. engine publishes a committed signal
4. engine reveals the signal
5. protocol verifies the reveal
6. protocol resolves outcome
7. scoreboard updates
8. eligibility updates
9. router computes weights
10. execution adapter receives routed order
11. position closes
12. settlement is applied
13. user and operator dashboards show the result

## Prioritization

### Phase 1 — Verification Marketplace

**Ship first**

- Engine Registry
- Signal Attestation
- Outcome Resolution
- Scoreboard
- Leaderboard
- Eligibility State

### Phase 2 — Shadow Router

**Ship second**

- deterministic weight engine
- rebalance logic
- paper allocation
- simulated settlement
- operator visibility

### Phase 3 — Live Vault

**Ship third**

- deposit / redeem
- execution venue adapter
- live settlement
- performance fee split
- vault accounting

## Should Have

| Module | Should Have |
|---|---|
| Slashing | offense reports, slash execution, slash log |
| Risk Controls | max leverage, max position, daily loss halt, emergency pause |
| Auditability | ranking history, signal proof explorer, allocation trace |
| Onboarding UX | engine apply flow, qualification checklist, eligibility reason UI |

## Later

| Module | Later |
|---|---|
| Governance | token, ve model, DAO, treasury votes |
| Privacy | TEE, zk attestation, private signal proofs |
| Advanced Routing | risk parity, correlation adjustment, multi-vault allocator |
| Institutional Layer | KYC, accredited access, reporting wrappers |
