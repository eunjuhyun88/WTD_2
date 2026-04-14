/**
 * RuleBasedAgent — hand-coded deterministic rules on verdict factors.
 *
 * The agent itself is a thin wrapper over a `RuleSet`. The pinned
 * default, `RuleSetV1_20260411`, implements the §D5 decision function:
 *
 *   IF verdict.bias ∈ {strong_bull, bull}
 *    AND verdict.confidence ≥ 0.70
 *    AND verdict.counter_reasons.length ≤ 2
 *      → open_long (size 1.0, leverage 1)
 *   IF verdict.bias ∈ {strong_bear, bear}
 *    AND verdict.confidence ≥ 0.70
 *    AND verdict.counter_reasons.length ≤ 2
 *      → open_short (size 1.0, leverage 1)
 *   IF the above triggered
 *    AND verdict.urgency === 'high'
 *    AND verdict.confidence ≥ 0.85
 *      → amplify (size 1.5, leverage 2)
 *   ELSE → wait
 *
 * Design decision (§D4 row 9.3): this is intentionally NOT a reuse of
 * `scanEngine.ts`. A clean pinned rule set decouples the baseline from
 * production code churn so historical comparison reports remain valid
 * when scanEngine changes. `ScanEngineReplay` is registered separately
 * as a `'comparison_target'` and appears only in R7 ablation tables.
 *
 * Determinism is load-bearing: the same `(verdict, context)` input must
 * return the same proposal. That lets the baseline act as a regression
 * anchor — a sudden delta in its output across two repo checkouts means
 * an upstream contract broke, not that the baseline "drifted".
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { AgentObservation, AgentDecisionProposal } from '../evaluation/types.ts';
import type { BaselineAgent } from './types.ts';
import { BaselineId } from './types.ts';
import type { RuleSet, RuleSetThresholds } from './ruleSetV1.ts';
import { createRuleSetV1_20260411 } from './ruleSetV1.ts';

export type RuleBasedAgentConfig = Readonly<{
	/**
	 * Optional rule set override. Defaults to `RuleSetV1_20260411` with
	 * the pinned thresholds. Sensitivity sweeps (R3) construct a variant
	 * via `createRuleSetV1_20260411({ minConfidenceOpen: 0.65 })` and
	 * pass it here; the resulting rule set tags its version with a
	 * `+override` suffix so report tables cannot confuse it with the
	 * pinned default.
	 */
	ruleSet?: RuleSet;
	/**
	 * Convenience: supply only the threshold overrides and let the agent
	 * build the rule set. Mutually exclusive with `ruleSet` — passing
	 * both throws, because that combination is almost always a bug
	 * (two sources of truth for the version string).
	 */
	thresholdOverrides?: Partial<RuleSetThresholds>;
}>;

export class RuleBasedAgent implements BaselineAgent {
	readonly id = BaselineId.RULE_BASED;
	readonly label = 'Rule-based (hand-coded, pinned)';
	readonly deterministic = true;
	readonly baselineId = BaselineId.RULE_BASED;

	/**
	 * Agent `version` is derived from the rule set version so report
	 * tables have a single provenance string per row. The default is
	 * `v1-2026-04-11`; sensitivity overrides append `+override`.
	 */
	readonly version: string;
	readonly ruleSet: RuleSet;

	constructor(config: RuleBasedAgentConfig = {}) {
		if (config.ruleSet && config.thresholdOverrides) {
			throw new Error(
				'[baseline.rule_based] pass either `ruleSet` or `thresholdOverrides`, not both'
			);
		}
		this.ruleSet =
			config.ruleSet ?? createRuleSetV1_20260411(config.thresholdOverrides ?? {});
		this.version = this.ruleSet.version;
	}

	decide(observation: AgentObservation): AgentDecisionProposal {
		return this.ruleSet.apply(observation.verdict);
	}
}

/**
 * Convenience factory — the harness usually only needs one instance.
 * The rule set is frozen at construction, so sharing the agent across
 * the whole fold is safe and deterministic.
 */
export function createRuleBasedAgent(
	config: RuleBasedAgentConfig = {}
): RuleBasedAgent {
	return new RuleBasedAgent(config);
}
