import type {
	IntentDrivenChartConfig,
	IntentDrivenChartRequest,
	VisualizationHighlightPlan,
	VisualizationHighlightTarget,
	VisualizationMarkerSpec,
	VisualizationOverlaySpec,
	VisualizationPanelConfig,
	VisualizationPanelType,
	VisualizationPatternContext,
	VisualizationSignal,
	VisualizationSummaryItem,
	VisualizationTemplate,
} from '../contracts/intentDrivenChart';
import { classifyVisualizationIntent } from './classifyIntent';
import { planVisualizationHighlights } from './highlightPlanner';
import { selectVisualizationTemplate } from './templateSelector';

const TARGET_TO_PANEL: Record<VisualizationHighlightTarget, VisualizationPanelType> = {
	price_event: 'price',
	phase_zone: 'price',
	phase_path_diff: 'compare-price',
	scan_candidates: 'scan-grid',
	open_interest: 'oi',
	entry_stop_target: 'price',
	funding_extreme: 'funding',
	volume_spike: 'volume',
	higher_lows: 'price',
	breakout_line: 'price',
	feature_diff: 'feature-diff',
	liquidation_density: 'liquidation',
	cvd_divergence: 'cvd',
	similarity_score: 'feature-diff',
	current_phase: 'price',
	candidate_count: 'scan-grid',
	risk_reward: 'price',
};

const SIGNAL_TARGETS: Record<VisualizationSignal['key'], VisualizationHighlightTarget> = {
	price_event: 'price_event',
	oi_spike: 'open_interest',
	oi_hold: 'open_interest',
	funding_flip: 'funding_extreme',
	funding_extreme: 'funding_extreme',
	volume_spike: 'volume_spike',
	higher_lows: 'higher_lows',
	breakout_line: 'breakout_line',
	liquidation_cluster: 'liquidation_density',
	cvd_divergence: 'cvd_divergence',
	similarity_match: 'similarity_score',
	phase_transition: 'current_phase',
	entry_signal: 'entry_stop_target',
	risk_warning: 'risk_reward',
};

type TemplateShape = {
	layout: IntentDrivenChartConfig['layout'];
	panels: Array<{ panelType: VisualizationPanelType; emphasis: VisualizationPanelConfig['emphasis'] }>;
};

const TEMPLATE_SHAPES: Record<VisualizationTemplate, TemplateShape> = {
	'event-focus': {
		layout: 'single',
		panels: [
			{ panelType: 'price', emphasis: 'primary' },
			{ panelType: 'oi', emphasis: 'secondary' },
			{ panelType: 'funding', emphasis: 'muted' },
		],
	},
	'state-view': {
		layout: 'single',
		panels: [
			{ panelType: 'price', emphasis: 'primary' },
			{ panelType: 'oi', emphasis: 'secondary' },
			{ panelType: 'volume', emphasis: 'muted' },
		],
	},
	'compare-view': {
		layout: 'split',
		panels: [
			{ panelType: 'price', emphasis: 'primary' },
			{ panelType: 'compare-price', emphasis: 'primary' },
			{ panelType: 'feature-diff', emphasis: 'secondary' },
		],
	},
	'scan-grid': {
		layout: 'grid',
		panels: [{ panelType: 'scan-grid', emphasis: 'primary' }],
	},
	'flow-view': {
		layout: 'single',
		panels: [
			{ panelType: 'price', emphasis: 'muted' },
			{ panelType: 'oi', emphasis: 'primary' },
			{ panelType: 'funding', emphasis: 'secondary' },
			{ panelType: 'liquidation', emphasis: 'muted' },
		],
	},
	'execution-view': {
		layout: 'single',
		panels: [
			{ panelType: 'price', emphasis: 'primary' },
			{ panelType: 'volume', emphasis: 'muted' },
		],
	},
};

function targetFromSignal(signal: VisualizationSignal): VisualizationHighlightTarget | null {
	return signal.target ?? SIGNAL_TARGETS[signal.key] ?? null;
}

function toneForTarget(target: VisualizationHighlightTarget): 'neutral' | 'bull' | 'bear' | 'warn' | 'accent' {
	switch (target) {
		case 'open_interest':
		case 'similarity_score':
			return 'accent';
		case 'entry_stop_target':
		case 'higher_lows':
			return 'bull';
		case 'funding_extreme':
		case 'liquidation_density':
		case 'risk_reward':
			return 'warn';
		case 'price_event':
			return 'bear';
		default:
			return 'neutral';
	}
}

function buildMarkers(
	context: VisualizationPatternContext,
	panelType: VisualizationPanelType,
	highlightPlan: VisualizationHighlightPlan
): VisualizationMarkerSpec[] {
	const targets = [highlightPlan.primary, ...highlightPlan.secondary].filter(
		(target) => TARGET_TO_PANEL[target] === panelType
	);
	const markers: VisualizationMarkerSpec[] = [];

	for (const signal of context.signals ?? []) {
		const target = targetFromSignal(signal);
		if (target == null || !targets.includes(target) || signal.available === false) {
			continue;
		}
		markers.push({
			id: `${panelType}-${signal.key}`,
			kind: target === highlightPlan.primary ? 'circle' : 'dot',
			label: signal.label,
			target,
			ts: signal.ts,
			tone: signal.tone ?? toneForTarget(target),
		});
	}

	return markers;
}

