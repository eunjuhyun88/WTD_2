import type {
	CandlePoint,
	CompareWindow,
	EventMarker,
	FlowSeries,
	HeatmapCell,
	HeatmapLegendItem,
	TimePoint,
} from './primitives';

export type ChartPresentation = 'inline' | 'focus' | 'fill';

export type ChartPriceLevel = {
	price: number;
	label: string;
	strength?: number;
};

export type PriceLineOverlaySpec = {
	id: string;
	label?: string;
	color: string;
	lineWidth?: number;
	lineStyle?: number;
	points: TimePoint[];
};

export type PriceBandOverlaySpec = {
	id: string;
	upper: TimePoint[];
	middle?: TimePoint[];
	lower: TimePoint[];
};

export type PriceReferenceLineSpec = {
	id: string;
	price: number;
	color: string;
	lineWidth?: number;
	lineStyle?: number;
	title?: string;
};

export type ChartMarkerSpec = EventMarker & {
	position?: 'aboveBar' | 'belowBar' | 'inBar';
	shape?: 'arrowUp' | 'arrowDown' | 'circle';
	color?: string;
};

export type ChartWorkbenchTone = 'neutral' | 'bull' | 'bear' | 'warn' | 'accent';

export type ChartWorkbenchChip = {
	id: string;
	label: string;
	value?: string;
	tone?: ChartWorkbenchTone;
};

export type ChartWorkbenchNote = {
	id: string;
	label: string;
	body: string;
	tone?: ChartWorkbenchTone;
};

export type ChartWorkbenchAction = {
	id: string;
	label: string;
	active?: boolean;
};

export type ChartWorkbenchUI = {
	eyebrow?: string;
	stageLabel?: string;
	metricChips?: ChartWorkbenchChip[];
	signalBadges?: ChartWorkbenchChip[];
	actions?: ChartWorkbenchAction[];
	notes?: ChartWorkbenchNote[];
};

export type BaseChartViewSpec = {
	symbol?: string;
	timeframe?: string;
	title?: string;
	summary?: string;
	ui?: ChartWorkbenchUI;
};

export type PriceChartViewSpec = BaseChartViewSpec & {
	kind: 'price';
	series: CandlePoint[];
	compareWindows: CompareWindow[];
	srLevels: ChartPriceLevel[];
	markers: ChartMarkerSpec[];
	overlays?: {
		lines?: PriceLineOverlaySpec[];
		bands?: PriceBandOverlaySpec[];
	};
	referenceLines?: PriceReferenceLineSpec[];
};

export type DualPaneFlowChartViewSpec = BaseChartViewSpec & {
	kind: 'dual-pane-flow';
	topPane: {
		price: Array<CandlePoint | TimePoint>;
	};
	bottomPane: {
		series: FlowSeries[];
	};
	compareWindows: CompareWindow[];
	markers: ChartMarkerSpec[];
};

export type HeatmapFlowChartViewSpec = BaseChartViewSpec & {
	kind: 'heatmap-flow';
	price: Array<CandlePoint | TimePoint>;
	cells: HeatmapCell[];
	lowerPane?: {
		series: FlowSeries[];
	};
	compareWindows: CompareWindow[];
	markers: ChartMarkerSpec[];
	legend: HeatmapLegendItem[];
};

export type ChartViewSpec =
	| PriceChartViewSpec
	| DualPaneFlowChartViewSpec
	| HeatmapFlowChartViewSpec;
