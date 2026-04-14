# RQ-B Baseline Evaluation Protocol

## Goal

Provide one fixed, low-overhead evaluation protocol for the current baseline-comparison loop.

## Research question

RQ-B asks when a non-random baseline first shows statistically meaningful utility lift over `Random` on a fixed schedule of sample sizes.

## Canonical baselines

- `Random`
- `RuleBased(RuleSetV1_20260411)`

Future baselines may be added, but changes to this set should be treated as a protocol revision rather than a silent edit.

## Data modes

- synthetic trajectories via `createSyntheticSource`
- DB-backed trajectories via `createDbDatasetSource`

The protocol stays the same across both modes. Only the source changes.

## Fixed evaluation rules

- split family: temporal folds with train floor, embargo, purge, and test duration
- integrity assertions: all six R4.1 temporal-integrity assertions must run on every built fold
- primary metric: paired utility difference between candidate baseline and `Random`
- statistical test: `pairedBootstrapCI`
- decision rule: a cell is significant only when CI95 excludes zero

## Current ladder parameters

- schedule: geometric ladder `N ∈ {50, 100, 200, 400, 800}`
- experiment seed: `2026`
- bootstrap iterations: `2000`
- confidence: `95%`
- split override:
  - train floor: 3 days
  - embargo: 6 hours for experiment runs, 12 hours in the R4.2 smoke fixture
  - test duration: 1 day for experiment runs, 2 days in the R4.2 smoke fixture
  - purge: 6 hours for experiment runs, 0 in the R4.2 smoke fixture

## Acceptance outputs

Every canonical experiment using this protocol should record:

- data mode
- schedule cells attempted
- folds built per cell
- paired sample count per cell
- `diffMean`, `ci95`, `pValue`
- whether the result is `significant`, `not significant`, or `insufficient_data`

## Runnable checks

- `npm --prefix app run research:smoke-core`
- `npm --prefix app run research:rq-b-core`
- `npm --prefix app run research:r4-2-smoke`
- `npm --prefix app run research:r4-3-smoke`
- `npm --prefix app run research:r4-4-smoke`
- `npm --prefix app run research:rq-b-sample-size`
- `DATABASE_URL=... npm --prefix app run research:rq-b-real-data`

## Implementation paths

- `app/src/lib/research/pipeline/*`
- `app/src/lib/research/evaluation/*`
- `app/src/lib/research/source/*`
- `app/scripts/research/r4-*.ts`
- `app/scripts/research/experiments/rq-b-*/experiment.mjs`

## Revision rule

If the schedule, baselines, metric, or significance rule changes, create a new protocol file instead of silently rewriting this one.
