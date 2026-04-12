// ═══════════════════════════════════════════════════════════════
// Metric Engine — Factor Adapter
// ═══════════════════════════════════════════════════════════════
//
// Bridges MetricResult output to a FactorResult-compatible shape.
// Use this when factorEngine needs to consume metric-engine output.

import type { MetricResult } from '../types';

/**
 * Convert a MetricResult to a FactorResult-compatible shape.
 *
 * Value is clamped to [-100, +100] after applying the optional multiplier.
 * When metricResult is null (metric unavailable or data absent), returns a
 * zero-value placeholder so downstream factor aggregation stays stable.
 *
 * @param metricResult - Output from resolveMetric() or MetricStore.get().
 * @param factorId     - Canonical factor ID to attach to the returned shape.
 * @param scoreMultiplier - Optional linear scale applied before clamping.
 *                          Default 1. Use e.g. 100 when metricResult.value is
 *                          a ratio in [0, 1] and factor expects [-100, +100].
 */
export function metricToFactorValue(
	metricResult: MetricResult | null,
	factorId: string,
	scoreMultiplier = 1
): { factorId: string; value: number; detail: string; rawValue?: number } {
	if (!metricResult) {
		return { factorId, value: 0, detail: 'Metric unavailable' };
	}

	const value = Math.max(-100, Math.min(100, Math.round(metricResult.value * scoreMultiplier)));
	return {
		factorId,
		value,
		detail: metricResult.detail ?? `${factorId} = ${metricResult.value}`,
		rawValue: metricResult.value
	};
}
