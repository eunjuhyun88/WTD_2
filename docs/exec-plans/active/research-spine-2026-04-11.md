# Research Spine — Measurement Infrastructure Before Phase 1

Date: 2026-04-11
Status: active
Branch: `feat/research-spine`
Relationship: **Phase 0.5** — sits between Phase 0 (contract freeze, shipped to `main` in `d11c835`) and Phase 1 (A-P0 loaders).

## Why This Document Exists

The three-pipeline integration design jumps from Phase 0 (contracts) straight to Phase 1 (loaders) and continues through Phase 5 (NL routing). Nowhere in that plan does the question "how do we know if any of this is working?" get a concrete answer.

From an AI-researcher perspective, this is the biggest gap. Every engine change, every new feature, every learned policy needs to be measurable **before** it lands, not retrofitted afterward. Phase 0.5 installs the measuring stick.

**Core thesis**: CHATBATTLE is a multi-agent RL-like system (verdict = observation, decision = action, trajectory = replay buffer, pair = preference signal). Without a baseline harness, a walk-forward evaluator, and statistical significance tools, every claim about "agent A is better than agent B" is indistinguishable from noise.

## Non-Negotiable Invariants

1. **Measurement before models.** No agent training happens until the baseline harness + walk-forward splitter + paired bootstrap CI are in place and smoke-tested on synthetic data.
2. **Baselines are required.** At minimum: `RandomAgent`, `EngineOnlyAgent`, `ZeroShotLLMAgent`, `RuleBasedAgent`, `HumanDecisionAgent`. A learned agent must beat all five on the same trajectory slice with statistically significant margin before it can be promoted.
3. **No mean without a confidence interval.** Every reported metric carries a paired bootstrap 95% CI. Single-point "A is X bps better than B" claims are not publishable in any internal doc.
4. **Reward sensitivity is a first-class experiment**, not an afterthought. Utility weights from `ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` §4.2 are treated as a hypothesis to test, not ground truth.
5. **Walk-forward only.** Random train/val/test splits are forbidden. All eval uses time-respecting splits that cannot leak future information into training.
6. **Regime-stratified reporting.** A single average is not enough. Every eval reports per-regime (trend / range / high_vol / crisis) in addition to overall.
7. **Ablation is mandatory.** Claims about LLM + ORPO must be decomposed into `engine-only → +zero-shot LLM → +SFT → +ORPO` so each layer's contribution is attributed.
8. **Leakage is detected, not trusted.** Every `TemporalFold` carries a runtime proof of its own integrity — train knowledge horizon, embargo gap, purge count, list of invariants asserted. Every downstream stage (labeler, agent runner, comparator) calls `assertTemporalIntegrity(fold)` as its first line, on every invocation, not only in tests. Convention and code review are not substitutes for runtime assertions on the leakage axis. Violations throw `LeakageError` with a categorical error code. See "Resolved Decisions (2026-04-11)" §D2.

## Primary Research Question

> **RQ-B**: Does ORPO preference learning on LLM agent decisions (`chosen` / `rejected` generated from the same `verdict_block` but different decision actors) produce measurable utility improvement over a `ZeroShotLLMAgent` baseline, and at what preference-pair sample size does that improvement become statistically significant against a paired bootstrap 95% CI?

**Why this first:**
- It directly tests whether ORPO is worth the plumbing Phase 4 builds
- It gives a concrete go/no-go signal before Phase 4 train jobs run
- The answer (even a negative answer) is valuable: if ORPO needs 10k pairs to show signal, that's a product constraint

## Secondary Research Question

> **RQ-D**: When a policy is learned on one market regime (e.g. `trend`), how much of its edge over baselines does it retain when tested on another regime (e.g. `high_vol`)? Is the edge regime-local or regime-general?

**Why this second:**
- This is the honest "is it real or just backtest" test
- It forces us to instrument regime detection early
- Distribution shift results are publishable in either direction

## Tertiary Research Question (CHATBATTLE-specific)

