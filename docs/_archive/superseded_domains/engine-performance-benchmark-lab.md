# Domain: Engine Performance Benchmark Lab

## Goal

Define the benchmark and recording system for engine performance improvements.

The lab exists to make engine work measurable:

```text
Improvement hypothesis
  -> baseline benchmark
  -> scoped implementation
  -> same benchmark rerun
  -> comparison report
  -> accept / reject / shadow / promote
```

No engine performance claim is accepted unless it has a baseline, a repeatable
benchmark command, recorded metrics, and a decision.

## Boundary

Owns:

- benchmark protocol
- benchmark pack taxonomy
- performance and quality metrics
- result recording format
- improvement decision rules
- regression guardrails

Does not own:

- feature semantics
- pattern definitions
- live alert policy
- model architecture
- UI presentation

Those stay in the relevant engine, search, runtime, and app domains.

## Design Rule

Performance means two things, and both must be measured:

1. **quality performance**
   - better retrieval
   - better phase matching
   - fewer false positives
   - better negative rejection
   - better outcome expectancy

2. **systems performance**
   - lower latency
   - lower scan cost
   - higher feature coverage
   - more stable scheduler/runtime behavior
   - fewer degraded or missing-data cases

An optimization that improves latency while lowering pattern quality is not a
win. A model that improves score while breaking latency or reproducibility is
not a win.

## Existing Repo Anchors

Use these first instead of inventing a second benchmark framework:

- `engine/research/eval_protocol.py`
- `engine/research/tracker.py`
- `engine/search/quality_ledger.py`
- `engine/research/pattern_search.py`
- `engine/research/market_retrieval.py`
- `engine/research/pattern_search/benchmark_packs/*.json`
- `research/experiments/`
- `research/experiments/experiment_log.jsonl`
- `engine/tests/test_pattern_search_quality_slice.py`
- `engine/tests/test_market_retrieval.py`
- `engine/tests/test_quality_ledger.py`
- `engine/tests/test_similar_search.py`

## Benchmark Ladder

### Level 0: Unit / Contract Bench

Purpose:

- prove the changed function preserves behavior
- catch obvious regressions quickly

Examples:

- feature calculation snapshots
- signal vocabulary mapping
- phase-path distance
- candidate scoring math
- query transformer determinism

Required output:

- test command
- pass/fail
- changed files

Promotion value:

- cannot promote quality claims, only correctness claims

### Level 1: Golden Fixture Bench

Purpose:

- test one known reference case with fixed expected behavior

Examples:

- PTB/TRADOOR reference window
- known fake accumulation negative
- known breakout-too-late case

Required output:

- candidate rank
- expected phase path match
- missing signals
- latency

Promotion value:

- catches local breakage before larger search packs run

### Level 2: Pattern Benchmark Pack

Purpose:

- test one pattern family against reference, holdout, and negative cases

Examples:

- `tradoor-oi-reversal-v1__ptb-tradoor-v1`
- `wyckoff-spring-reversal-v1__wsr-v1`
- `funding-flip-reversal-v1__ffr-v1`

Required output:

- top-k relevance
- reference score
- holdout score
- negative rejection
- stage latency
- feature coverage
- artifact refs

Promotion value:

- required before search/ranking changes can affect visible candidates

### Level 3: Market Corpus Bench

Purpose:

- test search and scan behavior over many symbols/windows

Examples:

- cached 1h market corpus
- top-N active universe
- latest 7d / 30d / 180d windows

Required output:

- stage 1 candidate count
- top-k quality sample
- p50/p95/p99 latency
- missing-data rate
- symbols scanned per second
- feature coverage by timeframe

Promotion value:

- required before scheduler or corpus changes are considered operational

### Level 4: Shadow Runtime Bench

Purpose:

- run the new logic in shadow mode beside current runtime

Examples:

- new phase-state store beside in-memory runtime
- reranker shadow score beside sequence-only score
- new alert policy before user-visible activation

