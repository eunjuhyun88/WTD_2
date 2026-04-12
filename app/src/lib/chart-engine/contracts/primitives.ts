export type CompareWindowKey = '1h' | '4h' | '8h' | '24h' | '7d' | '30d';

export type TimePoint = {
	t: number;
	v: number | null;
};

export type CandlePoint = {
	t: number;
	o: number;
	h: number;
	l: number;
	c: number;
	v?: number | null;
};

export type CompareWindow = {
	key: CompareWindowKey;
	startTs: number;
	endTs: number;
	baselineValue: number | null;
	currentValue: number | null;
	deltaAbs: number | null;
	deltaPct: number | null;
};

export type EventDirection = 'bull' | 'bear' | 'neutral' | 'context';
export type EventSeverity = 'low' | 'medium' | 'high';

export type EventMarker = {
	id: string;
	ts: number;
	label: string;
	direction: EventDirection;
	severity: EventSeverity;
};

export type FlowSeriesAxis = 'left' | 'right';
export type FlowSeriesMode = 'line' | 'area' | 'histogram';

export type FlowSeries = {
	id: string;
	label: string;
	axis: FlowSeriesAxis;
	mode: FlowSeriesMode;
	points: TimePoint[];
};

export type HeatmapCellSide = 'bid' | 'ask' | 'buy_liq' | 'sell_liq' | 'context';

export type HeatmapCell = {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
	intensity: number;
	side: HeatmapCellSide;
	value?: number | null;
	label?: string;
};

export type HeatmapLegendItem = {
	id: string;
	label: string;
	color: string;
};
