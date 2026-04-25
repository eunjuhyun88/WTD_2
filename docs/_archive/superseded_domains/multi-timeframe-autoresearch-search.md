# Domain: Multi-Timeframe AutoResearch Search

## Goal

Define the architecture that turns one saved trader-described setup into a multi-timeframe, multi-duration, replay-first search problem that can discover similar structures across other symbols and periods.

This domain extends the core loop from:

`capture -> pattern -> scan`

to:

`capture -> benchmark pack -> pattern family search -> replay restore -> candidate surfacing -> outcome -> refinement`

## Problem Restatement

The current pattern runtime is too narrow for the target use case.

Current bottlenecks:

1. `run_pattern_scan()` is latest-bar oriented, so it cannot reconstruct an in-flight multi-phase setup after cold start.
2. `PhaseCondition` assumes `ALL required`, so real market variants that are structurally equivalent but not identical are dropped.
3. the ledger records outcomes, but not enough failed-attempt evidence to explain how detection should improve.

The target user expectation is stronger:

- the user points to a chart segment and says "this structure"
- the system should find the same structure on other charts
- the system should search across timeframes and durations automatically
- the system should learn why misses happened and propose better contracts

This makes the problem a query-by-example search problem, not only a fixed-rule scanner problem.

## Design Principles

1. Rule-first remains the runtime authority.
2. Timeframe is a searchable dimension, not a fixed assumption.
3. Pattern identity is event-sequence based, not candle-shape based.
4. Replay restore is mandatory before live latest-bar evaluation.
5. Promotion requires robustness across holdout symbols and periods, not just one benchmark hit.
6. Failed refinement attempts are durable knowledge, not throwaway logs.
7. The product is infrastructure-first: canonical runtime and search are managed centrally; user tuning is an overlay, not the core truth.

## Infra-First Product Shape

The target system should be treated as shared pattern-search infrastructure, not only as one opinionated app.

### 1. Canonical Infra Plane

Owns:

- pattern queries
- normalized patterns
- replay restoration
- pattern runtime
- candidate ledger
- outcome ledger
- refinement search lanes
- promotion gate

This is the durable moat and the only canonical truth.

### 2. Control Plane

Owns:

- benchmark packs
- search runs
- variant registry
- rollout state
- promotion decisions
- negative-result memory

This is the operating system for autoresearch, not the public app runtime.

### 3. Managed Defaults

Owns:

- canonical pattern families
- default timeframe families
- default thresholds and score weights
- default alert modes

This is the system-provided intelligence that should work out of the box.

### 4. User Overlay Plane

Owns:

- sensitivity preference
- timeframe preference
- symbol scope
- alert density
- conservative/early bias
- optionally forked personal variants

This layer must not mutate canonical contracts directly. It should resolve to:

- an overlay on top of one canonical variant
- or an explicitly forked personal variant with separate evaluation records

## Canonical Loop

The full infrastructure loop should be modeled as:

`Save Setup -> Pattern Query -> Benchmark Pack -> Pattern Family Search -> Replay Restore -> Candidate -> Outcome -> Refinement -> Promotion -> Managed Default or User Overlay`

If the loop stops before refinement and promotion, the system is still only a scanner.

## Search Axes

Every search run operates across three independent axes.

### 1. Bar Timeframe

Candidate timeframe family for the first slice:

- `5m`
- `15m`
- `30m`
- `1h`
- `4h`
- `1d`

The first implementation should start narrower, typically:

- `15m`
- `1h`
- `4h`

### 2. Pattern Duration

Duration is not reducible to timeframe.

Examples:

- a `15m` pattern may span 2 days
- a `1h` pattern may span 8 days
- a `4h` pattern may span 1 month

Each variant must therefore track:

- `bar_count`
- `wall_clock_duration`
- `phase duration bands`

### 3. Historical Search Horizon

The same pattern family should be replayed over:

- recent lookback windows for fast iteration
- longer historical windows for robustness
- holdout periods for promotion safety

## Canonical Objects

### Pattern Query

The raw trader-originating example.

```json
{
  "query_id": "uuid",
  "source_capture_id": "uuid",
  "symbol": "PTBUSDT",
  "timeframe": "15m",
  "range_start": "2026-04-13T00:00:00Z",
  "range_end": "2026-04-14T18:00:00Z",
  "notes": [
    "real dump then OI hold",
    "higher lows before breakout"
  ],
  "created_at": "2026-04-17T12:00:00Z"
}
```

