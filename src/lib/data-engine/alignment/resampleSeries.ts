// ═══════════════════════════════════════════════════════════════
// Data Engine — Series Resampling
// ═══════════════════════════════════════════════════════════════
//
// Resample a NormalizedSeries to a larger timeframe bucket.
// Useful for converting e.g. 5m candles into 1h candles.

import type { NormalizedSeries, NormalizedPoint, ResampleMode } from '../types';

/**
 * Resample a NormalizedSeries to a larger timeframe bucket.
 *
 * Points are grouped into fixed-width time buckets of `bucketSeconds` size.
 * Null values are ignored when computing aggregates. If a bucket has no
 * non-null values it is omitted from the result.
 *
 * @param series - Input series to resample.
 * @param bucketSeconds - Target bucket width in seconds (e.g., 3600 for 1h).
 * @param mode - Aggregation mode: 'last' | 'mean' | 'sum' | 'max' | 'min'. Defaults to 'last'.
 * @returns New series with one point per bucket, keyed to the bucket's floor timestamp.
 */
export function resampleSeries(
	series: NormalizedSeries,
	bucketSeconds: number,
	mode: ResampleMode = 'last',
): NormalizedSeries {
	if (bucketSeconds <= 0 || series.points.length === 0) return series;

	const buckets = new Map<number, number[]>();

	for (const p of series.points) {
		if (p.value == null) continue;
		const bucket = Math.floor(p.ts / bucketSeconds) * bucketSeconds;
		const arr = buckets.get(bucket) ?? [];
		arr.push(p.value);
		buckets.set(bucket, arr);
	}

	const points: NormalizedPoint[] = [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([ts, values]) => ({
			ts,
			value: aggregate(values, mode),
		}));

	return { ...series, points };
}

function aggregate(values: number[], mode: ResampleMode): number {
	if (values.length === 0) return 0;
	switch (mode) {
		case 'last':  return values[values.length - 1];
		case 'mean':  return values.reduce((a, b) => a + b, 0) / values.length;
		case 'sum':   return values.reduce((a, b) => a + b, 0);
		case 'max':   return Math.max(...values);
		case 'min':   return Math.min(...values);
	}
}
