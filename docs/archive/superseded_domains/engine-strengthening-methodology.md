# Domain: Engine Strengthening Methodology

## Goal

Define the operating method for strengthening the Cogochi engine after the core
loop proof.

This is the concrete methodology for turning trader memory into stronger engine
behavior:

```text
Raw trader memory
  -> Pattern Wiki Compiler
  -> PatternDraft
  -> SearchQuerySpec
  -> Feature / Sequence Search
  -> Benchmark / Replay
  -> Outcome / Verdict Ledger
  -> Refinement
  -> Promotion Gate
  -> Runtime Pattern / Alert Policy
```

The goal is not to add more indicators, more prompts, or a larger model. The
goal is to make every improvement pass through reusable features, durable
sequence truth, measured search quality, reject-inclusive evidence, and explicit
promotion gates.

Benchmarking and recording for these improvements is defined in:

- `docs/domains/engine-performance-benchmark-lab.md`

## Boundary

Owns:

- feature truth strengthening method
- sequence/runtime truth strengthening method
- search quality method
- negative-set and failure-memory method
- promotion-gate method
- first implementation order after core loop proof

Does not own:

- UI layout
- provider selection
- raw market-data vendor decisions
- model-training implementation details
- signal publishing distribution channels

Those are downstream or adjacent work items.

## Design Thesis

The engine gets stronger when four conditions are true:

1. every pattern reads the same canonical feature facts
2. every candidate preserves phase sequence and duration evidence
3. every search result can be judged against positive and negative cases
4. every runtime promotion references measured outcomes and rollback rules

If any condition is missing, the system becomes one of the weaker products this
architecture is trying to avoid:

- a scanner with many indicators
- an AI chart explanation tool
- a backtest toy
- a signal feed without trust

## Pillar 1: Feature Truth

### Purpose

Make reusable feature production the shared substrate for capture, search,
runtime state, benchmark replay, and AI context.

### Canonical Inputs

- raw OHLCV bars
- perp metrics: OI, funding, long/short ratio, liquidation aggregates
- orderflow metrics when available
- capture range refs
- pattern family and phase hints

### Canonical Outputs

- `feature_windows`
- `search_corpus_signatures`
- `pattern_events`
- compact AI projections

### Required Rule

Pattern logic may interpret features, but it may not recompute generic feature
math such as z-score, slope, percentile, divergence, duration, or regime.

### Minimum Feature Set

P0 features:

- `price_dump_pct`
- `higher_low_count`
- `breakout_strength`
- `oi_change_pct`
- `oi_zscore`
- `oi_spike_flag`
- `oi_hold_flag`
- `oi_reexpansion_flag`
- `funding_rate_zscore`
- `funding_extreme_short_flag`
- `volume_zscore`
- `volume_spike_flag`

P1 false-positive reducers:

- `range_width_pct`
- `pullback_depth_pct`
- `compression_ratio`
- `oi_slope`
- `funding_flip_flag`
- `volume_dryup_flag`
- `liq_imbalance`
- `liq_nearby_density`
- `cvd_divergence_price`
- `bars_since_event`
- `signal_duration`
- `trend_regime`

### Verification Metrics

| Metric | Target | Why |
|---|---:|---|
| capture feature coverage | `>= 95%` | saved setups must be modelable |
| corpus signature coverage | `>= 95%` for active symbols/timeframes | search cannot rely on ad hoc recompute |
| feature schema version present | `100%` | search and training must be reproducible |
| materializer failure rate | `< 1%` per job run | feature plane must be operational |
| stale feature window age | below scheduler SLA | live candidates need fresh evidence |

### Failure Modes

- Feature values differ between capture and search for the same window.
- Search uses compact corpus signatures while runtime uses a different feature
  calculation path.
- AI summaries mention signals that are not materialized.
- Pattern families introduce private feature names outside the engine vocabulary.

### First Implementation Slice

`FeatureWindowStore search cutover`

Deliverables:

- similar search reads canonical `feature_windows` before legacy signatures
- corpus refresh writes `search_corpus_signatures` from the same feature names
- capture records store or reference `feature_schema_version`
- tests cover feature coverage and fallback behavior

Gate:

- TRADOOR/PTB capture-to-similar search returns candidates with canonical
  feature snapshots and no hidden app-side feature joins.

## Pillar 2: Sequence Truth

### Purpose

Make phase path the durable identity of a pattern instance.

