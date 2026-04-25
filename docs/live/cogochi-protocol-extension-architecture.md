# Domain: Cogochi Protocol Extension Architecture

## Goal

Define how Cogochi Protocol should extend the current repository architecture without replacing the existing system. The target is not a greenfield rewrite. The target is a layered expansion where the current `engine/`, `app/`, `worker-control`, and shared state become the foundation for a new protocol plane.

This document is the canonical integration architecture for:

- `verified algorithmic engine marketplace`
- future routing and vault layers
- subsystem-by-subsystem improvement analysis

## Executive View

The current repository should be interpreted as:

- the **operating system for Cogochi Engine**
- the internal quality loop for one engine
- the development surface for research, evidence, and refinement

The protocol should be interpreted as:

- the external verification layer for engines
- the comparison and ranking layer across engines
- the routing layer that eventually allocates capital to qualified engines

The protocol is therefore **not a replacement** for the current stack.

It is an additional layer above it.

## Design Principle

The correct stack is:

`current repo -> Cogochi Engine quality loop -> protocol marketplace -> router -> vault`

Not:

`current repo -> throw away -> rebuild protocol from scratch`

## Current Stack As Layer 0

### What already exists

The current repository already contains:

- a canonical backend engine in `engine/`
- app-owned visualization and orchestration in `app/`
- a runtime split between `app-web`, `engine-api`, and `worker-control`
- a ledger / evidence / refinement structure around pattern and signal quality

This is enough to treat the current system as **Protocol Participant #1**, namely Cogochi Engine.

### Reinterpretation

The most useful reframing is:

- `/terminal`, `/lab`, and existing ledgers are the internal operating console for Cogochi Engine
- the future protocol marketplace is the public verification shell around that engine and later third-party engines

## Architecture Mapping

| Current Repo Area | Current Meaning | Future Protocol Meaning | Keep / Extend / Replace |
|---|---|---|---|
| `engine/` | canonical market logic and research engine | Cogochi Engine + protocol-owned compute/read services | keep and extend |
| `app/` | surface rendering and orchestration | protocol explorer, engine marketplace UI, routing visibility | keep and extend |
| `worker-control` | scheduler and control plane | protocol jobs: resolver, ranking, eligibility, rebalance | keep and extend |
| shared state | pattern/capture/verdict persistence | add protocol registry, signal, outcome, ranking, allocation state | extend |
| current pattern ledger | user research and pattern evidence | remains internal engine-quality plane | keep separate |
| future protocol ledger | not yet present | engine/public-market protocol truth | add new plane |

## Layered Target Model

### Layer A — Cogochi Engine Quality Loop

This is the current system.

It includes:

- feature computation
- scoring
- pattern runtime
- backtest
- research / refinement
- evidence capture

Its purpose is to improve the quality of one engine.

### Layer B — Engine Marketplace

This is the first protocol layer to add.

It includes:

- engine registry
- signal attestation
- outcome resolution
- engine scoreboard
- eligibility state

Its purpose is to make engine quality legible and verifiable.

### Layer C — Router

This is the second protocol layer.

It includes:

- qualification-aware weight computation
- allocation logic
- rebalance policy
- later shadow and live routing

Its purpose is to convert measured engine quality into deterministic capital weights.

### Layer D — Vault / Execution

This is the later execution layer.

It includes:

- user deposits
- execution venue adapter
- settlement
- fee split

Its purpose is to turn routing into a live capital product.

## What Must Not Be Mixed

### 1. Pattern Ledger vs Protocol Ledger

These are different planes and must remain separate.

Current pattern ledger:

- capture evidence
- pattern outcomes
- user verdicts
- refinement and training lineage

Protocol ledger:

- engine identity
- signal commits
- signal reveals
- signal outcomes
- performance snapshots
- eligibility snapshots
- allocations
- settlement records

Reason:

- one is an internal engine-quality evidence plane
- the other is a public or protocol-market verification plane

Mixing them would weaken both audit semantics and architectural clarity.

### 2. App Truth vs Engine Truth

The app must not own protocol truth.

The app may render:

