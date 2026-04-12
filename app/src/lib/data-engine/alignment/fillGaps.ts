// ═══════════════════════════════════════════════════════════════
// Data Engine — Gap Filling
// ═══════════════════════════════════════════════════════════════
//
// Fill null gaps in a NormalizedSeries using various strategies.

import type { NormalizedSeries, NormalizedPoint, FillMode } from '../types';

/**
 * Fill null gaps in a NormalizedSeries.
 *
 * Modes:
 * - 'forward'     — carry the last known non-null value forward
 * - 'zero'        — replace nulls with 0
 * - 'interpolate' — linear interpolation between surrounding known values;
 *                   falls back to forward-fill at the trailing edge
 * - 'none'        — return the series unchanged
 *
 * @param series - Input series. Points array is not mutated.
 * @param mode   - Gap-filling strategy. Defaults to 'forward'.
 * @returns New series with gaps filled according to the chosen mode.
 */
export function fillGaps(series: NormalizedSeries, mode: FillMode = 'forward'): NormalizedSeries {
	if (mode === 'none') return series;

	const points = [...series.points];

	if (mode === 'forward') {
		let lastValue: number | null = null;
		for (let i = 0; i < points.length; i++) {
			if (points[i].value != null) {
				lastValue = points[i].value;
			} else if (lastValue != null) {
				points[i] = { ts: points[i].ts, value: lastValue };
			}
		}
	} else if (mode === 'zero') {
		for (let i = 0; i < points.length; i++) {
			if (points[i].value == null) {
				points[i] = { ts: points[i].ts, value: 0 };
			}
		}
	} else if (mode === 'interpolate') {
		for (let i = 0; i < points.length; i++) {
			if (points[i].value != null) continue;

			// Find the nearest non-null neighbours
			let prevIdx = -1;
			let nextIdx = -1;
			for (let j = i - 1; j >= 0; j--) {
				if (points[j].value != null) { prevIdx = j; break; }
			}
			for (let j = i + 1; j < points.length; j++) {
				if (points[j].value != null) { nextIdx = j; break; }
			}

			if (prevIdx >= 0 && nextIdx >= 0) {
				const prevVal = points[prevIdx].value!;
				const nextVal = points[nextIdx].value!;
				const ratio =
					(points[i].ts - points[prevIdx].ts) /
					(points[nextIdx].ts - points[prevIdx].ts);
				points[i] = { ts: points[i].ts, value: prevVal + (nextVal - prevVal) * ratio };
			} else if (prevIdx >= 0) {
				// Trailing edge: forward-fill
				points[i] = { ts: points[i].ts, value: points[prevIdx].value };
			}
			// Leading edge (no prevIdx) stays null
		}
	}

	return { ...series, points };
}
