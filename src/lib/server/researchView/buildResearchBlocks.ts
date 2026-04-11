import {
	parseResearchBlockEnvelope,
	type CandlePoint,
	type CompareWindow,
	type CompareWindowKey,
	type EventMarker,
	type FlowSeries,
	type HeatmapCell,
	type ResearchBlockEnvelope,
	type TimePoint
} from '$lib/contracts';
import type { FundingDataPoint, LSRatioDataPoint, LiquidationDataPoint, OIDataPoint } from '$lib/server/coinalyze';
import type { ForceOrder, OrderBookSnapshot, TakerRatioPoint } from '$lib/server/marketDataService';

type AnnotationInput = Array<{ type?: string; price?: number; strength?: number }>;
type Kline5m = {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	buyVolume?: number;
};

type BuildResearchBlocksInput = {
	traceId: string;
	symbol: string;
	timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
	asOf: string;
	priceSeries: CandlePoint[];
	annotations?: AnnotationInput;
	klines5m?: Kline5m[];
	oiHistory?: OIDataPoint[];
	fundingHistory?: FundingDataPoint[];
	lsRatioHistory?: LSRatioDataPoint[];
	liquidationHistory?: LiquidationDataPoint[];
	depthSnapshot?: OrderBookSnapshot | null;
	forceOrders?: ForceOrder[];
	takerData?: TakerRatioPoint[];
	currentFunding?: number | null;
	currentLsRatio?: number | null;
	currentOi?: number | null;
};

const DEFAULT_COMPARE_WINDOWS: CompareWindowKey[] = ['1h', '4h', '24h'];
const WINDOW_SECONDS: Record<CompareWindowKey, number> = {
	'1h': 3600,
	'4h': 14_400,
	'8h': 28_800,
	'24h': 86_400,
	'7d': 604_800,
	'30d': 2_592_000
};