> **RQ-C**: In a multi-doctrine agent arena, does policy diversity survive repeated ORPO updates, or do agents collapse toward a single dominant strategy?

**Why this third:**
- This is the one that makes CHATBATTLE unique vs. single-agent ORPO papers
- Requires RQ-B to be answered first (need at least one working learned agent)
- Success criterion: measured decision-diversity metric (e.g. entropy of action distribution across agents on the same verdict) does not monotonically collapse to zero

## Rejected Research Questions

| RQ | Why rejected |
|---|---|
| "Can CHATBATTLE beat the market?" | Too broad; depends on market regime and reward function choice; no falsifiable measure |
| "Is Wyckoff useful?" | Already assumed by the engine spec; not the ORPO layer's concern |
| "Which LLM (Claude/GPT/Llama) is best?" | Model comparison, not architecture research; orthogonal to the decision-layer question |

## Execution Order

All phases land on `feat/research-spine` (not `feat/phase0-contracts` — that is already merged to main). The research spine is a **perpendicular** addition: it does not modify Phase 0 contracts and does not gate Phase 1 engine work except by convention.

### R0 — Research Plan Freeze (this document, 1 day)

- Land this doc as the single source of truth for research questions and methodology.
- Every downstream experiment must cite it for the RQ it targets.

### R1 — Baseline Harness (3 days)

| Deliverable | Description |
|---|---|
| `src/lib/research/baselines/types.ts` | `AgentPolicy` interface — the minimal contract every baseline and every learned agent must satisfy |
| `src/lib/research/baselines/randomAgent.ts` | Uniform random over `[open_long, open_short, wait]` — no observation dependence. Concrete implementation because it has zero engine dependency. |
| `src/lib/research/baselines/engineOnlyAgent.ts` | Stub — will route `VerdictBlock.bias → DecisionAction` directly when the verdict engine lands in Phase 3 |
| `src/lib/research/baselines/zeroShotLLMAgent.ts` | Stub — will call an LLM with a fixed prompt carrying the `VerdictBlock` context |
| `src/lib/research/baselines/ruleBasedAgent.ts` | Stub — hand-coded rules (e.g. `funding > 0.08% ∧ long_ratio < 1.2 → open_short`) |
| `src/lib/research/baselines/humanDecisionAgent.ts` | Stub — replays the human `decision.actor.kind === 'user'` trajectories from the DB |

**Exit gate**: all five implement the same `AgentPolicy` interface, and a smoke test shows `RandomAgent` producing 3-way-balanced `DecisionAction` distribution on 10k synthetic calls.

### R2 — Measurement Primitives (2 days)

| Deliverable | Description |
|---|---|
| `src/lib/research/stats.ts` | Pure TypeScript statistics: `mean`, `std`, `variance`, `quantile`, `median`, `rollingMean`, `rollingStd`, `rollingQuantile`, `pctRank`, `pairedBootstrapCI`, `cohenD`, `ksStatistic`, `klDivergence`, `sharpeRatio`, `maxDrawdown`, `sortinoRatio`, `calmarRatio`. Zero external dependencies. |
| `src/lib/research/evaluation/types.ts` | `TrajectorySlice`, `UtilityMetrics`, `ComparisonResult`, `AblationCell`, `RegimeReport`. All pure types. |
| `src/lib/research/evaluation/walkForward.ts` | Pure function: take an array of `DecisionTrajectory` sorted by `created_at`, return a sequence of `(train, test)` slice pairs for walk-forward validation. |
| `src/lib/research/evaluation/regimeStrata.ts` | Pure function: partition trajectories into regime buckets (`trend`, `range`, `high_vol`, `crisis`, `unknown`). |

**Exit gate**: `tsc --noEmit --strict` clean on all files. Unit-test-grade pure functions with no I/O.

### R3 — Reward Sensitivity Study (4 days)

