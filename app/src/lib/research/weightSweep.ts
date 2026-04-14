/**
 * `WeightSweepStrategy` — R4.4 reward-factorial primitives.
 *
 * §D4 row 9.4 of the research-spine design doc resolves the reward
 * factorial layout as "locked layer provides `FullFactorialSweep`,
 * `LatinHypercubeSweep(n)`, `EscalatingSweep(phase1, phase2IfUnstable)`;
 * experiment files compose their sweep; locked layer enforces 'every
 * reported cell carries the weights used' and 'cells with unstable
 * winning-baseline trigger Phase 2 automatically'".
 *
 * This file implements the iterator primitives. The "every cell carries
 * the weights used" invariant is met by the cell shape itself — each
 * yielded `WeightSweepCell` copies its `UtilityWeights` inline, so the
 * experiment report table can reference them without going back to
 * the sweep config.
 *
 * The "Phase 2 triggered automatically" policy is exposed via
 * `EscalatingSweep.iteratePhase2(seed)`. The locked layer does NOT
 * decide stability — the experiment file runs `iterate(seed)` (phase
 * 1), judges stability with its own CI logic, then runs
 * `iteratePhase2(seed)` only if its judgment says so. Embedding
 * stability judgment here would pull stats/CI types into this slice
 * and break the R4.4 boundary.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { UtilityWeights } from './evaluation/types.ts';
import { mulberry32 } from './stats.ts';

export type WeightSweepVersion = 'weight-sweep-v1-2026-04-11';
export const WEIGHT_SWEEP_VERSION: WeightSweepVersion = 'weight-sweep-v1-2026-04-11';

export type WeightSweepKind = 'full-factorial' | 'latin-hypercube' | 'escalating';

/**
 * One cell of a weight sweep. `weights` is copied into each cell so
 * report tables never have to cross-reference a "config id" when
 * printing rows — provenance is self-contained per cell.
 */
export interface WeightSweepCell {
	readonly sequenceIndex: number;
	readonly weights: UtilityWeights;
	readonly version: WeightSweepVersion;
	readonly strategy: string;
	readonly seed: number;
}

export interface WeightSweepStrategy {
	readonly version: WeightSweepVersion;
	readonly kind: WeightSweepKind;
	readonly strategy: string;
	iterate(seed: number): Iterable<WeightSweepCell>;
}

export class WeightSweepConfigError extends Error {
	constructor(message: string) {
		super(`WeightSweepConfigError: ${message}`);
		this.name = 'WeightSweepConfigError';
	}
}

// Dimension list. The order is fixed so deterministic iterators
// (full-factorial, latin hypercube) produce stable sequences across
// runs on the same seed.
const WEIGHT_DIMENSIONS = [
	'pnl',
	'drawdown',
	'violation',
	'directionHit',
	'slippage'
] as const;

type WeightDimension = (typeof WEIGHT_DIMENSIONS)[number];

// ---------------------------------------------------------------------------
// FullFactorialSweep — cartesian product over discrete grids
// ---------------------------------------------------------------------------

export interface FullFactorialGrid {
	readonly pnl: ReadonlyArray<number>;
	readonly drawdown: ReadonlyArray<number>;
	readonly violation: ReadonlyArray<number>;
	readonly directionHit: ReadonlyArray<number>;
	readonly slippage: ReadonlyArray<number>;
}

/**
 * Cartesian product of the five per-weight grids. The cell sequence is
 * lexicographic over `(pnl, drawdown, violation, directionHit, slippage)`
 * so two full-factorial runs with the same grid produce identical
 * orderings.
 */
