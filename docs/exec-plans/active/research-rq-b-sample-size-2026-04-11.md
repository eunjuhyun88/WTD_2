# Experiment Objective — `rq-b-sample-size-2026-04-11`

**Status**: Pre-registration. Drafted 2026-04-11 **before** the experiment
runs. The run output lives at
`docs/generated/research/report-rq-b-sample-size-2026-04-11.md` and
must be committed in the same change as this pre-registration so the
hypothesis and the result are reviewable as one diff.

**Research Question**: RQ-B — Sample size ladder for the crossover
between a hand-coded rule-based policy and a non-policy baseline.

**Target**: The first real experiment through the R4.2 `runExperiment`
boundary. Its job is to verify that the locked research library
produces statistically meaningful conclusions on synthetic data —
NOT to generate a research claim about trading policies. Any
numerical "finding" from this experiment applies only to the
synthetic fixture and MUST NOT be cited as evidence about real markets.

## Hypothesis (pre-registered)

- **H0**: The `RuleBasedAgent(RuleSetV1_20260411)` has mean utility
  **≤** the `RandomAgent` on jittered synthetic trajectories where
  `pnl_bps` sign matches `verdict.bias`.
- **H1**: The `RuleBasedAgent` has strictly greater mean utility than
  the `RandomAgent` because rule-based reads `verdict.bias` while
  random ignores it.

### Quantitative claim

The **smallest sample size `N`** at which
`CI95(mean_utility(rule_based) − mean_utility(random))` excludes zero
on this synthetic fixture is expected to lie in **N ∈ [50, 500]**.

Rationale: the synthetic generator stamps `pnl_sign` matching
`verdict.bias` and `rule_based` opens `long`/`short` on bull/bear
with `confidence ≥ 0.70` and `counter_reasons ≤ 2`. Random chooses
uniformly across `{long, short, wait}` and ignores the verdict, so
its expected directional payoff is zero. The signal is strong per
row; the only question is how many rows are needed for the paired
bootstrap to reject zero at α=0.05.

The authors' prior on the interval [50, 500] is informed by toy
calculations on the synthetic fixture's signal-to-noise ratio —
it is a **falsifiable** claim. Observing the first significant N
below 50, above 500, or never observing significance within the
schedule all falsify the bound.

## Methodology

### Sample size schedule

`GeometricSchedule({ from: 50, to: 800, factor: 2 })` → cells
**N ∈ {50, 100, 200, 400, 800}**. Each cell is run as an
independent `runExperiment` call with a fresh synthetic source
of that size.

### Synthetic source

`createSyntheticSource({ count: N, seed: 2026, stepMs: 6h,
resolveAtStrategy: 'jittered' })` — deliberately jittered to
exercise the post-R4.1-fix purge window semantics. Seeds are fixed
for reproducibility.

### Agents

Pulled from `defaultBaselineRegistry`:

- `BaselineId.RANDOM` — uniform 3-way action, ignores the verdict
- `BaselineId.RULE_BASED` — `RuleSetV1_20260411` body per §D5

`ZeroShotLLMAgent` and `HumanDecisionAgent` are intentionally
excluded: LLM is a stub, human requires a real trajectory store.
This experiment is about proving the pipeline surfaces a
statistically honest conclusion on a signal it is guaranteed to
see — the two-agent comparison isolates that test.

### Split

`splitOverride`:

| Field | Value |
|---|---|
| `trainDurationFloor` | 3 days |
| `embargoDuration` | 6 hours |
| `testDuration` | 1 day |
| `purgeDuration` | 6 hours |
| `maxFolds` | 10 |

With `stepMs = 6h`, these values let even N=50 (≈12.5 days of span)
produce multiple folds while staying leakage-safe under every
R4.1 integrity check including the scheduled-end purge window.

### Utility function

`ORPO_CANONICAL_WEIGHTS` from `evaluation/types.ts`. The runner's
toy scoring maps `open_long → +pnl_bps`, `open_short → −pnl_bps`,
`wait → 0`, and subtracts `drawdown * 1.5` and `violations * 2`.
The synthetic generator never produces violations so this reduces
to a linear pnl-minus-drawdown score.

### Statistical test

For each N cell, pool per-trajectory utility across all folds,
pair `(rule_based_utility, random_utility)` by `trajectoryId`, and
run `pairedBootstrapCI(ruleUtilities, randomUtilities, { iterations: 2000, seed: 7, confidence: 0.95 })`.
"Significant" means the returned `ci95` tuple excludes zero.

## Success criteria

1. The experiment runs end-to-end through `runExperiment` for
   every schedule cell without throwing.
2. Every fold in every cell carries all six
   `integrity.assertionsRan` codes.
3. A CI95 is computed for every cell (point estimate, bounds,
   p-value, iterations).
4. The first cell whose CI95 excludes zero is identified. If no
   cell crosses the significance threshold, that's a valid outcome
   that still satisfies success criterion #1–#3.
5. The report confronts the pre-registered bound `N ∈ [50, 500]`
   with the observed first-significant-N and labels the hypothesis
   as **supported** / **falsified** / **inconclusive within range**.
6. Both the pre-registration (this file) and the generated report
   are committed in the same change.

## Out of scope

- Real market data — synthetic only.
- LLM baselines — stubs, would throw on `decide()`.
- Reward sensitivity sweeps — R3 territory, deferred.
- Regime-stratified breakdown — useful but not required for this
  first smoke; pooling across regimes is fine for answering "does
  the CI excludes zero somewhere in the ladder?".
- Cross-fold variance analysis — pooling decisions across folds
  is simpler and the synthetic fixture is IID enough for that
  to be honest.
- Comparison against the committed R4.5 template run — the R4.5
  report used deterministic resolution spacing and a different
  split; apples to oranges.

## Falsification modes

This experiment is falsifiable in three distinct ways:

1. **Below-bound crossover**: first significant N < 50 → the signal
   is stronger than expected, and the pre-registered lower bound is
   rejected. Honest outcome.
2. **Above-bound crossover**: first significant N > 500 → the signal
   is weaker than expected (or the split/fold structure reduces
   effective sample size). The pre-registered upper bound is rejected.
3. **No crossover within schedule**: CI95 never excludes zero for any
   N ≤ 800 → either the signal is very weak on this fixture, the
   test is too conservative, or there's a bug. Rejects H1 at this
   schedule.

Any of these outcomes is a valid research result and will be
reported verbatim.

## Reference

- `docs/exec-plans/active/research-spine-2026-04-11.md` §R4.6
  acceptance criteria
- `src/lib/research/pipeline/runner.ts` — the `runExperiment` entry
- `src/lib/research/baselines/ruleSetV1.ts` — the pinned rule body
- `src/lib/research/source/synthetic.ts` — `resolveAtStrategy: 'jittered'`
- `src/lib/research/stats.ts` — `pairedBootstrapCI`
