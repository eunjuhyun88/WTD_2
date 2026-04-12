import type { PriceChartViewSpec } from '../contracts/chartViewSpec';
import type { WalletMarketToken } from '$lib/wallet-intel/walletIntelTypes';

export function fromWalletMarketToken(
	token: WalletMarketToken,
	timeframe = '4h'
): PriceChartViewSpec {
	const toOverlayPoints = (values: number[]) =>
		values
			.map((value, index) => {
				const time = token.chart[index]?.t;
				if (typeof time !== 'number' || !Number.isFinite(value)) return null;
				return { t: time, v: value };
			})
			.filter((point): point is { t: number; v: number } => point !== null);

	return {
		kind: 'price',
		symbol: token.pair,
		timeframe,
		title: `${token.symbol} wallet market overlay`,
		summary: 'Selected token context with structural levels and market overlays.',
		ui: {
			eyebrow: 'wallet overlay',
			stageLabel: token.role,
			metricChips: [
				{ id: 'bars', label: 'bars', value: `${token.chart.length}` },
				{ id: 'annotations', label: 'levels', value: `${token.annotations.length}`, tone: 'accent' },
				{ id: 'events', label: 'events', value: `${token.eventMarkers.length}`, tone: 'warn' },
			],
			signalBadges: [{ id: 'role', label: token.role, tone: 'bull' }],
			notes: [
				{
					id: 'wallet-note',
					label: 'context',
					body: 'Overlay this view with wallet evidence and event pills to connect token-specific flow with price structure.',
					tone: 'neutral',
				},
			],
		},
		series: token.chart.map((point) => ({
			t: point.t,
			o: point.o,
			h: point.h,
			l: point.l,
			c: point.c,
			v: point.v,
		})),
		compareWindows: [],
		srLevels: token.annotations.map((annotation) => ({
			price: annotation.price,
			label: annotation.type === 'support' ? 'S' : 'R',
			strength: annotation.strength,
		})),
		markers: [],
		overlays: {
			lines: [
				{
					id: 'ema20',
					label: 'EMA20',
					color: 'rgba(255, 191, 95, 0.85)',
					lineWidth: 1.5,
					points: toOverlayPoints(token.indicators.ema20),
				},
			],
			bands: [
				{
					id: 'bb',
					upper: toOverlayPoints(token.indicators.bbUpper),
					middle: toOverlayPoints(token.indicators.bbMiddle),
					lower: toOverlayPoints(token.indicators.bbLower),
				},
			],
		},
	};
}