Feature similarity can find candidates, but sequence truth decides whether a
candidate is structurally similar.

### Canonical Objects

- `PatternRuntimeState`
- `PhaseTransitionEvent`
- `ScanCycle`
- `CandidateEvent`

### State Contract

State answers:

```text
Where is this symbol now for this pattern?
```

Transition answers:

```text
What changed, at which bar, and because of which evidence?
```

Both are required.

### Required Fields

`PatternRuntimeState` must preserve:

- `definition_id`
- `symbol`
- `venue`
- `timeframe`
- `current_phase`
- `phase_entered_at`
- `bars_in_phase`
- `last_transition_at`
- `latest_feature_window_ref`
- `state_version`

`PhaseTransitionEvent` must preserve:

- `transition_id`
- `scan_cycle_id`
- `definition_id`
- `symbol`
- `from_phase`
- `to_phase`
- `bar_timestamp`
- `feature_window_ref`
- `triggering_signals`
- `transition_type`
- `backfill`

### Runtime Rules

- state updates are idempotent by `(definition_id, symbol, timeframe, bar_ts)`
- transition events are append-only
- backfill may reconstruct state, but must be marked as backfill
- runtime state may reference feature windows but must not own feature math
- process restart must not lose current phase path

### Verification Metrics

| Metric | Target | Why |
|---|---:|---|
| restart divergence | `0` against pre-restart state | state must be durable |
| duplicate transitions per bar | `0` | scan cycles must be idempotent |
| optimistic conflict rate | `< 5%` | worker concurrency must be healthy |
| backfill reconstruction coverage | `>= 90%` active symbols | cold start must not blind the system |
| phase transition artifact coverage | `100%` for candidates | search needs sequence evidence |

### Failure Modes

- A symbol already in `ACCUMULATION` is invisible after restart.
- App displays a phase that cannot be traced to an engine transition event.
- Search uses phase labels inferred from a single row instead of transition path.
- Multi-instance workers diverge on the same symbol/pattern state.

### First Implementation Slice

`Durable phase state shadow mode`

Deliverables:

- durable state store
- transition event store
- scan cycle idempotency key
- backfill job for one reference pattern
- shadow comparison against current in-memory state

Gate:

- seven-day shadow run with zero phase divergence for the reference pattern.

## Pillar 3: Search Quality Stack

### Purpose

Make query-by-example search a measured, multi-stage retrieval pipeline instead
of a single feature distance or LLM judgment.

### Pipeline

```text
Stage 0. Intent / Draft
  Pattern Wiki or parser emits PatternDraft candidate

Stage 1. Candidate Generation
  SQL/corpus hard filter over feature_windows and search_corpus_signatures

Stage 2. Sequence Matching
  phase-path edit distance + duration similarity + forbidden-signal penalties

Stage 3. Reranker
  LightGBM or equivalent supervised ranker after enough verdict data exists

Stage 4. Optional LLM Judge
  explanation only; never source of final ranking truth
```

### Stage 1 Rules

- optimize for recall, not precision
- use required signals and timeframe/symbol scope
- supplement with vector similarity only when hard filter underfills
- output 100-500 candidates

Stage 1 required artifact:

- `CandidateGenerationRun`

Required stats:

- candidate count
- filter predicates
- feature schema version
- missing-feature count
- duration

### Stage 2 Rules

- compare ordered phase paths
- include duration similarity
- penalize forbidden signals instead of always hard-excluding
- output 20-50 candidates

Base score:

```text
sequence_score =
  0.60 * phase_path_similarity
  + 0.30 * duration_similarity
  + 0.10 * direction_or_context_match
```

Stage 2 required artifact:

- `SequenceMatchRun`

Required stats:

- phase path score
- duration score
- forbidden signal hits
- observed vs query path
- selected feature refs

### Stage 3 Rules

- run in shadow mode until enough verdicts exist
- group training examples by query/search run
- train on both positive and negative labels
- calibrate raw scores before promotion
- never overwrite rule-first phase truth

Minimum precondition:

- 50+ user verdicts globally for the family before supervised shadow scoring
- 100+ verdicts before promotion consideration

Training labels:

| Verdict | Label |
|---|---:|
| `VALID` | `1.0` |
| `NEAR_MISS` | `0.6` |
| `TOO_EARLY` | `0.4` |
| `TOO_LATE` | `0.3` |
| `INVALID` | `0.0` |

Stage 3 required artifact:

- `RerankerShadowRun`

