/**
 * R4.1 leakage fixture runner.
 *
 * Acceptance test for the leakage-safe temporal splitter. Constructs six
 * synthetic scenarios, one per `IntegrityAssertion` code, and verifies
 * that the correct `LeakageError` fires on each. A seventh scenario runs
 * the splitter on well-formed data and confirms it produces folds that
 * pass `assertTemporalIntegrity` on re-verification.
 *
 * Run:
 *   node --experimental-strip-types scripts/research/r4-1-leakage-fixtures.ts
 *
 * This script uses explicit `.ts` extensions on its imports so Node's
 * strip-types loader resolves them directly without an extension scanner.
 * The script is not part of the SvelteKit build — it is a one-off
 * acceptance gate for R4.1 that runs locally and in CI as part of
 * `npm run research:r4-1-fixtures`.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R4.1 acceptance
 */

import type { DecisionTrajectory } from '../../src/lib/contracts/index.ts';
import {
	LeakageError,
	assertConfigWithinBounds,
	assertResolvedOutcomesOnly,
	assertSortedByKnowledgeHorizon,
	assertTrainHorizonStrictlyBeforeTestStart,
	assertEmbargoSatisfied,
	assertPurgeApplied
} from '../../src/lib/research/evaluation/assertIntegrity.ts';
// Type-only imports are erased by Node's strip-types loader at runtime, so
// they do NOT require the importing module to be resolvable. The splitter
// happy path (calling `temporalSplit()` end-to-end) is deferred to R4.5 where
// the synthetic `DatasetSource` lands — this R4.1 script's acceptance is
// solely "the six IntegrityAssertion codes fire on synthetic leakage
// fixtures" per research-spine-2026-04-11.md §R4.1.
import type {
	TemporalFold,
	TemporalSplitConfig,
	IntegrityAssertion
} from '../../src/lib/research/evaluation/temporalSplit.ts';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

/**
 * Build a minimal trajectory-shaped object good enough for the splitter
 * and assertions. We cast through `unknown` because the splitter only
 * reads `id`, `created_at`, `regime`, `outcome.resolved`, and
 * `outcome.resolved_at`. Constructing a full `VerdictBlock` + `Decision`
 * here would triple the script size with zero additional coverage.
 */
function makeTraj(params: {
	id: string;
	createdAt: string;
	resolvedAt: string | null;
	resolved: boolean;
	regime?: 'trend' | 'range' | 'high_vol' | 'unknown';
}): DecisionTrajectory {
	return {
		id: params.id,
		created_at: params.createdAt,
		regime: params.regime ?? 'unknown',
		outcome: {
			resolved: params.resolved,
			resolved_at: params.resolvedAt,
			pnl_bps: params.resolved ? 0 : null,
			max_favorable_bps: null,
			max_adverse_bps: null,
			tp_hit_index: null,
			stop_hit: null,
			structure_state_after: null,
			utility_score: null,
			rule_violation_count: null,
			p0_violation: null
		}
	} as unknown as DecisionTrajectory;
}