### Normalized Pattern

A timeframe-normalized event-sequence representation derived from one or more queries.

```json
{
  "normalized_pattern_id": "uuid",
  "pattern_family_slug": "oi-reversal-family-v1",
  "phase_order": [
    "FAKE_DUMP",
    "ARCH_ZONE",
    "REAL_DUMP",
    "ACCUMULATION",
    "BREAKOUT"
  ],
  "event_markers": [
    "price_dump",
    "oi_expansion",
    "post_dump_hold",
    "higher_lows",
    "breakout_expansion"
  ],
  "duration_ratios": {
    "real_dump_to_accumulation": 0.18,
    "accumulation_to_breakout": 0.42
  }
}
```

### Replay Benchmark Pack

The canonical evaluation pack that drives search, replay scoring, and promotion.

```json
{
  "benchmark_pack_id": "uuid",
  "pattern_family_slug": "oi-reversal-family-v1",
  "reference_queries": ["uuid-1", "uuid-2"],
  "candidate_timeframes": ["15m", "1h", "4h"],
  "expected_phase_paths": [
    {
      "symbol": "PTBUSDT",
      "timeframe": "15m",
      "expected_path": ["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION", "BREAKOUT"]
    }
  ],
  "holdout_symbols": ["TRADOORUSDT", "USELESSUSDT"],
  "holdout_periods": [
    {"start": "2026-01-01T00:00:00Z", "end": "2026-03-01T00:00:00Z"}
  ]
}
```

### Pattern Variant

A concrete contract candidate for one timeframe and one rule set.

```json
{
  "variant_id": "uuid",
  "pattern_family_slug": "oi-reversal-family-v1",
  "variant_slug": "oi-reversal-family-v1__1h__funding-bias",
  "timeframe": "1h",
  "phase_contract_version": 3,
  "feature_schema_version": 2,
  "timeframe_family": ["15m", "1h", "4h"],
  "search_origin": "incremental",
  "active_hypothesis": [
    "allow positive_funding_bias as accumulation substitute",
    "widen real_dump_to_accumulation window"
  ]
}
```

### Replay State Result

Replay-first restoration output for one symbol and one variant.

```json
{
  "pattern_slug": "oi-reversal-family-v1__1h__funding-bias",
  "symbol": "PTBUSDT",
  "timeframe": "1h",
  "current_phase": "ACCUMULATION",
  "last_anchor_transition_id": "uuid",
  "candidate_status": "visible",
  "phase_history": [
    {"phase": "REAL_DUMP", "at": "2026-04-14T13:00:00Z"},
    {"phase": "ACCUMULATION", "at": "2026-04-14T19:00:00Z"}
  ],
  "phase_scores_by_bar": [
    {"timestamp": "2026-04-14T19:00:00Z", "phase": "ACCUMULATION", "score": 0.78}
  ]
}
```

### Search Run

A parallel refinement execution over many candidate variants.

```json
{
  "search_run_id": "uuid",
  "pattern_family_slug": "oi-reversal-family-v1",
  "lane": "incremental",
  "benchmark_pack_id": "uuid",
  "n_variants": 16,
  "objective": "maximize accumulation recall under false-positive ceiling",
  "started_at": "2026-04-17T12:30:00Z",
  "completed_at": "2026-04-17T12:43:00Z",
  "winner_variant_id": "uuid",
  "runner_up_diverse_variant_id": "uuid"
}
```

### Promotion Report

The explicit gate record used before one variant becomes active.

```json
{
  "promotion_report_id": "uuid",
  "variant_id": "uuid",
  "reference_recall": 0.83,
  "phase_fidelity": 0.77,
  "lead_time_bars": 5.2,
  "false_discovery_rate": 0.19,
  "robustness_spread": 0.11,
  "holdout_passed": true,
  "decision": "promote_candidate"
}
```

### User Overlay

The first user-facing customization layer should remain narrow and safe.

```json
{
  "overlay_id": "uuid",
  "user_id": "uuid",
  "base_variant_id": "uuid",
  "timeframe_preference": "auto",
  "detection_mode": "balanced",
  "alert_density": "medium",
  "symbol_scope": "all",
  "sensitivity_delta": 0.05,
  "created_at": "2026-04-17T13:00:00Z"
}
```

