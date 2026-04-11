import {
	parseResearchBlockEnvelope,
	type CandlePoint,
	type CompareWindow,
	type CompareWindowKey,
	type FlowSeries,
	type ResearchBlockEnvelope,
	type TimePoint
} from '$lib/contracts';
import type { FundingDataPoint, LSRatioDataPoint, LiquidationDataPoint, OIDataPoint } from '$lib/server/coinalyze';

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

export function buildResearchBlocks(input: BuildResearchBlocksInput): ResearchBlockEnvelope[] {
	const priceCloseSeries = mapPriceToTimePoints(input.priceSeries);
	const cvdSeries = buildCvdSeries(input.klines5m);
	const oiSeries = mapHistoryPoints(input.oiHistory);
	const fundingSeries = buildFundingBpsSeries(input.fundingHistory);
	const lsSeries = mapHistoryPoints(input.lsRatioHistory);
	const liqSeries = buildLiquidationTotalSeries(input.liquidationHistory);

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

	return [metricStrip, inlinePrice, dualPaneFlow];
}
