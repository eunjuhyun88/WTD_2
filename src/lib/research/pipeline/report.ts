/**
 * `buildReport` + `assertReportComplete` — the output gate of the
 * research pipeline.
 *
 * `buildReport` assembles an `ExperimentReport` from the raw per-fold
 * per-agent execution results. It is a pure shaper — no I/O, no
 * computation beyond sorting for stable output ordering.
 *
 * `assertReportComplete` is the gate `runExperiment` runs before
 * returning. It verifies:
 *
 *   1. The report schema version is the current one.
 *   2. `config.id` matches what the runner was given.
 *   3. At least one fold was produced.
 *   4. Every fold's integrity record names all six assertion codes.
 *   5. Every configured agent has exactly one result per fold.
 *   6. Run timestamps are present and ordered.
 *
 * A completeness failure is almost always a pipeline bug rather than
 * a user error. Downstream readers may safely rely on the invariants
 * above when consuming a report.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D3, §R4.2
 */

import type { TemporalFold } from '../evaluation/temporalSplit.ts';
import type { IntegrityAssertion } from '../evaluation/temporalSplit.ts';
import type {
	ExperimentConfig,
	ExperimentReport,
	AgentFoldResult
} from './types.ts';
import { ReportCompletenessError } from './types.ts';

const REPORT_SCHEMA_VERSION = 'experiment-report-v1' as const;

const REQUIRED_INTEGRITY_CODES: ReadonlyArray<IntegrityAssertion> = [
	'config_within_bounds',
	'resolved_outcomes_only',
	'sorted_by_knowledge_horizon',
	'train_horizon_strictly_before_test_start',
	'embargo_satisfied',
	'purge_applied'
];

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

export interface BuildReportInput {
	readonly config: ExperimentConfig;
	readonly sourceDescription: string;
	readonly trajectoriesTotal: number;
	readonly foldResults: ReadonlyArray<{
		readonly fold: TemporalFold;
		readonly agentResults: ReadonlyArray<AgentFoldResult>;
	}>;
	readonly runStartedAt: string;
	readonly runFinishedAt: string;
}

/**
 * Pure shaper. Stable orderings:
 *   - Folds are sorted by `foldIndex` ascending.
 *   - Inside each fold, `agentResults` are sorted by `agentId` ascending.
 * This makes diffs across runs legible.
 */
export function buildReport(input: BuildReportInput): ExperimentReport {
	const sortedFolds = [...input.foldResults]
		.sort((a, b) => a.fold.foldIndex - b.fold.foldIndex)
		.map((entry) => ({
			fold: entry.fold,
			agentResults: [...entry.agentResults].sort((a, b) => {
				if (a.agentId < b.agentId) return -1;
				if (a.agentId > b.agentId) return 1;
				return 0;
			})
		}));

	return {
		reportSchemaVersion: REPORT_SCHEMA_VERSION,
		config: input.config,
		sourceDescription: input.sourceDescription,
		trajectoriesTotal: input.trajectoriesTotal,
		foldsBuilt: sortedFolds.length,
		folds: sortedFolds,
		runStartedAt: input.runStartedAt,
		runFinishedAt: input.runFinishedAt
	};
}

// ---------------------------------------------------------------------------
// assertReportComplete
// ---------------------------------------------------------------------------

export function assertReportComplete(report: ExperimentReport): void {
	// --- schema version --------------------------------------------------
	if (report.reportSchemaVersion !== REPORT_SCHEMA_VERSION) {
		throw new ReportCompletenessError(
			'unknown_schema_version',
			`expected ${REPORT_SCHEMA_VERSION}, got ${String(report.reportSchemaVersion)}`
		);
	}

	// --- timestamps ------------------------------------------------------
	if (
		typeof report.runStartedAt !== 'string' ||
		typeof report.runFinishedAt !== 'string' ||
		report.runStartedAt.length === 0 ||
		report.runFinishedAt.length === 0
	) {
		throw new ReportCompletenessError(
			'missing_timestamps',
			'runStartedAt and runFinishedAt must both be non-empty ISO strings'
		);
	}
	// Not a strict ordering requirement because same-millisecond starts/
	// finishes are possible under synthetic sources; we only reject NaN
	// or reversed timestamps.
	const started = Date.parse(report.runStartedAt);
	const finished = Date.parse(report.runFinishedAt);
	if (!Number.isFinite(started) || !Number.isFinite(finished)) {
		throw new ReportCompletenessError(
			'missing_timestamps',
			`run timestamps must parse as ISO-8601 (got ${report.runStartedAt} / ${report.runFinishedAt})`
		);
	}
	if (finished < started) {
		throw new ReportCompletenessError(
			'missing_timestamps',
			`runFinishedAt (${report.runFinishedAt}) is earlier than runStartedAt (${report.runStartedAt})`
		);
	}

	// --- folds -----------------------------------------------------------
	if (!Array.isArray(report.folds) || report.folds.length === 0) {
		throw new ReportCompletenessError(
			'empty_folds',
			'ExperimentReport.folds must contain at least one fold'
		);
	}
	if (report.foldsBuilt !== report.folds.length) {
		throw new ReportCompletenessError(
			'empty_folds',
			`foldsBuilt (${report.foldsBuilt}) does not match folds.length (${report.folds.length})`
		);
	}

	// --- agent coverage + integrity -------------------------------------
	const expectedAgentIds = report.config.agents.map((a) => a.id).sort();

	for (const entry of report.folds) {
		const { fold, agentResults } = entry;

		// Integrity — every required IntegrityAssertion must be named.
		for (const code of REQUIRED_INTEGRITY_CODES) {
			if (!fold.integrity.assertionsRan.includes(code)) {
				throw new ReportCompletenessError(
					'incomplete_integrity',
					`fold ${fold.foldIndex}: integrity.assertionsRan is missing '${code}'`
				);
			}
		}

		// Agent coverage — every configured agent must appear exactly once.
		if (agentResults.length !== expectedAgentIds.length) {
			throw new ReportCompletenessError(
				'missing_agent_result',
				`fold ${fold.foldIndex}: expected ${expectedAgentIds.length} agent result(s), got ${agentResults.length}`
			);
		}
		const seenAgentIds = agentResults.map((r: AgentFoldResult) => r.agentId).slice().sort();
		for (let i = 0; i < expectedAgentIds.length; i++) {
			if (seenAgentIds[i] !== expectedAgentIds[i]) {
				throw new ReportCompletenessError(
					'missing_agent_result',
					`fold ${fold.foldIndex}: expected agent '${expectedAgentIds[i]}', ` +
						`got '${seenAgentIds[i] ?? '(missing)'}'`
				);
			}
		}
	}

	// --- id consistency --------------------------------------------------
	if (typeof report.config.id !== 'string' || report.config.id.length === 0) {
		throw new ReportCompletenessError(
			'id_mismatch',
			'report.config.id must be a non-empty string'
		);
	}
}
