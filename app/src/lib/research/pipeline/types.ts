/**
 * Pipeline type contracts — R4.2.
 *
 * The research pipeline is the single public execution surface of
 * `$lib/research`. Every experiment enters through `runExperiment`,
 * every result is shaped as an `ExperimentReport`, and every data
 * provider implements `DatasetSource`. The types here define the
 * boundary; `runner.ts` implements the execution behind it.
 *
 * Safety invariant (autoresearch 3-artifact discipline, D3): the
 * experiment file (`scripts/research/experiments/<id>/experiment.mjs`)
 * constructs an `ExperimentConfig` + `DatasetSource` and hands both to
 * `runExperiment`. Nothing else in `$lib/research` is a public
 * execution entry point.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { DecisionTrajectory, DecisionAction } from '../../contracts/index.ts';
import type { BaselineAgent } from '../baselines/types.ts';
import type { UtilityWeights } from '../evaluation/types.ts';
import type { TemporalFold, TemporalSplitConfig } from '../evaluation/temporalSplit.ts';

// ---------------------------------------------------------------------------
// ExperimentConfig — the one-file experiment spec
// ---------------------------------------------------------------------------

/**
 * Research-question identifier. The enum is closed: every new RQ must
 * first land in the canonical protocol doc and then in this type.
 */
export type ResearchQuestionId = 'RQ-B' | 'RQ-C' | 'RQ-D';

/**
 * An experiment config is a serializable spec of a single run.
 *
 * Per D3: "every invariant is enforced at the runExperiment boundary,
 * no other public execution surface exists". The shape here is what the
 * locked layer validates; anything past validation is opaque to the
 * experiment file.
 *
 * R4.3 will add a registry-backed `agentIds: BaselineId[]` variant so
 * experiment files don't need to import concrete agent classes. Until
 * R4.3 lands, experiments pass instances directly.
 */
export interface ExperimentConfig {
	/** Stable ID — used as report filename and cross-referenced in objective docs. */
	readonly id: string;

	/** Research question this experiment targets. */
	readonly rq: ResearchQuestionId;

	/** RNG seed for reproducibility. Required — no global RNG is allowed. */
	readonly seed: number;

	/**
	 * Concrete agent instances (R4.2). R4.3 will add an ID-based variant
	 * backed by the baseline registry. Experiments must pass at least
	 * one agent.
	 */
	readonly agents: ReadonlyArray<BaselineAgent>;

	/**
	 * Partial override of `DEFAULT_TEMPORAL_SPLIT`. The override is merged
	 * with the default at `runExperiment` time, and `validateExperimentConfig`
	 * rejects any combination that violates the temporal invariants.
	 */
	readonly splitOverride?: Partial<TemporalSplitConfig>;

	/** Optional utility weights. Defaults to `ORPO_CANONICAL_WEIGHTS`. */
	readonly utilityWeights?: UtilityWeights;
}

// ---------------------------------------------------------------------------
// DatasetSource — the one-function data provider
// ---------------------------------------------------------------------------

/**
 * Data providers implement this interface. The runner calls `load()`
 * once and treats the returned array as immutable for the rest of the
 * experiment. Implementations are free to fetch from disk, generate
 * synthetically, or read from a database — the boundary hides the source.
 *
 * The `describe()` method returns a provenance string that is stamped
 * into the report so future readers can see which source produced the
 * trajectories.
 */
export interface DatasetSource {
	readonly id: string;
	describe(): string;
	load(): Promise<ReadonlyArray<DecisionTrajectory>>;
}

// ---------------------------------------------------------------------------
// ExperimentReport — the auto-generated output
// ---------------------------------------------------------------------------

/**
 * Per-trajectory decision outcome inside a fold. The proposal is what
 * the agent chose given the verdict block; the utility is what the
 * toy utility function assigned to that choice against the recorded
 * trajectory outcome.
 */
export interface AgentDecisionRecord {
	readonly trajectoryId: string;
	readonly action: DecisionAction;
	readonly utility: number;
}

/** Per-agent per-fold summary. */
export interface AgentFoldResult {
	readonly agentId: string;
	readonly foldIndex: number;
	readonly sampleSize: number;
	readonly meanUtility: number;
	readonly totalUtility: number;
	readonly decisions: ReadonlyArray<AgentDecisionRecord>;
}

/**
 * The auto-generated experiment report. Everything the harness observes
 * goes here — no side-effect logs, no out-of-band metrics. If a reader
 * cannot reconstruct "what happened" from this object alone, the
 * experiment is not reproducible.
 */
export interface ExperimentReport {
	readonly reportSchemaVersion: 'experiment-report-v1';

	readonly config: ExperimentConfig;
	readonly sourceDescription: string;

	/** Total trajectories loaded from the source (before splitting). */
	readonly trajectoriesTotal: number;

	/** Folds produced by the temporal splitter. */
	readonly foldsBuilt: number;

	/**
	 * Per-fold × per-agent summary. Indexed by `foldIndex` then by
	 * `agentId` for stable ordering across runs.
	 */
	readonly folds: ReadonlyArray<{
		readonly fold: TemporalFold;
		readonly agentResults: ReadonlyArray<AgentFoldResult>;
	}>;

	/** Wall-clock run metadata. */
	readonly runStartedAt: string;
	readonly runFinishedAt: string;
}

// ---------------------------------------------------------------------------
// ConfigValidationError — the only public error the validator throws
// ---------------------------------------------------------------------------

/**
 * Categorical error codes emitted by `validateExperimentConfig`. Named
 * so that acceptance tests can assert "this config triggered exactly
 * this invariant" without string matching.
 */
export type ConfigValidationCode =
	| 'missing_id'
	| 'unknown_rq'
	| 'missing_seed'
	| 'no_agents'
	| 'invalid_agent'
	| 'split_override_invalid'
	| 'embargo_zero'
	| 'purge_negative'
	| 'utility_weights_invalid';

export class ConfigValidationError extends Error {
	readonly code: ConfigValidationCode;
	readonly detail: string;
	constructor(code: ConfigValidationCode, detail: string) {
		super(`ConfigValidationError[${code}]: ${detail}`);
		this.name = 'ConfigValidationError';
		this.code = code;
		this.detail = detail;
	}
}

// ---------------------------------------------------------------------------
// ReportCompletenessError — thrown by assertReportComplete on violations
// ---------------------------------------------------------------------------

export type ReportCompletenessCode =
	| 'id_mismatch'
	| 'empty_folds'
	| 'missing_agent_result'
	| 'incomplete_integrity'
	| 'missing_timestamps'
	| 'unknown_schema_version';

export class ReportCompletenessError extends Error {
	readonly code: ReportCompletenessCode;
	readonly detail: string;
	constructor(code: ReportCompletenessCode, detail: string) {
		super(`ReportCompletenessError[${code}]: ${detail}`);
		this.name = 'ReportCompletenessError';
		this.code = code;
		this.detail = detail;
	}
}
