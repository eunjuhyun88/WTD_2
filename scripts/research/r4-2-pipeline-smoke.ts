/**
 * R4.2 pipeline smoke test.
 *
 * Acceptance for §R4.2 (from research-spine-2026-04-11.md):
 *
 *   - `runExperiment(config, source)` runs end-to-end on a 5-trajectory
 *     synthetic source with `RandomAgent`.
 *   - Rejects invalid config (embargo=0, missing seed, no agents,
 *     malformed agent) with named `ConfigValidationError` codes.
 *   - `assertTemporalIntegrity` fires on every fold (verified because
 *     the runner calls it and a failure would propagate as `LeakageError`
 *     out of `runExperiment`).
 *
 * This script uses Node's `--experimental-strip-types` loader to run TS
 * directly, same pattern as `r4-1-leakage-fixtures.ts`. All imports are
 * explicit `.ts` extensions so the loader can resolve without a path
 * scanner. Runtime imports go through `assertIntegrity` (type-only
 * imports of splitter types are erased). The pipeline runner is
 * imported directly — it internally re-exports its transitive deps.
 *
 * Run:
 *   npm run research:r4-2-smoke
 */

import type { DecisionTrajectory } from '../../src/lib/contracts/index.ts';
import type { BaselineAgent } from '../../src/lib/research/baselines/types.ts';
import { createRandomAgent } from '../../src/lib/research/baselines/randomAgent.ts';
import type {
	ExperimentConfig,
	DatasetSource,
	ConfigValidationCode
} from '../../src/lib/research/pipeline/types.ts';
import { ConfigValidationError } from '../../src/lib/research/pipeline/types.ts';
import { validateExperimentConfig } from '../../src/lib/research/pipeline/validate.ts';
import { runExperiment } from '../../src/lib/research/pipeline/runner.ts';
import { ORPO_CANONICAL_WEIGHTS } from '../../src/lib/research/evaluation/types.ts';

// ---------------------------------------------------------------------------
// Synthetic trajectory factory
// ---------------------------------------------------------------------------

function makeTraj(params: {
	id: string;
	createdAt: string;
	resolvedAt: string;
	pnlBps: number;
}): DecisionTrajectory {
	return {
		id: params.id,
		created_at: params.createdAt,
		regime: 'trend',
		verdict_block: {} /* agents only read this; RandomAgent ignores it */,
		outcome: {
			resolved: true,
			resolved_at: params.resolvedAt,
			pnl_bps: params.pnlBps,
			max_favorable_bps: Math.abs(params.pnlBps),
			max_adverse_bps: Math.abs(params.pnlBps) / 4,
			tp_hit_index: null,
			stop_hit: null,
			structure_state_after: null,
			utility_score: null,
			rule_violation_count: 0,
			p0_violation: false
		}
	} as unknown as DecisionTrajectory;
}

const DAY = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse('2026-01-01T00:00:00Z');
const iso = (offsetMs: number): string => new Date(EPOCH + offsetMs).toISOString();

function buildFiveTrajectorySource(): DatasetSource {
	// 3 train rows (resolved by day 3.5), 2 test rows (created day 5-6).
	// Chosen so a (trainFloor=3d, embargo=0.5d, test=2d) split yields exactly
	// one fold with 3 train and 2 test rows — the minimum viable shape the
	// acceptance criterion calls for.
	const trajectories: DecisionTrajectory[] = [
		makeTraj({
			id: 'traj-train-0',
			createdAt: iso(0),
			resolvedAt: iso(12 * 60 * 60 * 1000),
			pnlBps: 20
		}),
		makeTraj({
			id: 'traj-train-1',
			createdAt: iso(1 * DAY),
			resolvedAt: iso(1 * DAY + 12 * 60 * 60 * 1000),
			pnlBps: -15
		}),
		makeTraj({
			id: 'traj-train-2',
			createdAt: iso(2 * DAY),
			resolvedAt: iso(2 * DAY + 12 * 60 * 60 * 1000),
			pnlBps: 30
		}),
		makeTraj({
			id: 'traj-test-0',
			createdAt: iso(4 * DAY),
			resolvedAt: iso(4 * DAY + 12 * 60 * 60 * 1000),
			pnlBps: 10
		}),
		makeTraj({
			id: 'traj-test-1',
			createdAt: iso(5 * DAY),
			resolvedAt: iso(5 * DAY + 12 * 60 * 60 * 1000),
			pnlBps: -25
		})
	];
	return {
		id: 'smoke.five-trajectory',
		describe: () => 'R4.2 smoke — 5 synthetic trajectories, trend regime, deterministic outcomes',
		load: async () => trajectories
	};
}

