import type { CandlePoint, FlowSeries, TimePoint } from '$lib/contracts';

export function isCandlePoint(point: CandlePoint | TimePoint): point is CandlePoint {
	return 'o' in point && 'h' in point && 'l' in point && 'c' in point;
}

export function toClosePoints(points: Array<CandlePoint | TimePoint>): TimePoint[] {
	return points.map((point) => (isCandlePoint(point) ? { t: point.t, v: point.c } : point));
}

export function linePath(points: TimePoint[], width: number, height: number): string {
	if (points.length < 2) return '';
	const values = points.map((point) => point.v ?? 0);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	return points
		.map((point, index) => {
			const x = (index / Math.max(points.length - 1, 1)) * width;
			const y = height - (((point.v ?? 0) - min) / range) * height;
			return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(' ');
}

export function areaPath(points: TimePoint[], width: number, height: number): string {
	const line = linePath(points, width, height);
	if (!line) return '';
	return `${line} L ${width},${height} L 0,${height} Z`;
}

export function histogramBars(
	points: TimePoint[],
	width: number,
	height: number
): Array<{ x: number; y: number; w: number; h: number; positive: boolean }> {
	if (points.length === 0) return [];
	const values = points.map((point) => point.v ?? 0);
	const maxAbs = Math.max(...values.map((value) => Math.abs(value))) || 1;
	const barWidth = Math.max(width / Math.max(points.length, 1) - 1, 1);
	return points.map((point, index) => {
		const raw = point.v ?? 0;
		const normalized = Math.abs(raw) / maxAbs;
		const h = normalized * (height / 2);
		const x = (index / Math.max(points.length, 1)) * width;
		const y = raw >= 0 ? height / 2 - h : height / 2;
		return { x, y, w: barWidth, h, positive: raw >= 0 };
	});
}

export function latestValue(series: FlowSeries): number | null {
	return series.points.length > 0 ? series.points[series.points.length - 1]?.v ?? null : null;
}

export function formatCompact(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return '--';
	if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
	if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toFixed(2);
}

export function formatFlowSeriesValue(series: FlowSeries): string {
	const value = latestValue(series);
	if (value == null) return '--';
	if (series.id.includes('funding')) return `${value.toFixed(2)} bps`;
	if (series.id.includes('ratio')) return value.toFixed(2);
	if (series.id.includes('oi')) {
		if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
		if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
	}
	return formatCompact(value);
}
