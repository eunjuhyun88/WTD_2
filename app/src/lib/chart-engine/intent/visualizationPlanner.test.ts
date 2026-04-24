import { describe, expect, it } from 'vitest';

import type { VisualizationPatternContext } from '../contracts/intentDrivenChart';
import { buildIntentDrivenChartConfig } from './chartConfigBuilder';
import { classifyVisualizationIntent } from './classifyIntent';
import { planVisualizationHighlights } from './highlightPlanner';
import { selectVisualizationTemplate } from './templateSelector';

const accumulationContext: VisualizationPatternContext = {
	symbol: 'TRADOORUSDT',
	timeframe: '15m',
	currentPhase: 'ACCUMULATION',
	phasePath: ['FAKE_DUMP', 'ARCH_ZONE', 'REAL_DUMP', 'ACCUMULATION'],
	confidence: 0.78,
	topEvidence: ['higher lows 3', 'oi hold after spike', 'funding flip confirmed'],
	signals: [
		{ key: 'higher_lows', label: 'higher lows', available: true },
		{ key: 'oi_hold', label: 'oi hold', available: true },
		{ key: 'funding_flip', label: 'funding flip', available: true, ts: 1713945600 },
		{ key: 'breakout_line', label: 'range high', available: true },
	],
	tradePlan: {
		entry: 1.92,
		stop: 1.81,
		targets: [2.05],
		riskReward: 2.4,
	},
};

describe('intent-driven visualization planner', () => {
	it('classifies WHY / FLOW / EXECUTION queries deterministically', () => {
		expect(classifyVisualizationIntent('왜 떨어졌냐')).toBe('why');
		expect(classifyVisualizationIntent('세력 들어왔냐')).toBe('flow');
		expect(classifyVisualizationIntent('어디서 진입하냐')).toBe('execution');
	});

	it('prefers compare when the query references a known comparison context', () => {
		expect(
			classifyVisualizationIntent('트라도어랑 비슷하냐', {
				referenceSymbol: 'TRADOORUSDT',
			})
		).toBe('compare');
		expect(classifyVisualizationIntent('비슷한거 찾아줘')).toBe('search');
	});

	it('maps intents to one visualization template each', () => {
		expect(selectVisualizationTemplate('why')).toBe('event-focus');
		expect(selectVisualizationTemplate('state')).toBe('state-view');
		expect(selectVisualizationTemplate('compare')).toBe('compare-view');
		expect(selectVisualizationTemplate('search')).toBe('scan-grid');
		expect(selectVisualizationTemplate('flow')).toBe('flow-view');
		expect(selectVisualizationTemplate('execution')).toBe('execution-view');
	});

	it('keeps one primary highlight and at most two secondary highlights', () => {
		const highlightPlan = planVisualizationHighlights('state', accumulationContext);

		expect(highlightPlan.primary).toBe('phase_zone');
		expect(highlightPlan.secondary).toEqual(['higher_lows', 'open_interest']);
		expect(highlightPlan.secondary).toHaveLength(2);
	});

	it('builds a state-view config around phase context and top evidence', () => {
		const config = buildIntentDrivenChartConfig({
			query: '지금 매집이냐',
			context: accumulationContext,
		});

		expect(config.intent).toBe('state');
		expect(config.template).toBe('state-view');
		expect(config.layout).toBe('single');
		expect(config.highlightPlan.primary).toBe('phase_zone');
		expect(config.panels.map((panel) => panel.panelType)).toEqual(['price', 'oi', 'volume']);
		expect(config.panels[0]?.overlays?.some((overlay) => overlay.kind === 'phase-zone')).toBe(true);
		expect(config.sideSummary.phase).toBe('ACCUMULATION');
		expect(config.sideSummary.topEvidence).toEqual([
			'higher lows 3',
			'oi hold after spike',
			'funding flip confirmed',
		]);
		expect(config.sideSummary.items.some((item) => item.id === 'confidence')).toBe(true);
	});

	it('builds a compare-view config when reference context exists', () => {
		const config = buildIntentDrivenChartConfig({
			query: '트라도어랑 비슷하냐',
			context: {
				...accumulationContext,
				symbol: 'PTBUSDT',
				referenceSymbol: 'TRADOORUSDT',
				referenceLabel: 'TRADOOR',
				similarityScore: 0.84,
			},
		});

		expect(config.intent).toBe('compare');
		expect(config.template).toBe('compare-view');
		expect(config.layout).toBe('split');
		expect(config.title).toBe('PTBUSDT vs TRADOOR');
		expect(config.panels.map((panel) => panel.panelType)).toEqual([
			'price',
			'compare-price',
			'feature-diff',
		]);
		expect(config.sideSummary.referenceLabel).toBe('TRADOOR');
		expect(config.sideSummary.similarity).toBe(0.84);
	});

	it('builds a scan-grid config for search intent with candidate count', () => {
		const config = buildIntentDrivenChartConfig({
			query: '비슷한거 찾아줘',
			context: {
				symbol: 'BTCUSDT',
				timeframe: '15m',
				candidateCount: 12,
				topEvidence: ['candidate pool refreshed'],
			},
		});

		expect(config.intent).toBe('search');
		expect(config.template).toBe('scan-grid');
		expect(config.layout).toBe('grid');
		expect(config.panels).toHaveLength(1);
		expect(config.panels[0]?.panelType).toBe('scan-grid');
		expect(config.highlightPlan.primary).toBe('scan_candidates');
		expect(config.sideSummary.candidateCount).toBe(12);
	});

	it('builds an execution config with entry / stop / target overlays', () => {
		const config = buildIntentDrivenChartConfig({
			query: '어디서 진입하냐',
			context: accumulationContext,
		});
		const pricePanel = config.panels.find((panel) => panel.panelType === 'price');

		expect(config.intent).toBe('execution');
		expect(config.template).toBe('execution-view');
		expect(config.highlightPlan.primary).toBe('entry_stop_target');
		expect(pricePanel?.overlays?.map((overlay) => overlay.label)).toEqual(
			expect.arrayContaining(['entry', 'stop', 'target', 'risk / reward'])
		);
	});
});
