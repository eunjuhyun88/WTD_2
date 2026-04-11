/**
 * `RuleSetV1_20260411` — pinned deterministic rule set for `RuleBasedAgent`.
 *
 * The thresholds are locked into the version string. Any change must
 * bump the date suffix in the version tag (`v1-2026-04-11` → `v1-<new-date>`
 * or `v2-<new-date>`) and correspondingly bump `RuleBasedAgent.version`
 * so historical comparison reports remain distinguishable. The pinned
 * numbers are author-proposed starting points (D5) and are a candidate
 * R3 sensitivity axis.
 *
 * The rule set is exposed as a pure `(VerdictBlock) → AgentDecisionProposal`
 * function so the agent class can be a thin wrapper. This makes it
 * possible for R3 sensitivity sweeps to construct a variant with
 * overridden thresholds without touching the agent class itself.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D5, §R4.3
 */

import type { VerdictBlock } from '../../contracts/index.ts';
import { VerdictBias, VerdictUrgency } from '../../contracts/ids.ts';
import type { AgentDecisionProposal } from '../evaluation/types.ts';

/**
 * Tunable thresholds for a `RuleSet`. All fields are required — a rule
 * set is a frozen specification, not a "plug the gaps" configuration,
 * so that `version` uniquely identifies the decision function.
 */
export interface RuleSetThresholds {
	/** Minimum `verdict.confidence` to open any position (long or short). */
	readonly minConfidenceOpen: number;
	/** Additional confidence floor required for the urgency-based amplifier. */
	readonly minConfidenceAmplify: number;
	/** Maximum allowed `counter_reasons.length` before falling back to `wait`. */
	readonly maxCounterReasons: number;
	/** Base size (unitless proposal scale) used on a plain open. */
	readonly baseSizePct: number;
	/** Base leverage used on a plain open. */
	readonly baseLeverage: number;
	/** Size used when the high-urgency + high-confidence amplifier triggers. */
	readonly amplifiedSizePct: number;
	/** Leverage used when the amplifier triggers. */
	readonly amplifiedLeverage: number;
}

/**
 * A rule set is a versioned, pure function from `VerdictBlock` to
 * `AgentDecisionProposal`. The version string follows `vN-YYYY-MM-DD`;
 * the thresholds are frozen into the version so report tables can
 * capture them verbatim and callers cannot tune them silently.
 */
export interface RuleSet {
	readonly version: string;
	readonly thresholds: RuleSetThresholds;
	apply(verdict: VerdictBlock): AgentDecisionProposal;
}

/** Version tag for the default rule set. */
export const RULE_SET_V1_20260411_VERSION = 'v1-2026-04-11' as const;

/**
 * Pinned defaults per §D5 of the research-spine design document.
 * Any change here must also bump `RULE_SET_V1_20260411_VERSION`.
 */
export const RULE_SET_V1_20260411_THRESHOLDS: RuleSetThresholds = {
	minConfidenceOpen: 0.7,
	minConfidenceAmplify: 0.85,
	maxCounterReasons: 2,
	baseSizePct: 1.0,
	baseLeverage: 1,
	amplifiedSizePct: 1.5,
	amplifiedLeverage: 2
};

/**
 * Construct `RuleSetV1_20260411`. `overrides` is intended for R3
 * sensitivity experiments — production comparison reports must use
 * the unmodified version. When an override is supplied the returned
 * rule set's `version` string is suffixed with `+override` so report
 * tables cannot confuse a tuned variant with the pinned default.
 */
export function createRuleSetV1_20260411(
	overrides: Partial<RuleSetThresholds> = {}
): RuleSet {
	const thresholds: RuleSetThresholds = {
		...RULE_SET_V1_20260411_THRESHOLDS,
		...overrides
	};
	const hasOverride = Object.keys(overrides).length > 0;
	const version = hasOverride
		? `${RULE_SET_V1_20260411_VERSION}+override`
		: RULE_SET_V1_20260411_VERSION;
	return {
		version,
		thresholds,
		apply: (verdict) => applyRuleSetV1(verdict, thresholds, version)
	};
}

/**
 * Apply rule set v1 to a verdict block. Pure, deterministic, no I/O.
 * The `version` string is stamped into the proposal's `note` so each
 * decision record carries its own provenance.
 */
function applyRuleSetV1(
	verdict: VerdictBlock,
	t: RuleSetThresholds,
	version: string
): AgentDecisionProposal {
	const bias = verdict.bias;
	const confidence = verdict.confidence;
	const counterCount = verdict.counter_reasons.length;
	const urgency = verdict.urgency;

	const isBullish = bias === VerdictBias.STRONG_BULL || bias === VerdictBias.BULL;
	const isBearish = bias === VerdictBias.STRONG_BEAR || bias === VerdictBias.BEAR;
	const passesConfidence = confidence >= t.minConfidenceOpen;
	const passesCounter = counterCount <= t.maxCounterReasons;

	if ((isBullish || isBearish) && passesConfidence && passesCounter) {
		const amplify =
			urgency === VerdictUrgency.HIGH && confidence >= t.minConfidenceAmplify;
		const action = isBullish ? 'open_long' : 'open_short';
		return {
			action,
			size_pct: amplify ? t.amplifiedSizePct : t.baseSizePct,
			leverage: amplify ? t.amplifiedLeverage : t.baseLeverage,
			stop_price: null,
			tp_prices: [],
			note: amplify ? `ruleset=${version} amplified=high-urgency` : `ruleset=${version}`,
			rationale: `bias=${bias} confidence=${confidence.toFixed(2)} counter=${counterCount} urgency=${urgency}`
		};
	}

	return {
		action: 'wait',
		size_pct: null,
		leverage: null,
		stop_price: null,
		tp_prices: [],
		note: `ruleset=${version}`,
		rationale: `wait: bias=${bias} confidence=${confidence.toFixed(2)} counter=${counterCount} urgency=${urgency}`
	};
}
