# Cogochi Protocol — Phase 1 Implementation Split

**Version**: 1.0  
**Date**: 2026-04-23  
**Status**: Draft execution design  
**Owner**: research

## Purpose

Translate the protocol contract pack into the next executable build units.

This document answers:

1. what should be built immediately after the current design pack?
2. how should the work split across `contract`, `engine`, and `app` lanes?
3. how should Phase 1 persistence be staged into migrations instead of one oversized cutover?

## Read Order

1. `docs/product/cogochi-protocol-phase1-execution-spec.md`
2. `docs/domains/cogochi-protocol-extension-architecture.md`
3. `docs/domains/cogochi-protocol-shared-state-schema.md`
4. `docs/domains/cogochi-protocol-object-contracts.md`
5. `docs/domains/cogochi-protocol-route-contracts.md`
6. this file

## Design Principles

1. Phase 1 ships a `verified engine marketplace`, not a vault product.
2. Shared-state foundations should land before public routes or UI surfaces depend on them.
3. `engine-api` and `worker-control` stay as trusted protocol writers. `app-web` remains read and orchestration only.
4. Registry and attestation must work before scoreboard and eligibility. Scoreboard and eligibility must work before any router logic.
5. Migration scope should follow the evidence-to-read-model layering, not implementation convenience.

## Immediate Build Sequence

### Step 1: Persistence Foundation

Goal:

- make protocol rows durable before protocol behavior starts depending on in-memory or ad hoc JSON state

Outputs:

- Phase 1 migration skeletons
- shared-state write plan
- minimal engine-side persistence adapters

### Step 2: Engine Registry And Attestation

Goal:

- allow engines to register, heartbeat, commit signals, and reveal signals against canonical persistence

Outputs:

- registry write path
- attestation write path
- protocol read routes for engine and signal detail

### Step 3: Outcome, Scoreboard, Eligibility

Goal:

- convert attested signal history into objective rankable engine history

Outputs:

- resolver jobs
- snapshot recompute jobs
- scoreboard and eligibility reads

### Step 4: Explorer Surface

Goal:

- make protocol state legible in the app without making the app a truth owner

Outputs:

- engine list/detail
- signal detail surface
- scoreboard
- eligibility explanation

## Proposed Work Item Split

These are the next clean execution units after W-0141.

### `W-0142` — Protocol Persistence Foundation

Suggested owner:

- `contract`

Primary change type:

- Contract change

Goal:

- create the Phase 1 storage boundary for protocol registry, attestation, and outcome evidence

Scope:

- add Phase 1 protocol migration skeletons
- define canonical table create order
- define engine-side persistence adapter boundaries
- define runtime write permissions for `engine-api` and `worker-control`

Canonical files:

- `app/supabase/migrations/019_protocol_registry_and_attestation.sql`
- `app/supabase/migrations/020_protocol_outcomes_and_scoreboard.sql`
- `docs/domains/cogochi-protocol-shared-state-schema.md`

Non-goals:

- public protocol routes
- UI
- router or settlement logic

Exit criteria:

- protocol tables exist for Phase 1 registry, attestation, outcome, performance, and eligibility
- indexes match the shared-state schema
- RLS posture matches the existing trusted-runtime model

### `W-0143` — Engine Registry And Attestation Paths

Suggested owner:

- `engine`

Primary change type:

- Engine logic change

Goal:

- make `engine-api` the canonical writer for protocol engine identity and attested signals

Scope:

- add protocol persistence service layer under `engine/protocol/*`
- implement registry create/read paths
- implement heartbeat write path
- implement commit and reveal write path
- implement reveal verification rules

Canonical files:

- `engine/protocol/registry.py`
- `engine/protocol/attestation.py`
- `engine/api/routes/protocol_engines.py`
- `engine/api/routes/protocol_signals.py`

Non-goals:

- outcome resolution jobs
- scoreboard recomputation
- app explorer surfaces

Exit criteria:

- one engine can be registered and queried
- one signal can be committed and revealed
- invalid or duplicate reveals are rejected and still auditable

### `W-0144` — Outcome Resolver, Scoreboard, Eligibility

Suggested owner:

- `engine`

Primary change type:

- Engine logic change

Goal:

- make `worker-control` the canonical owner of protocol outcome resolution and ranking snapshots

Scope:

- add outcome resolution logic
- add worker jobs for expiry and resolution
- add performance snapshot recompute jobs
- add eligibility recompute jobs
- expose canonical read endpoints for scoreboard and eligibility

