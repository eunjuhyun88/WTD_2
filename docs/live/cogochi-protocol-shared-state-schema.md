# Domain: Cogochi Protocol Shared State Schema

## Purpose

Define the shared-state and database shape for the Cogochi Protocol extension so the repository can grow from a single internal engine system into a verified engine marketplace without overloading the current pattern ledger.

This document answers:

1. which protocol tables should exist?
2. which runtime owns writes to each table?
3. which tables are raw evidence vs current-state read models?
4. how should protocol persistence extend the current repo without breaking existing boundaries?

## Read Order

1. `docs/domains/contracts.md`
2. `docs/domains/cogochi-protocol-extension-architecture.md`
3. `docs/domains/cogochi-protocol-object-contracts.md`
4. `docs/domains/cogochi-protocol-route-contracts.md`
5. `docs/product/cogochi-protocol-phase1-execution-spec.md`
6. this file

## Why A Separate Protocol Schema Exists

Current shared persistence already has a clear job:

- `pattern_ledger_records` is the append-only event log for the internal pattern core loop
- `engine-api` and `worker-control` are already the trusted runtimes for shared writes
- `app-web` is intentionally excluded from service-role-backed shared-state ownership

The protocol extension needs a different persistence plane:

- marketplace participant identity, not pattern evidence
- signal attestation records, not terminal or lab records
- routeability and router allocations, not internal Cogochi learning loop state
- future settlement attribution, not pattern verdict history

The design goal is extension, not replacement.

## Storage Design Rules

1. Protocol tables must use a dedicated `protocol_*` namespace and must not overload `pattern_ledger_records`.
2. `engine-api` and `worker-control` are the only trusted direct writers. `app-web` reads via routes and must not hold service-role write authority.
3. Raw evidence and current-state read models are different table families and must stay separate.
4. Migrations must be additive. No destructive cutover should be required to begin Phase 1.
5. Stable ids, explicit timestamps, and provenance fields are required on all durable protocol rows.
6. Policy-driven automatic transitions and manual operator actions must remain separately attributable.

## Current Gap And Required Improvement

| Area | Current repo strength | Current gap for protocol | Required improvement |
|---|---|---|---|
| Shared state boundary | trusted runtime split already exists | only pattern-ledger persistence is explicit | add protocol-specific tables with the same trust model |
| Evidence storage | append-only pattern ledger is established | signal attestation and heartbeat evidence have no durable home | add append-first attestation and heartbeat tables |
| Read models | pattern stats can be aggregated from shared state | protocol ranking and eligibility would otherwise drift into app-side recomputation | add snapshot tables owned by worker-control |
| Manual controls | repo already distinguishes runtime roles | no durable protocol audit plane for pause/slash/governance actions | add operator action log table |
| Future routing | extension architecture defines router concept | no allocation or settlement storage exists | add router allocation and settlement tables as later-phase extensions |

## Storage Families

### A. Registry And Control Plane

Purpose:

- identify engines
- retain operator-attributable actions
- track liveness evidence

Tables:

- `protocol_engines`
- `protocol_operator_actions`
- `protocol_engine_heartbeats`

### B. Signal Attestation Evidence

Purpose:

- prove that a signal was committed and later revealed
- preserve invalid or expired attempts for auditability

Tables:

- `protocol_signal_commits`
- `protocol_signal_reveals`

### C. Outcome And Qualification Plane

Purpose:

- resolve market outcomes
- compute performance
- publish routeability state

Tables:

- `protocol_signal_outcomes`
- `protocol_engine_performance_snapshots`
- `protocol_engine_eligibility`

### D. Router And Settlement Plane

Purpose:

- store deterministic allocation decisions
- retain economic attribution once vault execution exists

Tables:

- `protocol_router_allocation_snapshots`
- `protocol_settlement_records`

## Canonical Table Specifications

### `protocol_engines`

Meaning:

- canonical marketplace registry for one engine participant

Primary writers:

- `engine-api`

Primary readers:

- `engine-api`
- `worker-control`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable `engineId` |
| `operator_id` | `TEXT NOT NULL` | stable operator identity |
| `display_name` | `TEXT NOT NULL` | public label |
| `engine_type` | `TEXT NOT NULL` | `internal`, `third_party` |
| `metadata_ref` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | IPFS or structured metadata pointer |
| `stake_state` | `TEXT NOT NULL` | `none`, `pending`, `active`, `cooldown`, `withdrawn`, `slashed` |
| `engine_status` | `TEXT NOT NULL` | `active`, `paused`, `slashed`, `deactivated` |
| `registered_at` | `TIMESTAMPTZ NOT NULL` | source registration time |
| `last_heartbeat_at` | `TIMESTAMPTZ` | denormalized latest heartbeat |
| `tags` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | public strategy tags |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes:

