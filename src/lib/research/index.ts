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
 *   - Relative imports use explicit `.ts` extensions so that the
 *     `node --experimental-strip-types` loader used by R4.x smoke
 *     scripts can resolve this barrel at runtime. `tsconfig.json`
 *     sets `rewriteRelativeImportExtensions: true`, which rewrites
 *     `.ts` → `.js` for the bundler build.
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
} from './stats.ts';
export type { BootstrapResult } from './stats.ts';

// Evaluation contracts
export { ORPO_CANONICAL_WEIGHTS } from './evaluation/types.ts';
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
} from './evaluation/types.ts';

// Temporal splitter (R4.1) — leakage-safe, replaces walkForward.ts
export {
	temporalSplit,
	canProduceAnyFold,
	DEFAULT_TEMPORAL_SPLIT
} from './evaluation/temporalSplit.ts';
export type {
	TemporalSplitConfig,
	TemporalFold,
	TemporalFoldIntegrity,
	IntegrityAssertion
} from './evaluation/temporalSplit.ts';
export {
	LeakageError,
	assertConfigWithinBounds,
	assertResolvedOutcomesOnly,
	assertSortedByKnowledgeHorizon,
	assertTrainHorizonStrictlyBeforeTestStart,
	assertEmbargoSatisfied,
	assertPurgeApplied,
	assertTemporalIntegrity
} from './evaluation/assertIntegrity.ts';

// Regime stratification
export { stratifyByRegime, regimeCounts } from './evaluation/regimeStrata.ts';
export type { RegimeStrata } from './evaluation/regimeStrata.ts';

// Baselines
export { BaselineId } from './baselines/types.ts';
export type { BaselineAgent } from './baselines/types.ts';
export { RandomAgent, createRandomAgent } from './baselines/randomAgent.ts';
export type { RandomAgentConfig } from './baselines/randomAgent.ts';
export { EngineOnlyAgent, createEngineOnlyAgent } from './baselines/engineOnlyAgent.ts';
export type { EngineOnlyAgentConfig } from './baselines/engineOnlyAgent.ts';
export { ZeroShotLLMAgent, createZeroShotLLMAgent } from './baselines/zeroShotLLMAgent.ts';
export type { ZeroShotLLMAgentConfig } from './baselines/zeroShotLLMAgent.ts';
export { RuleBasedAgent, createRuleBasedAgent } from './baselines/ruleBasedAgent.ts';
export type { RuleBasedAgentConfig } from './baselines/ruleBasedAgent.ts';
export { HumanDecisionAgent, createHumanDecisionAgent } from './baselines/humanDecisionAgent.ts';
export type { HumanDecisionAgentConfig } from './baselines/humanDecisionAgent.ts';

// Rule set primitives (R4.3)
export {
	createRuleSetV1_20260411,
	RULE_SET_V1_20260411_VERSION,
	RULE_SET_V1_20260411_THRESHOLDS
} from './baselines/ruleSetV1.ts';
export type { RuleSet, RuleSetThresholds } from './baselines/ruleSetV1.ts';

// Baseline registry (R4.3)
export {
	BaselineRegistry,
	BaselineRegistryError,
	defaultBaselineRegistry
} from './baselines/registry.ts';
export type {
	BaselineKind,
	BaselineRegistryEntry,
	BaselineRegistryErrorCode
} from './baselines/registry.ts';

// Pipeline (R4.2) — runExperiment boundary + report gate
export { runExperiment } from './pipeline/runner.ts';
export { validateExperimentConfig } from './pipeline/validate.ts';
export { buildReport, assertReportComplete } from './pipeline/report.ts';
export { ConfigValidationError, ReportCompletenessError } from './pipeline/types.ts';
export type {
	ExperimentConfig,
	ExperimentReport,
	DatasetSource,
	ResearchQuestionId,
	AgentDecisionRecord,
	AgentFoldResult,
	ConfigValidationCode,
	ReportCompletenessCode
} from './pipeline/types.ts';

// Schedule primitives (R4.4) — sample-size ladder
export {
	SCHEDULE_VERSION,
	ScheduleConfigError,
	createGeometricSchedule,
	createLinearSchedule,
	createEarlyStopSchedule
} from './schedule.ts';
export type {
	ExperimentSchedule,
	ScheduleCell,
	ScheduleKind,
	ScheduleVersion,
	GeometricScheduleConfig,
	LinearScheduleConfig,
	EarlyStopConfig,
	StopCondition
} from './schedule.ts';

// Weight sweep primitives (R4.4) — reward factorial
export {
	WEIGHT_SWEEP_VERSION,
	WeightSweepConfigError,
	createFullFactorialSweep,
	createLatinHypercubeSweep,
	createEscalatingSweep
} from './weightSweep.ts';
export type {
	WeightSweepStrategy,
	WeightSweepCell,
	WeightSweepKind,
	WeightSweepVersion,
	FullFactorialGrid,
	LatinHypercubeRanges,
	EscalatingSweep
} from './weightSweep.ts';

// ---------------------------------------------------------------------------
// Default registry population (R4.3)
// ---------------------------------------------------------------------------
//
// Baselines with zero-arg or all-optional constructors are registered here so
// experiment files can fetch them via `defaultBaselineRegistry.get(id)`.
// `ZeroShotLLMAgent` is intentionally skipped — it requires a `model` and
// `promptVersion` that must come from the experiment file, so experiments
// construct it per-run and call `defaultBaselineRegistry.register()`
// themselves. Every agent below is tagged `'baseline'`; `'comparison_target'`
// entries (e.g. a future `ScanEngineReplay`) are added by their owning slice.
//
// Side-effect at import time: this block runs exactly once per module
// instance because ES module graphs are idempotent. The registry is part of
// the locked layer, so mutation from outside `$lib/research` is expected
// only for `comparison_target` additions and per-run LLM baselines.

import { RandomAgent as _DefaultRandomAgent } from './baselines/randomAgent.ts';
import { EngineOnlyAgent as _DefaultEngineOnlyAgent } from './baselines/engineOnlyAgent.ts';
import { RuleBasedAgent as _DefaultRuleBasedAgent } from './baselines/ruleBasedAgent.ts';
import { HumanDecisionAgent as _DefaultHumanDecisionAgent } from './baselines/humanDecisionAgent.ts';
import { defaultBaselineRegistry as _defaultBaselineRegistryRuntime } from './baselines/registry.ts';

_defaultBaselineRegistryRuntime.register(new _DefaultRandomAgent(), 'baseline');
_defaultBaselineRegistryRuntime.register(new _DefaultEngineOnlyAgent(), 'baseline');
_defaultBaselineRegistryRuntime.register(new _DefaultRuleBasedAgent(), 'baseline');
_defaultBaselineRegistryRuntime.register(new _DefaultHumanDecisionAgent(), 'baseline');