Promotion metric:

- NDCG@5 improvement `>= +0.05` over sequence-only baseline

### Stage 4 Rules

- only runs for explanation, close-score review, or explicit user request
- cannot change final ranking order
- must return structured output
- explanation must cite feature/sequence evidence refs

### Verification Metrics

| Metric | Target | Why |
|---|---:|---|
| top-5 human relevance | `>= 60%` first gate | search must feel useful |
| no-LLM latency | `< 2s` target, `< 5s` limit | search must stay interactive |
| stage underfill rate | `< 10%` | corpus coverage must be sufficient |
| sequence artifact coverage | `100%` for top-k | ranking must be explainable |
| reranker lift | NDCG@5 `>= +0.05` | ML must beat baseline |

### Failure Modes

- Top results look visually similar but miss the critical phase order.
- Reranker learns from auto outcomes only and amplifies false positives.
- LLM judge starts acting as the real ranker.
- Search artifacts are not persisted, so later verdicts cannot train the system.

### First Implementation Slice

`TRADOOR/PTB benchmarked search pack`

Deliverables:

- one `SearchQuerySpec`
- one benchmark pack with reference and negative cases
- Stage 1+2 artifact persistence
- top-k evaluation report

Gate:

- 10 manual eval queries with top-5 relevance `>= 60%`.

## Pillar 4: Negative Set And Failure Memory

### Purpose

Make failures first-class training and refinement assets.

The engine cannot improve if it stores only wins. Search quality depends on
knowing what looked similar but failed.

### Negative Types

| Type | Meaning | Use |
|---|---|---|
| `hard_negative` | required features matched, outcome failed | reranker and threshold tightening |
| `near_miss` | phase path similar, one transition missing or late | sequence tuning |
| `fake_hit` | auto outcome hit, user says invalid | outcome policy and feature weighting |
| `too_early` | detected before actionable phase | alert policy and phase duration |
| `too_late` | detected after breakout/edge decayed | candidate surfacing timing |
| `regime_mismatch` | pattern worked only in incompatible market regime | regime filter |

### Required Fields

```text
negative_id
source_candidate_id
source_search_run_id
definition_id
negative_type
reason
failed_phase
failed_signal
feature_window_ref
phase_path_ref
outcome_ref
verdict_ref
curated_by
created_at
```

### Lifecycle

```text
Candidate generated
  -> outcome or user verdict disagrees with rank
  -> negative candidate proposed
  -> auto or human curation assigns negative_type
  -> negative enters benchmark pack or reranker training set
  -> refinement uses it as guardrail
```

### Curation Rules

- high similarity + `MISS` should propose `hard_negative`
- high sequence score + missing action phase should propose `near_miss`
- auto `HIT` + user `INVALID` should propose `fake_hit`
- any negative used in promotion eval must keep source refs
- rejected hypotheses are retained, not deleted

### Verification Metrics

| Metric | Target | Why |
|---|---:|---|
| negative coverage per promoted pattern | `>= 20%` of benchmark pack | avoids winner-only overfit |
| negative reason coverage | `>= 90%` | failures must be interpretable |
| hard-negative replay inclusion | `100%` for promotion packs | prevents repeated known mistakes |
| stale uncategorized negatives | `< 10%` | memory must stay useful |

### Failure Modes

- Bad candidates are deleted instead of categorized.
- Negative labels have no source feature or phase refs.
- Reranker trains only on hits and misses the most confusing examples.
- Prompt changes try to fix what should be a threshold or rule-registry issue.

### First Implementation Slice

`NegativeSet for TRADOOR/PTB`

Deliverables:

- two to five curated negative cases
- negative-set JSON artifact
- benchmark pack includes at least one negative case
- wiki pages preserve why each negative looks similar and why it fails

Gate:

- benchmark report shows both positive recall and negative rejection behavior.

## Pillar 5: Promotion Gate

### Purpose

Prevent unverified pattern changes, reranker changes, and alert policies from
touching live runtime behavior.

### Promotion Pack

Every promoted pattern or variant must have:

- `definition_ref`
- `feature_schema_version`
- `signal_vocab_version`
- `SearchQuerySpec`
- `BenchmarkPack`
- `NegativeSet`
- `EvaluationProtocol`
- `OutcomePolicy`
- `SelectionDecision`
- `RollbackRule`

### Promotion States

