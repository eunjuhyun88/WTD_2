/**
 * Regime stratification splitter.
 *
 * Partitions a trajectory stream into per-regime buckets so every eval can
 * report overall + per-regime metrics. The partition is produced without
 * mutation — input is never reordered; each regime bucket references
 * trajectories in their original order.
 *
 * Pure, deterministic. Unit-testable.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type { DecisionTrajectory } from '../../contracts/index';
import type { TrajectorySlice, SliceId, Regime } from './types';

export interface RegimeStrata {
	readonly overall: TrajectorySlice;
	readonly trend: TrajectorySlice;
	readonly range: TrajectorySlice;
	readonly high_vol: TrajectorySlice;
	readonly unknown: TrajectorySlice;
}

function buildSlice(
	label: string,
	regime: Regime | 'mixed',
	trajectories: ReadonlyArray<DecisionTrajectory>,
	parentLabel: string
): TrajectorySlice {
	const id = `${parentLabel}-${label}` as SliceId;
	if (trajectories.length === 0) {
		// Empty slice — use a sentinel time range so downstream consumers
		// can distinguish "no data" from "broken data".
		return {
			id,
			label: `${parentLabel}/${label}`,
			startAt: '1970-01-01T00:00:00Z',
			endAt: '1970-01-01T00:00:00Z',
			regime,
			trajectories: []
		};
	}
	const first = trajectories[0]!;
	const last = trajectories[trajectories.length - 1]!;
	return {
		id,
		label: `${parentLabel}/${label}`,
		startAt: first.created_at,
		endAt: last.created_at,
		regime,
		trajectories
	};
}

/**
 * Split a trajectory stream into (overall, trend, range, high_vol, unknown)
 * slices. Input order is preserved within each bucket. The `overall` slice
 * is the full input; it's included so callers can request overall + per-regime
 * in one call.
 *
 * `parentLabel` is a prefix applied to every bucket's slice label so you can
 * trace the stratification back to its source (e.g. pass `"fold-03/test"`
 * to stratify the test slice of fold 3).
 */
export function stratifyByRegime(
	trajectories: ReadonlyArray<DecisionTrajectory>,
	parentLabel: string = 'all'
): RegimeStrata {
	const buckets: Record<Regime, DecisionTrajectory[]> = {
		trend: [],
		range: [],
		high_vol: [],
		unknown: []
	};

	for (const t of trajectories) {
		const r = t.regime as Regime;
		if (r in buckets) {
			buckets[r].push(t);
		} else {
			buckets.unknown.push(t);
		}
	}

	// Freeze each bucket so downstream callers cannot mutate through the
	// returned references.
	const freeze = (xs: DecisionTrajectory[]): ReadonlyArray<DecisionTrajectory> =>
		Object.freeze(xs.slice());

	return {
		overall: buildSlice('overall', 'mixed', trajectories, parentLabel),
		trend: buildSlice('trend', 'trend', freeze(buckets.trend), parentLabel),
		range: buildSlice('range', 'range', freeze(buckets.range), parentLabel),
		high_vol: buildSlice('high_vol', 'high_vol', freeze(buckets.high_vol), parentLabel),
		unknown: buildSlice('unknown', 'unknown', freeze(buckets.unknown), parentLabel)
	};
}

/**
 * Counts per regime. Useful for "do I have enough data in each regime to
 * run a meaningful per-regime comparison?" checks before kicking off a long
 * eval run.
 */
export function regimeCounts(
	trajectories: ReadonlyArray<DecisionTrajectory>
): Record<Regime, number> {
	const counts: Record<Regime, number> = {
		trend: 0,
		range: 0,
		high_vol: 0,
		unknown: 0
	};
	for (const t of trajectories) {
		const r = t.regime as Regime;
		if (r in counts) counts[r]++;
		else counts.unknown++;
	}
	return counts;
}