The overlay should compile to a derived runtime view without mutating the base canonical variant.

## Pattern Contract Extensions

`engine/patterns/types.py` should evolve from strict phase booleans to score-capable contracts.

Recommended new fields on `PhaseCondition`:

- `required_any_groups: list[list[str]]`
- `soft_blocks: list[str]`
- `phase_score_threshold: float | None`
- `transition_window_bars: int | None`
- `anchor_from_previous_phase: bool`
- `anchor_phase_id: str | None`
- `duration_band_bars: tuple[int, int] | None`

Meaning:

- `required_blocks`: all must fire
- `required_any_groups`: at least one block from each group must fire
- `soft_blocks`: contribute score but do not gate entry
- `phase_score_threshold`: minimum score for score-based entry
- `transition_window_bars`: bars allowed since anchor phase
- `anchor_from_previous_phase`: this phase depends on a prior structural event

### Example: ACCUMULATION

Recommended first contract shape:

- hard required:
  - `higher_lows_sequence`
  - `oi_hold_after_spike`
- one-of group:
  - `funding_flip`
  - `positive_funding_bias`
  - `ls_ratio_recovery`
- soft blocks:
  - `volume_dryup`
  - `bollinger_squeeze`
  - `post_dump_compression`
  - `reclaim_after_dump`
- disqualifier:
  - `oi_spike_with_dump`
- anchor:
  - `REAL_DUMP`
- score threshold:
  - `0.70`

## Replay Restore Plane

New module:

- `engine/patterns/replay.py`

Purpose:

- replay recent bars for a symbol and restore the current pattern state
- persist phase attempts and anchor transitions
- decouple historical restoration from live latest-bar evaluation

Canonical function:

```python
def replay_pattern_window(
    pattern_slug: str,
    symbol: str,
    *,
    timeframe: str,
    lookback_bars: int = 336,
) -> ReplayStateResult:
    ...
```

Execution order:

1. load recent klines + perp data for the candidate timeframe
2. compute full block masks once
3. replay bar-by-bar through the state machine
4. capture anchors, attempts, scores, and final current phase
5. pass restored state into live latest-bar scan

`engine/patterns/scanner.py` should become:

`replay restore -> latest evaluate -> candidate emit`

## Score-Based Phase Runtime

The runtime should shift from:

- `all required blocks -> phase advance`

to:

- `hard constraints + one-of groups + score threshold + anchor guards`

Example accumulation score:

```text
ACCUMULATION score =
  0.40 * higher_lows_sequence
+ 0.30 * oi_hold_after_spike
+ 0.15 * positive_funding_bias_or_flip
+ 0.10 * post_dump_compression
+ 0.05 * volume_dryup
```

Entry rule:

- hard required satisfied
- one-of group satisfied
- score >= threshold
- previous anchor phase was `REAL_DUMP`
- still inside transition window

## Additional Feature Blocks

Recommended first additions:

- `positive_funding_bias`
  - rolling funding mean is positive
- `funding_recovery`
  - funding is rising from post-dump lows
- `ls_ratio_recovery`
  - long/short ratio recovers after dump
- `post_dump_compression`
  - realized range shrinks after the dump event
- `reclaim_after_dump`
  - price reclaims part of the dump candle or dump anchor level

These are not independent pattern families. They are variant-generating primitives for the search lane.

## Candidate and Failure Ledger

Outcome-only storage is insufficient. The system must persist why near-miss candidates failed.

### Phase Attempt Record

```json
{
  "attempt_id": "uuid",
  "pattern_slug": "oi-reversal-family-v1__1h__funding-bias",
  "symbol": "PTBUSDT",
  "timeframe": "1h",
  "from_phase": "REAL_DUMP",
  "attempted_phase": "ACCUMULATION",
  "phase_score": 0.64,
  "missing_blocks": ["positive_funding_bias"],
  "failed_reason": "below_threshold",
  "anchor_transition_id": "uuid",
  "attempted_at": "2026-04-14T19:00:00Z"
}
```

### Negative Search Memory

```json
{
  "negative_result_id": "uuid",
  "search_run_id": "uuid",
  "variant_id": "uuid",
  "failure_class": "precision_collapse",
  "summary": "accumulation recall improved but false discovery rate exceeded ceiling",
  "do_not_repeat_until": "2026-05-17T00:00:00Z"
}
```

