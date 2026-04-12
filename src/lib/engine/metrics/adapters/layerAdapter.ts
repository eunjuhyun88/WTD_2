// ═══════════════════════════════════════════════════════════════
// Metric Engine — Layer Adapter
// ═══════════════════════════════════════════════════════════════
//
// Bridges MetricStore output to the ExtendedMarketData shape consumed
// by layerEngine. Allows layerEngine to read metric-engine values
// without depending on metric internals directly.

import type { MetricStore } from '../store';
import { MetricId } from '$lib/contracts/metricIds';

/**
 * Enrich an ExtendedMarketData-compatible record with resolved metrics
 * from a MetricStore.
 *
 * Only metrics that are present (non-null, non-expired) are written;
 * existing keys in `existing` are preserved when the metric is absent.
 *
 * @param store    - Populated MetricStore instance for the current request.
 * @param symbol   - Trading pair, e.g. 'BTCUSDT'.
 * @param existing - Partial ExtendedMarketData record to merge into.
 *                   Defaults to an empty object.
 */
export function enrichExtendedData(
	store: MetricStore,
	symbol: string,
	existing: Record<string, unknown> = {}
): Record<string, unknown> {
	const enriched = { ...existing };

	// CVD raw
	const cvdRaw = store.get(MetricId.CVD_RAW, symbol);
	if (cvdRaw) enriched.cvdRaw = cvdRaw.value;

	// CVD trend
	const cvdTrend = store.get(MetricId.CVD_TREND, symbol);
	if (cvdTrend) enriched.cvdTrend = cvdTrend.value;

	// Book imbalance
	const bookImb = store.get(MetricId.BOOK_IMBALANCE, symbol);
	if (bookImb) enriched.bookImbalance = bookImb.value;

	return enriched;
}
