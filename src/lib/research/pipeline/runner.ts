/**
 * `runExperiment` — the single execution entry point of `$lib/research`.
 *
 * Per D3, no other public symbol runs an experiment. The runner
 * orchestrates:
 *
 *   1. `validateExperimentConfig(config)`                — invariant gate
 *   2. `source.load()`                                    — data provider
 *   3. `assertTrajectoriesWellFormed(trajectories)`       — structural check
 *   4. `temporalSplit(trajectories, effectiveConfig)`     — leakage-safe fold
 *   5. `assertTemporalIntegrity(fold)` for each fold      — D2 re-verification
 *   6. Per-fold × per-agent decide loop + utility scoring — scoring
 *   7. `buildReport(results, config)`                     — report shape
 *   8. `assertReportComplete(report)`                     — output gate
 *   9. return report
 *
 * Utility scoring in R4.2 is deliberately toy:
 *   - `wait` proposal contributes zero utility
 *   - `open_long` proposal contributes `outcome.pnl_bps`
 *   - `open_short` proposal contributes `-outcome.pnl_bps`
 * This is NOT a counterfactual market simulator — it replays the
 * recorded human decision's outcome as a proxy for "what would have
 * happened". R5 will replace this with a proper utility function
 * parameterized by `UtilityWeights` and regime breakdown. R4.2's job
 * is to prove the pipeline runs and returns a well-formed report.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D3, §R4.2
 */

import type { DecisionTrajectory } from '../../contracts/index.ts';
import type { BaselineAgent } from '../baselines/types.ts';
import type { AgentDecisionProposal } from '../evaluation/types.ts';
import type { UtilityWeights } from '../evaluation/types.ts';
import { ORPO_CANONICAL_WEIGHTS } from '../evaluation/types.ts';
import type { TemporalSplitConfig, TemporalFold } from '../evaluation/temporalSplit.ts';
import {
	temporalSplit,
	DEFAULT_TEMPORAL_SPLIT,
	assertTemporalIntegrity
} from '../evaluation/temporalSplit.ts';
import { LeakageError } from '../evaluation/assertIntegrity.ts';
import type {
	ExperimentConfig,
	ExperimentReport,
	DatasetSource,
	AgentFoldResult,
	AgentDecisionRecord
} from './types.ts';
import { ConfigValidationError } from './types.ts';
import { validateExperimentConfig } from './validate.ts';
import { buildReport, assertReportComplete } from './report.ts';

// ---------------------------------------------------------------------------
// Structural trajectory check (pre-split)
// ---------------------------------------------------------------------------

/**
 * Minimal structural check that the trajectories returned by the source
 * carry the fields the splitter reads. Full zod validation is the
 * source's responsibility; this is the runner's last line of defense
 * before handing bytes to downstream invariants.
 */