export function createFullFactorialSweep(
	grid: FullFactorialGrid
): WeightSweepStrategy {
	validateGrid(grid);
	const sizes: Record<WeightDimension, number> = {
		pnl: grid.pnl.length,
		drawdown: grid.drawdown.length,
		violation: grid.violation.length,
		directionHit: grid.directionHit.length,
		slippage: grid.slippage.length
	};
	const total =
		sizes.pnl * sizes.drawdown * sizes.violation * sizes.directionHit * sizes.slippage;
	const strategy = `full-factorial(${sizes.pnl}x${sizes.drawdown}x${sizes.violation}x${sizes.directionHit}x${sizes.slippage}=${total})`;
	return {
		version: WEIGHT_SWEEP_VERSION,
		kind: 'full-factorial',
		strategy,
		iterate: function* (seed: number): Iterable<WeightSweepCell> {
			let idx = 0;
			for (const pnl of grid.pnl) {
				for (const drawdown of grid.drawdown) {
					for (const violation of grid.violation) {
						for (const directionHit of grid.directionHit) {
							for (const slippage of grid.slippage) {
								yield {
									sequenceIndex: idx,
									weights: { pnl, drawdown, violation, directionHit, slippage },
									version: WEIGHT_SWEEP_VERSION,
									strategy,
									seed
								};
								idx += 1;
							}
						}
					}
				}
			}
		}
	};
}

