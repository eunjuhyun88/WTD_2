# Core Loop System Spec

## Purpose

This document turns the core loop from a product idea into an operating system specification.

The question is not only "what is the loop?" but:

- what starts the loop
- what data each stage emits
- which surface owns each user action
- which engine lane owns each computation
- what closes the loop back into better future detection

The reference case is the TRADOOR/PTB OI-reversal pattern, but the structure must generalize to any saved pattern family.

## One-Cycle Definition

One full cycle is complete only when all of the following happen:

1. a trader articulates a setup from real market experience
2. the setup is turned into a reusable pattern definition
3. the scanner watches the full universe for that pattern
4. the engine detects an actionable phase
5. the user inspects and saves or rejects the surfaced setup
6. the result is later judged automatically or manually
7. the judged result is written into the ledger
8. the system uses accumulated judged results to improve future detection

If the loop stops before step 8, the product is only a scanner.

## Product Thesis

Cogochi is not primarily "AI that gives opinions."

It is:

- a capture system for trader judgment
- a scanning system for recurring market structure
- a verification system for whether saved structure actually worked
- a refinement system that gets better from judged outcomes

This is why the product’s five verbs matter:

- `Scan`
- `Chat`
- `Judge`
- `Train`
- `Deploy`

The three Day-1 active surfaces split those verbs across one operating loop:

- `/terminal`: review real trades, inspect chart evidence, select range, save capture
- `/lab`: evaluate, compare, inspect, run
- `/dashboard`: monitor inbox, active watches, alerts, adapters

## Reference Pattern: TRADOOR/PTB OI Reversal

The reference pattern is the seed pattern for the system specification.

### Five phases

| Phase | Name | Meaning | Action |
|---|---|---|---|
| 1 | `FAKE_DUMP` | weak flush with limited conviction | do not enter |
| 2 | `ARCH_ZONE` | rebound or compression likely to retest lows | wait |
| 3 | `REAL_DUMP` | real positioning event with OI and volume confirmation | mark structural anchor |
| 4 | `ACCUMULATION` | higher lows, OI held, funding transition, tighter invalidation | actionable entry zone |
| 5 | `BREAKOUT` | expansion after accumulation | outcome confirmation, often late |

### Design implication

The system must optimize for surfacing `ACCUMULATION`, not for confirming `BREAKOUT`.

That is the product edge.

## Loop Stages

### Stage 0. Trigger: Real Trade Review

Source:

- missed trade
- recovered trade
- good trade
- failed trade
- live chart segment currently under inspection

User artifact:

- narrative review
- screenshot or chart memory
- specific observations about OI, funding, volume, structure, and timing
- selected chart range that says "this is the exact segment I mean"

Canonical output:

- `Pattern Hypothesis`
- `Chart Range Selection`

Day-1 surface owner:

- `/terminal`

This is the point where raw trader intuition enters the system.

`Chart Range Selection` is the minimum durable Day-1 input artifact.

It must identify:

- `symbol`
- `timeframe`
- `range_start`
- `range_end`
- `selection_origin`: `visible_range` | `drag_brush` | `replay_range`
- `captured_at`

Required user actions in Day-1:

1. open the reviewed chart context in `/terminal`
2. inspect the exact range that expresses the setup thesis
3. attach narrative reasoning when helpful
4. use `Save Setup` to persist the reviewed segment as durable evidence

Important rule:

- this review/capture step belongs to `/terminal`; it is not primarily a later `/lab` annotation task
### Stage 1. Pattern Definition

Goal:

- turn a review into a machine-readable pattern contract

Canonical output:

- `Pattern Definition`

Fields:

- `pattern_slug`
- `name`
- `description`
- `phases[]`
- `entry_phase`
- `target_phase`
- `timeframe`
- `universe_scope`
- `feature_schema_version`
- `label_policy_version`
- `created_by`
- `source_review_ref`

Reference implementation shape:

- `Pattern Object`
- required blocks
- optional blocks
- disqualifiers
- min/max bars

### Stage 2. Watch Activation

Goal:

- move a pattern from passive definition to active market monitoring

Canonical output:

- `Watch Record`

Fields:

- `watch_id`
- `pattern_slug`
- `status`: `live` | `paused`
- `watch_scope`
- `delivery_targets`
- `created_at`

Day-1 surface owner:

- `/terminal` for creating from current context
- `/dashboard` for pausing/resuming existing watches

### Stage 3. Market Scan

Goal:

- compute evidence over the active universe and feed the pattern runtime

Engine owner:

- scanner runtime

Canonical output:

- `Scan Cycle`
- `Signal Snapshot`

`Scan Cycle` fields:

- `scan_id`
- `started_at`
- `completed_at`
- `universe_version`
- `symbols_scanned`
- `data_quality`

`Signal Snapshot` fields:

- `symbol`
- `timeframe`
- `timestamp`
- `feature_vector`
- `layer summary`
- `alpha score` or equivalent market context

Design rule:

