# Domain: Cogochi Protocol Object Contracts

## Purpose

Define the field-level protocol objects used by the Cogochi Protocol extension layer so `app`, `engine`, `worker-control`, and future contract work share one vocabulary.

This document is the object-level companion to:

- `docs/domains/cogochi-protocol-extension-architecture.md`
- `docs/product/cogochi-protocol-phase1-execution-spec.md`

## Read Order

For protocol implementation or QA:

1. `docs/domains/contracts.md`
2. `docs/domains/cogochi-protocol-extension-architecture.md`
3. `docs/domains/cogochi-protocol-shared-state-schema.md`
4. `docs/product/cogochi-protocol-phase1-execution-spec.md`
5. this file
6. `docs/domains/cogochi-protocol-route-contracts.md`

## Global Rules

1. Every durable protocol object has:
   - stable `id`
   - `schema_version`
   - `created_at`
   - `updated_at`
2. Protocol objects must not be stored as overloaded `pattern_ledger_records` rows.
3. Cross-object relations use stable ids, not display names.
4. App may shape views, but protocol persistence remains engine-owned or shared-state-owned truth.
5. Manual governance actions and automatic protocol transitions must remain separately attributable.

## Identity And Versioning

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | UUID or slug-safe stable identifier |
| `schema_version` | `integer` | yes | start at `1`; bump on breaking change |
| `created_at` | `datetime` | yes | UTC ISO8601 |
| `updated_at` | `datetime` | yes | UTC ISO8601 |

## `protocol_engine`

Meaning:
- one marketplace participant eligible to publish protocol signals

Owner:
- engine owns durable truth
- app reads and renders

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | canonical `engineId` |
| `schema_version` | `integer` | yes | currently `1` |
| `operator_id` | `string` | yes | stable operator identity |
| `display_name` | `string` | yes | public engine label |
| `engine_type` | `enum` | yes | `internal`, `third_party` |
| `metadata_ref` | `object` | yes | IPFS hash, document ref, or structured metadata pointer |
| `stake_state` | `enum` | yes | `none`, `pending`, `active`, `cooldown`, `withdrawn`, `slashed` |
| `engine_status` | `enum` | yes | `active`, `paused`, `slashed`, `deactivated` |
| `registered_at` | `datetime` | yes | UTC |
| `last_heartbeat_at` | `datetime` | no | UTC |
| `tags` | `string[]` | no | strategy tags such as `momentum`, `mean_reversion` |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- one `protocol_engine` maps to one operator authority
- display name may change, `id` may not
- `engine_status` and `stake_state` are distinct

## `protocol_signal_commit`

Meaning:
- the pre-reveal attestation record for a signal

Owner:
- engine writes
- worker and scoreboard consume

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable `signalId` or `commitId` |
| `schema_version` | `integer` | yes | currently `1` |
| `engine_id` | `string` | yes | owning engine |
| `commit_hash` | `string` | yes | hash of reveal payload + nonce |
| `commit_time` | `datetime` | yes | UTC |
| `reveal_deadline` | `datetime` | yes | UTC |
| `commit_status` | `enum` | yes | `committed`, `revealed`, `expired`, `invalid`, `resolved` |
| `source_chain` | `string` | no | e.g. `arbitrum`, `offchain-shadow` |
| `source_tx_ref` | `object` | no | tx hash or equivalent proof handle |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- one commit belongs to exactly one engine
- `commit_hash` is immutable
- reveal failure must not erase the commit record

## `protocol_signal_reveal`

Meaning:
- the plaintext signal revealed after commit

Owner:
- engine writes
- engine or worker verifies

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable reveal id |
| `schema_version` | `integer` | yes | currently `1` |
| `commit_id` | `string` | yes | related `protocol_signal_commit.id` |
| `engine_id` | `string` | yes | denormalized owner for faster reads |
| `asset` | `string` | yes | protocol-supported asset symbol |
| `direction` | `enum` | yes | `long`, `short` |
| `tp_bps` | `integer` | yes | take-profit in basis points |
| `sl_bps` | `integer` | yes | stop-loss in basis points |
| `valid_until` | `datetime` | yes | UTC |
| `nonce` | `string` | yes | reveal nonce |
| `reveal_time` | `datetime` | yes | UTC |
| `verification_state` | `enum` | yes | `pending`, `verified`, `invalid` |
| `verification_reason` | `string` | no | mismatch or policy reason |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- one commit may have at most one accepted reveal
- invalid reveal records are still retained for auditability

## `protocol_signal_outcome`

Meaning:
- the resolved market result of a verified signal

