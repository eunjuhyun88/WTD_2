/**
 * `$lib/research` — the research spine's single import surface.
 *
 * Phase 0.5. Installs measurement primitives before Phase 1 engine work.
 * See docs/exec-plans/active/research-spine-2026-04-11.md for the plan.
 *
 * Import policy:
 *   - Every research / evaluation / baseline module imports from
 *     `$lib/research`, never from the individual files.
 *   - `$lib/research` imports from `$lib/contracts` for zod-validated
 *     boundary types and nothing else.
 */

// Statistics primitives
export {
	mean,
	variance,
	std,
	quantile,
	median,
	sum,
	min,
	max,
	rollingMean,
	rollingStd,
	rollingQuantile,
	pctRank,
	mulberry32,
	pairedBootstrapCI,
	cohenD,
	ksStatistic,
	klDivergence,
	sharpeRatio,
	sortinoRatio,
	maxDrawdown,
	calmarRatio,
	hitRate
} from './stats';
export type { BootstrapResult } from './stats';

// Evaluation contracts
export { ORPO_CANONICAL_WEIGHTS } from './evaluation/types';
export type {
	AgentPolicy,
	AgentObservation,
	AgentContext,
	AgentDecisionProposal,
	TrajectorySlice,
	SliceId,
	Regime,
	UtilityMetrics,
	ComparisonResult,
	AblationCell,
	RegimeReport,
	WalkForwardFold,
	UtilityWeights
} from './evaluation/types';

// Walk-forward splitter
export { walkForward, countFolds, DEFAULT_WALK_FORWARD } from './evaluation/walkForward';
export type { WalkForwardConfig } from './evaluation/walkForward';

// Regime stratification
export { stratifyByRegime, regimeCounts } from './evaluation/regimeStrata';
export type { RegimeStrata } from './evaluation/regimeStrata';

// Baselines
export { BaselineId } from './baselines/types';
export type { BaselineAgent } from './baselines/types';
export { RandomAgent, createRandomAgent } from './baselines/randomAgent';
export type { RandomAgentConfig } from './baselines/randomAgent';
