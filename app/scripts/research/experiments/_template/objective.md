# Experiment Objective — `_template`

**Status**: Template. This directory exists solely to verify the
`runExperiment` boundary works end-to-end on synthetic data (§R4.5
acceptance). Copy it to
`scripts/research/experiments/<rq-id>-<slug>-<YYYY-MM-DD>/` and
rewrite every section of this file before running a real experiment.

## Research Question

Not applicable. The template does not target any `ResearchQuestionId`
hypothesis. Any copy of this directory **must** replace this section
with the real RQ identifier (e.g. `RQ-B — Sample size ladder for
engine-vs-llm crossover`) before it is committed.

## Hypothesis

None. The template asserts only that the locked `$lib/research`
pipeline can load a synthetic `DatasetSource`, produce at least one
`TemporalFold` with all six integrity assertion codes present, run
every registered baseline against the test slice, and exit cleanly.

Any copy must declare its actual hypothesis here, phrased as a
falsifiable claim (e.g. *"On RQ-B, the rule-based baseline beats
random with CI-excludes-zero margin at N ≥ 500 trajectories."*).

## Success Criteria

- `runExperiment` returns without throwing
- `report.foldsBuilt > 0`
- Every fold's `integrity.assertionsRan` contains all six codes:
  `config_within_bounds`, `resolved_outcomes_only`,
  `sorted_by_knowledge_horizon`, `train_horizon_strictly_before_test_start`,
  `embargo_satisfied`, `purge_applied`
- Every fold has one `AgentFoldResult` per configured agent
- Markdown report written to
  `docs/generated/research/report-<config.id>.md`
- Process exits 0

## Pre-registration

Not applicable — the template does not make a claim about comparative
agent performance. Rule-based vs. random utility numbers in the
generated smoke report are incidental and must not be cited as
research findings.

Copies of this template must pre-register their hypothesis, sample
size schedule, and success criteria **before** running the experiment,
and must commit both the `objective.md` and the generated report
together so the pre-registration and result are reviewable as one
diff.

## How to copy

```bash
# from repo root
cp -r scripts/research/experiments/_template scripts/research/experiments/rq-b-<slug>-2026-04-11
cd scripts/research/experiments/rq-b-<slug>-2026-04-11

# 1. Rewrite this file (objective.md)
# 2. Edit experiment.mjs:
#    - Update EXPERIMENT_ID
#    - Pick your agents from defaultBaselineRegistry or construct your own
#    - Choose a real DatasetSource (replace createSyntheticSource when
#      real trajectory data is available)
#    - Adjust splitOverride (or remove it to use the locked defaults)
# 3. Run from repo root:
#    node --experimental-strip-types --disable-warning=ExperimentalWarning \
#      scripts/research/experiments/rq-b-<slug>-2026-04-11/experiment.mjs
# 4. Commit `objective.md` + the generated report together
```

## Reference

- `research/evals/rq-b-baseline-protocol.md`
- `research/experiments/rq-b-ladder-2026-04-11.md`
- `src/lib/research/pipeline/runner.ts` — `runExperiment` implementation
- `src/lib/research/source/synthetic.ts` — synthetic dataset generator