function validateGrid(grid: FullFactorialGrid): void {
	for (const dim of WEIGHT_DIMENSIONS) {
		const arr = grid[dim];
		if (!Array.isArray(arr) || arr.length === 0) {
			throw new WeightSweepConfigError(
				`FullFactorialSweep: grid.${dim} must be a non-empty array`
			);
		}
		for (const v of arr) {
			if (typeof v !== 'number' || !Number.isFinite(v)) {
				throw new WeightSweepConfigError(
					`FullFactorialSweep: grid.${dim} contains non-finite value: ${String(v)}`
				);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// LatinHypercubeSweep — n space-filling samples from continuous ranges
// ---------------------------------------------------------------------------

export interface LatinHypercubeRanges {
	readonly pnl: readonly [number, number];
	readonly drawdown: readonly [number, number];
	readonly violation: readonly [number, number];
	readonly directionHit: readonly [number, number];
	readonly slippage: readonly [number, number];
}

/**
 * Latin hypercube sampling. Each dimension is divided into `sampleCount`
 * equal strata; one jittered value is drawn per stratum; the strata
 * are then permuted independently per dimension so every row samples
 * each stratum of each dimension exactly once. Randomness is sourced
 * from `mulberry32(seed ^ 0x…)` so two runs on the same seed produce
 * identical cell sequences.
 */
export function createLatinHypercubeSweep(
	ranges: LatinHypercubeRanges,
	sampleCount: number
): WeightSweepStrategy {
	if (!Number.isInteger(sampleCount) || sampleCount < 1) {
		throw new WeightSweepConfigError(
			`LatinHypercubeSweep: sampleCount must be a positive integer, got ${sampleCount}`
		);
	}
	validateRanges(ranges);
	const strategy = `latin-hypercube(n=${sampleCount})`;
	return {
		version: WEIGHT_SWEEP_VERSION,
		kind: 'latin-hypercube',
		strategy,
		iterate: function* (seed: number): Iterable<WeightSweepCell> {
			// Derive a dedicated RNG from the experiment seed so other
			// seed consumers (e.g. the pipeline's per-trajectory seeding)
			// don't observe the same sequence.
			const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

			// Build one permuted stratum sequence per dimension.
			const perDim: Record<WeightDimension, number[]> = {
				pnl: buildPermutedStrata(sampleCount, rng),
				drawdown: buildPermutedStrata(sampleCount, rng),
				violation: buildPermutedStrata(sampleCount, rng),
				directionHit: buildPermutedStrata(sampleCount, rng),
				slippage: buildPermutedStrata(sampleCount, rng)
			};

			for (let i = 0; i < sampleCount; i++) {
				const weights: UtilityWeights = {
					pnl: interp(ranges.pnl, perDim.pnl[i]!),
					drawdown: interp(ranges.drawdown, perDim.drawdown[i]!),
					violation: interp(ranges.violation, perDim.violation[i]!),
					directionHit: interp(ranges.directionHit, perDim.directionHit[i]!),
					slippage: interp(ranges.slippage, perDim.slippage[i]!)
				};
				yield {
					sequenceIndex: i,
					weights,
					version: WEIGHT_SWEEP_VERSION,
					strategy,
					seed
				};
			}
		}
	};
}

function validateRanges(ranges: LatinHypercubeRanges): void {
	for (const dim of WEIGHT_DIMENSIONS) {
		const r = ranges[dim];
		if (!Array.isArray(r) || r.length !== 2) {
			throw new WeightSweepConfigError(
				`LatinHypercubeSweep: ranges.${dim} must be a [low, high] tuple`
			);
		}
		const [lo, hi] = r;
		if (typeof lo !== 'number' || !Number.isFinite(lo)) {
			throw new WeightSweepConfigError(
				`LatinHypercubeSweep: ranges.${dim}[0] must be a finite number, got ${String(lo)}`
			);
		}
		if (typeof hi !== 'number' || !Number.isFinite(hi)) {
			throw new WeightSweepConfigError(
				`LatinHypercubeSweep: ranges.${dim}[1] must be a finite number, got ${String(hi)}`
			);
		}
		if (hi < lo) {
			throw new WeightSweepConfigError(
				`LatinHypercubeSweep: ranges.${dim} must satisfy hi >= lo, got [${lo}, ${hi}]`
			);
		}
	}
}

/** Build `n` jittered stratum midpoints in `[0, 1)` and Fisher-Yates shuffle them. */
function buildPermutedStrata(n: number, rng: () => number): number[] {
	const values: number[] = new Array(n);
	for (let i = 0; i < n; i++) {
		values[i] = (i + rng()) / n;
	}
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = values[i]!;
		values[i] = values[j]!;
		values[j] = tmp;
	}
	return values;
}

function interp(range: readonly [number, number], u: number): number {
	const [lo, hi] = range;
	return lo + u * (hi - lo);
}

// ---------------------------------------------------------------------------
// EscalatingSweep — phase 1 always, phase 2 only when called explicitly
// ---------------------------------------------------------------------------

/**
 * A composition of two sweeps. `iterate(seed)` yields phase-1 cells
 * (re-tagged with the escalation's strategy string so provenance is
 * preserved). `iteratePhase2(seed)` is a separate method that the
 * experiment file invokes only when its own stability judgment says
 * phase 1 was unstable.
 *
 * The reason Phase 2 is NOT automatic: stability is a statistical
 * claim about CI widths / winning-baseline coherence, and the locked
 * layer in R4.4 deliberately knows nothing about stats. Pushing that
 * judgment into the experiment file keeps the slice boundary clean
 * and lets R3 sensitivity runs swap in alternative stability tests
 * without re-releasing the research library.
 */
export interface EscalatingSweep extends WeightSweepStrategy {
	readonly kind: 'escalating';
	readonly phase1: WeightSweepStrategy;
	readonly phase2IfUnstable: WeightSweepStrategy;
	iteratePhase2(seed: number): Iterable<WeightSweepCell>;
}

export function createEscalatingSweep(
	phase1: WeightSweepStrategy,
	phase2IfUnstable: WeightSweepStrategy
): EscalatingSweep {
	const strategy = `escalating(${phase1.strategy} -> ${phase2IfUnstable.strategy})`;
	return {
		version: WEIGHT_SWEEP_VERSION,
		kind: 'escalating',
		strategy,
		phase1,
		phase2IfUnstable,
		iterate: function* (seed: number): Iterable<WeightSweepCell> {
			for (const cell of phase1.iterate(seed)) {
				yield {
					sequenceIndex: cell.sequenceIndex,
					weights: cell.weights,
					version: WEIGHT_SWEEP_VERSION,
					strategy: `${strategy}#phase1:${cell.strategy}`,
					seed: cell.seed
				};
			}
		},
		iteratePhase2: function* (seed: number): Iterable<WeightSweepCell> {
			for (const cell of phase2IfUnstable.iterate(seed)) {
				yield {
					sequenceIndex: cell.sequenceIndex,
					weights: cell.weights,
					version: WEIGHT_SWEEP_VERSION,
					strategy: `${strategy}#phase2:${cell.strategy}`,
					seed: cell.seed
				};
			}
		}
	};
}