**Design**: full factorial over four weights in the ORPO utility function:
```
utility = pnl_bps
        − w_dd         · max_drawdown_bps
        − w_violation  · rule_violation_count
        + w_direction  · direction_hit
        − w_slippage   · slippage_bps
```
Scan:
- `w_dd ∈ {0.5, 1.0, 1.5, 2.0}`
- `w_violation ∈ {0, 1, 2, 5}`
- `w_direction ∈ {0, 0.3, 0.6, 1.0}`
- `w_slippage ∈ {0, 0.3}`

For each cell, compute the winning baseline (best utility) and report stability. If winning baseline changes across cells, the utility function is brittle and we must re-ground reward design before any training.

**Exit gate**: sensitivity heatmap committed to `docs/generated/research/reward-sensitivity-YYYY-MM-DD.md`.

### R4 — Walk-Forward + Regime Eval Harness (3 days)

**Design**: given a set of trajectories `T` and a set of agents `A`,
1. Split `T` into `k` walk-forward folds.
2. For each fold, stratify by regime.
3. Run every agent in `A` on every fold × regime cell.
4. Compute utility distribution per cell.
5. Pairwise paired-bootstrap CI comparison between every pair of agents.
6. Produce a Pareto front report on `(utility_mean, sharpe, max_dd, rule_violations)`.

**Exit gate**: `src/lib/research/evaluation/harness.ts` runs end-to-end on synthetic trajectories, produces a JSON report, and `tsc --strict` passes.

### R5 — Baseline Comparison Report (2 days)

First real experiment. Run all five baselines on synthetic trajectories (or early real trajectories if available) and publish:
- Utility mean ± 95% CI, per regime, per baseline
- Sharpe, max drawdown, rule violations
- Pareto front plot
- Statement of which baseline won, at what significance, and whether RQ-B is worth pursuing

**Exit gate**: `docs/generated/research/baseline-comparison-YYYY-MM-DD.md` committed.

### R6 — First ORPO Learning Curve (1 week)

Only reached after R1 ~ R5 are green.
- Train a small LLM (Phi-3-mini or similar) on ORPO pairs generated from collected trajectories.
- Measure utility vs. number of pairs trained on: 50, 100, 500, 1000, 5000, 10000.
- Compare against `ZeroShotLLMAgent` baseline at each checkpoint.
- Answer RQ-B: at what pair count does the paired bootstrap CI exclude zero?

### R7 — Ablation Study (3 days)

`engine_only → +zero_shot_llm → +sft_llm → +orpo_llm`. Same trajectories, same harness, same statistical tests. Produces the attribution table.

### R8 — Regime Transfer (RQ-D) (1 week)

Train on `regime = trend` only. Test on each of `trend`, `range`, `high_vol`, `crisis`. Report degradation vs. baseline. Answer RQ-D.

## What This Spine Is NOT

- **Not a replacement for Phase 1 engine work.** Phase 1 loaders still need to happen. The spine simply makes Phase 1 measurable.
- **Not a gate on Phase 1 start.** Phase 1 loader implementation can proceed in parallel once R0–R2 land. R3+ depend on trajectory data that Phase 1 enables.
- **Not a substitute for human product judgment.** Baselines and CIs tell you what changed; they do not tell you what to ship.
- **Not a paper-writing exercise.** If an experiment result is a product decision, it lives in `docs/decisions/`. If it is a research finding, it lives in `docs/generated/research/`. Both get the same statistical rigor.

## Success Criteria for Phase 0.5 Completion

This document's job is done when:

1. Every claim of the form "agent A beats agent B" in CHATBATTLE documentation is backed by a paired bootstrap CI.
2. Every engine-layer PR has a "baseline comparison impact" checkbox that links to an R4-style harness run.
3. Every ORPO training run links back to the specific research question (RQ-B, RQ-C, or RQ-D) it targets.
4. `docs/generated/research/` contains at least one fully-reported baseline comparison.
5. The research spine itself has been cited in at least one rejected change (i.e. a PR was blocked because the CI was too wide to conclude improvement). This is the sign that measurement is actually constraining decisions instead of merely decorating them.