function percentDelta(current: number | null, baseline: number | null): number | null {
	if (current == null || baseline == null || baseline === 0) return null;
	return ((current - baseline) / Math.abs(baseline)) * 100;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function findBaselinePoint<T extends { t: number; v: number | null }>(
	points: T[],
	targetTs: number
): T | null {
	let candidate: T | null = null;
	for (const point of points) {
		if (point.t <= targetTs) {
			candidate = point;
			continue;
		}
		break;
	}
	return candidate;
}

function buildCompareWindows(
	points: Array<{ t: number; v: number | null }>,
	keys: CompareWindowKey[] = DEFAULT_COMPARE_WINDOWS
): CompareWindow[] {
	if (points.length === 0) return [];
	const latest = points[points.length - 1];
	return keys.map((key) => {
		const windowSeconds = WINDOW_SECONDS[key];
		const targetTs = latest.t - windowSeconds;
		const baseline = findBaselinePoint(points, targetTs);
		const baselineValue = baseline?.v ?? null;
		const currentValue = latest.v ?? null;
		return {
			key,
			startTs: Math.max(0, targetTs),
			endTs: latest.t,
			baselineValue,
			currentValue,
			deltaAbs:
				baselineValue == null || currentValue == null ? null : currentValue - baselineValue,
			deltaPct: percentDelta(currentValue, baselineValue)
		};
	});
}

function mapPriceToTimePoints(priceSeries: CandlePoint[]): TimePoint[] {
	return priceSeries.map((point) => ({ t: point.t, v: point.c }));
}

function buildCvdSeries(klines5m: Kline5m[] | undefined): TimePoint[] {
	if (!klines5m || klines5m.length === 0) return [];
	let cumulative = 0;
	return klines5m
		.slice()
		.sort((a, b) => a.time - b.time)
		.map((kline) => {
			const buyVolume =
				typeof kline.buyVolume === 'number'
					? kline.buyVolume
					: kline.close >= kline.open
						? kline.volume * 0.55
						: kline.volume * 0.45;
			const sellVolume = kline.volume - buyVolume;
			cumulative += buyVolume - sellVolume;
			return { t: kline.time, v: cumulative };
		});
}

function mapHistoryPoints(points: Array<{ time: number; value: number }> | undefined): TimePoint[] {
	return (points ?? [])
		.slice()
		.sort((a, b) => a.time - b.time)
		.map((point) => ({ t: point.time, v: point.value }));
}

function buildFundingBpsSeries(points: FundingDataPoint[] | undefined): TimePoint[] {
	return (points ?? [])
		.slice()
		.sort((a, b) => a.time - b.time)
		.map((point) => ({ t: point.time, v: point.value * 10_000 }));
}

function buildLiquidationTotalSeries(points: LiquidationDataPoint[] | undefined): TimePoint[] {
	return (points ?? [])
		.slice()
		.sort((a, b) => a.time - b.time)
		.map((point) => ({ t: point.time, v: (point.long ?? 0) + (point.short ?? 0) }));
}

function buildTakerRatioSeries(points: TakerRatioPoint[] | undefined): TimePoint[] {
	return (points ?? [])
		.slice()
		.sort((a, b) => a.timestamp - b.timestamp)
		.map((point) => ({ t: point.timestamp / 1000, v: point.buySellRatio }));
}

function buildMetricInterpretation(
	label: string,
	current: number | null,
	deltaPct: number | null
): string | undefined {
	if (current == null) return undefined;
	if (label === 'Funding' && deltaPct != null) {
		return deltaPct > 0 ? 'funding rising' : deltaPct < 0 ? 'funding cooling' : 'funding flat';
	}
	if (label === 'CVD' && deltaPct != null) {
		return deltaPct > 0 ? 'buyers gaining control' : deltaPct < 0 ? 'buyers losing control' : 'flow flat';
	}
	if (label === 'Open Interest' && deltaPct != null) {
		return deltaPct > 0 ? 'participation expanding' : deltaPct < 0 ? 'participation contracting' : 'positioning flat';
	}
	return undefined;
}

function metricCurrentFromSeries(points: TimePoint[], fallback: number | null): number | null {
	return points.length > 0 ? points[points.length - 1]?.v ?? fallback : fallback;
}

function buildPriceBounds(
	priceSeries: CandlePoint[],
	heatmapCells: HeatmapCell[]
): { minPrice: number; maxPrice: number; range: number; midpoint: number } {
	const priceValues = priceSeries.flatMap((point) => [point.l, point.h]);
	const cellValues = heatmapCells.flatMap((cell) => [cell.y0, cell.y1]);
	const merged = [...priceValues, ...cellValues];
	const minPrice = Math.min(...merged);
	const maxPrice = Math.max(...merged);
	const range = Math.max(maxPrice - minPrice, maxPrice * 0.01, 1);
	return { minPrice, maxPrice, range, midpoint: (minPrice + maxPrice) / 2 };
}

function estimateTimeBucketSeconds(priceSeries: CandlePoint[]): number {
	if (priceSeries.length < 2) return 3600;
	const deltas: number[] = [];
	for (let index = 1; index < priceSeries.length; index += 1) {
		const delta = priceSeries[index].t - priceSeries[index - 1].t;
		if (delta > 0) deltas.push(delta);
	}
	if (deltas.length === 0) return 3600;
	deltas.sort((a, b) => a - b);
	return deltas[Math.floor(deltas.length / 2)] ?? deltas[0] ?? 3600;
}

function buildDepthHeatmapCells(
	priceSeries: CandlePoint[],
	depthSnapshot: OrderBookSnapshot | null | undefined
): HeatmapCell[] {
	if (!depthSnapshot || priceSeries.length < 2) return [];
	const startTs = priceSeries[0].t;
	const endTs = priceSeries[priceSeries.length - 1].t;
	const minPrice = Math.min(...priceSeries.map((point) => point.l));
	const maxPrice = Math.max(...priceSeries.map((point) => point.h));
	const priceRange = Math.max(maxPrice - minPrice, maxPrice * 0.01, 1);
	const bandHeight = Math.max(priceRange * 0.012, maxPrice * 0.0018, 6);

	const bidLevels = depthSnapshot.bids
		.map(([price, qty]) => ({ side: 'bid' as const, price, qty, notional: price * qty }))
		.sort((a, b) => b.notional - a.notional)
		.slice(0, 8);
	const askLevels = depthSnapshot.asks
		.map(([price, qty]) => ({ side: 'ask' as const, price, qty, notional: price * qty }))
		.sort((a, b) => b.notional - a.notional)
		.slice(0, 8);
	const levels = [...bidLevels, ...askLevels];
	const maxNotional = Math.max(...levels.map((level) => level.notional), 1);

	return levels.map((level) => ({
		x0: startTs,
		x1: endTs,
		y0: level.price - bandHeight / 2,
		y1: level.price + bandHeight / 2,
		intensity: clamp01(0.18 + Math.sqrt(level.notional / maxNotional) * 0.82),
		side: level.side,
		value: level.notional,
		label: level.side === 'bid' ? 'Bid wall' : 'Ask wall'
	}));
}

function buildForceOrderHeatmapCells(
	priceSeries: CandlePoint[],
	forceOrders: ForceOrder[] | undefined
): HeatmapCell[] {
	if (!forceOrders || forceOrders.length === 0 || priceSeries.length < 2) return [];
	const startTs = priceSeries[0].t;
	const endTs = priceSeries[priceSeries.length - 1].t;
	const minPrice = Math.min(...priceSeries.map((point) => point.l));
	const maxPrice = Math.max(...priceSeries.map((point) => point.h));
	const priceRange = Math.max(maxPrice - minPrice, maxPrice * 0.01, 1);
	const bandHeight = Math.max(priceRange * 0.02, maxPrice * 0.0024, 8);
	const bucketSeconds = estimateTimeBucketSeconds(priceSeries);
	const pulseWidth = Math.max(Math.round(bucketSeconds * 1.4), 900);

	const ranked = forceOrders
		.map((order) => ({
			...order,
			notional: Math.abs(order.price * order.origQty)
		}))
		.filter((order) => Number.isFinite(order.notional) && order.notional > 0)
		.sort((a, b) => b.notional - a.notional)
		.slice(0, 18);
	const maxNotional = Math.max(...ranked.map((order) => order.notional), 1);

	return ranked.map((order) => ({
		x0: Math.max(startTs, Math.floor(order.time / 1000) - Math.floor(pulseWidth / 2)),
		x1: Math.min(endTs, Math.floor(order.time / 1000) + Math.floor(pulseWidth / 2)),
		y0: order.price - bandHeight / 2,
		y1: order.price + bandHeight / 2,
		intensity: clamp01(0.14 + Math.sqrt(order.notional / maxNotional) * 0.86),
		side: order.side === 'BUY' ? 'buy_liq' : 'sell_liq',
		value: order.notional,
		label: order.side === 'BUY' ? 'Short liq pulse' : 'Long liq pulse'
	}));
}

function buildHeatmapMarkers(forceOrders: ForceOrder[] | undefined): EventMarker[] {
	if (!forceOrders || forceOrders.length === 0) return [];
	const ranked = forceOrders
		.map((order) => ({
			...order,
			notional: Math.abs(order.price * order.origQty)
		}))
		.filter((order) => Number.isFinite(order.notional) && order.notional > 0)
		.sort((a, b) => b.notional - a.notional)
		.slice(0, 6);
	const maxNotional = Math.max(...ranked.map((order) => order.notional), 1);

	return ranked.map((order, index) => {
		const strength = order.notional / maxNotional;
		return {
			id: `force-${index}-${order.time}`,
			ts: Math.floor(order.time / 1000),
			label: order.side === 'BUY' ? 'Short liq' : 'Long liq',
			direction: order.side === 'BUY' ? 'bull' : 'bear',
			severity: strength > 0.66 ? 'high' : strength > 0.33 ? 'medium' : 'low'
		};
	});
}

export function buildResearchBlocks(input: BuildResearchBlocksInput): ResearchBlockEnvelope[] {
	const priceCloseSeries = mapPriceToTimePoints(input.priceSeries);
	const cvdSeries = buildCvdSeries(input.klines5m);
	const oiSeries = mapHistoryPoints(input.oiHistory);
	const fundingSeries = buildFundingBpsSeries(input.fundingHistory);
	const lsSeries = mapHistoryPoints(input.lsRatioHistory);
	const liqSeries = buildLiquidationTotalSeries(input.liquidationHistory);
	const takerRatioSeries = buildTakerRatioSeries(input.takerData);

	const priceCompare = buildCompareWindows(priceCloseSeries);
	const cvdCompare = buildCompareWindows(cvdSeries);
	const oiCompare = buildCompareWindows(oiSeries);
	const fundingCompare = buildCompareWindows(fundingSeries);
	const lsCompare = buildCompareWindows(lsSeries);

	const currentPrice = metricCurrentFromSeries(priceCloseSeries, null);
	const currentCvd = metricCurrentFromSeries(cvdSeries, null);
	const currentOi = metricCurrentFromSeries(oiSeries, input.currentOi ?? null);
	const currentFundingBps = metricCurrentFromSeries(
		fundingSeries,
		input.currentFunding == null ? null : input.currentFunding * 10_000
	);
	const currentLs = metricCurrentFromSeries(lsSeries, input.currentLsRatio ?? null);
	const currentLiq = metricCurrentFromSeries(liqSeries, null);

	const metricStrip = parseResearchBlockEnvelope({
		schemaVersion: 'research_block_v1',
		id: `${input.symbol}-${input.timeframe}-metric-strip`,
		traceId: input.traceId,
		symbol: input.symbol,
		timeframe: input.timeframe,
		asOf: input.asOf,
		title: 'Interval delta strip',
		summary: 'Current values with 1h / 4h / 24h comparisons.',
		block: {
			kind: 'metric_strip',
			metrics: [
				{
					metricId: 'price',
					label: 'Price',
					unit: 'usd',
					current: currentPrice,
					compare: priceCompare,
					interpretation: buildMetricInterpretation('Price', currentPrice, priceCompare[0]?.deltaPct ?? null),
					sourceIds: ['raw.symbol.klines.4h']
				},
				{
					metricId: 'cvd',
					label: 'CVD',
					unit: 'custom',
					current: currentCvd,
					compare: cvdCompare,
					interpretation: buildMetricInterpretation('CVD', currentCvd, cvdCompare[0]?.deltaPct ?? null),
					sourceIds: ['raw.symbol.klines.5m', 'feat.flow.cvd.raw']
				},
				{
					metricId: 'open_interest',
					label: 'Open Interest',
					unit: 'usd_compact',
					current: currentOi,
					compare: oiCompare,
					interpretation: buildMetricInterpretation('Open Interest', currentOi, oiCompare[0]?.deltaPct ?? null),
					sourceIds: ['raw.symbol.oi_hist.display_tf', 'feat.flow.oi_change_pct']
				},
				{
					metricId: 'funding_bps',
					label: 'Funding',
					unit: 'pct',
					current: currentFundingBps == null ? null : currentFundingBps / 100,
					compare: fundingCompare.map((window) => ({
						...window,
						baselineValue: window.baselineValue == null ? null : window.baselineValue / 100,
						currentValue: window.currentValue == null ? null : window.currentValue / 100,
						deltaAbs: window.deltaAbs == null ? null : window.deltaAbs / 100
					})),
					interpretation: buildMetricInterpretation('Funding', currentFundingBps, fundingCompare[0]?.deltaPct ?? null),
					sourceIds: ['raw.symbol.funding_rate']
				},
				{
					metricId: 'ls_ratio',
					label: 'L/S Ratio',
					unit: 'ratio',
					current: currentLs,
					compare: lsCompare,
					sourceIds: ['raw.symbol.long_short.global']
				},
				{
					metricId: 'liquidation_total',
					label: 'Liq Total',
					unit: 'usd_compact',
					current: currentLiq,
					compare: buildCompareWindows(liqSeries),
					sourceIds: ['raw.symbol.force_orders.1h', 'event.flow.short_squeeze_active', 'event.flow.long_cascade_active']
				}
			]
		}
	});

	const inlinePrice = parseResearchBlockEnvelope({
		schemaVersion: 'research_block_v1',
		id: `${input.symbol}-${input.timeframe}-inline-price`,
		traceId: input.traceId,
		symbol: input.symbol,
		timeframe: input.timeframe,
		asOf: input.asOf,
		title: `${input.symbol.replace('USDT', '')} ${input.timeframe.toUpperCase()} price`,
		summary: 'Inline price context with compare windows.',
		block: {
			kind: 'inline_price_chart',
			series: input.priceSeries,
			compareWindows: priceCompare,
			overlays: {
				srLevels: (input.annotations ?? [])
					.filter((annotation) => (annotation.type === 'support' || annotation.type === 'resistance') && typeof annotation.price === 'number')
					.slice(0, 6)
					.map((annotation) => ({
						price: annotation.price as number,
						label: annotation.type === 'support' ? 'S' : 'R',
						strength: annotation.strength
					}))
			},
			markers: []
		}
	});

	const flowSeries: FlowSeries[] = [
		...(cvdSeries.length > 1
			? [
					{
						id: 'cvd',
						label: 'CVD',
						axis: 'left' as const,
						mode: 'area' as const,
						points: cvdSeries
					}
				]
			: []),
		...(oiSeries.length > 1
			? [
					{
						id: 'oi',
						label: 'OI',
						axis: 'right' as const,
						mode: 'line' as const,
						points: oiSeries
					}
				]
			: []),
		...(fundingSeries.length > 1
			? [
					{
						id: 'funding_bps',
						label: 'Funding (bps)',
						axis: 'left' as const,
						mode: 'histogram' as const,
						points: fundingSeries
					}
				]
			: []),
		...(lsSeries.length > 1
			? [
					{
						id: 'ls_ratio',
						label: 'L/S Ratio',
						axis: 'right' as const,
						mode: 'line' as const,
						points: lsSeries
					}
				]
			: []),
		...(takerRatioSeries.length > 1
			? [
					{
						id: 'taker_ratio',
						label: 'Taker Ratio',
						axis: 'right' as const,
						mode: 'line' as const,
						points: takerRatioSeries
					}
				]
			: [])
	];

	const dualPaneFlow = parseResearchBlockEnvelope({
		schemaVersion: 'research_block_v1',
		id: `${input.symbol}-${input.timeframe}-dual-flow`,
		traceId: input.traceId,
		symbol: input.symbol,
		timeframe: input.timeframe,
		asOf: input.asOf,
		title: 'Flow vs price',
		summary: 'Price on top, flow tracks below.',
		block: {
			kind: 'dual_pane_flow_chart',
			topPane: { price: input.priceSeries },
			bottomPane: { series: flowSeries },
			compareWindows: priceCompare,
			markers: []
		}
	});

	const heatmapCells = [
		...buildDepthHeatmapCells(input.priceSeries, input.depthSnapshot),
		...buildForceOrderHeatmapCells(input.priceSeries, input.forceOrders)
	];
	const heatmapMarkers = buildHeatmapMarkers(input.forceOrders);
	const blocks = [metricStrip, inlinePrice, dualPaneFlow];

	if (heatmapCells.length > 0) {
		const priceBounds = buildPriceBounds(input.priceSeries, heatmapCells);
		const heatmapLowerSeries: FlowSeries[] = [
			...(liqSeries.length > 1
				? [
						{
							id: 'liquidation_total',
							label: 'Liquidations',
							axis: 'left' as const,
							mode: 'histogram' as const,
							points: liqSeries
						}
					]
				: []),
			...(cvdSeries.length > 1
				? [
						{
							id: 'cvd_context',
							label: 'CVD',
							axis: 'right' as const,
							mode: 'line' as const,
							points: cvdSeries
						}
					]
				: [])
		];

		blocks.push(
			parseResearchBlockEnvelope({
				schemaVersion: 'research_block_v1',
				id: `${input.symbol}-${input.timeframe}-heatmap-flow`,
				traceId: input.traceId,
				symbol: input.symbol,
				timeframe: input.timeframe,
				asOf: input.asOf,
				title: 'Liquidity heatmap',
				summary: `Orderbook walls and liquidation pulses across ${priceBounds.minPrice.toFixed(0)}-${priceBounds.maxPrice.toFixed(0)} price space.`,
				block: {
					kind: 'heatmap_flow_chart',
					price: input.priceSeries,
					cells: heatmapCells,
					lowerPane: heatmapLowerSeries.length > 0 ? { series: heatmapLowerSeries } : undefined,
					compareWindows: priceCompare,
					markers: heatmapMarkers,
					legend: [
						{ id: 'bid', label: 'Bid wall', color: 'rgba(173, 202, 124, 0.9)' },
						{ id: 'ask', label: 'Ask wall', color: 'rgba(207, 127, 143, 0.9)' },
						{ id: 'buy_liq', label: 'Short liq pulse', color: 'rgba(255, 220, 110, 0.95)' },
						{ id: 'sell_liq', label: 'Long liq pulse', color: 'rgba(86, 146, 255, 0.95)' }
					]
				}
			})
		);
	}

	return blocks;
}
