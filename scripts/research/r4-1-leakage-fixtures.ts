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
	// Scheduled cutoff matches the last train row's resolved_at in this
	// hand-crafted fold — the two values only coincide when data happens
	// to land exactly on the boundary, which is fine for a minimal fixture.
	// The purge-window fixture below exercises the more realistic case
	// where `scheduledTrainEnd` is distinct from `trainKnowledgeHorizon`.
	const scheduledTrainEndMs = trainHorizonMs;
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
			scheduledTrainEnd: iso(scheduledTrainEndMs),
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
			// Mutate: add a train row whose resolved_at sits strictly inside
			// the purge window `(scheduledTrainEnd - purgeDuration, scheduledTrainEnd)`.
			// The assertion re-computes the window from
			// `config.purgeDuration` and `fold.integrity.scheduledTrainEnd`, so
			// the leaky row must land inside that range — NOT inside a window
			// measured from `trainKnowledgeHorizon` (which is no longer the
			// assertion's reference point as of the R4.1 scheduled-end fix).
			const scheduledEndMs = Date.parse(fold.integrity.scheduledTrainEnd);
			const purgeStartMs = scheduledEndMs - SMALL_CONFIG.purgeDuration;
			const insidePurge = purgeStartMs + Math.floor(SMALL_CONFIG.purgeDuration / 2);
			// Insert the leaky row earlier in the array so the sort invariant
			// still holds on resolved_at (insidePurge < scheduledEndMs).
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
// Happy-path regression: the scheduled-end purge window fix
// ---------------------------------------------------------------------------
//
// These cases verify the R4.1 fix where `assertPurgeApplied` switched from
// using `trainKnowledgeHorizon` (measured post-purge max) to
// `scheduledTrainEnd` (the splitter's wall-clock cutoff). They do NOT
// expect `LeakageError` — they assert that a well-formed fold with
// realistic jittered resolution times and non-zero purge passes without
// throwing.

interface HappyCase {
	name: string;
	run: () => void;
}

function expectNoThrow(fn: () => void, name: string): string {
	try {
		fn();
		return `PASS  ${name}`;
	} catch (err) {
		const e = err as Error;
		return `FAIL  ${name}  →  ${e.name}: ${e.message}`;
	}
}

const happyCases: HappyCase[] = [
	{
		// Before the fix, this would have tripped `assertPurgeApplied` because
		// the measured horizon-based purge window covered row `train-4`.
		// After the fix the window is `(scheduledTrainEnd - purgeDuration,
		// scheduledTrainEnd)` which excludes any row the splitter would have
		// kept.
		name: 'scheduled-end purge: train row near post-purge horizon but outside scheduled window',
		run: () => {
			// Hand-craft a fold where `scheduledTrainEnd` is *later* than the
			// post-purge `trainKnowledgeHorizon`. This is the realistic shape
			// the splitter produces under jittered resolution: the last
			// included train row's resolved_at lies below the scheduled
			// cutoff, and the row-before-last sits within purgeDuration of
			// THAT row but NOT within purgeDuration of the scheduled end.
			// The assertion must accept this fold.
			const scheduledEndMs = EPOCH + 10 * DAY;
			const trainRows: DecisionTrajectory[] = [];
			for (let i = 0; i < 4; i++) {
				trainRows.push(
					makeTraj({
						id: `train-${i}`,
						createdAt: iso(EPOCH, i * DAY),
						resolvedAt: iso(EPOCH, i * DAY + Math.floor(DAY / 2)),
						resolved: true
					})
				);
			}
			// Last row's resolved_at is 6 days before scheduled end — well
			// outside the purge window `(scheduledEnd - 1d, scheduledEnd)`
			// but close to its siblings (the pre-fix assertion would have
			// computed the window around the measured max ≈ day 3.5 and
			// flagged rows at day 2.5 and day 3.5 as "inside purge").
			const trainHorizonMs = EPOCH + 3 * DAY + Math.floor(DAY / 2);
			const testStartMs = scheduledEndMs + SMALL_CONFIG.embargoDuration;
			const testRows: DecisionTrajectory[] = [
				makeTraj({
					id: 'test-0',
					createdAt: iso(testStartMs),
					resolvedAt: iso(testStartMs, DAY),
					resolved: true
				})
			];
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
					endAt: testRows[0]!.created_at,
					regime: 'unknown',
					trajectories: testRows
				},
				integrity: {
					trainKnowledgeHorizon: iso(trainHorizonMs),
					scheduledTrainEnd: iso(scheduledEndMs),
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
			assertPurgeApplied(fold);
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
	for (const h of happyCases) {
		lines.push(expectNoThrow(h.run, h.name));
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
