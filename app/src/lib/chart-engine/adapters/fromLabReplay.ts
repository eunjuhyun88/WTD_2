import type { BinanceKline } from '$lib/contracts/marketContext';
import type { PriceChartViewSpec } from '../contracts/chartViewSpec';

export type LabReplayMarker = {
	time: number;
	position: 'aboveBar' | 'belowBar';
	color: string;
	shape: 'arrowUp' | 'arrowDown' | 'circle';
	text: string;
};

export type LabReplayPriceLine = {
	price: number;
	color: string;
	lineWidth: number;
	lineStyle: number;
	title: string;
};

export function fromLabReplay(input: {
	klines: BinanceKline[];
	revealedCount: number;
	mode: 'auto' | 'manual';
	markers: LabReplayMarker[];
	priceLines: LabReplayPriceLine[];
}): PriceChartViewSpec {
	const visibleCount = input.mode === 'manual' ? input.revealedCount : input.klines.length;
	const visible = input.klines.slice(0, visibleCount);

	return {
		kind: 'price',
		title: 'Replay workbench',
		summary:
			input.mode === 'manual'
				? 'Manual reveal mode for stepwise challenge review.'
				: 'Auto mode for full replay validation.',
		ui: {
			eyebrow: 'lab replay',
			stageLabel: input.mode,
			metricChips: [
				{ id: 'visible-bars', label: 'visible bars', value: `${visible.length}` },
				{ id: 'markers', label: 'markers', value: `${input.markers.length}`, tone: 'accent' },
				{ id: 'levels', label: 'lines', value: `${input.priceLines.length}`, tone: 'warn' },
			],
			signalBadges: [
				{
					id: 'mode',
					label: input.mode === 'manual' ? 'Manual Reveal' : 'Auto Replay',
					tone: input.mode === 'manual' ? 'accent' : 'neutral',
				},
			],
			actions: [
				{ id: 'sequence', label: 'Review Sequence', active: input.mode === 'manual' },
				{ id: 'levels', label: 'Reference Lines', active: input.priceLines.length > 0 },
			],
			notes: [
				{
					id: 'replay-note',
					label: 'workflow',
					body:
						input.mode === 'manual'
							? 'Advance candle exposure gradually and validate whether markers and thesis levels still hold.'
							: 'Use auto mode to inspect the full run before returning to manual checkpoints.',
					tone: 'neutral',
				},
			],
		},
		series: visible.map((kline) => ({
			t: kline.time,
			o: kline.open,
			h: kline.high,
			l: kline.low,
			c: kline.close,
			v: kline.volume,
		})),
		compareWindows: [],
		srLevels: [],
		markers: input.markers
			.filter((marker) => visible.some((kline) => kline.time === marker.time))
			.map((marker, index) => ({
				id: `lab-marker-${index}-${marker.time}`,
				ts: marker.time,
				label: marker.text,
				direction:
					marker.position === 'belowBar'
						? 'bull'
						: marker.position === 'aboveBar'
							? 'bear'
							: 'neutral',
				severity: marker.shape === 'circle' ? 'medium' : 'high',
				position: marker.position,
				shape: marker.shape,
				color: marker.color,
			})),
		referenceLines: input.priceLines.map((line, index) => ({
			id: `lab-line-${index}-${line.title}`,
			price: line.price,
			color: line.color,
			lineWidth: line.lineWidth,
			lineStyle: line.lineStyle,
			title: line.title,
		})),
	};
}
