/**
 * `ExperimentSchedule` — R4.4 sample-size ladder primitives.
 *
 * §D4 row 9.1 of the research-spine design doc resolves the sample-size
 * ladder as "locked layer provides `GeometricSchedule`, `LinearSchedule`,
 * `EarlyStopSchedule` primitives; each experiment composes its own
 * schedule and records it in the report". This file implements that
 * contract: schedules are typed iterators of sample-size cells, and
 * every cell carries enough provenance (sequenceIndex, strategy label,
 * version tag, seed inherited from the experiment config) that a
 * downstream report table can reconstruct which schedule produced
 * which row.
 *
 * Intentional non-goals:
 *   - The schedule primitives do NOT evaluate stop conditions. The
 *     `EarlyStopSchedule` wrapper tags its cells with the stop-condition
 *     label and enforces a `maxCells` ceiling, but the semantic check
 *     ("CI excludes zero") happens in the experiment file at runtime.
 *     Encoding CI logic here would pull stats/comparison types into
 *     this slice and break the R4.4 boundary.
 *   - Schedules do NOT run experiments. They are pure iterators.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

export type ScheduleVersion = 'schedule-v1-2026-04-11';
export const SCHEDULE_VERSION: ScheduleVersion = 'schedule-v1-2026-04-11';

/**
 * One cell of a sample-size schedule. The `strategy` string encodes the
 * full composition (e.g. `'early-stop(geometric(50..10000x2)|ci-excludes-zero)'`)
 * so report rows can display their own provenance without cross-joining
 * to the config table.
 */
export interface ScheduleCell {
	readonly sequenceIndex: number;
	readonly sampleSize: number;
	readonly version: ScheduleVersion;
	readonly strategy: string;
	readonly seed: number;
}

export type ScheduleKind = 'geometric' | 'linear' | 'early-stop';

/**
 * A schedule is a deterministic, stateless iterator factory. `iterate()`
 * may be called any number of times — each call returns a fresh
 * iterable that produces the same sequence given the same seed.
 */
export interface ExperimentSchedule {
	readonly version: ScheduleVersion;
	readonly kind: ScheduleKind;
	readonly strategy: string;
	iterate(seed: number): Iterable<ScheduleCell>;
}

export class ScheduleConfigError extends Error {
	constructor(message: string) {
		super(`ScheduleConfigError: ${message}`);
		this.name = 'ScheduleConfigError';
	}
}

// ---------------------------------------------------------------------------
// GeometricSchedule — exponential ladder
// ---------------------------------------------------------------------------

export interface GeometricScheduleConfig {
	/** First sample size. Must be >= 1. */
	readonly from: number;
	/** Upper bound (inclusive). Cells with sample size > `to` are skipped. */
	readonly to: number;
	/** Multiplicative factor between consecutive cells. Must be > 1. */
	readonly factor: number;
}

/**
 * Exponential sample-size ladder: `from`, `from*factor`, `from*factor^2`,
 * ..., stopping at the first value that exceeds `to`. Values are rounded
 * to the nearest integer because sample sizes must be whole trajectories.
 *
 * Example: `{ from: 50, to: 10000, factor: 2 }` → 50, 100, 200, 400, …
 */
export function createGeometricSchedule(
	config: GeometricScheduleConfig
): ExperimentSchedule {
	if (!Number.isFinite(config.from) || config.from < 1) {
		throw new ScheduleConfigError(
			`GeometricSchedule: from must be a finite number >= 1, got ${config.from}`
		);
	}
	if (!Number.isFinite(config.to) || config.to < config.from) {
		throw new ScheduleConfigError(
			`GeometricSchedule: to must be a finite number >= from (${config.from}), got ${config.to}`
		);
	}
	if (!Number.isFinite(config.factor) || config.factor <= 1) {
		throw new ScheduleConfigError(
			`GeometricSchedule: factor must be a finite number > 1, got ${config.factor}`
		);
	}
	const strategy = `geometric(${config.from}..${config.to}x${config.factor})`;
	return {
		version: SCHEDULE_VERSION,
		kind: 'geometric',
		strategy,
		iterate: function* (seed: number): Iterable<ScheduleCell> {
			let n = config.from;
			let idx = 0;
			while (n <= config.to + 1e-9) {
				const sampleSize = Math.round(n);
				yield {
					sequenceIndex: idx,
					sampleSize,
					version: SCHEDULE_VERSION,
					strategy,
					seed
				};
				n *= config.factor;
				idx += 1;
			}
		}
	};
}