Required output:

- divergence rate
- false-positive drift
- outcome drift
- verdict drift
- latency and error-rate deltas
- pause criteria

Promotion value:

- required before runtime or alert-policy activation

## Metric Families

### Retrieval Quality Metrics

| Metric | Meaning | First Target |
|---|---|---:|
| `top_5_relevance` | human-reviewed relevant hits in top 5 | `>= 0.60` |
| `top_10_relevance` | human-reviewed relevant hits in top 10 | `>= 0.50` |
| `reference_rank` | rank of known reference/holdout case | lower is better |
| `negative_rejection_rate` | confusing negatives pushed below top-k | `>= 0.70` |
| `phase_path_score_mean` | average Stage 2 phase similarity | track delta |
| `duration_score_mean` | duration similarity for matched candidates | track delta |

### Outcome Quality Metrics

| Metric | Meaning | First Target |
|---|---|---:|
| `hit_rate` | auto/user accepted hit rate | pattern-specific |
| `expected_value` | avg reward minus avg loss | `> 0` |
| `peak_return_pct_mean` | average max favorable move | track delta |
| `invalid_rate` | user invalid verdict rate | reduce |
| `too_late_rate` | candidates after edge decayed | reduce |
| `too_early_rate` | candidates before actionable phase | reduce |

### Systems Metrics

| Metric | Meaning | First Target |
|---|---|---:|
| `search_latency_p50_ms` | median search latency | `< 1000` |
| `search_latency_p95_ms` | p95 search latency | `< 3000` |
| `candidate_gen_ms` | Stage 1 time | `< 500` target |
| `sequence_match_ms` | Stage 2 time | `< 1000` target |
| `feature_coverage` | candidates with canonical feature refs | `>= 0.95` |
| `missing_data_rate` | candidates degraded by missing cache/features | `< 0.05` |
| `scan_symbols_per_sec` | corpus/runtime throughput | track delta |

### Regression Guardrails

Any benchmark run must fail the promotion decision if:

- `top_5_relevance` drops by more than `5%`
- `negative_rejection_rate` drops by more than `10%`
- p95 latency doubles without explicit acceptance
- feature coverage falls below `95%`
- missing data rate rises above `5%`
- an existing golden fixture changes rank or phase path without explanation

## Improvement Hypothesis Card

Every serious engine improvement starts with a card.

```yaml
improvement_id: perf-YYYYMMDD-slug
owner: engine | research
pattern_family: tradoor-oi-reversal-v1
primary_target: retrieval_quality | latency | coverage | outcome_quality
hypothesis: >
  Batch FeatureWindowStore enrichment will improve Layer A quality and reduce
  p95 search latency by avoiding per-candidate feature fetches.
baseline_ref:
benchmark_levels:
  - level_1_golden_fixture
  - level_2_pattern_pack
success_metrics:
  top_5_relevance_delta: ">= +0.10"
  search_latency_p95_delta: "<= -0.25"
guardrails:
  negative_rejection_delta: ">= 0"
  feature_coverage: ">= 0.95"
decision: proposed | accepted | rejected | shadow | promoted
```

Rules:

- the card must name one primary target
- success metrics must be numeric
- guardrails must include at least one quality metric and one systems metric
- no implementation is called successful without a post-change comparison

## Benchmark Run Record

Every benchmark run writes a record compatible with `research/experiments`.

Minimum files:

```text
research/experiments/{timestamp}-{benchmark-name}/
  params.json
  metrics.json
  notes.md
  artifacts/
```

Recommended `params.json`:

```json
{
  "schema_version": 1,
  "benchmark_name": "tradoor-stage12-search-pack",
  "improvement_id": "perf-20260425-feature-window-cutover",
  "git_sha": "abc123",
  "pattern_family": "tradoor-oi-reversal-v1",
  "benchmark_level": "level_2_pattern_pack",
  "benchmark_pack_ref": "engine/research/pattern_search/benchmark_packs/tradoor-oi-reversal-v1__ptb-tradoor-v1.json",
  "candidate_limit": 500,
  "top_k": 10,
  "feature_schema_version": "v1",
  "search_version": "stage12-v1"
}
```