Canonical files:

- `engine/protocol/outcomes.py`
- `engine/protocol/scoreboard.py`
- `engine/protocol/eligibility.py`
- `worker-control` job entrypoints for protocol recomputation

Non-goals:

- app rendering
- router allocations
- live settlement

Exit criteria:

- verified signals resolve into outcomes
- scoreboard snapshots are durable and queryable
- eligibility state is durable and explainable

### `W-0145` — Protocol Explorer Surface

Suggested owner:

- `app`

Primary change type:

- Product surface change

Goal:

- surface protocol state in the app without moving truth ownership out of engine/shared state

Scope:

- add `/protocol` information architecture
- add engine list and detail views
- add signal state and outcome detail views
- add scoreboard and eligibility displays
- add thin app routes over engine read models

Canonical files:

- `app/src/routes/protocol/*`
- `app/src/routes/api/protocol/*`
- `app/src/lib/contracts/protocol*.ts`

Non-goals:

- public write ownership for app
- router surface beyond Phase 1 read-only placeholders

Exit criteria:

- users can inspect engines, signals, outcomes, rankings, and eligibility from app surfaces
- app remains a read/orchestration layer

## Migration Split Recommendation

Do not create one giant protocol migration.

### Migration `019_protocol_registry_and_attestation.sql`

Should include:

- `protocol_engines`
- `protocol_operator_actions`
- `protocol_engine_heartbeats`
- `protocol_signal_commits`
- `protocol_signal_reveals`
- indexes and RLS enablement for these tables

Why first:

- these are the minimum durable objects needed before any engine can participate in the protocol

### Migration `020_protocol_outcomes_and_scoreboard.sql`

Should include:

- `protocol_signal_outcomes`
- `protocol_engine_performance_snapshots`
- `protocol_engine_eligibility`
- indexes and partial uniqueness constraints for current-state reads

Why second:

- these depend on registry and attestation already existing
- they introduce the first worker-owned read models

### Migration `021_protocol_router_and_settlement.sql`

Should include later:

- `protocol_router_allocation_snapshots`
- `protocol_settlement_records`

Why later:

- Phase 1 does not need live routing or settlement
- defining this too early as a hard dependency would bloat the first delivery

## Subsystem Improvement Plan

### `engine/`

Must improve:

- add `engine/protocol/` namespace instead of scattering protocol logic into pattern or challenge modules
- add persistence adapters that speak in protocol object names
- keep attestation verification and outcome logic separate from terminal/lab logic

Must avoid:

- writing protocol rows through pattern ledger abstractions
- mixing protocol ranking with existing Cogochi pattern metrics

### `worker-control`

Must improve:

- add explicit protocol job pack for expiry, outcome resolution, scoreboard recompute, eligibility recompute
- make recompute jobs idempotent and replay-safe

Must avoid:

- browser-facing protocol ownership
- one-off scripts that bypass durable snapshots

### `app/`

Must improve:

- add a dedicated `/protocol` explorer surface
- add thin API routes that reflect engine-owned truth
- add protocol contract types in `app/src/lib/contracts`

Must avoid:

- computing rankings client-side as a source of truth
- mixing protocol explorer UI with terminal capture flows

### Shared State

Must improve:

- add protocol tables in additive migrations
- separate evidence rows from read-model snapshots
- preserve auditability for invalid reveals and manual actions

Must avoid:

- overloading `pattern_ledger_records`
- skipping provenance fields for convenience

## Recommended Verification By Workstream

### Persistence Foundation

- migration applies cleanly in a disposable environment
- expected indexes exist
- trusted-runtime access model remains unchanged

### Engine Registry And Attestation

- register engine path writes `protocol_engines`
- commit path writes `protocol_signal_commits`
- reveal path writes `protocol_signal_reveals`
- invalid reveal remains visible as an auditable row

### Outcome, Scoreboard, Eligibility

- resolver job produces `protocol_signal_outcomes`
- recompute job produces `protocol_engine_performance_snapshots`
- eligibility job produces current `protocol_engine_eligibility`

### Explorer Surface

- app routes return engine-owned read models
- app never requires service-role credentials
- app surfaces explain eligibility and ranking using protocol data, not local heuristics

## Exit Condition For Leaving W-0141

W-0141 should hand off once:

1. contract pack is complete enough that implementation naming is locked
2. shared-state schema is defined
3. execution split into `W-0142` and onward is explicit
4. future implementation can begin without rediscovering structure in chat
