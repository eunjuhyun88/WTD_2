/**
 * `validateExperimentConfig` — the only invariant gate the experiment
 * boundary runs before building folds or touching the dataset source.
 *
 * Every failure throws `ConfigValidationError` with a named code so
 * acceptance tests (and future CI coverage) can assert specific
 * invariant violations without string matching.
 *
 * The invariants checked here are the *static* ones — anything that
 * can be verified from the config alone, without reading trajectories.
 * Temporal integrity checks (purge, embargo, horizon ordering) run
 * during split time and are enforced by `assertTemporalIntegrity`.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { BaselineAgent } from '../baselines/types.ts';
import type { ExperimentConfig, ResearchQuestionId } from './types.ts';
import { ConfigValidationError } from './types.ts';

const KNOWN_RQS: ReadonlyArray<ResearchQuestionId> = ['RQ-B', 'RQ-C', 'RQ-D'];

/**
 * Validates an `ExperimentConfig`. Throws `ConfigValidationError` on
 * the first violation encountered. Returns `void` on success — the
 * config is not mutated.
 */
export function validateExperimentConfig(config: ExperimentConfig): void {
	// --- identity --------------------------------------------------------
	if (typeof config.id !== 'string' || config.id.trim().length === 0) {
		throw new ConfigValidationError(
			'missing_id',
			'ExperimentConfig.id must be a non-empty string'
		);
	}

	// --- research question ----------------------------------------------
	if (!KNOWN_RQS.includes(config.rq)) {
		throw new ConfigValidationError(
			'unknown_rq',
			`ExperimentConfig.rq must be one of ${KNOWN_RQS.join(', ')}, got '${String(config.rq)}'`
		);
	}

	// --- seed ------------------------------------------------------------
	// Required per D3. A missing or non-finite seed means the run is
	// structurally non-reproducible, so we reject before touching any data.
	if (
		typeof config.seed !== 'number' ||
		!Number.isFinite(config.seed) ||
		!Number.isInteger(config.seed)
	) {
		throw new ConfigValidationError(
			'missing_seed',
			`ExperimentConfig.seed must be a finite integer, got ${String(config.seed)}`
		);
	}

	// --- agents ----------------------------------------------------------
	if (!Array.isArray(config.agents) || config.agents.length === 0) {
		throw new ConfigValidationError(
			'no_agents',
			'ExperimentConfig.agents must be a non-empty array of BaselineAgent instances'
		);
	}
	for (let i = 0; i < config.agents.length; i++) {
		const agent: BaselineAgent | undefined = config.agents[i];
		if (!agent) {
			throw new ConfigValidationError(
				'invalid_agent',
				`ExperimentConfig.agents[${i}] is null or undefined`
			);
		}
		if (typeof agent.id !== 'string' || agent.id.length === 0) {
			throw new ConfigValidationError(
				'invalid_agent',
				`ExperimentConfig.agents[${i}] is missing a non-empty 'id' field`
			);
		}
		if (typeof agent.decide !== 'function') {
			throw new ConfigValidationError(
				'invalid_agent',
				`ExperimentConfig.agents[${i}] ('${agent.id}') is missing a 'decide' method`
			);
		}
		if (typeof agent.baselineId !== 'string' || agent.baselineId.length === 0) {
			throw new ConfigValidationError(
				'invalid_agent',
				`ExperimentConfig.agents[${i}] ('${agent.id}') is missing a 'baselineId' marker`
			);
		}
	}

	// --- split override --------------------------------------------------
	if (config.splitOverride !== undefined) {
		if (typeof config.splitOverride !== 'object' || config.splitOverride === null) {
			throw new ConfigValidationError(
				'split_override_invalid',
				'ExperimentConfig.splitOverride must be an object when provided'
			);
		}
		const ov = config.splitOverride;
		if (ov.testDuration !== undefined && (!Number.isFinite(ov.testDuration) || ov.testDuration <= 0)) {
			throw new ConfigValidationError(
				'split_override_invalid',
				`splitOverride.testDuration must be a positive number, got ${ov.testDuration}`
			);
		}
		if (
			ov.trainDurationFloor !== undefined &&
			(!Number.isFinite(ov.trainDurationFloor) || ov.trainDurationFloor <= 0)
		) {
			throw new ConfigValidationError(
				'split_override_invalid',
				`splitOverride.trainDurationFloor must be a positive number, got ${ov.trainDurationFloor}`
			);
		}
		if (ov.purgeDuration !== undefined && ov.purgeDuration < 0) {
			throw new ConfigValidationError(
				'purge_negative',
				`splitOverride.purgeDuration must be non-negative, got ${ov.purgeDuration}`
			);
		}
		if (ov.embargoDuration !== undefined) {
			// Embargo zero is rejected categorically — the leakage discipline
			// requires a non-zero gap between train horizon and test start
			// for any real experiment. R3 may sweep non-zero values; zero
			// is never valid.
			if (!Number.isFinite(ov.embargoDuration) || ov.embargoDuration <= 0) {
				throw new ConfigValidationError(
					'embargo_zero',
					`splitOverride.embargoDuration must be a positive number, got ${ov.embargoDuration}`
				);
			}
		}
		if (ov.maxFolds !== undefined && (!Number.isInteger(ov.maxFolds) || ov.maxFolds <= 0)) {
			throw new ConfigValidationError(
				'split_override_invalid',
				`splitOverride.maxFolds must be a positive integer, got ${ov.maxFolds}`
			);
		}
	}

	// --- utility weights -------------------------------------------------
	if (config.utilityWeights !== undefined) {
		const w = config.utilityWeights;
		const keys = ['pnl', 'drawdown', 'violation', 'directionHit', 'slippage'] as const;
		for (const k of keys) {
			const v = w[k];
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				throw new ConfigValidationError(
					'utility_weights_invalid',
					`utilityWeights.${k} must be a finite number, got ${String(v)}`
				);
			}
		}
	}
}
