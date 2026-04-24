import type { ChartWorkbenchTone } from './chartViewSpec';

export type VisualizationIntent =
	| 'why'
	| 'state'
	| 'compare'
	| 'search'
	| 'flow'
	| 'execution';

export type VisualizationTemplate =
	| 'event-focus'
	| 'state-view'
	| 'compare-view'
	| 'scan-grid'
	| 'flow-view'
	| 'execution-view';

export type VisualizationLayout = 'single' | 'split' | 'grid';

export type VisualizationHighlightTarget =
	| 'price_event'
	| 'phase_zone'
	| 'phase_path_diff'
	| 'scan_candidates'
	| 'open_interest'
	| 'entry_stop_target'
	| 'funding_extreme'
	| 'volume_spike'
	| 'higher_lows'
	| 'breakout_line'
	| 'feature_diff'
	| 'liquidation_density'
	| 'cvd_divergence'
	| 'similarity_score'
	| 'current_phase'
	| 'candidate_count'
	| 'risk_reward';

export type VisualizationSignalKey =
	| 'price_event'
	| 'oi_spike'
	| 'oi_hold'
	| 'funding_flip'
	| 'funding_extreme'
	| 'volume_spike'
	| 'higher_lows'
	| 'breakout_line'
	| 'liquidation_cluster'
	| 'cvd_divergence'
	| 'similarity_match'
	| 'phase_transition'
	| 'entry_signal'
	| 'risk_warning';

export type VisualizationFeatureSnapshot = Partial<
	Record<
		| 'oi_zscore'
		| 'funding_rate_zscore'
		| 'funding_flip_flag'
		| 'volume_percentile'
		| 'pullback_depth_pct'
		| 'cvd_price_divergence',
		number | boolean | null
	>
>;

export type VisualizationSignal = {
	key: VisualizationSignalKey;
	label: string;
	available?: boolean;
	ts?: number;
	value?: number | boolean | string | null;
	detail?: string;
	tone?: ChartWorkbenchTone;
	target?: VisualizationHighlightTarget;
};

export type VisualizationTradePlan = {
	entry?: number | null;
	stop?: number | null;
	targets?: number[];
	invalidation?: number | null;
	riskReward?: number | null;
};

export type VisualizationPatternContext = {
	symbol?: string;
	timeframe?: string;
	currentPhase?: string | null;
	phasePath?: string[];
	confidence?: number | null;
	similarityScore?: number | null;
	referenceSymbol?: string | null;
	referenceLabel?: string | null;
	candidateCount?: number | null;
	topEvidence?: string[];
	featureSnapshot?: VisualizationFeatureSnapshot;
	signals?: VisualizationSignal[];
	tradePlan?: VisualizationTradePlan;
};

export type VisualizationOverlaySpec = {
	id: string;
	kind: 'phase-zone' | 'range-box' | 'price-line' | 'reference-line' | 'risk-band';
	label: string;
	tone?: ChartWorkbenchTone;
	target?: VisualizationHighlightTarget;
	startTs?: number;
	endTs?: number;
	price?: number;
	upper?: number;
	lower?: number;
};

export type VisualizationMarkerSpec = {
	id: string;
	kind: 'circle' | 'dot' | 'label' | 'badge';
	label: string;
	tone?: ChartWorkbenchTone;
	target: VisualizationHighlightTarget;
	ts?: number;
};

export type VisualizationPanelType =
	| 'price'
	| 'oi'
	| 'funding'
	| 'cvd'
	| 'volume'
	| 'liquidation'
	| 'compare-price'
	| 'feature-diff'
	| 'scan-grid';

export type VisualizationPanelConfig = {
	panelType: VisualizationPanelType;
	visible?: boolean;
	emphasis: 'primary' | 'secondary' | 'muted';
	focusTargets?: VisualizationHighlightTarget[];
	overlays?: VisualizationOverlaySpec[];
	markers?: VisualizationMarkerSpec[];
};

export type VisualizationSummaryItem = {
	id: string;
	label: string;
	value: string;
	tone?: ChartWorkbenchTone;
};

export type VisualizationHighlightPlan = {
	primary: VisualizationHighlightTarget;
	secondary: VisualizationHighlightTarget[];
	rationale: string[];
};

export type IntentDrivenChartRequest = {
	query: string;
	context?: VisualizationPatternContext;
};

export type IntentDrivenChartConfig = {
	query: string;
	intent: VisualizationIntent;
	template: VisualizationTemplate;
	title: string;
	symbol?: string;
	timeframe?: string;
	layout: VisualizationLayout;
	panels: VisualizationPanelConfig[];
	highlightPlan: VisualizationHighlightPlan;
	annotations: VisualizationMarkerSpec[];
	sideSummary: {
		phase?: string | null;
		confidence?: number | null;
		similarity?: number | null;
		referenceLabel?: string | null;
		candidateCount?: number | null;
		topEvidence: string[];
		items: VisualizationSummaryItem[];
	};
};