- engine profiles
- scoreboards
- signal explorers
- allocation views

But canonical protocol objects must remain engine-owned or shared-state-owned.

### 3. Vault Before Verification

The router and vault should not be built before the verification marketplace works.

The order must be:

1. verify engines
2. rank engines
3. qualify engines
4. route capital

Not the reverse.

## Proposed Repo Expansion

### Engine side

Add a dedicated protocol namespace under `engine/`.

Suggested modules:

- `engine/protocol/registry.py`
- `engine/protocol/attestation.py`
- `engine/protocol/outcomes.py`
- `engine/protocol/scoreboard.py`
- `engine/protocol/eligibility.py`
- `engine/protocol/router.py`
- `engine/protocol/types.py`

Suggested API surfaces:

- `engine/api/routes/protocol_registry.py`
- `engine/api/routes/protocol_signals.py`
- `engine/api/routes/protocol_scoreboard.py`
- `engine/api/routes/protocol_router.py`

### App side

Add a protocol surface without overloading existing terminal routes.

Suggested structure:

- `app/src/routes/protocol/+page.svelte`
- `app/src/routes/protocol/engines/[engineId]/+page.svelte`
- `app/src/routes/protocol/signals/+page.svelte`
- `app/src/routes/protocol/router/+page.svelte`
- `app/src/routes/api/protocol/...`
- `app/src/lib/protocol/...`

### Contracts side

Define explicit protocol object contracts instead of reusing pattern contracts ad hoc.

Suggested additions:

- `app/src/lib/contracts/protocol.ts`
- `app/src/lib/contracts/protocolRegistry.ts`
- `app/src/lib/contracts/protocolSignals.ts`
- `app/src/lib/contracts/protocolRouter.ts`

### Worker side

Use `worker-control` for background protocol jobs.

Suggested jobs:

- signal expiration resolver
- signal outcome resolver
- scoreboard recompute
- eligibility recompute
- rebalance scheduler

### Shared state

Add protocol-specific durable objects.

Suggested record families:

- `protocol_engines`
- `protocol_signal_commits`
- `protocol_signal_reveals`
- `protocol_signal_outcomes`
- `protocol_engine_scores`
- `protocol_engine_eligibility`
- `protocol_allocations`
- `protocol_settlements`

These should not be added into `pattern_ledger_records` as overloaded record types.

## Phase Rollout On Top Of Current Repo

### Phase 0 — Repo Grounding

Goal:

- keep current stack intact
- define Cogochi Engine as Protocol Participant #1
- define protocol object model and boundaries

Deliverables:

- protocol contracts
- protocol architecture doc
- protocol PRD

### Phase 1 — Off-Chain Verification Marketplace

Goal:

- prove engine verification without live capital routing

Deliverables:

- engine registry
- signal attestation
- outcome resolution
- scoreboard
- eligibility
- marketplace visibility

This is the most natural extension of the current repo.

### Phase 1.5 — On-Chain Anchoring

Goal:

- anchor verification logic to contract-shaped interfaces or on-chain commitments

Deliverables:

- commit hash anchoring
- event or proof surfaces
- contract boundary hardening

This should come after the off-chain marketplace proves useful.

### Phase 2 — Shadow Router

Goal:

- convert verified engine quality into deterministic shadow allocations

Deliverables:

- routing weights
- rebalance policy
- shadow portfolio
- allocation visibility

### Phase 3 — Live Vault

Goal:

- turn routing into a real capital product

Deliverables:

- deposit / redeem
- venue adapter
- settlement
- fee split

## Subsystem Improvement Analysis

### 1. Engine

#### What is already strong

- canonical backend logic already lives in `engine/`
- scoring, backtest, and research stack already exists
- this is already enough to support Cogochi Engine as the first marketplace participant

#### Current weakness

- current engine planes are focused on internal pattern quality, not public engine verification
- ledger and identity are pattern-centered, not engine-marketplace-centered
- some model identity remains too generic and user-scoped

#### Required improvements

