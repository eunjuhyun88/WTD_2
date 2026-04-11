/**
 * RuleBasedAgent — hand-coded deterministic rules on verdict factors.
 *
 * Design is intentionally NOT a reuse of `scanEngine.ts` (see open question
 * §9 #3 in the research-spine plan). The plan's current recommendation is
 * to write a clean, pinned rule set here and treat `scanEngine`-replay as
 * a separate "production replay" comparison, not a baseline. Reasoning:
 *
 *   - A clean rule set decouples the baseline from production code churn
 *     so historical comparison reports remain valid when scanEngine changes
 *   - scanEngine-replay is still useful, but as an attribution tool in R7
 *     ablation (engine_only → +rules → +llm → +orpo), not as a research
 *     baseline whose identity must stay stable across quarters
 *
 * Rule set sketch (pinned values TBD in the concrete implementation):
 *   IF verdict.bias ∈ {strong_bull, bull} AND verdict.confidence ≥ θ_long
 *     THEN open_long
 *   IF verdict.bias ∈ {strong_bear, bear} AND verdict.confidence ≥ θ_short
 *     THEN open_short
 *   IF verdict.urgency === 'high' AND counter_reasons.length < 2
 *     THEN amplify sizing by σ_urgency
 *   ELSE wait
 *
 * Deterministic by design — the same (verdict, context) always returns the
 * same proposal. That determinism is what makes the rule-based baseline
 * useful as a regression anchor: a sudden delta in its output across two
 * repo checkouts means an upstream contract broke.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R1, open Q #3
 */

import type { AgentObservation, AgentDecisionProposal } from '../evaluation/types';
import type { BaselineAgent } from './types';
import { BaselineId } from './types';

export type RuleBasedAgentConfig = Readonly<{
	/**
	 * Minimum `verdict.confidence` to open a long position. Defaults are
	 * pinned in the concrete implementation so historical comparisons stay
	 * reproducible; the constructor only allows overriding for sensitivity
	 * experiments, never for silent tuning.
	 */
	minConfidenceLong?: number;
	/** Minimum `verdict.confidence` to open a short position. */
	minConfidenceShort?: number;
	/**
	 * Rule-set version tag for report provenance. Changing the rules
	 * requires bumping this version and bumping the baseline `version`
	 * field so report tables can distinguish runs.
	 */
	ruleSetVersion?: string;
}>;

export class RuleBasedAgent implements BaselineAgent {
	readonly id = BaselineId.RULE_BASED;
	readonly label = 'Rule-based (hand-coded, pinned)';
	readonly version = 'v1-stub';
	readonly deterministic = true;
	readonly baselineId = BaselineId.RULE_BASED;

	readonly config: RuleBasedAgentConfig;

	constructor(config: RuleBasedAgentConfig = {}) {
		this.config = config;
	}

	decide(_observation: AgentObservation): AgentDecisionProposal {
		throw new Error(
			'[baseline.rule_based] decide() is not yet implemented. ' +
				'Blocked on open question §9 #3 — clean rule set vs. scanEngine reuse. ' +
				'When unblocked, will apply a pinned deterministic rule set to the ' +
				'VerdictBlock and return a sized proposal. ' +
				'See docs/exec-plans/active/research-spine-2026-04-11.md §R1.'
		);
	}
}

export function createRuleBasedAgent(
	config: RuleBasedAgentConfig = {}
): RuleBasedAgent {
	return new RuleBasedAgent(config);
}
