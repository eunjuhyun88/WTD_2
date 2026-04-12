import { z } from 'zod';
import { IsoTimestampSchema, SymbolSchema, TimeframeSchema } from './verdict';

export const ResearchBlockSchemaVersion = 'research_block_v1' as const;
export type ResearchBlockSchemaVersion = typeof ResearchBlockSchemaVersion;

export const CompareWindowKeySchema = z.enum(['1h', '4h', '8h', '24h', '7d', '30d']);
export type CompareWindowKey = z.infer<typeof CompareWindowKeySchema>;

export const MetricUnitSchema = z.enum([
	'usd',
	'pct',
	'ratio',
	'count',
	'usd_compact',
	'custom'
]);
export type MetricUnit = z.infer<typeof MetricUnitSchema>;

export const TimePointSchema = z.object({
	t: z.number().int().nonnegative(),
	v: z.number().finite().nullable()
});
export type TimePoint = z.infer<typeof TimePointSchema>;

export const CandlePointSchema = z.object({
	t: z.number().int().nonnegative(),
	o: z.number().finite(),
	h: z.number().finite(),
	l: z.number().finite(),
	c: z.number().finite(),
	v: z.number().finite().nullable().optional()
});
export type CandlePoint = z.infer<typeof CandlePointSchema>;

export const CompareWindowSchema = z.object({
	key: CompareWindowKeySchema,
	startTs: z.number().int().nonnegative(),
	endTs: z.number().int().nonnegative(),
	baselineValue: z.number().finite().nullable(),
	currentValue: z.number().finite().nullable(),
	deltaAbs: z.number().finite().nullable(),
	deltaPct: z.number().finite().nullable()
});
export type CompareWindow = z.infer<typeof CompareWindowSchema>;

export const EventMarkerSchema = z.object({
	id: z.string().min(1),
	ts: z.number().int().nonnegative(),
	label: z.string().min(1).max(120),
	direction: z.enum(['bull', 'bear', 'neutral', 'context']),
	severity: z.enum(['low', 'medium', 'high'])
});
export type EventMarker = z.infer<typeof EventMarkerSchema>;

export const MetricCompareSchema = z.object({
	metricId: z.string().min(1),
	label: z.string().min(1).max(60),
	unit: MetricUnitSchema,
	current: z.number().finite().nullable(),
	compare: z.array(CompareWindowSchema).default([]),
	percentile: z.number().finite().min(0).max(100).nullable().optional(),
	zScore: z.number().finite().nullable().optional(),
	interpretation: z.string().max(240).optional(),
	sourceIds: z.array(z.string().regex(/^(raw|feat|event|verdict|view)\./)).default([])
});
export type MetricCompare = z.infer<typeof MetricCompareSchema>;

export const MetricStripBlockSchema = z.object({
	kind: z.literal('metric_strip'),
	metrics: z.array(MetricCompareSchema).min(1)
});
export type MetricStripBlock = z.infer<typeof MetricStripBlockSchema>;

export const InlinePriceChartBlockSchema = z.object({
	kind: z.literal('inline_price_chart'),
	series: z.array(CandlePointSchema).min(2),
	compareWindows: z.array(CompareWindowSchema).default([]),
	overlays: z
		.object({
			srLevels: z
				.array(
					z.object({
						price: z.number().finite(),
						label: z.string().max(24),
						strength: z.number().finite().optional()
					})
				)
				.optional()
		})
		.optional(),
	markers: z.array(EventMarkerSchema).default([])
});
export type InlinePriceChartBlock = z.infer<typeof InlinePriceChartBlockSchema>;

export const FlowSeriesSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1).max(40),
	axis: z.enum(['left', 'right']).default('left'),
	mode: z.enum(['line', 'area', 'histogram']),
	points: z.array(TimePointSchema).min(2)
});
export type FlowSeries = z.infer<typeof FlowSeriesSchema>;

export const HeatmapCellSideSchema = z.enum([
	'bid',
	'ask',
	'buy_liq',
	'sell_liq',
	'context'
]);
export type HeatmapCellSide = z.infer<typeof HeatmapCellSideSchema>;

export const HeatmapCellSchema = z.object({
	x0: z.number().int().nonnegative(),
	x1: z.number().int().nonnegative(),
	y0: z.number().finite(),
	y1: z.number().finite(),
	intensity: z.number().finite().min(0).max(1),
	side: HeatmapCellSideSchema,
	value: z.number().finite().nullable().optional(),
	label: z.string().max(48).optional()
});
export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;

export const HeatmapLegendItemSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1).max(40),
	color: z.string().min(1).max(40)
});
export type HeatmapLegendItem = z.infer<typeof HeatmapLegendItemSchema>;

export const DualPaneFlowChartBlockSchema = z.object({
	kind: z.literal('dual_pane_flow_chart'),
	topPane: z.object({
		price: z.array(z.union([CandlePointSchema, TimePointSchema])).min(2)
	}),
	bottomPane: z.object({
		series: z.array(FlowSeriesSchema).min(1)
	}),
	compareWindows: z.array(CompareWindowSchema).default([]),
	markers: z.array(EventMarkerSchema).default([])
});
export type DualPaneFlowChartBlock = z.infer<typeof DualPaneFlowChartBlockSchema>;

export const HeatmapFlowChartBlockSchema = z.object({
	kind: z.literal('heatmap_flow_chart'),
	price: z.array(z.union([CandlePointSchema, TimePointSchema])).min(2),
	cells: z.array(HeatmapCellSchema).min(1),
	lowerPane: z
		.object({
			series: z.array(FlowSeriesSchema).default([])
		})
		.optional(),
	compareWindows: z.array(CompareWindowSchema).default([]),
	markers: z.array(EventMarkerSchema).default([]),
	legend: z.array(HeatmapLegendItemSchema).default([])
});
export type HeatmapFlowChartBlock = z.infer<typeof HeatmapFlowChartBlockSchema>;

export const ResearchBlockSchema = z.discriminatedUnion('kind', [
	MetricStripBlockSchema,
	InlinePriceChartBlockSchema,
	DualPaneFlowChartBlockSchema,
	HeatmapFlowChartBlockSchema
]);
export type ResearchBlock = z.infer<typeof ResearchBlockSchema>;

export const ResearchBlockEnvelopeSchema = z.object({
	schemaVersion: z.literal(ResearchBlockSchemaVersion),
	id: z.string().min(1),
	traceId: z.string().min(1),
	symbol: SymbolSchema,
	timeframe: TimeframeSchema,
	asOf: IsoTimestampSchema,
	title: z.string().max(120).optional(),
	summary: z.string().max(240).optional(),
	block: ResearchBlockSchema
});
export type ResearchBlockEnvelope = z.infer<typeof ResearchBlockEnvelopeSchema>;

export function parseResearchBlockEnvelope(input: unknown): ResearchBlockEnvelope {
	return ResearchBlockEnvelopeSchema.parse(input);
}

export function safeParseResearchBlockEnvelope(input: unknown) {
	return ResearchBlockEnvelopeSchema.safeParse(input);
}