- add protocol namespace instead of stretching pattern modules
- make engine identity a first-class protocol object
- define signal attestation and outcome resolution as separate planes
- split engine-quality ledgers from protocol ledgers
- move protocol read models behind stable engine-owned contracts

### 2. App

#### What is already strong

- app already renders rich diagnostic and analysis surfaces
- app can naturally host engine profiles, scoreboards, and router visibility

#### Current weakness

- several current routes reshape engine truth into UI-specific envelopes
- terminal/pattern routes are tightly coupled to current product semantics
- there is no explicit protocol explorer surface

#### Required improvements

- stop overloading existing pattern or terminal routes for protocol objects
- add explicit `/protocol` surfaces
- consume canonical protocol contracts instead of inventing app-owned protocol truth
- keep UI explanation rich, but keep semantics engine-owned

### 3. Worker-Control

#### What is already strong

- the repo already has a runtime split that anticipates public API vs background jobs
- protocol maintenance jobs fit the worker-control role naturally

#### Current weakness

- current worker-control emphasis is research and runtime jobs, not protocol-marketplace jobs
- protocol recomputation duties are not yet modeled

#### Required improvements

- add resolver and ranking jobs
- add eligibility recompute jobs
- add rebalance scheduling jobs
- keep these jobs out of browser-facing runtimes

### 4. Shared State

#### What is already strong

- the repo already moved toward shared state as canonical persistence
- ADR-009 already points away from process-local truth

#### Current weakness

- current durable objects are mostly pattern and capture oriented
- protocol objects do not yet have a dedicated namespace

#### Required improvements

- add protocol-specific tables or logical families
- keep append-safe audit trails for commits, reveals, outcomes, and ranking snapshots
- avoid storing protocol truth only in local JSON or process memory

### 5. Contract Boundary

#### What is already strong

- the repo already recognizes contract drift as an architectural risk
- app/engine split is explicit in ADRs

#### Current weakness

- no canonical protocol object contracts yet
- legacy or experimental marketplace terms exist, but they are not authoritative

#### Required improvements

- define protocol contracts explicitly
- separate engine contracts from app transport envelopes
- version the protocol object shapes before implementation spreads

### 6. Business / Positioning Layer

#### What is already strong

- current docs are clear about wedge and business discipline for the existing product

#### Current weakness

- the protocol lane can easily collide with the existing flywheel-first thesis if left implicit

#### Required improvements

- explicitly state that current repo/business remains Cogochi Engine operating system
- state that protocol is a new outer layer, not a rewrite of the current product thesis
- decide later whether protocol becomes a separate formal lane or a direct extension of the product canon

## File-Level Improvement Recommendations

### Keep as-is but reinterpret

- `engine/scoring/*`
- `engine/backtest/*`
- `engine/research/*`
- `engine/patterns/*`

These remain the internal quality loop for Cogochi Engine.

### Extend carefully

- `engine/api/*`
- `app/src/routes/api/*`
- shared persistence layers

These need protocol-aware additions, but should not be bent into accidental protocol truth.

### Add new lanes

- `engine/protocol/*`
- `app/src/routes/protocol/*`
- `app/src/lib/contracts/protocol*.ts`
- worker jobs for protocol state transitions

## Integration Rules

### Rule 1

Current `engine/` remains backend truth.

### Rule 2

Current terminal/lab/flywheel loop remains the internal operating loop for Cogochi Engine.

### Rule 3

The protocol marketplace is added as an outer verification plane, not merged into the current pattern plane.

### Rule 4

The first protocol participant is Cogochi Engine itself.

### Rule 5

No live vault work should ship before the verification marketplace becomes trustworthy.

## Recommended Next Work Items

1. protocol object contracts
2. off-chain engine registry
3. signal attestation service
4. signal outcome resolver
5. engine scoreboard read model
6. engine eligibility service
7. `/protocol` explorer UI
8. shadow router

## Final Interpretation

The current repo should be expanded, not displaced.

The right mental model is:

- current repository = **Cogochi Engine OS**
- new protocol layer = **engine verification, comparison, and routing market**

The protocol succeeds only if it preserves the strengths of the current engine while adding a clean outer market structure around it.
