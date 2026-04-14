# Domain: Pattern ML

## Goal

Turn pattern-entry ML from shadow-only instrumentation into a production-safe scoring system without breaking the rule-first pattern engine or the app-engine boundary.

## Current Baseline

The current engine already has the correct first slice in place:

- `building_blocks -> state_machine -> entry event` is the rule-first source of truth
- entry-time `feature_snapshot` is persisted in the ledger
- entry-time ML scoring runs in shadow mode only
- ledger outcomes are converted into canonical training rows
- the app only renders engine-computed shadow statistics

This baseline is directionally correct, but it is not yet the final production architecture.

Current architectural gaps:

- pattern ML scoring is still loaded through a generic `get_engine(user_id)` path instead of a pattern-model identity
- model persistence is split between `models/lgbm/...` and `models_store/...`
- the ledger is still a JSON append store, which is acceptable for development but not for sustained multi-user operations
- `confidence` in the pattern state machine still means block coverage, while other scoring layers use the same word differently
- alert gating is not yet governed by an explicit rollout or promotion policy

## Target Architecture

### Runtime Layers

1. Pattern Runtime
   - lives in `engine/patterns`
   - evaluates building-block outputs, advances state machines, and emits entry/success/failure events
   - never owns model training or promotion logic

2. Pattern Ledger Plane
   - owns durable records for entries, scores, outcomes, model versions, and training runs
   - is the canonical source for audits, backfills, and dataset generation
   - is DB-backed in production; local JSON remains development fallback only

3. Pattern Scoring Plane
   - loads the currently active or shadow pattern model for a given pattern contract
   - scores canonical persisted feature rows
   - records score metadata, threshold policy metadata, and model version

4. Pattern Training and Calibration Plane
   - runs in `worker-control`
   - builds datasets from durable ledger records
   - trains, evaluates, calibrates, and promotes candidate models
   - never runs inline on the public web runtime

5. Alert Policy Plane
   - consumes rule-based entry events plus model scores
   - decides whether alerts are shadow-only, visible-but-ungated, or actively gated
   - is policy-driven and versioned independently from the model artifact

### Model Ownership

Pattern models are not keyed by end-user identity. They are keyed by the pattern contract they are trying to predict.

Canonical pattern-model key:

```text
pattern_slug + timeframe + target_name + feature_schema_version + label_policy_version
```

Required implications:

- different patterns do not silently share the same production model
- changing label rules or feature schema creates a new model family
- user-specific behavior belongs in notification preferences or alert delivery, not in model identity

### Pattern Contract Versions

Each scored entry must carry the following version metadata:

- `feature_schema_version`
- `label_policy_version`
- `threshold_policy_version`
- `model_version`
- `rollout_state`

This keeps training rows and score decisions reproducible even after the pattern evolves.

## Durable Records

Production persistence should model five logical record families.

### Pattern Entry Record

```json
{
  "entry_id": "uuid",
  "pattern_slug": "oi-reversal-v1",
  "symbol": "PTBUSDT",
  "entry_at": "2026-04-14T10:00:00Z",
  "entry_price": 1.234,
  "btc_regime": "bearish",
  "block_coverage": 0.75,
  "feature_snapshot": { "..." : "..." },
  "feature_schema_version": 1
}
```

### Pattern Score Record

```json
{
  "entry_id": "uuid",
  "model_key": "oi-reversal-v1:1h:breakout:v1:v1",
  "model_version": "20260414_010203",
  "rollout_state": "shadow",
  "score_state": "scored",
  "p_win": 0.72,
  "threshold": 0.55,
  "threshold_policy_version": 1,
  "threshold_passed": true,
  "scored_at": "2026-04-14T10:00:01Z"
}
```

### Pattern Outcome Record

```json
{
  "entry_id": "uuid",
  "outcome": "success",
  "peak_price": 1.52,
  "exit_price": 1.48,
  "breakout_at": "2026-04-14T16:00:00Z",
  "evaluated_at": "2026-04-17T10:00:00Z",
  "evaluation_window_hours": 72,
  "label_policy_version": 1
}
```

### Pattern Model Record

