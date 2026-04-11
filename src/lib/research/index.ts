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

// Temporal splitter (R4.1) — leakage-safe, replaces walkForward.ts
export { temporalSplit, canProduceAnyFold, DEFAULT_TEMPORAL_SPLIT } from './evaluation/temporalSplit';
export type {
	TemporalSplitConfig,
	TemporalFold,
	TemporalFoldIntegrity,
	IntegrityAssertion
} from './evaluation/temporalSplit';
export {
	LeakageError,
	assertConfigWithinBounds,
	assertResolvedOutcomesOnly,
	assertSortedByKnowledgeHorizon,
	assertTrainHorizonStrictlyBeforeTestStart,
	assertEmbargoSatisfied,
	assertPurgeApplied,
	assertTemporalIntegrity
} from './evaluation/assertIntegrity';

// Regime stratification
export { stratifyByRegime, regimeCounts } from './evaluation/regimeStrata';
export type { RegimeStrata } from './evaluation/regimeStrata';

// Baselines
export { BaselineId } from './baselines/types';
export type { BaselineAgent } from './baselines/types';
export { RandomAgent, createRandomAgent } from './baselines/randomAgent';
export type { RandomAgentConfig } from './baselines/randomAgent';
export { EngineOnlyAgent, createEngineOnlyAgent } from './baselines/engineOnlyAgent';
export type { EngineOnlyAgentConfig } from './baselines/engineOnlyAgent';
export { ZeroShotLLMAgent, createZeroShotLLMAgent } from './baselines/zeroShotLLMAgent';
export type { ZeroShotLLMAgentConfig } from './baselines/zeroShotLLMAgent';
export { RuleBasedAgent, createRuleBasedAgent } from './baselines/ruleBasedAgent';
export type { RuleBasedAgentConfig } from './baselines/ruleBasedAgent';
export { HumanDecisionAgent, createHumanDecisionAgent } from './baselines/humanDecisionAgent';
export type { HumanDecisionAgentConfig } from './baselines/humanDecisionAgent';