function buildBaseConfig(agents: ReadonlyArray<BaselineAgent>): ExperimentConfig {
	return {
		id: 'rq-b-smoke-2026-04-11',
		rq: 'RQ-B',
		seed: 42,
		agents,
		splitOverride: {
			trainDurationFloor: 3 * DAY,
			embargoDuration: Math.floor(0.5 * DAY),
			testDuration: 2 * DAY,
			purgeDuration: 0,
			maxFolds: 1
		},
		utilityWeights: ORPO_CANONICAL_WEIGHTS
	};
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function expectConfigError(
	fn: () => void,
	expected: ConfigValidationCode,
	name: string
): string {
	try {
		fn();
	} catch (err) {
		if (err instanceof ConfigValidationError) {
			if (err.code === expected) return `PASS  ${name}  →  ${err.code}`;
			return `FAIL  ${name}  → expected ${expected}, got ${err.code}: ${err.detail}`;
		}
		return `FAIL  ${name}  → non-ConfigValidationError: ${(err as Error).message}`;
	}
	return `FAIL  ${name}  → expected ConfigValidationError(${expected}), nothing thrown`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
	console.log('R4.2 pipeline smoke gate');
	console.log('========================');

	const lines: string[] = [];
	const random = createRandomAgent({ defaultSeed: 7 });

	// --- 1. Rejection matrix ------------------------------------------
	lines.push(
		expectConfigError(
			() => validateExperimentConfig({ ...buildBaseConfig([random]), id: '' }),
			'missing_id',
			'reject: empty id'
		)
	);
	lines.push(
		expectConfigError(
			() =>
				validateExperimentConfig({
					...buildBaseConfig([random]),
					rq: 'RQ-Z' as ExperimentConfig['rq']
				}),
			'unknown_rq',
			'reject: unknown RQ'
		)
	);
	lines.push(
		expectConfigError(
			() =>
				validateExperimentConfig({
					...buildBaseConfig([random]),
					seed: Number.NaN
				}),
			'missing_seed',
			'reject: NaN seed'
		)
	);
	lines.push(
		expectConfigError(
			() => validateExperimentConfig(buildBaseConfig([])),
			'no_agents',
			'reject: empty agents array'
		)
	);
	lines.push(
		expectConfigError(
			() =>
				validateExperimentConfig(
					buildBaseConfig([
						// Malformed — missing `decide`, `baselineId`.
						{ id: 'bogus', label: 'x', version: 'v0', deterministic: true } as unknown as BaselineAgent
					])
				),
			'invalid_agent',
			'reject: malformed agent instance'
		)
	);
	lines.push(
		expectConfigError(
			() =>
				validateExperimentConfig({
					...buildBaseConfig([random]),
					splitOverride: { embargoDuration: 0 }
				}),
			'embargo_zero',
			'reject: embargo = 0'
		)
	);

	// --- 2. Happy path ------------------------------------------------
	try {
		const source = buildFiveTrajectorySource();
		const config = buildBaseConfig([random]);
		const report = await runExperiment(config, source);

		const foldCountOk = report.foldsBuilt === 1 && report.folds.length === 1;
		const agentCountOk = report.folds[0]!.agentResults.length === 1;
		const sampleOk = report.folds[0]!.agentResults[0]!.sampleSize === 2;
		const integrityOk = report.folds[0]!.fold.integrity.assertionsRan.length === 6;

		if (foldCountOk && agentCountOk && sampleOk && integrityOk) {
			lines.push(
				`PASS  happy: runExperiment → 1 fold, 1 agent, 2 test decisions, 6/6 integrity codes`
			);
		} else {
			lines.push(
				`FAIL  happy: folds=${report.foldsBuilt} agents=${report.folds[0]?.agentResults.length} ` +
					`samples=${report.folds[0]?.agentResults[0]?.sampleSize} ` +
					`integrity=${report.folds[0]?.fold.integrity.assertionsRan.length}/6`
			);
		}
	} catch (err) {
		lines.push(`FAIL  happy: ${(err as Error).name}: ${(err as Error).message}`);
	}

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}
	console.log('------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} pipeline assertions passed.`
			: `${failed} of ${lines.length} pipeline assertions FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