Recommended `metrics.json`:

```json
{
  "schema_version": 1,
  "status": "completed",
  "retrieval_quality": {
    "top_5_relevance": 0.6,
    "top_10_relevance": 0.5,
    "negative_rejection_rate": 0.75,
    "phase_path_score_mean": 0.72,
    "duration_score_mean": 0.64
  },
  "systems": {
    "search_latency_p50_ms": 820,
    "search_latency_p95_ms": 2400,
    "candidate_gen_ms": 430,
    "sequence_match_ms": 780,
    "feature_coverage": 0.97,
    "missing_data_rate": 0.02
  },
  "guardrails": {
    "passed": true,
    "failures": []
  }
}
```

Recommended `notes.md`:

```md
# Benchmark Notes

## Hypothesis

## Baseline

## Change

## Result

## Guardrails

## Decision

## Follow-up
```

## Comparison Report

Every improvement needs one comparison report.

```text
Baseline Run: research/experiments/{baseline}
Candidate Run: research/experiments/{candidate}
Decision: accepted | rejected | shadow | needs_more_data
```

Report fields:

- primary target delta
- quality guardrail deltas
- systems guardrail deltas
- artifact links
- decision owner
- next action

Decision rules:

- `accepted`: success metric passed and guardrails passed
- `shadow`: success metric passed but runtime risk needs observation
- `rejected`: success metric failed or guardrail failed
- `needs_more_data`: sample size or coverage too low

## High-Leverage Improvement Tracks

### Track A: FeatureWindowStore Cutover

Hypothesis:

- canonical feature snapshots improve retrieval quality and reduce missing-data
  drift.

Benchmarks:

- Level 1 golden fixture
- Level 2 TRADOOR/PTB pack
- Level 3 market corpus feature coverage

Target:

- feature coverage `>= 95%`
- top-5 relevance `+10%`
- missing-data rate `< 5%`

### Track B: Batch Search Enrichment

Hypothesis:

- batch fetch feature windows and phase history once per candidate group instead
  of per candidate.

Benchmarks:

- Level 2 pack latency
- Level 3 market corpus latency

Target:

- p95 search latency `-25%`
- no quality regression

### Track C: Phase Path Signature Index

Hypothesis:

- precomputing compact phase-path signatures makes Stage 2 faster and more
  stable.

Benchmarks:

- Level 2 sequence quality
- Level 3 Stage 2 latency

Target:

- sequence_match_ms `-40%`
- phase_path_score_mean unchanged or better

### Track D: Negative-Aware Rerank Baseline

Hypothesis:

- hard negatives and near misses improve top-k quality before heavier ML.

Benchmarks:

- Level 2 pattern pack
- Level 4 shadow reranker

Target:

- negative rejection `+20%`
- top-5 relevance no regression

### Track E: Replay Top-K Pruning

Hypothesis:

- replay only the top-N candidates after feature/sequence filtering.

Benchmarks:

- Level 2 pack replay duration
- Level 3 corpus run cost

Target:

- replay runtime `-50%`
- holdout score no regression

## First 14-Day Plan

1. Create a benchmark card for `FeatureWindowStore search cutover`.
2. Run and record a baseline TRADOOR/PTB Stage 1+2 benchmark.
3. Implement only the smallest cutover or batch enrichment slice.
4. Rerun the exact same benchmark.
5. Write a comparison report.
6. Accept, reject, or move the change to shadow based on guardrails.

## Final Rule

Do not call it an engine improvement because it feels better.

Call it an engine improvement only when the recorded benchmark says:

- quality improved or held
- latency/cost/coverage improved
- regressions were checked
- the decision is written down