function buildPriceOverlays(
	context: VisualizationPatternContext,
	highlightPlan: VisualizationHighlightPlan
): VisualizationOverlaySpec[] {
	const overlays: VisualizationOverlaySpec[] = [];
	const targets = [highlightPlan.primary, ...highlightPlan.secondary];

	if (context.currentPhase && targets.includes('phase_zone')) {
		overlays.push({
			id: 'phase-zone',
			kind: 'phase-zone',
			label: context.currentPhase,
			target: 'phase_zone',
			tone: 'accent',
		});
	}

	if (targets.includes('entry_stop_target')) {
		if (context.tradePlan?.entry != null) {
			overlays.push({
				id: 'entry-line',
				kind: 'price-line',
				label: 'entry',
				target: 'entry_stop_target',
				price: context.tradePlan.entry,
				tone: 'bull',
			});
		}
		if (context.tradePlan?.stop != null) {
			overlays.push({
				id: 'stop-line',
				kind: 'price-line',
				label: 'stop',
				target: 'entry_stop_target',
				price: context.tradePlan.stop,
				tone: 'bear',
			});
		}
		const firstTarget = context.tradePlan?.targets?.[0];
		if (firstTarget != null) {
			overlays.push({
				id: 'target-line',
				kind: 'price-line',
				label: 'target',
				target: 'entry_stop_target',
				price: firstTarget,
				tone: 'accent',
			});
		}
	}

	if (targets.includes('risk_reward') && context.tradePlan?.entry != null && context.tradePlan?.stop != null) {
		const upper = context.tradePlan.targets?.[0];
		if (upper != null) {
			overlays.push({
				id: 'risk-band',
				kind: 'risk-band',
				label: 'risk / reward',
				target: 'risk_reward',
				upper,
				lower: context.tradePlan.stop,
				tone: 'warn',
			});
		}
	}

	return overlays;
}

function buildPanels(
	template: VisualizationTemplate,
	context: VisualizationPatternContext,
	highlightPlan: VisualizationHighlightPlan
): VisualizationPanelConfig[] {
	return TEMPLATE_SHAPES[template].panels.map((panel) => {
		const focusTargets = [highlightPlan.primary, ...highlightPlan.secondary].filter(
			(target) => TARGET_TO_PANEL[target] === panel.panelType
		);

		return {
			panelType: panel.panelType,
			emphasis: panel.emphasis,
			visible: true,
			focusTargets,
			overlays: panel.panelType === 'price' ? buildPriceOverlays(context, highlightPlan) : [],
			markers: buildMarkers(context, panel.panelType, highlightPlan),
		};
	});
}

function buildSummaryItems(
	template: VisualizationTemplate,
	context: VisualizationPatternContext,
	highlightPlan: VisualizationHighlightPlan
): VisualizationSummaryItem[] {
	const items: VisualizationSummaryItem[] = [];

	if (context.currentPhase) {
		items.push({
			id: 'phase',
			label: 'phase',
			value: context.currentPhase,
			tone: highlightPlan.primary === 'phase_zone' ? 'accent' : 'neutral',
		});
	}

	if (context.confidence != null) {
		items.push({
			id: 'confidence',
			label: 'confidence',
			value: `${Math.round(context.confidence * 100)}%`,
			tone: context.confidence >= 0.7 ? 'bull' : context.confidence >= 0.45 ? 'accent' : 'warn',
		});
	}

	if (context.similarityScore != null) {
		items.push({
			id: 'similarity',
			label: 'similarity',
			value: `${Math.round(context.similarityScore * 100)}%`,
			tone: template === 'compare-view' || template === 'scan-grid' ? 'accent' : 'neutral',
		});
	}

	if (context.candidateCount != null) {
		items.push({
			id: 'candidates',
			label: 'candidates',
			value: `${context.candidateCount}`,
			tone: template === 'scan-grid' ? 'accent' : 'neutral',
		});
	}

	if (context.tradePlan?.riskReward != null) {
		items.push({
			id: 'rr',
			label: 'R:R',
			value: context.tradePlan.riskReward.toFixed(2),
			tone: 'warn',
		});
	}

	return items;
}

function buildTitle(
	query: string,
	template: VisualizationTemplate,
	context: VisualizationPatternContext
): string {
	if (template === 'compare-view' && context.referenceLabel) {
		return `${context.symbol ?? 'chart'} vs ${context.referenceLabel}`;
	}
	if (template === 'scan-grid') {
		return context.symbol ? `${context.symbol} scan candidates` : 'scan candidates';
	}
	return query.trim();
}

function buildAnnotations(
	panels: VisualizationPanelConfig[],
	highlightPlan: VisualizationHighlightPlan
): VisualizationMarkerSpec[] {
	return panels
		.flatMap((panel) => panel.markers ?? [])
		.filter((marker) => marker.target === highlightPlan.primary);
}

export function buildIntentDrivenChartConfig(
	request: IntentDrivenChartRequest
): IntentDrivenChartConfig {
	const context = request.context ?? {};
	const intent = classifyVisualizationIntent(request.query, context);
	const template = selectVisualizationTemplate(intent);
	const highlightPlan = planVisualizationHighlights(intent, context);
	const panels = buildPanels(template, context, highlightPlan);

	return {
		query: request.query,
		intent,
		template,
		title: buildTitle(request.query, template, context),
		symbol: context.symbol,
		timeframe: context.timeframe,
		layout: TEMPLATE_SHAPES[template].layout,
		panels,
		highlightPlan,
		annotations: buildAnnotations(panels, highlightPlan),
		sideSummary: {
			phase: context.currentPhase,
			confidence: context.confidence ?? null,
			similarity: context.similarityScore ?? null,
			referenceLabel: context.referenceLabel ?? context.referenceSymbol ?? null,
			candidateCount: context.candidateCount ?? null,
			topEvidence: context.topEvidence?.slice(0, 3) ?? [],
			items: buildSummaryItems(template, context, highlightPlan),
		},
	};
}