## Known Unresolved Questions (superseded 2026-04-11)

**These are closed below in "Resolved Decisions (2026-04-11)".** The original wording is preserved here for historical provenance so future readers can trace how each question was framed before the karpathy/autoresearch-style layer discipline was applied. The authoritative answers live in "Resolved Decisions" + "Development Slices (R4.x)".

These were originally forwarded from the checkpoint and framed as blockers on R3 / R6:

1. **Preference-pair sample-size ladder**: what sample counts does the learning-curve experiment cover? Default proposal: 50 / 100 / 500 / 1000 / 5000 / 10000. Needs user / research lead sign-off.
2. **Walk-forward window size**: 1 week / 2 weeks / 1 month? Depends on trajectory density. Deferred until first month of real trajectories is collected.
3. **RuleBasedAgent design**: reuse `scanEngine.ts` heuristics or write a clean rule set? Clean is more honest but may be too weak to be useful as a baseline. Reuse is more honest to production behavior but entangles the baseline with engine changes. Recommendation: write a clean set and pin it in source; treat `scanEngine.ts` as a separate "production replay" comparison, not a baseline.
4. **Reward weight factorial scope**: 4 × 4 × 4 × 2 = 128 cells. Runtime per cell is trajectory-dependent. If >1s per cell, need sampling strategy. Defer until trajectory volume is known.

## Resolved Decisions (2026-04-11)

