import type {
	DualPaneFlowChartBlock,
	HeatmapFlowChartBlock,
	InlinePriceChartBlock,
} from '$lib/contracts';
import type {
	ChartWorkbenchChip,
	ChartViewSpec,
	DualPaneFlowChartViewSpec,
	HeatmapFlowChartViewSpec,
	PriceChartViewSpec,
} from '../contracts/chartViewSpec';

type BaseMeta = {
	symbol?: string;
	timeframe?: string;
	title?: string;
	summary?: string;
};

function compareBadges(compareWindows: Array<{ key: string; deltaPct: number | null }>): ChartWorkbenchChip[] {
	return compareWindows.map((window) => ({
		id: `cmp-${window.key}`,
		label: window.key,
		value: window.deltaPct == null ? '--' : `${window.deltaPct > 0 ? '+' : ''}${window.deltaPct.toFixed(2)}%`,
		tone:
			window.deltaPct == null ? 'neutral' : window.deltaPct > 0 ? 'bull' : window.deltaPct < 0 ? 'bear' : 'neutral',
	}));
}

export function fromInlinePriceBlock(
	block: InlinePriceChartBlock,
	meta: BaseMeta = {}
): PriceChartViewSpec {
	return {
		kind: 'price',
		...meta,
		ui: {
			eyebrow: 'research block',
			stageLabel: 'price',
			metricChips: [
				{ id: 'bars', label: 'bars', value: `${block.series.length}` },
				{ id: 'levels', label: 'levels', value: `${block.overlays?.srLevels?.length ?? 0}`, tone: 'accent' },
			],
			signalBadges: compareBadges(block.compareWindows),
		},
		series: block.series,
		compareWindows: block.compareWindows,
		srLevels: block.overlays?.srLevels ?? [],
		markers: block.markers ?? [],
	};
}

export function fromDualPaneFlowBlock(
	block: DualPaneFlowChartBlock,
	meta: BaseMeta = {}
): DualPaneFlowChartViewSpec {
	return {
		kind: 'dual-pane-flow',
		...meta,
		ui: {
			eyebrow: 'research block',
			stageLabel: 'flow',
			metricChips: [
				{ id: 'price-bars', label: 'price bars', value: `${block.topPane.price.length}` },
				{ id: 'tracks', label: 'tracks', value: `${block.bottomPane.series.length}`, tone: 'accent' },
			],
			signalBadges: [
				...block.bottomPane.series.map<ChartWorkbenchChip>((series) => ({
					id: `series-${series.id}`,
					label: series.label,
					tone: series.mode === 'histogram' ? 'warn' : series.mode === 'area' ? 'accent' : 'neutral',
				})),
				...compareBadges(block.compareWindows),
			],
			notes: [
				{
					id: 'flow-note',
					label: 'focus',
					body: 'Use the lower tracks to compare directional participation against the same price window above.',
					tone: 'neutral',
				},
			],
		},
		topPane: block.topPane,
		bottomPane: block.bottomPane,
		compareWindows: block.compareWindows,
		markers: block.markers ?? [],
	};
}

export function fromHeatmapFlowBlock(
	block: HeatmapFlowChartBlock,
	meta: BaseMeta = {}
): HeatmapFlowChartViewSpec {
	return {
		kind: 'heatmap-flow',
		...meta,
		ui: {
			eyebrow: 'research block',
			stageLabel: 'heatmap',
			metricChips: [
				{ id: 'cells', label: 'cells', value: `${block.cells.length}`, tone: 'warn' },
				{ id: 'markers', label: 'events', value: `${block.markers.length}`, tone: 'accent' },
				{ id: 'tracks', label: 'tracks', value: `${block.lowerPane?.series.length ?? 0}` },
			],
			signalBadges: [
				...block.legend.map<ChartWorkbenchChip>((legend) => ({
					id: `legend-${legend.id}`,
					label: legend.label,
					tone: legend.id.includes('liq') ? 'warn' : legend.id === 'bid' ? 'bull' : legend.id === 'ask' ? 'bear' : 'neutral',
				})),
				...compareBadges(block.compareWindows),
			],
			notes: [
				{
					id: 'heatmap-note',
					label: 'focus',
					body: 'Heat layers show where passive liquidity and liquidation pulses cluster relative to the live price path.',
					tone: 'neutral',
				},
			],
		},
		price: block.price,
		cells: block.cells,
		lowerPane: block.lowerPane,
		compareWindows: block.compareWindows,
		markers: block.markers ?? [],
		legend: block.legend ?? [],
	};
}

export function fromResearchBlock(
	block: InlinePriceChartBlock | DualPaneFlowChartBlock | HeatmapFlowChartBlock,
	meta: BaseMeta = {}
): ChartViewSpec {
	switch (block.kind) {
		case 'inline_price_chart':
			return fromInlinePriceBlock(block, meta);
		case 'dual_pane_flow_chart':
			return fromDualPaneFlowBlock(block, meta);
		case 'heatmap_flow_chart':
			return fromHeatmapFlowBlock(block, meta);
	}
}
