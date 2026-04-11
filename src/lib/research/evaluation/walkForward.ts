/**
 * Walk-forward splitter.
 *
 * Takes a stream of resolved DecisionTrajectory rows sorted by `created_at`
 * and returns a sequence of (train, test) folds that respect the time axis
 * — no test fold ever contains a row created before the end of its
 * corresponding train fold.
 *
 * Pure function, no I/O, no randomness. Unit-testable by construction.
 *
 * Reference:
 *   docs/exec-plans/active/research-spine-2026-04-11.md §R4
 */

import type { DecisionTrajectory } from '../../contracts/index';
import type { TrajectorySlice, SliceId, WalkForwardFold, Regime } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WalkForwardConfig {
	/**
	 * Target size of each training slice. The first training slice starts
	 * at the earliest trajectory and grows until it reaches this count.
	 */
	readonly trainSize: number;

	/** Target size of each test slice. */
	readonly testSize: number;

	/**
	 * Step between successive folds in trajectory count. When equal to
	 * `testSize`, folds are non-overlapping. When smaller, folds slide by
	 * a partial test window (useful for smoothing noisy metrics).
	 */
	readonly step: number;

	/**
	 * `true` = anchored (train slice grows, always starts at trajectory 0).
	 * `false` = rolling (train slice is fixed-size, both ends advance).
	 *
	 * Anchored is the safer default for small data: each fold uses strictly
	 * more training data than the last.
	 */
	readonly anchored: boolean;
}

export const DEFAULT_WALK_FORWARD: WalkForwardConfig = {
	trainSize: 200,
	testSize: 50,
	step: 50,
	anchored: true
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function validateConfig(cfg: WalkForwardConfig): void {
	if (!Number.isInteger(cfg.trainSize) || cfg.trainSize <= 0) {
		throw new Error(`walkForward: trainSize must be a positive integer, got ${cfg.trainSize}`);
	}
	if (!Number.isInteger(cfg.testSize) || cfg.testSize <= 0) {
		throw new Error(`walkForward: testSize must be a positive integer, got ${cfg.testSize}`);
	}
	if (!Number.isInteger(cfg.step) || cfg.step <= 0) {
		throw new Error(`walkForward: step must be a positive integer, got ${cfg.step}`);
	}
}

function assertSortedByCreatedAt(trajectories: ReadonlyArray<DecisionTrajectory>): void {
	for (let i = 1; i < trajectories.length; i++) {
		const prev = trajectories[i - 1]!.created_at;
		const curr = trajectories[i]!.created_at;
		if (prev > curr) {
			throw new Error(
				`walkForward: trajectories must be sorted by created_at ascending ` +
					`(position ${i - 1}..${i}: ${prev} > ${curr})`
			);
		}
	}
}

function assertResolved(trajectories: ReadonlyArray<DecisionTrajectory>): void {
	for (const t of trajectories) {
		if (!t.outcome.resolved) {
			throw new Error(
				`walkForward: trajectory ${t.id} is unresolved — walk-forward eval ` +
					`requires resolved outcomes`
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Regime helper
// ---------------------------------------------------------------------------

function dominantRegime(slice: ReadonlyArray<DecisionTrajectory>): Regime | 'mixed' {
	if (slice.length === 0) return 'unknown';
	const counts: Record<Regime, number> = {
		trend: 0,
		range: 0,
		high_vol: 0,
		unknown: 0
	};
	for (const t of slice) {
		// DecisionTrajectory.regime uses the same enum plus 'unknown'
		const r = t.regime as Regime;
		if (r in counts) counts[r]++;
	}
	const total = slice.length;
	for (const [name, count] of Object.entries(counts)) {
		if (count / total >= 0.8) return name as Regime;
	}
	return 'mixed';
}

// ---------------------------------------------------------------------------
// Slice builder
// ---------------------------------------------------------------------------

function buildSlice(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	label: string,
	foldIndex: number
): TrajectorySlice {
	if (trajectories.length === 0) {
		throw new Error(`walkForward: cannot build empty slice for ${label}`);
	}
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
 * Produce a sequence of walk-forward folds from a sorted, resolved
 * trajectory stream.
 *
 * Contract:
 *   - Input must be sorted by `created_at` ascending.
 *   - Input rows must all have `outcome.resolved === true`.
 *   - Output folds are in order; each fold's test slice is strictly
 *     after its own train slice in time.
 *   - Empty output is possible if the input is too small for even one
 *     fold — callers should check `result.length > 0` before proceeding.
 */
export function walkForward(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	config: WalkForwardConfig = DEFAULT_WALK_FORWARD
): WalkForwardFold[] {
	validateConfig(config);
	assertSortedByCreatedAt(trajectories);
	assertResolved(trajectories);

	const n = trajectories.length;
	const folds: WalkForwardFold[] = [];
	let foldIndex = 0;
	let trainStart = 0;
	let trainEnd = config.trainSize; // exclusive

	while (trainEnd + config.testSize <= n) {
		const trainSlice = config.anchored
			? trajectories.slice(0, trainEnd)
			: trajectories.slice(trainStart, trainEnd);
		const testSlice = trajectories.slice(trainEnd, trainEnd + config.testSize);

		folds.push({
			foldIndex,
			train: buildSlice(trainSlice, 'train', foldIndex),
			test: buildSlice(testSlice, 'test', foldIndex)
		});

		foldIndex++;
		trainEnd += config.step;
		if (!config.anchored) trainStart += config.step;
	}

	return folds;
}

/**
 * Convenience: compute how many folds a given configuration would produce
 * from a trajectory stream of size `n`, without actually splitting.
 * Useful for budgeting experiments before running them.
 */
export function countFolds(n: number, config: WalkForwardConfig = DEFAULT_WALK_FORWARD): number {
	validateConfig(config);
	if (n < config.trainSize + config.testSize) return 0;
	const usable = n - config.trainSize - config.testSize;
	return 1 + Math.floor(usable / config.step);
}