function assertTrajectoriesWellFormed(
	trajectories: ReadonlyArray<DecisionTrajectory>
): void {
	if (trajectories.length === 0) {
		throw new LeakageError(
			'config_within_bounds',
			'DatasetSource.load() returned zero trajectories — cannot run experiment'
		);
	}
	for (let i = 0; i < trajectories.length; i++) {
		const t = trajectories[i];
		if (!t) {
			throw new LeakageError(
				'config_within_bounds',
				`trajectory at index ${i} is null or undefined`
			);
		}
		if (typeof t.id !== 'string' || t.id.length === 0) {
			throw new LeakageError(
				'config_within_bounds',
				`trajectory at index ${i} has no id`
			);
		}
		if (typeof t.created_at !== 'string') {
			throw new LeakageError(
				'config_within_bounds',
				`trajectory ${t.id} is missing created_at`
			);
		}
		if (typeof t.outcome !== 'object' || t.outcome === null) {
			throw new LeakageError(
				'config_within_bounds',
				`trajectory ${t.id} is missing outcome`
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Utility scoring (toy R4.2 version — refined in R5)
// ---------------------------------------------------------------------------

function scoreDecision(
	proposal: AgentDecisionProposal,
	trajectory: DecisionTrajectory,
	weights: UtilityWeights
): number {
	const pnl = trajectory.outcome.pnl_bps ?? 0;
	const drawdown = trajectory.outcome.max_adverse_bps ?? 0;
	const violations = trajectory.outcome.rule_violation_count ?? 0;

	let directional = 0;
	switch (proposal.action) {
		case 'open_long':
			directional = pnl;
			break;
		case 'open_short':
			directional = -pnl;
			break;
		case 'wait':
		case 'close':
			// `close` is meaningless in a fresh-observation test run — the
			// toy utility model has no position to close. R5 will revisit
			// this once the utility function gains position state.
			directional = 0;
			break;
	}

	// v1 linear combination. Drawdown penalty uses |max_adverse_bps| because
	// the contract stores it as a signed value that can be positive or
	// negative depending on the trajectory's direction.
	return (
		weights.pnl * directional -
		weights.drawdown * Math.abs(drawdown) -
		weights.violation * violations
	);
}

// ---------------------------------------------------------------------------
// Per-fold per-agent execution
// ---------------------------------------------------------------------------

function runAgentOnFold(
	agent: BaselineAgent,
	fold: TemporalFold,
	seed: number,
	weights: UtilityWeights
): AgentFoldResult {
	const decisions: AgentDecisionRecord[] = [];
	let totalUtility = 0;
	for (let i = 0; i < fold.test.trajectories.length; i++) {
		const traj = fold.test.trajectories[i]!;
		// Derive a per-trajectory seed so stochastic agents are reproducible
		// without sharing state across trajectories within a fold.
		const perTrajSeed = seed ^ ((fold.foldIndex + 1) * 0x9e3779b1) ^ (i * 0x85ebca6b);
		const proposal = agent.decide({
			verdict: traj.verdict_block,
			context: { seed: perTrajSeed }
		});
		const utility = scoreDecision(proposal, traj, weights);
		totalUtility += utility;
		decisions.push({
			trajectoryId: traj.id,
			action: proposal.action,
			utility
		});
	}
	const sampleSize = decisions.length;
	return {
		agentId: agent.id,
		foldIndex: fold.foldIndex,
		sampleSize,
		meanUtility: sampleSize > 0 ? totalUtility / sampleSize : 0,
		totalUtility,
		decisions
	};
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run a single experiment end-to-end. All invariants (config
 * validation, temporal integrity, report completeness) fire here;
 * no public caller can skip any step.
 *
 * Errors surface as typed exceptions:
 *   - `ConfigValidationError` before any data is touched
 *   - `LeakageError` during split or integrity re-verification
 *   - `ReportCompletenessError` if the assembled report fails the
 *     completeness gate (usually a symptom of a pipeline bug)
 *
 * Callers are expected to let these propagate — the research spine
 * treats any failure as a failed experiment that must not be reported.
 */
export async function runExperiment(
	config: ExperimentConfig,
	source: DatasetSource
): Promise<ExperimentReport> {
	const runStartedAt = new Date().toISOString();

	// 1. Invariant gate — throws ConfigValidationError.
	validateExperimentConfig(config);

	// Merge split override with defaults after validation so the validator's
	// error messages reference the user's exact input, not a merged blob.
	const effectiveSplit: TemporalSplitConfig = {
		...DEFAULT_TEMPORAL_SPLIT,
		...(config.splitOverride ?? {})
	};
	const weights = config.utilityWeights ?? ORPO_CANONICAL_WEIGHTS;

	// 2. Load data.
	const trajectories = await source.load();

	// 3. Structural check.
	assertTrajectoriesWellFormed(trajectories);

	// 4. Leakage-safe split.
	const folds = temporalSplit(trajectories, effectiveSplit);

	// 5. Re-verify every fold via the aggregate gate — this is the
	//    invariant that makes leakage detection non-bypassable.
	for (const fold of folds) {
		assertTemporalIntegrity(fold);
	}

	// 6. Per-fold × per-agent execution.
	const foldResults: Array<{
		fold: TemporalFold;
		agentResults: AgentFoldResult[];
	}> = [];
	for (const fold of folds) {
		const agentResults: AgentFoldResult[] = [];
		for (const agent of config.agents) {
			agentResults.push(runAgentOnFold(agent, fold, config.seed, weights));
		}
		foldResults.push({ fold, agentResults });
	}

	// 7 + 8. Build report, then assert completeness.
	const runFinishedAt = new Date().toISOString();
	const report = buildReport({
		config,
		sourceDescription: source.describe(),
		trajectoriesTotal: trajectories.length,
		foldResults,
		runStartedAt,
		runFinishedAt
	});
	assertReportComplete(report);

	return report;
}

// Re-export the error types so experiment files can import the full
// R4.2 public surface from a single specifier.
export { ConfigValidationError };