This memory is used to reduce repeated exploration of known-bad regions.

## Evaluation Layers

The search and promotion loop should use three evaluation layers.

### 1. Local Replay Eval

Purpose:

- fast iteration against reference captures

Metrics:

- reference recall
- phase fidelity
- lead time

### 2. Shadow Scan Eval

Purpose:

- replay recent universe windows to estimate live candidate quality

Metrics:

- candidate count stability
- false discovery rate
- cross-symbol robustness

### 3. Promotion Eval

Purpose:

- evaluate on holdout symbols and periods not used in search

Metrics:

- holdout recall
- robustness spread
- alert-policy readiness

Promotion must not rely on one good benchmark pack score.

## Search Lanes

The refinement plane should run at least three lanes.

### Incremental Lane

Searches near the current contract:

- threshold sweeps
- one-of group changes
- soft-block weight changes
- min/max bar changes

### Architecture Lane

Searches structural changes:

- anchor logic changes
- new phase guards
- new scoring terms

### Reset Lane

Ignores the current contract and regenerates phase decomposition from captures, replay traces, and ledger evidence.

This is the anti-local-optimum lane and should be triggered after repeated stagnation.

Recommended rule:

- force one reset search after 3 consecutive non-improving search runs

## Managed Defaults vs User Tuning

The system should not begin by exposing full rule editing to users.

Recommended rollout:

1. managed canonical pattern family works out of the box
2. user chooses safe presets:
   - `early`
   - `balanced`
   - `conservative`
3. user optionally changes scope:
   - timeframe preference
   - symbol scope
   - alert density
4. advanced users may fork a personal variant only after enough evidence exists

Rationale:

- infra remains comparable and governable
- canonical improvements stay promotable
- users get value before learning the internal contract system
- overfitting risk is lower than with free-form rule editing

## Parallel Refinement Runner

The search runner belongs in `worker-control`, not the public runtime.

Canonical inputs:

- `benchmark_pack_id`
- `search_lane`
- `base_variant_id`
- `n_variants`
- `timeframe_family`
- `objective`
- `evaluation_policy`

Canonical outputs:

- ranked variants
- winner variant
- most diverse viable variant
- negative-result memory records
- promotion recommendation or rejection

## Promotion Gate

A variant may become `candidate` or `active` only if all of the following are true:

- benchmark reference recall exceeds floor
- phase fidelity exceeds floor
- lead time remains positive and meaningful
- false discovery rate is below ceiling
- robustness spread stays within policy bounds
- holdout symbols and periods pass

Recommended first gate:

- keep one high-scoring winner
- also keep one structurally diverse runner-up

This avoids collapse into one brittle optimum.

## Metrics

The search objective should optimize a bundle, not one metric.

Primary metrics:

- `reference_recall`
- `phase_fidelity`
- `lead_time_bars`
- `false_discovery_rate`
- `robustness_spread`

Secondary metrics:

- `candidate_volume_stability`
- `breakout_conversion_rate`
- `alert_precision`

## First Implementation Slice

The first slice should remain narrow and end-to-end.

1. add `engine/patterns/replay.py`
2. extend `PhaseCondition` for one-of groups and score thresholds
3. add `positive_funding_bias`
4. make `ACCUMULATION` score-based with `REAL_DUMP` anchor
5. write `phase_attempt_record`
6. add replay-based tests for PTB/TRADOOR benchmark cases

This is enough to move the engine from:

- "can evaluate the latest bar"

to:

- "can restore a live in-flight sequence and explain why it did or did not surface a candidate"

## Implementation Phases

### Phase 1: Runtime Foundation

- replay restore
- score-based phase contracts
- additional post-dump/funding-bias blocks
- phase-attempt ledger records

### Phase 2: Search Infrastructure

- benchmark pack persistence
- parallel refinement runner
- variant registry
- negative-result memory

### Phase 3: Promotion and Managed Defaults

- promotion report generation
- rollout state management
- managed default canonical families

### Phase 4: User Overlay

- safe presets
- overlay compilation
- optional personal variant fork path

## Non-Goals

- replacing rule-first runtime with pure ML retrieval
- searching arbitrary continuous timeframe scales in the first slice
- full UI redesign for benchmark-pack authoring
