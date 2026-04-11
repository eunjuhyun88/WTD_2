/**
 * Leakage-safe temporal splitter.
 *
 * Replaces the legacy index-count-based `walkForward.ts`. Key differences:
 *
 *   (1) Splits on **wall-clock time**, not row count. A "7-day test window"
 *       has the same meaning regardless of whether 20 or 2000 trajectories
 *       happened inside it.
 *
 *   (2) Uses the trajectory's **knowledge horizon** (`outcome.resolved_at`)
 *       for the train cutoff, not `created_at`. The legacy splitter uses
 *       created_at and silently allows slowly-resolving trajectories to
 *       carry labels into train folds that could not have been known at
 *       cutoff.
 *
 *   (3) Applies **purge** and **embargo** steps. Purge drops train rows
 *       whose labels were still resolving at cutoff. Embargo enforces a
 *       gap between train horizon and test start so feature lookback
 *       windows cannot bridge the boundary.
 *
 *   (4) Stamps every fold with an **integrity record** carrying the
 *       assertions that were run, the effective config, and the measured
 *       train/test boundaries. Downstream stages re-verify via
 *       `assertTemporalIntegrity(fold)` — the record itself is a proof,
 *       not a promise.
 *
 * This file owns the config shape, the fold shape, and the splitter
 * function. The assertion suite lives in `assertIntegrity.ts` so consumers
 * that only need to *verify* a fold can import the suite without pulling
 * in the splitter implementation.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §D1 / §D2 / §R4.1
 */

import type { DecisionTrajectory } from '../../contracts/index.ts';
import type { TrajectorySlice, SliceId, Regime } from './types.ts';
import {
	LeakageError,
	assertConfigWithinBounds,
	assertResolvedOutcomesOnly,
	assertSortedByKnowledgeHorizon,
	assertTrainHorizonStrictlyBeforeTestStart,
	assertEmbargoSatisfied,
	assertPurgeApplied,
	assertTemporalIntegrity
} from './assertIntegrity.ts';

// ---------------------------------------------------------------------------
// Assertion code catalog
// ---------------------------------------------------------------------------

/**
 * The complete set of runtime integrity assertions a splitter can run.
 * Named so that (a) consumers can branch on a `LeakageError.code`,
 * (b) `TemporalFold.integrity.assertionsRan` can be audited for
 * completeness, and (c) adding a new assertion is a typed, discoverable
 * change instead of an opaque string.
 */
export type IntegrityAssertion =
	| 'sorted_by_knowledge_horizon'
	| 'resolved_outcomes_only'
	| 'train_horizon_strictly_before_test_start'
	| 'embargo_satisfied'
	| 'purge_applied'
	| 'config_within_bounds';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Wall-clock configuration for the temporal splitter. All durations are
 * in milliseconds so config composition is plain arithmetic.
 *
 * The *contract* (purge + embargo + wall-clock duration + expansion policy)
 * is frozen by R4.1. The *default values* are researcher-proposed and
 * must be recalibrated against the first month of real trajectory data.
 * Changing a default is a locked-layer PR, not a per-experiment choice.
 */
export interface TemporalSplitConfig {
	/** How the train window grows across folds. */
	readonly expansion: 'anchored' | 'rolling' | 'rolling-with-memory';

	/** Per-fold test duration in wall-clock ms. Not an integer count. */
	readonly testDuration: number;

	/** Minimum wall-clock train duration for the first fold. */
	readonly trainDurationFloor: number;

	/**
	 * Purge length (ms). Any trajectory whose `outcome.resolved_at` lands
	 * inside `(trainEnd - purgeDuration, trainEnd)` is dropped from train —
	 * at `trainEnd` its label was still being computed, so including it
	 * would leak partial future information.
	 */
	readonly purgeDuration: number;

	/**
	 * Embargo (ms). Gap between `trainEnd` and the earliest allowed
	 * `testStart`. Protects against feature lookback windows reaching
	 * from the test edge back into train.
	 */
	readonly embargoDuration: number;

	/** Cap on folds per experiment. Bounds runtime on long sweeps. */
	readonly maxFolds: number;
}