- scan cycles are operational records
- they are not the same thing as pattern entries

### Stage 4. Phase Tracking

Goal:

- determine where each symbol currently sits inside a pattern

Engine owner:

- `Pattern Runtime Plane`

Canonical output:

- `Pattern State`
- `Phase Transition Event`

`Pattern State` fields:

- `pattern_slug`
- `symbol`
- `current_phase`
- `entered_at`
- `bars_in_phase`
- `last_transition_at`
- `block_coverage`
- `latest_feature_snapshot_ref`

`Phase Transition Event` fields:

- `transition_id`
- `pattern_slug`
- `symbol`
- `from_phase`
- `to_phase`
- `timestamp`
- `reason`
- `feature_snapshot`
- `block_coverage`

Important rule:

- the current state must be durable
- the transition event must be append-only

State answers "where are we now?"
Transition answers "what just happened?"

Both are required.

### Stage 5. Actionable Candidate Surfacing

Goal:

- promote symbols in the action phase into reviewable candidates

Canonical output:

- `Candidate Event`

Fields:

- `candidate_id`
- `pattern_slug`
- `symbol`
- `phase`
- `transition_id`
- `candidate_score`
- `delivery_policy_state`
- `candidate_created_at`

Reference action phase:

- `ACCUMULATION`

Surface owners:

- `/terminal` shows the candidate in live context
- `/dashboard` shows it as inbox / signal alert

Design rule:

- candidate surfacing is not the same as final alert delivery policy
- candidate generation belongs to the pattern runtime
- visibility and ranking belong to the alert policy plane

### Stage 6. User Inspection

Goal:

- let the trader decide whether the surfaced candidate is worth saving or ignoring

Surface owner:

- `/terminal`

Required UI components:

- chart board
- pattern status or entry signal strip
- explanatory AI block or context panel
- explicit chart-range selection affordance
- save action

Required user actions:

1. verify that the surfaced symbol still matches the trader's structural thesis
2. mark the exact chart range that justifies the save
3. optionally record a short narrative note about the setup
4. save the setup or explicitly ignore it

Canonical output:

- none yet if ignored
- `Capture Record` if saved

Important rule:

- inspection happens in chart context
- if the chart cannot render, the core loop is broken
- if the user cannot mark the exact segment to save, the core loop is incomplete
- `Save Setup` is the moment a review becomes durable product data, not an auxiliary UI action

### Stage 7. Capture

Goal:

- convert one inspected candidate into durable ground truth material

This is the canonical meaning of `Save Setup`.
Terminal owns this action even when the inspected setup originated from an engine candidate.

Canonical output:

- `Capture Record`

Fields:

- `capture_id`
- `pattern_slug`
- `symbol`
- `timeframe`
- `candidate_id`
- `transition_id`
- `captured_at`
- `range_start`
- `range_end`
- `selection_origin`
- `chart_context_ref`
- `ohlcv_slice_ref`
- `indicator_slice_ref`
- `pattern_context_ref`
- `user_note`
- `source_surface`
- `capture_mode`: `pattern_candidate` | `manual_pattern_seed` | `challenge_seed`

Design rule:

- capture is the bridge from human judgment to modelable data
- capture is not just a UI bookmark
- capture must preserve the selected chart segment, not only the latest symbol state

Minimum selected-range evidence:

- OHLCV bars for the selected range
- rendered indicator slices for the selected range
- active symbol and timeframe
- visible pattern/runtime context when available
- current feature snapshot and block scores when the save originated from a candidate

Two save paths share the same substrate:

1. `manual_pattern_seed`
   - user marks a chart segment first
   - system saves selected-range evidence even without candidate linkage

2. `pattern_candidate`
   - user inspects a surfaced candidate
   - system still saves selected-range evidence, plus `candidate_id` and `transition_id`

### Stage 8. Outcome Evaluation

Goal:

- determine what happened after capture or entry

Canonical outputs:

- `Outcome Record`
- `Evaluation Event`

Possible judges:

- automatic time-window judge
- user verdict
- later combined final verdict

`Outcome Record` fields:

- `capture_id` or `entry_id`
- `peak_price`
- `exit_price`
- `breakout_at`
- `invalidated_at`
- `evaluation_window_hours`
- `auto_outcome`
- `manual_verdict`
- `final_outcome`

Design rule:

- auto evaluation and manual judgment are separate signals
- they should not overwrite each other blindly

### Stage 9. Ledger Aggregation

Goal:

- aggregate outcomes into reproducible evidence

Surface owner:

- `/lab`
- `/dashboard`

Canonical outputs:

- pattern statistics
- instance table
- readiness summary

Records required:

- entry record
- score record
- outcome record
- verdict record
- model record
- training run record

This is where the system answers:

- did the pattern work
- under what regime
- with what expected value
- with what coverage and hit rate

### Stage 10. Refinement

Goal:

- use judged outcomes to improve future detection

Canonical outputs:

- `Refinement Proposal`
- `Refined Pattern Version`
- `Threshold Policy Update`
- `Model Candidate`

Example proposal:

- "OI threshold 15%로 올릴까요?"

What can be refined:

- block threshold
- phase condition
- optional/disqualifier logic
- alert sensitivity
- pattern weights
- user-specific variants

Design rule:

- refinement should begin with rule and threshold changes before expensive model rollout

### Stage 11. Train / Deploy

Goal:

- promote accumulated data into better scoring or adapter behavior

Canonical outputs:

- `Training Run`
- `Model Candidate`
- `Rollout Decision`
- `Deployment Record`

This stage has four maturity phases:

1. hill climbing / threshold tuning
2. KTO or preference fine-tuning
3. ORPO/DPO style pair optimization
4. per-user LoRA or adapter deployment

Design rule:

- `Train` and `Deploy` are downstream of judged evidence
- they are not part of the raw signal runtime

## Surface Responsibilities

### `/terminal`

Primary job:

- observe live market context
- compose or refine a pattern query
- inspect a live candidate
- save a setup
- give immediate yes/no judgment

Must own:

- current symbol and timeframe context
- chart rendering
- selected chart-range capture
- quick capture flow
- inline AI interpretation

Must not own:

- canonical pattern truth
- final scoring logic
- persistent runtime state

### `/lab`

Primary job:

- inspect pattern quality over history
- run evaluation
- compare instances
- inspect score and outcome distributions
- decide whether a pattern deserves promotion

Must own:

- challenge and pattern inventory
- metrics and score cards
- instance tables
- evaluation run initiation

Must not own:

- real-time scanning
- live alert routing

### `/dashboard`

Primary job:

- inbox for active work
- watching state
- pending feedback
- recent alerts
- adapter status

Must own:

- watch list
- signal inbox
- pending feedback queue
- recent model or adapter status

Must not own:

- detailed pattern editing
- full evaluation workflows

## Runtime Lanes

### Lane 1. App-Web

Responsibilities:

- render surfaces
- proxy thin engine routes
- capture user actions
- display pattern and alert state

### Lane 2. Engine-API

Responsibilities:

- pattern definitions
- phase tracking
- candidate generation
- deterministic stats
- capture ingestion
- verdict ingestion

### Lane 3. Worker-Control

Responsibilities:

- scheduled scans
- auto evaluation
- dataset generation
- refinement proposal generation
- training and rollout jobs

### Lane 4. Data Plane

Responsibilities:

- state store
- ledger store
- training projections
- model registry

## Canonical Entities

At minimum, the core loop needs these entities.

| Entity | Purpose |
|---|---|
| `Pattern Definition` | reusable pattern contract |
| `Watch Record` | active monitoring intent |
| `Scan Cycle` | operational scan run metadata |
| `Signal Snapshot` | market evidence at a point in time |
| `Pattern State` | current state of one symbol inside one pattern |
| `Phase Transition Event` | append-only state change record |
| `Candidate Event` | actionable surfaced signal |
| `Capture Record` | user-saved setup |
| `Outcome Record` | actual post-capture result |
| `Verdict Record` | user or system judgment |
| `Refinement Proposal` | suggested rule or threshold improvement |
| `Training Run` | ML optimization artifact |
| `Deployment Record` | model or adapter rollout artifact |

## Data Flow

```text
Trader review
  -> Pattern Definition
  -> Watch Activation
  -> Scan Cycle
  -> Pattern State / Transition
  -> Candidate Event
  -> Terminal inspection
  -> Capture Record
  -> Outcome + Verdict
  -> Lab metrics + Dashboard inbox
  -> Refinement Proposal / Training Run
  -> Updated future Candidate Events
```

## Three AutoResearch Layers Inside The Loop

### Layer 1. Feature Vector Similarity

Use:

- broad, cheap retrieval

Best place in the loop:

- scan-time prefilter
- lab-time comparison

### Layer 2. Event Sequence Matching

Use:

- compare how closely a symbol follows the five-phase sequence

Best place in the loop:

- phase tracking
- candidate scoring

### Layer 3. LLM Chart Interpretation

Use:

- interpret chart image plus numeric context into structured language

Best place in the loop:

- terminal inspection
- refinement support
- later dataset enrichment

Design rule:

- these layers stack
- they do not replace each other

## Day-1 vs Later Phases

### Day-1 must have

- pattern definition
- watch activation
- scan cycles
- phase tracking
- candidate surfacing
- chart inspection
- save setup
- outcome recording
- manual or auto verdict
- lab and dashboard visibility

### Later phases add

- stronger alert policy
- training registry
- KTO / ORPO / LoRA rollout
- user-specific deployed adapters

## Core Rule

The core loop is healthy only when:

- a saved pattern can become a live watch
- a live watch can become a surfaced candidate
- a surfaced candidate can become a saved capture
- a saved capture can become a judged outcome
- a judged outcome can change future detection quality

If any one of those links is missing, the system is incomplete.