```json
{
  "model_key": "oi-reversal-v1:1h:breakout:v1:v1",
  "model_version": "20260414_010203",
  "status": "candidate",
  "trained_at": "2026-04-14T12:00:00Z",
  "metrics": {
    "pr_auc": 0.41,
    "brier": 0.18,
    "precision_at_threshold": 0.64
  }
}
```

### Pattern Training Run Record

```json
{
  "run_id": "uuid",
  "model_key": "oi-reversal-v1:1h:breakout:v1:v1",
  "dataset_size": 124,
  "wins": 51,
  "losses": 73,
  "trained_at": "2026-04-14T12:00:00Z",
  "promoted": false
}
```

These may map to separate tables or a smaller normalized schema, but these logical records must exist.

## Route Ownership and Runtime Placement

Pattern ML follows the runtime split from [ADR-004](/Users/ej/Projects/wtd-v2/docs/decisions/ADR-004-runtime-split-and-state-plane.md).

### `engine-api`

- owns pattern state, pattern stats, manual evaluation, training preview, and deterministic scoring contracts
- may expose internal score/debug endpoints if they are engine-owned and deterministic
- remains the only backend truth for pattern semantics

### `worker-control`

- owns training jobs, calibration jobs, promotion decisions, backfills, and scheduled evaluation
- reads durable ledger records and writes model registry state
- must not be a public browser-origin runtime

### `app-web`

- renders dashboards and exposes thin proxy or orchestrated routes
- may display shadow coverage, readiness, model status, and recent outcomes
- must not independently recompute train readiness or promotion decisions

## Rollout States

Pattern ML rollout is explicit and versioned.

1. `shadow`
   - score entries and record results
   - do not suppress or gate user-facing alerts

2. `candidate`
   - trained and calibrated model exists
   - report metrics and compare against baseline
   - still no production gating by default

3. `active`
   - alert policy may gate or prioritize alerts using the model
   - requires explicit promotion event and threshold policy

4. `paused`
   - model remains available for analysis but no longer influences alert flow

5. `retired`
   - historical artifact only

Rollout state belongs to the model registry, not to the UI alone.

## Training and Promotion Policy

Training eligibility and production promotion are different gates.

### Minimum Training Eligibility

- at least `MIN_TRAIN_RECORDS` usable decided entries
- at least one positive and one negative class
- canonical dataset built only from durable ledger records

### Promotion to `active`

Promotion requires more than a trainable dataset. A pattern model should not gate alerts until all of the following are true:

- shadow coverage is high enough to trust comparisons
- candidate metrics beat the non-ML baseline by a policy-defined margin
- calibration is acceptable, not just ranking quality
- the threshold policy is explicitly versioned
- a promotion record is written by `worker-control`

Recommended default:

- training can start at 20+ usable records with both classes present
- alert gating should normally wait for 100+ decided records or an explicit manual override

## Alert Policy Rules

The model returns probability. The policy decides what to do with it.

Rules:

- threshold is not embedded in the model artifact
- threshold may vary by pattern family and policy version
- shadow-mode reporting should compare:
  - overall success rate
  - above-threshold success rate
  - below-threshold success rate
  - score coverage
  - calibration metrics

This keeps model quality and alert policy separable.

## Naming Rules

To avoid semantic collisions:

- pattern state-machine `confidence` should be renamed to `block_coverage`
- ML output should use `p_win`
- user-facing conviction labels such as `high` or `medium` belong only to alert formatting or ensemble layers, not to pattern state records

## Migration Plan

1. Shadow Baseline
   - already in place
   - rule-first entries are scored and stored without gating alerts

2. Contract Hardening
   - rename `confidence` to `block_coverage`
   - introduce explicit pattern-model key and rollout-state fields

3. Registry and Training Split
   - add pattern-specific model registry
   - move training/calibration/promotion to `worker-control`

4. Durable Persistence
   - migrate JSON ledger semantics to DB-backed records
   - preserve local JSON fallback for development only

5. Controlled Activation
   - add calibrated threshold policy
   - enable alert gating only after candidate metrics and promotion checks pass

## Non-Goals

- replacing the rule-based pattern engine with ML
- per-user pattern model training as the default operating mode
- putting training or promotion logic on the public app runtime
- turning AUC alone into the production promotion criterion
