# Domain: Core Loop Object Contracts

## Purpose

Define the field-level Day-1 object contracts used by the capture-first core loop so app, engine, contract, and research work can share one vocabulary and one payload model.

This document is the field-level companion to:

- `docs/product/core-loop-agent-execution-blueprint.md`
- `docs/product/core-loop-state-matrix.md`

## Read Order

For core-loop implementation or QA:

1. `docs/domains/contracts.md`
2. `docs/product/pages/00-system-application.md`
3. `docs/product/core-loop-agent-execution-blueprint.md`
4. this file
5. `docs/product/core-loop-state-matrix.md`
6. target surface spec and domain doc

## Global Rules

1. Every durable object has:
   - stable `id`
   - `schema_version`
   - `created_at`
   - `updated_at`
2. Every cross-object relation must use stable ids, not display labels.
3. `challenge` may remain the internal evaluated artifact even when user-facing copy says `setup`.
4. Manual and automatic verdicts must remain separately attributable.
5. App may shape view models, but engine-owned persistence remains truth.

## Identity and Versioning

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | UUID or slug-safe stable identifier |
| `schema_version` | `integer` | yes | start at `1`; bump on breaking changes |
| `created_at` | `datetime` | yes | UTC ISO8601 |
| `updated_at` | `datetime` | yes | UTC ISO8601 |

## `capture`

Meaning:
- exact reviewed chart evidence saved from terminal

Owner:
- terminal creates
- engine-backed persistence stores durable truth

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | durable capture id |
| `schema_version` | `integer` | yes | currently `1` |
| `symbol` | `string` | yes | exchange symbol |
| `timeframe` | `string` | yes | e.g. `15m`, `1h`, `4h` |
| `range_start` | `datetime` | yes | selected range start |
| `range_end` | `datetime` | yes | selected range end |
| `range_kind` | `enum` | yes | `review`, `candidate`, `alert`, `instance_replay` |
| `source_ref` | `object` | no | source ids such as `candidate_id`, `alert_id`, `challenge_slug` |
| `ohlcv_slice` | `object` | yes | selected range candle payload or immutable reference |
| `indicator_slice` | `object` | yes | OI, funding, volume, structure, and related visible context |
| `note` | `string` | no | short thesis authored against that exact range |
| `similarity_seed` | `object` | no | normalized retrieval seed for similar-capture preview |
| `status` | `enum` | yes | `saved`, `archived` |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- `capture` must always represent a concrete selected range
- no saved capture without `symbol`, `timeframe`, `range_start`, and `range_end`
- notes are optional, but when present they are attached to the selected range, not the symbol generally

## `challenge`

Meaning:
- evaluated setup hypothesis projected from captures or explicit structured intent

Owner:
- lab owns evaluation lifecycle

| Field | Type | Required | Notes |
|---|---|---:|---|
| `slug` | `string` | yes | stable challenge identifier |
| `schema_version` | `integer` | yes | currently `1` |
| `source_capture_ids` | `string[]` | yes | one or more capture ids |
| `projection_mode` | `enum` | yes | `capture_only`, `capture_plus_hint`, `explicit_query` |
| `title` | `string` | yes | user-visible setup label |
| `description` | `string` | no | lab-readable summary |
| `direction` | `enum` | no | `long`, `short`, `both`, `unknown` |
| `timeframe` | `string` | yes | canonical evaluation timeframe |
| `universe` | `string` | yes | evaluation universe name |
| `definition_ref` | `object` | yes | contract-safe reference to `answers.yaml`, `match.py`, or equivalent definition |
| `evaluation_status` | `enum` | yes | `projected`, `queued`, `running`, `evaluated`, `accepted`, `rejected`, `failed`, `archived` |
| `latest_summary` | `object` | no | latest deterministic evaluation summary |
| `artifacts_ref` | `object` | no | instance/result artifact locations |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- every challenge must trace to at least one capture or one explicit structured input path
- lab may refine challenge representation, but must not silently sever source capture links

## `pattern`

Meaning:
- reusable runtime representation used by monitoring and refinement layers

Owner:
- engine and research layers

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable runtime pattern id |
| `schema_version` | `integer` | yes | currently `1` |
| `challenge_slug` | `string` | yes | originating evaluated challenge |
| `pattern_family` | `string` | yes | pattern grouping label |
| `runtime_state` | `enum` | yes | `candidate`, `active`, `paused`, `retired` |
| `matching_strategy` | `enum` | yes | `state_machine`, `similarity`, `deterministic_ml`, `hybrid` |
| `threshold_profile` | `object` | yes | active thresholds used by runtime |
| `summary_stats` | `object` | no | success rate, coverage, decay, etc. |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- UI must not invent pattern ids locally
- pattern runtime state is downstream of evaluation and refinement, not a terminal-owned action

## `watch`

Meaning:
- live monitoring registration for an evaluated setup