// ---------------------------------------------------------------------------
// LinearSchedule — arithmetic ladder
// ---------------------------------------------------------------------------

export interface LinearScheduleConfig {
	readonly from: number;
	readonly to: number;
	/** Additive step between consecutive cells. Must be > 0. */
	readonly step: number;
}

/**
 * Arithmetic sample-size ladder: `from`, `from + step`, `from + 2*step`,
 * ..., stopping at the first value that exceeds `to`.
 */
export function createLinearSchedule(
	config: LinearScheduleConfig
): ExperimentSchedule {
	if (!Number.isFinite(config.from) || config.from < 1) {
		throw new ScheduleConfigError(
			`LinearSchedule: from must be a finite number >= 1, got ${config.from}`
		);
	}
	if (!Number.isFinite(config.to) || config.to < config.from) {
		throw new ScheduleConfigError(
			`LinearSchedule: to must be a finite number >= from (${config.from}), got ${config.to}`
		);
	}
	if (!Number.isFinite(config.step) || config.step <= 0) {
		throw new ScheduleConfigError(
			`LinearSchedule: step must be a finite number > 0, got ${config.step}`
		);
	}
	const strategy = `linear(${config.from}..${config.to}+${config.step})`;
	return {
		version: SCHEDULE_VERSION,
		kind: 'linear',
		strategy,
		iterate: function* (seed: number): Iterable<ScheduleCell> {
			let n = config.from;
			let idx = 0;
			while (n <= config.to + 1e-9) {
				yield {
					sequenceIndex: idx,
					sampleSize: Math.round(n),
					version: SCHEDULE_VERSION,
					strategy,
					seed
				};
				n += config.step;
				idx += 1;
			}
		}
	};
}

// ---------------------------------------------------------------------------
// EarlyStopSchedule — wrapper that bounds any base schedule
// ---------------------------------------------------------------------------

/**
 * Stop-condition tag. The locked layer records this string in every cell's
 * `strategy` label but does NOT enforce the semantic check — the
 * experiment file at R4.5+ is responsible for calling `break` out of
 * the loop when its runtime judgment matches the tag.
 *
 * The `'max-cells-reached'` tag is enforced here because it can be
 * checked purely from the cell sequence index, without touching results.
 */
export type StopCondition =
	| 'ci-excludes-zero'
	| 'max-cells-reached'
	| 'utility-plateau';

export interface EarlyStopConfig {
	readonly stopCondition: StopCondition;
	/** Hard ceiling on number of cells yielded. Must be a positive integer. */
	readonly maxCells: number;
}

/**
 * Wrap any `ExperimentSchedule` with a cell-count ceiling and a
 * stop-condition label. The label is stamped into each yielded cell's
 * `strategy` string so downstream reports can show the composition
 * without the experiment file having to stitch provenance manually.
 */
export function createEarlyStopSchedule(
	base: ExperimentSchedule,
	config: EarlyStopConfig
): ExperimentSchedule {
	if (!Number.isInteger(config.maxCells) || config.maxCells <= 0) {
		throw new ScheduleConfigError(
			`EarlyStopSchedule: maxCells must be a positive integer, got ${config.maxCells}`
		);
	}
	const strategy = `early-stop(${base.strategy}|${config.stopCondition})`;
	return {
		version: SCHEDULE_VERSION,
		kind: 'early-stop',
		strategy,
		iterate: function* (seed: number): Iterable<ScheduleCell> {
			let emitted = 0;
			for (const cell of base.iterate(seed)) {
				if (emitted >= config.maxCells) return;
				yield {
					sequenceIndex: cell.sequenceIndex,
					sampleSize: cell.sampleSize,
					version: SCHEDULE_VERSION,
					strategy,
					seed: cell.seed
				};
				emitted += 1;
			}
		}
	};
}
