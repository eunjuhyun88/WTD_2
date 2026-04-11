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

## Known Unresolved Questions

These are forwarded from the checkpoint and block R3 / R6:

1. **Preference-pair sample-size ladder**: what sample counts does the learning-curve experiment cover? Default proposal: 50 / 100 / 500 / 1000 / 5000 / 10000. Needs user / research lead sign-off.
2. **Walk-forward window size**: 1 week / 2 weeks / 1 month? Depends on trajectory density. Deferred until first month of real trajectories is collected.
3. **RuleBasedAgent design**: reuse `scanEngine.ts` heuristics or write a clean rule set? Clean is more honest but may be too weak to be useful as a baseline. Reuse is more honest to production behavior but entangles the baseline with engine changes. Recommendation: write a clean set and pin it in source; treat `scanEngine.ts` as a separate "production replay" comparison, not a baseline.
4. **Reward weight factorial scope**: 4 × 4 × 4 × 2 = 128 cells. Runtime per cell is trajectory-dependent. If >1s per cell, need sampling strategy. Defer until trajectory volume is known.

## References

- `docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md` (this doc is perpendicular to the A/B/C trunk plan)
- `docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md` §1, §8 (verdict contract = observation space)
- `docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md` §2, §4 (utility definition, pair construction)
- `src/lib/contracts/verdict.ts` (`VerdictBlockSchema` — the observation)
- `src/lib/contracts/trajectory.ts` (`DecisionTrajectorySchema`, `MLPreferencePairSchema` — the replay buffer + preference signal)
- `src/lib/contracts/registry.ts` (`RawSourceSchema`, `RawSourceSubscriptionSchema` — user-configurable observation space)