- `protocol_engines_operator_idx (operator_id)`
- `protocol_engines_status_registered_idx (engine_status, registered_at DESC)`

Improvement target:

- today, engine identity for protocol work is implied in documents
- this table turns engine registry into durable backend truth instead of ad hoc metadata

### `protocol_operator_actions`

Meaning:

- manual control-plane actions taken by governance, team, or approved operators

Primary writers:

- `engine-api`
- future governance executor

Primary readers:

- `worker-control`
- `app-web` via admin or audit surfaces

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable action id |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | affected engine |
| `action_kind` | `TEXT NOT NULL` | `pause`, `resume`, `slash`, `deactivate`, `metadata_update` |
| `actor_id` | `TEXT NOT NULL` | who triggered the action |
| `reason` | `TEXT` | human-readable explanation |
| `payload` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | structured action details |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | action time |

Suggested indexes:

- `protocol_operator_actions_engine_created_idx (engine_id, created_at DESC)`
- `protocol_operator_actions_kind_created_idx (action_kind, created_at DESC)`

Improvement target:

- the object contracts require manual and automatic transitions to remain attributable
- this table is the durable audit layer that makes that rule enforceable

### `protocol_engine_heartbeats`

Meaning:

- append-only liveness evidence used to compute uptime and inactivity

Primary writers:

- `engine-api`

Primary readers:

- `worker-control`
- `engine-api`

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable heartbeat event id |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | source engine |
| `heartbeat_at` | `TIMESTAMPTZ NOT NULL` | observed heartbeat time |
| `source_ref` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | tx hash, SDK ref, or runtime metadata |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |

Suggested indexes:

- `protocol_engine_heartbeats_engine_time_idx (engine_id, heartbeat_at DESC)`

Improvement target:

- `last_heartbeat_at` alone is not enough for auditable uptime scoring
- this table provides raw evidence while `protocol_engines.last_heartbeat_at` stays as a convenient denormalized read field

### `protocol_signal_commits`

Meaning:

- append-first commit record for one attested signal

Primary writers:

- `engine-api`

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable `commitId` |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | owning engine |
| `commit_hash` | `TEXT NOT NULL` | hash of reveal payload + nonce |
| `commit_time` | `TIMESTAMPTZ NOT NULL` | commit time |
| `reveal_deadline` | `TIMESTAMPTZ NOT NULL` | commit expiry for reveal |
| `commit_status` | `TEXT NOT NULL` | `committed`, `revealed`, `expired`, `invalid`, `resolved` |
| `source_chain` | `TEXT` | `offchain-shadow`, `arbitrum`, etc. |
| `source_tx_ref` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | tx or proof reference |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes and constraints:

- `UNIQUE (engine_id, commit_hash)`
- `protocol_signal_commits_engine_time_idx (engine_id, commit_time DESC)`
- `protocol_signal_commits_status_deadline_idx (commit_status, reveal_deadline ASC)`

Improvement target:

- this table is the durable attestation boundary
- it prevents signal trust from living in transient app events or operator claims

### `protocol_signal_reveals`

Meaning:

- revealed plaintext signal tied to one commit

Primary writers:

- `engine-api`

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable reveal id |
| `commit_id` | `TEXT NOT NULL REFERENCES protocol_signal_commits(id)` | source commit |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | denormalized owner |
| `asset` | `TEXT NOT NULL` | asset symbol |
| `direction` | `TEXT NOT NULL` | `long`, `short` |
| `tp_bps` | `INTEGER NOT NULL` | take profit bps |
| `sl_bps` | `INTEGER NOT NULL` | stop loss bps |
| `valid_until` | `TIMESTAMPTZ NOT NULL` | signal expiry |
| `nonce` | `TEXT NOT NULL` | reveal nonce |
| `reveal_time` | `TIMESTAMPTZ NOT NULL` | reveal time |
| `verification_state` | `TEXT NOT NULL` | `pending`, `verified`, `invalid` |
| `verification_reason` | `TEXT` | mismatch or policy reason |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes and constraints:

- `UNIQUE (commit_id)`
- `protocol_signal_reveals_engine_time_idx (engine_id, reveal_time DESC)`
- `protocol_signal_reveals_state_valid_until_idx (verification_state, valid_until ASC)`

Improvement target:

- invalid reveals still need a durable home for auditability
- this table keeps acceptance and rejection equally visible

### `protocol_signal_outcomes`

Meaning:

- resolved market result for one verified reveal

Primary writers:

