# Domain: Evaluation

## Goal

Measure quality of signals and workflows with reproducible methods.

## Canonical Areas

- `engine/tests`
- `engine/*` evaluation and backtest modules
- `research/evals`
- `engine/challenge`
- `engine/scoring/verdict.py`
- `docs/product/research-thesis.md`

## Boundary

- Owns metrics definition, eval datasets, and acceptance thresholds.
- Feeds product and research decisions with measurable evidence.

## Inputs

- challenge instances
- verdict rules and target/stop/horizon settings
- test fixtures and research datasets

## Outputs

- pass/fail test evidence
- hit-rate and quality summaries
- acceptance criteria for deployment or product changes

## Related Files

- `engine/tests/`
- `research/evals/`
- `research/evals/rq-b-baseline-protocol.md`
- `research/experiments/rq-b-ladder-2026-04-11.md`
- `docs/domains/engine-performance-benchmark-lab.md`
- `docs/domains/contracts.md`

## Non-Goals

- UI layout work
- ad hoc intuition-only decisions
