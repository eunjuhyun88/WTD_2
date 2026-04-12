// ═══════════════════════════════════════════════════════════════
// Metric Engine — Registry
// ═══════════════════════════════════════════════════════════════
//
// Central mapping of MetricId → MetricComputeFn.
// Import resolveMetric() to evaluate a single metric from context.
// Import registerMetric() to extend the registry at runtime.

import { MetricId } from '$lib/contracts/metricIds';
import type { MetricResult, MetricContext, MetricComputeFn } from './types';
import { computeCVDSeries, computeCVDTrend, computeTakerBuySellRatio } from './compute/cvd';
import { computeBuySellScore } from './compute/buySellRatio';

const registry = new Map<string, MetricComputeFn>();

// ─── CVD Raw ─────────────────────────────────────────────────

registry.set(MetricId.CVD_RAW, (ctx) => {
	const candles = (ctx.klines5m ?? ctx.klines).map((k) => ({
		open: k.open,
		high: k.high,
		low: k.low,
		close: k.close,
		volume: k.volume,
		takerBuyVol:
			'buyVolume' in k
				? (k as unknown as { buyVolume: number }).buyVolume
				: 'takerBuyVol' in k
					? (k as unknown as { takerBuyVol: number }).takerBuyVol
					: undefined
	}));
	if (candles.length < 10) return null;
	const series = computeCVDSeries(candles);
	const lastValue = series[series.length - 1] ?? 0;
	return {
		id: MetricId.CVD_RAW,
		value: lastValue,
		timestamp: Date.now(),
		ttlMs: 60_000,
		source: 'computed',
		detail: `CVD raw = ${Math.round(lastValue)}`
	};
});

// ─── CVD Trend ───────────────────────────────────────────────

registry.set(MetricId.CVD_TREND, (ctx) => {
	const candles = (ctx.klines5m ?? ctx.klines).map((k) => ({
		open: k.open,
		high: k.high,
		low: k.low,
		close: k.close,
		volume: k.volume,
		takerBuyVol:
			'buyVolume' in k
				? (k as unknown as { buyVolume: number }).buyVolume
				: 'takerBuyVol' in k
					? (k as unknown as { takerBuyVol: number }).takerBuyVol
					: undefined
	}));
	if (candles.length < 10) return null;
	const series = computeCVDSeries(candles);
	const trend = computeCVDTrend(series, 20);
	return {
		id: MetricId.CVD_TREND,
		value: trend,
		timestamp: Date.now(),
		ttlMs: 60_000,
		source: 'computed',
		detail: `CVD trend = ${Math.round(trend)} (20-bar delta)`
	};
});

// ─── Buy / Sell Ratio ────────────────────────────────────────

registry.set(MetricId.BUY_SELL_RATIO, (ctx) => {
	const candles = (ctx.klines5m ?? ctx.klines).slice(-20).map((k) => ({
		open: k.open,
		high: k.high,
		low: k.low,
		close: k.close,
		volume: k.volume,
		takerBuyVol:
			'buyVolume' in k
				? (k as unknown as { buyVolume: number }).buyVolume
				: 'takerBuyVol' in k
					? (k as unknown as { takerBuyVol: number }).takerBuyVol
					: undefined
	}));
	if (candles.length < 5) return null;
	const result = computeBuySellScore(candles);
	return {
		id: MetricId.BUY_SELL_RATIO,
		value: result.buyRatio,
		timestamp: Date.now(),
		ttlMs: 60_000,
		source: 'computed',
		detail: `Buy ${(result.buyRatio * 100).toFixed(1)}% / Sell ${(result.sellRatio * 100).toFixed(1)}% · ${result.label}`
	};
});

// ─── Funding BPS ─────────────────────────────────────────────

registry.set(MetricId.FUNDING_BPS, (ctx) => {
	const rate = ctx.derivatives?.funding;
	if (rate == null) return null;
	const bps = rate * 10_000;
	return {
		id: MetricId.FUNDING_BPS,
		value: bps,
		timestamp: Date.now(),
		ttlMs: 300_000,
		source: 'computed',
		detail: `Funding ${bps.toFixed(1)} BPS (${(rate * 100).toFixed(4)}%)`
	};
});

// ─── Book Imbalance ──────────────────────────────────────────

registry.set(MetricId.BOOK_IMBALANCE, (ctx) => {
	if (!ctx.depth?.bids?.length || !ctx.depth?.asks?.length) return null;
	let bidDepth = 0;
	let askDepth = 0;
	for (const [, qty] of ctx.depth.bids) bidDepth += qty;
	for (const [, qty] of ctx.depth.asks) askDepth += qty;
	const total = bidDepth + askDepth;
	if (total <= 0) return null;
	const imbalance = (bidDepth - askDepth) / total;
	return {
		id: MetricId.BOOK_IMBALANCE,
		value: imbalance,
		timestamp: Date.now(),
		ttlMs: 5_000,
		source: 'computed',
		detail: `Book imbalance ${(imbalance * 100).toFixed(1)}% · bid ${bidDepth.toFixed(0)} / ask ${askDepth.toFixed(0)}`
	};
});

// ─── Public API ──────────────────────────────────────────────

/**
 * Resolve a metric by ID from a MetricContext.
 * Returns null if the metric ID is not registered or if the compute function
 * returns null (e.g. insufficient input data).
 */
export function resolveMetric(id: string, ctx: MetricContext): MetricResult | null {
	const fn = registry.get(id);
	if (!fn) return null;
	try {
		return fn(ctx);
	} catch {
		return null;
	}
}

/** Returns all metric IDs currently registered. */
export function getRegisteredMetricIds(): string[] {
	return [...registry.keys()];
}

/**
 * Register a metric compute function at runtime.
 * Use this to extend the registry from outside the engine core
 * (e.g. plugin layers or test overrides).
 */
export function registerMetric(id: string, fn: MetricComputeFn): void {
	registry.set(id, fn);
}