export const DEFAULT_TEMPORAL_SPLIT: TemporalSplitConfig = {
	expansion: 'anchored',
	testDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
	trainDurationFloor: 30 * 24 * 60 * 60 * 1000, // 30 days
	purgeDuration: 24 * 60 * 60 * 1000, // 1 day
	embargoDuration: 24 * 60 * 60 * 1000, // 1 day
	maxFolds: 6
};

// ---------------------------------------------------------------------------
// Fold + integrity shapes
// ---------------------------------------------------------------------------

export interface TemporalFoldIntegrity {
	/** Latest `outcome.resolved_at` in train after purge. */
	readonly trainKnowledgeHorizon: string;

	/**
	 * The fold's **scheduled** train cutoff — the wall-clock time boundary the
	 * splitter used when deciding which rows belong in train and which are
	 * purged. This is the reference the purge window is measured against:
	 * `(scheduledTrainEnd − purgeDuration, scheduledTrainEnd)` is the range
	 * in which a train row's `resolved_at` is treated as "still resolving at
	 * the fold cutoff" and therefore must be dropped.
	 *
	 * This is DISTINCT from `trainKnowledgeHorizon`, which is the maximum
	 * observed `resolved_at` in the post-purge train slice. The two values
	 * agree only when the data happens to have a row whose resolved_at sits
	 * exactly at the scheduled cutoff; under realistic jittered resolution
	 * times they diverge, and `assertPurgeApplied` must use this field
	 * rather than `trainKnowledgeHorizon` so the purge check stays
	 * consistent with the splitter's own purge step.
	 */
	readonly scheduledTrainEnd: string;

	/** Earliest `created_at` in test. */
	readonly testStart: string;

	/**
	 * `Date.parse(testStart) - Date.parse(trainKnowledgeHorizon)` — must be
	 * ≥ config.embargoDuration and verified by the assertion suite.
	 */
	readonly embargoGap: number;

	/** Trajectories dropped from train by the purge step. */
	readonly purgedCount: number;

	/** Config actually used for this fold — may include experiment overrides. */
	readonly config: TemporalSplitConfig;

	/** Assertions that were run at split time. Audited for completeness. */
	readonly assertionsRan: ReadonlyArray<IntegrityAssertion>;

	/** When the integrity record was stamped. */
	readonly assertedAt: string;
}

