# Experiment Objective — `rq-b-real-data-2026-04-11`

**Status**: Pre-registered. First experiment that exercises the
research-spine DB read path end-to-end (E5 of the harness engine
integration plan). Companion to the synthetic ladder run already
landed at `rq-b-sample-size-2026-04-11`.

## Research Question

**RQ-B** — Sample-size ladder: at what point on a real-data ladder
does `RuleBased(RuleSetV1_20260411)` cross the CI95-excludes-zero
threshold against `Random` on the same trajectories?

The synthetic companion (`rq-b-sample-size-2026-04-11`) confronted
the bound on a generated fixture and reported pooled-pair saturation
as the dominant constraint. This experiment carries the same shape
across the v2 DB read surface so the moment real production rows
land via the E7 live scan loop, the ladder can be re-run and a
direct synthetic-vs-real comparison becomes possible without code
changes.

## Hypothesis

**H0 (re-statement on real data)**: Within the geometric ladder
`N ∈ {50, 100, 200, 400, 800}` of v2 trajectories filtered through
`createDbDatasetSource`, the rule-based agent's pooled per-decision
utility is statistically indistinguishable from the random agent's
(CI95 of the paired difference contains zero).

**H1**: There exists a smallest `N* ∈ [50, 800]` at which the CI95
of `rule_utility − random_utility` excludes zero.

This pre-registration intentionally does not narrow `N*` further
than the synthetic version's `[50, 500]` bound — the synthetic test
already reported pooled-pair saturation, and we want to see whether
real data exhibits the same plateau before tightening the
hypothesis.

## Pre-registered parameters

- **Source**: `createDbDatasetSource({ symbol: 'BTCUSDT', limit:
  10_000 })` against the live `decision_trajectories` table, filtered
  on `verdict_block IS NOT NULL AND outcome_features IS NOT NULL`
  per the E5 source contract.
- **Schedule**: `createGeometricSchedule({ from: 50, to: 800, factor:
  2 })` — same five cells as the synthetic ladder.
- **Agents**: `Random` + `RuleBased(RuleSetV1_20260411)` from the
  default registry.
- **Split override**: identical to the synthetic ladder
  (`trainDurationFloor=3d`, `embargoDuration=6h`, `testDuration=1d`,
  `purgeDuration=6h`, `maxFolds=10`).
- **Bootstrap**: 2000 iterations, seed `7 ^ N`, confidence 95%.
- **Experiment seed**: 2026 (matches the synthetic ladder).

## Success criteria

1. `runExperiment` returns without throwing for every cell that has
   enough trajectories to build at least one fold.
2. Every fold's `integrity.assertionsRan` covers the six R4.1 codes
   (`config_within_bounds`, `resolved_outcomes_only`,
   `sorted_by_knowledge_horizon`,
   `train_horizon_strictly_before_test_start`, `embargo_satisfied`,
   `purge_applied`).
3. Each non-skipped cell produces a `pairedBootstrapCI` result with
   non-null `diffMean` and `ci95`.
4. The generated report at
   `docs/generated/research/report-rq-b-real-data-2026-04-11.md`
   states one of three outcomes per cell: `significant`, `not
   significant`, or `insufficient_data` (skipped because no fold
   could be built).

## Insufficient-data semantics

Until the E7 live scan loop lands and starts persisting v2
trajectories, the production `decision_trajectories` table will
contain zero rows that satisfy `verdict_block IS NOT NULL AND
outcome_features IS NOT NULL`. The experiment must handle this
gracefully:

1. Attempt to connect to the DB via `process.env.DATABASE_URL`. If
   no `DATABASE_URL` is set, mark the run as `data_mode=no_db`.
2. If a DB is reachable but returns zero rows, mark as
   `data_mode=db_empty`.
3. If a DB returns fewer rows than the schedule's smallest cell
   (`N=50`), mark as `data_mode=db_underpopulated` and skip the
   ladder.
4. In any of the three insufficient cases, write a report whose
   "Hypothesis confrontation" section reports `INSUFFICIENT_DATA`
   and exits 0. The pipeline executed; only the data was missing.
5. If the DB has at least 50 rows, run the full ladder against the
   real data and report cell-by-cell as in the synthetic ladder.

This is the "pipeline execution is the smoke" stance from the
harness-engine integration plan §3 E5 acceptance: "may report
'insufficient data' when DB is empty; that's a valid outcome — the
smoke is that the pipeline executes".

## Reference

- `docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md`
  §3 E5
- `docs/exec-plans/active/research-rq-b-sample-size-2026-04-11.md` —
  the synthetic ladder pre-registration this experiment mirrors
- `src/lib/research/source/db.ts` — DB-backed `DatasetSource`
- `src/lib/server/journal/trajectoryWriter.ts` — E4 v2 row writer +
  parser used by the source
- `scripts/research/experiments/rq-b-sample-size-2026-04-11/experiment.mjs` —
  template that this experiment is structurally derived from