```text
draft
  -> compiled
  -> benchmarked
  -> shadow
  -> visible_ungated
  -> ranked
  -> gated
  -> promoted
  -> paused | deprecated
```

### Gate Criteria

`compiled` requires:

- valid `PatternDraft`
- known signal ids
- ordered phase path
- feature schema version

`benchmarked` requires:

- reference cases
- holdout or negative cases
- persisted search/replay artifact
- baseline metrics

`shadow` requires:

- runtime can score without changing user-visible alerts
- outcomes are logged
- divergence is measured

`visible_ungated` requires:

- search quality gate passed
- alert/candidate drilldown available
- user can submit verdict

`ranked` requires:

- reranker or score policy has shadow evidence
- calibration report exists

`gated` requires:

- promotion decision references benchmark, negative set, and rollback rule
- alert policy state is explicit

`promoted` requires:

- owner approval
- scoped runtime activation
- monitoring metrics and pause criteria

### Verification Metrics

| Metric | Target | Why |
|---|---:|---|
| promotion pack completeness | `100%` | no invisible authority |
| rollback rule coverage | `100%` | live changes must be reversible |
| post-promotion false-positive drift | bounded by decision | protects user trust |
| verdict rate on visible candidates | `>= 30%` target | learning loop must close |
| paused-on-regression latency | within SLA | bad variants must stop quickly |

### Failure Modes

- A search winner becomes runtime behavior without holdout/negative evidence.
- Alert policy and model promotion are conflated.
- A personal variant mutates canonical pattern definition.
- Runtime rollback is manual and undocumented.

### First Implementation Slice

`Promotion pack template`

Deliverables:

- template markdown or JSON schema for a promotion pack
- one TRADOOR/PTB draft promotion pack
- explicit rejection criteria
- rollback checklist

Gate:

- no pattern can be called promoted unless the pack is complete.

## Cross-Pillar Artifact Map

| Artifact | Produced By | Consumed By | Truth Level |
|---|---|---|---|
| `PatternWiki Page` | Pattern Wiki Compiler | parser/search/research | hypothesis |
| `PatternDraft` | parser or wiki compiler | QueryTransformer | structured hypothesis |
| `SearchQuerySpec` | QueryTransformer | search engine | deterministic query |
| `FeatureWindow` | feature plane | search/runtime/AI projection | engine fact |
| `PhaseTransitionEvent` | runtime state plane | search/ledger/refinement | engine fact |
| `BenchmarkPack` | research plane | search/eval/promotion | eval contract |
| `NegativeSet` | ledger/research/wiki | reranker/eval/refinement | failure memory |
| `SelectionDecision` | methodology plane | promotion gate | promotion evidence |
| `PromotionPack` | promotion gate | runtime/alert policy | activation contract |

## First 30-Day Implementation Order

1. `Pattern Wiki Compiler skeleton`
   - create file-backed wiki structure
   - encode TRADOOR/PTB thesis, phases, signals, reference cases, negatives
   - compile draft artifacts

2. `Engine Performance Benchmark Lab baseline`
   - create improvement card for FeatureWindowStore search cutover
   - run baseline TRADOOR/PTB Stage 1+2 benchmark
   - record metrics and comparison template before implementation

3. `FeatureWindowStore search cutover`
   - similar search and corpus signatures read canonical features
   - capture/search candidates expose feature schema refs

4. `TRADOOR/PTB Stage 1+2 search eval`
   - benchmark pack with reference and negative cases
   - persisted candidate generation and sequence match artifacts
   - manual top-k eval report

5. `NegativeSet lifecycle`
   - create curated negative records
   - link negatives to benchmark pack and reranker training surface

6. `Promotion pack template`
   - define runtime activation states and rollback checklist
   - keep all candidates below `visible_ungated` until evidence exists

## Read Order For Related Work

1. `docs/domains/pattern-wiki-compiler.md`
2. `docs/domains/pattern-draft-query-transformer.md`
3. `docs/domains/canonical-indicator-materialization.md`
4. `docs/domains/pattern-engine-runtime.md`
5. `docs/domains/multi-timeframe-autoresearch-search.md`
6. `docs/domains/refinement-methodology.md`
7. `docs/domains/engine-performance-benchmark-lab.md`
8. this document

## Final Rule

Strengthening the engine means making the loop more reproducible, more
reject-aware, and more promotion-safe.

Any change that improves a demo but bypasses feature truth, sequence truth,
negative memory, or promotion evidence is not an engine-strengthening change.