export interface TemporalFold {
	readonly foldIndex: number;
	readonly train: TrajectorySlice;
	readonly test: TrajectorySlice;
	readonly integrity: TemporalFoldIntegrity;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMs(iso: string): number {
	const n = Date.parse(iso);
	if (!Number.isFinite(n)) {
		throw new LeakageError(
			'resolved_outcomes_only',
			`unparseable ISO timestamp: ${JSON.stringify(iso)}`
		);
	}
	return n;
}

function dominantRegime(
	trajectories: ReadonlyArray<DecisionTrajectory>
): Regime | 'mixed' {
	if (trajectories.length === 0) return 'unknown';
	const counts: Record<Regime, number> = {
		trend: 0,
		range: 0,
		high_vol: 0,
		unknown: 0
	};
	for (const t of trajectories) {
		const r = t.regime as Regime;
		if (r in counts) counts[r]++;
	}
	const total = trajectories.length;
	for (const [name, count] of Object.entries(counts)) {
		if (count / total >= 0.8) return name as Regime;
	}
	return 'mixed';
}

function buildSlice(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	label: string,
	foldIndex: number,
	role: 'train' | 'test'
): TrajectorySlice {
	if (trajectories.length === 0) {
		// Splitter guarantees this never fires — the fold loop only builds
		// a fold when both slices have at least one row. If it does fire,
		// surface the failure immediately rather than propagating empty
		// slices into the assertion suite.
		throw new LeakageError(
			'train_horizon_strictly_before_test_start',
			`cannot build empty ${role} slice for fold ${foldIndex}`
		);
	}
	void role;
	const first = trajectories[0]!;
	const last = trajectories[trajectories.length - 1]!;
	const id = `fold-${String(foldIndex).padStart(3, '0')}-${label}` as SliceId;
	return {
		id,
		label: `fold-${foldIndex}/${label}`,
		startAt: first.created_at,
		endAt: last.created_at,
		regime: dominantRegime(trajectories),
		trajectories
	};
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Produce a sequence of leakage-checked temporal folds from a resolved
 * trajectory stream.
 *
 * Contract:
 *   - Every input trajectory must have `outcome.resolved === true` and a
 *     non-null `outcome.resolved_at`. Unresolved rows throw before split.
 *   - Input order does not matter — the splitter sorts internally by the
 *     correct axis for each slice (knowledge horizon for train,
 *     creation time for test).
 *   - Every output fold is immediately verified via
 *     `assertTemporalIntegrity`. A fold that fails any invariant throws
 *     `LeakageError` before being returned.
 *   - Empty output is possible when the data window is too short for
 *     even one train + embargo + test. Callers must check
 *     `result.length > 0` before proceeding.
 */
export function temporalSplit(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	config: TemporalSplitConfig = DEFAULT_TEMPORAL_SPLIT
): TemporalFold[] {
	assertConfigWithinBounds(config);

	if (trajectories.length === 0) return [];

	// Reject unresolved rows before anything else so the error code is
	// categorical and the failure is cheap.
	assertResolvedOutcomesOnly(trajectories, 'input');

	// Full-stream sort by resolved_at (knowledge horizon). Test slicing
	// will re-sort by created_at per fold, but the primary temporal
	// ordering we reason about is label availability.
	const byHorizon = [...trajectories].sort((a, b) => {
		const ra = toMs(a.outcome.resolved_at!);
		const rb = toMs(b.outcome.resolved_at!);
		if (ra !== rb) return ra - rb;
		// Tiebreak by created_at so the ordering is total and deterministic.
		return toMs(a.created_at) - toMs(b.created_at);
	});

	const firstHorizon = toMs(byHorizon[0]!.outcome.resolved_at!);
	const lastCreated = byHorizon.reduce(
		(m, t) => Math.max(m, toMs(t.created_at)),
		Number.NEGATIVE_INFINITY
	);

	// Cheap degenerate check: if the first fold's test window starts after
	// every existing trajectory, there is no way to populate any test
	// slice — return empty. This is strictly weaker than "full window
	// fits in data"; the main fold loop still rejects partial/empty folds
	// by iterating and skipping them, so windows that only *partially*
	// overlap remaining data are given a chance to build a fold with
	// whatever trajectories exist in the window.
	const firstTestStart =
		firstHorizon + config.trainDurationFloor + config.embargoDuration;
	if (firstTestStart > lastCreated) return [];

	const folds: TemporalFold[] = [];
	let foldIndex = 0;
	let trainStart = firstHorizon; // inclusive
	let trainEnd = firstHorizon + config.trainDurationFloor; // exclusive

	while (foldIndex < config.maxFolds) {
		const purgeStart = trainEnd - config.purgeDuration;
		const testStart = trainEnd + config.embargoDuration;
		const testEnd = testStart + config.testDuration;

		// Train window — rows whose RESOLVED_AT lies in the window and NOT
		// inside the purge zone (purgeStart, trainEnd).
		const trainRows: DecisionTrajectory[] = [];
		let purgedCount = 0;
		for (const t of byHorizon) {
			const r = toMs(t.outcome.resolved_at!);
			if (r < trainStart) continue;
			if (r >= trainEnd) break; // byHorizon is sorted ascending
			if (config.purgeDuration > 0 && r > purgeStart && r < trainEnd) {
				purgedCount++;
				continue;
			}
			trainRows.push(t);
		}

		// Test window — rows whose CREATED_AT lies in [testStart, testEnd).
		const testRows: DecisionTrajectory[] = [];
		for (const t of byHorizon) {
			const c = toMs(t.created_at);
			if (c < testStart) continue;
			if (c >= testEnd) continue;
			testRows.push(t);
		}

		// If either slice is empty, advance the window and try again
		// until we either fit a fold or run out of data. Empty slices
		// are never returned.
		if (trainRows.length === 0 || testRows.length === 0) {
			// Advance one test-duration step forward by default. For
			// rolling expansion the train start also advances.
			const step = config.testDuration;
			trainEnd += step;
			if (config.expansion !== 'anchored') trainStart += step;
			// Termination: if the window now reaches past last data, stop.
			if (trainEnd + config.embargoDuration > lastCreated) break;
			continue;
		}

		// Sort test rows by created_at (their required axis) so the
		// assertion suite does not reject on ordering.
		testRows.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));

		const train = buildSlice(trainRows, 'train', foldIndex, 'train');
		const test = buildSlice(testRows, 'test', foldIndex, 'test');

		// Compute the measured train knowledge horizon AFTER purge.
		let trainHorizonMs = Number.NEGATIVE_INFINITY;
		for (const t of trainRows) {
			const r = toMs(t.outcome.resolved_at!);
			if (r > trainHorizonMs) trainHorizonMs = r;
		}
		let testStartMs = Number.POSITIVE_INFINITY;
		for (const t of testRows) {
			const c = toMs(t.created_at);
			if (c < testStartMs) testStartMs = c;
		}
		const embargoGap = testStartMs - trainHorizonMs;

		const integrity: TemporalFoldIntegrity = {
			trainKnowledgeHorizon: new Date(trainHorizonMs).toISOString(),
			scheduledTrainEnd: new Date(trainEnd).toISOString(),
			testStart: new Date(testStartMs).toISOString(),
			embargoGap,
			purgedCount,
			config,
			assertionsRan: [
				'config_within_bounds',
				'resolved_outcomes_only',
				'sorted_by_knowledge_horizon',
				'train_horizon_strictly_before_test_start',
				'embargo_satisfied',
				'purge_applied'
			] as const,
			assertedAt: new Date().toISOString()
		};

		const fold: TemporalFold = { foldIndex, train, test, integrity };

		// Per-fold assertions (slice sort + horizon vs test start + embargo + purge)
		// run here. A failure throws `LeakageError`; the splitter does not
		// swallow it. Downstream consumers re-run the same suite via
		// `assertTemporalIntegrity` as their first line, so the guarantee
		// survives even if the splitter is replaced later.
		assertSortedByKnowledgeHorizon(train.trajectories, 'resolved_at', `fold ${foldIndex} train`);
		assertSortedByKnowledgeHorizon(test.trajectories, 'created_at', `fold ${foldIndex} test`);
		assertTrainHorizonStrictlyBeforeTestStart(fold);
		assertEmbargoSatisfied(fold);
		assertPurgeApplied(fold);
		// Finally the aggregate — catches provenance completeness and
		// re-runs config + slice checks under the same code paths consumers
		// will use. The cost is negligible and the early rejection gives
		// us a single stable error surface.
		assertTemporalIntegrity(fold);

		folds.push(fold);
		foldIndex++;

		// Advance window for next fold.
		const step = config.testDuration;
		trainEnd += step;
		if (config.expansion !== 'anchored') trainStart += step;
		if (trainEnd + config.embargoDuration > lastCreated) break;
	}

