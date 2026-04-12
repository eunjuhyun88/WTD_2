import type { EventMarker } from '$lib/contracts';
import type { PriceChartViewSpec } from '../contracts/chartViewSpec';

type AnalyzeSnapshotAnnotation = {
	type?: string;
	price?: number;
	strength?: number;
};

type AnalyzeSnapshotPayload = {
	symbol?: string;
	timeframe?: string;
	chart?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
	annotations?: AnalyzeSnapshotAnnotation[];
	markers?: EventMarker[];
	indicators?: {
		ema20?: number[];
		bbUpper?: number[];
		bbMiddle?: number[];
		bbLower?: number[];
	} | null;
};

function toOverlayPoints(
	chart: NonNullable<AnalyzeSnapshotPayload['chart']>,
	values: number[] | undefined
) {
	if (!values?.length) return [];
	return values
		.map((value, index) => {
			const time = chart[index]?.t;
			if (typeof time !== 'number' || !Number.isFinite(value)) return null;
			return { t: time, v: value };
		})
		.filter((point): point is { t: number; v: number } => point !== null);
}

export function fromAnalyzeSnapshot(payload: AnalyzeSnapshotPayload): PriceChartViewSpec {
	const chart = payload.chart ?? [];
	const ema20 = toOverlayPoints(chart, payload.indicators?.ema20);
	const bbUpper = toOverlayPoints(chart, payload.indicators?.bbUpper);
	const bbMiddle = toOverlayPoints(chart, payload.indicators?.bbMiddle);
	const bbLower = toOverlayPoints(chart, payload.indicators?.bbLower);

	return {
		kind: 'price',
		symbol: payload.symbol,
		timeframe: payload.timeframe,
		title: `${payload.symbol?.replace('USDT', '') ?? 'Market'} price workbench`,
		summary: 'Price-first view with structural levels and active overlays.',
		ui: {
			eyebrow: 'research workbench',
			stageLabel: 'price',
			metricChips: [
				{
					id: 'bars',
					label: 'bars',
					value: `${chart.length}`,
				},
				{
					id: 'levels',
					label: 'levels',
					value: `${(payload.annotations ?? []).filter((annotation) => typeof annotation.price === 'number').length}`,
					tone: 'accent',
				},
				{
					id: 'ema',
					label: 'ema20',
					value: ema20.length > 0 ? 'on' : 'off',
					tone: ema20.length > 0 ? 'bull' : 'neutral',
				},
				{
					id: 'bb',
					label: 'bb',
					value: bbUpper.length > 0 && bbLower.length > 0 ? 'on' : 'off',
					tone: bbUpper.length > 0 && bbLower.length > 0 ? 'warn' : 'neutral',
				},
			],
			signalBadges: [
				...(ema20.length > 0 ? [{ id: 'ema20', label: 'EMA20', tone: 'bull' as const }] : []),
				...(bbUpper.length > 0 && bbLower.length > 0
					? [{ id: 'bbands', label: 'Bollinger Bands', tone: 'warn' as const }]
					: []),
			],
			notes: [
				{
					id: 'price-focus',
					label: 'focus',
					body: 'Use this view for structure, support/resistance, and overlay-led context before drilling into flow panes.',
					tone: 'neutral',
				},
			],
		},
		series: chart.map((point) => ({
			t: point.t,
			o: point.o,
			h: point.h,
			l: point.l,
			c: point.c,
			v: point.v ?? null,
		})),
		compareWindows: [],
		srLevels: (payload.annotations ?? [])
			.filter(
				(annotation) =>
					(annotation.type === 'support' || annotation.type === 'resistance') &&
					typeof annotation.price === 'number'
			)
			.map((annotation) => ({
				price: annotation.price as number,
				label: annotation.type === 'support' ? 'S' : 'R',
				strength: annotation.strength,
			})),
		markers: payload.markers ?? [],
		overlays:
			ema20.length > 0 || (bbUpper.length > 0 && bbLower.length > 0)
				? {
						lines: ema20.length > 0
							? [
									{
										id: 'ema20',
										label: 'EMA20',
										color: 'rgba(255, 191, 95, 0.85)',
										lineWidth: 1.5,
										points: ema20,
									},
								]
							: [],
						bands:
							bbUpper.length > 0 && bbLower.length > 0
								? [
										{
											id: 'bb',
											upper: bbUpper,
											middle: bbMiddle,
											lower: bbLower,
										},
									]
								: [],
					}
				: undefined,
	};
}