Owner:
- engine or worker resolves

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable outcome id |
| `schema_version` | `integer` | yes | currently `1` |
| `commit_id` | `string` | yes | source signal commit |
| `reveal_id` | `string` | yes | source reveal |
| `engine_id` | `string` | yes | owning engine |
| `entry_price` | `number` | yes | fixed reference entry |
| `exit_price` | `number` | yes | resolved reference exit |
| `exit_reason` | `enum` | yes | `tp_hit`, `sl_hit`, `timeout`, `manual_abort` |
| `outcome_label` | `enum` | yes | `win`, `loss`, `timeout`, `void` |
| `pnl_bps` | `integer` | yes | signed bps |
| `resolved_at` | `datetime` | yes | UTC |
| `price_source_ref` | `object` | yes | oracle or feed provenance |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- outcome resolution is append-first and auditable
- recomputation should create a new versioned snapshot or correction record, not silently mutate history

## `protocol_engine_performance_snapshot`

Meaning:
- aggregate performance view for one engine at a point in time

Owner:
- worker recomputes
- app reads

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable snapshot id |
| `schema_version` | `integer` | yes | currently `1` |
| `engine_id` | `string` | yes | referenced engine |
| `window_kind` | `enum` | yes | `all_time`, `rolling_30d`, `rolling_90d` |
| `total_signals` | `integer` | yes | aggregate count |
| `wins` | `integer` | yes | resolved wins |
| `losses` | `integer` | yes | resolved losses |
| `timeouts` | `integer` | yes | resolved timeouts |
| `cumulative_pnl_bps` | `integer` | yes | signed cumulative pnl |
| `hit_rate` | `number` | yes | 0..1 |
| `rolling_sharpe` | `number` | no | nullable if insufficient data |
| `max_drawdown_pct` | `number` | no | signed or absolute by policy |
| `uptime_score` | `number` | no | 0..1 |
| `snapshot_at` | `datetime` | yes | UTC |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- this is a read-model snapshot, not the primary raw evidence plane
- ranking should derive from these snapshots, not from app-side recomputation

## `protocol_engine_eligibility`

Meaning:
- the routeability state of an engine

Owner:
- worker or engine policy service computes

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable eligibility record id |
| `schema_version` | `integer` | yes | currently `1` |
| `engine_id` | `string` | yes | referenced engine |
| `eligibility_state` | `enum` | yes | `warming_up`, `eligible`, `ineligible`, `probation` |
| `effective_from` | `datetime` | yes | UTC |
| `effective_until` | `datetime` | no | UTC |
| `reasons` | `string[]` | yes | policy-readable reasons |
| `metrics_ref` | `object` | no | linked snapshot or thresholds used |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- router must read this object, not infer routeability ad hoc
- explanation reasons are part of the public trust surface

## `protocol_router_allocation_snapshot`

Meaning:
- a deterministic allocation map generated by the routing policy

Owner:
- router service computes

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable allocation snapshot id |
| `schema_version` | `integer` | yes | currently `1` |
| `router_id` | `string` | yes | logical router policy id |
| `allocation_kind` | `enum` | yes | `shadow`, `live_target` |
| `weights` | `object[]` | yes | `{ engine_id, weight_bps, rationale[] }[]` |
| `rebalance_reason` | `string` | yes | scheduled or event-driven |
| `computed_at` | `datetime` | yes | UTC |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- total weights must sum to 10000 bps or explicit cash residual policy
- each weight row must reference a stable engine id

## `protocol_settlement_record`

Meaning:
- economic settlement record for a routed position or vault cycle

Owner:
- later-phase execution and settlement logic

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable settlement id |
| `schema_version` | `integer` | yes | currently `1` |
| `allocation_snapshot_id` | `string` | yes | source routing snapshot |
| `engine_id` | `string` | yes | fee attribution engine |
| `gross_pnl` | `number` | yes | before fees |
| `net_pnl` | `number` | yes | after fees |
| `performance_fee` | `number` | yes | fee charged |
| `engine_fee_share` | `number` | yes | engine portion |
| `protocol_fee_share` | `number` | yes | protocol portion |
| `settled_at` | `datetime` | yes | UTC |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- Phase 1 may define this object without implementing it fully
- settlement should remain a separate plane from performance evidence

## Relationship Rules

| From | To | Rule |
|---|---|---|
| `protocol_engine` | `protocol_signal_commit` | one engine may create many commits |
| `protocol_signal_commit` | `protocol_signal_reveal` | one commit may have zero or one accepted reveal |
| `protocol_signal_reveal` | `protocol_signal_outcome` | one verified reveal may resolve into one outcome |
| `protocol_signal_outcome` | `protocol_engine_performance_snapshot` | snapshots aggregate many outcomes |
| `protocol_engine_performance_snapshot` | `protocol_engine_eligibility` | eligibility may reference one or more snapshots |
| `protocol_engine_eligibility` | `protocol_router_allocation_snapshot` | router only allocates toward eligible or explicitly warming engines per policy |
| `protocol_router_allocation_snapshot` | `protocol_settlement_record` | settlement records attribute economic results to routed weights |

## Separation Rule

Protocol objects are not substitutes for:

- `capture`
- `challenge`
- `pattern`
- `watch`
- `alert`
- `verdict`
- `ledger_entry`

Those remain the internal Cogochi Engine operating loop.

Protocol objects are the outer marketplace and routing loop.