- `worker-control`
- `engine-api` only if resolution is synchronous by design

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable outcome id |
| `commit_id` | `TEXT NOT NULL REFERENCES protocol_signal_commits(id)` | source commit |
| `reveal_id` | `TEXT NOT NULL REFERENCES protocol_signal_reveals(id)` | source reveal |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | owning engine |
| `outcome_revision` | `INTEGER NOT NULL DEFAULT 1` | allows correction records |
| `is_current` | `BOOLEAN NOT NULL DEFAULT TRUE` | current revision marker |
| `supersedes_outcome_id` | `TEXT REFERENCES protocol_signal_outcomes(id)` | prior revision if corrected |
| `entry_price` | `NUMERIC NOT NULL` | fixed reference entry |
| `exit_price` | `NUMERIC NOT NULL` | fixed reference exit |
| `exit_reason` | `TEXT NOT NULL` | `tp_hit`, `sl_hit`, `timeout`, `manual_abort` |
| `outcome_label` | `TEXT NOT NULL` | `win`, `loss`, `timeout`, `void` |
| `pnl_bps` | `INTEGER NOT NULL` | signed result |
| `resolved_at` | `TIMESTAMPTZ NOT NULL` | resolution time |
| `price_source_ref` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | oracle or price provenance |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes and constraints:

- `UNIQUE (commit_id, outcome_revision)`
- `UNIQUE (commit_id) WHERE is_current = TRUE`
- `protocol_signal_outcomes_engine_resolved_idx (engine_id, resolved_at DESC)`
- `protocol_signal_outcomes_label_resolved_idx (outcome_label, resolved_at DESC)`

Improvement target:

- Phase 1 needs machine-computed outcomes, not operator-reported PnL
- revision support avoids silently mutating history if a resolver correction is required

### `protocol_engine_performance_snapshots`

Meaning:

- read-model snapshots that aggregate outcome history into rankable engine metrics

Primary writers:

- `worker-control`

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable snapshot id |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | source engine |
| `window_kind` | `TEXT NOT NULL` | `all_time`, `rolling_30d`, `rolling_90d` |
| `total_signals` | `INTEGER NOT NULL` | aggregate count |
| `wins` | `INTEGER NOT NULL` | resolved wins |
| `losses` | `INTEGER NOT NULL` | resolved losses |
| `timeouts` | `INTEGER NOT NULL` | resolved timeouts |
| `cumulative_pnl_bps` | `INTEGER NOT NULL` | signed pnl |
| `hit_rate` | `NUMERIC NOT NULL` | 0..1 |
| `rolling_sharpe` | `NUMERIC` | nullable if insufficient data |
| `max_drawdown_pct` | `NUMERIC` | nullable if insufficient data |
| `uptime_score` | `NUMERIC` | nullable if insufficient data |
| `snapshot_at` | `TIMESTAMPTZ NOT NULL` | snapshot time |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes:

- `protocol_engine_performance_snapshots_engine_window_time_idx (engine_id, window_kind, snapshot_at DESC)`
- `protocol_engine_performance_snapshots_window_time_idx (window_kind, snapshot_at DESC)`

Improvement target:

- ranking should not be recomputed in the browser or hidden inside one-off scripts
- worker-owned snapshots make ranking deterministic and replayable

### `protocol_engine_eligibility`

Meaning:

- current and historical routeability state for an engine

Primary writers:

- `worker-control`

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable eligibility record id |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | source engine |
| `eligibility_state` | `TEXT NOT NULL` | `warming_up`, `eligible`, `ineligible`, `probation` |
| `effective_from` | `TIMESTAMPTZ NOT NULL` | state start |
| `effective_until` | `TIMESTAMPTZ` | null = current |
| `reasons` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | machine-readable explanation set |
| `metrics_ref` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | snapshot refs or thresholds used |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes and constraints:

- `UNIQUE (engine_id) WHERE effective_until IS NULL`
- `protocol_engine_eligibility_state_from_idx (eligibility_state, effective_from DESC)`

Improvement target:

- routeability must be explicit protocol truth
- reason storage prevents black-box governance decisions

### `protocol_router_allocation_snapshots`

Meaning:

- deterministic routing outputs produced by the shadow or live router

Primary writers:

- `worker-control`

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable allocation snapshot id |
| `router_id` | `TEXT NOT NULL` | logical router policy id |
| `allocation_kind` | `TEXT NOT NULL` | `shadow`, `live_target` |
| `weights` | `JSONB NOT NULL` | list of `{ engine_id, weight_bps, rationale[] }` |
| `rebalance_reason` | `TEXT NOT NULL` | scheduled or event-driven |
| `computed_at` | `TIMESTAMPTZ NOT NULL` | computation time |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes:

- `protocol_router_allocations_router_time_idx (router_id, computed_at DESC)`
- `protocol_router_allocations_kind_time_idx (allocation_kind, computed_at DESC)`

Improvement target:

- this is the bridge from verification to capital routing
- it gives the repo a durable explanation for why a specific weight map existed at a specific time

### `protocol_settlement_records`

Meaning:

- economic attribution records once routed execution becomes live

Primary writers:

- later-phase execution and settlement runtime

Primary readers:

- `worker-control`
- `engine-api`
- `app-web` via protocol routes

Suggested columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | stable settlement id |
| `allocation_snapshot_id` | `TEXT NOT NULL REFERENCES protocol_router_allocation_snapshots(id)` | source routing snapshot |
| `engine_id` | `TEXT NOT NULL REFERENCES protocol_engines(id)` | fee attribution engine |
| `gross_pnl` | `NUMERIC NOT NULL` | before fees |
| `net_pnl` | `NUMERIC NOT NULL` | after fees |
| `performance_fee` | `NUMERIC NOT NULL` | fee charged |
| `engine_fee_share` | `NUMERIC NOT NULL` | engine share |
| `protocol_fee_share` | `NUMERIC NOT NULL` | protocol share |
| `settled_at` | `TIMESTAMPTZ NOT NULL` | settlement time |
| `schema_version` | `INTEGER NOT NULL DEFAULT 1` | object schema version |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row created |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | row updated |

Suggested indexes:

- `protocol_settlements_engine_time_idx (engine_id, settled_at DESC)`
- `protocol_settlements_allocation_idx (allocation_snapshot_id)`

Improvement target:

- Phase 1 does not need live settlement
- defining the table now keeps later execution work aligned with the same protocol vocabulary

## Runtime Write Ownership

| Runtime | May write | Must not write |
|---|---|---|
| `app-web` | none of the protocol tables directly | all `protocol_*` tables |
| `engine-api` | `protocol_engines`, `protocol_operator_actions`, `protocol_engine_heartbeats`, `protocol_signal_commits`, `protocol_signal_reveals` | score snapshots, eligibility snapshots, router allocations by default |
| `worker-control` | `protocol_signal_outcomes`, `protocol_engine_performance_snapshots`, `protocol_engine_eligibility`, `protocol_router_allocation_snapshots`, later `protocol_settlement_records` | browser-facing session or ad hoc user-owned state |

## Evidence vs Read-Model Split

### Raw Evidence Tables

- `protocol_operator_actions`
- `protocol_engine_heartbeats`
- `protocol_signal_commits`
- `protocol_signal_reveals`
- `protocol_signal_outcomes`

Rules:

- append-first
- correction via new rows, not silent overwrite
- suitable for audit, replay, and incident review

### Current-State And Snapshot Tables

- `protocol_engines`
- `protocol_engine_performance_snapshots`
- `protocol_engine_eligibility`
- `protocol_router_allocation_snapshots`
- later `protocol_settlement_records`

Rules:

- optimized for canonical reads
- may denormalize evidence-derived facts
- must remain reproducible from evidence and policy inputs

## Canonical State Transitions

### Engine State

`protocol_engines.engine_status`

- `active -> paused`
- `paused -> active`
- `active -> slashed`
- `active -> deactivated`
- `paused -> deactivated`

Manual transitions:

- recorded in `protocol_operator_actions`

### Commit State

`protocol_signal_commits.commit_status`

- `committed -> revealed`
- `committed -> expired`
- `committed -> invalid`
- `revealed -> resolved`

Automatic transitions:

- owned by `worker-control` expiry and resolver jobs

### Reveal State

`protocol_signal_reveals.verification_state`

- `pending -> verified`
- `pending -> invalid`

### Eligibility State

`protocol_engine_eligibility.eligibility_state`

- `warming_up -> eligible`
- `warming_up -> ineligible`
- `eligible -> probation`
- `probation -> eligible`
- `eligible -> ineligible`

## Migration Strategy

### Phase 0 Additive Migration Order

1. create `protocol_engines`
2. create `protocol_operator_actions`
3. create `protocol_engine_heartbeats`
4. create `protocol_signal_commits`
5. create `protocol_signal_reveals`
6. create `protocol_signal_outcomes`
7. create `protocol_engine_performance_snapshots`
8. create `protocol_engine_eligibility`
9. later create `protocol_router_allocation_snapshots`
10. later create `protocol_settlement_records`

### Rollout Rules

1. do not backfill these tables from `pattern_ledger_records`
2. do not merge protocol and pattern namespaces for convenience
3. keep service-role credentials restricted to `engine-api` and `worker-control`
4. ship registry and attestation before router or settlement tables are depended on

## SQL Style Recommendations

Follow the same durability and operator expectations established by `018_pattern_ledger_records.sql`:

- use `TEXT` ids for stable cross-runtime identifiers
- use `TIMESTAMPTZ` for all durable times
- use `JSONB` for structured provenance or rationale payloads
- prefer targeted composite indexes over generic broad indexing
- enable RLS and continue relying on trusted engine runtimes for service-role access

## Implementation Exit Criteria

- a future migration pack can be derived from this document without renaming objects
- object contracts and table names remain aligned
- route contracts can point to a single writer runtime per table family
- protocol shared state is clearly separate from the internal pattern ledger