The four items under "Known Unresolved Questions" above are closed here. The framing is borrowed from [karpathy/autoresearch](https://github.com/karpathy/autoresearch): a **locked library**, a **single file per experiment**, and a **pre-registered objective doc** per research question. The boundary between them is the project's safety rail — a new researcher can break their own experiment file but cannot break the library, cannot bypass leakage assertions, and cannot produce a report that fails schema validation.

### The three-artifact discipline

| Role | File | Who modifies | autoresearch analogy |
|---|---|---|---|
| **Locked library** — data loaders, temporal splitter, assertions, stats, baseline registry, runner, report schema | `src/lib/research/**` | Engineering PRs only; never per-experiment | `prepare.py` |
| **Experiment file** — one `config` object + one `runExperiment(config)` call | `scripts/research/experiments/<rq-id>/experiment.mjs` | Per-experiment; each researcher forks the template | `train.py` |
| **Objective doc** — research question, pre-registered hypothesis, success criteria, constraints | `docs/exec-plans/active/research-<rq-id>-<date>.md` | Written **before** any code runs — the pre-registration | `program.md` |

**Safety invariant**: the experiment file imports from `$lib/research` and calls the single entry point `runExperiment(config, source)`. The locked layer enforces every safety property at that boundary. No other public execution surface exists.

### D0 — Known debt in the locked layer (current `walkForward.ts`)

The splitter landed in `b92c845` is **leakage-suspect** and must be rewritten before any real experiment runs. Four specific holes, named here so they cannot be quietly deferred:

1. **Ignores `outcome.resolved_at`.** Sort key is `created_at`, but labels are observable at `resolved_at`. A slowly-resolving trajectory's label can enter a later "train" fold because at training-time the label did not yet exist.
2. **No purge step.** A train trajectory whose `resolved_at` falls inside the train window's tail still has a partially-observable label at the fold cutoff.
3. **No embargo.** `test[0]` starts immediately after `train[-1]`, so any feature with a lookback window bridges the train/test boundary.
4. **Integer-count windows.** Conflates regime density — 200 trajectories in a quiet week and 200 in a volatile week are not comparable fold sizes.

Tracked as **R4.1** in Development Slices below. Until R4.1 lands, any experiment run must stamp its report with `integrity.status = 'leakage_suspect'` and cannot be cited as a comparison baseline.

### D1 — `TemporalSplitConfig` contract

Locked in the library at R4.1 time. Defaults pinned in code. Experiment files may override individual fields, but `validateExperimentConfig` rejects any combination that violates the temporal invariants.

```ts
// src/lib/research/evaluation/temporalSplit.ts  (to land in R4.1)
export interface TemporalSplitConfig {
  /** How the train window grows across folds. */
  expansion: 'anchored' | 'rolling' | 'rolling-with-memory';

  /** Per-fold test duration in wall-clock ms. Not an integer count. */
  testDuration: number;

  /** Minimum wall-clock train duration for the first fold. */
  trainDurationFloor: number;

  /**
   * Purge length (ms). Any trajectory whose `outcome.resolved_at` lands
   * inside `[trainEnd - purgeDuration, trainEnd]` is dropped from train —
   * at `trainEnd` its label was still being computed, so including it
   * would leak partial future information.
   */
  purgeDuration: number;

  /**
   * Embargo (ms). Gap between `trainEnd` and the earliest allowed
   * `testStart`. Protects against feature lookback windows reaching from
   * the test edge back into train.
   */
  embargoDuration: number;

  /** Cap on folds per experiment. Bounds runtime on long sweeps. */
  maxFolds: number;
}

export const DEFAULT_TEMPORAL_SPLIT: TemporalSplitConfig = {
  expansion: 'anchored',
  testDuration: 7 * 24 * 60 * 60 * 1000,          // 7 days
  trainDurationFloor: 30 * 24 * 60 * 60 * 1000,   // 30 days
  purgeDuration: 24 * 60 * 60 * 1000,             // 1 day
  embargoDuration: 24 * 60 * 60 * 1000,           // 1 day
  maxFolds: 6
};
```

Default values are researcher-proposed and must be recalibrated against the first month of real trajectory data. The *contract* (purge + embargo + wall-clock duration + expansion policy) is frozen here; the *numbers* are not.

### D2 — `TemporalFold` proof-of-integrity

Every fold carries its own proof. Downstream stages re-assert rather than trust.

```ts
export interface TemporalFold {
  foldIndex: number;
  train: TrajectorySlice;
  test: TrajectorySlice;

  integrity: {
    /** Latest `outcome.resolved_at` in train after purge. */
    trainKnowledgeHorizon: IsoTimestamp;

    /** Earliest `created_at` in test. */
    testStart: IsoTimestamp;

    /** testStart − trainKnowledgeHorizon (ms). Must be ≥ config.embargoDuration. */
    embargoGap: number;

    /** Trajectories dropped from train by the purge step. */
    purgedCount: number;

    /** Config actually used — may differ from default when the experiment overrides. */
    config: TemporalSplitConfig;

    /** Invariants that were asserted at split time. Named for audit-trail traceability. */
    assertionsRan: ReadonlyArray<IntegrityAssertion>;

    assertedAt: IsoTimestamp;
  };
}

export type IntegrityAssertion =
  | 'sorted_by_knowledge_horizon'
  | 'resolved_outcomes_only'
  | 'train_horizon_strictly_before_test_start'
  | 'embargo_satisfied'
  | 'purge_applied'
  | 'config_within_bounds';

/** Re-verifies the fold at consume time. Throws `LeakageError` on any violation. */
export function assertTemporalIntegrity(fold: TemporalFold): void;

export class LeakageError extends Error {
  constructor(readonly code: IntegrityAssertion, readonly detail: string);
}
```

Every downstream stage (labeler, agent runner, comparator) calls `assertTemporalIntegrity(fold)` as its first line. The assertion is linear in fold size and runs on every invocation, not only in tests.

### D3 — `runExperiment` boundary

The single entry point. No other public symbol in `$lib/research` runs an experiment.

```ts
// src/lib/research/pipeline/runner.ts  (to land in R4.2)
export interface ExperimentConfig {
  readonly id: string;                  // e.g. 'rq-b-sample-size-2026-04-11'
  readonly rq: 'RQ-B' | 'RQ-C' | 'RQ-D';
  readonly schedule?: ExperimentSchedule;
  readonly splitOverride?: Partial<TemporalSplitConfig>;
  readonly utilityWeights?: UtilityWeights;
  readonly agents: ReadonlyArray<BaselineId | string>;
  readonly seed: number;                // required — no global RNG
}

export async function runExperiment(
  config: ExperimentConfig,
  source: DatasetSource
): Promise<ExperimentReport> {
  validateExperimentConfig(config);                 // invariant gate
  const trajectories = await source.load();
  assertTrajectoriesWellFormed(trajectories);
  const folds = temporalSplit(trajectories, {
    ...DEFAULT_TEMPORAL_SPLIT,
    ...(config.splitOverride ?? {})
  });
  for (const fold of folds) assertTemporalIntegrity(fold);
  const results = await runPipeline(folds, config);
  const report = buildReport(results, config);
  assertReportComplete(report);
  return report;
}
```

`validateExperimentConfig` rejects: zero or negative durations, `embargoDuration < minFeatureLookback`, `agents` referencing an unregistered `BaselineId`, missing `seed`, unknown `rq` value. Rejection messages name the invariant so future researchers see the *why* not just the *what*.

### D4 — Old questions mapped to their layer-correct home

| Question (old §9.N) | Layer home | Resolution |
|---|---|---|
| 9.1 Sample-size ladder | **Experiment file** | Locked layer provides `GeometricSchedule`, `LinearSchedule`, `EarlyStopSchedule` primitives. Each experiment composes its own schedule and records it in the report. Suggested RQ-B default: `EarlyStopSchedule(GeometricSchedule({from:50, to:10000, factor:2}), {stopCondition:'ci-excludes-zero'})`. |
| 9.2 Walk-forward window | **Locked default + experiment override** | `DEFAULT_TEMPORAL_SPLIT` (D1) pinned in code. Experiment files override via `splitOverride`; locked `validateExperimentConfig` rejects any override that violates the temporal invariants. Changing the default is a tagged library version bump, not a per-experiment choice. |
| 9.3 RuleBased design | **Locked registry + experiment selection** | `RuleBasedAgent(RuleSetV1_20260411)` registered as `kind: 'baseline'` in the locked baseline registry. `ScanEngineReplay` registered as `kind: 'comparison_target'` — NOT a baseline, appears only in R7 ablation tables. Adding a new rule set is a locked-layer PR, not an experiment-file change. |
| 9.4 Reward factorial | **Experiment file + locked assertions** | Locked layer provides `FullFactorialSweep`, `LatinHypercubeSweep(n)`, `EscalatingSweep(phase1, phase2IfUnstable)`. Experiment files compose their sweep. Locked layer enforces "every reported cell carries the weights used" and "cells with unstable winning-baseline trigger Phase 2 automatically". |

### D5 — `RuleSetV1_20260411` body

Pinned for `ruleBasedAgent.ts` R4.3 implementation. Version tag `v1-2026-04-11`. Any change to thresholds increments the date suffix AND bumps `RuleBasedAgent.version` from `v1-stub` to `v2-<new-date>`.

```
IF   verdict.bias ∈ {strong_bull, bull}
 AND verdict.confidence ≥ 0.70
 AND verdict.counter_reasons.length ≤ 2
   → { action: 'open_long',  size_pct: 1.0, leverage: 1 }

IF   verdict.bias ∈ {strong_bear, bear}
 AND verdict.confidence ≥ 0.70
 AND verdict.counter_reasons.length ≤ 2
   → { action: 'open_short', size_pct: 1.0, leverage: 1 }

IF   the above triggered
 AND verdict.urgency === 'high'
 AND verdict.confidence ≥ 0.85
   → amplify: { size_pct: 1.5, leverage: 2 }

ELSE → { action: 'wait', size_pct: null, leverage: null }
```

Thresholds (0.70, 0.85, ≤2) are author-proposed starting points, not research-validated. They are a candidate R3 secondary sensitivity axis.

### D6 — Out of scope for this document

- **Harness dissection §9 product decisions** (timeframe authority, sector taxonomy, watchlist persistence, multimodal parsing, alpha score fate, force orders window) are engine/product config choices in `docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md`. They are not research methodology and R4–R8 deliverables do not depend on any of them. Tracked separately on a Phase 1 branch.

### Deferred (still open after this document)

| Item | Why deferred | Unblocks when |
|---|---|---|
| Final numeric values for `DEFAULT_TEMPORAL_SPLIT` | Researcher-proposed defaults need calibration against real trajectory density | First month of Phase 1 trajectory collection |
| Whether `rolling-with-memory` expansion is worth implementing | Only matters if `anchored` hits a runtime ceiling on real data | After R4.2 + R4.5 + first real R5 run |
| RuleSetV1 threshold tuning (0.70 / 0.85 / ≤2) | Requires R3 sensitivity sweep output to judge | After R3 completes |
| Extended `IntegrityAssertion` codes beyond D2's six | Needs real harness runs to surface edge cases | After R4.2 + R4.5 + first real R5 run |
| Failure policy when RQ-B crossover > 10 000 pairs | Requires R6 data to answer | After R6 completes |

## Development Slices (R4.x)

The Resolved Decisions above define contracts. The slices below make the contracts developable. Each slice has an explicit boundary — scope, owned behavior, what it does NOT touch, dependencies, and acceptance criteria — so a new developer (human or agent) can pick it up without cross-cutting concerns bleeding in.

### R4.1 — Leakage-safe `TemporalSplitter`

- **New files**: `src/lib/research/evaluation/temporalSplit.ts`, `src/lib/research/evaluation/assertIntegrity.ts`
- **Owned behavior**: `TemporalSplitConfig` (D1), `TemporalFold` (D2), `temporalSplit()` function, `assertTemporalIntegrity()` gate, `LeakageError` class
- **Does not touch**: `stats.ts`, `regimeStrata.ts`, baseline files, runner, contracts
- **Deprecates**: `walkForward.ts` — kept as a `@deprecated` re-export that throws with a migration comment pointing at `temporalSplit.ts`
- **Dependencies**: Phase 0 contracts (in), `DecisionTrajectory.outcome.resolved_at` field (in)
- **Acceptance**: all six `IntegrityAssertion` codes fire on synthetic leakage fixtures; `tsc --strict` clean; `$lib/research` barrel exports new splitter; old `walkForward` import surface throws with redirect; `svelte-check` clean
- **Size**: Medium. 1 commit. **Blocks R4.2 – R4.6.**

### R4.2 — `runExperiment` boundary + `ResearchPipeline` runner

- **New files**: `src/lib/research/pipeline/runner.ts`, `pipeline/types.ts`, `pipeline/validate.ts`, `pipeline/report.ts`
- **Owned behavior**: `ExperimentConfig`, `ExperimentReport`, `DatasetSource`, `runExperiment()`, `validateExperimentConfig()`, `buildReport()`, `assertReportComplete()`
- **Does not touch**: splitter internals (R4.1 owns), baseline internals, stats
- **Dependencies**: R4.1
- **Acceptance**: `runExperiment(config, source)` runs end-to-end on a 5-trajectory synthetic source with `RandomAgent`; rejects invalid config (embargo=0, missing seed, unregistered agent) with named invariant violations; integrity assertions fire on every fold; `tsc --strict` + `svelte-check` clean
- **Size**: Medium. 1 commit. **Blocks R4.3 – R4.6.**

### R4.3 — Baseline registry + `RuleSetV1` concrete body

- **New files**: `src/lib/research/baselines/registry.ts`, `baselines/ruleSetV1.ts`
- **Modified**: `baselines/ruleBasedAgent.ts` (stub → concrete body per D5), `index.ts` (register defaults)
- **Owned behavior**: `BaselineRegistry` with `kind: 'baseline' | 'comparison_target'` tagging, `RuleSet` interface, `RuleSetV1_20260411` body per D5
- **Does not touch**: other baselines, runner, splitter
- **Dependencies**: R4.2 (for registry-aware runner tests)
- **Acceptance**: `RuleBasedAgent.decide()` returns a concrete proposal matching D5; `registry.register()`/`registry.get()` round-trip; `$lib/research` exports default-registered baselines; `tsc` + `svelte-check` clean
- **Size**: Small. 1 commit. Can parallel R4.4.

### R4.4 — `ExperimentSchedule` + `WeightSweepStrategy` primitives

- **New files**: `src/lib/research/schedule.ts`, `weightSweep.ts`
- **Owned behavior**: `GeometricSchedule`, `LinearSchedule`, `EarlyStopSchedule` wrapper; `FullFactorialSweep`, `LatinHypercubeSweep(n)`, `EscalatingSweep(phase1, phase2IfUnstable)`
- **Does not touch**: runner, splitter, baselines
- **Dependencies**: R4.2 (for `ExperimentConfig` shape)
- **Acceptance**: each schedule/sweep produces a typed iterator of cells with recorded provenance (seed, version, parent strategy); `tsc` + `svelte-check` clean
- **Size**: Small. 1 commit. Can parallel R4.3.

### R4.5 — Synthetic `DatasetSource` + experiment template

- **New files**: `src/lib/research/source/synthetic.ts`, `scripts/research/experiments/_template/experiment.mjs`, `scripts/research/experiments/_template/objective.md`
- **Owned behavior**: seed-driven synthetic `VerdictBlock` + `DecisionTrajectory` generator covering all regimes; working `experiment.mjs` template that imports from `$lib/research` and calls `runExperiment()`
- **Does not touch**: locked-layer contracts, runner internals
- **Dependencies**: R4.1 + R4.2 + R4.3 + R4.4 (everything the template imports)
- **Acceptance**: `node scripts/research/experiments/_template/experiment.mjs` runs end-to-end, produces an `ExperimentReport` with all `integrity.assertionsRan` entries present, exits 0; smoke report committed to `docs/generated/research/report-template-smoke-<date>.md`; `tsc` + `svelte-check` clean
- **Size**: Small. 1 commit. **Unblocks R4.6.**

### R4.6 — First real experiment: RQ-B sample-size ladder on synthetic

- **New files**: `scripts/research/experiments/rq-b-sample-size-2026-04-11/experiment.mjs`, `docs/exec-plans/active/research-rq-b-sample-size-2026-04-11.md` (pre-registration), `docs/generated/research/report-rq-b-sample-size-2026-04-11.md` (auto-generated after run)
- **Owned behavior**: experiment config targeting RQ-B; pre-registered hypothesis ("crossover at N ∈ [500, 2000]"); success criteria in objective doc
- **Does not touch**: locked layer
- **Dependencies**: R4.5
- **Acceptance**: experiment runs; report generated; pre-registered hypothesis confronted with CI-based conclusion; report committed to `docs/generated/research/`
- **Size**: Small. 1 commit.

### Critical path

```
R4.1 (splitter) ─→ R4.2 (runner) ─┬─→ R4.3 (registry + RuleSetV1) ─┐
                                  │                                ├─→ R4.5 (template + synthetic source) ─→ R4.6 (first RQ-B run)
                                  └─→ R4.4 (schedule + sweep)    ─┘
```

R4.3 and R4.4 are the only parallelizable pair. Everything else is strictly sequential because downstream slices depend on the fold contract and runner signature defined upstream.

## References

- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md` (this doc is perpendicular to the A/B/C trunk plan)
- `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md` §1, §8 (verdict contract = observation space)
- `docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` §2, §4 (utility definition, pair construction)
- `src/lib/contracts/verdict.ts` (`VerdictBlockSchema` — the observation)
- `src/lib/contracts/trajectory.ts` (`DecisionTrajectorySchema`, `MLPreferencePairSchema` — the replay buffer + preference signal)
- `src/lib/contracts/registry.ts` (`RawSourceSchema`, `RawSourceSubscriptionSchema` — user-configurable observation space)