	return folds;
}

/**
 * Convenience: report whether a given configuration could in principle
 * produce any folds from a trajectory stream, without actually splitting.
 * Useful for budgeting experiments before running them.
 */
export function canProduceAnyFold(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	config: TemporalSplitConfig = DEFAULT_TEMPORAL_SPLIT
): boolean {
	assertConfigWithinBounds(config);
	if (trajectories.length === 0) return false;
	let earliestHorizon = Number.POSITIVE_INFINITY;
	let latestCreated = Number.NEGATIVE_INFINITY;
	for (const t of trajectories) {
		if (!t.outcome.resolved || t.outcome.resolved_at === null) return false;
		const r = Date.parse(t.outcome.resolved_at);
		const c = Date.parse(t.created_at);
		if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
		if (r < earliestHorizon) earliestHorizon = r;
		if (c > latestCreated) latestCreated = c;
	}
	const firstFoldEnd =
		earliestHorizon + config.trainDurationFloor + config.embargoDuration + config.testDuration;
	return firstFoldEnd <= latestCreated;
}

// Re-export assertion machinery so a single import from
// `./temporalSplit` covers the full splitter surface.
export {
	LeakageError,
	assertConfigWithinBounds,
	assertResolvedOutcomesOnly,
	assertSortedByKnowledgeHorizon,
	assertTrainHorizonStrictlyBeforeTestStart,
	assertEmbargoSatisfied,
	assertPurgeApplied,
	assertTemporalIntegrity
} from './assertIntegrity.ts';
