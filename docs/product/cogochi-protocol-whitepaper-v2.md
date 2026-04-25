# Cogochi Protocol — Whitepaper v2

**Version**: 2.2  
**Date**: 2026-04-23  
**Status**: Investor-facing draft  
**Authors**: Cogochi team

> **Abstract** — Cogochi Protocol is a machine-native verification and routing layer for algorithmic trading engines. Instead of copying individual human traders, Cogochi creates a marketplace where engines stake, publish attested signals, build verified performance history, and become eligible for automated capital routing. Phase 1 focuses on the verified engine marketplace. Phase 2 adds a router vault that allocates capital across qualified engines and executes on Hyperliquid. Phase 3 expands toward multi-vault aggregation and broader institutional access.

## 1. Category Definition

Cogochi should not be understood as:

- another copy trading exchange
- another generic vault protocol
- another black-box AI signal seller

Cogochi is best understood as:

- a **verified algorithmic engine marketplace**
- a **signal verification layer**
- a future **capital routing layer** for machine-generated trading strategies

The category shift matters. Traditional copy trading marketplaces rank humans. Generic vault protocols wrap managers. Cogochi is designed to rank and route **engines**.

## 2. Problem

Most copy trading systems share three structural weaknesses.

### 2.1 Human concentration risk

Performance is attached to individual traders. When the trader disappears, burns out, or fails to adapt to a new regime, the strategy degrades.

### 2.2 Weak signal verification

Off-chain signal channels can easily overstate historical performance. Even on-chain vaults typically expose execution results without exposing how decisions were produced.

### 2.3 Single-manager fragility

Most products route users into one manager, one trader, or one opaque strategy. Diversification of signal origin is weak or absent.

## 3. Why Now

Three conditions make this category timely.

1. Retail and crypto-native capital already understand copy trading, vaults, and performance sharing.
2. Algorithmic engines are becoming more reproducible, testable, and automatable than discretionary trader channels.
3. Execution rails such as Hyperliquid make it possible to separate signal generation from execution infrastructure.

In short: the market already understands the demand surface, but the verification layer is missing.

## 4. Market Positioning

Cogochi competes asymmetrically.

### 4.1 Substitute competitors

Copy trading exchanges such as Bitget solve the same user desire: "follow something that may trade better than I can." They are the closest substitute for end users.

### 4.2 Adjacent competitors

Vault platforms such as dHEDGE or Enzyme provide portfolio wrappers and manager infrastructure. They overlap at the vault layer, but not at the engine verification and ranking layer.

### 4.3 Complements

Execution venues such as Hyperliquid are complements, not primary competitors. Cogochi does not aim to replace execution rails. It aims to become the intelligence and routing layer above them.

### 4.4 Core wedge

Cogochi's wedge is not "better AI trading." It is:

- **engine attestation**
- **engine ranking**
- **engine eligibility**
- **capital routing across qualified engines**

This is the shift from a human-trader marketplace to a machine-engine marketplace.

## 5. Core Thesis

Cogochi is built on two claims.

### Claim A

Reproducible and verifiable algorithmic signals can outperform discretionary trader marketplaces on a risk-adjusted basis over time.

### Claim B

A protocol with multiple competing engines is more durable than a protocol centered around one manager or one black-box strategy.

Phase 1 is designed to test Claim A with one engine. Phase 2 begins testing Claim B with multiple engines.

## 6. Product Strategy

The end-state architecture has three layers, but the business should be evaluated phase by phase.

### Phase 1 wedge: Verified Engine Marketplace

This is the first product that matters.

The marketplace does four things:

1. lets engines register and stake
2. lets engines publish attested signals
3. builds a verifiable performance history
4. ranks engines for future capital routing

This is the first proof point. Without this layer, later vault or token layers are premature.

### Phase 2 expansion: Router Vault

Once the marketplace has enough live history, Cogochi adds a router vault that:

- reads marketplace rankings
- allocates capital across qualified engines
- executes on Hyperliquid
- charges performance fees on positive PnL only

### Phase 3 expansion: Multi-Vault Aggregation

Longer term, multiple vaults can be combined into a higher-level institutional allocator. This is an expansion path, not the first product.

## 7. Protocol Overview

### Layer 0: Engines

Engines are off-chain systems that generate trading signals. Cogochi Engine is the first participant. Third-party engines may join later through a common attestation interface.

### Layer 1: Engine Marketplace

The marketplace contains:

- `EngineRegistry`
- `SignalCommitReveal`
- `PerformanceScoreboard`
- `SlashingEngine`
- optional direct subscription logic

Its purpose is not merely to store signals. Its purpose is to create a market for engine quality.

### Layer 2: Router Vault

The vault is an ERC-4626-style capital router that:

- aggregates signals from qualified engines
- adjusts engine weights based on recent performance
- executes the resulting positions on Hyperliquid

### Layer 3: Vault Aggregator

This is the institutional portfolio layer for combining multiple router vaults and potentially multiple chains. It is explicitly out of pre-seed scope.

## 8. Why Marketplace Instead of Registry

A passive registry is not enough.

A marketplace has stronger protocol properties:

- competition between engines
- ranking by measured performance
- staking and slashing for quality control
- fee capture for the protocol
- stronger network effects as engines and subscribers reinforce each other

This is the difference between a database and a living market.