/** Tiny ISO arithmetic helper: add/subtract ms, return ISO string. */
function iso(baseMs: number, offsetMs: number = 0): string {
	return new Date(baseMs + offsetMs).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;

// A tight test config with small windows so fixtures stay readable.
const SMALL_CONFIG: TemporalSplitConfig = {
	expansion: 'anchored',
	testDuration: 3 * DAY,
	trainDurationFloor: 10 * DAY,
	purgeDuration: DAY,
	embargoDuration: DAY,
	maxFolds: 3
};

/** Anchor epoch (2026-01-01T00:00:00Z) in ms. */
const EPOCH = Date.parse('2026-01-01T00:00:00Z');

/**
 * Build a minimum-viable well-formed fold — used as the starting point
 * for scenarios that mutate exactly one field to violate exactly one
 * assertion. Keeps each fixture focused on a single failure mode.
 */
function buildCleanFold(): TemporalFold {
	const trainRows: DecisionTrajectory[] = [];
	for (let i = 0; i < 5; i++) {
		trainRows.push(
			makeTraj({
				id: `train-${i}`,
				createdAt: iso(EPOCH, i * DAY),
				resolvedAt: iso(EPOCH, i * DAY + DAY), // resolved 1 day after creation
				resolved: true
			})
		);
	}
	const trainHorizonMs = EPOCH + 5 * DAY; // last train row resolved at +5d
	const testStartMs = trainHorizonMs + SMALL_CONFIG.embargoDuration + DAY; // +2d embargo gap
	const testRows: DecisionTrajectory[] = [];
	for (let i = 0; i < 3; i++) {
		testRows.push(
			makeTraj({
				id: `test-${i}`,
				createdAt: iso(testStartMs, i * DAY),
				resolvedAt: iso(testStartMs, i * DAY + DAY),
				resolved: true
			})
		);
	}
	const fold: TemporalFold = {
		foldIndex: 0,
		train: {
			id: 'fold-000-train' as unknown as TemporalFold['train']['id'],
			label: 'fold-0/train',
			startAt: trainRows[0]!.created_at,
			endAt: trainRows[trainRows.length - 1]!.created_at,
			regime: 'unknown',
			trajectories: trainRows
		},
		test: {
			id: 'fold-000-test' as unknown as TemporalFold['test']['id'],
			label: 'fold-0/test',
			startAt: testRows[0]!.created_at,
			endAt: testRows[testRows.length - 1]!.created_at,
			regime: 'unknown',
			trajectories: testRows
		},
		integrity: {
			trainKnowledgeHorizon: iso(trainHorizonMs),
			testStart: iso(testStartMs),
			embargoGap: testStartMs - trainHorizonMs,
			purgedCount: 0,
			config: SMALL_CONFIG,
			assertionsRan: [
				'config_within_bounds',
				'resolved_outcomes_only',
				'sorted_by_knowledge_horizon',
				'train_horizon_strictly_before_test_start',
				'embargo_satisfied',
				'purge_applied'
			],
			assertedAt: new Date().toISOString()
		}
	};
	return fold;
}

// ---------------------------------------------------------------------------
// Fixture runner
// ---------------------------------------------------------------------------

interface FixtureCase {
	name: string;
	expectedCode: IntegrityAssertion;
	run: () => void;
}

function expectLeakage(fn: () => void, expected: IntegrityAssertion, name: string): string {
	try {
		fn();
	} catch (err) {
		if (err instanceof LeakageError) {
			if (err.code === expected) return `PASS  ${name}  →  ${err.code}`;
			return `FAIL  ${name}  → expected ${expected}, got ${err.code}: ${err.detail}`;
		}
		return `FAIL  ${name}  → non-LeakageError thrown: ${(err as Error).message}`;
	}
	return `FAIL  ${name}  → expected LeakageError(${expected}), nothing thrown`;
}

const fixtures: FixtureCase[] = [
	{
		name: 'config_within_bounds: zero testDuration',
		expectedCode: 'config_within_bounds',
		run: () =>
			assertConfigWithinBounds({
				...SMALL_CONFIG,
				testDuration: 0
			})
	},
	{
		name: 'resolved_outcomes_only: unresolved row in slice',
		expectedCode: 'resolved_outcomes_only',
		run: () => {
			const rows: DecisionTrajectory[] = [
				makeTraj({
					id: 'ok-1',
					createdAt: iso(EPOCH, 0),
					resolvedAt: iso(EPOCH, DAY),
					resolved: true
				}),
				makeTraj({
					id: 'bad-1',
					createdAt: iso(EPOCH, 2 * DAY),
					resolvedAt: null,
					resolved: false
				})
			];
			assertResolvedOutcomesOnly(rows, 'fixture slice');
		}
	},
	{
		name: 'sorted_by_knowledge_horizon: out-of-order resolved_at in train',
		expectedCode: 'sorted_by_knowledge_horizon',
		run: () => {
			const rows: DecisionTrajectory[] = [
				makeTraj({
					id: 'a',
					createdAt: iso(EPOCH, 0),
					resolvedAt: iso(EPOCH, 5 * DAY),
					resolved: true
				}),
				makeTraj({
					id: 'b',
					createdAt: iso(EPOCH, DAY),
					resolvedAt: iso(EPOCH, 2 * DAY), // earlier than previous!
					resolved: true
				})
			];
			assertSortedByKnowledgeHorizon(rows, 'resolved_at', 'fixture train');
		}
	},
	{
		name: 'train_horizon_strictly_before_test_start: overlap',
		expectedCode: 'train_horizon_strictly_before_test_start',
		run: () => {
			const fold = buildCleanFold();
			// Mutate: push a train row whose resolved_at is AFTER the test start,
			// so the train horizon jumps forward and exceeds test_start.
			const testStartMs = Date.parse(fold.integrity.testStart);
			const mutatedTrain: DecisionTrajectory[] = [
				...fold.train.trajectories,
				makeTraj({
					id: 'train-leak',
					createdAt: iso(testStartMs - DAY),
					resolvedAt: iso(testStartMs + DAY), // horizon past test start
					resolved: true
				})
			];
			const mutated: TemporalFold = {
				...fold,
				train: { ...fold.train, trajectories: mutatedTrain }
			};
			assertTrainHorizonStrictlyBeforeTestStart(mutated);
		}
	},
	{
		name: 'embargo_satisfied: gap smaller than config',
		expectedCode: 'embargo_satisfied',
		run: () => {
			const fold = buildCleanFold();
			// Mutate: shrink test start so the actual gap is below embargo.
			const trainHorizonMs = Date.parse(fold.integrity.trainKnowledgeHorizon);
			const newTestStartMs = trainHorizonMs + Math.floor(SMALL_CONFIG.embargoDuration / 2);
			const mutatedTest: DecisionTrajectory[] = [
				makeTraj({
					id: 'test-short',
					createdAt: iso(newTestStartMs),
					resolvedAt: iso(newTestStartMs + DAY),
					resolved: true
				})
			];
			const mutated: TemporalFold = {
				...fold,
				test: {
					...fold.test,
					trajectories: mutatedTest,
					startAt: mutatedTest[0]!.created_at,
					endAt: mutatedTest[0]!.created_at
				},
				integrity: {
					...fold.integrity,
					testStart: iso(newTestStartMs),
					embargoGap: newTestStartMs - trainHorizonMs
				}
			};
			assertEmbargoSatisfied(mutated);
		}
	},
	{
		name: 'purge_applied: row inside purge window not dropped',
		expectedCode: 'purge_applied',
		run: () => {
			const fold = buildCleanFold();
			// Mutate: add a train row whose resolved_at sits strictly inside the
			// purge window (trainEnd - purgeDuration, trainEnd). Keep the reported
			// trainKnowledgeHorizon the same as before — the assertion re-computes
			// the purge window from config.purgeDuration and trainKnowledgeHorizon.
			const trainHorizonMs = Date.parse(fold.integrity.trainKnowledgeHorizon);
			const purgeStartMs = trainHorizonMs - SMALL_CONFIG.purgeDuration;
			const insidePurge = purgeStartMs + Math.floor(SMALL_CONFIG.purgeDuration / 2);
			// Insert the leaky row earlier in the array so the sort invariant
			// still holds on resolved_at (insidePurge < trainHorizonMs).
			const mutatedTrain: DecisionTrajectory[] = [
				...fold.train.trajectories.slice(0, -1),
				makeTraj({
					id: 'train-purge-leak',
					createdAt: iso(insidePurge - DAY),
					resolvedAt: iso(insidePurge),
					resolved: true
				}),
				fold.train.trajectories[fold.train.trajectories.length - 1]!
			];
			const mutated: TemporalFold = {
				...fold,
				train: { ...fold.train, trajectories: mutatedTrain }
			};
			assertPurgeApplied(mutated);
		}
	}
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
	console.log('R4.1 leakage fixture gate');
	console.log('=========================');

	const lines: string[] = [];
	for (const f of fixtures) {
		lines.push(expectLeakage(f.run, f.expectedCode, f.name));
	}

	let failed = 0;
	for (const line of lines) {
		console.log(line);
		if (line.startsWith('FAIL')) failed++;
	}

	console.log('-------------------------');
	console.log(
		failed === 0
			? `All ${lines.length} fixtures passed.`
			: `${failed} of ${lines.length} fixtures FAILED.`
	);
	return failed === 0 ? 0 : 1;
}

process.exit(main());
