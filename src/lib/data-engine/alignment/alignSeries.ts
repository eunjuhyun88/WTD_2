// ═══════════════════════════════════════════════════════════════
// Data Engine — Series Alignment
// ═══════════════════════════════════════════════════════════════
//
// Align multiple NormalizedSeries to a common timestamp grid.
// Uses the union of all timestamps, forward-filling missing values.

import type { NormalizedSeries, NormalizedPoint } from '../types';

/**
 * Align multiple NormalizedSeries to a common timestamp grid.
 *
 * Builds the union of all timestamps across all series, then for each
 * series fills missing timestamps by forward-carrying the last known value.
 * Series with no prior value at a given timestamp remain null.
 *
 * @param seriesList - Array of series to align. Returned as-is if length <= 1.
 * @returns New array of series sharing the same timestamp grid.
 */
export function alignSeries(seriesList: NormalizedSeries[]): NormalizedSeries[] {
	if (seriesList.length <= 1) return seriesList;

	// Collect all unique timestamps across every series
	const tsSet = new Set<number>();
	for (const s of seriesList) {
		for (const p of s.points) tsSet.add(p.ts);
	}
	const timestamps = [...tsSet].sort((a, b) => a - b);

	return seriesList.map(series => {
		const valueMap = new Map<number, number | null>();
		for (const p of series.points) valueMap.set(p.ts, p.value);

		let lastValue: number | null = null;
		const aligned: NormalizedPoint[] = timestamps.map(ts => {
			if (valueMap.has(ts)) {
				lastValue = valueMap.get(ts)!;
				return { ts, value: lastValue };
			}
			// Forward-fill with last known value
			return { ts, value: lastValue };
		});

		return { ...series, points: aligned };
	});
}