## 9. Phase 1 Architecture: Verified Engine Marketplace

### 9.1 Engine Registry

Engines register with:

- operator identity
- metadata
- minimum stake
- active status

The stake is not primarily a fundraising tool. It is a quality filter and enforcement mechanism.

### 9.2 Attested Signal Publishing

Signals use a commit-reveal cycle:

1. engine commits a hash of the signal
2. the market sees that a signal exists, but not its contents
3. engine reveals within a short window
4. hash integrity is verified

This is designed to reduce naive frontrunning and make signal publication auditable.

### 9.3 Performance Scoreboard

Each engine accumulates:

- signal count
- hit/miss counts
- cumulative PnL
- rolling Sharpe
- max drawdown
- uptime / heartbeat quality

This scoreboard is the qualification layer for routing future capital.

### 9.4 Slashing

If an engine misbehaves, it may be slashed for:

- false attestation
- inactivity
- malicious behavior
- repeated critical failures

This is what turns the marketplace from a leaderboard into an enforceable market.

## 10. Router Vault

The router vault is the capital product built on top of marketplace data.

### 10.1 User flow

1. user deposits capital
2. vault reads engine rankings
3. vault assigns weights to qualified engines
4. vault executes trades on Hyperliquid
5. positive PnL is subject to performance fees

### 10.2 Weighting logic

The first version is intentionally simple.

- use recent Sharpe-based weights
- rebalance weekly
- cap any single engine at 40%

Later versions may add risk parity and correlation-aware weighting.

### 10.3 Why this matters

This vault is not meant to be "another manager vault." It is meant to be a router from verified machine strategies to execution.

## 11. Cogochi Engine

Cogochi Engine is the first marketplace participant, not the protocol itself.

Its role is strategic:

- bootstrap the marketplace
- prove the engine-attestation thesis
- generate the first live verified track record

Cogochi Engine is described as an off-chain Python stack that combines:

- market and derivatives data
- structured feature engineering
- LightGBM-based win probability scoring
- pattern building blocks
- hill-climbing and later preference-tuning loops

The important investor message is not that Cogochi Engine is perfect. It is that the protocol can start with one engine and expand toward many.

## 12. Business Model

Cogochi expects to monetize in two stages.

### Stage 1: Marketplace monetization

- optional engine subscriptions
- protocol cut from engine access or curation

### Stage 2: Vault monetization

- performance fee on positive PnL only
- split between primary engine, secondary engines, and protocol

The long-term protocol opportunity is stronger than a single engine business because value can be captured at the routing layer, not only at the strategy layer.

## 13. Why This Can Be Durable

The protocol becomes stronger when:

- more engines join
- more live signals are attested
- more performance history accumulates
- more capital routes toward the best engines

That creates a flywheel:

`more engines -> better ranking market -> better vault routing -> better user outcomes -> more capital -> more engines`

This is the marketplace logic that traditional copy trading products lack.

## 14. Risk and De-Risking Strategy

This design carries real risk. The point is not to deny it, but to shrink it in sequence.

### 14.1 Signal leakage / MEV

Mitigation:

- commit-reveal
- short reveal window
- delayed full signal visibility

### 14.2 Oracle and resolution risk

Mitigation:

- primary oracle selection
- explicit staleness checks
- future fallback oracle path

### 14.3 Single-engine bootstrap risk

Mitigation:

- Phase 1 explicitly proves one-engine viability first
- Phase 2 only adds routing after enough live history exists

### 14.4 Strategy concentration risk

Mitigation:

- per-engine caps
- minimum live history thresholds
- performance gating before vault inclusion

### 14.5 Legal and governance risk

Mitigation:

- phased rollout
- non-custodial framing
- delayed token/governance emphasis until core utility is proven

## 15. Go-To-Market

The initial GTM should stay narrow.

### Initial user promise

"Follow verified engines, not unverifiable traders."

### Initial product promise

"We show which engines actually perform, before we ask users to route capital."

### Initial strategic advantage

Cogochi does not need to win the entire copy trading market on day one. It needs to win the category of **verified engine performance** first.

That is a much narrower and more achievable wedge.

## 16. Roadmap

### Phase 1: Marketplace MVP

Deliver:

- engine registration
- attested signal publishing
- scoreboard
- first engine live history

Success looks like:

- enough live signals to prove the verification loop works
- enough user interest to validate engine-based demand
- enough performance history to qualify engines for routing

### Phase 2: Router Vault

Deliver:

- multi-engine capital routing
- weekly rebalancing
- Hyperliquid execution
- performance-fee settlement

### Phase 3: Scale

Deliver:

- more engines
- stronger fee capture
- broader protocol defensibility

### Phase 4: Aggregation

Deliver:

- multi-vault allocator
- institutional packaging
- possible multi-chain expansion

## 17. Non-Goals

Cogochi is not initially trying to build:

- its own perp exchange
- its own L1/L2 chain
- a generic DeFi super-app
- a social trading feed as the core product
- an institution-first platform before core verification is proven

## 18. Closing

Copy trading proved the demand. Vaults proved the wrapper. Execution venues proved the rail.

What remains missing is the verification and routing layer for machines.

Cogochi's thesis is that the next category is not "more trader marketplaces." It is **machine-native engine marketplaces** with verified performance and programmable capital routing.