Owner:
- lab activates
- dashboard manages continuity state

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable watch id |
| `schema_version` | `integer` | yes | currently `1` |
| `challenge_slug` | `string` | yes | evaluated challenge being monitored |
| `pattern_id` | `string` | no | linked runtime pattern when present |
| `status` | `enum` | yes | `live`, `paused`, `retired` |
| `delivery_targets` | `string[]` | yes | dashboard, terminal, telegram, etc. |
| `activation_source` | `enum` | yes | `lab_evaluate_accept` only in Day-1 |
| `scope` | `object` | yes | symbols, timeframe, universe, or phase scope |
| `last_evaluated_summary` | `object` | no | copied summary for dashboard context |
| `activated_at` | `datetime` | yes | UTC |
| `paused_at` | `datetime` | no | UTC |
| `retired_at` | `datetime` | no | UTC |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- no new watch activation from terminal or dashboard in Day-1
- dashboard may pause, resume, or retire an existing watch

## `alert`

Meaning:
- live market event emitted for a watch or active pattern context

Owner:
- scanner and alerts pipeline

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable alert id |
| `schema_version` | `integer` | yes | currently `1` |
| `watch_id` | `string` | no | primary link when alert comes from watch |
| `pattern_id` | `string` | no | runtime link when present |
| `challenge_slug` | `string` | yes | user-readable setup context |
| `symbol` | `string` | yes | alerted symbol |
| `timeframe` | `string` | yes | alert timeframe |
| `detected_at` | `datetime` | yes | UTC |
| `phase_summary` | `string` | no | e.g. `accumulation`, `breakout risk` |
| `score_summary` | `object` | no | deterministic engine or ML scoring summary |
| `drilldown_context` | `object` | yes | replay context needed for terminal open |
| `dedup_key` | `string` | yes | stable dedup identity |
| `manual_verdict_state` | `enum` | yes | `pending`, `agree`, `disagree` |
| `auto_verdict_state` | `enum` | yes | `pending`, `hit`, `miss`, `void` |
| `status` | `enum` | yes | `pending`, `judged`, `archived` |
| `created_at` | `datetime` | yes | UTC |
| `updated_at` | `datetime` | yes | UTC |

Rules:

- every alert must support terminal drilldown
- manual and automatic verdict state cannot overwrite each other into one ambiguous field

## `verdict`

Meaning:
- explicit judgment record attached to an alert, instance, or other evaluable subject

Owner:
- engine stores truth
- dashboard and outcome systems contribute sources

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable verdict id |
| `schema_version` | `integer` | yes | currently `1` |
| `subject_kind` | `enum` | yes | `alert`, `instance`, `challenge_outcome` |
| `subject_id` | `string` | yes | referenced object id |
| `source` | `enum` | yes | `manual`, `auto` |
| `label` | `enum` | yes | `agree`, `disagree`, `hit`, `miss`, `void` |
| `confidence` | `number` | no | optional for auto verdicts |
| `note` | `string` | no | optional user or operator note |
| `recorded_at` | `datetime` | yes | UTC |
| `recorded_by` | `string` | yes | `user:<id>` or `system:auto` |

Rules:

- verdicts are append-first records, not mutable booleans
- one subject may have both manual and automatic verdict records

## `ledger_entry`

Meaning:
- durable aggregation-ready record linking outcomes, verdicts, and performance evidence

Owner:
- engine and research layers

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | `string` | yes | stable ledger record id |
| `schema_version` | `integer` | yes | currently `1` |
| `capture_id` | `string` | no | upstream source capture |
| `challenge_slug` | `string` | no | evaluated setup link |
| `watch_id` | `string` | no | live monitoring link |
| `alert_id` | `string` | no | alert link |
| `verdict_ids` | `string[]` | no | linked manual/auto verdict ids |
| `outcome_metrics` | `object` | yes | pnl, duration, regime bucket, etc. |
| `bucket_keys` | `object` | yes | symbol, timeframe, btc regime, pattern family, user scope |
| `recorded_at` | `datetime` | yes | UTC |

Rules:

- ledger entries are append-only evidence rows
- aggregate views should derive from ledger entries, not rewrite them

## Relationship Rules

| From | To | Rule |
|---|---|---|
| `capture` | `challenge` | one capture may project into zero, one, or many challenges |
| `challenge` | `pattern` | one accepted challenge may yield one or more runtime patterns |
| `challenge` | `watch` | watch activation requires evaluated challenge context |
| `watch` | `alert` | alerts may only exist against a live or recently live watch/pattern context |
| `alert` | `verdict` | alert may collect manual and automatic verdicts independently |
| all | `ledger_entry` | ledger records unify cross-object outcome evidence |

## Day-1 Prohibited Shapes

1. `watch` without `challenge_slug`
2. `alert` without drilldown context
3. `capture` without explicit range bounds
4. single merged verdict field that hides manual vs auto source
5. UI-only generated `pattern_id` with no engine-backed source
