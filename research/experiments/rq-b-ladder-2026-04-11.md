# RQ-B Ladder Experiments

## Goal

Track the canonical experiment lineage for the first runnable RQ-B ladder series.

## Status

Active canonical experiment family for the current local research loop.

## Experiment set

### 1. Synthetic ladder

- experiment id: `rq-b-sample-size-2026-04-11`
- purpose: verify the end-to-end RQ-B pipeline on a controlled synthetic source
- command: `npm --prefix app run research:rq-b-sample-size`
- implementation: `app/scripts/research/experiments/rq-b-sample-size-2026-04-11/experiment.mjs`
- expected report: `docs/generated/research/report-rq-b-sample-size-2026-04-11.md`
- current role: canonical "first real experiment" for the baseline ladder on synthetic data

### 2. Real-data ladder

- experiment id: `rq-b-real-data-2026-04-11`
- purpose: reuse the same ladder against DB-backed `decision_trajectories`
- command: `DATABASE_URL=... npm --prefix app run research:rq-b-real-data`
- implementation: `app/scripts/research/experiments/rq-b-real-data-2026-04-11/experiment.mjs`
- supporting note: `app/scripts/research/experiments/rq-b-real-data-2026-04-11/objective.md`
- expected report: `docs/generated/research/report-rq-b-real-data-2026-04-11.md`
- current role: readiness probe for the DB source; `INSUFFICIENT_DATA` is a valid current outcome

### 3. Local synthetic walk-forward baseline

- experiment id: `walk-forward-eval-latest`
- run log: `research/experiments/experiment_log.jsonl`
- raw artifacts: `research/experiments/20260414_*-walk-forward-eval-latest/`
- current canonical run: `20260414_124604-walk-forward-eval-latest`
- status: completed after two local environment/config failures

#### 2026-04-14 run interpretation

- `20260414_120926` failed before model execution because local LightGBM could not load `libomp.dylib`.
- `20260414_120956` failed after fallback because `GradientBoostingClassifier(verbose=-1)` is invalid for the installed scikit-learn version.
- `20260414_121011` is the first normalized completed run; later runs through `20260414_124604` reproduced the same metrics.
- current canonical synthetic baseline: `mean_auc=0.5344047918312625`, `std_auc=0.10504386539429397`, `min_auc=0.3883928571428572`, `max_auc=0.6311111111111112`, `n_samples=120`, `n_splits=3`, `seed=2026`.

## Fixed protocol

Both experiments use `research/evals/rq-b-baseline-protocol.md`.

## Preconditions

- `Random` and `RuleBased(RuleSetV1_20260411)` are registered
- temporal-integrity assertions remain active
- generated reports are written under `docs/generated/research/`

## Interpretation rule

- synthetic results validate pipeline behavior, not market edge
- DB-backed results are the first eligible evidence for market-facing baseline claims
- if either experiment changes baselines, schedule, or acceptance rule, record a new experiment family instead of overwriting this one
